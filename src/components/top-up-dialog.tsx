/* eslint-disable */
"use client";

import { useState, useMemo, useEffect, useSyncExternalStore } from "react";
import { Search, Wallet, Package, Banknote, CreditCard, QrCode, CheckCircle2, X, Plus, Minus, Crown, Star } from "lucide-react";
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

const PAYMENT_CHANNELS = ["Transfer", "Cash / COD", "QR Code", "Credit Card"];

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
  const [isProcessing, setIsProcessing] = useState(false);

  // Receipt state
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptJobId, setReceiptJobId] = useState<string | null>(null);
  const [receiptData, setReceiptData] = useState<any>(null);

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
      setCustomerSearch("");
      setIsProcessing(false);
      setShowReceipt(false);
      setReceiptJobId(null);
      setReceiptData(null);
    }
  }, [open, preselectedCustomer]);

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

      // Update customer wallet
      const currentBalance = selectedCustomer.creditBalance || 0;
      const newBalance = currentBalance + cartTotal;
      const walletUpdates: Partial<Customer> = { creditBalance: newBalance };

      if (!selectedCustomer.isMember) {
        walletUpdates.isMember = true;
        const memberList = priceLists.find(p => p.name.toLowerCase().includes("member"));
        if (memberList) walletUpdates.priceListId = memberList.id;
        toast.success(`${selectedCustomer.name} has been upgraded to Member! 🎉`);
      }

      await customerStore.updateCustomer(selectedCustomer.id, walletUpdates);

      toast.success(`Top Up ฿${formatCurrency(cartTotal)} — Wallet: ฿${formatCurrency(newBalance)}`);

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
        total: cartTotal,
        grandTotal: cartTotal,
        discount: 0,
        fee: 0,
        deliveryFee: 0,
        expressSurcharge: 0,
        vatAmount: 0,
        vatType: "none",
        vatRate: 0,
        paymentChannel,
        isPaid: true,
        proformaId: undefined,
        proformaRevision: 0,
        adminNotesJson: null,
        deliveryScheduledAt: null,
        serviceSpeed: "standard",
      };

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
                              <p className="text-sm font-semibold text-slate-800">{svc.nameEn || svc.name}</p>
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
                                <p className="text-xs text-slate-500">฿{formatCurrency(svc.price)}</p>
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
                    <div className="pt-2 border-t border-slate-200 flex justify-between">
                      <span className="text-xs font-bold text-slate-700">Total</span>
                      <span className="text-sm font-bold text-emerald-600">฿{formatCurrency(cartTotal)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Payment ── */}
            {step === "payment" && (
              <div className="space-y-4">
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
                  <div className="pt-2 border-t border-emerald-200 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-700">Top Up Amount</span>
                    <span className="text-lg font-black text-emerald-600">฿{formatCurrency(cartTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>New wallet balance</span>
                    <span className="font-semibold text-indigo-600">
                      ฿{formatCurrency((selectedCustomer?.creditBalance || 0) + cartTotal)}
                    </span>
                  </div>
                </div>

                {/* Payment channel */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Payment Channel</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_CHANNELS.map(ch => (
                      <button
                        key={ch}
                        onClick={() => setPaymentChannel(ch)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                          paymentChannel === ch
                            ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        {ch === "Cash / COD" ? <Banknote size={13} /> : ch === "QR Code" ? <QrCode size={13} /> : <CreditCard size={13} />}
                        {ch}
                      </button>
                    ))}
                  </div>
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
                  className="flex-1 h-9 text-sm bg-emerald-500 hover:bg-emerald-600 text-white"
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
                  className="flex-1 h-9 text-sm bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                  disabled={isProcessing || !paymentChannel}
                  onClick={handlePay}
                >
                  {isProcessing ? "Processing…" : `Confirm & Pay ฿${formatCurrency(cartTotal)}`}
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
