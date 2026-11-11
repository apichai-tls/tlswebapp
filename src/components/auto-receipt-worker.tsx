"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getUserAssignedBranchIds } from "@/components/branch-filter-dropdown";
import { jobStore, shopStore, settingsStore, customerStore, type Job } from "@/lib/store";
import { formatJobToReceiptData } from "@/components/thermal-receipt-dialog";
import { generateThermalReceiptImage, uploadReceiptImage } from "@/lib/thermal-canvas-generator";
import { generateA5ReceiptImage, markReceiptCaptureStarted, clearReceiptCaptureLock } from "@/lib/a5-canvas-generator";
import { isJobFullyPaid, cleanProformaNumber, computeCartHash } from "@/lib/utils";
import { checkJobOnlinePaymentStatusAction } from "@/actions/online-payment";
import { checkWiseJobPaymentStatusAction, syncAllPendingWiseJobsAction } from "@/actions/wise";
import { toast } from "sonner";
import { claimAutoReceiptGenerationAction } from "@/actions/db";

/**
 * Silent Background Worker:
 * Automatically detects jobs that have been marked as PAID (e.g. via Webhook or Beam online checkout)
 * but do not yet have a receipt image in Cloud Storage, renders the receipt silently off-screen,
 * and attaches the receipt URL to job.billImageUrl.
 * 
 * Runs 100% in the background without modals, popups, or user interaction.
 */
