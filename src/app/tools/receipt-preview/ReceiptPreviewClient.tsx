"use client";

import React, { useState, useEffect, useRef } from "react";
import { formatJobToReceiptData } from "@/components/thermal-receipt-dialog";
import { A5ReceiptContent } from "@/components/a5-receipt-dialog";
import { generateA5ReceiptImage } from "@/lib/a5-canvas-generator";
import { updateJobReceiptUrlAction } from "./action";

interface ReceiptPreviewClientProps {
  initialJob: any;
  initialCustomer: any;
  initialBranch: any;
  autoRun?: boolean;
}

export default function ReceiptPreviewClient({
  initialJob,
  initialCustomer,
  initialBranch,
  autoRun = false,
}: ReceiptPreviewClientProps) {
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const hasAutoRunRef = useRef(false);

  // Parse items
  let items: any[] = [];
  try {
    if (initialJob.itemsJson) {
      items = JSON.parse(initialJob.itemsJson);
    }
  } catch {}

  const activeShop = initialBranch
    ? {
        id: initialBranch.id,
        name: initialBranch.name,
        address: initialBranch.address,
        addressFull: initialBranch.addressFull || initialBranch.address,
        phone: initialBranch.phone,
        taxId: initialBranch.taxId,
        logoUrl: initialBranch.logoUrl,
      }
    : {
        id: "shop_seed",
        name: "That Laundry Shop",
        address: "123 Sukhumvit Road, Bangkok",
        addressFull: "123 Sukhumvit Road, Bangkok",
        phone: "081-111-2222",
        taxId: "0105560000000",
        logoUrl: "/logo.png",
      };

  const receiptData = formatJobToReceiptData({
    ...initialJob,
    items,
    customerId: initialJob.customerId || initialCustomer?.id || undefined,
    customerName: initialJob.customerName || initialCustomer?.name,
    customerPhone: initialJob.customerPhone || initialCustomer?.phone,
  } as any);

  // Force finalized paid receipt values
  receiptData.isDraft = false;
  receiptData.isPaid = true;
  // Crucial: Member identity and true post-deduction Wallet Balance After
  receiptData.isMember = Boolean(initialCustomer?.isMember || initialCustomer?.memberId);
  receiptData.memberId = initialCustomer?.memberId || initialJob.memberId || "";
  receiptData.walletBalanceAfter =
    initialJob.walletBalanceAfter !== null && initialJob.walletBalanceAfter !== undefined
      ? Number(initialJob.walletBalanceAfter)
      : (receiptData.walletBalanceAfter ?? 0);
  receiptData.walletBalance = receiptData.walletBalanceAfter;

  const handleRegenerate = async () => {
    try {
      setStatus("running");
      setMessage("Capturing receipt using local high-resolution A5 canvas generator...");

      const blob = await generateA5ReceiptImage(receiptData, activeShop);
      if (!blob) {
        throw new Error("Failed to generate receipt image blob from canvas.");
      }

      // Create preview object URL for immediate display
      const blobUrl = URL.createObjectURL(blob);
      setPreviewBlobUrl(blobUrl);

      setMessage("Uploading receipt image to local storage (/api/upload-local)...");
      const filename = `receipt-${initialJob.id}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entityType", "jobs");
      formData.append("entityId", initialJob.id);
      formData.append("subType", "proofs");

      const uploadRes = await fetch("/api/upload-local", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed with HTTP ${uploadRes.status}`);
      }

      const uploadResult = await uploadRes.json();
      if (!uploadResult.success || !uploadResult.publicUrl) {
        throw new Error(uploadResult.error || "Failed to receive publicUrl from local upload");
      }

      setMessage(`Saving updated billImageUrl to database for Job #${initialJob.id}...`);
      const updateResult = await updateJobReceiptUrlAction(initialJob.id, uploadResult.publicUrl);

      if (!updateResult.success) {
        throw new Error(updateResult.error || "Database update failed");
      }

      setSavedUrl(uploadResult.publicUrl);
      setStatus("success");
      setMessage(
        `Successfully regenerated and saved receipt! URL: ${uploadResult.publicUrl}`
      );
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setMessage(`Error: ${err.message || String(err)}`);
    }
  };

  useEffect(() => {
    if (autoRun && !hasAutoRunRef.current) {
      hasAutoRunRef.current = true;
      // Slight delay so fonts and styles are fully painted
      setTimeout(() => {
        handleRegenerate();
      }, 500);
    }
  }, [autoRun]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center py-6 px-4">
      {/* Control Banner */}
      <div className="w-full max-w-4xl bg-slate-800 border border-slate-700 rounded-xl p-5 mb-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <span>Receipt Regenerator — Job #{initialJob.id}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                Bill {initialJob.billNo}
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Customer: <span className="text-slate-200 font-semibold">{initialJob.customerName}</span> |
              Wallet Balance After:{" "}
              <span className="text-emerald-400 font-mono font-bold">
                ฿{Number(receiptData.walletBalanceAfter).toLocaleString()}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="regenerate-btn"
              onClick={handleRegenerate}
              disabled={status === "running"}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white font-semibold text-xs rounded-lg shadow-md transition-all cursor-pointer flex items-center gap-2"
            >
              {status === "running" ? "Regenerating..." : "Regenerate & Update Receipt"}
            </button>
          </div>
        </div>

        {/* Status / Message box */}
        {message && (
          <div
            id="status-box"
            className={`mt-4 p-3 rounded-lg text-xs font-mono border ${
              status === "error"
                ? "bg-rose-950/60 border-rose-700/80 text-rose-200"
                : status === "success"
                ? "bg-emerald-950/60 border-emerald-700/80 text-emerald-200"
                : "bg-slate-950/60 border-slate-700 text-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span>Status: <strong className="uppercase">{status}</strong> — {message}</span>
              {savedUrl && (
                <a
                  href={savedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-indigo-300 hover:text-white ml-2"
                >
                  Open Saved Image
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Display Grid */}
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Rendered HTML Component Preview */}
        <div className="flex flex-col items-center">
          <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">
            Live Component Render (559px × 793px)
          </div>
          <div
            id="receipt-capture-container"
            className="w-[559px] min-h-[793px] bg-white shadow-2xl rounded-sm overflow-hidden text-black"
          >
            <A5ReceiptContent
              receiptData={receiptData}
              activeShop={activeShop}
              currentLanguage="en"
            />
          </div>
        </div>

        {/* Newly Captured Image Preview */}
        <div className="flex flex-col items-center">
          <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wide">
            Generated PNG Canvas Output
          </div>
          {previewBlobUrl || savedUrl ? (
            <div className="w-[559px] bg-white p-2 rounded shadow-2xl border border-slate-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                id="generated-preview-img"
                src={previewBlobUrl || savedUrl || ""}
                alt="Generated Receipt"
                className="w-full h-auto object-contain border border-slate-200"
              />
            </div>
          ) : (
            <div className="w-[559px] h-[793px] border-2 border-dashed border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 text-xs text-center p-6">
              <p>Click &quot;Regenerate &amp; Update Receipt&quot; to produce the final canvas image.</p>
              <p className="mt-2 text-[11px] text-slate-600">
                The image will be generated using html2canvas-pro with exact server-loaded fonts.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
