"use client";

import { useEffect, useRef } from "react";
import { jobStore, shopStore, settingsStore, customerStore, type Job } from "@/lib/store";
import { formatJobToReceiptData } from "@/components/thermal-receipt-dialog";
import { generateThermalReceiptImage, uploadReceiptImage } from "@/lib/thermal-canvas-generator";
import { generateA5ReceiptImage } from "@/lib/a5-canvas-generator";
import { isJobFullyPaid, cleanProformaNumber } from "@/lib/utils";
import { checkJobOnlinePaymentStatusAction } from "@/actions/online-payment";

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
  const lastBeamCheckMap = useRef<Map<string, number>>(new Map());
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

      const now = Date.now();
      const MAX_JOB_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours window: NEVER touch historical jobs!

      // 0. Auto-check and synchronize unpaid Beam / Gateway jobs in the background (within 2h window)
      const unpaidBeamJob = jobs.find((job) => {
        if (!job.id || job.id === "DRAFT" || job.isPaid || job.isShopPaid) return false;
        if (['cancel', 'return', 'completed'].includes(job.status)) return false;
        const channel = (job.paymentChannel || "").toLowerCase();
        if (!channel.includes("beam") && !channel.includes("gateway")) return false;
        const jobUpdatedTime = job.updatedAt ? new Date(job.updatedAt).getTime() : 0;
        if (now - jobUpdatedTime > MAX_JOB_AGE_MS) return false;
        const lastCheck = lastBeamCheckMap.current.get(job.id) || 0;
        return (now - lastCheck) > 12000; // at most once every 12s per job
      });

      if (unpaidBeamJob) {
        lastBeamCheckMap.current.set(unpaidBeamJob.id, now);
        checkJobOnlinePaymentStatusAction(unpaidBeamJob.id).then(async (res) => {
          if (res.success && res.isPaid) {
            console.log(`[AutoReceiptWorker] ✔ Detected online payment for Job #${unpaidBeamJob.id} via background poller`);
            await jobStore.updateJobDetails(unpaidBeamJob.id, {
              isPaid: true,
              isShopPaid: true,
              paymentChannel: res.paymentChannel || unpaidBeamJob.paymentChannel,
            } as any);
            const { refreshDb } = await import("@/lib/api");
            await refreshDb();
          }
        }).catch((err) => {
          console.warn(`[AutoReceiptWorker] Background check failed for Job #${unpaidBeamJob.id}:`, err);
        });
      }

      // 1. Find newly paid jobs (specifically from Beam or recent cashier checkout) missing receipt image
      const pendingPaidJob = jobs.find((job) => {
        if (!job.id || job.id === "DRAFT") return false;
        if (processingRef.current.has(job.id)) return false;
        const receiptKey = `receipt_${job.id}_${job.updatedAt || ""}`;
        if (completedRef.current.has(receiptKey)) return false;

        // Skip cancelled or returned jobs immediately
        if (['cancel', 'return'].includes(job.status)) {
          completedRef.current.add(receiptKey);
          return false;
        }

        // Only process jobs updated or paid recently (within the last 2 hours)
        const jobUpdatedTime = job.updatedAt ? new Date(job.updatedAt).getTime() : 0;
        const jobPaidTime = (job as any).shopPaidAt
          ? new Date((job as any).shopPaidAt).getTime()
          : jobUpdatedTime;

        if (now - jobPaidTime > MAX_JOB_AGE_MS && now - jobUpdatedTime > MAX_JOB_AGE_MS) {
          completedRef.current.add(receiptKey);
          return false;
        }

        const isPaid = isJobFullyPaid(job);
        if (!isPaid) return false;

        // Guard: Job must have actual laundry items to auto-generate receipt!
        // Delivery booking fees alone without clothes must NOT generate a receipt!
        let itemsArr: any[] = [];
        try {
          itemsArr = typeof job.items === 'string' ? JSON.parse(job.items) : (job.items || []);
        } catch {}
        if (itemsArr.length === 0) {
          return false;
        }

        // Receipt requires shop payment confirmation (isShopPaid) or walk-in POS payment
        const isShopPaidOrWalkIn = Boolean(job.isShopPaid || (job.source === 'pos' && isPaid));
        if (!isShopPaidOrWalkIn) return false;

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

        if (hasReceipt) {
          completedRef.current.add(receiptKey);
          return false;
        }

        // Guard against premature capture for Member Wallet payments:
        // When staff marks a job as paid via Member Wallet / Deduct Member, ensure we have
        // the confirmed post-deduction wallet balance (either from job.walletBalanceAfter or customerStore).
        // This prevents capturing a receipt image with a stale pre-deduction balance or ฿0.00.
        const isMemberPayment = 
          (job.paymentChannel || "").toLowerCase().includes("member") ||
          (job.paymentChannel || "").toLowerCase().includes("credit") ||
          (job.paymentChannel || "").toLowerCase().includes("deduct") ||
          Boolean(job.adminNotesJson && job.adminNotesJson.includes('"method":"credit"'));

        if (isMemberPayment) {
          const cust = customerStore.getSnapshot().find((c) => c.id === job.customerId);
          const hasConfirmedBalance = (job as any).walletBalanceAfter != null || cust?.creditBalance != null;
          if (!hasConfirmedBalance) {
            // Cannot confirm wallet balance yet; wait for wallet deduction/sync
            return false;
          }
        }

        return true;
      });

      if (pendingPaidJob) {
        const jobId = pendingPaidJob.id;
        isWorkingRef.current = true;
        processingRef.current.add(jobId);

        try {
          const activeShop = shopLocations.find((s) => s.id === pendingPaidJob.branchId) || shopLocations[0];
          
          let jobToFormat = pendingPaidJob;
          const isMemberPayment = 
            (pendingPaidJob.paymentChannel || "").toLowerCase().includes("member") ||
            (pendingPaidJob.paymentChannel || "").toLowerCase().includes("credit") ||
            (pendingPaidJob.paymentChannel || "").toLowerCase().includes("deduct") ||
            Boolean(pendingPaidJob.adminNotesJson && pendingPaidJob.adminNotesJson.includes('"method":"credit"'));

          if (isMemberPayment && (pendingPaidJob as any).walletBalanceAfter == null) {
            const cust = customerStore.getSnapshot().find((c) => c.id === pendingPaidJob.customerId);
            if (cust?.creditBalance != null) {
              jobToFormat = {
                ...pendingPaidJob,
                walletBalanceAfter: cust.creditBalance,
              } as any;
            }
          }

          const receiptData = formatJobToReceiptData(jobToFormat);
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

              const cleanFiltered = existingBills.filter((u: string) => !u.includes(`receipt-${jobId}`) && !u.includes("/receipt-"));
              const mergedBills = [publicUrl, ...cleanFiltered];
              await jobStore.updateJobDetails(jobId, {
                billImageUrl: JSON.stringify(mergedBills),
              } as any);

              console.log(`[AutoReceiptWorker] ✔ Auto-generated & attached receipt image for Job #${jobId}`);
            }
          }

          completedRef.current.add(`receipt_${jobId}_${pendingPaidJob.updatedAt || ""}`);
        } catch (err) {
          console.warn(`[AutoReceiptWorker] Failed to auto-generate receipt for Job #${jobId}:`, err);
        } finally {
          processingRef.current.delete(jobId);
          isWorkingRef.current = false;
        }

        return; // process 1 per interval to keep CPU 100% smooth
      }

      // 2. Check for recent active jobs that have a proformaNumber but missing proforma image
      const pendingProformaJob = jobs.find((job) => {
        if (!job.id || job.id === "DRAFT") return false;
        if (processingRef.current.has(job.id)) return false;
        if (completedRef.current.has(`proforma_${job.id}`)) return false;

        // Skip historical or finished jobs
        if (['completed', 'cancel', 'return'].includes(job.status)) {
          completedRef.current.add(`proforma_${job.id}`);
          return false;
        }

        const jobUpdatedTime = job.updatedAt ? new Date(job.updatedAt).getTime() : 0;
        const targetProforma = (job as any).proformaNumber || (job as any).proformaReceiptNumber;
        if (!targetProforma || targetProforma === "DRAFT") return false;
        const cleanBaseProforma = cleanProformaNumber(targetProforma) || job.id;
        const rev = (job as any).proformaRevision || 0;
        const revKey = `proforma_${job.id}_rev${rev}`;

        // Guard: If job has 0 items (e.g. initial booking with fee only), NEVER auto-generate proforma!
        let proformaItemsArr: any[] = [];
        try {
          proformaItemsArr = typeof job.items === 'string' ? JSON.parse(job.items) : (job.items || []);
        } catch {}
        if (proformaItemsArr.length === 0) {
          completedRef.current.add(revKey);
          return false;
        }

        if (now - jobUpdatedTime > MAX_JOB_AGE_MS) {
          completedRef.current.add(revKey);
          return false;
        }

        if (completedRef.current.has(revKey)) {
          return false;
        }

        let bills: string[] = [];
        try {
          if (job.billImageUrl) {
            const parsed = JSON.parse(job.billImageUrl);
            bills = Array.isArray(parsed) ? parsed : [parsed];
          }
        } catch {}

        const revFilename = `proforma-${cleanBaseProforma}-rev${rev}.png`;
        const hasThisRev = bills.some(
          (url) => typeof url === "string" && url.includes(revFilename)
        );

        if (hasThisRev) {
          completedRef.current.add(revKey);
          return false;
        }

        return true;
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

              const cleanFiltered = existingBills.filter((u: string) => !u.includes(`proforma-${cleanBaseProforma}-rev${rev}.png`));
              const mergedBills = [publicUrl, ...cleanFiltered];
              await jobStore.updateJobDetails(jobId, {
                billImageUrl: JSON.stringify(mergedBills),
              } as any);

              console.log(`[AutoReceiptWorker] ✔ Auto-generated & attached Proforma INV image for Job #${jobId}`);
            }
          }

          completedRef.current.add(`proforma_${jobId}_rev${rev}`);
        } catch (err) {
          console.warn(`[AutoReceiptWorker] Failed to auto-generate proforma for Job #${jobId}:`, err);
        } finally {
          processingRef.current.delete(jobId);
          isWorkingRef.current = false;
        }
      }
    };

    // Run queue check every 8 seconds (lightweight, non-intrusive)
    const interval = setInterval(processQueue, 8000);

    // Initial check after 3 seconds to let initial render settle
    const initialTimer = setTimeout(processQueue, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(initialTimer);
    };
  }, []);

  // Invisible component (renders nothing in DOM)
  return null;
}