export function AutoReceiptWorker() {
  const { user } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;

  const processingRef = useRef<Set<string>>(new Set());
  const completedRef = useRef<Set<string>>(new Set());
  const retryCooldownRef = useRef<Map<string, number>>(new Map());
  const lastBeamCheckMap = useRef<Map<string, number>>(new Map());
  const lastWiseBatchSyncRef = useRef<number>(0);
  const isWorkingRef = useRef(false);
  const instanceJitterMsRef = useRef<number>(Math.floor(Math.random() * 10000));

  useEffect(() => {
    // Process queue of jobs that need receipts or proformas
    const processQueue = async () => {
      if (isWorkingRef.current || typeof document === "undefined") return;

      const currentUser = userRef.current;
      if (!currentUser) return;

      const isBranchRestricted = Boolean(
        currentUser.role !== "admin" &&
          ((currentUser.area && currentUser.area !== "ALL") ||
            (currentUser.branchId && currentUser.branchId !== "all"))
      );
      const userArea = (currentUser.area && currentUser.area !== "ALL") ? currentUser.area.toUpperCase() : null;

      const jobs = jobStore.getSnapshot();
      if (!jobs || jobs.length === 0) return;

      const shopLocations = shopStore.getSnapshot();
      const systemSettings = settingsStore.getSnapshot();
      const isA5 = systemSettings?.receiptPaperSize === "A5";

      const now = Date.now();
      const MAX_JOB_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours window for proforma & active pollers
      const MAX_RECEIPT_JOB_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days window for paid jobs (covers multi-day/weekend Beam & Wise payments)

      // 0. Auto-check and synchronize unpaid Beam / Gateway jobs in the background (within 2h window)
      const unpaidBeamJob = jobs.find((job) => {
        if (!job.id || job.id === "DRAFT" || job.isPaid || job.isShopPaid) return false;
        if (['cancel', 'return', 'completed'].includes(job.status)) return false;
        if (isBranchRestricted && shopLocations.length > 0) {
          const allowedIds = getUserAssignedBranchIds(currentUser, shopLocations);
          if (!job.branchId || !allowedIds.includes(job.branchId)) return false;
        }
        if ((false as boolean) && isBranchRestricted && userArea) {
          const jobShop = shopLocations.find((s) => s.id === job.branchId);
          if (!jobShop || (jobShop.area || "").toUpperCase() !== userArea) return false;
        }
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
            const { api, refreshDb } = await import("@/lib/api");
            await api.fetchAndApplyJob(unpaidBeamJob.id);
            jobStore.notify();
            await refreshDb();
          }
        }).catch((err) => {
          console.warn(`[AutoReceiptWorker] Background check failed for Job #${unpaidBeamJob.id}:`, err);
        });
      }

      // 0B. Auto-check and synchronize unpaid Wise jobs in the background (even when Wise dialog is closed)
      const unpaidWiseJob = jobs.find((job) => {
        if (!job.id || job.id === "DRAFT" || job.isPaid || job.isShopPaid) return false;
        if (['cancel', 'return', 'completed'].includes(job.status)) return false;
        const channel = (job.paymentChannel || "").toLowerCase();
        if (!channel.includes("wise")) return false;
        const jobUpdatedTime = job.updatedAt ? new Date(job.updatedAt).getTime() : 0;
        if (now - jobUpdatedTime > 24 * 60 * 60 * 1000) return false;
        const lastCheck = lastBeamCheckMap.current.get(`wise_${job.id}`) || 0;
        return (now - lastCheck) > 8000; // check every 8s per active Wise job
      });

      if (unpaidWiseJob) {
        lastBeamCheckMap.current.set(`wise_${unpaidWiseJob.id}`, now);
        checkWiseJobPaymentStatusAction({
          jobId: unpaidWiseJob.id,
          expectedAmount: Number(unpaidWiseJob.totalAmount) || 0,
        }).then(async (res) => {
          if (res.success && res.isPaid) {
            console.log(`[AutoReceiptWorker] ✔ Detected Wise payment for Job #${unpaidWiseJob.id} via background poller`);
            const { api, refreshDb } = await import("@/lib/api");
            if (res.job) {
              api.applyServerJob(res.job);
            } else {
              await api.fetchAndApplyJob(unpaidWiseJob.id);
            }
            jobStore.notify();
            await refreshDb();
            toast.success(`🎉 Wise Payment Synced: Order #${unpaidWiseJob.id} marked as PAID!`);
          }
        }).catch((err) => {
          console.warn(`[AutoReceiptWorker] Wise background check failed for Job #${unpaidWiseJob.id}:`, err);
        });
      } else if (now - lastWiseBatchSyncRef.current > 15000) {
        // Also run batch Wise sync every 15s to catch Wise transfers for any recent unpaid order
        lastWiseBatchSyncRef.current = now;
        syncAllPendingWiseJobsAction().then(async (res) => {
          if (res.success && res.paidJobs && res.paidJobs.length > 0) {
            const { api, refreshDb } = await import("@/lib/api");
            for (const pj of res.paidJobs) {
              if (pj.job) {
                api.applyServerJob(pj.job);
              } else {
                await api.fetchAndApplyJob(pj.jobId);
              }
              toast.success(`🎉 Wise Payment Synced: ฿${pj.amount.toFixed(2)} from ${pj.senderName} (Order #${pj.jobId})`);
            }
            jobStore.notify();
            await refreshDb();
          }
        }).catch(() => {});
      }

      // 1. Find newly paid jobs (specifically from Beam or recent cashier checkout) missing receipt image
      const pendingPaidJob = jobs.find((job) => {
        if (!job.id || job.id === "DRAFT") return false;
        if (processingRef.current.has(job.id)) return false;
        const receiptKey = `receipt_${job.id}_${job.updatedAt || ""}`;
        if (completedRef.current.has(receiptKey)) return false;
        const cooldownUntil = retryCooldownRef.current.get(receiptKey) || 0;
        if (now < cooldownUntil) return false;

        // Skip cancelled or returned jobs immediately
        if (['cancel', 'return'].includes(job.status)) {
          completedRef.current.add(receiptKey);
          return false;
        }

        if (isBranchRestricted && shopLocations.length > 0) {
          const allowedIds = getUserAssignedBranchIds(currentUser, shopLocations);
          if (!job.branchId || !allowedIds.includes(job.branchId)) return false;
        }
        if ((false as boolean) && isBranchRestricted && userArea) {
          const jobShop = shopLocations.find((s) => s.id === job.branchId);
          if (!jobShop || (jobShop.area || "").toUpperCase() !== userArea) {
            completedRef.current.add(receiptKey);
            return false;
          }
        }

        // Only process jobs updated or paid recently (within the last 36 hours to cover overnight online payments)
        const jobUpdatedTime = job.updatedAt ? new Date(job.updatedAt).getTime() : 0;
        const rawPaidTime = (job as any).shopPaidAt
          ? new Date((job as any).shopPaidAt).getTime()
          : jobUpdatedTime;
        // If shopPaidAt was rolled forward to next-day 09:00 (post-19:00 Beam cutoff), use jobUpdatedTime for elapsed checks
        const effectivePaidEventTime = (rawPaidTime > now + 60000 && jobUpdatedTime > 0)
          ? jobUpdatedTime
          : rawPaidTime;

        if (now - effectivePaidEventTime > MAX_RECEIPT_JOB_AGE_MS && now - jobUpdatedTime > MAX_RECEIPT_JOB_AGE_MS) {
          completedRef.current.add(receiptKey);
          return false;
        }

        const isPaid = isJobFullyPaid(job);
        if (!isPaid || !job.isShopPaid) return false;

        // Online Gateway / Beam webhook payments are processed immediately (0s delay).
        // For normal staff payments (Deduct Member, Cash, PromptPay, Transfer, etc.), wait a 20-second
        // grace period so the cashier machine's own background capture finishes first; if the receipt is
        // still missing after 20s (e.g. dialog/tab closed early), AutoReceiptWorker steps in as a safety net.
        const channel = (job.paymentChannel || "").toLowerCase();
        const isOnlineGateway = channel.includes("beam") || channel.includes("gateway") || channel.includes("wise");
        let isOwnerTab = false;
        if (currentUser?.name) {
          const currentUserName = currentUser.name.trim().toLowerCase();
          if (job.createdBy && job.createdBy.trim().toLowerCase() === currentUserName) {
            isOwnerTab = true;
          } else if ((job as any).adminNotesJson) {
            try {
              const parsedNotes = JSON.parse((job as any).adminNotesJson);
              if (parsedNotes?.billSentBy && String(parsedNotes.billSentBy).trim().toLowerCase() === currentUserName) {
                isOwnerTab = true;
              } else if (parsedNotes?.shopPaidBy && String(parsedNotes.shopPaidBy).trim().toLowerCase() === currentUserName) {
                isOwnerTab = true;
              }
            } catch {}
          }
        }
        const minWaitMs = isOnlineGateway
          ? (isOwnerTab ? 1500 : 8000 + instanceJitterMsRef.current)
          : (isOwnerTab ? 20000 : 25000 + instanceJitterMsRef.current);
        if ((now - effectivePaidEventTime) < minWaitMs) return false;

        // Guard: Job must have actual laundry items (excluding PACKAGE top-ups) to auto-generate receipt!
        // Delivery booking fees alone or package top-ups without clothes must NOT generate a receipt!
        let itemsArr: any[] = [];
        try {
          if (Array.isArray(job.items)) {
            itemsArr = job.items;
          } else if (typeof job.items === 'string') {
            itemsArr = JSON.parse(job.items);
          } else if ((job as any).itemsJson) {
            itemsArr = JSON.parse((job as any).itemsJson);
          }
        } catch {}
        const hasLaundryItems = itemsArr.some(
          (item: any) => item.category !== "PACKAGE" && !String(item.name || "").toLowerCase().includes("package")
        );
        if (!hasLaundryItems) {
          return false;
        }

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

        return true;
      });

      if (pendingPaidJob) {
        const jobId = pendingPaidJob.id;
        const receiptKey = `receipt_${jobId}_${pendingPaidJob.updatedAt || ""}`;
        const filename = `receipt-${jobId}.png`;
        if (!markReceiptCaptureStarted(filename)) return;

        isWorkingRef.current = true;
        processingRef.current.add(jobId);

        try {
          const claimRes = await claimAutoReceiptGenerationAction(jobId, filename).catch(() => ({ claimed: true }));
          if (!claimRes?.claimed) {
            // Another tab is currently generating or user is not authorized for this branch;
            // set a 25s retry cooldown instead of permanently marking completed so we retry if the other tab fails.
            retryCooldownRef.current.set(receiptKey, Date.now() + 25000);
            clearReceiptCaptureLock(filename);
            return;
          }

          const activeShop = shopLocations.find((s) => s.id === pendingPaidJob.branchId) || shopLocations[0];
          const receiptData = formatJobToReceiptData(pendingPaidJob);
          receiptData.isDraft = false;
          receiptData.isPaid = true;
          receiptData.autoCapture = true;

          const blob = isA5
            ? await generateA5ReceiptImage(receiptData, activeShop)
            : await generateThermalReceiptImage(receiptData, activeShop);

          let attachedSuccessfully = false;
          if (blob) {
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
              const chLower = (pendingPaidJob.paymentChannel || "").toLowerCase();
              const systemActorName = (chLower.includes("beam") || chLower.includes("gateway"))
                ? "Beam Online Payment"
                : chLower.includes("wise")
                  ? "Wise Online Payment"
                  : "System (Auto-Receipt)";
              await jobStore.updateJobDetails(jobId, {
                billImageUrl: JSON.stringify(mergedBills),
                isAutoReceiptWorker: true,
                systemActorName,
              } as any);

              attachedSuccessfully = true;
              console.log(`[AutoReceiptWorker] ✔ Auto-generated & attached receipt image for Job #${jobId} as ${systemActorName}`);
            } else {
              clearReceiptCaptureLock(filename);
            }
          } else {
            clearReceiptCaptureLock(filename);
          }

          if (attachedSuccessfully) {
            if (completedRef.current.size > 500) {
              completedRef.current.clear();
            }
            completedRef.current.add(receiptKey);
          } else {
            retryCooldownRef.current.set(receiptKey, Date.now() + 25000);
          }
        } catch (err) {
          clearReceiptCaptureLock(filename);
          retryCooldownRef.current.set(receiptKey, Date.now() + 25000);
          console.warn(`[AutoReceiptWorker] Failed to auto-generate receipt for Job #${jobId}:`, err);
        } finally {
          processingRef.current.delete(jobId);
          isWorkingRef.current = false;
        }
        return;
      }

      // 2. Safety net for missing Proforma (INV) image when proformaNumber is set on a recent job with laundry items
      const pendingProformaJob = jobs.find((job) => {
        if (!job.id || job.id === "DRAFT") return false;
        if (processingRef.current.has(job.id)) return false;
        const rawPf = cleanProformaNumber((job as any).proformaNumber || (job as any).proformaReceiptNumber);
        if (!rawPf || rawPf === "DRAFT") return false;
        const rev = (job as any).proformaRevision != null ? Number((job as any).proformaRevision) : 0;
        const proformaKey = `proforma_${job.id}_${rawPf}_rev${rev}_${job.updatedAt || ""}`;
        if (completedRef.current.has(proformaKey)) return false;
        const pfCooldownUntil = retryCooldownRef.current.get(proformaKey) || 0;
        if (now < pfCooldownUntil) return false;

        if (['cancel', 'return'].includes(job.status)) {
          completedRef.current.add(proformaKey);
          return false;
        }

        if (isBranchRestricted && shopLocations.length > 0) {
          const allowedIds = getUserAssignedBranchIds(currentUser, shopLocations);
          if (!job.branchId || !allowedIds.includes(job.branchId)) return false;
        }
        if ((false as boolean) && isBranchRestricted && userArea) {
          const jobShop = shopLocations.find((s) => s.id === job.branchId);
          if (!jobShop || (jobShop.area || "").toUpperCase() !== userArea) {
            completedRef.current.add(proformaKey);
            return false;
          }
        }

        const jobUpdatedTime = job.updatedAt ? new Date(job.updatedAt).getTime() : 0;
        const jobPaidTime = (job as any).shopPaidAt
          ? new Date((job as any).shopPaidAt).getTime()
          : jobUpdatedTime;

        if (now - jobPaidTime > MAX_JOB_AGE_MS && now - jobUpdatedTime > MAX_JOB_AGE_MS) {
          completedRef.current.add(proformaKey);
          return false;
        }

        // Wait a 20-second grace period (+ per-tab jitter) so the primary background capture in AdminPage finishes first
        const latestActivityTime = Math.max(jobUpdatedTime, jobPaidTime);
        if ((now - latestActivityTime) < 20000 + instanceJitterMsRef.current) return false;

        let itemsArr: any[] = [];
        try {
          if (Array.isArray(job.items)) {
            itemsArr = job.items;
          } else if (typeof job.items === 'string') {
            itemsArr = JSON.parse(job.items);
          } else if ((job as any).itemsJson) {
            itemsArr = JSON.parse((job as any).itemsJson);
          }
        } catch {}
        const hasLaundryItems = itemsArr.some(
          (item: any) => item.category !== "PACKAGE" && !String(item.name || "").toLowerCase().includes("package")
        );
        if (!hasLaundryItems) {
          return false;
        }

        let bills: string[] = [];
        try {
          if (job.billImageUrl) {
            const parsed = JSON.parse(job.billImageUrl);
            bills = Array.isArray(parsed) ? parsed : [parsed];
          }
        } catch {}

        const expectedFilename = `proforma-${rawPf}-rev${rev}.png`;
        const hasProforma = bills.some(
          (url) => typeof url === "string" && url.includes(expectedFilename)
        );

        if (hasProforma) {
          completedRef.current.add(proformaKey);
          return false;
        }

        return true;
      });

      if (pendingProformaJob) {
        const jobId = pendingProformaJob.id;
        const cleanPf = cleanProformaNumber((pendingProformaJob as any).proformaNumber || (pendingProformaJob as any).proformaReceiptNumber)!;
        const rev = (pendingProformaJob as any).proformaRevision != null ? Number((pendingProformaJob as any).proformaRevision) : 0;
        const proformaKey = `proforma_${jobId}_${cleanPf}_rev${rev}_${pendingProformaJob.updatedAt || ""}`;
        const filename = `proforma-${cleanPf}-rev${rev}.png`;
        if (!markReceiptCaptureStarted(filename)) return;

        isWorkingRef.current = true;
        processingRef.current.add(jobId);

        try {
          const claimRes = await claimAutoReceiptGenerationAction(jobId, filename).catch(() => ({ claimed: true }));
          if (!claimRes?.claimed) {
            retryCooldownRef.current.set(proformaKey, Date.now() + 25000);
            clearReceiptCaptureLock(filename);
            return;
          }

          const activeShop = shopLocations.find((s) => s.id === pendingProformaJob.branchId) || shopLocations[0];
          const proformaAdminNotesJson = (() => {
            try {
              const raw = (pendingProformaJob as any).adminNotesJson;
              if (!raw) return undefined;
              const parsed = JSON.parse(raw);
              delete parsed.payments;
              return JSON.stringify(parsed);
            } catch {
              return undefined;
            }
          })();

          const proformaData = formatJobToReceiptData({
            ...pendingProformaJob,
            isDraft: true,
            isPaid: false,
            isShopPaid: false,
          } as any);
          proformaData.isDraft = true;
          proformaData.isPaid = false;
          proformaData.autoCapture = true;
          proformaData.proformaId = cleanPf;
          proformaData.proformaRevision = rev;
          proformaData.jobId = jobId;
          proformaData.adminNotesJson = proformaAdminNotesJson;
          proformaData.walletBalanceAfter = undefined;

          const blob = isA5
            ? await generateA5ReceiptImage(proformaData, activeShop)
            : await generateThermalReceiptImage(proformaData, activeShop);

          let attachedPfSuccessfully = false;
          if (blob) {
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

              const cleanFiltered = existingBills.filter((u: string) => !u.includes(filename));
              const mergedBills = Array.from(new Set([publicUrl, ...cleanFiltered]));
              mergedBills.sort((a, b) => {
                const aIsPf = a.includes("proforma-");
                const bIsPf = b.includes("proforma-");
                if (aIsPf && !bIsPf) return -1;
                if (!aIsPf && bIsPf) return 1;
                if (aIsPf && bIsPf) {
                  const aRev = parseInt((a.match(/-rev(\d+)\.png/i) || [])[1] || "0", 10);
                  const bRev = parseInt((b.match(/-rev(\d+)\.png/i) || [])[1] || "0", 10);
                  return bRev - aRev;
                }
                const aIsRc = a.includes("receipt-");
                const bIsRc = b.includes("receipt-");
                if (aIsRc && !bIsRc) return 1;
                if (!aIsRc && bIsRc) return -1;
                return 0;
              });
              await jobStore.updateJobDetails(jobId, {
                billImageUrl: JSON.stringify(mergedBills),
                isAutoReceiptWorker: true,
                systemActorName: "System (Auto-Proforma)",
              } as any);

              attachedPfSuccessfully = true;
              console.log(`[AutoReceiptWorker] ✔ Auto-generated & attached missing proforma image (${filename}) for Job #${jobId}`);
            } else {
              clearReceiptCaptureLock(filename);
            }
          } else {
            clearReceiptCaptureLock(filename);
          }

          if (attachedPfSuccessfully) {
            if (completedRef.current.size > 500) {
              completedRef.current.clear();
            }
            completedRef.current.add(proformaKey);
          } else {
            retryCooldownRef.current.set(proformaKey, Date.now() + 25000);
          }
        } catch (err) {
          clearReceiptCaptureLock(filename);
          retryCooldownRef.current.set(proformaKey, Date.now() + 25000);
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
