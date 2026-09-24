"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  Edit, UserPlus, MessageCircle, Crown, Users, Database, Wallet, SlidersHorizontal, 
  Plus, Minus, Building, MapPin, Globe, Shield, Calendar, X, Check 
} from "lucide-react";
import { customerStore, priceListStore, poiStore, walletApprovalStore, type Customer } from "@/lib/store";
import { useSyncExternalStore } from "react";
import { LocationInput } from "@/components/location-input";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { TopUpDialog } from "@/components/top-up-dialog";
import { addCustomerAddressAction } from "@/actions/db";

const BANGKOK_DISTRICTS = [
  "Watthana (Thonglor, Ekkamai, Phrom Phong)",
  "Khlong Toei",
  "Bang Rak",
  "Sathorn",
  "Pathum Wan",
  "Phra Khanong",
  "Ratchathewi",
  "Phaya Thai",
  "Chatuchak",
  "Huai Khwang",
  "Bang Na",
  "Yan Nawa",
  "Bang Kapi",
  "Din Daeng",
  "Other / อื่นๆ"
];

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
  const canAdjustBalance = Boolean(user?.permissions?.includes("adjust-wallet") || user?.role === "admin");
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
  const pendingWalletMap = useSyncExternalStore(walletApprovalStore.subscribe, walletApprovalStore.getSnapshot, walletApprovalStore.getSnapshot);
  const pendingCount = customer?.id ? (pendingWalletMap.byCustomer[customer.id] || 0) : 0;

  // Form Fields
  const [name, setName] = useState("");
  const [nickName, setNickName] = useState("");
  const [gender, setGender] = useState("Rather not say");
  const [dob, setDob] = useState("");
  const [customerTier, setCustomerTier] = useState<"member" | "vip" | "standard">("member");

  // Dual Phones & Channels
  const [phone, setPhone] = useState("");
  const [isWhatsapp, setIsWhatsapp] = useState(true);
  const [secondaryPhone, setSecondaryPhone] = useState("");
  const [intlCountryCode, setIntlCountryCode] = useState("+1");
  const [isSecondaryWhatsapp, setIsSecondaryWhatsapp] = useState(false);
  const [lineId, setLineId] = useState("");
  const [email, setEmail] = useState("");
  const [initialPin, setInitialPin] = useState("");

  // Delivery Location
  const [addressLabel, setAddressLabel] = useState("Home Condo");
  const [address, setAddress] = useState("");
  const [roomNo, setRoomNo] = useState("");
  const [district, setDistrict] = useState("Watthana (Thonglor, Ekkamai, Phrom Phong)");
  const [leaveWithJuristic, setLeaveWithJuristic] = useState(true);
  const [coords, setCoords] = useState({ lat: 13.736717, lng: 100.523186 });
  const [selectedLocation, setSelectedLocation] = useState<{name: string; address: string; lat: number; lng: number; placeId?: string; isLocal?: boolean} | null>(null);

  // Company Tax Details
  const [requiresTaxInvoice, setRequiresTaxInvoice] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [taxBranch, setTaxBranch] = useState("Head Office (สำนักงานใหญ่)");
  const [taxBillingAddress, setTaxBillingAddress] = useState("");

  // Internal Notes & Meta
  const [remark, setRemark] = useState("");
  const [brand, setBrand] = useState<string>("that_laundry_shop");
  const [sourceSystem, setSourceSystem] = useState<string>("web_booking");
  const [isCorporate, setIsCorporate] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [memberStartDate, setMemberStartDate] = useState("");
  const [memberExpiryDate, setMemberExpiryDate] = useState("");
  const [priceListId, setPriceListId] = useState("regular");
  const [isSaving, setIsSaving] = useState(false);

  const localDataForSearch = useMemo(() => pois.map(p => ({ 
    name: p.name, 
    address: p.address, 
    lat: p.coords.lat, 
    lng: p.coords.lng, 
    placeId: p.placeId || p.id, 
    isLocal: true 
  })), [pois]);

  useEffect(() => {
    if (open) {
      if (customer) {
        setName(customer.name || "");
        setNickName(customer.nickName || "");
        setGender(customer.gender || "Rather not say");
        setDob(customer.dob || "");
        setCustomerTier(customer.isVIP ? "vip" : customer.isMember ? "member" : "standard");

        setPhone(customer.phone || "");
        setIsWhatsapp(customer.isWhatsapp || false);
        setSecondaryPhone(customer.secondaryPhone || "");
        setIsSecondaryWhatsapp(customer.isSecondaryWhatsapp || false);
        setLineId(customer.lineId || "");
        setEmail(customer.email || "");
        setInitialPin(customer.passwordHash || "");

        setAddress(customer.defaultAddress && customer.defaultAddress !== "--" ? customer.defaultAddress : "");
        setRoomNo(customer.roomNo || "");
        setCoords(customer.defaultCoords || { lat: 13.736717, lng: 100.523186 });
        setAddressLabel("Home Condo");
        setDistrict("Watthana (Thonglor, Ekkamai, Phrom Phong)");
        setLeaveWithJuristic(true);

        const hasTax = Boolean(customer.taxId || customer.companyName);
        setRequiresTaxInvoice(hasTax);
        setCompanyName(customer.companyName || "");
        setTaxId(customer.taxId || "");
        setTaxBranch("Head Office (สำนักงานใหญ่)");
        setTaxBillingAddress(customer.defaultAddress && customer.defaultAddress !== "--" ? customer.defaultAddress : "");

        setRemark(customer.remark || "");
        setBrand(customer.brand || "that_laundry_shop");
        setSourceSystem(customer.sourceSystem || "web_booking");
        setIsCorporate(customer.isCorporate || false);
        setMemberId(customer.memberId || "");
        setMemberStartDate(customer.memberStartDate ? new Date(customer.memberStartDate).toISOString().split("T")[0] : "");
        setMemberExpiryDate(customer.memberExpiryDate ? new Date(customer.memberExpiryDate).toISOString().split("T")[0] : "");
        setPriceListId(customer.priceListId || "regular");
        setSelectedLocation(null);
      } else {
        // Reset all states cleanly - no mock defaults
        setName("");
        setNickName("");
        setGender("Rather not say");
        setDob("");
        setCustomerTier("member");

        setPhone("");
        setIsWhatsapp(true);
        setSecondaryPhone("");
        setIntlCountryCode("+1");
        setIsSecondaryWhatsapp(false);
        setLineId("");
        setEmail("");
        setInitialPin("");

        setAddressLabel("Home Condo");
        setAddress("");
        setRoomNo("");
        setDistrict("Watthana (Thonglor, Ekkamai, Phrom Phong)");
        setLeaveWithJuristic(true);
        setCoords({ lat: 13.736717, lng: 100.523186 });

        setRequiresTaxInvoice(false);
        setCompanyName("");
        setTaxId("");
        setTaxBranch("Head Office (สำนักงานใหญ่)");
        setTaxBillingAddress("");

        setRemark("");
        setBrand("that_laundry_shop");
        setSourceSystem("web_booking");
        setIsCorporate(false);
        setMemberId("");
        setMemberStartDate("");
        setMemberExpiryDate("");
        setPriceListId("regular");
        setSelectedLocation(null);
      }
    }
  }, [open, customer]);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdjustBalance) {
      toast.error("คุณไม่มีสิทธิ์ในการปรับยอดเงิน Wallet");
      return;
    }
    if (!customer) return;
    const rawAmount = parseFloat(adjustAmount);
    if (isNaN(rawAmount) || rawAmount === 0) {
      toast.error("กรุณาระบุจำนวนเงินที่ต้องการปรับยอด");
      return;
    }
    if (!adjustReason.trim()) {
      toast.error("กรุณาระบุเหตุผลในการปรับยอดเงิน");
      return;
    }

    const currentBalance = customer.creditBalance || 0;
    const delta = rawAmount < 0 
      ? rawAmount 
      : (adjustMode === "add" ? rawAmount : -rawAmount);
    const newBalance = Math.round((currentBalance + delta) * 100) / 100;
    const isAdd = delta >= 0;

    setAdjustLoading(true);
    try {
      const updated = await customerStore.updateCustomer(customer.id, {
        creditBalance: newBalance,
        creditBalanceDelta: delta,
        adjustReason: adjustReason.trim() || undefined,
        reason: adjustReason.trim() || undefined,
        actorId: user?.id,
        actorName: user?.name || user?.email || "Admin",
        actorRole: user?.role,
        walletTxType: isAdd ? 'ADJUST_ADD' : 'ADJUST_DEDUCT',
        walletRefType: 'manual',
      } as any);

      const actualNewBalance = updated?.creditBalance ?? newBalance;
      toast.success(
        `${isAdd ? "เพิ่มยอดเงิน" : "หักยอดเงิน"} ฿${Math.abs(delta).toLocaleString(undefined, { minimumFractionDigits: 2 })} — ยอดคงเหลือ: ฿${actualNewBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
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

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("กรุณาระบุชื่อ-นามสกุล (Full Name is required)");
      return;
    }
    if (!phone.trim()) {
      toast.error("กรุณาระบุเบอร์โทรศัพท์หลัก (Primary Phone is required)");
      return;
    }
    if (!address.trim()) {
      toast.error("กรุณาระบุที่อยู่จัดส่ง (Delivery Address is required)");
      return;
    }

    setIsSaving(true);
    try {
      const isMemberBool = customerTier === "member" || customerTier === "vip";
      const isVIPBool = customerTier === "vip";

      let finalPriceListId = priceListId;
      if (isMemberBool) {
        const ml = priceLists.find(p => p.name.toLowerCase().includes("member"));
        if (ml) finalPriceListId = ml.id;
      } else {
        const rl = priceLists.find(p => p.isDefault);
        if (rl) finalPriceListId = rl.id;
      }

      // Combine secondary phone with intl country code if typed
      let finalSecondaryPhone = secondaryPhone.trim();
      if (finalSecondaryPhone && !finalSecondaryPhone.startsWith("+") && intlCountryCode) {
        finalSecondaryPhone = `${intlCountryCode} ${finalSecondaryPhone}`;
      }

      const customerData = {
        name: name.trim().toUpperCase(),
        phone: phone.trim(),
        brand,
        nickName: nickName.trim() || null,
        gender,
        secondaryPhone: finalSecondaryPhone || null,
        isSecondaryWhatsapp,
        roomNo: roomNo.trim() || null,
        sourceSystem,
        defaultAddress: address.trim(),
        defaultCoords: coords,
        priceListId: finalPriceListId,
        email: email.trim() || null,
        lineId: lineId.trim() || null,
        language: "th",
        remark: remark.trim() || null,
        secondaryAddress: roomNo.trim() ? `Room ${roomNo.trim()}` : null,
        dob: dob.trim() || null,
        taxId: requiresTaxInvoice ? taxId.trim() || null : null,
        companyName: requiresTaxInvoice ? companyName.trim() || null : null,
        isVIP: isVIPBool,
        isCorporate,
        isMember: isMemberBool,
        isWhatsapp,
        passwordHash: initialPin.trim() || undefined,
        memberId: isMemberBool ? memberId.trim() || null : null,
        memberStartDate: isMemberBool && memberStartDate ? memberStartDate : null,
        memberExpiryDate: isMemberBool && memberExpiryDate ? memberExpiryDate : null,
        updatedAt: customer ? customer.updatedAt : undefined,
      };

      if (customer) {
        await customerStore.updateCustomer(customer.id, customerData);
        toast.success(`อัปเดตข้อมูลลูกค้า ${name} สำเร็จ`);
        if (onSaved) onSaved({ ...customer, ...customerData } as Customer);
      } else {
        const newCustomer = await customerStore.addCustomer(customerData);
        // Create initial address record in CustomerAddress table
        if (newCustomer?.id && address.trim()) {
          try {
            await addCustomerAddressAction(newCustomer.id, {
              label: addressLabel.trim() || "Home Condo",
              placeName: address.trim(),
              address: address.trim(),
              roomNumber: roomNo.trim() || undefined,
              district: district || "Bangkok",
              leaveWithJuristic,
              isPrimary: true
            });
          } catch (addrErr) {
            console.error("Failed to add initial address to CustomerAddress table:", addrErr);
          }
        }
        toast.success(`บันทึกลูกค้าใหม่ ${name} เรียบร้อยแล้ว`);
        if (onSaved && newCustomer) onSaved(newCustomer);
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save customer");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog 
        open={open} 
        onOpenChange={(newOpen, eventDetails) => { 
          if (!newOpen && eventDetails?.reason === "outside-press") return; 
          onOpenChange(newOpen); 
        }} 
        disablePointerDismissal={true}
      >
        <DialogContent 
          showCloseButton={false}
          className="max-w-4xl w-[95vw] sm:max-w-4xl p-0 bg-white overflow-hidden rounded-3xl z-[60] border border-slate-200/90 shadow-2xl transition-all"
        >
          {/* HEADER SECTION (Matching Mockup) */}
          <div className="p-6 pb-4 bg-white border-b border-slate-200/80">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  {customer ? "Edit Customer Profile" : "Register New Customer"}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Save customer profile, multiple Google Maps addresses, WhatsApp status, and company tax invoice details.
                </p>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                title="Close (ESC)"
              >
                <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1 py-0.2 rounded bg-slate-50">ESC</span>
                <X size={16} />
              </button>
            </div>

            {/* Brand & Registration Source Selector Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 mt-4">
              <div className="flex items-center gap-2">
                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">แบรนด์ (Brand):</Label>
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setBrand("that_laundry_shop")}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      brand === "that_laundry_shop"
                        ? "bg-slate-800 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    That Laundry Shop (TLS)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrand("noname_laundry")}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      brand === "noname_laundry"
                        ? "bg-amber-500 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Noname Laundry
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ช่องทาง (Source):</Label>
                <select
                  value={sourceSystem}
                  onChange={(e) => setSourceSystem(e.target.value)}
                  className="h-7 text-xs font-semibold border border-slate-200 rounded-md bg-white px-2 text-slate-700 cursor-pointer"
                >
                  <option value="web_booking">เว็บไซต์ (Online Web)</option>
                  <option value="pos_store">POS หน้าร้าน (Store)</option>
                  <option value="line_oa">LINE OA</option>
                  <option value="phone_call">โทรศัพท์ (Phone Call)</option>
                </select>
              </div>
            </div>

            {/* Wallet Balance — Shown if editing Member */}
            {customer && customer.isMember && (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2 mt-3 text-xs">
                <div className="flex items-center gap-2">
                  <Wallet size={14} className="text-emerald-600" />
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Credit Wallet</span>
                  <span className="text-sm font-black text-emerald-800">
                    ฿{(customer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                  {pendingCount > 0 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                      Pending ({pendingCount})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {canTopUp && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      className="h-6.5 border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all gap-1 text-[11px] font-bold px-2.5 rounded-lg"
                      onClick={() => {
                        if (onTopUpCustomer) {
                          onOpenChange(false);
                          onTopUpCustomer(customer);
                        } else {
                          setLocalTopUpCustomer(customer);
                          onOpenChange(false);
                          setTimeout(() => setShowTopUpDialog(true), 150);
                        }
                      }}
                    >
                      <Wallet size={11} />
                      Top Up
                    </Button>
                  )}
                  {canAdjustBalance && (
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      className="h-6.5 border-amber-300 bg-white text-amber-700 hover:bg-amber-500 hover:text-white transition-all gap-1 text-[11px] font-bold px-2.5 rounded-lg"
                      onClick={() => { setAdjustAmount(""); setAdjustOpen(true); }}
                    >
                      <SlidersHorizontal size={11} />
                      Adjust
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* MAIN SCROLLABLE FORM BODY */}
          <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
            
            {/* ========================================================================= */}
            {/* SECTION 1: CUSTOMER IDENTITY (Name, Nickname, Gender, DOB, Tier)          */}
            {/* ========================================================================= */}
            <div className="space-y-3">
              {/* Row 1: Full Name & Nickname */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <Label className="text-xs font-bold text-slate-800 block mb-1">
                    Full Name (ชื่อ-นามสกุล) <span className="text-rose-500">*</span>
                  </Label>
                  <Input 
                    placeholder="e.g. Alex Thorne / ศิริพร ธนาคา" 
                    value={name} 
                    onChange={e => setName(e.target.value.toUpperCase())} 
                    className="h-9 text-xs border-slate-300 rounded-xl focus-visible:ring-sky-500" 
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-800 block mb-1">
                    Nickname (ชื่อเล่น)
                  </Label>
                  <Input 
                    placeholder="e.g. Alex / ส้ม" 
                    value={nickName} 
                    onChange={e => setNickName(e.target.value)} 
                    className="h-9 text-xs border-slate-300 rounded-xl focus-visible:ring-sky-500" 
                  />
                </div>
              </div>

              {/* Row 2: Gender, DOB, Customer Tier */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <Label className="text-xs font-bold text-slate-800 block mb-1">Gender</Label>
                  <select
                    value={gender}
                    onChange={e => setGender(e.target.value)}
                    className="w-full h-9 text-xs border border-slate-300 rounded-xl bg-white px-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                  >
                    <option value="Rather not say">Rather not say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-800 block mb-1">Date of Birth (DOB)</Label>
                  <div className="relative">
                    <Input 
                      type="date" 
                      value={dob} 
                      onChange={e => setDob(e.target.value)} 
                      className="h-9 text-xs border-slate-300 rounded-xl focus-visible:ring-sky-500 bg-white" 
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-800 block mb-1">Customer Tier</Label>
                  <select
                    value={customerTier}
                    onChange={e => setCustomerTier(e.target.value as any)}
                    className="w-full h-9 text-xs border border-slate-300 rounded-xl bg-white px-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer font-semibold"
                  >
                    <option value="member">Regular Member</option>
                    <option value="vip">VIP Gold</option>
                    <option value="standard">Standard</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* SECTION 2: CONTACT CHANNELS & DUAL PHONE NUMBERS                          */}
            {/* ========================================================================= */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-2xs space-y-3.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Contact Channels & Dual Phone Numbers
              </h3>

              {/* Sub-row: Dual Phone Number Boxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Default Thai Mobile */}
                <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <span>🇹🇭</span> Default Thai Mobile <span className="text-rose-500">*</span>
                    </span>
                    <span className="text-[10px] text-slate-400">Local +66</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="h-9 px-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 flex items-center shrink-0">
                      TH +66
                    </span>
                    <Input 
                      type="tel"
                      placeholder="08x-xxx-xxxx" 
                      value={phone} 
                      onChange={e => setPhone(e.target.value)} 
                      className="h-9 text-xs border-slate-300 rounded-xl bg-white font-mono font-bold" 
                      required
                    />
                  </div>

                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isWhatsapp} 
                      onChange={e => setIsWhatsapp(e.target.checked)} 
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5" 
                    />
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      Thai number has WhatsApp
                    </span>
                  </label>
                </div>

                {/* International Mobile (Optional) */}
                <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                      <Globe size={13} className="text-sky-600" /> International Mobile (Optional)
                    </span>
                    <span className="text-[10px] text-slate-400">Search country name/code</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={intlCountryCode}
                      onChange={e => setIntlCountryCode(e.target.value)}
                      className="h-9 px-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 shrink-0 cursor-pointer"
                    >
                      <option value="+1">US/CA +1</option>
                      <option value="+44">UK +44</option>
                      <option value="+81">JP +81</option>
                      <option value="+82">KR +82</option>
                      <option value="+65">SG +65</option>
                      <option value="+86">CN +86</option>
                      <option value="+61">AU +61</option>
                      <option value="+49">DE +49</option>
                      <option value="+33">FR +33</option>
                      <option value="+971">AE +971</option>
                    </select>
                    <Input 
                      type="tel"
                      placeholder="Phone number" 
                      value={secondaryPhone} 
                      onChange={e => setSecondaryPhone(e.target.value)} 
                      className="h-9 text-xs border-slate-300 rounded-xl bg-white font-mono" 
                    />
                  </div>

                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isSecondaryWhatsapp} 
                      onChange={e => setIsSecondaryWhatsapp(e.target.checked)} 
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5" 
                    />
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      Intl number has WhatsApp
                    </span>
                  </label>
                </div>
              </div>

              {/* Sub-row 3 inputs: LINE ID, Email, Initial 6-Digit PIN */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                <div>
                  <Label className="text-xs font-bold text-slate-700 block mb-1">LINE ID</Label>
                  <Input 
                    placeholder="e.g. @nonamelaundry or lin" 
                    value={lineId} 
                    onChange={e => setLineId(e.target.value)} 
                    className="h-9 text-xs border-slate-300 rounded-xl" 
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700 block mb-1">Email Address</Label>
                  <Input 
                    type="email" 
                    placeholder="customer@email.com" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="h-9 text-xs border-slate-300 rounded-xl" 
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700 block mb-1">
                    Initial 6-Digit PIN (Quick Access)
                  </Label>
                  <Input 
                    type="text" 
                    maxLength={6} 
                    placeholder="123456" 
                    value={initialPin} 
                    onChange={e => setInitialPin(e.target.value.replace(/\D/g, ""))} 
                    className="h-9 text-xs font-mono font-bold tracking-widest border-slate-300 rounded-xl" 
                  />
                </div>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* SECTION 3: INITIAL BANGKOK DELIVERY LOCATION                              */}
            {/* ========================================================================= */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-2xs space-y-3.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                Initial Bangkok Delivery Location (Google Maps Address)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <Label className="text-xs font-bold text-slate-700 block mb-1">Address Label</Label>
                  <Input 
                    placeholder="Home Condo" 
                    value={addressLabel} 
                    onChange={e => setAddressLabel(e.target.value)} 
                    className="h-9 text-xs border-slate-300 rounded-xl" 
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-700 block mb-1">Room / Unit No</Label>
                  <Input 
                    placeholder="e.g. Tower A, Room 1804" 
                    value={roomNo} 
                    onChange={e => setRoomNo(e.target.value)} 
                    className="h-9 text-xs border-slate-300 rounded-xl" 
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-800 block mb-1">
                  Condo / Building / Street Address <span className="text-rose-500">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <LocationInput 
                    id="customer-address" 
                    placeholder="e.g. The Estelle Phrom Phong, 8 Sukhumvit 26" 
                    value={address} 
                    localData={localDataForSearch} 
                    onChange={setAddress}
                    onSelectLocation={(loc) => { 
                      setCoords({ lat: loc.lat, lng: loc.lng }); 
                      setSelectedLocation(loc); 
                    }} 
                    className="flex-1 h-9 text-xs rounded-xl" 
                  />
                  {selectedLocation && !selectedLocation.isLocal && (
                    <Button 
                      type="button" 
                      onClick={() => { 
                        poiStore.addPOI({ 
                          name: selectedLocation.name, 
                          address: selectedLocation.address || selectedLocation.name, 
                          coords: { lat: selectedLocation.lat, lng: selectedLocation.lng }, 
                          placeId: selectedLocation.placeId 
                        }); 
                        toast.success(`Saved location: ${selectedLocation.name}`); 
                        setSelectedLocation(prev => prev ? { ...prev, isLocal: true } : null); 
                      }}
                      variant="outline" 
                      className="h-9 px-3 whitespace-nowrap text-xs bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 rounded-xl" 
                      title="Save this Google Maps location to Database"
                    >
                      <Database size={13} className="mr-1" /> Save
                    </Button>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={leaveWithJuristic} 
                  onChange={e => setLeaveWithJuristic(e.target.checked)} 
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 h-4 w-4" 
                />
                <span className="text-xs font-semibold text-slate-700">
                  Allow Juristic Office / Reception desk drop-off
                </span>
              </label>
            </div>

            {/* ========================================================================= */}
            {/* SECTION 4: COMPANY TAX INVOICE DETAILS (ใบกำกับภาษี)                      */}
            {/* ========================================================================= */}
            <div className={`border rounded-2xl p-4.5 transition-all shadow-2xs space-y-3.5 ${
              requiresTaxInvoice ? "border-amber-300 bg-amber-50/20" : "border-slate-200 bg-white"
            }`}>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={requiresTaxInvoice} 
                  onChange={e => setRequiresTaxInvoice(e.target.checked)} 
                  className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 h-4 w-4" 
                />
                <span className="text-xs font-black text-amber-950">
                  Customer requires Company Tax Receipt / Full Tax Invoice (ใบกำกับภาษี)
                </span>
              </label>

              {requiresTaxInvoice && (
                <div className="pt-2 border-t border-amber-200/60 space-y-3 animate-in fade-in duration-150">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <Label className="text-xs font-bold text-slate-800 block mb-1">
                        Company Name (ชื่อบริษัท/นิติบุคคล)
                      </Label>
                      <Input 
                        placeholder="e.g. Thorne Design & Living (Thailand) Co., Ltd." 
                        value={companyName} 
                        onChange={e => setCompanyName(e.target.value)} 
                        className="h-9 text-xs border-slate-300 rounded-xl bg-white" 
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-slate-800 block mb-1">
                        13-digit Tax ID (เลขประจำตัวผู้เสียภาษี 13 หลัก)
                      </Label>
                      <Input 
                        placeholder="e.g. 0105562019284" 
                        maxLength={13}
                        value={taxId} 
                        onChange={e => setTaxId(e.target.value.replace(/\D/g, ""))} 
                        className="h-9 text-xs font-mono border-slate-300 rounded-xl bg-white" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <Label className="text-xs font-bold text-slate-800 block mb-1">
                        Branch (สาขา)
                      </Label>
                      <Input 
                        placeholder="Head Office (สำนักงานใหญ่)" 
                        value={taxBranch} 
                        onChange={e => setTaxBranch(e.target.value)} 
                        className="h-9 text-xs border-slate-300 rounded-xl bg-white" 
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-slate-800 block mb-1">
                        Registered Billing Address (ที่อยู่จดทะเบียน)
                      </Label>
                      <Input 
                        placeholder="e.g. 8 Sukhumvit 26, Khlong Tan, Khlong Toei, Bangkok" 
                        value={taxBillingAddress} 
                        onChange={e => setTaxBillingAddress(e.target.value)} 
                        className="h-9 text-xs border-slate-300 rounded-xl bg-white" 
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ========================================================================= */}
            {/* SECTION 5: INITIAL STAFF NOTES & GARMENT CARE PREFERENCES                 */}
            {/* ========================================================================= */}
            <div>
              <Label className="text-xs font-bold text-slate-800 block mb-1">
                Initial Staff Notes & Garment Care Preferences
              </Label>
              <textarea
                rows={2}
                placeholder="e.g. Hypoallergenic only, extra starch on shirts..."
                value={remark}
                onChange={e => setRemark(e.target.value)}
                className="w-full text-xs p-3 border border-slate-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-sky-500 leading-relaxed"
              />
            </div>

          </div>

          {/* FOOTER ACTIONS (Matching Mockup) */}
          <div className="p-4 px-6 bg-slate-50 border-t border-slate-200/80 flex items-center justify-end gap-3">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => onOpenChange(false)} 
              className="h-10 px-5 text-xs font-bold text-slate-600 hover:text-slate-900 rounded-full"
            >
              Cancel
            </Button>
            <Button 
              type="button" 
              disabled={isSaving}
              onClick={handleSave} 
              className="h-10 px-6 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-full shadow-sm cursor-pointer transition-all"
            >
              {isSaving ? "Saving..." : "Save Customer to CRM"}
            </Button>
          </div>

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
                  ปรับยอด Wallet โดยตรงสำหรับ <strong>{customer.name}</strong>
                </DialogDescription>
              </DialogHeader>
              <div className="p-6 space-y-4 text-xs">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                  <span className="font-bold text-slate-500 uppercase tracking-wider">Current Balance</span>
                  <span className="text-2xl font-black text-slate-900">
                    ฿{(customer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-slate-400 uppercase tracking-widest">Adjustment Action</Label>
                  <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setAdjustMode("add")}
                      className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                        adjustMode === "add" ? "bg-emerald-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Plus size={14} /> เพิ่มยอด (Credit)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustMode("deduct")}
                      className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-all ${
                        adjustMode === "deduct" ? "bg-rose-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Minus size={14} /> หักยอด (Debit)
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">จำนวนเงิน (฿)</Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={adjustAmount}
                    onChange={e => setAdjustAmount(e.target.value)}
                    className="h-10 text-base font-black rounded-xl"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">เหตุผลในการปรับยอด</Label>
                  <Input
                    placeholder="เช่น ปรับยอดจากระบบเดิม, คืนเงินค่าซัก"
                    value={adjustReason}
                    onChange={e => setAdjustReason(e.target.value)}
                    className="h-9 text-xs rounded-xl"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setAdjustOpen(false)} className="rounded-xl">
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={adjustLoading} className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold">
                    {adjustLoading ? "Saving..." : "Confirm Adjustment"}
                  </Button>
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Top Up Dialog */}
      {showTopUpDialog && (
        <TopUpDialog
          open={showTopUpDialog}
          onClose={() => {
            setShowTopUpDialog(false);
            setLocalTopUpCustomer(null);
          }}
          preselectedCustomer={localTopUpCustomer}
        />
      )}
    </>
  );
}
