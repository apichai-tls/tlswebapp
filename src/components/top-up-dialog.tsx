/* eslint-disable */
"use client";

import { useState, useMemo, useEffect, useSyncExternalStore, useRef } from "react";
import { Search, Wallet, Package, Banknote, CreditCard, QrCode, Globe, CheckCircle2, X, Plus, Minus, Crown, Star, UploadCloud, Loader2, Image as ImageIcon, Trash2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  customerStore,
  serviceStore,
  priceListStore,
  shopStore,
  settingsStore,
  type Customer,
  type ServiceItem,
} from "@/lib/store";
import { useAuth } from "@/providers/auth-provider";
import { useCustomers } from "@/lib/use-customers";
import { TOPUP_SEQ_KEY, generateTopUpReceiptNumber } from "@/lib/utils";
import { A5ReceiptDialog } from "@/components/a5-receipt-dialog";
import { createTopUpTransactionAction, getCustomerTodayTopUpAction } from "@/actions/db";


// ─── Types ────────────────────────────────────────────────────────────────────

interface CartItem {
  service: ServiceItem;
  quantity: number;
  customPrice?: number; // for custom-priced packages
}

interface TopUpDialogProps {
  open: boolean;
  onClose: () => void;
  preselectedCustomer?: Customer | null;
  onSuccess?: (jobId: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_CHANNELS = [
  { id: "Transfer", label: "Transfer", icon: Banknote },
  { id: "Cash / COD", label: "Cash / COD", icon: Banknote },
  { id: "QR Code", label: "QR Code", icon: QrCode },
  { id: "Credit Card", label: "Credit Card", icon: CreditCard },
  { id: "Gateway", label: "Payment Gateway", icon: Globe },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function compressImage(file: File, maxWidth = 1600, maxHeight = 1600, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      return resolve(file);
    }
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);
          const compressedFile = new File([blob], file.name, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => resolve(file);
  });
}


// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getTierBadge(customer: Customer) {
  if (customer.isVIP) return { label: "VIP", className: "bg-amber-100 text-amber-700 border-amber-200" };
  if (customer.isMember) return { label: "Member", className: "bg-indigo-100 text-indigo-700 border-indigo-200" };
  return { label: "Standard", className: "bg-slate-100 text-slate-600 border-slate-200" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TopUpDialog({ open, onClose, preselectedCustomer, onSuccess }: TopUpDialogProps) {
  const { user } = useAuth();
  const customers = useCustomers();
  const services = useSyncExternalStore(serviceStore.subscribe, serviceStore.getSnapshot, serviceStore.getSnapshot);
  const priceLists = useSyncExternalStore(priceListStore.subscribe, priceListStore.getSnapshot, priceListStore.getSnapshot);
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<"customer" | "package" | "payment">("customer");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({}); // serviceId → input value
  const [paymentChannel, setPaymentChannel] = useState("Transfer");
  const [slipImageUrl, setSlipImageUrl] = useState<string | null>(null);
  const [isUploadingSlip, setIsUploadingSlip] = useState(false);
  const [slipUploadProgress, setSlipUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const slipInputRef = useRef<HTMLInputElement>(null);

  // Receipt state
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptJobId, setReceiptJobId] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<any>(null);

  // Duplicate top-up check for same day
  const [todayTopUpInfo, setTodayTopUpInfo] = useState<{
    id: string;
    amount: number;
    bonusAmount: number;
    totalCredit: number;
    balanceBefore?: number;
    balanceAfter?: number;
    paymentChannel?: string;
    packageName?: string;
    createdBy: string;
    createdAt: string;
  } | null>(null);
  const [isCheckingTodayTopUp, setIsCheckingTodayTopUp] = useState(false);
  const [confirmDuplicateTopUp, setConfirmDuplicateTopUp] = useState(false);

  useEffect(() => {
    if (!selectedCustomer) {
      setTodayTopUpInfo(null);
      setConfirmDuplicateTopUp(false);
      return;
    }

    let isMounted = true;
    setIsCheckingTodayTopUp(true);
    getCustomerTodayTopUpAction(selectedCustomer.id)
      .then(info => {
        if (isMounted) {
          setTodayTopUpInfo(info);
          setConfirmDuplicateTopUp(false);
        }
      })
      .catch(err => console.error("Failed to check today's topup:", err))
      .finally(() => {
        if (isMounted) setIsCheckingTodayTopUp(false);
      });

    return () => { isMounted = false; };
  }, [selectedCustomer?.id]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const packageServices = useMemo(() =>
    services.filter(s => s.category === "PACKAGE" && s.isActive !== false),
    [services]
  );

  const activeShop = useMemo(() => shops[0] || null, [shops]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 30);
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    ).slice(0, 20);
  }, [customers, customerSearch]);

  const cartTotal = useMemo(() =>
    cart.reduce((sum, item) => sum + (item.customPrice ?? item.service.price) * item.quantity, 0),
    [cart]
  );

  const bonusTotal = useMemo(() =>
    cart.reduce((sum, item) => {
      if (item.customPrice !== undefined) return sum;
      const bonusPerItem = Math.max(0, (item.service.memberPrice || item.service.price) - item.service.price);
      return sum + bonusPerItem * item.quantity;
    }, 0),
    [cart]
  );

  const totalCreditReceived = useMemo(() => cartTotal + bonusTotal, [cartTotal, bonusTotal]);

  const cartIsEmpty = cart.length === 0;

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      if (preselectedCustomer) {
        setSelectedCustomer(preselectedCustomer);
        setStep("package");
      } else {
        setStep("customer");
        setSelectedCustomer(null);
      }
      setCart([]);
      setCustomAmounts({});
      setPaymentChannel("Transfer");
      setSlipImageUrl(null);
      setIsUploadingSlip(false);
      setSlipUploadProgress(0);
      setCustomerSearch("");
      setIsProcessing(false);
      setShowReceipt(false);
      setReceiptJobId(null);
      setReceiptData(null);
    }
  }, [open, preselectedCustomer]);

  // ── Slip Upload Helper ─────────────────────────────────────────────────────
  const handleSlipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("ขนาดไฟล์ต้องไม่เกิน 10MB");
      return;
    }

    setIsUploadingSlip(true);
    setSlipUploadProgress(15);

    try {
      const compressedFile = await compressImage(file, 1600, 1600, 0.85);
      let finalUrl = "";
      const tempEntityId = selectedCustomer?.id ? `customer-${selectedCustomer.id}` : `topup-${Date.now()}`;

      try {
        const signRes = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityType: "job",
            entityId: tempEntityId,
            subType: "proofs",
            contentType: compressedFile.type,
          }),
        });

        if (!signRes.ok) throw new Error("Failed to get upload authorization");
        const { uploadUrl, publicUrl, filePath } = await signRes.json();
        setSlipUploadProgress(50);

        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": compressedFile.type },
          body: compressedFile,
        });

        if (!putRes.ok) throw new Error("Cloud upload failed");
        finalUrl = publicUrl || filePath;
      } catch (gcsErr: any) {
        console.warn("GCS Upload fallback to local:", gcsErr?.message);
        setSlipUploadProgress(60);

        const formData = new FormData();
        formData.append("file", compressedFile);
        formData.append("entityType", "job");
        formData.append("entityId", tempEntityId);
        formData.append("subType", "proofs");

        const localRes = await fetch("/api/upload-local", {
          method: "POST",
          body: formData,
        });

        if (!localRes.ok) {
          const errData = await localRes.json().catch(() => ({}));
          throw new Error(errData.error || "Upload failed");
        }

        const localData = await localRes.json();
        finalUrl = localData.publicUrl;
      }

      setSlipUploadProgress(100);
      setSlipImageUrl(finalUrl);
      toast.success("แนบหลักฐานการชำระเงินเรียบร้อยแล้ว");
    } catch (err: any) {
      console.error("Slip upload error:", err);
      toast.error(`อัปโหลดรูปไม่สำเร็จ: ${err?.message || "Unknown error"}`);
    } finally {
      setIsUploadingSlip(false);
      setSlipUploadProgress(0);
      if (slipInputRef.current) slipInputRef.current.value = "";
    }
  };

  // ── Cart helpers ───────────────────────────────────────────────────────────
  const addToCart = (service: ServiceItem, customPrice?: number) => {
    const price = customPrice ?? service.price;
    if (!price || price <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    setCart(prev => {
      const existing = prev.find(i => i.service.id === service.id && (customPrice === undefined || i.customPrice === customPrice));
      if (existing && customPrice === undefined) {
        // Increment quantity for fixed-price packages
        return prev.map(i => i.service.id === service.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { service, quantity: 1, customPrice }];
    });
    if (customPrice !== undefined) {
      setCustomAmounts(prev => ({ ...prev, [service.id]: "" }));
    }
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const updateQty = (index: number, delta: number) => {
    setCart(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newQty = item.quantity + delta;
      return newQty <= 0 ? null : { ...item, quantity: newQty };
    }).filter(Boolean) as CartItem[]);
  };

  // ── Payment ────────────────────────────────────────────────────────────────
  const handlePay = async () => {
    if (!selectedCustomer) { toast.error("Please select a customer"); return; }
    if (cartIsEmpty) { toast.error("Please add at least one package"); return; }
    if (!paymentChannel) { toast.error("Please select a payment channel"); return; }

    setIsProcessing(true);
    try {
      const itemsPayload = cart.map(item => ({
        name: item.service.name,
        nameEn: item.service.nameEn || item.service.name,
        quantity: item.quantity,
        price: item.customPrice ?? item.service.price,
        basePrice: item.service.price,
        serviceId: item.service.id,
        unit: item.service.unit || "pack",
      }));

      const now = new Date();

      // Sequential counter for Top-Up Receipt (Option C: No Job created)
      const systemSettings = settingsStore.getSnapshot();
      const currentSeq = parseInt(systemSettings?.[TOPUP_SEQ_KEY] || "0", 10);
      const nextSeq = currentSeq + 1;
      settingsStore.updateSetting(TOPUP_SEQ_KEY, String(nextSeq)).catch(() => {});

      const topUpReceiptNo = generateTopUpReceiptNumber(nextSeq, now);

      // Update customer wallet (Paid amount + Bonus credit)
      const currentBalance = selectedCustomer.creditBalance || 0;
      const newBalance = currentBalance + totalCreditReceived;
      const walletUpdates: Partial<Customer> = { creditBalance: newBalance };

      if (!selectedCustomer.isMember) {
        walletUpdates.isMember = true;
        const memberList = priceLists.find(p => p.name.toLowerCase().includes("member"));
        if (memberList) walletUpdates.priceListId = memberList.id;
        toast.success(`${selectedCustomer.name} has been upgraded to Member! 🎉`);
      }

      await customerStore.updateCustomer(selectedCustomer.id, walletUpdates);

      toast.success(
        bonusTotal > 0
          ? `Top Up ฿${formatCurrency(cartTotal)} (+฿${formatCurrency(bonusTotal)} Bonus) — Wallet: ฿${formatCurrency(newBalance)}`
          : `Top Up ฿${formatCurrency(cartTotal)} — Wallet: ฿${formatCurrency(newBalance)}`
      );

      // Build receipt data
      const rdata: any = {
        id: topUpReceiptNo,
        receiptNumber: topUpReceiptNo,
        isDraft: false,
        status: "completed",
        createdAt: now,
        customerName: selectedCustomer.name,
        customerPhone: selectedCustomer.phone || "-",
        items: itemsPayload.map(i => ({ name: i.name, quantity: i.quantity, price: i.price })),
        subtotal: cartTotal,
        total: cartTotal,
        discount: 0,
        deliveryFee: 0,
        expressSurcharge: 0,
        vatAmount: 0,
        vatType: "none",
        vatRate: 0,
        paymentChannel,
        slipImageUrl: slipImageUrl || null,
        isPaid: true,
        proformaId: undefined,
        adminNotesJson: null,
        deliveryScheduledAt: null,
        serviceSpeed: "standard",
      };

      const txDescription = JSON.stringify({
        packageName: cart.map(i => `${i.service.name} x${i.quantity}`).join(", "),
        paymentChannel,
        slipImageUrl: slipImageUrl || null,
        bonusAmount: bonusTotal,
        totalCredit: totalCreditReceived,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        createdBy: user?.name || user?.email || "Admin",
        receiptData: rdata,
      });

      createTopUpTransactionAction({
        id: topUpReceiptNo,
        memberId: selectedCustomer.id,
        amount: cartTotal,
        type: "TOPUP",
        description: txDescription,
        status: "COMPLETED",
        userId: user?.id || null,
        userName: user?.name || user?.email || "Admin",
      }).catch(err => console.error("Failed to save top-up transaction:", err));


      setReceiptData(rdata);
      setReceiptJobId(topUpReceiptNo);
      setShowReceipt(true);
      onSuccess?.(topUpReceiptNo);
    } catch (err: any) {
      console.error("[TopUpDialog] Pay failed:", err);
      toast.error("Top Up failed: " + (err?.message || "Unknown error"));
    } finally {
      setIsProcessing(false);
    }
  };


  // ── Render ─────────────────────────────────────────────────────────────────
  const tier = selectedCustomer ? getTierBadge(selectedCustomer) : null;

  return (
    <>
      <Dialog open={open && !showReceipt} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Header */}
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-slate-800">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
                <Wallet size={14} className="text-white" />
              </div>
              Top Up Member Wallet
            </DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-1 mt-2">
              {[
                { key: "customer", label: "Customer" },
                { key: "package", label: "Package" },
                { key: "payment", label: "Payment" },
              ].map((s, i) => (
                <div key={s.key} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all ${
                    step === s.key
                      ? "bg-emerald-500 text-white"
                      : (["customer","package","payment"].indexOf(step) > i ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400")
                  }`}>
                    <span>{i + 1}</span>
                    <span>{s.label}</span>
                  </div>
                  {i < 2 && <div className="w-3 h-px bg-slate-200" />}
                </div>
              ))}
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* ── Step 1: Customer ── */}
            {step === "customer" && (
              <div className="space-y-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    autoFocus
                    placeholder="Search by name, phone or email…"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    className="pl-8 text-sm h-9"
                  />
                </div>

                {filteredCustomers.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">No customers found</p>
                ) : (
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
                    {filteredCustomers.map(c => {
                      const tb = getTierBadge(c);
                      return (
                        <button
                          key={c.id}
                          onClick={() => { setSelectedCustomer(c); setStep("package"); }}
                          className="w-full flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 transition-all text-left group"
                        >
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 text-xs font-bold text-indigo-700">
                            {c.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                            <p className="text-[10px] text-slate-400">{c.phone || "-"}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className={`text-[9px] py-0 px-1.5 ${tb.className}`}>{tb.label}</Badge>
                            <span className="text-xs font-bold text-emerald-600">฿{formatCurrency(c.creditBalance || 0)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 2: Package ── */}
            {step === "package" && (
              <div className="space-y-4">
                {/* Selected Customer card */}
                {selectedCustomer && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-100">
                    <div className="w-9 h-9 rounded-full bg-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-700 shrink-0">
                      {selectedCustomer.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{selectedCustomer.name}</p>
                      <p className="text-[10px] text-slate-500">{selectedCustomer.phone || "-"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">Current Balance</p>
                      <p className="text-sm font-bold text-emerald-600">฿{formatCurrency(selectedCustomer.creditBalance || 0)}</p>
                    </div>
                    <button onClick={() => { setSelectedCustomer(null); setCart([]); setStep("customer"); }} className="text-slate-400 hover:text-slate-600">
                      <X size={14} />
                    </button>
                  </div>
                )}

                {/* Warning Banner if customer already topped up today */}
                {todayTopUpInfo && (
                  <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3.5 space-y-2.5 shadow-sm">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-amber-950 uppercase tracking-wide">
                          ⚠️ แจ้งเตือน: ลูกค้ารายนี้เพิ่งเติมเงินไปแล้วในวันนี้!
                        </p>
                        <p className="text-xs text-amber-900 mt-1 font-medium leading-relaxed">
                          ทำรายการเมื่อเวลา <strong className="font-bold text-amber-950">{format(new Date(todayTopUpInfo.createdAt), "HH:mm น.")}</strong> ยอดเงิน <strong className="font-bold text-amber-950">฿{Number(todayTopUpInfo.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> {todayTopUpInfo.bonusAmount > 0 ? `(+฿${Number(todayTopUpInfo.bonusAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} โบนัส)` : ""} (โดย {todayTopUpInfo.createdBy || "Staff"})
                        </p>
                        <p className="text-[11px] text-amber-800/90 mt-0.5">
                          กรุณาตรวจสอบสลิป/หลักฐาน เพื่อป้องกันการทำรายการซ้ำซ้อน
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-amber-200/80">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={confirmDuplicateTopUp}
                          onChange={(e) => setConfirmDuplicateTopUp(e.target.checked)}
                          className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-amber-950">
                          ยืนยันว่าลูกค้าต้องการเติมเงินเพิ่มอีกครั้งในวันนี้จริง
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Package catalog */}
                <div>

                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Select Package</p>
                  {packageServices.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-6">No packages available.<br />Add packages in Service Menu with category PACKAGE.</p>
                  ) : (
                    <div className="grid gap-2">
                      {packageServices.map(svc => {
                        const isCustom = !svc.price || svc.price <= 0;
                        const customAmt = customAmounts[svc.id] || "";
                        return (
                          <div key={svc.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/40 transition-all">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                              <Package size={14} className="text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-slate-800">{svc.nameEn || svc.name}</p>
                                {svc.memberPrice && svc.memberPrice > svc.price && (
                                  <Badge className="bg-emerald-100 text-emerald-800 border-none text-[10px] font-bold px-1.5 py-0">
                                    +฿{formatCurrency(svc.memberPrice - svc.price)} Bonus
                                  </Badge>
                                )}
                              </div>
                              {isCustom ? (
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className="text-[10px] text-slate-400">฿</span>
                                  <Input
                                    type="number"
                                    placeholder="Enter amount"
                                    value={customAmt}
                                    onChange={e => setCustomAmounts(prev => ({ ...prev, [svc.id]: e.target.value }))}
                                    className="h-6 text-xs w-28 py-0 px-2"
                                    min="1"
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                                  <span className="font-medium text-slate-700">Pay: ฿{formatCurrency(svc.price)}</span>
                                  {svc.memberPrice && svc.memberPrice > svc.price && (
                                    <span className="text-emerald-700 font-bold">
                                      (Credit: ฿{formatCurrency(svc.memberPrice)})
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-3 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all"
                              onClick={() => {
                                if (isCustom) {
                                  const amt = parseFloat(customAmt);
                                  if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
                                  addToCart(svc, amt);
                                } else {
                                  addToCart(svc);
                                }
                              }}
                            >
                              <Plus size={11} className="mr-1" /> Add
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Cart summary */}
                {cart.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Cart</p>
                    {cart.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <p className="flex-1 text-xs text-slate-700 truncate">
                          {item.service.nameEn || item.service.name}
                          {item.customPrice !== undefined && ` (Custom)`}
                        </p>
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateQty(idx, -1)} className="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center hover:bg-slate-200"><Minus size={9} /></button>
                          <span className="text-xs font-semibold w-4 text-center">{item.quantity}</span>
                          <button onClick={() => updateQty(idx, 1)} className="w-5 h-5 rounded-full border border-slate-300 flex items-center justify-center hover:bg-slate-200"><Plus size={9} /></button>
                        </div>
                        <span className="text-xs font-bold text-slate-700 w-20 text-right">
                          ฿{formatCurrency((item.customPrice ?? item.service.price) * item.quantity)}
                        </span>
                        <button onClick={() => removeFromCart(idx)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-slate-200 space-y-1">
                      <div className="flex justify-between text-xs text-slate-600">
                        <span>Amount to Pay</span>
                        <span className="font-bold text-slate-800">฿{formatCurrency(cartTotal)}</span>
                      </div>
                      {bonusTotal > 0 && (
                        <div className="flex justify-between text-xs text-emerald-600 font-semibold">
                          <span>Bonus Added</span>
                          <span>+ ฿{formatCurrency(bonusTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                        <span className="text-xs font-bold text-slate-700">Total Wallet Credit</span>
                        <span className="text-sm font-black text-emerald-600">฿{formatCurrency(totalCreditReceived)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Payment ── */}
            {step === "payment" && (
              <div className="space-y-4">
                {/* Warning Banner if customer already topped up today */}
                {todayTopUpInfo && (
                  <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3.5 space-y-2.5 shadow-sm">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-amber-950 uppercase tracking-wide">
                          ⚠️ แจ้งเตือน: ลูกค้ารายนี้เพิ่งเติมเงินไปแล้วในวันนี้!
                        </p>
                        <p className="text-xs text-amber-900 mt-1 font-medium leading-relaxed">
                          ทำรายการเมื่อเวลา <strong className="font-bold text-amber-950">{format(new Date(todayTopUpInfo.createdAt), "HH:mm น.")}</strong> ยอดเงิน <strong className="font-bold text-amber-950">฿{Number(todayTopUpInfo.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong> {todayTopUpInfo.bonusAmount > 0 ? `(+฿${Number(todayTopUpInfo.bonusAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })} โบนัส)` : ""} (โดย {todayTopUpInfo.createdBy || "Staff"})
                        </p>
                        <p className="text-[11px] text-amber-800/90 mt-0.5">
                          กรุณาตรวจสอบสลิป/หลักฐาน เพื่อป้องกันการทำรายการซ้ำซ้อน
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-amber-200/80">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={confirmDuplicateTopUp}
                          onChange={(e) => setConfirmDuplicateTopUp(e.target.checked)}
                          className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-amber-950">
                          ยืนยันว่าลูกค้าต้องการเติมเงินเพิ่มอีกครั้งในวันนี้จริง
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Summary card */}
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 space-y-2">
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Summary</p>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-600">Customer</span>
                    <span className="text-sm font-bold text-slate-800">{selectedCustomer?.name}</span>
                  </div>
                  {cart.map((item, i) => (
                    <div key={i} className="flex justify-between items-center">
                      <span className="text-xs text-slate-500 truncate flex-1">{item.service.nameEn || item.service.name} × {item.quantity}</span>
                      <span className="text-xs font-semibold text-slate-700">฿{formatCurrency((item.customPrice ?? item.service.price) * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-emerald-200 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-slate-700">Payment Due</span>
                      <span className="text-base font-bold text-slate-900">฿{formatCurrency(cartTotal)}</span>
                    </div>
                    {bonusTotal > 0 && (
                      <div className="flex justify-between items-center text-xs text-emerald-700 font-semibold">
                        <span>Free Bonus Credit</span>
                        <span>+ ฿{formatCurrency(bonusTotal)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1 border-t border-emerald-200/60">
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wide">Total Credit to Wallet</span>
                      <span className="text-lg font-black text-emerald-600">฿{formatCurrency(totalCreditReceived)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500 pt-1 border-t border-emerald-100">
                    <span>New wallet balance</span>
                    <span className="font-black text-indigo-700 text-sm">
                      ฿{formatCurrency((selectedCustomer?.creditBalance || 0) + totalCreditReceived)}
                    </span>
                  </div>
                </div>

                {/* Payment channel */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Payment Channel</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_CHANNELS.map((ch, idx) => {
                      const Icon = ch.icon;
                      const isSelected = paymentChannel === ch.id;
                      const isLastSingle = idx === PAYMENT_CHANNELS.length - 1 && PAYMENT_CHANNELS.length % 2 !== 0;
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() => setPaymentChannel(ch.id)}
                          className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                            isLastSingle ? "col-span-2 justify-center py-2.5" : ""
                          } ${
                            isSelected
                              ? "border-emerald-400 bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-400/30"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50/50"
                          }`}
                        >
                          <Icon size={14} className={isSelected ? "text-emerald-600" : "text-slate-400"} />
                          <span>{ch.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Payment Slip / Proof Upload */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                      <UploadCloud size={13} className="text-slate-400" />
                      Payment Slip / หลักฐานการจ่ายเงิน
                    </Label>
                    {slipImageUrl && (
                      <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                        <CheckCircle2 size={11} /> Attached
                      </span>
                    )}
                  </div>

                  {slipImageUrl ? (
                    <div className="relative group rounded-xl border border-emerald-200 bg-emerald-50/40 p-2.5 flex items-center gap-3">
                      <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0 shadow-sm">
                        <img src={slipImageUrl} alt="Slip" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">Payment Slip Attached</p>
                        <p className="text-[10px] text-slate-500 truncate">แนบหลักฐานการชำระเงินเรียบร้อยแล้ว</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSlipImageUrl(null)}
                        className="h-7 w-7 p-0 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full shrink-0"
                        title="Remove slip"
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="file"
                        ref={slipInputRef}
                        accept="image/*"
                        onChange={handleSlipUpload}
                        className="hidden"
                        id="topup-slip-file-input"
                        disabled={isUploadingSlip}
                      />
                      <label
                        htmlFor="topup-slip-file-input"
                        className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed text-xs font-medium cursor-pointer transition-all ${
                          isUploadingSlip
                            ? "border-slate-300 bg-slate-50 text-slate-400 cursor-not-allowed"
                            : "border-slate-300 bg-slate-50/60 hover:bg-emerald-50/50 hover:border-emerald-300 text-slate-600 hover:text-emerald-700"
                        }`}
                      >
                        {isUploadingSlip ? (
                          <div className="flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin text-emerald-600" />
                            <span>กำลังอัปโหลดสลิป ({slipUploadProgress}%)…</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <ImageIcon size={14} className="text-slate-400" />
                            <span>คลิกเพื่อแนบสลิป / Upload Slip Image (Optional)</span>
                          </div>
                        )}
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-slate-100 shrink-0 flex gap-2">
            {step === "customer" && (
              <Button variant="outline" className="flex-1 h-9 text-sm" onClick={onClose}>Cancel</Button>
            )}
            {step === "package" && (
              <>
                <Button variant="outline" className="h-9 text-sm px-4" onClick={() => {
                  if (!preselectedCustomer) { setStep("customer"); }
                  else onClose();
                }}>
                  Back
                </Button>
                <Button
                  className="flex-1 h-9 text-sm bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                  disabled={cartIsEmpty}
                  onClick={() => setStep("payment")}
                >
                  Continue → Payment
                </Button>
              </>
            )}
            {step === "payment" && (
              <>
                <Button variant="outline" className="h-9 text-sm px-4" onClick={() => setStep("package")}>Back</Button>
                <Button
                  className={`flex-1 h-9 text-sm text-white font-bold transition-all shadow-sm ${
                    todayTopUpInfo && !confirmDuplicateTopUp
                      ? "bg-amber-600 hover:bg-amber-700 opacity-90 cursor-not-allowed"
                      : "bg-emerald-500 hover:bg-emerald-600"
                  }`}
                  disabled={isProcessing || isUploadingSlip || !paymentChannel || (Boolean(todayTopUpInfo) && !confirmDuplicateTopUp)}
                  onClick={handlePay}
                  title={todayTopUpInfo && !confirmDuplicateTopUp ? "กรุณาติ๊กยืนยันการเติมเงินซ้ำในวันนี้" : undefined}
                >
                  {isProcessing
                    ? "Processing…"
                    : isUploadingSlip
                      ? "Uploading Slip…"
                      : todayTopUpInfo && !confirmDuplicateTopUp
                        ? "กรุณาติ๊กยืนยันการเติมเงินซ้ำ"
                        : `Confirm & Pay ฿${formatCurrency(cartTotal)}`}
                </Button>
              </>
            )}
          </div>

        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      {showReceipt && receiptData && (
        <A5ReceiptDialog
          open={showReceipt}
          onOpenChange={(v) => {
            if (!v) {
              setShowReceipt(false);
              onClose();
            }
          }}
          receiptData={receiptData}
          activeShop={activeShop as any}
          currentLanguage="en"
          onCloseComplete={() => {
            setShowReceipt(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
