"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { 
  Edit, UserPlus, MessageCircle, Crown, Users, Database, Wallet, SlidersHorizontal, 
  Plus, Minus, Building, MapPin, Globe, Shield, Calendar, X, Check, Tag, Receipt, Bike, AlertTriangle,
  Lock, RefreshCw, Loader2
} from "lucide-react";
import { customerStore, priceListStore, poiStore, walletApprovalStore, shopStore, type Customer } from "@/lib/store";
import { useSyncExternalStore } from "react";
import { LocationInput } from "@/components/location-input";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { TopUpDialog } from "@/components/top-up-dialog";
import { addCustomerAddressAction, getNextMemberIdAction } from "@/actions/db";
import { getCleanBranchName } from "@/components/branch-filter-dropdown";
import { CountryCodeInput } from "@/components/ui/country-code-input";
import { parseFullPhone } from "@/lib/country-codes";
import { formatBaht, isThaiPhoneNumber, normalizeThaiPhone, findDuplicateCustomerByPhone, computeMembershipExpiryDate } from "@/lib/utils";
import { format } from "date-fns";

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
  const [adjustExpiryDate, setAdjustExpiryDate] = useState("");
  const [adjustLoading, setAdjustLoading] = useState(false);

  useEffect(() => {
    if (adjustOpen && customer) {
      const d = customer.memberExpiryDate
        ? new Date(customer.memberExpiryDate).toISOString().split("T")[0]
        : "";
      setAdjustExpiryDate(d);
    }
  }, [adjustOpen, customer]);

  const priceLists = useSyncExternalStore(priceListStore.subscribe, priceListStore.getSnapshot, priceListStore.getSnapshot);
  const pois = useSyncExternalStore(poiStore.subscribe, poiStore.getSnapshot, poiStore.getSnapshot);
  const pendingWalletMap = useSyncExternalStore(walletApprovalStore.subscribe, walletApprovalStore.getSnapshot, walletApprovalStore.getSnapshot);
  const pendingCount = customer?.id ? (pendingWalletMap.byCustomer[customer.id] || 0) : 0;

  // Form Fields
  const [name, setName] = useState("");
  const [nickName, setNickName] = useState("");
  const [gender, setGender] = useState("Rather not say");
  const [dob, setDob] = useState("");
  const [customerTier, setCustomerTier] = useState<"member" | "vip" | "standard" | "corporate">("standard");

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
  const [addressLabel, setAddressLabel] = useState("Hotel");
  const [customAddressLabel, setCustomAddressLabel] = useState("");
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
  const [branchId, setBranchId] = useState("");
  const [isGeneratingMemberId, setIsGeneratingMemberId] = useState(false);
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const [memberStartDate, setMemberStartDate] = useState("");
  const [memberExpiryDate, setMemberExpiryDate] = useState("");
  const [priceListId, setPriceListId] = useState("regular");
  const [customerVatType, setCustomerVatType] = useState<"default" | "inclusive" | "exclusive" | "none">("default");
  const [corporateCommissionType, setCorporateCommissionType] = useState<"default" | "fixed" | "custom_km" | "none">("default");
  const [corporatePickupCommission, setCorporatePickupCommission] = useState<number>(0);
  const [corporateDeliveryCommission, setCorporateDeliveryCommission] = useState<number>(0);
  const [corporateCommissionRatePerKm, setCorporateCommissionRatePerKm] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);

  const allCustomers = useSyncExternalStore(customerStore.subscribe, customerStore.getSnapshot, customerStore.getSnapshot);

  // Realtime duplicate phone check (supports both Thai and International formats)
  // Only applies when creating a new customer (not on Edit)
  const duplicatePhoneCheck = useMemo(() => {
    if (customer) return null; // Only check on Create, not on Edit
    let cleanP = phone.trim();
    if (cleanP && isThaiPhoneNumber(cleanP)) {
      cleanP = normalizeThaiPhone(cleanP);
    }
    let finalSecP = secondaryPhone.trim();
    if (finalSecP && !finalSecP.startsWith("+") && intlCountryCode) {
      const code = intlCountryCode.trim().startsWith("+") ? intlCountryCode.trim() : `+${intlCountryCode.trim()}`;
      finalSecP = `${code} ${finalSecP}`;
    }

    return findDuplicateCustomerByPhone({
      phone: cleanP,
      secondaryPhone: finalSecP,
      customers: allCustomers,
      excludeCustomerId: null,
    });
  }, [phone, secondaryPhone, intlCountryCode, allCustomers, customer]);

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
        setCustomerTier(
          customer.isCorporate || customer.tier === "corporate"
            ? "corporate"
            : customer.isVIP || customer.tier === "vip"
            ? "vip"
            : customer.isMember || customer.tier === "member"
            ? "member"
            : "standard"
        );

        // Dual Phone resolution on Dialog Open:
        const rawP = (customer.phone || "").trim();
        const rawSec = (customer.secondaryPhone || "").trim();

        let resolvedThai = "";
        let resolvedIntl = "";
        let resolvedIsWhatsapp = customer.isWhatsapp || false;
        let resolvedIsSecWhatsapp = customer.isSecondaryWhatsapp || false;

        if (isThaiPhoneNumber(rawP)) {
          resolvedThai = normalizeThaiPhone(rawP);
          if (rawSec && rawSec !== rawP) {
            resolvedIntl = rawSec;
          }
        } else if (rawSec && isThaiPhoneNumber(rawSec)) {
          resolvedThai = normalizeThaiPhone(rawSec);
          if (rawP && rawP !== rawSec) {
            resolvedIntl = rawP;
          }
          resolvedIsWhatsapp = customer.isSecondaryWhatsapp || false;
          resolvedIsSecWhatsapp = customer.isWhatsapp || false;
        } else if (rawP) {
          // Customer has only an international/foreign phone in customer.phone
          resolvedIntl = rawP;
          resolvedIsSecWhatsapp = customer.isWhatsapp || false;
        } else if (rawSec) {
          resolvedIntl = rawSec;
        }

        setPhone(resolvedThai);
        setIsWhatsapp(resolvedIsWhatsapp);
        if (resolvedIntl) {
          const { countryCode, nationalNumber } = parseFullPhone(resolvedIntl);
          setIntlCountryCode(countryCode || "+1");
          setSecondaryPhone(nationalNumber || resolvedIntl);
        } else {
          setIntlCountryCode("+1");
          setSecondaryPhone("");
        }
        setIsSecondaryWhatsapp(resolvedIsSecWhatsapp);
        setLineId(customer.lineId || "");
        setEmail(customer.email || "");
        setInitialPin(customer.passwordHash || "");

        setAddress(customer.defaultAddress && customer.defaultAddress !== "--" ? customer.defaultAddress : "");
        setRoomNo(customer.roomNo || "");
        setCoords(customer.defaultCoords || { lat: 13.736717, lng: 100.523186 });
        setAddressLabel("Hotel");
        setCustomAddressLabel("");
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
        setBranchId(customer.branchId || "");
        setMemberStartDate(customer.memberStartDate ? new Date(customer.memberStartDate).toISOString().split("T")[0] : "");
        setMemberExpiryDate(customer.memberExpiryDate ? new Date(customer.memberExpiryDate).toISOString().split("T")[0] : "");
        setPriceListId(customer.priceListId || "regular");
        setCustomerVatType((customer.vatType as any) || "default");
        setCorporateCommissionType((customer.corporateCommissionType as any) || "default");
        setCorporatePickupCommission(customer.corporatePickupCommission || 0);
        setCorporateDeliveryCommission(customer.corporateDeliveryCommission || 0);
        setCorporateCommissionRatePerKm(customer.corporateCommissionRatePerKm || 0);
        setSelectedLocation(null);
      } else {
        // Reset all states cleanly - no mock defaults
        setName("");
        setNickName("");
        setGender("Rather not say");
        setDob("");
        setCustomerTier("standard");

        setPhone("");
        setIsWhatsapp(true);
        setSecondaryPhone("");
        setIntlCountryCode("+1");
        setIsSecondaryWhatsapp(false);
        setLineId("");
        setEmail("");
        setInitialPin("");

        setAddressLabel("Hotel");
        setCustomAddressLabel("");
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
        setBranchId("");
        setMemberStartDate("");
        setMemberExpiryDate("");
        setPriceListId("regular");
        setCustomerVatType("default");
        setCorporateCommissionType("default");
        setCorporatePickupCommission(0);
        setCorporateDeliveryCommission(0);
        setCorporateCommissionRatePerKm(0);
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
      const updates: any = {
        creditBalance: newBalance,
        creditBalanceDelta: delta,
        adjustReason: adjustReason.trim() || undefined,
        reason: adjustReason.trim() || undefined,
        actorId: user?.id,
        actorName: user?.name || user?.email || "Admin",
        actorRole: user?.role,
        walletTxType: isAdd ? 'ADJUST_ADD' : 'ADJUST_DEDUCT',
        walletRefType: 'manual',
      };

      if (adjustExpiryDate) {
        updates.memberExpiryDate = new Date(`${adjustExpiryDate}T23:59:59`);
        if (!customer.isMember) {
          updates.isMember = true;
        }
      } else {
        updates.memberExpiryDate = null;
      }

      const updated = await customerStore.updateCustomer(customer.id, updates);

      // Sync with parent customer dialog state
      setMemberExpiryDate(adjustExpiryDate);
      if (adjustExpiryDate && customerTier === "standard") {
        setCustomerTier("member");
      }

      const expiryInfo = adjustExpiryDate 
        ? ` (วันหมดอายุ: ${format(new Date(`${adjustExpiryDate}T23:59:59`), "dd/MM/yyyy")})` 
        : "";

      const actualNewBalance = updated?.creditBalance ?? newBalance;
      toast.success(
        `${isAdd ? "เพิ่มยอดเงิน" : "หักยอดเงิน"} ฿${Math.abs(delta).toLocaleString(undefined, { minimumFractionDigits: 2 })} — ยอดคงเหลือ: ${formatBaht(actualNewBalance)}${expiryInfo}`
      );
      setAdjustOpen(false);
      setAdjustAmount("");
      setAdjustReason("");
      setAdjustExpiryDate("");
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
    let cleanPhone = phone.trim();
    if (cleanPhone && isThaiPhoneNumber(cleanPhone)) {
      cleanPhone = normalizeThaiPhone(cleanPhone);
    }
    // Combine secondary phone with intl country code if typed
    let finalSecondaryPhone = secondaryPhone.trim();
    if (finalSecondaryPhone && !finalSecondaryPhone.startsWith("+") && intlCountryCode) {
      const code = intlCountryCode.trim().startsWith("+") ? intlCountryCode.trim() : `+${intlCountryCode.trim()}`;
      finalSecondaryPhone = `${code} ${finalSecondaryPhone}`;
    }

    if (!cleanPhone && !finalSecondaryPhone) {
      toast.error("กรุณาระบุเบอร์โทรศัพท์ (ระบุเบอร์ไทย หรือเบอร์ต่างประเทศอย่างน้อย 1 เบอร์)");
      return;
    }
    if (!address.trim()) {
      toast.error("กรุณาระบุที่อยู่จัดส่ง (Delivery Address is required)");
      return;
    }

    // Duplicate phone check (only for new customers, not on edit)
    if (!customer) {
      const duplicate = findDuplicateCustomerByPhone({
        phone: cleanPhone,
        secondaryPhone: finalSecondaryPhone,
        customers: allCustomers,
        excludeCustomerId: null,
      });
      if (duplicate) {
        toast.error(`ไม่สามารถบันทึกได้: เบอร์โทร ${duplicate.matchedPhone} มีอยู่ในระบบแล้ว (ลูกค้า: ${duplicate.customer.name || "ไม่ระบุชื่อ"}${duplicate.customer.memberId ? ` - รหัส ${duplicate.customer.memberId}` : ""})`, { duration: 6000 });
        return;
      }
    }

    setIsSaving(true);
    try {
      const isCorporateBool = customerTier === "corporate" || isCorporate;
      const isMemberBool = customerTier === "member" || customerTier === "vip" || Boolean(memberId.trim());
      const isVIPBool = customerTier === "vip";

      if (!branchId || !branchId.trim()) {
        toast.error("กรุณาเลือกสาขา (บังคับระบุ)");
        setIsSaving(false);
        return;
      }

      let finalPriceListId = priceListId;
      if (customerTier === "corporate") {
        if (priceListId === "regular" || !priceListId) {
          const corpPl = priceLists.find(p => p.name.toLowerCase().includes("corporate") || p.name.toLowerCase().includes("b2b"));
          if (corpPl) finalPriceListId = corpPl.id;
        }
      } else if (isMemberBool) {
        if (priceListId === "regular" || !priceListId) {
          const ml = priceLists.find(p => p.name.toLowerCase().includes("member"));
          if (ml) finalPriceListId = ml.id;
        }
      } else {
        if (priceListId === "regular" || !priceListId) {
          const rl = priceLists.find(p => p.isDefault);
          if (rl) finalPriceListId = rl.id;
        }
      }

      // Route Thai phone to primary phone, international to secondaryPhone
      let targetPrimaryPhone = cleanPhone;
      let targetSecondaryPhone = finalSecondaryPhone || null;

      if (!targetPrimaryPhone && targetSecondaryPhone) {
        // Customer only has an international phone
        targetPrimaryPhone = targetSecondaryPhone;
        targetSecondaryPhone = null;
      } else if (targetPrimaryPhone && targetSecondaryPhone && targetPrimaryPhone === targetSecondaryPhone) {
        // Avoid identical duplication
        targetSecondaryPhone = null;
      }

      const customerData = {
        name: name.trim().toUpperCase(),
        phone: targetPrimaryPhone || "-",
        brand,
        nickName: nickName.trim() || null,
        gender,
        secondaryPhone: targetSecondaryPhone,
        isSecondaryWhatsapp,
        roomNo: roomNo.trim() || null,
        sourceSystem,
        defaultAddress: address.trim(),
        defaultCoords: coords,
        priceListId: finalPriceListId,
        vatType: customerVatType,
        email: email.trim() || null,
        lineId: lineId.trim() || null,
        language: "th",
        remark: remark.trim() || null,
        secondaryAddress: roomNo.trim() ? `Room ${roomNo.trim()}` : null,
        dob: dob.trim() || null,
        taxId: requiresTaxInvoice ? taxId.trim() || null : null,
        companyName: requiresTaxInvoice ? companyName.trim() || null : null,
        isVIP: isVIPBool,
        isCorporate: isCorporateBool,
        corporateCommissionType: isCorporateBool ? corporateCommissionType : "default",
        corporatePickupCommission: isCorporateBool && corporateCommissionType === "fixed" ? Number(corporatePickupCommission) || 0 : 0,
        corporateDeliveryCommission: isCorporateBool && corporateCommissionType === "fixed" ? Number(corporateDeliveryCommission) || 0 : 0,
        corporateCommissionRatePerKm: isCorporateBool && corporateCommissionType === "custom_km" ? Number(corporateCommissionRatePerKm) || 0 : 0,
        tier: customerTier,
        isMember: isMemberBool,
        branchId: branchId.trim() || null,
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
              label: addressLabel.trim() || "Hotel",
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
        if (newCustomer?.isMember && newCustomer?.memberId) {
          toast.success(`บันทึกลูกค้าใหม่ "${name}" สำเร็จ — ได้รับรหัสสมาชิก: ${newCustomer.memberId}`, { duration: 6000 });
        } else {
          toast.success(`บันทึกลูกค้าใหม่ "${name}" เรียบร้อยแล้ว`);
        }
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
              <div className={`flex items-center justify-between rounded-xl px-3.5 py-2 mt-3 text-xs ${(customer.creditBalance || 0) < 0 ? "bg-rose-50 border border-rose-200" : "bg-emerald-50 border border-emerald-200"}`}>
                <div className="flex items-center gap-2">
                  <Wallet size={14} className={(customer.creditBalance || 0) < 0 ? "text-rose-600" : "text-emerald-600"} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${(customer.creditBalance || 0) < 0 ? "text-rose-600" : "text-emerald-600"}`}>Credit Wallet</span>
                  <span className={`text-sm font-black ${(customer.creditBalance || 0) < 0 ? "text-rose-800" : "text-emerald-800"}`}>
                    {formatBaht(customer.creditBalance || 0)}
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
                  <Label className="text-xs font-bold text-slate-800 flex items-center justify-between mb-1">
                    <span>Full Name (ชื่อ-นามสกุล) <span className="text-rose-500 font-bold">*</span></span>
                    {!name.trim() && (
                      <span className="text-[10px] text-rose-500 font-medium">บังคับระบุ (Required)</span>
                    )}
                  </Label>
                  <Input 
                    placeholder="e.g. Alex Thorne / ศิริพร ธนาคา" 
                    value={name} 
                    onChange={e => setName(e.target.value.toUpperCase())} 
                    className={`h-9 text-xs rounded-xl transition-all border ${
                      !name.trim()
                        ? "border-rose-400 focus:border-rose-500 text-rose-950 focus-visible:ring-1 focus-visible:ring-rose-400"
                        : "border-slate-300 text-slate-800 focus-visible:ring-sky-500"
                    }`} 
                    required
                  />
                  {!name.trim() && (
                    <p className="text-[10px] text-rose-500 mt-1 font-medium">* กรุณาระบุชื่อ-นามสกุลสำหรับลูกค้า</p>
                  )}
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

              {/* Row 2: Gender, DOB */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
              </div>

              {/* Row 3: Customer Tier & สาขา (Branch) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <Label className="text-xs font-bold text-slate-800 block mb-1">Customer Tier</Label>
                  <select
                    value={customerTier}
                    onChange={e => {
                      const newTier = e.target.value as any;
                      setCustomerTier(newTier);
                      if (newTier === "corporate") {
                        setIsCorporate(true);
                        setRequiresTaxInvoice(true);
                        const corpPl = priceLists.find(p => p.name.toLowerCase().includes("corporate") || p.name.toLowerCase().includes("b2b"));
                        if (corpPl) {
                          setPriceListId(corpPl.id);
                        }
                      } else {
                        setIsCorporate(false);
                      }
                      if (newTier === "member" || newTier === "vip") {
                        if (!memberStartDate) {
                          const today = new Date().toISOString().split("T")[0];
                          setMemberStartDate(today);
                          setMemberExpiryDate(computeMembershipExpiryDate(today));
                        } else if (!memberExpiryDate) {
                          setMemberExpiryDate(computeMembershipExpiryDate(memberStartDate));
                        }
                      }
                    }}
                    className="w-full h-9 text-xs border border-slate-300 rounded-xl bg-white px-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer font-semibold"
                  >
                    <option value="standard">Standard (ลูกค้าทั่วไป)</option>
                    <option value="member">Member</option>
                    <option value="vip">VIP Gold</option>
                    <option value="corporate">Corporate B2B (ลูกค้าองค์กร / บริษัท)</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-800 flex items-center justify-between mb-1">
                    <span>สาขา (Branch) <span className="text-rose-500 font-bold">*</span></span>
                    <span className="text-[10px] text-rose-500 font-medium">บังคับระบุ (Required)</span>
                  </Label>
                  <select
                    value={branchId}
                    onChange={e => setBranchId(e.target.value)}
                    className={`w-full h-9 text-xs rounded-xl bg-white px-3 font-semibold transition-all border ${
                      !branchId
                        ? "border-rose-400 focus:border-rose-500 text-rose-950 focus:ring-1 focus:ring-rose-400"
                        : "border-slate-300 text-slate-800 focus:border-sky-500"
                    }`}
                  >
                    <option value="">-- กรุณาเลือกสาขา (Select Branch) --</option>
                    <option value="ONLINE">🌐 Online (ออนไลน์)</option>
                    {shopLocations.map(s => (
                      <option key={s.id} value={s.id}>
                        🏪 {getCleanBranchName(s.name)}
                      </option>
                    ))}
                  </select>
                  {!branchId && (
                    <p className="text-[10px] text-rose-500 mt-1 font-medium">* กรุณาระบุสาขาสำหรับลูกค้า</p>
                  )}
                </div>
              </div>

              {/* Row 3A: Corporate B2B Details Banner */}
              {customerTier === "corporate" && (
                <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/70 to-amber-50/90 border border-amber-200/90 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                      <Building size={14} className="text-amber-600" />
                      ลูกค้าประเภทองค์กร / บริษัท (Corporate B2B Account)
                    </span>
                    <span className="text-[10px] font-extrabold text-amber-800 bg-white px-2.5 py-0.5 rounded-full border border-amber-300 shadow-2xs">
                      CORPORATE B2B
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                    ระบบเปิดตัวเลือกข้อมูลใบกำกับภาษี (Tax Invoice) และกำหนดระดับราคาสำหรับลูกค้าองค์กร/B2B โดยอัตโนมัติ
                  </p>
                  <div className="pt-2 border-t border-amber-200/60 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <Tag size={13} className="text-amber-700" /> ตารางราคา (Price List):
                      </span>
                      <select
                        value={priceListId}
                        onChange={e => setPriceListId(e.target.value)}
                        className="h-8.5 text-xs font-semibold bg-white border border-amber-300 rounded-xl px-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer w-full"
                      >
                        <option value="regular">Regular (Standard Base)</option>
                        {priceLists.map(pl => (
                          <option key={pl.id} value={pl.id}>
                            {pl.name} {pl.isDefault ? "(Default Base)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <Receipt size={13} className="text-amber-700" /> รูปแบบภาษี (VAT Treatment):
                      </span>
                      <select
                        value={customerVatType}
                        onChange={e => setCustomerVatType(e.target.value as any)}
                        className="h-8.5 text-xs font-semibold bg-white border border-amber-300 rounded-xl px-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer w-full"
                      >
                        <option value="default">🏢 ตามค่าเริ่มต้นของร้าน (Default)</option>
                        <option value="inclusive">📥 รวม VAT 7% ในราคาแล้ว (Inclusive VAT)</option>
                        <option value="exclusive">📤 คิด VAT 7% แยกต่างหาก (Exclusive VAT +7%)</option>
                        <option value="none">🚫 ไม่คิด VAT / ยกเว้นภาษี (No VAT)</option>
                      </select>
                    </div>

                    {/* Rider Commission Setting for Corporate */}
                    <div className="pt-2 border-t border-amber-200/60 space-y-2 col-span-1 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                          <Bike size={14} className="text-amber-700" /> ค่าคอมมิชชั่น Rider (Rider Commission Setting):
                        </span>
                        <span className="text-[10px] font-semibold text-amber-800">
                          กำหนดอัตราสำหรับลูกค้านิติบุคคลนี้โดยเฉพาะ
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="col-span-1">
                          <Label className="text-[10px] font-bold text-amber-900 uppercase block mb-1">รูปแบบค่าคอมมิชชั่น</Label>
                          <select
                            value={corporateCommissionType}
                            onChange={e => setCorporateCommissionType(e.target.value as any)}
                            className="h-8.5 text-xs font-semibold bg-white border border-amber-300 rounded-xl px-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer w-full"
                          >
                            <option value="default">🌐 ตามระบบปกติ (Default Distance)</option>
                            <option value="fixed">📍 ฟิกซ์ยอดคงที่ต่อเที่ยว (Fixed Amount)</option>
                            <option value="custom_km">📏 กำหนดเรทต่อ กม. (Custom ฿/km)</option>
                            <option value="none">🚫 ไม่คิดค่าคอม (No Commission ฿0)</option>
                          </select>
                        </div>

                        {corporateCommissionType === "fixed" && (
                          <>
                            <div className="col-span-1">
                              <Label className="text-[10px] font-bold text-amber-900 uppercase block mb-1">ค่าคอมรอบรับ (Pickup ฿)</Label>
                              <div className="relative">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={corporatePickupCommission === 0 ? "" : corporatePickupCommission}
                                  onChange={e => setCorporatePickupCommission(Math.max(0, parseFloat(e.target.value) || 0))}
                                  placeholder="0.00"
                                  className="h-8.5 text-xs font-mono font-bold bg-white border-amber-300 rounded-xl pl-2.5 pr-6"
                                />
                                <span className="absolute right-2.5 top-2 text-[10px] text-amber-700 font-bold select-none">฿</span>
                              </div>
                            </div>
                            <div className="col-span-1">
                              <Label className="text-[10px] font-bold text-amber-900 uppercase block mb-1">ค่าคอมรอบส่ง (Delivery ฿)</Label>
                              <div className="relative">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={corporateDeliveryCommission === 0 ? "" : corporateDeliveryCommission}
                                  onChange={e => setCorporateDeliveryCommission(Math.max(0, parseFloat(e.target.value) || 0))}
                                  placeholder="0.00"
                                  className="h-8.5 text-xs font-mono font-bold bg-white border-amber-300 rounded-xl pl-2.5 pr-6"
                                />
                                <span className="absolute right-2.5 top-2 text-[10px] text-amber-700 font-bold select-none">฿</span>
                              </div>
                            </div>
                          </>
                        )}

                        {corporateCommissionType === "custom_km" && (
                          <div className="col-span-1 sm:col-span-2">
                            <Label className="text-[10px] font-bold text-amber-900 uppercase block mb-1">เรทค่าคอมมิชชั่นต่อกิโลเมตร (฿/km)</Label>
                            <div className="relative">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                value={corporateCommissionRatePerKm === 0 ? "" : corporateCommissionRatePerKm}
                                onChange={e => setCorporateCommissionRatePerKm(Math.max(0, parseFloat(e.target.value) || 0))}
                                placeholder="0.00"
                                className="h-8.5 text-xs font-mono font-bold bg-white border-amber-300 rounded-xl pl-2.5 pr-14"
                              />
                              <span className="absolute right-2.5 top-2 text-[10px] text-amber-700 font-bold select-none">฿ / km</span>
                            </div>
                          </div>
                        )}

                        {corporateCommissionType === "none" && (
                          <div className="col-span-1 sm:col-span-2 flex items-center bg-amber-100/60 border border-amber-200 rounded-xl px-3 py-1.5 text-[11px] font-medium text-amber-900">
                            <span>🚫 ไม่จ่ายค่าคอมมิชชั่นให้ Rider สำหรับลูกค้านี้ (เช่น ใช้รถยนต์ของบริษัทหรือพนักงานประจำ)</span>
                          </div>
                        )}

                        {corporateCommissionType === "default" && (
                          <div className="col-span-1 sm:col-span-2 flex items-center bg-amber-100/60 border border-amber-200 rounded-xl px-3 py-1.5 text-[11px] font-medium text-amber-900">
                            <span>🌐 คำนวณตามระยะทางจริง x เรทมาตรฐานของระบบ (เช่น ฿2/กม.)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Row 3: Membership Details (Member ID, Start Date, Expiry Date) */}
              {(customerTier === "member" || customerTier === "vip" || Boolean(memberId)) && (
                <div className="bg-gradient-to-r from-indigo-50/90 via-blue-50/70 to-indigo-50/90 border border-indigo-200/90 rounded-2xl p-3.5 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                      <Crown size={14} className="text-amber-500 fill-amber-400" />
                      ข้อมูลสมาชิก & รหัส Member (Membership Details)
                    </span>
                    <span className="text-[10px] font-extrabold text-indigo-700 bg-white px-2.5 py-0.5 rounded-full border border-indigo-200 shadow-2xs">
                      {customerTier === "vip" ? "VIP MEMBER" : "MEMBER"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Member ID - Auto-Allocated on Save (Mode 2) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                          <Lock size={12} className="text-indigo-600" />
                          <span>Member ID</span>
                        </Label>
                        {customer?.memberId && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                            ASSIGNED
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <Input
                          readOnly
                          value={customer?.memberId || memberId || "AUTO RUNNING NO. ON SAVE"}
                          className={`h-9 border rounded-xl cursor-not-allowed select-all shadow-2xs ${
                            customer?.memberId || memberId
                              ? "border-indigo-200 bg-slate-50 text-indigo-950 font-mono font-black text-xs"
                              : "border-indigo-200/70 bg-indigo-50/50 text-indigo-700 font-bold text-[11px] tracking-tight"
                          }`}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {customer?.memberId || memberId
                          ? "* รหัสสมาชิกเดิมที่กำหนดไว้แล้ว"
                          : "* ออกเลขอัตโนมัติเมื่อกดบันทึก (เริ่ม OF2400)"
                        }
                      </p>
                    </div>

                    {/* Start Date */}
                    <div>
                      <Label className="text-xs font-bold text-slate-800 block mb-1">
                        Start Date (วันเริ่มสมาชิก)
                      </Label>
                      <Input
                        type="date"
                        value={memberStartDate}
                        onChange={e => {
                          const newStart = e.target.value;
                          setMemberStartDate(newStart);
                          if (newStart) {
                            setMemberExpiryDate(computeMembershipExpiryDate(newStart));
                          }
                        }}
                        className="h-9 text-xs border-indigo-200 rounded-xl bg-white focus-visible:ring-indigo-500 shadow-2xs font-medium text-slate-800"
                      />
                    </div>

                    {/* Expiry Date */}
                    <div>
                      <Label className="text-xs font-bold text-slate-800 block mb-1">
                        Expiry Date (วันหมดอายุ)
                      </Label>
                      <Input
                        type="date"
                        value={memberExpiryDate}
                        onChange={e => setMemberExpiryDate(e.target.value)}
                        className="h-9 text-xs border-indigo-200 rounded-xl bg-white focus-visible:ring-indigo-500 shadow-2xs font-medium text-slate-800"
                      />
                    </div>
                  </div>
                </div>
              )}
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
                      <span>🇹🇭</span> Default Thai Mobile <span className="text-rose-500 font-bold">*</span>
                    </span>
                    {!phone.trim() && !secondaryPhone.trim() ? (
                      <span className="text-[10px] text-rose-500 font-medium">บังคับระบุ (Required)</span>
                    ) : (
                      <span className="text-[10px] text-slate-400">Local +66</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`h-9 px-2.5 rounded-xl text-xs font-bold flex items-center shrink-0 border transition-all ${
                      !phone.trim() && !secondaryPhone.trim()
                        ? "bg-rose-50 border-rose-300 text-rose-800"
                        : "bg-white border-slate-300 text-slate-700"
                    }`}>
                      TH +66
                    </span>
                    <Input 
                      type="tel"
                      placeholder="08x-xxx-xxxx" 
                      value={phone} 
                      onChange={e => setPhone(e.target.value)} 
                      className={`h-9 text-xs rounded-xl font-mono font-bold transition-all border ${
                        duplicatePhoneCheck?.matchedOn === "primary" 
                          ? "border-rose-500 ring-1 ring-rose-500 bg-rose-50/20" 
                          : !phone.trim() && !secondaryPhone.trim()
                          ? "border-rose-400 focus:border-rose-500 text-rose-950 focus-visible:ring-1 focus-visible:ring-rose-400 bg-white"
                          : "border-slate-300 bg-white text-slate-800 focus-visible:ring-sky-500"
                      }`} 
                    />
                  </div>
                  {!phone.trim() && !secondaryPhone.trim() && (
                    <p className="text-[10px] text-rose-500 mt-1 font-medium">* ระบุเบอร์โทรศัพท์อย่างน้อย 1 เบอร์ (ไทย หรือ ต่างประเทศ)</p>
                  )}

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
                    <span className="text-[10px] text-slate-400">กรอกรหัสตรงๆ หรือค้นหาประเทศ</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <CountryCodeInput
                      value={intlCountryCode}
                      onChange={setIntlCountryCode}
                      className="shrink-0"
                    />
                    <Input 
                      type="tel"
                      placeholder="Phone number" 
                      value={secondaryPhone} 
                      onChange={e => setSecondaryPhone(e.target.value)} 
                      className={`h-9 text-xs rounded-xl bg-white font-mono flex-1 ${
                        duplicatePhoneCheck?.matchedOn === "secondary" ? "border-rose-500 ring-1 ring-rose-500 bg-rose-50/20" : "border-slate-300"
                      }`} 
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

                {/* Real-time duplicate phone alert */}
                {duplicatePhoneCheck && (
                  <div className="col-span-1 sm:col-span-2 bg-rose-50 border border-rose-300 rounded-xl p-3 flex items-start gap-2.5 text-rose-800 animate-in fade-in">
                    <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-0.5">
                      <p className="font-bold text-rose-900">
                        ⚠️ เบอร์โทรศัพท์นี้ ({duplicatePhoneCheck.matchedPhone}) มีอยู่ในระบบแล้ว!
                      </p>
                      <p className="text-[11px] text-rose-700">
                        ตรงกับลูกค้า: <strong>{duplicatePhoneCheck.customer.name}</strong> {duplicatePhoneCheck.customer.memberId ? `(รหัสสมาชิก #${duplicatePhoneCheck.customer.memberId})` : ""}
                        {duplicatePhoneCheck.customer.phone ? ` • เบอร์หลัก: ${duplicatePhoneCheck.customer.phone}` : ""}
                        {duplicatePhoneCheck.customer.secondaryPhone ? ` • เบอร์สำรอง: ${duplicatePhoneCheck.customer.secondaryPhone}` : ""}
                      </p>
                      <p className="text-[10px] text-rose-600 font-semibold pt-0.5">
                        ระบบไม่อนุญาตให้สร้างลูกค้าใหม่ด้วยเบอร์โทรซ้ำซ้อน
                      </p>
                    </div>
                  </div>
                )}
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
                  <select
                    value={
                      addressLabel === "Home Condo"
                        ? "Condo"
                        : ["Hotel", "Condo", "Home", "Office"].includes(addressLabel)
                        ? addressLabel
                        : "Other"
                    }
                    onChange={e => {
                      const val = e.target.value;
                      if (val === "Other") {
                        setAddressLabel(customAddressLabel.trim() || "Other");
                      } else {
                        setAddressLabel(val);
                      }
                    }}
                    className="w-full h-9 text-xs border border-slate-300 rounded-xl bg-white px-3 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer"
                  >
                    <option value="Hotel">Hotel (โรงแรม / เซอร์วิสอพาร์ทเมนท์)</option>
                    <option value="Condo">Condo (คอนโดมิเนียม)</option>
                    <option value="Home">Home (บ้านเดี่ยว / ทาวน์โฮม)</option>
                    <option value="Office">Office (ที่ทำงาน / ออฟฟิศ)</option>
                    <option value="Other">Other / อื่นๆ (ระบุเอง)</option>
                  </select>
                  {(!["Hotel", "Condo", "Home", "Home Condo", "Office"].includes(addressLabel) || addressLabel === "Other") && (
                    <Input 
                      placeholder="ระบุชื่อสถานที่ (e.g. Villa 5, โฮมโปร)" 
                      value={customAddressLabel || (addressLabel !== "Other" ? addressLabel : "")} 
                      onChange={e => {
                        setCustomAddressLabel(e.target.value);
                        setAddressLabel(e.target.value.trim() || "Other");
                      }} 
                      className="h-8 text-xs border-slate-300 rounded-xl mt-1.5 bg-slate-50/70" 
                    />
                  )}
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
                <Label className="text-xs font-bold text-slate-800 flex items-center justify-between mb-1">
                  <span>Condo / Building / Street Address <span className="text-rose-500 font-bold">*</span></span>
                  {!address.trim() && (
                    <span className="text-[10px] text-rose-500 font-medium">บังคับระบุ (Required)</span>
                  )}
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
                    className="flex-1"
                    inputClassName={`h-9 text-xs rounded-xl transition-all border ${
                      !address.trim()
                        ? "border-rose-400 focus:border-rose-500 text-rose-950 focus-visible:ring-1 focus-visible:ring-rose-400"
                        : "border-slate-300 text-slate-800 focus-visible:ring-sky-500"
                    }`}
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
                {!address.trim() && (
                  <p className="text-[10px] text-rose-500 mt-1 font-medium">* กรุณาระบุที่อยู่สำหรับจัดส่ง</p>
                )}
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

                  {customerTier !== "corporate" && (
                    <div className="pt-2 border-t border-amber-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                        <Receipt size={13} className="text-amber-700" /> รูปแบบภาษี (VAT Treatment):
                      </span>
                      <select
                        value={customerVatType}
                        onChange={e => setCustomerVatType(e.target.value as any)}
                        className="h-8.5 text-xs font-semibold bg-white border border-amber-300 rounded-xl px-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer w-full sm:w-72"
                      >
                        <option value="default">🏢 ตามค่าเริ่มต้นของร้าน (Default)</option>
                        <option value="inclusive">📥 รวม VAT 7% ในราคาแล้ว (Inclusive VAT)</option>
                        <option value="exclusive">📤 คิด VAT 7% แยกต่างหาก (Exclusive VAT +7%)</option>
                        <option value="none">🚫 ไม่คิด VAT / ยกเว้นภาษี (No VAT)</option>
                      </select>
                    </div>
                  )}
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
              disabled={isSaving || Boolean(duplicatePhoneCheck)}
              onClick={handleSave} 
              className={`h-10 px-6 font-bold text-xs rounded-full shadow-sm cursor-pointer transition-all ${
                duplicatePhoneCheck 
                  ? "bg-rose-600 hover:bg-rose-700 text-white opacity-70 cursor-not-allowed" 
                  : "bg-sky-600 hover:bg-sky-700 text-white"
              }`}
              title={duplicatePhoneCheck ? `เบอร์โทรนี้ซ้ำกับลูกค้า: ${duplicatePhoneCheck.customer.name}` : undefined}
            >
              {isSaving ? "Saving..." : duplicatePhoneCheck ? "เบอร์โทรซ้ำในระบบ (Duplicate Phone)" : "Save Customer to CRM"}
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
              <div className="p-6 space-y-3.5 text-xs max-h-[75vh] overflow-y-auto">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                  <span className="font-bold text-slate-500 uppercase tracking-wider">Current Balance</span>
                  <span className={`text-2xl font-black ${(customer.creditBalance || 0) < 0 ? "text-rose-600" : "text-slate-900"}`}>
                    {formatBaht(customer.creditBalance || 0)}
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

                {/* Member Expiry Date Input */}
                <div className="space-y-1.5 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between">
                    <Label className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Calendar size={13} className="text-indigo-600" />
                      <span>วันหมดอายุสมาชิก (Member Expiry Date)</span>
                    </Label>
                    {customer?.memberExpiryDate && (
                      <span className="text-[10px] text-slate-500">
                        เดิม: <strong className={new Date(customer.memberExpiryDate).getTime() < Date.now() ? "text-rose-600 font-bold" : "text-emerald-700 font-bold"}>
                          {format(new Date(customer.memberExpiryDate), "dd/MM/yyyy")}
                        </strong>
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Input 
                      type="date"
                      value={adjustExpiryDate}
                      onChange={e => setAdjustExpiryDate(e.target.value)}
                      className="h-9 text-xs rounded-xl bg-white border-slate-200 text-slate-900"
                    />
                    {adjustExpiryDate && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAdjustExpiryDate("")}
                        className="h-9 px-2.5 text-[11px] font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 border-slate-200 rounded-xl cursor-pointer"
                        title="ล้างวันหมดอายุ"
                      >
                        ล้าง
                      </Button>
                    )}
                  </div>
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
