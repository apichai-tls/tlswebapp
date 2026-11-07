'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Droplets,
  Package,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Truck,
  AlertCircle,
  Trash2,
  ExternalLink,
  Printer,
  Building2,
  Sparkles,
  Calendar,
  X,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  ShoppingBag,
  Send,
  Eye,
  Check,
  AlertTriangle,
  FileCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  SupplyOrder,
  SupplyOrderItem,
  SupplyOrderStatus,
  SupplyOrderPriority,
  SupplyItemCategory,
  DEFAULT_SUPPLY_CATALOG,
  CatalogSupplyItem,
  SUPPLY_CATEGORY_LABELS,
} from '@/types/supply-order';
import {
  getSupplyOrdersAction,
  createSupplyOrderAction,
  updateSupplyOrderStatusAction,
  deleteSupplyOrderAction,
} from '@/actions/db';
import { FitScreenToggle } from '@/components/fit-screen-toggle';

interface AdminSuppliesOrdersProps {
  currentUser?: any;
  shops?: any[];
}

export function AdminSuppliesOrders({ currentUser, shops = [] }: AdminSuppliesOrdersProps) {
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  // Data state
  const [orders, setOrders] = useState<SupplyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOrderForView, setSelectedOrderForView] = useState<SupplyOrder | null>(null);
  const [selectedOrderForPrint, setSelectedOrderForPrint] = useState<SupplyOrder | null>(null);

  // Create Order Form State
  const [orderBranchId, setOrderBranchId] = useState<string>(currentUser?.branchId || (shops[0]?.id || 'ONLINE'));
  const [orderPriority, setOrderPriority] = useState<SupplyOrderPriority>('normal');
  const [neededByDate, setNeededByDate] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState('');
  const [selectedItems, setSelectedItems] = useState<SupplyOrderItem[]>([]);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Catalog Picker State in Create Modal
  const [catalogCategory, setCatalogCategory] = useState<string>('all');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Custom Item Inputs
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [customUnit, setCustomUnit] = useState('Bottle');
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [customCategory, setCustomCategory] = useState<SupplyItemCategory>('chemical');

  // Admin Processing Edit State in View Modal
  const [editStatus, setEditStatus] = useState<SupplyOrderStatus>('pending');
  const [editAdminNotes, setEditAdminNotes] = useState('');
  const [editVendorName, setEditVendorName] = useState('');
  const [editVendorPoNumber, setEditVendorPoNumber] = useState('');
  const [editTrackingNumber, setEditTrackingNumber] = useState('');
  const [editEstDeliveryDate, setEditEstDeliveryDate] = useState('');
  const [savingAdminProcessing, setSavingAdminProcessing] = useState(false);

  // 1. Load Orders
  const loadOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      const res = await getSupplyOrdersAction(branchFilter);
      if (res.success && res.orders) {
        setOrders(res.orders);
      } else {
        if (!silent) toast.error(res.error || 'Failed to load supply orders');
      }
    } catch (e: any) {
      if (!silent) toast.error('Error loading supply orders: ' + e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [branchFilter]);

  // Sync Branch ID when shops or user change
  useEffect(() => {
    if (currentUser?.branchId) {
      setOrderBranchId(currentUser.branchId);
    } else if (shops.length > 0 && !orderBranchId) {
      setOrderBranchId(shops[0].id);
    }
  }, [currentUser, shops]);

  // Sync Admin processing inputs when viewing an order
  useEffect(() => {
    if (selectedOrderForView) {
      setEditStatus(selectedOrderForView.status);
      setEditAdminNotes(selectedOrderForView.adminNotes || '');
      setEditVendorName(selectedOrderForView.vendorName || '');
      setEditVendorPoNumber(selectedOrderForView.vendorPoNumber || '');
      setEditTrackingNumber(selectedOrderForView.trackingNumber || '');
      setEditEstDeliveryDate(selectedOrderForView.estimatedDeliveryDate || '');
    }
  }, [selectedOrderForView]);

  // Catalog items filtered
  const filteredCatalog = useMemo(() => {
    return DEFAULT_SUPPLY_CATALOG.filter((item) => {
      const matchCat = catalogCategory === 'all' || item.category === catalogCategory;
      const matchSearch =
        !catalogSearch.trim() ||
        item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        item.nameTh.toLowerCase().includes(catalogSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [catalogCategory, catalogSearch]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchQuery =
        !searchQuery.trim() ||
        o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.requesterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.branchName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.items.some((it) => it.name.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchStatus = statusFilter === 'all' || o.status === statusFilter;
      const matchPriority = priorityFilter === 'all' || o.priority === priorityFilter;

      return matchQuery && matchStatus && matchPriority;
    });
  }, [orders, searchQuery, statusFilter, priorityFilter]);

  // KPI Calculations
  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((o) => o.status === 'pending').length;
    const processing = orders.filter((o) => o.status === 'processing' || o.status === 'approved').length;
    const dispatched = orders.filter((o) => o.status === 'dispatched').length;
    const completed = orders.filter((o) => o.status === 'completed').length;
    const totalEstimatedCost = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((sum, o) => sum + (o.totalEstimatedCost || 0), 0);

    return { total, pending, processing, dispatched, completed, totalEstimatedCost };
  }, [orders]);

  // Handlers for Cart / Items Selection
  const handleAddCatalogItem = (catalogItem: CatalogSupplyItem) => {
    setSelectedItems((prev) => {
      const existing = prev.find((it) => it.catalogItemId === catalogItem.id);
      if (existing) {
        return prev.map((it) =>
          it.catalogItemId === catalogItem.id ? { ...it, quantity: it.quantity + 1 } : it
        );
      }
      return [
        ...prev,
        {
          id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          catalogItemId: catalogItem.id,
          name: catalogItem.name,
          nameTh: catalogItem.nameTh,
          category: catalogItem.category,
          quantity: 1,
          unit: catalogItem.defaultUnit,
          estimatedPrice: catalogItem.estimatedPrice,
        },
      ];
    });
  };

  const handleUpdateItemQty = (itemId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev
        .map((it) => {
          if (it.id === itemId) {
            const nextQty = it.quantity + delta;
            return nextQty > 0 ? { ...it, quantity: nextQty } : null;
          }
          return it;
        })
        .filter(Boolean) as SupplyOrderItem[]
    );
  };

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  const handleAddCustomItem = () => {
    if (!customName.trim()) {
      toast.error('Please enter the custom item name');
      return;
    }
    const newItem: SupplyOrderItem = {
      id: `custom_${Date.now()}`,
      name: customName.trim(),
      category: customCategory,
      quantity: Number(customQty) || 1,
      unit: customUnit.trim() || 'Unit',
      estimatedPrice: Number(customPrice) || 0,
    };
    setSelectedItems((prev) => [...prev, newItem]);
    setCustomName('');
    setCustomQty(1);
    setCustomPrice(0);
    setIsAddingCustom(false);
    toast.success('Custom item added');
  };

  // Submit Order
  const handleSubmitOrder = async () => {
    if (selectedItems.length === 0) {
      toast.error('Please select at least one chemical or supply item to order');
      return;
    }

    const branchObj = shops.find((s) => s.id === orderBranchId);
    const branchName = branchObj ? branchObj.name : orderBranchId === 'ONLINE' ? 'Online Central' : orderBranchId;

    try {
      setSubmittingOrder(true);
      const res = await createSupplyOrderAction({
        branchId: orderBranchId,
        branchName,
        priority: orderPriority,
        neededByDate,
        items: selectedItems,
        notes: orderNotes,
      });

      if (res.success && res.order) {
        toast.success(`Supply order ${res.order.orderNumber} submitted to Admin!`);
        setIsCreateOpen(false);
        // Reset form
        setSelectedItems([]);
        setOrderNotes('');
        setNeededByDate('');
        setOrderPriority('normal');
        loadOrders(true);
      } else {
        toast.error(res.error || 'Failed to submit supply order');
      }
    } catch (e: any) {
      toast.error('Error submitting order: ' + e.message);
    } finally {
      setSubmittingOrder(false);
    }
  };

  // Admin Update Status
  const handleSaveAdminProcessing = async () => {
    if (!selectedOrderForView) return;

    try {
      setSavingAdminProcessing(true);
      const res = await updateSupplyOrderStatusAction(selectedOrderForView.id, editStatus, {
        adminNotes: editAdminNotes,
        vendorName: editVendorName,
        vendorPoNumber: editVendorPoNumber,
        trackingNumber: editTrackingNumber,
        estimatedDeliveryDate: editEstDeliveryDate,
      });

      if (res.success && res.order) {
        toast.success(`Order ${res.order.orderNumber} updated to ${editStatus.toUpperCase()}`);
        setSelectedOrderForView(res.order);
        if (res.orders) setOrders(res.orders);
        else loadOrders(true);
      } else {
        toast.error(res.error || 'Failed to update order');
      }
    } catch (e: any) {
      toast.error('Error updating status: ' + e.message);
    } finally {
      setSavingAdminProcessing(false);
    }
  };

  // Quick Action from list row
  const handleQuickStatusChange = async (order: SupplyOrder, newStatus: SupplyOrderStatus) => {
    try {
      const res = await updateSupplyOrderStatusAction(order.id, newStatus);
      if (res.success) {
        toast.success(`Order ${order.orderNumber} marked as ${newStatus}`);
        loadOrders(true);
      } else {
        toast.error(res.error || 'Failed to update status');
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    }
  };

  const handleDeleteOrder = async (orderId: string, orderNumber: string) => {
    if (!confirm(`Are you sure you want to delete order ${orderNumber}? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await deleteSupplyOrderAction(orderId);
      if (res.success) {
        toast.success(`Order ${orderNumber} deleted`);
        if (res.orders) setOrders(res.orders);
        else loadOrders(true);
        if (selectedOrderForView?.id === orderId) {
          setSelectedOrderForView(null);
        }
      } else {
        toast.error(res.error || 'Failed to delete order');
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    }
  };

  // Helper Badge Colors
  const getStatusBadge = (status: SupplyOrderStatus) => {
    switch (status) {
      case 'pending':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-bold gap-1 text-[11px] px-2.5 py-0.5">
            <Clock size={12} className="animate-pulse" />
            <span>Pending Review</span>
          </Badge>
        );
      case 'approved':
        return (
          <Badge className="bg-sky-100 text-sky-800 border-sky-300 font-bold gap-1 text-[11px] px-2.5 py-0.5">
            <CheckCircle2 size={12} />
            <span>Approved</span>
          </Badge>
        );
      case 'processing':
        return (
          <Badge className="bg-purple-100 text-purple-800 border-purple-300 font-bold gap-1 text-[11px] px-2.5 py-0.5">
            <RefreshCw size={12} className="animate-spin" />
            <span>Vendor Processing</span>
          </Badge>
        );
      case 'dispatched':
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-300 font-bold gap-1 text-[11px] px-2.5 py-0.5">
            <Truck size={12} />
            <span>Dispatched / In Transit</span>
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold gap-1 text-[11px] px-2.5 py-0.5">
            <Check size={12} />
            <span>Received & Completed</span>
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge className="bg-slate-100 text-slate-600 border-slate-300 font-bold gap-1 text-[11px] px-2.5 py-0.5">
            <X size={12} />
            <span>Cancelled</span>
          </Badge>
        );
    }
  };

  const getPriorityBadge = (priority: SupplyOrderPriority) => {
    switch (priority) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-300 animate-pulse">
            <AlertTriangle size={10} /> Critical Out of Stock
          </span>
        );
      case 'urgent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-300">
            <AlertCircle size={10} /> Urgent
          </span>
        );
      case 'normal':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200">
            Standard Restock
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Header & Primary Action Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-sky-900 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 rounded-2xl shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-radial from-sky-500/20 via-transparent to-transparent pointer-events-none" />
        <div className="relative z-10 space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-400/30">
              <Droplets size={22} className="text-sky-300" />
            </span>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Chemicals & Supplies Orders
              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white/10 text-sky-200 border border-white/15">
                สั่งซื้อน้ำยาและอุปกรณ์
              </span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-sky-100/80 max-w-2xl leading-relaxed">
            Order detergents, fabric softeners, packaging, and store supplies. Branch requests are
            submitted directly to admin for approval, vendor procurement, and dispatch.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-2 shrink-0">
          <FitScreenToggle />
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadOrders(true)}
            disabled={refreshing}
            className="h-10 px-3 bg-white/10 hover:bg-white/20 border-white/20 text-white font-bold text-xs rounded-xl backdrop-blur-sm transition-all"
            title="Refresh order list"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline ml-1.5">Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setIsCreateOpen(true);
            }}
            className="h-10 px-4 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-sky-600/30 gap-2 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={16} />
            <span>+ New Supply Order (สั่งซื้อน้ำยา)</span>
          </Button>
        </div>
      </div>

      {/* 2. Executive KPI Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* KPI 1: Pending Review */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
          className={`bg-white rounded-2xl border p-4 shadow-2xs cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'pending'
              ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20'
              : 'border-slate-200/80 border-t-4 border-t-amber-500'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Pending Admin Review
            </span>
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <Clock size={14} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-600">{stats.pending}</span>
            <span className="text-xs text-amber-700 font-semibold">orders</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Awaiting admin processing</p>
        </div>

        {/* KPI 2: In Processing */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'processing' ? 'all' : 'processing')}
          className={`bg-white rounded-2xl border p-4 shadow-2xs cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'processing'
              ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/20'
              : 'border-slate-200/80 border-t-4 border-t-purple-500'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Vendor Processing
            </span>
            <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <Package size={14} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-700">{stats.processing}</span>
            <span className="text-xs text-purple-600 font-semibold">orders</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Ordered from chemical vendor</p>
        </div>

        {/* KPI 3: In Transit */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'dispatched' ? 'all' : 'dispatched')}
          className={`bg-white rounded-2xl border p-4 shadow-2xs cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'dispatched'
              ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
              : 'border-slate-200/80 border-t-4 border-t-blue-500'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Dispatched / On The Way
            </span>
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <Truck size={14} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-blue-600">{stats.dispatched}</span>
            <span className="text-xs text-blue-600 font-semibold">shipments</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Out for delivery to branch</p>
        </div>

        {/* KPI 4: Fulfilled / Completed */}
        <div
          onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
          className={`bg-white rounded-2xl border p-4 shadow-2xs cursor-pointer transition-all hover:shadow-md ${
            statusFilter === 'completed'
              ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20'
              : 'border-slate-200/80 border-t-4 border-t-emerald-500'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Received & Completed
            </span>
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={14} />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">{stats.completed}</span>
            <span className="text-xs text-emerald-700 font-semibold">fulfilled</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium">Successfully received at branch</p>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Order # (e.g. SUP-202611-0001), requester, branch, or item name..."
              className="pl-9 h-10 text-xs bg-slate-50 border-slate-200 rounded-xl focus:bg-white transition-colors"
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

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Branch Filter (for admin or multi-branch) */}
            {isAdmin && (
              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none"
              >
                <option value="all">All Branches</option>
                <option value="ONLINE">Online Dispatch</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 focus:bg-white focus:outline-none"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="critical">Critical (Out of Stock)</option>
              <option value="normal">Normal</option>
            </select>
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-bold text-slate-400 mr-1 flex items-center gap-1">
            <Filter size={11} /> Filter Status:
          </span>
          {[
            { id: 'all', label: 'All Orders', count: stats.total },
            { id: 'pending', label: 'Pending Review', count: stats.pending, color: 'text-amber-700' },
            { id: 'processing', label: 'Processing', count: stats.processing, color: 'text-purple-700' },
            { id: 'dispatched', label: 'In Transit', count: stats.dispatched, color: 'text-blue-700' },
            { id: 'completed', label: 'Completed', count: stats.completed, color: 'text-emerald-700' },
            { id: 'cancelled', label: 'Cancelled', count: orders.filter((o) => o.status === 'cancelled').length },
          ].map((tab) => {
            const isSelected = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Orders List Table / Feed */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-2xs">
          <RefreshCw size={28} className="animate-spin mx-auto text-sky-600 mb-3" />
          <p className="text-sm font-bold text-slate-700">Loading chemical & supply orders...</p>
          <p className="text-xs text-slate-400 mt-1">Retrieving branch purchase requests</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center shadow-2xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 mx-auto flex items-center justify-center">
            <ShoppingBag size={28} />
          </div>
          <div>
            <h3 className="text-base font-extrabold text-slate-800">No supply orders found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search filters or status selection.'
                : 'No chemicals or supplies have been ordered yet. Click below to submit an order to the admin.'}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="h-9 px-4 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl gap-1.5"
          >
            <Plus size={15} />
            <span>Create First Supply Order</span>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filteredOrders.map((order) => {
              const isUrgent = order.priority === 'urgent' || order.priority === 'critical';
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`bg-white rounded-2xl border transition-all hover:shadow-md p-4 sm:p-5 shadow-2xs ${
                    isUrgent ? 'border-amber-300 bg-amber-50/10' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Order Info & Metadata */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-black text-indigo-950 bg-indigo-50 px-2.5 py-0.5 rounded-lg border border-indigo-200/80">
                          {order.orderNumber}
                        </span>

                        {getStatusBadge(order.status)}
                        {getPriorityBadge(order.priority)}

                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          <Building2 size={12} className="text-slate-400" />
                          <span>{order.branchName}</span>
                        </span>

                        <span className="text-[11px] text-slate-400">
                          {new Date(order.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Requester & Notes */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span className="font-semibold">
                          Requested by:{' '}
                          <span className="font-extrabold text-slate-900">{order.requesterName}</span>{' '}
                          {order.requesterRole && (
                            <span className="text-[10px] uppercase text-slate-400">
                              ({order.requesterRole})
                            </span>
                          )}
                        </span>
                        {order.neededByDate && (
                          <span className="flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded">
                            <Calendar size={11} />
                            <span>Needed by: {order.neededByDate}</span>
                          </span>
                        )}
                        {order.vendorPoNumber && (
                          <span className="text-purple-700 font-bold bg-purple-50 px-2 py-0.5 rounded">
                            PO #{order.vendorPoNumber}
                          </span>
                        )}
                      </div>

                      {/* Item Pills Summary */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {order.items.map((it, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-50 border border-slate-200 text-slate-800"
                          >
                            <span className="text-sky-600 font-black">{it.quantity}x</span>
                            <span className="truncate max-w-[200px]">{it.name}</span>
                            <span className="text-[10px] text-slate-400">({it.unit})</span>
                          </span>
                        ))}
                      </div>

                      {order.notes && (
                        <p className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                          "{order.notes}"
                        </p>
                      )}

                      {order.adminNotes && (
                        <div className="flex items-start gap-1.5 text-xs text-indigo-900 bg-indigo-50/70 p-2 rounded-lg border border-indigo-100">
                          <ShieldCheck size={14} className="text-indigo-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Admin Processing Note:</span> {order.adminNotes}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Estimated Cost & Actions */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-3 shrink-0 pt-3 lg:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-left sm:text-right">
                        <div className="text-xs text-slate-400 font-semibold">Total Items</div>
                        <div className="text-base font-black text-slate-900">
                          {order.totalItemsCount}{' '}
                          <span className="text-xs font-semibold text-slate-500">items</span>
                        </div>
                        {order.totalEstimatedCost > 0 && (
                          <div className="text-xs font-bold text-sky-700">
                            Est. ฿{order.totalEstimatedCost.toLocaleString()}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {/* Quick Admin Actions */}
                        {isAdmin && order.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => handleQuickStatusChange(order, 'approved')}
                            className="h-8 px-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1 cursor-pointer"
                            title="Approve Order"
                          >
                            <CheckCircle2 size={13} />
                            <span>Approve</span>
                          </Button>
                        )}

                        {isAdmin && order.status === 'approved' && (
                          <Button
                            size="sm"
                            onClick={() => handleQuickStatusChange(order, 'processing')}
                            className="h-8 px-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1 cursor-pointer"
                            title="Mark Processing with Vendor"
                          >
                            <RefreshCw size={13} />
                            <span>Mark Processing</span>
                          </Button>
                        )}

                        {isAdmin && order.status === 'processing' && (
                          <Button
                            size="sm"
                            onClick={() => handleQuickStatusChange(order, 'dispatched')}
                            className="h-8 px-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1 cursor-pointer"
                            title="Mark Dispatched / In Transit"
                          >
                            <Truck size={13} />
                            <span>Mark Dispatched</span>
                          </Button>
                        )}

                        {order.status === 'dispatched' && (
                          <Button
                            size="sm"
                            onClick={() => handleQuickStatusChange(order, 'completed')}
                            className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs gap-1 cursor-pointer"
                            title="Mark Received by Branch"
                          >
                            <Check size={13} />
                            <span>Confirm Received</span>
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedOrderForView(order)}
                          className="h-8 px-2.5 text-xs font-bold rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 gap-1"
                        >
                          <Eye size={13} />
                          <span>View Details</span>
                        </Button>

                        <button
                          type="button"
                          onClick={() => setSelectedOrderForPrint(order)}
                          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                          title="Print Order Slip"
                        >
                          <Printer size={14} />
                        </button>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(order.id, order.orderNumber)}
                            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                            title="Delete Order"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* 5. Create Order Modal (The Clean Form for Users to Order Detergents & Supplies) */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-2xl">
          <DialogHeader className="p-5 bg-gradient-to-r from-sky-900 to-indigo-950 text-white">
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-white/10 text-sky-300">
                <Droplets size={20} />
              </span>
              <div>
                <DialogTitle className="text-base sm:text-lg font-black text-white">
                  Chemicals & Laundry Supplies Order Form
                </DialogTitle>
                <p className="text-xs text-sky-200/80 mt-0.5">
                  ใบสั่งซื้อน้ำยาและอุปกรณ์ซักรีดสำหรับสาขา — ส่งตรงถึงแอดมินเพื่อจัดซื้อ
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
            {/* Requester & Branch Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
              {/* Branch */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Branch (สาขา) *</label>
                <select
                  value={orderBranchId}
                  onChange={(e) => setOrderBranchId(e.target.value)}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="ONLINE">Online Central Dispatch</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Priority (ระดับความด่วน)</label>
                <select
                  value={orderPriority}
                  onChange={(e) => setOrderPriority(e.target.value as SupplyOrderPriority)}
                  className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                >
                  <option value="normal">Normal Restock (3-5 days)</option>
                  <option value="urgent">Urgent (Low stock 1-2 days)</option>
                  <option value="critical">🚨 Critical / Out of Stock</option>
                </select>
              </div>

              {/* Needed By Date */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600">Needed By Date (วันที่ต้องการ)</label>
                <Input
                  type="date"
                  value={neededByDate}
                  onChange={(e) => setNeededByDate(e.target.value)}
                  className="h-9 text-xs bg-white border-slate-200 rounded-xl"
                />
              </div>
            </div>

            {/* Catalog Selector */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-sky-600" />
                    <span>Select Chemicals & Supplies (เลือกรายการสั่งซื้อ)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Click '+ Add' on any standard item below, or create a custom item
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsAddingCustom(!isAddingCustom)}
                  className="h-8 px-2.5 text-xs font-bold rounded-xl border-dashed border-sky-400 text-sky-700 bg-sky-50/50 hover:bg-sky-100/60"
                >
                  <Plus size={13} />
                  <span>{isAddingCustom ? 'Close Custom Item' : '+ Custom Item'}</span>
                </Button>
              </div>

              {/* Custom Item Form */}
              {isAddingCustom && (
                <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl space-y-2.5 animate-fadeIn">
                  <div className="text-xs font-bold text-sky-900">Add Custom Supply Item</div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2">
                      <Input
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="Item name (e.g. Special Stain Brush, Ironing Board Pad)..."
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        min="1"
                        value={customQty}
                        onChange={(e) => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
                        placeholder="Qty"
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                    <div>
                      <Input
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        placeholder="Unit (e.g. Pcs, Box, Set)"
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={handleAddCustomItem}
                      className="h-7 px-3 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-lg"
                    >
                      Add to Order
                    </Button>
                  </div>
                </div>
              )}

              {/* Category Pills Filter */}
              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                <button
                  type="button"
                  onClick={() => setCatalogCategory('all')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    catalogCategory === 'all'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Items ({DEFAULT_SUPPLY_CATALOG.length})
                </button>
                {Object.entries(SUPPLY_CATEGORY_LABELS).map(([catKey, label]) => {
                  const isSelected = catalogCategory === catKey;
                  return (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => setCatalogCategory(catKey)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        isSelected
                          ? 'bg-sky-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span>{label.icon}</span>
                      <span>{label.en}</span>
                    </button>
                  );
                })}
              </div>

              {/* Catalog Items Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto custom-scrollbar p-1">
                {filteredCatalog.map((item) => {
                  const existingItem = selectedItems.find((it) => it.catalogItemId === item.id);
                  const isAdded = Boolean(existingItem);
                  return (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-xl border transition-all flex flex-col justify-between gap-2 ${
                        isAdded
                          ? 'border-sky-500 bg-sky-50/50 shadow-2xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <h5 className="text-xs font-bold text-slate-800 leading-tight">
                            {item.name}
                          </h5>
                          {item.popular && (
                            <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 shrink-0">
                              Popular
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.nameTh}</p>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                          <span className="font-semibold">{item.defaultUnit}</span>
                          {item.estimatedPrice > 0 && (
                            <span className="font-bold text-sky-700">~฿{item.estimatedPrice}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        {isAdded ? (
                          <div className="flex items-center justify-between w-full">
                            <span className="text-xs font-black text-sky-800">
                              Qty: {existingItem?.quantity}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(existingItem!.id, -1)}
                                className="w-6 h-6 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 font-black text-xs flex items-center justify-center cursor-pointer"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(existingItem!.id, 1)}
                                className="w-6 h-6 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-black text-xs flex items-center justify-center cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => handleAddCatalogItem(item)}
                            className="w-full h-7 text-[11px] font-bold bg-slate-100 hover:bg-sky-600 hover:text-white text-slate-700 rounded-lg cursor-pointer transition-colors"
                          >
                            + Add to Order
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Selected Items Cart Strip */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                  <ShoppingBag size={14} className="text-sky-600" />
                  <span>Your Order Cart ({selectedItems.length} unique items)</span>
                </label>
                {selectedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedItems([])}
                    className="text-[11px] text-rose-600 hover:underline font-bold"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {selectedItems.length === 0 ? (
                <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                  No items selected yet. Click '+ Add' on the catalog items above.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {selectedItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-extrabold text-slate-800 truncate">{item.name}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2">
                          <span>Unit: {item.unit}</span>
                          {item.estimatedPrice ? (
                            <span>~฿{item.estimatedPrice * item.quantity}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(item.id, -1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-black text-slate-900">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItemQty(item.id, 1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 font-bold"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Special Instructions & Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Special Delivery Notes / Remarks for Admin
              </label>
              <textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="e.g. Please deliver before Friday 10 AM, need lavender scent if available, deliver to back storage door..."
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-medium text-slate-800 focus:bg-white focus:outline-none custom-scrollbar"
              />
            </div>
          </div>

          <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateOpen(false)}
              className="h-9 text-xs font-bold rounded-xl"
            >
              Cancel
            </Button>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-[11px] text-slate-400 font-medium">
                  {selectedItems.reduce((acc, it) => acc + it.quantity, 0)} total units
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleSubmitOrder}
                disabled={submittingOrder || selectedItems.length === 0}
                className="h-9 px-5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white text-xs font-extrabold rounded-xl shadow-md gap-2"
              >
                <Send size={14} className={submittingOrder ? 'animate-bounce' : ''} />
                <span>{submittingOrder ? 'Submitting...' : 'Submit Order to Admin (ส่งใบสั่งซื้อ)'}</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. Order Details & Admin Processing Modal */}
      <Dialog
        open={Boolean(selectedOrderForView)}
        onOpenChange={(open) => !open && setSelectedOrderForView(null)}
      >
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-2xl">
          {selectedOrderForView && (
            <>
              <DialogHeader className="p-5 bg-slate-900 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-white/10 text-sky-300">
                      <FileCheck size={18} />
                    </span>
                    <div>
                      <DialogTitle className="text-base font-extrabold text-white flex items-center gap-2">
                        <span>Order #{selectedOrderForView.orderNumber}</span>
                        {getStatusBadge(selectedOrderForView.status)}
                      </DialogTitle>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Branch: {selectedOrderForView.branchName} • Requested by{' '}
                        {selectedOrderForView.requesterName}
                      </p>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedOrderForPrint(selectedOrderForView)}
                    className="h-8 px-2.5 bg-white/10 hover:bg-white/20 border-white/20 text-white text-xs font-bold rounded-xl gap-1"
                  >
                    <Printer size={13} />
                    <span>Print Slip</span>
                  </Button>
                </div>
              </DialogHeader>

              <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {/* Meta details */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Priority</div>
                    <div className="font-extrabold text-slate-800 capitalize mt-0.5">
                      {selectedOrderForView.priority}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Needed By</div>
                    <div className="font-extrabold text-slate-800 mt-0.5">
                      {selectedOrderForView.neededByDate || 'Standard'}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Total Units</div>
                    <div className="font-extrabold text-slate-800 mt-0.5">
                      {selectedOrderForView.totalItemsCount} units
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Submitted At</div>
                    <div className="font-bold text-slate-700 mt-0.5">
                      {new Date(selectedOrderForView.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {/* Items Breakdown Table */}
                <div className="space-y-1.5">
                  <div className="text-xs font-extrabold text-slate-700">Ordered Items:</div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                    {selectedOrderForView.items.map((it, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-bold text-slate-800">{it.name}</div>
                          {it.nameTh && <div className="text-[10px] text-slate-400">{it.nameTh}</div>}
                          {it.notes && <div className="text-[10px] text-indigo-600">Note: {it.notes}</div>}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-black text-sky-700 text-sm">
                            {it.quantity} {it.unit}
                          </span>
                          {it.estimatedPrice ? (
                            <div className="text-[10px] text-slate-400 font-medium">
                              ~฿{it.estimatedPrice * it.quantity}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedOrderForView.notes && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <span className="font-bold text-slate-700">Requester Remarks:</span>{' '}
                    <span className="text-slate-600">{selectedOrderForView.notes}</span>
                  </div>
                )}

                {/* Admin Processing & Procurement Controls (for Admins) */}
                {isAdmin ? (
                  <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-200/80 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-black text-indigo-950 uppercase tracking-wider">
                      <ShieldCheck size={16} className="text-indigo-600" />
                      <span>Admin Procurement & Processing Controls</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <label className="font-bold text-slate-700">Order Status</label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as SupplyOrderStatus)}
                          className="w-full h-9 rounded-xl border border-slate-200 bg-white px-2.5 font-bold text-slate-800 focus:outline-none"
                        >
                          <option value="pending">Pending Review</option>
                          <option value="approved">Approved (Queue for purchase)</option>
                          <option value="processing">Vendor Processing (PO Placed)</option>
                          <option value="dispatched">Dispatched / In Transit</option>
                          <option value="completed">Completed & Received at Branch</option>
                          <option value="cancelled">Cancelled / Rejected</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-700">Vendor / Supplier Name</label>
                        <Input
                          value={editVendorName}
                          onChange={(e) => setEditVendorName(e.target.value)}
                          placeholder="e.g. The Laundering Company / Ecolab"
                          className="h-9 text-xs bg-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-700">PO / Invoice Number</label>
                        <Input
                          value={editVendorPoNumber}
                          onChange={(e) => setEditVendorPoNumber(e.target.value)}
                          placeholder="e.g. PO-2026-8891"
                          className="h-9 text-xs bg-white"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-slate-700">Tracking / Delivery No.</label>
                        <Input
                          value={editTrackingNumber}
                          onChange={(e) => setEditTrackingNumber(e.target.value)}
                          placeholder="e.g. TH012938120"
                          className="h-9 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-1 text-xs">
                      <label className="font-bold text-slate-700">Admin Processing Notes (Visible to Branch)</label>
                      <textarea
                        value={editAdminNotes}
                        onChange={(e) => setEditAdminNotes(e.target.value)}
                        placeholder="e.g. Approved. Detergent 20L ordered with supplier. Expected delivery Thursday morning."
                        rows={2}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-800 focus:outline-none"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        onClick={handleSaveAdminProcessing}
                        disabled={savingAdminProcessing}
                        className="h-8 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs"
                      >
                        {savingAdminProcessing ? 'Saving Changes...' : 'Update Processing Details'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Read-only processing details for non-admin staff */
                  selectedOrderForView.adminNotes && (
                    <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 text-xs">
                      <div className="font-bold text-indigo-900 flex items-center gap-1 mb-1">
                        <ShieldCheck size={14} className="text-indigo-600" />
                        <span>Admin Processing Status</span>
                      </div>
                      <p className="text-indigo-800">{selectedOrderForView.adminNotes}</p>
                      {selectedOrderForView.vendorPoNumber && (
                        <p className="text-indigo-600 mt-1">PO #: {selectedOrderForView.vendorPoNumber}</p>
                      )}
                    </div>
                  )
                )}
              </div>

              <DialogFooter className="p-4 bg-slate-50 border-t border-slate-200">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedOrderForView(null)}
                  className="h-8 text-xs font-bold rounded-xl"
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 7. Printable Order Slip Modal */}
      <Dialog
        open={Boolean(selectedOrderForPrint)}
        onOpenChange={(open) => !open && setSelectedOrderForPrint(null)}
      >
        <DialogContent className="max-w-xl p-6 bg-white rounded-2xl border border-slate-300 shadow-2xl">
          {selectedOrderForPrint && (
            <div className="space-y-4 text-slate-900" id="supply-print-slip">
              <div className="border-b-2 border-slate-900 pb-3 flex justify-between items-start">
                <div>
                  <h2 className="text-lg font-black tracking-tight uppercase">That Laundry Shop</h2>
                  <p className="text-xs text-slate-500 font-medium">Chemicals & Supplies Purchase Order Slip</p>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-black">{selectedOrderForPrint.orderNumber}</div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(selectedOrderForPrint.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Destination Branch</span>
                  <span className="font-extrabold text-slate-800">{selectedOrderForPrint.branchName}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Requester</span>
                  <span className="font-bold text-slate-800">{selectedOrderForPrint.requesterName}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Priority</span>
                  <span className="font-bold capitalize">{selectedOrderForPrint.priority}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Current Status</span>
                  <span className="font-extrabold uppercase text-sky-700">{selectedOrderForPrint.status}</span>
                </div>
              </div>

              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-500 text-left">
                    <th className="py-1.5 font-bold">#</th>
                    <th className="py-1.5 font-bold">Item Description</th>
                    <th className="py-1.5 font-bold text-right">Quantity</th>
                    <th className="py-1.5 font-bold text-right">Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedOrderForPrint.items.map((it, idx) => (
                    <tr key={idx} className="py-1">
                      <td className="py-2 text-slate-400">{idx + 1}</td>
                      <td className="py-2 font-bold text-slate-800">
                        {it.name}
                        {it.nameTh && <div className="text-[10px] font-normal text-slate-400">{it.nameTh}</div>}
                      </td>
                      <td className="py-2 text-right font-black text-slate-900">{it.quantity}</td>
                      <td className="py-2 text-right text-slate-500">{it.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selectedOrderForPrint.notes && (
                <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-200">
                  <span className="font-bold">Notes:</span> {selectedOrderForPrint.notes}
                </div>
              )}

              <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-xs">
                <div>
                  <div className="font-semibold text-slate-500">Authorized by Admin</div>
                  <div className="text-[11px] text-slate-400">
                    {selectedOrderForPrint.processedByName || 'Central Operations'}
                  </div>
                </div>
                <div className="flex gap-2 print:hidden">
                  <Button
                    size="sm"
                    onClick={() => window.print()}
                    className="h-8 px-4 bg-slate-900 text-white font-bold text-xs rounded-lg gap-1.5"
                  >
                    <Printer size={13} />
                    <span>Print Slip</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
