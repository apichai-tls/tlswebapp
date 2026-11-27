"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Camera,
  ImagePlus,
  Sparkles,
  Loader2,
  Wallet,
  Receipt,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  Plus,
  RefreshCw,
  Edit3,
  Trash2,
  FileText,
  Car,
  ZoomIn,
  RotateCcw,
  Search,
  Calendar,
} from "lucide-react";
import {
  getPettyCashDataAction,
  createPettyCashTransactionAction,
  updatePettyCashTransactionAction,
} from "@/actions/db";

export interface MobilePettyCashTx {
  id: string;
  txNumber?: string | null;
  type: "EXPENSE" | "TOPUP" | "TRANSFER_OUT" | "TRANSFER_IN" | "RETURN" | "ADJUST_ADD" | "ADJUST_DEDUCT";
  direction: "DEBIT" | "CREDIT";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  holderId: string;
  holderName: string;
  branchId?: string | null;
  category: string;
  description: string;
  vendorName?: string | null;
  invoiceNo?: string | null;
  vehiclePlate?: string | null;
  paymentMethod?: string | null;
  receiptUrls: string[];
  slipUrls: string[];
  status: "PENDING" | "APPROVED" | "REJECTED" | "VOID";
  transactionDate: string | Date;
  createdById?: string | null;
  createdByName?: string | null;
  rejectReason?: string | null;
  createdAt: string | Date;
}

interface MobilePettyCashProps {
  currentUser?: any;
  onRejectedCountChange?: (count: number) => void;
}

function toYearMonthKey(raw?: string | Date | null): string {
  const d = raw ? new Date(raw) : new Date();
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatThaiMonthLabel(ym: string): string {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  return new Intl.DateTimeFormat("th-TH", {
    month: "short",
    year: "numeric",
  }).format(d);
}

function shouldShowVehiclePlateField(category?: string | null): boolean {
  if (!category) return false;
  return /น้ำมัน|เชื้อเพลิง|ทางด่วน|รถ|ซ่อม|อะไหล่|fuel|transport|vehicle|maintenance|toll/i.test(
    category
  );
}

function formatThaiDateShort(raw: string | Date): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(d);
}

function toDateInputValue(raw?: string | Date | null): string {
  const d = raw ? new Date(raw) : new Date();
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function compressImageForPettyCash(
  file: File,
  maxDim = 1280,
  quality = 0.82
): Promise<{ file: File; base64: string }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Canvas unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob) {
              reject(new Error("Image compression failed"));
              return;
            }
            const cleanName = (file.name || `receipt-${Date.now()}.jpg`).replace(/\.[^.]+$/, ".jpg");
            const outFile = new File([blob], cleanName, { type: "image/jpeg" });
            resolve({ file: outFile, base64: dataUrl });
          },
          "image/jpeg",
          quality
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Invalid image file"));
    };
    img.src = objectUrl;
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

