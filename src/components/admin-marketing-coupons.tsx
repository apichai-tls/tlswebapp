"use client";

import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { 
  Ticket, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Search, 
  X, 
  Plus, 
  Layers, 
  Loader2, 
  Check, 
  Copy, 
  Truck, 
  Eye, 
  Ban, 
  Trash2 
} from "lucide-react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/providers/auth-provider";
import { useCustomers } from "@/lib/use-customers";
import { type Customer, type CustomerCoupon } from "@/lib/store";
import { 
  getCustomerCouponsAction, 
  updateCustomerCouponStatusAction, 
  deleteCustomerCouponAction 
} from "@/actions/db";
import { AdminIssueCouponDialog } from "@/components/admin-issue-coupon-dialog";
import { AdminCouponTemplateModal } from "@/components/admin-coupon-template-modal";
import { AdminCustomerProfileModal } from "@/components/admin-customer-profile-modal";

export function AdminMarketingCoupons() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const customers = useCustomers();

  // Data states
  const [allCoupons, setAllCoupons] = useState<CustomerCoupon[]>([]);
  const [isLoadingAllCoupons, setIsLoadingAllCoupons] = useState(false);
  const [couponSearchQuery, setCouponSearchQuery] = useState("");
  const [couponStatusFilter, setCouponStatusFilter] = useState<"all" | "ACTIVE" | "USED" | "EXPIRED" | "VOID">("all");
  const [couponBrandFilter, setCouponBrandFilter] = useState<"all" | "that_laundry_shop" | "noname_laundry">("all");
  const [issueCouponModalOpen, setIssueCouponModalOpen] = useState(false);
  const [couponTemplateModalOpen, setCouponTemplateModalOpen] = useState(false);
  const [copiedCouponId, setCopiedCouponId] = useState<string | null>(null);
  const [couponPage, setCouponPage] = useState(1);
  const couponPageSize = 20;

  // Customer Profile Modal state
  const [selectedProfileCustomer, setSelectedProfileCustomer] = useState<Customer | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const fetchCoupons = async () => {
    setIsLoadingAllCoupons(true);
    try {
      const res = await getCustomerCouponsAction({});
      if (res.success && res.coupons) {
        setAllCoupons(res.coupons as unknown as CustomerCoupon[]);
      }
    } catch (err) {
      console.error("Failed to load customer coupons:", err);
    } finally {
      setIsLoadingAllCoupons(false);
    }
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const handleCopyCouponCode = (coupon: CustomerCoupon) => {
    navigator.clipboard.writeText(coupon.code);
    setCopiedCouponId(coupon.id);
    toast.success(`คัดลอกโค้ด ${coupon.code} เรียบร้อยแล้ว`);
    setTimeout(() => setCopiedCouponId(null), 2000);
  };

  const handleVoidCoupon = async (coupon: CustomerCoupon) => {
    if (!confirm(`คุณต้องการยกเลิกคูปอง "${coupon.code}" (${coupon.name}) ใช่หรือไม่?`)) return;
    try {
      const res = await updateCustomerCouponStatusAction(coupon.id, "VOID");
      if (res.success) {
        toast.success("ยกเลิกคูปองเรียบร้อย");
        fetchCoupons();
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการยกเลิกคูปอง");
      }
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาด");
    }
  };

  const handleDeleteCoupon = async (coupon: CustomerCoupon) => {
    if (!confirm(`คุณต้องการลบคูปอง "${coupon.code}" (${coupon.name}) ออกจากระบบถาวรใช่หรือไม่?`)) return;
    try {
      const res = await deleteCustomerCouponAction(coupon.id);
      if (res.success) {
        toast.success("ลบคูปองเรียบร้อยแล้ว");
        fetchCoupons();
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการลบคูปอง");
      }
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาด");
    }
  };

  const handleOpenProfileByCustomerId = (customerId: string) => {
    const cust = customers.find(c => c.id === customerId);
    if (cust) {
      setSelectedProfileCustomer(cust);
      setProfileOpen(true);
    } else {
      toast.error("ไม่พบข้อมูลลูกค้าในระบบ");
    }
  };

  const renderDiscountBadge = (coupon: CustomerCoupon) => {
    switch (coupon.discountType) {
      case "PERCENTAGE":
        return <span className="font-black text-rose-600">-{coupon.discountValue}%</span>;
      case "FREE_DELIVERY":
        return (
          <span className="font-black text-sky-600 flex items-center gap-1">
            <Truck size={13} /> ฟรีค่าส่ง
          </span>
        );
      case "CASH_VOUCHER":
        return <span className="font-black text-amber-600">วอยเชอร์ ฿{coupon.discountValue}</span>;
      case "FIXED":
      default:
        return <span className="font-black text-emerald-600">-฿{coupon.discountValue}</span>;
    }
  };

  const filteredCoupons = useMemo(() => {
    return allCoupons.filter(c => {
      if (couponBrandFilter !== "all") {
        if (couponBrandFilter === "that_laundry_shop" && c.brand && c.brand !== "that_laundry_shop") return false;
        if (couponBrandFilter === "noname_laundry" && c.brand !== "noname_laundry") return false;
      }
      if (couponStatusFilter !== "all") {
        if (c.status !== couponStatusFilter) return false;
      }
      if (couponSearchQuery.trim()) {
        const q = couponSearchQuery.trim().toLowerCase();
        const codeMatch = c.code.toLowerCase().includes(q);
        const nameMatch = c.name.toLowerCase().includes(q);
        const custNameMatch = (c.customerName || "").toLowerCase().includes(q);
        const custPhoneMatch = (c.customerPhone || "").includes(q);
        const reasonMatch = (c.issuedReason || "").toLowerCase().includes(q);
        if (!codeMatch && !nameMatch && !custNameMatch && !custPhoneMatch && !reasonMatch) return false;
      }
      return true;
    });
  }, [allCoupons, couponBrandFilter, couponStatusFilter, couponSearchQuery]);

  const couponStats = useMemo(() => {
    return {
      total: allCoupons.length,
      active: allCoupons.filter(c => c.status === "ACTIVE").length,
      used: allCoupons.filter(c => c.status === "USED").length,
      expiredOrVoid: allCoupons.filter(c => c.status === "EXPIRED" || c.status === "VOID").length
    };
  }, [allCoupons]);

  const totalPages = Math.max(1, Math.ceil(filteredCoupons.length / couponPageSize));
  const paginatedCoupons = useMemo(() => {
    const start = (couponPage - 1) * couponPageSize;
    return filteredCoupons.slice(start, start + couponPageSize);
  }, [filteredCoupons, couponPage, couponPageSize]);

  return (
    <div className="space-y-6">
      {/* 1. Quick Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Coupons (คูปองทั้งหมด)</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{couponStats.total}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Ticket size={20} />
          </div>
        </div>

        <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Active (พร้อมใช้งาน)</p>
            <h3 className="text-2xl font-black text-emerald-700 mt-1">{couponStats.active}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-100/70 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <Sparkles size={20} />
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Used (ใช้งานแล้ว)</p>
            <h3 className="text-2xl font-black text-slate-700 mt-1">{couponStats.used}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-200/70 border border-slate-300 flex items-center justify-center text-slate-600">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-amber-50/50 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Expired / Void (หมดอายุ/ยกเลิก)</p>
            <h3 className="text-2xl font-black text-amber-700 mt-1">{couponStats.expiredOrVoid}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100/70 border border-amber-200 flex items-center justify-center text-amber-600">
            <Clock size={20} />
          </div>
        </div>
      </div>

      {/* 2. Controls & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search */}
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search code, customer, phone (ค้นหาโค้ด, ชื่อลูกค้า, เบอร์โทร)..."
              value={couponSearchQuery}
              onChange={(e) => {
                setCouponSearchQuery(e.target.value);
                setCouponPage(1);
              }}
              className="pl-9 h-9 text-xs bg-white rounded-xl border-slate-200"
            />
            {couponSearchQuery && (
              <button
                type="button"
                onClick={() => setCouponSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={couponStatusFilter}
            onChange={(e) => {
              setCouponStatusFilter(e.target.value as any);
              setCouponPage(1);
            }}
            className="h-9 px-3 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm cursor-pointer"
          >
            <option value="all">All Status (สถานะทั้งหมด) ({allCoupons.length})</option>
            <option value="ACTIVE">Active (พร้อมใช้งาน) ({allCoupons.filter(c => c.status === "ACTIVE").length})</option>
            <option value="USED">Used (ใช้งานแล้ว) ({allCoupons.filter(c => c.status === "USED").length})</option>
            <option value="EXPIRED">Expired (หมดอายุ) ({allCoupons.filter(c => c.status === "EXPIRED").length})</option>
            <option value="VOID">Void (ยกเลิก) ({allCoupons.filter(c => c.status === "VOID").length})</option>
          </select>

          {/* Brand Filter */}
          <select
            value={couponBrandFilter}
            onChange={(e) => {
              setCouponBrandFilter(e.target.value as any);
              setCouponPage(1);
            }}
            className="h-9 px-3 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm cursor-pointer"
          >
            <option value="all">All Brands (ทุกแบรนด์)</option>
            <option value="that_laundry_shop">That Laundry Shop (TLS)</option>
            <option value="noname_laundry">Noname Laundry</option>
          </select>
        </div>

        {/* Action: + Issue Coupon & Templates Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCouponTemplateModalOpen(true)}
            className="h-9 px-3.5 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 text-slate-700 font-bold text-xs rounded-xl gap-1.5 shadow-2xs cursor-pointer"
          >
            <Layers size={14} className="text-indigo-600" />
            <span>Templates (จัดการแม่แบบ)</span>
          </Button>
          <Button
            type="button"
            onClick={() => setIssueCouponModalOpen(true)}
            className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus size={15} />
            <span>+ Issue Coupon (แจกคูปอง)</span>
          </Button>
        </div>
      </div>

      {/* 3. Table */}
      <div className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200">
              <TableHead className="py-3.5 pl-6 font-bold text-xs text-slate-600 uppercase">Coupon Code & Benefit (รหัสคูปอง & ส่วนลด)</TableHead>
              <TableHead className="py-3.5 font-bold text-xs text-slate-600 uppercase">Coupon Name (ชื่อคูปอง)</TableHead>
              <TableHead className="py-3.5 font-bold text-xs text-slate-600 uppercase">Customer (ลูกค้าผู้ถือสิทธิ์)</TableHead>
              <TableHead className="py-3.5 font-bold text-xs text-slate-600 uppercase">Conditions (เงื่อนไข)</TableHead>
              <TableHead className="py-3.5 font-bold text-xs text-slate-600 uppercase">Expiry Date (วันหมดอายุ)</TableHead>
              <TableHead className="py-3.5 font-bold text-xs text-slate-600 uppercase text-center">Status (สถานะ)</TableHead>
              <TableHead className="py-3.5 pr-6 font-bold text-xs text-slate-600 uppercase text-right">Action (จัดการ)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingAllCoupons ? (
              <TableRow>
                <TableCell colSpan={7} className="h-44 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-indigo-600">
                    <Loader2 size={24} className="animate-spin" />
                    <span className="text-xs font-bold text-slate-500">กำลังโหลดรายการคูปอง...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredCoupons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-44 text-center">
                  <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                    <Ticket size={32} className="text-slate-300" />
                    <p className="font-bold text-sm text-slate-600">ไม่พบคูปองที่ตรงกับเงื่อนไขการค้นหา</p>
                    <p className="text-xs text-slate-400">ลองเปลี่ยนคำค้นหา หรือกดปุ่ม "แจกคูปองให้ลูกค้า" เพื่อออกคูปองใหม่</p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setIssueCouponModalOpen(true)}
                      className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl h-8 px-3.5 gap-1.5 cursor-pointer"
                    >
                      <Plus size={13} /> + แจกคูปองใหม่
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginatedCoupons.map((coupon) => {
                const isActive = coupon.status === "ACTIVE";
                const isUsed = coupon.status === "USED";
                const isExpired = coupon.status === "EXPIRED";
                const isVoid = coupon.status === "VOID";

                return (
                  <TableRow key={coupon.id} className="hover:bg-slate-50/60 transition-colors border-b border-slate-100">
                    {/* Code & Discount */}
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                          <Ticket size={16} />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-xs text-slate-800 tracking-wider bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {coupon.code}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyCouponCode(coupon)}
                              className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer p-0.5"
                              title="คัดลอกรหัส"
                            >
                              {copiedCouponId === coupon.id ? (
                                <Check size={13} className="text-emerald-600" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>
                          <div className="text-xs font-black">
                            {renderDiscountBadge(coupon)}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Name & Details */}
                    <TableCell className="py-4">
                      <div className="space-y-0.5 max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-800 text-xs truncate">
                            {coupon.name}
                          </span>
                          {coupon.brand && (
                            <Badge variant="outline" className="text-[9px] font-bold py-0 h-4 border-slate-200 text-slate-500">
                              {coupon.brand === "that_laundry_shop" ? "TLS" : "NoName"}
                            </Badge>
                          )}
                        </div>
                        {coupon.description && (
                          <p className="text-[11px] text-slate-400 line-clamp-1">{coupon.description}</p>
                        )}
                        {coupon.issuedReason && (
                          <p className="text-[10px] text-slate-400 italic">Reason (เหตุผล): {coupon.issuedReason}</p>
                        )}
                      </div>
                    </TableCell>

                    {/* Customer Info */}
                    <TableCell className="py-4">
                      <div className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => handleOpenProfileByCustomerId(coupon.customerId)}
                          className="font-bold text-xs text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer text-left block truncate max-w-[180px]"
                          title="View Customer Profile (ดูโปรไฟล์ลูกค้า)"
                        >
                          {coupon.customerName || "—"}
                        </button>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {coupon.customerPhone || "—"}
                        </div>
                      </div>
                    </TableCell>

                    {/* Conditions */}
                    <TableCell className="py-4 text-xs text-slate-600">
                      <div className="space-y-0.5 text-[11px]">
                        <div>
                          {coupon.minOrderAmount && coupon.minOrderAmount > 0 ? (
                            <span>Min (ขั้นต่ำ): <strong>฿{coupon.minOrderAmount.toLocaleString()}</strong></span>
                          ) : (
                            <span className="text-slate-400">No Min (ไม่มีขั้นต่ำ)</span>
                          )}
                        </div>
                        {coupon.maxDiscount && coupon.maxDiscount > 0 && (
                          <div className="text-slate-500">
                            Max (ลดสูงสุด): <strong>฿{coupon.maxDiscount.toLocaleString()}</strong>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Validity */}
                    <TableCell className="py-4 text-xs text-slate-600">
                      <div className="space-y-0.5 text-[11px]">
                        {coupon.expiryDate ? (
                          <div>
                            <span className="font-medium">{format(new Date(coupon.expiryDate), "dd/MM/yyyy")}</span>
                            {isActive && (
                              <div className="text-[10px] text-emerald-600 font-semibold">
                                {Math.max(0, Math.ceil((new Date(coupon.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} days left (เหลือ {Math.max(0, Math.ceil((new Date(coupon.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))} วัน)
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">No Expiry (ไม่มีวันหมดอายุ)</span>
                        )}
                        <div className="text-[10px] text-slate-400">
                          Issued (ออกเมื่อ): {format(new Date(coupon.issuedAt || coupon.createdAt || Date.now()), "dd/MM/yyyy")}
                        </div>
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-4 text-center">
                      {isActive && (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 font-bold text-[10px]">
                          Active (พร้อมใช้งาน)
                        </Badge>
                      )}
                      {isUsed && (
                        <div className="space-y-0.5">
                          <Badge className="bg-slate-100 text-slate-700 border-slate-200 font-bold text-[10px]">
                            Used (ใช้งานแล้ว)
                          </Badge>
                          {coupon.usedAt && (
                            <div className="text-[10px] text-slate-400 font-medium">
                              {format(new Date(coupon.usedAt), "dd/MM/yy")}
                            </div>
                          )}
                        </div>
                      )}
                      {isExpired && (
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 font-bold text-[10px]">
                          Expired (หมดอายุ)
                        </Badge>
                      )}
                      {isVoid && (
                        <Badge className="bg-rose-100 text-rose-800 border-rose-200 font-bold text-[10px]">
                          Void (ยกเลิกแล้ว)
                        </Badge>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="pr-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                          title="คัดลอกรหัสคูปอง"
                          onClick={() => handleCopyCouponCode(coupon)}
                        >
                          {copiedCouponId === coupon.id ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        </Button>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                          title="ดูโปรไฟล์ลูกค้า"
                          onClick={() => handleOpenProfileByCustomerId(coupon.customerId)}
                        >
                          <Eye size={13} />
                        </Button>

                        {isActive && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="ยกเลิกคูปอง (Void)"
                            onClick={() => handleVoidCoupon(coupon)}
                          >
                            <Ban size={13} />
                          </Button>
                        )}

                        {isAdmin && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="ลบคูปองถาวร"
                            onClick={() => handleDeleteCoupon(coupon)}
                          >
                            <Trash2 size={13} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-slate-500 font-medium">
            แสดงหน้า <span className="font-bold text-slate-800">{couponPage}</span> จาก <span className="font-bold text-slate-800">{totalPages}</span> ({filteredCoupons.length} รายการ)
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={couponPage <= 1}
              onClick={() => setCouponPage(p => Math.max(1, p - 1))}
              className="h-8 text-xs font-bold rounded-lg cursor-pointer"
            >
              ก่อนหน้า
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={couponPage >= totalPages}
              onClick={() => setCouponPage(p => Math.min(totalPages, p + 1))}
              className="h-8 text-xs font-bold rounded-lg cursor-pointer"
            >
              ถัดไป
            </Button>
          </div>
        </div>
      )}

      {/* Issue Coupon Modal */}
      {issueCouponModalOpen && (
        <AdminIssueCouponDialog
          open={issueCouponModalOpen}
          onOpenChange={setIssueCouponModalOpen}
          onSuccess={() => fetchCoupons()}
        />
      )}

      {/* Coupon Template Management Modal */}
      {couponTemplateModalOpen && (
        <AdminCouponTemplateModal
          open={couponTemplateModalOpen}
          onOpenChange={setCouponTemplateModalOpen}
        />
      )}

      {/* Customer Profile Modal for quick view */}
      {profileOpen && selectedProfileCustomer && (
        <AdminCustomerProfileModal
          customer={selectedProfileCustomer}
          open={profileOpen}
          onOpenChange={setProfileOpen}
          onEditCustomer={() => {}}
        />
      )}
    </div>
  );
}
