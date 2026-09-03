"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Edit, UserPlus, MessageCircle, Crown, Users, Database, Wallet, SlidersHorizontal, Plus, Minus } from "lucide-react";
import { customerStore, priceListStore, poiStore, type Customer } from "@/lib/store";
import { useSyncExternalStore } from "react";
import { LocationInput } from "@/components/location-input";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { TopUpDialog } from "@/components/top-up-dialog";

export function AdminCustomerDialog({ 
  open, 
  onOpenChange, 
  customer, 
  onSaved,
  onTopUpCustomer
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  customer?: Customer | null;
  onSaved?: (c: Customer) => void;
  onTopUpCustomer?: (c: Customer) => void;
}) {
  const { user } = useAuth();
  const canAdjustBalance = user?.role === "admin" || user?.role === "accounting";
  const canTopUp = user?.role !== "rider";

  const [showTopUpDialog, setShowTopUpDialog] = useState(false);
  const [localTopUpCustomer, setLocalTopUpCustomer] = useState<Customer | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustMode, setAdjustMode] = useState<"add" | "deduct">("add");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);


  const priceLists = useSyncExternalStore(priceListStore.subscribe, priceListStore.getSnapshot, priceListStore.getSnapshot);
  const pois = useSyncExternalStore(poiStore.subscribe, poiStore.getSnapshot, poiStore.getSnapshot);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    const rawAmount = parseFloat(adjustAmount);
    if (isNaN(rawAmount) || rawAmount === 0) {
      toast.error("กรุณาระบุจำนวนเงินที่ต้องการปรับยอด");
      return;
    }
    if (!adjustReason.trim()) {
      toast.error("กรุณาระบุเหตุผลในการปรับยอดเงิน (Reason is required)");
      return;
    }

    const currentBalance = customer.creditBalance || 0;
    // If user explicitly typed a negative number, treat as deduction
    const delta = rawAmount < 0 
      ? rawAmount 
      : (adjustMode === "add" ? rawAmount : -rawAmount);
    const newBalance = Math.round((currentBalance + delta) * 100) / 100;
    const isAdd = delta >= 0;

    setAdjustLoading(true);
    try {
      await customerStore.updateCustomer(customer.id, {
        creditBalance: newBalance,
        adjustReason: adjustReason.trim() || undefined,
        reason: adjustReason.trim() || undefined,
        actorId: user?.id,
        actorName: user?.name || user?.email || "Admin",
        actorRole: user?.role
      } as any);

      toast.success(
        `${isAdd ? "เพิ่มยอดเงิน" : "หักยอดเงิน"} ฿${Math.abs(delta).toLocaleString(undefined, { minimumFractionDigits: 2 })} — ยอดคงเหลือใหม่: ฿${newBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
      );
      setAdjustOpen(false);
      setAdjustAmount("");
      setAdjustReason("");
      setAdjustMode("add");
    } catch (err: any) {
      toast.error(err?.message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setAdjustLoading(false);
    }
  };




  const localDataForSearch = useMemo(() => pois.map(p => ({ name: p.name, address: p.address, lat: p.coords.lat, lng: p.coords.lng, placeId: p.placeId || p.id, isLocal: true })), [pois]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState({ lat: 13.736717, lng: 100.523186 });
  const [priceListId, setPriceListId] = useState("regular");
  const [email, setEmail] = useState("");
  const [lineId, setLineId] = useState("");
  const [language, setLanguage] = useState("th");
  const [remark, setRemark] = useState("");
  const [secondaryAddress, setSecondaryAddress] = useState("");
  const [dob, setDob] = useState("");
  const [taxId, setTaxId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [isVIP, setIsVIP] = useState(false);
  const [isCorporate, setIsCorporate] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [memberStartDate, setMemberStartDate] = useState("");
  const [memberExpiryDate, setMemberExpiryDate] = useState("");
  const [isWhatsapp, setIsWhatsapp] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{name: string; address: string; lat: number; lng: number; placeId?: string; isLocal?: boolean} | null>(null);

  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 4) val = val.substring(0, 2) + "/" + val.substring(2, 4) + "/" + val.substring(4, 8);
    else if (val.length > 2) val = val.substring(0, 2) + "/" + val.substring(2, 4);
    setDob(val);
  };

  useEffect(() => {
    if (open) {
      if (customer) {
        setName(customer.name.toUpperCase()); setPhone(customer.phone); setAddress(customer.defaultAddress); setCoords(customer.defaultCoords);
        setPriceListId(customer.priceListId || "regular"); setEmail(customer.email || ""); setLineId(customer.lineId || "");
        setLanguage(customer.language || "th"); setRemark(customer.remark || ""); setSecondaryAddress(customer.secondaryAddress || "");
        setDob(customer.dob || ""); setTaxId(customer.taxId || ""); setCompanyName(customer.companyName || "");
        setIsVIP(customer.isVIP || false); setIsCorporate(customer.isCorporate || false); setIsMember(customer.isMember || false);
        setMemberId(customer.memberId || "");
        setMemberStartDate(customer.memberStartDate ? new Date(customer.memberStartDate).toISOString().split("T")[0] : "");
        setMemberExpiryDate(customer.memberExpiryDate ? new Date(customer.memberExpiryDate).toISOString().split("T")[0] : "");
        setIsWhatsapp(customer.isWhatsapp || false); setSelectedLocation(null);
      } else {
        setName(""); setPhone(""); setAddress(""); setCoords({ lat: 13.736717, lng: 100.523186 }); setPriceListId("regular");
        setEmail(""); setLineId(""); setLanguage("th"); setRemark(""); setSecondaryAddress(""); setDob(""); setTaxId(""); setCompanyName("");
        setIsVIP(false); setIsCorporate(false); setIsMember(false); setMemberId(""); setMemberStartDate(""); setMemberExpiryDate("");
        setIsWhatsapp(false); setSelectedLocation(null);
      }
    }
  }, [open, customer]);

  const handleSave = async () => {
    if (!name.trim() || !phone.trim() || !address.trim() || !secondaryAddress.trim()) { toast.error("Please fill in all required fields."); return; }
    let finalPriceListId = priceListId;
    if (isMember) { const ml = priceLists.find(p => p.name.toLowerCase().includes("member")); if (ml) finalPriceListId = ml.id; }
    else { const rl = priceLists.find(p => p.isDefault); if (rl) finalPriceListId = rl.id; }
    const customerData = {
      name, phone, defaultAddress: address, defaultCoords: coords, priceListId: finalPriceListId,
      email: email.trim() || null, lineId: lineId.trim() || null, language, remark: remark.trim() || null,
      secondaryAddress: secondaryAddress.trim() || null, dob: dob || null, taxId: taxId.trim() || null,
      companyName: companyName.trim() || null, isVIP, isMember, isWhatsapp,
      memberId: isMember ? memberId.trim() || null : null,
      memberStartDate: isMember && memberStartDate ? memberStartDate : null,
      memberExpiryDate: isMember && memberExpiryDate ? memberExpiryDate : null,
      updatedAt: customer ? customer.updatedAt : undefined,
    };
    try {
      if (customer) {
        await customerStore.updateCustomer(customer.id, customerData);
        toast.success(`Updated customer: ${name}`);
        if (onSaved) onSaved({ ...customer, ...customerData } as Customer);
      } else {
        const newCustomer = await customerStore.addCustomer(customerData);
        toast.success(`Added new customer: ${name}`);
        if (onSaved && newCustomer) onSaved(newCustomer);
      }
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message || "Failed to save customer"); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(newOpen, eventDetails) => { if (!newOpen && eventDetails?.reason === "outside-press") return; onOpenChange(newOpen); }} disablePointerDismissal={true}>
        <DialogContent className="sm:max-w-2xl p-6 bg-white overflow-y-auto max-h-[90vh] z-[60]">
          <DialogHeader className="mb-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              {customer ? <Edit className="text-indigo-500" size={24} /> : <UserPlus className="text-indigo-500" size={24} />}
              {customer ? "Edit Customer Profile" : "Register New Customer"}
            </DialogTitle>
            <DialogDescription>
              {customer ? "Update the customer's contact information and status." : "Add a new customer to the database for quicker order fulfillment."}
            </DialogDescription>
          </DialogHeader>

          {/* Wallet Balance — compact, shown only for Member customers */}
          {customer && isMember && (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
              <div className="flex items-center gap-2">
                <Wallet size={13} className="text-emerald-600" />
                <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Credit Wallet</span>
                <span className="text-sm font-black text-emerald-800">
                  ฿{(customer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {canTopUp && customer?.isMember && (
                  <Button type="button" variant="outline" size="sm"
                    className="h-7 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all gap-1 text-[10px] font-bold px-2 rounded-md"
                    onClick={() => {
                      if (customer) {
                        if (onTopUpCustomer) {
                          onOpenChange(false);
                          onTopUpCustomer(customer);
                        } else {
                          setLocalTopUpCustomer(customer);
                          onOpenChange(false);
                          setTimeout(() => setShowTopUpDialog(true), 150);
                        }
                      }
                    }}>

                    <Wallet size={10} />
                    Top Up
                  </Button>
                )}
                {canAdjustBalance && customer?.isMember && (
                  <Button type="button" variant="outline" size="sm"
                    className="h-7 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white transition-all gap-1 text-[10px] font-bold px-2 rounded-md"
                    onClick={() => { setAdjustAmount(""); setAdjustOpen(true); }}>
                    <SlidersHorizontal size={10} />
                    Adjust
                  </Button>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 py-1">
            <div className="space-y-1 col-span-2">
              <Label htmlFor="name" className="text-xs font-semibold text-rose-600">Full Name *</Label>
              <Input id="name" placeholder="JOHN DOE" value={name} onChange={e => setName(e.target.value.toUpperCase())} className="h-8 text-xs border-slate-200" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone" className="text-xs font-semibold text-rose-600">Phone Number *</Label>
              <PhoneInput value={phone} onChange={setPhone} className="h-8" />
              <label className="flex items-center gap-1.5 mt-1 cursor-pointer">
                <input type="checkbox" checked={isWhatsapp} onChange={e => setIsWhatsapp(e.target.checked)} className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500 h-3 w-3" />
                <span className="text-[10px] text-slate-500 font-medium flex items-center gap-1"><MessageCircle size={10} className="text-emerald-500" /> WhatsApp Available</span>
              </label>
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs font-semibold text-rose-600">Default Address *</Label>
              <div className="flex items-center gap-2 h-8">
                <LocationInput id="default-address" placeholder="Search or enter full address..." value={address} localData={localDataForSearch} onChange={setAddress}
                  onSelectLocation={(loc) => { setCoords({ lat: loc.lat, lng: loc.lng }); setSelectedLocation(loc); }} className="flex-1" />
                {selectedLocation && !selectedLocation.isLocal && (
                  <Button type="button" onClick={() => { poiStore.addPOI({ name: selectedLocation.name, address: selectedLocation.address || selectedLocation.name, coords: { lat: selectedLocation.lat, lng: selectedLocation.lng }, placeId: selectedLocation.placeId }); toast.success(`Saved location: ${selectedLocation.name}`); setSelectedLocation(prev => prev ? { ...prev, isLocal: true } : null); }}
                    variant="outline" className="h-8 px-3 whitespace-nowrap text-xs bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100" title="Save this Google Maps location to Database">
                    <Database size={14} className="mr-1.5" />Save to DB
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-rose-600">Floor/Room *</Label>
              <Input placeholder="e.g. 15th Floor, Room 1502" value={secondaryAddress} onChange={e => setSecondaryAddress(e.target.value)} className="h-8 text-xs border-slate-200" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Email Address</Label>
              <Input type="email" placeholder="customer@email.com" value={email} onChange={e => setEmail(e.target.value)} className="h-8 text-xs border-slate-200" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">LINE ID</Label>
              <Input placeholder="@lineid" value={lineId} onChange={e => setLineId(e.target.value)} className="h-8 text-xs border-slate-200" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Date of Birth</Label>
              <Input type="text" placeholder="DD/MM/YYYY" maxLength={10} value={dob} onChange={handleDobChange} className="h-8 text-xs border-slate-200" />
            </div>
            <div className="space-y-1 col-span-3">
              <Label className="text-xs font-semibold text-rose-600">Special Instructions / Remarks</Label>
              <Input placeholder="e.g. Allergic to softener, fold shirts" value={remark} onChange={e => setRemark(e.target.value)} className="h-8 text-xs border-rose-200 focus-visible:ring-rose-500" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Company Name</Label>
              <Input placeholder="For B2B Billing" value={companyName} onChange={e => setCompanyName(e.target.value)} className="h-8 text-xs border-slate-200" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Tax ID</Label>
              <Input placeholder="13-digit Tax ID" value={taxId} onChange={e => setTaxId(e.target.value)} className="h-8 text-xs border-slate-200" />
            </div>
            <div className="col-span-1 md:col-span-3 mt-2 flex flex-col gap-2">
              <div className="flex flex-col gap-2 p-3 bg-blue-50/80 rounded-lg border border-blue-200">
                <label className="flex items-center gap-3 cursor-pointer hover:bg-blue-50/20 transition-colors">
                  <input type="checkbox" checked={isMember} onChange={e => { setIsMember(e.target.checked); if (!e.target.checked) setMemberId(""); }} className="h-5 w-5 rounded border-blue-300 text-blue-600 focus:ring-blue-600 bg-white" />
                  <div>
                    <p className="text-sm font-bold text-blue-800 flex items-center gap-1.5"><Users size={16} className="text-blue-600" /> Member</p>
                    <p className="text-xs text-blue-600/80">Apply member pricing list automatically and assign a Member No.</p>
                  </div>
                </label>
                {isMember && (
                  <div className="mt-2 pl-8 space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="memberId" className="text-[10px] font-semibold text-blue-800">Member No (Optional)</Label>
                      <Input id="memberId" placeholder="e.g. MB-001" value={memberId} onChange={e => setMemberId(e.target.value.toUpperCase())} className="h-8 text-xs border-blue-200 focus-visible:ring-blue-500 bg-white text-blue-800" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="memberStartDate" className="text-[10px] font-semibold text-blue-800">Member Start Date</Label>
                        <Input id="memberStartDate" type="date" value={memberStartDate} onChange={e => setMemberStartDate(e.target.value)} className="h-8 text-xs border-blue-200 focus-visible:ring-blue-500 bg-white text-blue-800" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="memberExpiryDate" className="text-[10px] font-semibold text-blue-800">Member Expiry Date</Label>
                        <Input id="memberExpiryDate" type="date" value={memberExpiryDate} onChange={e => setMemberExpiryDate(e.target.value)} className="h-8 text-xs border-blue-200 focus-visible:ring-blue-500 bg-white text-blue-800" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-3 p-3 bg-indigo-50/80 rounded-lg border border-indigo-200 cursor-pointer hover:bg-indigo-50 transition-colors">
                <input type="checkbox" checked={isVIP} onChange={e => setIsVIP(e.target.checked)} className="h-5 w-5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-600 bg-white" />
                <div>
                  <p className="text-sm font-bold text-indigo-800 flex items-center gap-1.5"><Crown size={16} className="text-indigo-600" /> VIP Customer</p>
                  <p className="text-xs text-indigo-600/80">Enable special delivery rates (฿4/km) and apply VIP pricing list</p>
                </div>
              </label>
            </div>
          </div>

          <DialogFooter className="mt-6 border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="h-10">Cancel</Button>
            <Button onClick={handleSave} className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
              {customer ? "Save Changes" : "Register Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Balance Dialog — Admin & Accounting only */}
      {customer && canAdjustBalance && (
        <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
          <DialogContent className="sm:max-w-md p-0 bg-white overflow-hidden rounded-2xl border-none shadow-2xl z-[70]">
            <form onSubmit={handleAdjustSubmit}>
              <DialogHeader className="p-6 pb-4 bg-amber-50 border-b border-amber-100">
                <DialogTitle className="flex items-center gap-2 text-xl font-bold text-amber-950">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><SlidersHorizontal size={24} /></div>
                  Adjust Balance (Manual)
                </DialogTitle>
                <DialogDescription className="text-amber-800/80 mt-1">
                  ปรับยอด Wallet โดยตรงสำหรับ <strong>{customer.name}</strong> — ใช้สำหรับ Update ยอดจากระบบเก่า
                </DialogDescription>
              </DialogHeader>
              <div className="p-6 space-y-5">
                {/* Current Balance */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Balance</span>
                  <span className="text-2xl font-black text-slate-900">฿{(customer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>

                {/* Adjustment Mode (+ / - Buttons) */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Adjustment Action</Label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setAdjustMode("add")}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        adjustMode === "add"
                          ? "bg-emerald-500 text-white shadow-md shadow-emerald-200"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Plus size={15} />
                      <span>เพิ่มเงิน (+ Add)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustMode("deduct")}
                      className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        adjustMode === "deduct"
                          ? "bg-rose-500 text-white shadow-md shadow-rose-200"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Minus size={15} />
                      <span>หักเงิน (- Deduct)</span>
                    </button>
                  </div>
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Amount (฿)</Label>
                  <div className="relative">
                    <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-black text-lg ${
                      (adjustAmount.startsWith("-") || adjustMode === "deduct") ? "text-rose-600" : "text-emerald-600"
                    }`}>
                      {(adjustAmount.startsWith("-") || adjustMode === "deduct") ? "-" : "+"} ฿
                    </span>
                    <Input 
                      type="number" 
                      step="any"
                      required 
                      autoFocus 
                      placeholder="e.g. 500 หรือ -500" 
                      value={adjustAmount} 
                      onChange={e => {
                        const val = e.target.value;
                        setAdjustAmount(val);
                        if (val.startsWith("-")) {
                          setAdjustMode("deduct");
                        } else if (val.startsWith("+")) {
                          setAdjustMode("add");
                        }
                      }} 
                      className={`h-14 pl-14 border-slate-200 text-xl font-bold rounded-xl bg-white ${
                        (adjustAmount.startsWith("-") || adjustMode === "deduct") 
                          ? "focus-visible:ring-rose-500 text-rose-950" 
                          : "focus-visible:ring-emerald-500 text-emerald-950"
                      }`} 
                    />
                  </div>
                </div>

                {/* Adjustment Reason Input */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center justify-between">
                    <span>เหตุผลในการปรับยอด (Reason) <span className="text-rose-500 font-bold">*</span></span>
                    <span className="text-[10px] text-rose-500 font-medium">บังคับระบุ (Required)</span>
                  </Label>
                  <Input 
                    type="text"
                    required
                    placeholder="e.g. ยกยอดจากระบบเดิม, ชดเชยผ้าเสียหาย, ปรับปรุงยอดผิดพลาด"
                    value={adjustReason}
                    onChange={e => setAdjustReason(e.target.value)}
                    className={`h-11 border text-xs rounded-xl bg-white text-slate-800 placeholder:text-slate-400 ${
                      !adjustReason.trim() && adjustAmount ? 'border-amber-400 focus:border-amber-500' : 'border-slate-200'
                    }`}
                  />
                  {!adjustReason.trim() && adjustAmount && (
                    <p className="text-[10px] text-amber-600 font-medium">* จำเป็นต้องใส่เหตุผลเพื่อบันทึกประวัติ (Log)</p>
                  )}
                </div>

                {/* Live Preview Box */}
                {(() => {
                  const raw = parseFloat(adjustAmount);
                  const valid = !isNaN(raw) && raw !== 0;
                  const delta = valid ? (raw < 0 ? raw : (adjustMode === "add" ? raw : -raw)) : 0;
                  const cur = customer.creditBalance || 0;
                  const projected = Math.round((cur + delta) * 100) / 100;
                  const isAdd = delta >= 0;
                  return (
                    <div className={`p-3.5 rounded-xl border transition-all ${
                      isAdd ? "bg-emerald-50/60 border-emerald-200 text-emerald-900" : "bg-rose-50/60 border-rose-200 text-rose-900"
                    }`}>
                      <div className="flex justify-between items-center text-xs font-semibold">
                        <span>ยอดหลังปรับปรุง (New Balance):</span>
                        <span className={`text-base font-black ${projected < 0 ? "text-rose-600" : ""}`}>
                          ฿{projected.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <DialogFooter className="p-6 pt-4 bg-white border-t border-slate-100">
                <Button type="button" variant="ghost" onClick={() => setAdjustOpen(false)} disabled={adjustLoading} className="h-12 rounded-xl font-semibold px-6">Cancel</Button>
                {(() => {
                  const raw = parseFloat(adjustAmount);
                  const valid = !isNaN(raw) && raw !== 0;
                  const delta = valid ? (raw < 0 ? raw : (adjustMode === "add" ? raw : -raw)) : 0;
                  const isAdd = delta >= 0;
                  return (
                    <Button 
                      type="submit" 
                      disabled={adjustLoading || !valid || !adjustReason.trim()} 
                      className={`h-12 text-white font-bold rounded-xl px-8 shadow-lg transition-all ${
                        isAdd
                          ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100"
                          : "bg-rose-600 hover:bg-rose-700 shadow-rose-100"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {adjustLoading
                        ? "Saving..."
                        : isAdd
                          ? `Confirm Add +฿${Math.abs(delta).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : `Confirm Deduct -฿${Math.abs(delta).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                    </Button>
                  );
                })()}
              </DialogFooter>

            </form>
          </DialogContent>
        </Dialog>

      )}

      {/* Top Up Dialog — opens after Edit Profile closes to avoid z-index conflict */}
      {showTopUpDialog && (localTopUpCustomer || customer) && (
        <TopUpDialog
          open={showTopUpDialog}
          onClose={() => {
            setShowTopUpDialog(false);
            setLocalTopUpCustomer(null);
          }}
          preselectedCustomer={localTopUpCustomer || customer}
        />
      )}
    </>
  );
}