export function MobilePettyCash({ currentUser, onRejectedCountChange }: MobilePettyCashProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<MobilePettyCashTx[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [holderLimits, setHolderLimits] = useState<Record<string, number>>({});
  const [vehiclePlates, setVehiclePlates] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>(() => toYearMonthKey(new Date()));

  // Capture / Edit Modal State
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<MobilePettyCashTx | null>(null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [customPlateMode, setCustomPlateMode] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Transfer" | "QR">("Cash");
  const [transactionDate, setTransactionDate] = useState(() => toDateInputValue());
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [slipUrls, setSlipUrls] = useState<string[]>([]);

  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [isUploadingSlip, setIsUploadingSlip] = useState(false);
  const [isRunningOcr, setIsRunningOcr] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const lastReceiptBase64Ref = useRef<string | null>(null);
  const lastReceiptMimeRef = useRef<string>("image/jpeg");
  const receiptCameraInputRef = useRef<HTMLInputElement>(null);
  const receiptGalleryInputRef = useRef<HTMLInputElement>(null);
  const slipCameraInputRef = useRef<HTMLInputElement>(null);
  const slipGalleryInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (isSilent = false) => {
    if (isSilent) setRefreshing(true);
    else setLoading(true);
    try {
      const pcRes = await getPettyCashDataAction();
      if (pcRes.success) {
        setTransactions((pcRes.transactions || []) as MobilePettyCashTx[]);
        setCategories(pcRes.categories || []);
        setHolderLimits(pcRes.holderLimits || {});
        setVehiclePlates(pcRes.vehiclePlates || []);
      } else {
        toast.error(pcRes.error || "ไม่สามารถโหลดข้อมูล Petty Cash ได้");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาดในการโหลดข้อมูล Petty Cash");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const activeHolderId = currentUser?.id || "";
  const activeHolderName = currentUser?.name || currentUser?.email || "Staff";

  // Filter transactions belonging to active holder
  const holderTxs = useMemo(() => {
    if (!activeHolderId) return [];
    return transactions.filter((tx) => tx.holderId === activeHolderId);
  }, [transactions, activeHolderId]);

  // Wallet balance & metrics for active holder
  const walletMetrics = useMemo(() => {
    let balance = 0;
    let pendingAmount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;

    for (const tx of holderTxs) {
      const amt = Number(tx.amount) || 0;
      const isCredit = tx.direction === "CREDIT";
      if (isCredit) {
        if (tx.status === "APPROVED") balance += amt;
      } else {
        if (tx.status === "APPROVED" || tx.status === "PENDING") {
          balance -= amt;
        }
      }
      if (tx.type === "EXPENSE") {
        if (tx.status === "PENDING") {
          pendingAmount += amt;
          pendingCount++;
        } else if (tx.status === "REJECTED") {
          rejectedCount++;
        }
      }
    }
    const quota = Number(holderLimits[activeHolderId] || 0);
    return {
      balance: Math.round(balance * 100) / 100,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      pendingCount,
      rejectedCount,
      quota,
    };
  }, [holderTxs, holderLimits, activeHolderId]);

  useEffect(() => {
    onRejectedCountChange?.(walletMetrics.rejectedCount);
  }, [walletMetrics.rejectedCount, onRejectedCountChange]);

  // Unique YYYY-MM months from holder's expenses + current month
  const monthOptions = useMemo(() => {
    const ymSet = new Set<string>([toYearMonthKey(new Date())]);
    for (const tx of holderTxs) {
      if (tx.type !== "EXPENSE") continue;
      const ym = toYearMonthKey(tx.transactionDate || tx.createdAt);
      if (ym) ymSet.add(ym);
    }
    return Array.from(ymSet)
      .sort((a, b) => b.localeCompare(a))
      .map((ym) => ({ value: ym, label: formatThaiMonthLabel(ym) }));
  }, [holderTxs]);

  // Expense list filtered by month & search query
  const myExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return holderTxs.filter((tx) => {
      if (tx.type !== "EXPENSE") return false;
      if (selectedMonth !== "all") {
        const ym = toYearMonthKey(tx.transactionDate || tx.createdAt);
        if (ym !== selectedMonth) return false;
      }
      if (q) {
        const haystack = [
          tx.txNumber,
          tx.description,
          tx.category,
          tx.vendorName,
          tx.invoiceNo,
          tx.vehiclePlate,
          String(tx.amount ?? ""),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [holderTxs, selectedMonth, searchQuery]);

  const openNewExpenseSheet = () => {
    setEditingTx(null);
    setAmount("");
    setCategory(categories[0] || "ค่าใช้จ่ายทั่วไป (General Expense)");
    setDescription("");
    setVendorName("");
    setInvoiceNo("");
    setVehiclePlate("");
    setCustomPlateMode(false);
    setPaymentMethod("Cash");
    setTransactionDate(toDateInputValue());
    setReceiptUrls([]);
    setSlipUrls([]);
    lastReceiptBase64Ref.current = null;
    setIsSheetOpen(true);
  };

  const openEditExpenseSheet = (tx: MobilePettyCashTx) => {
    if (tx.status === "APPROVED") {
      toast.error("ใบเบิกที่อนุมัติแล้วไม่สามารถแก้ไขรายละเอียดได้");
      return;
    }
    setEditingTx(tx);
    setAmount(String(tx.amount || ""));
    setCategory(tx.category || categories[0] || "");
    setDescription(tx.description || "");
    setVendorName(tx.vendorName || "");
    setInvoiceNo(tx.invoiceNo || "");
    const existingPlate = tx.vehiclePlate || "";
    setVehiclePlate(existingPlate);
    setCustomPlateMode(Boolean(existingPlate && !vehiclePlates.includes(existingPlate)));
    const pm = tx.paymentMethod === "Transfer" || tx.paymentMethod === "QR" ? tx.paymentMethod : "Cash";
    setPaymentMethod(pm);
    setTransactionDate(toDateInputValue(tx.transactionDate));
    setReceiptUrls(Array.isArray(tx.receiptUrls) ? [...tx.receiptUrls] : []);
    setSlipUrls(Array.isArray(tx.slipUrls) ? [...tx.slipUrls] : []);
    lastReceiptBase64Ref.current = null;
    setIsSheetOpen(true);
  };

  const uploadAttachments = async (files: FileList | null, target: "receipts" | "slips") => {
    if (!files || files.length === 0) return;
    if (target === "receipts") setIsUploadingReceipt(true);
    else setIsUploadingSlip(true);

    const newUrls: string[] = [];
    try {
      const fileArray = Array.from(files);
      for (let i = 0; i < fileArray.length; i++) {
        const rawFile = fileArray[i];
        let uploadFile: File = rawFile;

        if (rawFile.type.startsWith("image/")) {
          try {
            const compressed = await compressImageForPettyCash(rawFile, 1280, 0.82);
            uploadFile = compressed.file;
            if (target === "receipts" && i === fileArray.length - 1) {
              lastReceiptBase64Ref.current = compressed.base64;
              lastReceiptMimeRef.current = "image/jpeg";
            }
          } catch {
            // Fallback to raw image if canvas fails
          }
        }

        let publicUrl = "";
        try {
          const signRes = await fetch("/api/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entityType: "system",
              entityId: "petty_cash",
              subType: target,
              contentType: uploadFile.type || "application/octet-stream",
              filename: uploadFile.name || `${target}-${Date.now()}.jpg`,
            }),
          });
          if (signRes.ok) {
            const signData = await signRes.json();
            if (signData.uploadUrl && signData.publicUrl) {
              const putRes = await fetch(signData.uploadUrl, {
                method: "PUT",
                headers: { "Content-Type": uploadFile.type || "application/octet-stream" },
                body: uploadFile,
              });
              if (putRes.ok) {
                publicUrl = signData.publicUrl;
              }
            }
          }
        } catch {}

        if (!publicUrl) {
          try {
            const fd = new FormData();
            fd.append("file", uploadFile);
            fd.append("entityType", "system");
            fd.append("entityId", "petty_cash");
            fd.append("subType", target);
            const localRes = await fetch("/api/upload-local", { method: "POST", body: fd });
            const localData = await localRes.json();
            if (localData.success && localData.publicUrl) {
              publicUrl = localData.publicUrl;
            }
          } catch {}
        }

        if (!publicUrl && target === "receipts" && lastReceiptBase64Ref.current) {
          publicUrl = lastReceiptBase64Ref.current;
        }

        if (publicUrl) {
          newUrls.push(publicUrl);
        }
      }

      if (newUrls.length > 0) {
        if (target === "receipts") {
          setReceiptUrls((prev) => [...prev, ...newUrls]);
          toast.success(`แนบใบเสร็จ ${newUrls.length} รูปเรียบร้อย ✅`);
        } else {
          setSlipUrls((prev) => [...prev, ...newUrls]);
          toast.success(`แนบสลิปโอนเงิน ${newUrls.length} รูปเรียบร้อย ✅`);
        }
      } else {
        toast.error("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      }
    } finally {
      if (target === "receipts") setIsUploadingReceipt(false);
      else setIsUploadingSlip(false);
    }
  };

  const handleRunAiOcr = async () => {
    let base64ToUse = lastReceiptBase64Ref.current;
    let mimeToUse = lastReceiptMimeRef.current || "image/jpeg";

    if (!base64ToUse && receiptUrls.length > 0) {
      const firstUrl = receiptUrls[0];
      if (firstUrl.startsWith("data:")) {
        base64ToUse = firstUrl;
      } else {
        try {
          const resp = await fetch(firstUrl);
          if (resp.ok) {
            const blob = await resp.blob();
            base64ToUse = await blobToDataUrl(blob);
            mimeToUse = blob.type || "image/jpeg";
          }
        } catch {}
      }
    }

    if (!base64ToUse) {
      toast.error("กรุณาถ่ายหรือแนบรูปใบเสร็จก่อนให้ AI อ่านข้อมูล");
      return;
    }

    setIsRunningOcr(true);
    try {
      const res = await fetch("/api/petty-cash/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64ToUse,
          mimeType: mimeToUse,
          categories,
          vehiclePlates,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json?.error || "AI ไม่สามารถอ่านใบเสร็จได้ กรุณากรอกข้อมูลเอง");
        return;
      }

      const d = json.data || {};
      const filledFields: string[] = [];

      if (typeof d.amount === "number" && d.amount > 0) {
        setAmount(String(d.amount));
        filledFields.push("ยอดเงิน");
      }
      if (d.transactionDate) {
        setTransactionDate(d.transactionDate);
        filledFields.push("วันที่");
      }
      if (d.vendorName) {
        setVendorName(d.vendorName);
        filledFields.push("ร้านค้า");
      }
      if (d.invoiceNo) {
        setInvoiceNo(d.invoiceNo);
        filledFields.push("เลขบิล");
      }
      if (d.description) {
        setDescription(d.description);
        filledFields.push("รายละเอียด");
      }
      if (d.category && categories.includes(d.category)) {
        setCategory(d.category);
        filledFields.push("หมวดหมู่");
      }
      if (d.vehiclePlate) {
        setVehiclePlate(d.vehiclePlate);
        setCustomPlateMode(!vehiclePlates.includes(d.vehiclePlate));
        filledFields.push("ทะเบียนรถ");
      }
      if (d.paymentMethod === "Cash" || d.paymentMethod === "Transfer" || d.paymentMethod === "QR") {
        setPaymentMethod(d.paymentMethod);
        filledFields.push("วิธีจ่าย");
      }

      if (filledFields.length > 0) {
        toast.success(`✨ AI อ่านบิลแล้ว (${filledFields.join(", ")}) กรุณาตรวจสอบก่อนกดส่ง`);
      } else {
        toast.info("AI อ่านบิลแล้วแต่ไม่พบข้อความชัดเจน กรุณากรอกข้อมูลเพิ่มเติม");
      }
    } catch {
      toast.error("เชื่อมต่อ AI OCR ไม่สำเร็จ กรุณากรอกข้อมูลด้วยตนเอง");
    } finally {
      setIsRunningOcr(false);
    }
  };

  const handleSubmitExpense = async () => {
    const numAmt = Number(amount);
    if (!Number.isFinite(numAmt) || numAmt <= 0) {
      toast.error("กรุณาระบุจำนวนเงินที่มากกว่า 0");
      return;
    }
    if (!category.trim()) {
      toast.error("กรุณาเลือกหมวดหมู่ค่าใช้จ่าย");
      return;
    }
    if (!description.trim()) {
      toast.error("กรุณากรอกรายละเอียดค่าใช้จ่าย");
      return;
    }
    if (receiptUrls.length === 0 && slipUrls.length === 0) {
      toast.error("กรุณาถ่ายหรือแนบรูปใบเสร็จ / เอกสารประกอบอย่างน้อย 1 รูป");
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanPlate = shouldShowVehiclePlateField(category)
        ? vehiclePlate.trim() || null
        : null;

      if (editingTx) {
        const isResubmitting = editingTx.status === "REJECTED";
        const res = await updatePettyCashTransactionAction(editingTx.id, {
          amount: numAmt,
          holderId: activeHolderId,
          holderName: activeHolderName,
          category: category.trim(),
          description: description.trim(),
          vendorName: vendorName.trim() || null,
          invoiceNo: invoiceNo.trim() || null,
          vehiclePlate: cleanPlate,
          paymentMethod,
          receiptUrls,
          slipUrls,
          transactionDate,
          resubmit: isResubmitting,
        });
        if (!res.success) {
          toast.error(res.error || "อัปเดตรายการไม่สำเร็จ");
          return;
        }
        toast.success(
          isResubmitting
            ? "แก้ไขและส่งเบิกใหม่อีกครั้งเรียบร้อย ✅"
            : "อัปเดตเอกสารและข้อมูลเรียบร้อย ✅"
        );
      } else {
        const branchId = currentUser?.branchId || null;
        const res = await createPettyCashTransactionAction({
          type: "EXPENSE",
          amount: numAmt,
          holderId: activeHolderId,
          holderName: activeHolderName,
          branchId,
          category: category.trim(),
          description: description.trim(),
          vendorName: vendorName.trim() || null,
          invoiceNo: invoiceNo.trim() || null,
          vehiclePlate: cleanPlate,
          paymentMethod,
          receiptUrls,
          slipUrls,
          transactionDate,
        });
        if (!res.success) {
          toast.error(res.error || "บันทึกรายการเบิกไม่สำเร็จ");
          return;
        }
        toast.success("ส่งใบเบิก Petty Cash เรียบร้อย ✅");
      }

      setIsSheetOpen(false);
      await loadData(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
        <Loader2 className="animate-spin text-emerald-600 mb-3" size={28} />
        <p className="text-xs font-bold text-slate-500">กำลังโหลดข้อมูลเงินสดย่อย...</p>
      </div>
    );
  }

  const showPlateField = shouldShowVehiclePlateField(category) || Boolean(vehiclePlate);

  return (
    <div className="space-y-3.5">
      {/* Wallet Summary Card */}
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-emerald-700 text-white p-4 shadow-md space-y-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-emerald-100 text-[11px] font-bold uppercase tracking-wider">
              <Wallet size={13} />
              <span>วงเงินสดย่อย ({activeHolderName})</span>
            </div>
            <div className="text-3xl font-black tracking-tight mt-1 tabular-nums">
              ฿{walletMetrics.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer active:scale-95"
            title="รีเฟรชข้อมูล"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-white/12 px-3 py-2 backdrop-blur-xs">
            <div className="text-[10px] font-bold text-emerald-100">รออนุมัติ ({walletMetrics.pendingCount} รายการ)</div>
            <div className="font-black text-sm mt-0.5 tabular-nums">
              ฿{walletMetrics.pendingAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="rounded-xl bg-white/12 px-3 py-2 backdrop-blur-xs">
            <div className="text-[10px] font-bold text-emerald-100">วงเงินที่ตั้งไว้ (Quota)</div>
            <div className="font-black text-sm mt-0.5 tabular-nums">
              {walletMetrics.quota > 0
                ? `฿${walletMetrics.quota.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "-"}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={openNewExpenseSheet}
          className="w-full py-3.5 rounded-xl bg-white text-emerald-700 hover:bg-emerald-50 font-black text-sm shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
        >
          <Camera size={18} />
          <span>ถ่ายใบเสร็จเบิกเงิน (New Expense)</span>
        </button>
      </div>

      {/* Rejected Alert Banner */}
      {walletMetrics.rejectedCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setSelectedMonth("all");
            setSearchQuery("");
          }}
          className="w-full text-left rounded-2xl bg-rose-50 border border-rose-200 p-3 flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
              <AlertTriangle size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-rose-800">
                มี {walletMetrics.rejectedCount} รายการถูกตีกลับจากฝ่ายบัญชี
              </p>
              <p className="text-[11px] font-medium text-rose-600 truncate">
                แตะเพื่อดูเหตุผลและถ่ายรูป/แก้ไขส่งเบิกใหม่
              </p>
            </div>
          </div>
          <span className="text-[11px] font-black text-rose-700 bg-rose-100 px-2.5 py-1 rounded-lg shrink-0">
            ดูทั้งหมด
          </span>
        </button>
      )}

      {/* Search + Month Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-2.5 shadow-2xs flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="ค้นหารายละเอียด, ร้านค้า, เลขบิล..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-2 rounded-xl border border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="relative shrink-0">
          <Calendar size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none" />
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="pl-7 pr-6 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="all">ทุกเดือน</option>
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Expense List */}
      <div className="space-y-2.5">
        {myExpenses.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200 px-4">
            <Receipt size={40} className="mx-auto text-slate-300 mb-2.5" />
            <p className="text-sm font-bold text-slate-700">ยังไม่มีรายการเบิกจ่ายในหมวดนี้</p>
            <p className="text-xs text-slate-400 mt-1">
              กดปุ่ม &quot;ถ่ายใบเสร็จเบิกเงิน&quot; ด้านบนเพื่อบันทึกค่าใช้จ่ายใหม่
            </p>
          </div>
        ) : (
          myExpenses.map((tx) => {
            const isPending = tx.status === "PENDING";
            const isApproved = tx.status === "APPROVED";
            const isRejected = tx.status === "REJECTED";
            const allPhotos = [
              ...(tx.receiptUrls || []).map((u) => ({ url: u, kind: "receipt" as const })),
              ...(tx.slipUrls || []).map((u) => ({ url: u, kind: "slip" as const })),
            ];

            return (
              <div
                key={tx.id}
                className={`bg-white rounded-2xl border p-3.5 shadow-2xs space-y-2.5 ${
                  isRejected
                    ? "border-rose-300 ring-1 ring-rose-200"
                    : isApproved
                    ? "border-emerald-200/90"
                    : "border-slate-200/90"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[11px] font-black px-2 py-0.5 rounded-md bg-slate-900 text-white">
                        {tx.txNumber || tx.id.slice(0, 8)}
                      </span>
                      <span className="text-[11px] font-bold text-slate-500">
                        {formatThaiDateShort(tx.transactionDate)}
                      </span>
                      {isPending && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          <Clock size={10} /> รออนุมัติ
                        </span>
                      )}
                      {isApproved && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          <CheckCircle2 size={10} /> อนุมัติแล้ว
                        </span>
                      )}
                      {isRejected && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                          <AlertTriangle size={10} /> ถูกตีกลับ
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-extrabold text-indigo-700 truncate">
                      {tx.category}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-black text-slate-900 tabular-nums">
                      ฿{Number(tx.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">
                      {tx.paymentMethod || "Cash"}
                    </div>
                  </div>
                </div>

                <p className="text-xs font-medium text-slate-700 leading-relaxed">
                  {tx.description}
                </p>

                {(tx.vendorName || tx.invoiceNo || tx.vehiclePlate) && (
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-bold text-slate-500">
                    {tx.vendorName && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        ร้าน: {tx.vendorName}
                      </span>
                    )}
                    {tx.invoiceNo && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        บิล: {tx.invoiceNo}
                      </span>
                    )}
                    {tx.vehiclePlate && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200/70">
                        <Car size={10} /> {tx.vehiclePlate}
                      </span>
                    )}
                  </div>
                )}

                {isRejected && tx.rejectReason && (
                  <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
                    <span className="font-black">เหตุผลที่ตีกลับ:</span> {tx.rejectReason}
                  </div>
                )}

                {/* Photos Strip */}
                {allPhotos.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
                    {allPhotos.map((item, idx) => (
                      <button
                        key={`${item.url}-${idx}`}
                        type="button"
                        onClick={() => setLightboxUrl(item.url)}
                        className="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-200 shrink-0 group cursor-pointer"
                      >
                        {item.url.toLowerCase().includes(".pdf") ? (
                          <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center text-slate-600">
                            <FileText size={18} />
                            <span className="text-[9px] font-bold">PDF</span>
                          </div>
                        ) : (
                          <img
                            src={item.url}
                            alt="Receipt"
                            className="w-full h-full object-cover"
                          />
                        )}
                        <span
                          className={`absolute bottom-0 inset-x-0 text-[8px] font-black text-center text-white py-0.2 ${
                            item.kind === "slip" ? "bg-sky-600/85" : "bg-slate-900/75"
                          }`}
                        >
                          {item.kind === "slip" ? "สลิป" : "ใบเสร็จ"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Action Footer for PENDING or REJECTED */}
                {(isPending || isRejected) && (
                  <div className="pt-1 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => openEditExpenseSheet(tx)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold transition-all active:scale-95 cursor-pointer ${
                        isRejected
                          ? "bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
                          : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200"
                      }`}
                    >
                      {isRejected ? <RotateCcw size={13} /> : <Edit3 size={13} />}
                      <span>
                        {isRejected ? "แก้ไข / ถ่ายรูปส่งเบิกใหม่" : "แนบเอกสารเพิ่ม / แก้ไข"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ============ Capture / Edit Full-Screen Mobile Modal ============ */}
      {isSheetOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[94vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 duration-200">
            {/* Sheet Header */}
            <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  {editingTx
                    ? editingTx.status === "REJECTED"
                      ? `แก้ไขและส่งเบิกใหม่ (${editingTx.txNumber || ""})`
                      : `แนบรูป / แก้ไข (${editingTx.txNumber || ""})`
                    : "ถ่ายใบเสร็จเบิกเงินสดย่อย"}
                </h3>
                <p className="text-[11px] font-medium text-slate-500">
                  ผู้เบิก: {activeHolderName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSheetOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {editingTx?.status === "REJECTED" && editingTx.rejectReason && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                  <span className="font-black">เหตุผลที่ถูกตีกลับ:</span> {editingTx.rejectReason}
                </div>
              )}

              {/* Section 1: Receipt & Document Photos */}
              <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/40 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-slate-800">
                    🧾 รูปใบเสร็จ / ใบกำกับภาษี ({receiptUrls.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleRunAiOcr}
                    disabled={isRunningOcr || (receiptUrls.length === 0 && !lastReceiptBase64Ref.current)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-45 text-white text-[11px] font-black shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    {isRunningOcr ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    <span>{isRunningOcr ? "AI กำลังอ่าน..." : "AI อ่านบิลอัตโนมัติ"}</span>
                  </button>
                </div>

                {/* Hidden File Inputs */}
                <input
                  ref={receiptCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    uploadAttachments(e.target.files, "receipts");
                    e.target.value = "";
                  }}
                />
                <input
                  ref={receiptGalleryInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    uploadAttachments(e.target.files, "receipts");
                    e.target.value = "";
                  }}
                />

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isUploadingReceipt}
                    onClick={() => receiptCameraInputRef.current?.click()}
                    className="py-3 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 cursor-pointer disabled:opacity-60"
                  >
                    {isUploadingReceipt ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Camera size={15} />
                    )}
                    <span>ถ่ายรูปใบเสร็จ</span>
                  </button>
                  <button
                    type="button"
                    disabled={isUploadingReceipt}
                    onClick={() => receiptGalleryInputRef.current?.click()}
                    className="py-3 px-3 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-extrabold text-xs flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer disabled:opacity-60"
                  >
                    <ImagePlus size={15} className="text-indigo-600" />
                    <span>เลือกจากอัลบั้ม</span>
                  </button>
                </div>

                {receiptUrls.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-0.5 hide-scrollbar">
                    {receiptUrls.map((url, idx) => (
                      <div key={`${url}-${idx}`} className="relative w-16 h-16 shrink-0">
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(url)}
                          className="w-full h-full rounded-xl overflow-hidden border border-slate-200 block cursor-pointer"
                        >
                          <img src={url} alt="Receipt" className="w-full h-full object-cover" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setReceiptUrls((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-sm cursor-pointer"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: Optional Transfer Slip */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-700">
                    📲 สลิปโอนเงิน (ถ้ามี) ({slipUrls.length})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isUploadingSlip}
                      onClick={() => slipCameraInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 flex items-center gap-1 cursor-pointer active:scale-95"
                    >
                      {isUploadingSlip ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                      <span>ถ่ายสลิป</span>
                    </button>
                    <button
                      type="button"
                      disabled={isUploadingSlip}
                      onClick={() => slipGalleryInputRef.current?.click()}
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-bold text-slate-700 flex items-center gap-1 cursor-pointer active:scale-95"
                    >
                      <Plus size={12} />
                      <span>รูปสลิป</span>
                    </button>
                  </div>
                </div>
                <input
                  ref={slipCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    uploadAttachments(e.target.files, "slips");
                    e.target.value = "";
                  }}
                />
                <input
                  ref={slipGalleryInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    uploadAttachments(e.target.files, "slips");
                    e.target.value = "";
                  }}
                />
                {slipUrls.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pt-1 hide-scrollbar">
                    {slipUrls.map((url, idx) => (
                      <div key={`${url}-${idx}`} className="relative w-14 h-14 shrink-0">
                        <button
                          type="button"
                          onClick={() => setLightboxUrl(url)}
                          className="w-full h-full rounded-xl overflow-hidden border border-slate-200 block cursor-pointer"
                        >
                          <img src={url} alt="Slip" className="w-full h-full object-cover" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSlipUrls((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-sm cursor-pointer"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 3: Expense Form Fields */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    จำนวนเงินที่จ่าย (บาท) *
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-300 text-xl font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    หมวดหมู่ค่าใช้จ่าย *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    {category && !categories.includes(category) && (
                      <option value={category}>{category}</option>
                    )}
                  </select>
                </div>

                {showPlateField && (
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      ทะเบียนรถ (ค่าน้ำมัน / ซ่อมบำรุง)
                    </label>
                    {!customPlateMode && vehiclePlates.length > 0 ? (
                      <div className="flex gap-2">
                        <select
                          value={vehiclePlate}
                          onChange={(e) => {
                            if (e.target.value === "__CUSTOM__") {
                              setCustomPlateMode(true);
                              setVehiclePlate("");
                            } else {
                              setVehiclePlate(e.target.value);
                            }
                          }}
                          className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800"
                        >
                          <option value="">-- ไม่ระบุทะเบียน --</option>
                          {vehiclePlates.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                          <option value="__CUSTOM__">+ กรอกทะเบียนอื่น</option>
                        </select>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="เช่น 1ขต 2911 กทม"
                          value={vehiclePlate}
                          onChange={(e) => setVehiclePlate(e.target.value)}
                          className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-bold"
                        />
                        {vehiclePlates.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setCustomPlateMode(false)}
                            className="px-3 py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-600 cursor-pointer"
                          >
                            เลือกจากรายการ
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    รายละเอียดค่าใช้จ่าย *
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น เติมน้ำมันรถส่งผ้า, ซื้อน้ำยาซักผ้า"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    วิธีชำระเงิน
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: "Cash", label: "💵 เงินสด" },
                        { id: "Transfer", label: "🏦 โอนเงิน" },
                        { id: "QR", label: "📱 สแกน QR" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMethod(m.id)}
                        className={`py-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          paymentMethod === m.id
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                            : "bg-white text-slate-600 border-slate-200"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      ชื่อร้านค้า / ผู้รับเงิน
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น ปตท., 7-Eleven"
                      value={vendorName}
                      onChange={(e) => setVendorName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">
                      เลขที่บิล / ใบเสร็จ
                    </label>
                    <input
                      type="text"
                      placeholder="ถ้ามี"
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">
                    วันที่ตามใบเสร็จ
                  </label>
                  <input
                    type="date"
                    value={transactionDate}
                    onChange={(e) => setTransactionDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Sheet Footer */}
            <div className="p-4 border-t border-slate-200 bg-white flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsSheetOpen(false)}
                className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSubmitting || isUploadingReceipt || isUploadingSlip}
                onClick={handleSubmitExpense}
                className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>
                  {editingTx
                    ? editingTx.status === "REJECTED"
                      ? "ส่งเบิกใหม่อีกครั้ง"
                      : "บันทึกการแก้ไข"
                    : "ส่งเบิกเงินสดย่อย"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/15 text-white cursor-pointer"
          >
            <X size={22} />
          </button>
          <div className="max-w-full max-h-[88vh] flex items-center justify-center">
            {lightboxUrl.toLowerCase().includes(".pdf") ? (
              <a
                href={lightboxUrl}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-3 rounded-xl bg-white text-slate-900 font-bold text-sm flex items-center gap-2"
              >
                <ZoomIn size={18} />
                <span>เปิดไฟล์ PDF</span>
              </a>
            ) : (
              <img
                src={lightboxUrl}
                alt="Document preview"
                className="max-w-full max-h-[85vh] object-contain rounded-xl"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
