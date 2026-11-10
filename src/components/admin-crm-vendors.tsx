'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  Phone,
  Mail,
  MessageSquare,
  MapPin,
  FileText,
  CreditCard,
  Clock,
  Edit2,
  Trash2,
  Package,
  ShoppingBag,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Truck,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  SupplyVendor,
  CatalogSupplyItem,
  SupplyOrder,
  SUPPLY_CATEGORY_LABELS,
  SupplyItemCategory,
  DEFAULT_SUPPLY_VENDORS,
} from '@/types/supply-order';
import {
  getSupplyVendorsAction,
  saveSupplyVendorAction,
  deleteSupplyVendorAction,
  getSupplyCatalogAction,
  getSupplyOrdersAction,
} from '@/actions/db';

interface AdminCrmVendorsProps {
  currentUser?: any;
}

export function AdminCrmVendors({ currentUser }: AdminCrmVendorsProps) {
  const [vendors, setVendors] = useState<SupplyVendor[]>(DEFAULT_SUPPLY_VENDORS);
  const [catalog, setCatalog] = useState<CatalogSupplyItem[]>([]);
  const [supplyOrders, setSupplyOrders] = useState<SupplyOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Partial<SupplyVendor> | null>(null);
  const [saving, setSaving] = useState(false);

  const [selectedVendorDetail, setSelectedVendorDetail] = useState<SupplyVendor | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [vndRes, catRes, ordRes] = await Promise.all([
        getSupplyVendorsAction(),
        getSupplyCatalogAction(),
        getSupplyOrdersAction('all'),
      ]);
      if (vndRes.success && vndRes.vendors) setVendors(vndRes.vendors);
      if (catRes.success && catRes.items) setCatalog(catRes.items);
      if (ordRes.success && ordRes.orders) setSupplyOrders(ordRes.orders);
    } catch (e: any) {
      toast.error('Failed to load vendor CRM data: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredVendors = useMemo(() => {
    return vendors.filter((v) => {
      const matchCat = categoryFilter === 'all' || v.category === categoryFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchQ =
        !q ||
        v.name.toLowerCase().includes(q) ||
        v.code?.toLowerCase().includes(q) ||
        v.contactPerson?.toLowerCase().includes(q) ||
        v.phone?.toLowerCase().includes(q) ||
        v.lineId?.toLowerCase().includes(q) ||
        v.notes?.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [vendors, categoryFilter, searchQuery]);

  // Compute linked catalog items and PO stats per vendor
  const vendorStatsMap = useMemo(() => {
    const map: Record<
      string,
      { items: CatalogSupplyItem[]; orders: SupplyOrder[]; totalSpend: number }
    > = {};

    for (const v of vendors) {
      const vNameLower = v.name.toLowerCase();
      const linkedItems = catalog.filter(
        (it) =>
          it.vendorId === v.id ||
          (it.vendor &&
            (it.vendor.toLowerCase() === vNameLower ||
              vNameLower.includes(it.vendor.toLowerCase()) ||
              it.vendor.toLowerCase().includes(vNameLower.split(' ')[0])))
      );

      const linkedOrders = supplyOrders.filter(
        (o) =>
          o.status !== 'cancelled' &&
          ((o as any).vendorId === v.id ||
            (o.vendorName &&
              (o.vendorName.toLowerCase() === vNameLower ||
                vNameLower.includes(o.vendorName.toLowerCase()))))
      );

      const totalSpend = linkedOrders.reduce((acc, o) => acc + (o.totalEstimatedCost || 0), 0);
      map[v.id] = { items: linkedItems, orders: linkedOrders, totalSpend };
    }
    return map;
  }, [vendors, catalog, supplyOrders]);

  const handleOpenCreate = () => {
    setEditingVendor({
      id: '',
      code: `VD-${String(vendors.length + 1).padStart(3, '0')}`,
      name: '',
      category: 'chemical',
      contactPerson: '',
      phone: '',
      lineId: '',
      email: '',
      orderChannel: 'LINE OA',
      address: '',
      taxId: '',
      paymentTerms: 'Credit 30 Days',
      leadTimeDays: 2,
      minOrderAmount: 1000,
      bankAccount: '',
      notes: '',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (vendor: SupplyVendor) => {
    setEditingVendor({ ...vendor });
    setIsModalOpen(true);
  };

  const handleSaveVendor = async () => {
    if (!editingVendor?.name?.trim()) {
      toast.error('กรุณาระบุชื่อบริษัท / ร้านค้าซัพพลายเออร์ (Vendor Name)');
      return;
    }
    try {
      setSaving(true);
      const res = await saveSupplyVendorAction({
        id: editingVendor.id || undefined,
        code: editingVendor.code,
        name: editingVendor.name,
        category: editingVendor.category,
        contactPerson: editingVendor.contactPerson,
        phone: editingVendor.phone,
        lineId: editingVendor.lineId,
        email: editingVendor.email,
        orderChannel: editingVendor.orderChannel,
        address: editingVendor.address,
        taxId: editingVendor.taxId,
        paymentTerms: editingVendor.paymentTerms,
        leadTimeDays: Number(editingVendor.leadTimeDays) || 2,
        minOrderAmount: Number(editingVendor.minOrderAmount) || 0,
        bankAccount: editingVendor.bankAccount,
        notes: editingVendor.notes,
        isActive: editingVendor.isActive !== false,
      });

      if (res.success && res.vendors) {
        toast.success(
          editingVendor.id ? 'อัปเดตข้อมูล Vendor เรียบร้อยแล้ว' : 'เพิ่ม Vendor ใหม่ในระบบ CRM เรียบร้อยแล้ว'
        );
        setVendors(res.vendors);
        setIsModalOpen(false);
        setEditingVendor(null);
      } else {
        toast.error(res.error || 'Failed to save vendor');
      }
    } catch (e: any) {
      toast.error('Error saving vendor: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVendor = async (vendor: SupplyVendor) => {
    if (!confirm(`ยืนยันการลบข้อมูลซัพพลายเออร์ "${vendor.name}" ออกจากระบบ?`)) return;
    try {
      const res = await deleteSupplyVendorAction(vendor.id);
      if (res.success && res.vendors) {
        toast.success(`ลบ "${vendor.name}" เรียบร้อยแล้ว`);
        setVendors(res.vendors);
        if (selectedVendorDetail?.id === vendor.id) setSelectedVendorDetail(null);
      } else {
        toast.error(res.error || 'Failed to delete vendor');
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-sky-950 text-white p-5 sm:p-6 rounded-2xl shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              <Building2 size={20} />
            </span>
            <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
              <span>Supply Vendors CRM</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white/10 text-sky-200 border border-white/15">
                ทะเบียนซัพพลายเออร์น้ำยาและอุปกรณ์
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl">
            Manage chemical & packaging suppliers, contact channels (LINE / Phone), credit terms, and purchase order history connected to Order Supplies (จัดการข้อมูลผู้จำหน่าย ช่องทางสั่งซื้อ และประวัติ PO)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="h-9 px-3 bg-white/10 hover:bg-white/20 border-white/20 text-white font-bold text-xs rounded-xl cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="ml-1.5">Refresh</span>
          </Button>
          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="h-9 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-extrabold text-xs rounded-xl shadow-md gap-1.5 cursor-pointer"
          >
            <Plus size={15} />
            <span>+ Add Vendor (เพิ่มซัพพลายเออร์)</span>
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="bg-white rounded-2xl border border-slate-200/80 border-t-4 border-t-indigo-500 p-4 shadow-2xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Total Registered Vendors
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{vendors.length}</span>
            <span className="text-xs font-semibold text-indigo-600">suppliers</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Active: {vendors.filter((v) => v.isActive !== false).length} companies
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 border-t-4 border-t-sky-500 p-4 shadow-2xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Catalog Items Linked
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-sky-700">
              {catalog.filter((c) => c.vendor || c.vendorId).length}
            </span>
            <span className="text-xs font-semibold text-slate-500">/ {catalog.length} items</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Assigned to preferred supplier</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 border-t-4 border-t-emerald-500 p-4 shadow-2xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Credit Term Vendors
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">
              {vendors.filter((v) => v.paymentTerms?.toLowerCase().includes('credit')).length}
            </span>
            <span className="text-xs font-semibold text-emerald-700">accounts</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">30-Day billing cycle</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 border-t-4 border-t-amber-500 p-4 shadow-2xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Total Supply Orders (PO)
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600">
              {supplyOrders.filter((o) => o.status !== 'cancelled').length}
            </span>
            <span className="text-xs font-semibold text-amber-700">orders</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Est. ฿
            {supplyOrders
              .filter((o) => o.status !== 'cancelled')
              .reduce((s, o) => s + (o.totalEstimatedCost || 0), 0)
              .toLocaleString()}
          </p>
        </div>
      </div>

      {/* Search & Category Filter */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vendors by company name, code, contact person, phone, or LINE ID (ค้นหาซัพพลายเออร์)..."
              className="pl-9 h-10 text-xs bg-slate-50 border-slate-200 rounded-xl focus:bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              categoryFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Categories ({vendors.length})
          </button>
          {Object.entries(SUPPLY_CATEGORY_LABELS).map(([catKey, cfg]) => {
            const count = vendors.filter((v) => v.category === catKey).length;
            const isSelected = categoryFilter === catKey;
            return (
              <button
                key={catKey}
                type="button"
                onClick={() => setCategoryFilter(catKey)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.en}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Vendor Cards Grid */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <RefreshCw size={26} className="animate-spin mx-auto text-indigo-600 mb-2" />
          <p className="text-sm font-bold text-slate-700">Loading Vendor CRM Directory...</p>
        </div>
      ) : filteredVendors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center space-y-3">
          <Building2 size={32} className="mx-auto text-slate-400" />
          <div className="text-sm font-bold text-slate-700">No vendors found (ไม่พบรายชื่อซัพพลายเออร์)</div>
          <Button
            size="sm"
            onClick={handleOpenCreate}
            className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl"
          >
            + Add New Vendor (เพิ่มซัพพลายเออร์ใหม่)
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredVendors.map((vendor) => {
            const catCfg =
              SUPPLY_CATEGORY_LABELS[vendor.category as SupplyItemCategory] ||
              SUPPLY_CATEGORY_LABELS.other;
            const vStat = vendorStatsMap[vendor.id] || { items: [], orders: [], totalSpend: 0 };

            return (
              <div
                key={vendor.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 transition-all shadow-2xs hover:shadow-md p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  {/* Top Row: Code, Category, Status */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black bg-indigo-50 text-indigo-900 border border-indigo-200 px-2 py-0.5 rounded-md">
                        {vendor.code}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700">
                        <span>{catCfg.icon}</span>
                        <span>{catCfg.en}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {vendor.orderChannel && (
                        <Badge className="bg-sky-50 text-sky-700 border-sky-200 font-bold text-[10px]">
                          Channel: {vendor.orderChannel}
                        </Badge>
                      )}
                      {vendor.isActive !== false ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-[10px] gap-1">
                          <CheckCircle2 size={10} /> Active
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-500 border-slate-200 font-bold text-[10px] gap-1">
                          <XCircle size={10} /> Inactive
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Vendor Name & Contact Person */}
                  <div>
                    <h3 className="text-base font-black text-slate-900 leading-snug">
                      {vendor.name}
                    </h3>
                    {vendor.contactPerson && (
                      <p className="text-xs font-semibold text-slate-600 mt-0.5">
                        Contact (ผู้ติดต่อ): <span className="text-slate-900 font-bold">{vendor.contactPerson}</span>
                      </p>
                    )}
                  </div>

                  {/* Contact Channels Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Phone size={13} className="text-indigo-600 shrink-0" />
                      <span className="font-bold">{vendor.phone || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-700">
                      <MessageSquare size={13} className="text-emerald-600 shrink-0" />
                      <span className="font-bold text-emerald-700">
                        LINE: {vendor.lineId || '-'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <CreditCard size={13} className="text-amber-600 shrink-0" />
                      <span>
                        Terms: <strong className="text-slate-800">{vendor.paymentTerms || 'Cash'}</strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Truck size={13} className="text-sky-600 shrink-0" />
                      <span>
                        Lead Time: <strong className="text-slate-800">{vendor.leadTimeDays || 2} days</strong>
                        {vendor.minOrderAmount ? ` (Min ฿${vendor.minOrderAmount.toLocaleString()})` : ''}
                      </span>
                    </div>
                  </div>

                  {vendor.notes && (
                    <p className="text-xs text-slate-500 bg-amber-50/50 border border-amber-200/60 p-2.5 rounded-xl leading-relaxed">
                      💡 {vendor.notes}
                    </p>
                  )}

                  {/* Linked Catalog Supplies Preview */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                      <span>Linked Catalog Supplies ({vStat.items.length} รายการ):</span>
                      {vStat.orders.length > 0 && (
                        <span className="text-indigo-700">
                          {vStat.orders.length} POs (฿{vStat.totalSpend.toLocaleString()})
                        </span>
                      )}
                    </div>
                    {vStat.items.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {vStat.items.slice(0, 4).map((it) => (
                          <span
                            key={it.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-900 border border-sky-200/70"
                          >
                            <span>{it.name}</span>
                            <span className="font-black text-sky-700">฿{it.estimatedPrice}</span>
                          </span>
                        ))}
                        {vStat.items.length > 4 && (
                          <span className="text-[11px] font-bold text-slate-500 px-1.5 py-0.5">
                            +{vStat.items.length - 4} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">
                        No catalog items linked yet (ยังไม่ได้ผูกสินค้า)
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedVendorDetail(vendor)}
                    className="h-8 px-3 text-xs font-bold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 gap-1.5 cursor-pointer"
                  >
                    <Package size={13} />
                    <span>Items & PO History ({vStat.items.length} รายการ)</span>
                  </Button>

                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenEdit(vendor)}
                      className="h-8 px-3 text-xs font-bold rounded-xl border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-1 cursor-pointer"
                    >
                      <Edit2 size={12} />
                      <span>Edit (แก้ไข)</span>
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDeleteVendor(vendor)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete Vendor"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Vendor Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-2xl">
          <DialogHeader className="p-5 bg-gradient-to-r from-indigo-950 to-slate-900 text-white">
            <DialogTitle className="text-base font-black text-white flex items-center gap-2">
              <Building2 size={18} className="text-indigo-300" />
              <span>
                {editingVendor?.id
                  ? `Edit Supply Vendor (${editingVendor.code} / แก้ไขซัพพลายเออร์)`
                  : 'Add Supply Vendor (เพิ่มซัพพลายเออร์ใหม่)'}
              </span>
            </DialogTitle>
          </DialogHeader>

          {editingVendor && (
            <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Vendor Code (รหัส)</label>
                  <Input
                    value={editingVendor.code || ''}
                    onChange={(e) => setEditingVendor({ ...editingVendor, code: e.target.value })}
                    placeholder="VD-001"
                    className="h-9 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-slate-700">
                    Vendor / Company Name (ชื่อบริษัท/ร้านค้า) *
                  </label>
                  <Input
                    value={editingVendor.name || ''}
                    onChange={(e) => setEditingVendor({ ...editingVendor, name: e.target.value })}
                    placeholder="e.g. Ecolab Chemical / Siam Poly Pack"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Primary Category (หมวดหมู่หลัก)</label>
                  <select
                    value={editingVendor.category || 'chemical'}
                    onChange={(e) =>
                      setEditingVendor({ ...editingVendor, category: e.target.value as any })
                    }
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800"
                  >
                    {Object.entries(SUPPLY_CATEGORY_LABELS).map(([k, cfg]) => (
                      <option key={k} value={k}>
                        {cfg.icon} {cfg.en} ({cfg.th})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Contact Person (ชื่อผู้ติดต่อ)</label>
                  <Input
                    value={editingVendor.contactPerson || ''}
                    onChange={(e) =>
                      setEditingVendor({ ...editingVendor, contactPerson: e.target.value })
                    }
                    placeholder="e.g. Khun Somchai (Sales)"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Order Channel (ช่องทางสั่งซื้อ)</label>
                  <select
                    value={editingVendor.orderChannel || 'LINE OA'}
                    onChange={(e) =>
                      setEditingVendor({ ...editingVendor, orderChannel: e.target.value })
                    }
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800"
                  >
                    <option value="LINE OA">LINE OA (แชทไลน์)</option>
                    <option value="Direct Sales">Direct Sales (โทรสั่งเซลล์)</option>
                    <option value="Email / PO">Email / PO (ส่งใบสั่งซื้อ)</option>
                    <option value="Shopee / Lazada">Shopee / Lazada / Online</option>
                    <option value="Walk-in / Cash">Walk-in / Cash (ซื้อหน้าร้าน)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Phone (เบอร์โทร)</label>
                  <Input
                    value={editingVendor.phone || ''}
                    onChange={(e) => setEditingVendor({ ...editingVendor, phone: e.target.value })}
                    placeholder="02-xxx-xxxx, 08x-xxx-xxxx"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">LINE ID / LINE OA</label>
                  <Input
                    value={editingVendor.lineId || ''}
                    onChange={(e) => setEditingVendor({ ...editingVendor, lineId: e.target.value })}
                    placeholder="@vendorline"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Email</label>
                  <Input
                    value={editingVendor.email || ''}
                    onChange={(e) => setEditingVendor({ ...editingVendor, email: e.target.value })}
                    placeholder="sales@vendor.com"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Payment Terms (เงื่อนไขชำระเงิน)</label>
                  <select
                    value={editingVendor.paymentTerms || 'Credit 30 Days'}
                    onChange={(e) =>
                      setEditingVendor({ ...editingVendor, paymentTerms: e.target.value })
                    }
                    className="w-full h-9 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-xs font-bold text-slate-800"
                  >
                    <option value="Credit 30 Days">Credit 30 Days (เครดิต 30 วัน)</option>
                    <option value="Credit 15 Days">Credit 15 Days (เครดิต 15 วัน)</option>
                    <option value="Cash / Bank Transfer">Cash / Transfer (โอนก่อนส่ง)</option>
                    <option value="COD (เก็บเงินปลายทาง)">COD (เก็บเงินปลายทาง)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Lead Time (ระยะเวลาส่ง / วัน)</label>
                  <Input
                    type="number"
                    min="0"
                    value={editingVendor.leadTimeDays ?? 2}
                    onChange={(e) =>
                      setEditingVendor({
                        ...editingVendor,
                        leadTimeDays: parseInt(e.target.value) || 0,
                      })
                    }
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Min Order Amount (ยอดขั้นต่ำ ฿)</label>
                  <Input
                    type="number"
                    min="0"
                    value={editingVendor.minOrderAmount ?? 0}
                    onChange={(e) =>
                      setEditingVendor({
                        ...editingVendor,
                        minOrderAmount: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Tax ID (เลขผู้เสียภาษี)</label>
                  <Input
                    value={editingVendor.taxId || ''}
                    onChange={(e) => setEditingVendor({ ...editingVendor, taxId: e.target.value })}
                    placeholder="01055xxxxxxxx"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Bank Account (บัญชีธนาคาร)</label>
                  <Input
                    value={editingVendor.bankAccount || ''}
                    onChange={(e) =>
                      setEditingVendor({ ...editingVendor, bankAccount: e.target.value })
                    }
                    placeholder="e.g. KBANK 045-2-xxxxx-x"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Company Address (ที่อยู่บริษัท)</label>
                <Input
                  value={editingVendor.address || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, address: e.target.value })}
                  placeholder="Billing / warehouse address"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700">Notes / Special Terms (หมายเหตุ)</label>
                <textarea
                  value={editingVendor.notes || ''}
                  onChange={(e) => setEditingVendor({ ...editingVendor, notes: e.target.value })}
                  rows={2}
                  placeholder="e.g. Free delivery Tue & Thu, volume discount for 10+ gallons..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="h-8.5 text-xs font-bold rounded-xl"
            >
              Cancel (ยกเลิก)
            </Button>
            <Button
              size="sm"
              onClick={handleSaveVendor}
              disabled={saving}
              className="h-8.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl"
            >
              {saving ? 'Saving...' : 'Save Vendor (บันทึก)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vendor Detail Modal (Linked Catalog Items & PO History) */}
      <Dialog
        open={Boolean(selectedVendorDetail)}
        onOpenChange={(open) => !open && setSelectedVendorDetail(null)}
      >
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-2xl">
          {selectedVendorDetail && (
            <>
              <DialogHeader className="p-5 bg-slate-900 text-white">
                <DialogTitle className="text-base font-black text-white flex items-center gap-2">
                  <span className="font-mono text-xs bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded">
                    {selectedVendorDetail.code}
                  </span>
                  <span>{selectedVendorDetail.name}</span>
                </DialogTitle>
                <p className="text-xs text-slate-300 mt-1">
                  Contact: {selectedVendorDetail.contactPerson || '-'} • Tel:{' '}
                  {selectedVendorDetail.phone || '-'} • LINE: {selectedVendorDetail.lineId || '-'}
                </p>
              </DialogHeader>

              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar text-xs">
                {/* Linked Catalog Items */}
                <div className="space-y-2">
                  <h4 className="font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Package size={14} className="text-sky-600" />
                    <span>
                      Linked Catalog Supplies (สินค้าที่ผูกกับซัพพลายเออร์นี้:{' '}
                      {vendorStatsMap[selectedVendorDetail.id]?.items.length || 0})
                    </span>
                  </h4>
                  {(vendorStatsMap[selectedVendorDetail.id]?.items.length || 0) === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-slate-400">
                      No catalog items linked yet (ตั้งค่าผูกสินค้าได้ที่หน้า Order Supplies &gt;&gt; Catalog)
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                      {vendorStatsMap[selectedVendorDetail.id]?.items.map((item) => (
                        <div
                          key={item.id}
                          className="p-2.5 flex items-center justify-between hover:bg-slate-50"
                        >
                          <div>
                            <div className="font-bold text-slate-800">{item.name}</div>
                            <div className="text-[11px] text-slate-500">{item.nameTh}</div>
                          </div>
                          <div className="text-right">
                            <span className="font-black text-sky-700 text-sm">
                              ฿{item.estimatedPrice.toLocaleString()}
                            </span>
                            <div className="text-[10px] text-slate-400">per {item.defaultUnit}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent PO History */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <ShoppingBag size={14} className="text-indigo-600" />
                    <span>
                      Recent Purchase Orders (ประวัติใบสั่งซื้อ PO:{' '}
                      {vendorStatsMap[selectedVendorDetail.id]?.orders.length || 0})
                    </span>
                  </h4>
                  {(vendorStatsMap[selectedVendorDetail.id]?.orders.length || 0) === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-slate-400">
                      No purchase orders recorded for this vendor yet (ยังไม่มีประวัติใบสั่งซื้อ)
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                      {vendorStatsMap[selectedVendorDetail.id]?.orders.map((ord) => (
                        <div
                          key={ord.id}
                          className="p-2.5 flex items-center justify-between hover:bg-slate-50"
                        >
                          <div>
                            <div className="font-bold text-slate-800 flex items-center gap-2">
                              <span className="font-mono text-indigo-700">{ord.orderNumber}</span>
                              <span>• {ord.branchName}</span>
                              {ord.vendorPoNumber && (
                                <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                                  PO: {ord.vendorPoNumber}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {new Date(ord.createdAt).toLocaleDateString('en-GB')} •{' '}
                              {ord.totalItemsCount} units ({ord.status.toUpperCase()})
                            </div>
                          </div>
                          <div className="font-black text-emerald-700">
                            ฿{(ord.totalEstimatedCost || 0).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedVendorDetail(null)}
                  className="h-8 text-xs font-bold rounded-xl"
                >
                  Close (ปิด)
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
