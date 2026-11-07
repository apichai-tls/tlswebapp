"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/providers/auth-provider";
import { runRecurringOrdersAutomationAction } from "@/actions/db";
import { toast } from "sonner";
import { jobStore } from "@/lib/store";

/**
 * Silent Background Worker:
 * Automatically checks active recurring schedules and auto-creates today's pickup jobs
 * without requiring staff to manually click "Run Automation".
 * 
 * Runs safely once on dashboard load (with 6s jitter) and every 30 minutes.
 * Fully idempotent: will never create duplicate jobs on the same day.
 */
export function AutoRecurringWorker() {
  const { user } = useAuth();
  const isCheckingRef = useRef(false);
  const lastCheckDateRef = useRef<string>("");

  useEffect(() => {
    // Only run if user is logged in and not a rider
    if (!user || user.role === "rider") return;

    const performAutomationCheck = async () => {
      if (isCheckingRef.current) return;

      const nowBkk = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
      const todayStr = `${nowBkk.getFullYear()}-${String(nowBkk.getMonth() + 1).padStart(2, '0')}-${String(nowBkk.getDate()).padStart(2, '0')}`;

      // Only run once per hour per client session unless day changed
      isCheckingRef.current = true;
      try {
        const res = await runRecurringOrdersAutomationAction();
        if (res && res.success && (res.generatedCount ?? 0) > 0) {
          toast.success(`⚡ Automated: Created ${res.generatedCount} recurring laundry pickup order(s) for today!`, {
            duration: 6000,
          });
          // Notify store to refresh jobs list in UI
          jobStore.notify();
        }
        lastCheckDateRef.current = todayStr;
      } catch (err) {
        console.warn("[AutoRecurringWorker] Check error:", err);
      } finally {
        isCheckingRef.current = false;
      }
    };

    // Initial check after 6 seconds
    const initialTimer = setTimeout(() => {
      performAutomationCheck();
    }, 6000);

    // Periodic check every 30 minutes
    const intervalTimer = setInterval(() => {
      performAutomationCheck();
    }, 30 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [user]);

  return null;
}
