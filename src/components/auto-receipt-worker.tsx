"use client";

import { useEffect, useRef } from "react";
import { jobStore, shopStore, settingsStore, type Job } from "@/lib/store";
import { formatJobToReceiptData } from "@/components/thermal-receipt-dialog";
import { generateThermalReceiptImage, uploadReceiptImage } from "@/lib/thermal-canvas-generator";
import { generateA5ReceiptImage } from "@/lib/a5-canvas-generator";
import { isJobFullyPaid, cleanProformaNumber } from "@/lib/utils";

/**
 * Silent Background Worker:
 * Automatically detects jobs that have been marked as PAID (e.g. via Webhook or Beam online checkout)
 * but do not yet have a receipt image in Cloud Storage, renders the receipt silently off-screen,
 * and attaches the receipt URL to job.billImageUrl.
 * 
 * Runs 100% in the background without modals, popups, or user interaction.
 */
export function AutoReceiptWorker() {
  const processingRef = useRef<Set<string>>(new Set());
  const completedRef = useRef<Set<string>>(new Set());
  const isWorkingRef = useRef(false);

  useEffect(() => {
    // Process queue of jobs that need receipts or proformas
    const processQueue = async () => {
      if (isWorkingRef.current || typeof document === "undefined") return;

      const jobs = jobStore.getSnapshot();
      if (!jobs || jobs.length === 0) return;

      const shopLocations = shopStore.getSnapshot();
      const systemSettings = settingsStore.getSnapshot();
      const isA5 = systemSettings?.receiptPaperSize === "A5";

      // 1. Find jobs that are paid but missing receipt image
      const pendingPaidJob = jobs.find((job) => {
        if (!job.id || job.id === "DRAFT") return false;
        if (processingRef.current.has(job.id)) return false;
        if (completedRef.current.has(`receipt_${job.id}`)) return false;

        const isPaid = job.isPaid || isJobFullyPaid(job);
        if (!isPaid) return false;

        let bills: string[] = [];
        try {
          if (job.billImageUrl) {
            const parsed = JSON.parse(job.billImageUrl);
            bills = Array.isArray(parsed) ? parsed : [parsed];
          }
        } catch {}

        // Has receipt image already?
        const hasReceipt = bills.some(
          (url) => typeof url === "string" && (url.includes(`receipt-${job.id}`) || url.includes("/receipt-"))
        );

        return !hasReceipt;
      });

      if (pendingPaidJob) {
        const jobId = pendingPaidJob.id;
        isWorkingRef.current = true;
        processingRef.current.add(jobId);

        try {
          const activeShop = shopLocations.find((s) => s.id === pendingPaidJob.branchId) || shopLocations[0];
          const receiptData = formatJobToReceiptData(pendingPaidJob);
          receiptData.isDraft = false;
          receiptData.isPaid = true;
          receiptData.autoCapture = true;

          const blob = isA5
            ? await generateA5ReceiptImage(receiptData, activeShop)
            : await generateThermalReceiptImage(receiptData, activeShop);

          if (blob) {
            const filename = `receipt-${jobId}.png`;
            const publicUrl = await uploadReceiptImage(blob, jobId, filename);

            if (publicUrl) {
              let existingBills: string[] = [];
              try {
                const currentJob = jobStore.getSnapshot().find((j) => j.id === jobId) || pendingPaidJob;
                if (currentJob.billImageUrl) {
                  const parsed = JSON.parse(currentJob.billImageUrl);
                  existingBills = Array.isArray(parsed) ? parsed : [parsed];
                }
              } catch {}

              const mergedBills = Array.from(new Set([...existingBills, publicUrl]));
              await jobStore.updateJobDetails(jobId, {
                billImageUrl: JSON.stringify(mergedBills),
              } as any);

              console.log(`[AutoReceiptWorker] ✔ Auto-generated & attached receipt image for Job #${jobId}`);
            }
          }

          completedRef.current.add(`receipt_${jobId}`);
        } catch (err) {
          console.warn(`[AutoReceiptWorker] Failed to auto-generate receipt for Job #${jobId}:`, err);
        } finally {
          processingRef.current.delete(jobId);
          isWorkingRef.current = false;
        }

        return; // process 1 per interval to keep CPU smooth
      }

      // 2. Check for jobs that have a proformaNumber but missing proforma image
      const pendingProformaJob = jobs.find((job) => {
        if (!job.id || job.id === "DRAFT") return false;
        const targetProforma = (job as any).proformaNumber || (job as any).proformaReceiptNumber;
        if (!targetProforma) return false;
        if (processingRef.current.has(job.id)) return false;
        if (completedRef.current.has(`proforma_${job.id}`)) return false;

        let bills: string[] = [];
        try {
          if (job.billImageUrl) {
            const parsed = JSON.parse(job.billImageUrl);
            bills = Array.isArray(parsed) ? parsed : [parsed];
          }
        } catch {}

        const hasProforma = bills.some(
          (url) => typeof url === "string" && (url.includes("proforma-") || url.includes("/proforma-"))
        );

        return !hasProforma;
      });

      if (pendingProformaJob) {
        const jobId = pendingProformaJob.id;
        const targetProforma = (pendingProformaJob as any).proformaNumber || (pendingProformaJob as any).proformaReceiptNumber;
        const cleanBaseProforma = cleanProformaNumber(targetProforma) || jobId;
        const rev = (pendingProformaJob as any).proformaRevision || 0;

        isWorkingRef.current = true;
        processingRef.current.add(jobId);

        try {
          const activeShop = shopLocations.find((s) => s.id === pendingProformaJob.branchId) || shopLocations[0];
          const receiptData = formatJobToReceiptData(pendingProformaJob);
          receiptData.isDraft = true;
          receiptData.proformaId = cleanBaseProforma;
          receiptData.proformaRevision = rev;

          const blob = isA5
            ? await generateA5ReceiptImage(receiptData, activeShop)
            : await generateThermalReceiptImage(receiptData, activeShop);

          if (blob) {
            const filename = `proforma-${cleanBaseProforma}-rev${rev}.png`;
            const publicUrl = await uploadReceiptImage(blob, jobId, filename);

            if (publicUrl) {
              let existingBills: string[] = [];
              try {
                const currentJob = jobStore.getSnapshot().find((j) => j.id === jobId) || pendingProformaJob;
                if (currentJob.billImageUrl) {
                  const parsed = JSON.parse(currentJob.billImageUrl);
                  existingBills = Array.isArray(parsed) ? parsed : [parsed];
                }
              } catch {}

              const mergedBills = Array.from(new Set([...existingBills, publicUrl]));
              await jobStore.updateJobDetails(jobId, {
                billImageUrl: JSON.stringify(mergedBills),
              } as any);

              console.log(`[AutoReceiptWorker] ✔ Auto-generated & attached Proforma INV image for Job #${jobId}`);
            }
          }

          completedRef.current.add(`proforma_${jobId}`);
        } catch (err) {
          console.warn(`[AutoReceiptWorker] Failed to auto-generate proforma for Job #${jobId}:`, err);
        } finally {
          processingRef.current.delete(jobId);
          isWorkingRef.current = false;
        }
      }
    };

    // Run queue check every 4 seconds, and on initial mount
    processQueue();
    const interval = setInterval(processQueue, 4000);

    // Also subscribe to jobStore changes to trigger immediately when an order changes to PAID
    const unsubscribe = jobStore.subscribe(() => {
      processQueue();
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  // Invisible component (renders nothing in DOM)
  return null;
}
