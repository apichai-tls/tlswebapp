'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import {
  MessageCircle,
  UserPlus,
  UserCheck,
  Search,
  RefreshCw,
  Download,
  CalendarDays,
  CheckCircle2,
  Clock,
  ShoppingBag,
  Copy,
  Phone,
  Sparkles,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCustomers } from '@/lib/use-customers';
import { useJobs } from '@/lib/use-jobs';
import { normalizePhoneKey } from '@/lib/social-helpers';
import {
  getLineFollowersMarketingReportAction,
  type LineNewFollowerItem,
  type WhatsAppNewContactItem,
} from '@/actions/social-inbox';

const THAI_MONTH_NAMES: Record<string, string> = {
  '01': 'มกราคม (Jan)',
  '02': 'กุมภาพันธ์ (Feb)',
  '03': 'มีนาคม (Mar)',
  '04': 'เมษายน (Apr)',
  '05': 'พฤษภาคม (May)',
  '06': 'มิถุนายน (Jun)',
  '07': 'กรกฎาคม (Jul)',
  '08': 'สิงหาคม (Aug)',
  '09': 'กันยายน (Sep)',
  '10': 'ตุลาคม (Oct)',
  '11': 'พฤศจิกายน (Nov)',
  '12': 'ธันวาคม (Dec)',
};

function formatMonthLabel(monthKey: string): string {
  const [y, m] = (monthKey || '').split('-');
  if (!y || !m) return monthKey;
  return `${THAI_MONTH_NAMES[m] || m} ${y}`;
}

type UnifiedFilterId =
  | 'new_leads'
  | 'new_converted'
  | 'new_inquiry'
  | 'silent'
  | 'existing_customer'
  | 'all';

export function AdminLineFollowersReport() {
  const customers = useCustomers();
  const jobs = useJobs();

  const [activeChannelTab, setActiveChannelTab] = useState<'line' | 'whatsapp'>('line');
  const [loading, setLoading] = useState(true);

  // LINE State
  const [totalLinePoolCount, setTotalLinePoolCount] = useState(0);
  const [lineFollowers, setLineFollowers] = useState<LineNewFollowerItem[]>([]);

  // WhatsApp State
  const [totalWaPoolCount, setTotalWaPoolCount] = useState(0);
  const [waContacts, setWaContacts] = useState<WhatsAppNewContactItem[]>([]);

  // Unified Filters for both LINE OA and WhatsApp
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<UnifiedFilterId>('new_leads');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLineFollowersMarketingReportAction();
      if (res.success) {
        setTotalLinePoolCount(res.totalFollowerPoolCount);
        setLineFollowers(res.followers);
        setTotalWaPoolCount(res.totalWhatsappPoolCount || 0);
        setWaContacts(res.whatsappContacts || []);
      } else {
        toast.error(res.error || 'Failed to load LINE & WhatsApp leads report');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load LINE & WhatsApp leads report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  // Reset month & status filter to 'new_leads' when switching between LINE and WhatsApp tabs
  const handleSwitchChannel = (ch: 'line' | 'whatsapp') => {
    setActiveChannelTab(ch);
    setSelectedMonth('ALL');
    setStatusFilter('new_leads');
    setSearchQuery('');
    setCurrentPage(1);
  };

  // Reset pagination to page 1 whenever filters or search query change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeChannelTab, selectedMonth, statusFilter, searchQuery, pageSize]);

  // Pre-index local store CRM Customers and Jobs as supplementary live enrichment
  const crmIndex = useMemo(() => {
    const custByLineId = new Map<string, any>();
    const custById = new Map<string, any>();
    const custByPhoneKey = new Map<string, any>();

    for (const c of customers) {
      if (c.id) custById.set(c.id, c);
      if (c.lineId) custByLineId.set(c.lineId.trim(), c);
      const pk = normalizePhoneKey(c.phone);
      if (pk && pk.length >= 7 && !custByPhoneKey.has(pk)) {
        custByPhoneKey.set(pk, c);
      }
    }

    const jobsByCustId = new Map<string, { count: number; paidRevenue: number }>();
    for (const j of jobs) {
      if (!j.customerId || j.status === 'cancel') continue;
      const cur = jobsByCustId.get(j.customerId) || { count: 0, paidRevenue: 0 };
      cur.count += 1;
      if (j.isShopPaid || j.isPaid) {
        cur.paidRevenue += Number(j.totalAmount) || 0;
      }
      jobsByCustId.set(j.customerId, cur);
    }

    return { custByLineId, custById, custByPhoneKey, jobsByCustId };
  }, [customers, jobs]);

  // Enriched LINE Followers
  const enrichedLineFollowers = useMemo(() => {
    const { custByLineId, custById, jobsByCustId } = crmIndex;
    return lineFollowers.map((f) => {
      const matchedCust =
        (f.linkedCustomerId && custById.get(f.linkedCustomerId)) ||
        custByLineId.get(f.userId) ||
        null;
      const effectiveCustId = matchedCust?.id || f.linkedCustomerId || null;
      const jobStats = effectiveCustId ? jobsByCustId.get(effectiveCustId) : undefined;
      const orderCount = Math.max(f.orderCount || 0, jobStats?.count || 0);
      const paidRevenue =
        Math.round(Math.max(f.paidRevenue || 0, jobStats?.paidRevenue || 0) * 100) / 100;

      return {
        ...f,
        linkedCustomerId: effectiveCustId,
        linkedCustomerName: matchedCust?.name || f.linkedCustomerName || null,
        linkedCustomerPhone: matchedCust?.phone || f.linkedCustomerPhone || null,
        memberId: matchedCust?.memberId || f.customerMemberId || null,
        leadType: f.leadType || 'new_lead',
        orderCount,
        paidRevenue,
      };
    });
  }, [lineFollowers, crmIndex]);

  // Enriched WhatsApp Contacts
  const enrichedWaContacts = useMemo(() => {
    const { custById, custByPhoneKey, jobsByCustId } = crmIndex;
    return waContacts.map((w) => {
      const pk = normalizePhoneKey(w.contactPhone || w.externalContactId);
      const matchedCust =
        (w.linkedCustomerId && custById.get(w.linkedCustomerId)) ||
        (pk ? custByPhoneKey.get(pk) : null) ||
        null;
      const effectiveCustId = matchedCust?.id || w.linkedCustomerId || null;
      const jobStats = effectiveCustId ? jobsByCustId.get(effectiveCustId) : undefined;
      const orderCount = Math.max(w.orderCount || 0, jobStats?.count || 0);
      const paidRevenue =
        Math.round(Math.max(w.paidRevenue || 0, jobStats?.paidRevenue || 0) * 100) / 100;

      return {
        ...w,
        linkedCustomerId: effectiveCustId,
        linkedCustomerName: matchedCust?.name || w.linkedCustomerName || null,
        linkedCustomerPhone: matchedCust?.phone || w.contactPhone || null,
        memberId: matchedCust?.memberId || w.customerMemberId || null,
        leadType: w.leadType || 'new_lead',
        orderCount,
        paidRevenue,
      };
    });
  }, [waContacts, crmIndex]);

  // True New Leads count for badge pills on both channel buttons
  const trueNewLineCount = useMemo(
    () => enrichedLineFollowers.filter((f) => f.leadType === 'new_lead').length,
    [enrichedLineFollowers]
  );
  const trueNewWaCount = useMemo(
    () => enrichedWaContacts.filter((w) => w.leadType === 'new_lead').length,
    [enrichedWaContacts]
  );

  // Filtered Lists (Identical filter logic for LINE OA and WhatsApp)
  const filteredLineList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedLineFollowers.filter((f) => {
      if (selectedMonth !== 'ALL' && f.monthKey !== selectedMonth) return false;
      const isCrmConverted = Boolean(f.linkedCustomerId) || f.orderCount > 0;

      if (statusFilter === 'new_leads' && f.leadType !== 'new_lead') return false;
      if (
        statusFilter === 'new_converted' &&
        !(f.leadType === 'new_lead' && isCrmConverted)
      ) {
        return false;
      }
      if (
        statusFilter === 'new_inquiry' &&
        !(f.leadType === 'new_lead' && !isCrmConverted)
      ) {
        return false;
      }
      if (statusFilter === 'silent' && !(f.leadType === 'new_lead' && !f.hasChatted)) {
        return false;
      }
      if (statusFilter === 'existing_customer' && f.leadType !== 'existing_customer') {
        return false;
      }

      if (q) {
        const matchDisplay = (f.displayName || '').toLowerCase().includes(q);
        const matchCust = (f.linkedCustomerName || '').toLowerCase().includes(q);
        const matchPhone = (f.linkedCustomerPhone || '').toLowerCase().includes(q);
        const matchUid = (f.userId || '').toLowerCase().includes(q);
        const matchMsg = (f.lastMessageText || '').toLowerCase().includes(q);
        if (!matchDisplay && !matchCust && !matchPhone && !matchUid && !matchMsg) {
          return false;
        }
      }
      return true;
    });
  }, [enrichedLineFollowers, selectedMonth, statusFilter, searchQuery]);

  const filteredWaList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedWaContacts.filter((w) => {
      if (selectedMonth !== 'ALL' && w.monthKey !== selectedMonth) return false;
      const isCrmConverted = Boolean(w.linkedCustomerId) || w.orderCount > 0;

      if (statusFilter === 'new_leads' && w.leadType !== 'new_lead') return false;
      if (
        statusFilter === 'new_converted' &&
        !(w.leadType === 'new_lead' && isCrmConverted)
      ) {
        return false;
      }
      if (
        statusFilter === 'new_inquiry' &&
        !(w.leadType === 'new_lead' && !isCrmConverted)
      ) {
        return false;
      }
      if (statusFilter === 'existing_customer' && w.leadType !== 'existing_customer') {
        return false;
      }

      if (q) {
        const matchDisplay = (w.displayName || '').toLowerCase().includes(q);
        const matchCust = (w.linkedCustomerName || '').toLowerCase().includes(q);
        const matchPhone = (w.contactPhone || '').toLowerCase().includes(q);
        const matchExt = (w.externalContactId || '').toLowerCase().includes(q);
        const matchMsg = (w.lastMessageText || '').toLowerCase().includes(q);
        if (!matchDisplay && !matchCust && !matchPhone && !matchExt && !matchMsg) {
          return false;
        }
      }
      return true;
    });
  }, [enrichedWaContacts, selectedMonth, statusFilter, searchQuery]);

  // Pagination calculation for active filtered list
  const activeFilteredCount =
    activeChannelTab === 'line' ? filteredLineList.length : filteredWaList.length;
  const totalPages = Math.max(1, Math.ceil(activeFilteredCount / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * pageSize;

  const paginatedLineList = useMemo(
    () => filteredLineList.slice(pageStartIndex, pageStartIndex + pageSize),
    [filteredLineList, pageStartIndex, pageSize]
  );

  const paginatedWaList = useMemo(
    () => filteredWaList.slice(pageStartIndex, pageStartIndex + pageSize),
    [filteredWaList, pageStartIndex, pageSize]
  );

  const visiblePageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, safeCurrentPage - Math.floor(maxButtons / 2));
    const end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) {
      start = Math.max(1, end - maxButtons + 1);
    }
    for (let p = start; p <= end; p++) {
      pages.push(p);
    }
    return pages;
  }, [safeCurrentPage, totalPages]);

  // Unified Stats for Active Channel (100% consistent structure between LINE OA & WhatsApp)
  const activeStats = useMemo(() => {
    const rawList =
      activeChannelTab === 'line' ? enrichedLineFollowers : enrichedWaContacts;
    const scopeList =
      selectedMonth === 'ALL'
        ? rawList
        : rawList.filter((item) => item.monthKey === selectedMonth);

    const totalAllContacts = scopeList.length;
    const newLeadsList = scopeList.filter((item) => item.leadType === 'new_lead');
    const existingCustList = scopeList.filter(
      (item) => item.leadType === 'existing_customer'
    );

    const trueNewLeads = newLeadsList.length;
    const existingCustomers = existingCustList.length;

    const newConvertedList = newLeadsList.filter(
      (item) => Boolean(item.linkedCustomerId) || item.orderCount > 0
    );
    const newConverted = newConvertedList.length;
    const newInquiries = Math.max(0, trueNewLeads - newConverted);

    // For LINE, breakdown of newInquiries into Chatted vs Silent
    const newInquiriesChatted =
      activeChannelTab === 'line'
        ? newLeadsList.filter(
            (item: any) =>
              !(Boolean(item.linkedCustomerId) || item.orderCount > 0) &&
              Boolean(item.hasChatted)
          ).length
        : newInquiries;
    const newSilent =
      activeChannelTab === 'line'
        ? newLeadsList.filter((item: any) => !item.hasChatted).length
        : 0;

    // Orders & Revenue specifically from True New Leads
    const newLeadsOrders = newLeadsList.reduce((s, item) => s + item.orderCount, 0);
    const newLeadsRevenue =
      Math.round(newLeadsList.reduce((s, item) => s + item.paidRevenue, 0) * 100) /
      100;

    // Orders & Revenue across all contacts (including Existing Returning Customers)
    const allOrders = scopeList.reduce((s, item) => s + item.orderCount, 0);
    const allRevenue =
      Math.round(scopeList.reduce((s, item) => s + item.paidRevenue, 0) * 100) / 100;

    const conversionRate =
      trueNewLeads > 0 ? Math.round((newConverted / trueNewLeads) * 100) : 0;

    return {
      totalAllContacts,
      trueNewLeads,
      existingCustomers,
      newConverted,
      newInquiries,
      newInquiriesChatted,
      newSilent,
      newLeadsOrders,
      newLeadsRevenue,
      allOrders,
      allRevenue,
      conversionRate,
    };
  }, [activeChannelTab, enrichedLineFollowers, enrichedWaContacts, selectedMonth]);

  // Unified Monthly Summary Buckets for both LINE OA and WhatsApp
  const activeMonthlyBuckets = useMemo(() => {
    const rawList =
      activeChannelTab === 'line' ? enrichedLineFollowers : enrichedWaContacts;

    const byMonth = new Map<
      string,
      {
        monthKey: string;
        totalCount: number;
        trueNewLeadsCount: number;
        newConvertedCount: number;
        newInquiryCount: number;
        newSilentCount: number;
        existingCustomerCount: number;
        newLeadsOrders: number;
        newLeadsRevenue: number;
      }
    >();

    // Always ensure the current calendar month (Bangkok UTC+7) exists in the monthly buckets
    // so when a new month (e.g. December) starts, it appears immediately even before the first lead arrives
    const currentBkkMonthKey = new Date(Date.now() + 7 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 7);
    if (!byMonth.has(currentBkkMonthKey)) {
      byMonth.set(currentBkkMonthKey, {
        monthKey: currentBkkMonthKey,
        totalCount: 0,
        trueNewLeadsCount: 0,
        newConvertedCount: 0,
        newInquiryCount: 0,
        newSilentCount: 0,
        existingCustomerCount: 0,
        newLeadsOrders: 0,
        newLeadsRevenue: 0,
      });
    }

    for (const item of rawList) {
      const cur = byMonth.get(item.monthKey) || {
        monthKey: item.monthKey,
        totalCount: 0,
        trueNewLeadsCount: 0,
        newConvertedCount: 0,
        newInquiryCount: 0,
        newSilentCount: 0,
        existingCustomerCount: 0,
        newLeadsOrders: 0,
        newLeadsRevenue: 0,
      };
      cur.totalCount += 1;
      const isConverted = Boolean(item.linkedCustomerId) || item.orderCount > 0;

      if (item.leadType === 'new_lead') {
        cur.trueNewLeadsCount += 1;
        if (isConverted) {
          cur.newConvertedCount += 1;
        } else {
          cur.newInquiryCount += 1;
        }
        if ('hasChatted' in item && !item.hasChatted) {
          cur.newSilentCount += 1;
        }
        cur.newLeadsOrders += item.orderCount;
        cur.newLeadsRevenue =
          Math.round((cur.newLeadsRevenue + item.paidRevenue) * 100) / 100;
      } else {
        cur.existingCustomerCount += 1;
      }
      byMonth.set(item.monthKey, cur);
    }

    return Array.from(byMonth.values()).sort((a, b) =>
      b.monthKey.localeCompare(a.monthKey)
    );
  }, [activeChannelTab, enrichedLineFollowers, enrichedWaContacts]);

  // Quick pills show up to the 3 most recent months; Dropdown lists ALL months across history
  const recentThreeMonths = useMemo(
    () => activeMonthlyBuckets.slice(0, 3),
    [activeMonthlyBuckets]
  );

  const maxMonthlyCount = useMemo(
    () => Math.max(1, ...activeMonthlyBuckets.map((m) => m.trueNewLeadsCount)),
    [activeMonthlyBuckets]
  );

  const isLine = activeChannelTab === 'line';
  const unitLabel = isLine ? 'คน' : 'เบอร์';

  const handleExportCsv = () => {
    if (isLine) {
      if (filteredLineList.length === 0) {
        toast.error('ไม่มีข้อมูลสำหรับส่งออก');
        return;
      }
      const headers = [
        'No.',
        'Channel',
        'Month',
        'Followed At',
        'Lead Classification',
        'LINE Display Name',
        'Chat Status',
        'Last Message',
        'CRM Customer Name',
        'Customer Phone',
        'Member ID',
        'Orders Count',
        'Paid Revenue (THB)',
        'LINE User ID',
      ];
      const rows = filteredLineList.map((f, idx) => [
        String(idx + 1),
        'LINE OA',
        f.monthKey,
        format(new Date(f.followedAt), 'yyyy-MM-dd HH:mm:ss'),
        f.leadType === 'existing_customer'
          ? 'Existing Customer (ลูกค้าเก่าใน CRM)'
          : Boolean(f.linkedCustomerId) || f.orderCount > 0
            ? 'True New Lead - Converted (ลูกค้าใหม่เปิดบิลแล้ว)'
            : f.hasChatted
              ? 'True New Lead - Inquiry (ลูกค้าใหม่ทักสอบถาม)'
              : 'True New Lead - Silent (แอดแล้วยังไม่ทัก)',
        `"${(f.displayName || '').replace(/"/g, '""')}"`,
        f.hasChatted ? 'Chatted' : 'Followed Only',
        `"${(f.lastMessageText || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`,
        `"${(f.linkedCustomerName || '-').replace(/"/g, '""')}"`,
        `"${(f.linkedCustomerPhone || '-').replace(/"/g, '""')}"`,
        f.memberId || '-',
        String(f.orderCount),
        String(f.paidRevenue),
        f.userId,
      ]);
      const csvContent =
        '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `line_leads_${statusFilter}_${selectedMonth}_${format(new Date(), 'yyyyMMdd')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success('Exported LINE Leads CSV');
    } else {
      if (filteredWaList.length === 0) {
        toast.error('ไม่มีข้อมูลสำหรับส่งออก');
        return;
      }
      const headers = [
        'No.',
        'Channel',
        'Month',
        'First Contact At',
        'Lead Classification',
        'WhatsApp Name',
        'Phone Number',
        'Last Message',
        'CRM Customer Name',
        'Member ID',
        'Orders Count',
        'Paid Revenue (THB)',
      ];
      const rows = filteredWaList.map((w, idx) => [
        String(idx + 1),
        'WhatsApp',
        w.monthKey,
        format(new Date(w.firstContactAt), 'yyyy-MM-dd HH:mm:ss'),
        w.leadType === 'existing_customer'
          ? 'Existing Customer (ลูกค้าเก่าทักแชท)'
          : Boolean(w.linkedCustomerId) || w.orderCount > 0
            ? 'True New Lead - Converted (ลูกค้าใหม่เปิดบิลแล้ว)'
            : 'True New Lead - Inquiry (ลูกค้าใหม่ทักสอบถาม)',
        `"${(w.displayName || '').replace(/"/g, '""')}"`,
        `"${(w.contactPhone || '').replace(/"/g, '""')}"`,
        `"${(w.lastMessageText || '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`,
        `"${(w.linkedCustomerName || '-').replace(/"/g, '""')}"`,
        w.memberId || '-',
        String(w.orderCount),
        String(w.paidRevenue),
      ]);
      const csvContent =
        '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsapp_leads_${statusFilter}_${selectedMonth}_${format(new Date(), 'yyyyMMdd')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast.success('Exported WhatsApp Leads CSV');
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Banner + Inner Channel Switcher (LINE OA vs WhatsApp) */}
      <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-xs shrink-0 ${
                isLine ? 'bg-[#06C755]' : 'bg-emerald-600'
              }`}
            >
              {isLine ? <UserPlus size={20} /> : <Phone size={20} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                  {isLine
                    ? 'LINE OA New Leads Report (รายงานลูกค้าใหม่แท้ที่แอด LINE รายเดือน)'
                    : 'WhatsApp New Leads Report (รายงานลูกค้าใหม่แท้ที่ทัก WhatsApp รายเดือน)'}
                </h2>
                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                  {isLine ? 'LINE Official Account' : 'WhatsApp Business Cloud API'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                คัดแยกลูกค้าใหม่แท้ (True New Leads) ออกจากลูกค้าเก่าที่มีประวัติใน CRM มาก่อน พร้อมสรุปอัตราเปลี่ยนเป็นลูกค้าเปิดบิลและยอดรายได้ในรูปแบบเดียวกันทั้ง LINE และ WhatsApp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {/* Inner Channel Switcher Tabs: LINE OA vs WhatsApp */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => handleSwitchChannel('line')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  isLine
                    ? 'bg-[#06C755] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current" />
                <span>LINE OA (ลูกค้าใหม่แท้)</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    isLine ? 'bg-black/20 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}
                  title={`ลูกค้าใหม่แท้ ${trueNewLineCount} คน (จากทั้งหมด ${enrichedLineFollowers.length} คน)`}
                >
                  {trueNewLineCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchChannel('whatsapp')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                  !isLine
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Phone size={12} />
                <span>WhatsApp (ลูกค้าใหม่แท้)</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    !isLine ? 'bg-black/20 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}
                  title={`ลูกค้าใหม่แท้ ${trueNewWaCount} เบอร์ (จากทั้งหมด ${enrichedWaContacts.length} เบอร์)`}
                >
                  {trueNewWaCount}
                </span>
              </button>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadReport()}
              disabled={loading}
              className="h-9 px-3 text-xs font-bold rounded-xl gap-1.5 cursor-pointer"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleExportCsv}
              disabled={
                (isLine ? filteredLineList.length : filteredWaList.length) === 0
              }
              className="h-9 px-3.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-1.5 cursor-pointer"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Unified 5 KPI Cards (Identical Layout & Metrics for Both LINE OA & WhatsApp) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Card 1: True New Leads */}
        <div
          className={`bg-white dark:bg-slate-850 p-4 rounded-2xl border-2 shadow-xs ${
            isLine ? 'border-[#06C755]/45' : 'border-emerald-500/45'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
            <span>✨ ลูกค้าใหม่แท้ (True New Leads)</span>
            <Sparkles size={15} className={isLine ? 'text-[#06C755]' : 'text-emerald-600'} />
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1.5">
            {activeStats.trueNewLeads.toLocaleString()}{' '}
            <span className="text-xs font-bold text-slate-400">{unitLabel}</span>
          </div>
          <p className="text-[11px] text-emerald-700 font-semibold mt-1">
            {isLine
              ? 'แอด LINE ใหม่ • ไม่เคยมีประวัติใน CRM มาก่อน'
              : 'ทัก WhatsApp ใหม่ • ไม่เคยมีประวัติใน CRM มาก่อน'}
          </p>
        </div>

        {/* Card 2: New Leads Converted to CRM / Orders */}
        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>✅ ลูกค้าใหม่ที่เปิดบิลแล้ว</span>
            <UserCheck size={15} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-600 mt-1.5">
            {activeStats.newConverted.toLocaleString()}{' '}
            <span className="text-xs font-bold text-slate-400">
              {unitLabel} ({activeStats.conversionRate}%)
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            เปลี่ยนจาก Lead ใหม่เป็นลูกค้าเปิดบิลจริง
          </p>
        </div>

        {/* Card 3: New Leads Inquiries / Pending Conversion */}
        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>
              {isLine ? '💬 ลูกค้าใหม่ที่ยังไม่เปิดบิล' : '💬 ลูกค้าใหม่ทักสอบถาม (Inquiries)'}
            </span>
            <MessageCircle size={15} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 mt-1.5">
            {activeStats.newInquiries.toLocaleString()}{' '}
            <span className="text-xs font-bold text-slate-400">{unitLabel}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {isLine
              ? `ทักแชทแล้ว ${activeStats.newInquiriesChatted} คน • แอดยังไม่ทัก ${activeStats.newSilent} คน`
              : 'เบอร์ใหม่ทักแชท (ยังไม่ผูก CRM / ยังไม่เปิดบิล)'}
          </p>
        </div>

        {/* Card 4: Orders & Paid Revenue from True New Leads */}
        <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>💰 ยอดเปิดบิลจากลูกค้าใหม่แท้</span>
            <ShoppingBag size={15} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-1.5">
            ฿{activeStats.newLeadsRevenue.toLocaleString()}{' '}
          </div>
          <p className="text-[11px] text-emerald-700 font-bold mt-1">
            รวม {activeStats.newLeadsOrders.toLocaleString()} บิล (เฉพาะกลุ่มลูกค้าใหม่แท้)
          </p>
        </div>

        {/* Card 5: Existing CRM Customers Separated Out */}
        <div className="bg-slate-50/90 dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 shadow-xs col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>🔄 ลูกค้าเก่าใน CRM (คัดแยกออก)</span>
            <History size={15} className="text-slate-500" />
          </div>
          <div className="text-2xl font-black text-slate-700 mt-1.5">
            {activeStats.existingCustomers.toLocaleString()}{' '}
            <span className="text-xs font-bold text-slate-400">
              / {activeStats.totalAllContacts} {unitLabel}รวม
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {isLine
              ? `มีประวัติใน CRM ก่อนกดแอด • ฐานเพื่อนสะสม ${totalLinePoolCount.toLocaleString()} บัญชี`
              : 'มีประวัติใน CRM หรือเคยเปิดบิลมาก่อนทักแชท'}
          </p>
        </div>
      </div>

      {/* Unified Monthly Summary Breakdown Table */}
      <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-indigo-600" />
            <h3 className="text-sm font-black text-slate-900">
              {isLine
                ? 'สรุปจำนวนลูกค้าใหม่แท้ที่แอด LINE OA แยกตามเดือน (True New LINE Leads vs Existing)'
                : 'สรุปจำนวนลูกค้าใหม่แท้ที่ทัก WhatsApp แยกตามเดือน (True New WhatsApp Leads vs Existing)'}
            </h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Month Pills: All + up to 3 most recent months */}
            <button
              type="button"
              onClick={() => setSelectedMonth('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                selectedMonth === 'ALL'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ทุกเดือน ({isLine ? trueNewLineCount : trueNewWaCount} ลูกค้าใหม่แท้)
            </button>
            {recentThreeMonths.map((m) => (
              <button
                key={m.monthKey}
                type="button"
                onClick={() => setSelectedMonth(m.monthKey)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  selectedMonth === m.monthKey
                    ? isLine
                      ? 'bg-[#06C755] text-white shadow-2xs'
                      : 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                {formatMonthLabel(m.monthKey)} (ใหม่แท้ {m.trueNewLeadsCount})
              </button>
            ))}

            {/* Month Selector Dropdown (Scales cleanly as months & years grow) */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/90 rounded-xl px-2.5 py-1">
              <CalendarDays size={13} className="text-slate-500 shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                aria-label="เลือกเดือน (Select Month)"
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="ALL">
                  📅 เลือกเดือน: ทุกเดือนรวม ({isLine ? trueNewLineCount : trueNewWaCount} {unitLabel})
                </option>
                {activeMonthlyBuckets.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {formatMonthLabel(m.monthKey)} — ลูกค้าใหม่แท้ {m.trueNewLeadsCount} {unitLabel} (รวม {m.totalCount})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {activeMonthlyBuckets.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px] bg-slate-50/80">
                  <th className="py-2.5 px-3 rounded-tl-xl">เดือน (Month)</th>
                  <th className="py-2.5 px-3 text-right">
                    ✨ ลูกค้าใหม่แท้ (True New Leads)
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    ✅ เปิดบิลแล้ว (Converted)
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    {isLine ? '💬 ยังไม่เปิดบิล (ทัก/ยังไม่ทัก)' : '💬 ทักสอบถาม (Inquiries)'}
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    🔄 ลูกค้าเก่าใน CRM (Existing)
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    💰 ยอดเปิดบิลลูกค้าใหม่แท้ (Paid ฿)
                  </th>
                  <th className="py-2.5 px-3 w-[22%] rounded-tr-xl">สัดส่วนลูกค้าใหม่แท้</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeMonthlyBuckets.map((m) => {
                  const pct = Math.max(
                    6,
                    Math.round((m.trueNewLeadsCount / maxMonthlyCount) * 100)
                  );
                  const isSelected = selectedMonth === m.monthKey;
                  const convPct =
                    m.trueNewLeadsCount > 0
                      ? Math.round((m.newConvertedCount / m.trueNewLeadsCount) * 100)
                      : 0;
                  return (
                    <tr
                      key={m.monthKey}
                      onClick={() => setSelectedMonth(isSelected ? 'ALL' : m.monthKey)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-50/70 font-bold' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        {formatMonthLabel(m.monthKey)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-emerald-700 text-sm">
                        +{m.trueNewLeadsCount.toLocaleString()} {unitLabel}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-indigo-700">
                        {m.newConvertedCount.toLocaleString()} {unitLabel}{' '}
                        <span className="text-[10px] text-slate-400 font-semibold">
                          ({convPct}%)
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-amber-600">
                        {m.newInquiryCount.toLocaleString()} {unitLabel}
                        {isLine && m.newSilentCount > 0 && (
                          <span className="text-[10px] text-slate-400 font-normal ml-1">
                            (ยังไม่ทัก {m.newSilentCount})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-500">
                        {m.existingCustomerCount.toLocaleString()} {unitLabel}{' '}
                        <span className="text-[10px] text-slate-400 font-normal">
                          (จากรวม {m.totalCount})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                        ฿{m.newLeadsRevenue.toLocaleString()}{' '}
                        <span className="text-[10px] text-slate-500 font-semibold">
                          ({m.newLeadsOrders} บิล)
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div
                            className={`${
                              isLine ? 'bg-[#06C755]' : 'bg-emerald-600'
                            } h-full rounded-full transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Unified Filter Pills & Search Bar */}
      <div className="bg-white dark:bg-slate-850 p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                {
                  id: 'new_leads' as const,
                  label: `✨ ลูกค้าใหม่แท้ทั้งหมด (${activeStats.trueNewLeads})`,
                },
                {
                  id: 'new_converted' as const,
                  label: `✅ ลูกค้าใหม่ที่เปิดบิลแล้ว (${activeStats.newConverted})`,
                },
                {
                  id: 'new_inquiry' as const,
                  label: isLine
                    ? `💬 ลูกค้าใหม่ที่ยังไม่เปิดบิล (${activeStats.newInquiries})`
                    : `💬 ลูกค้าใหม่ทักสอบถาม (${activeStats.newInquiries})`,
                },
                ...(isLine
                  ? [
                      {
                        id: 'silent' as const,
                        label: `⏳ แอดแล้วยังไม่ทัก (${activeStats.newSilent})`,
                      },
                    ]
                  : []),
                {
                  id: 'existing_customer' as const,
                  label: `🔄 ลูกค้าเก่าใน CRM (${activeStats.existingCustomers})`,
                },
                {
                  id: 'all' as const,
                  label: `รวมทั้งหมด (${activeStats.totalAllContacts})`,
                },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === tab.id
                    ? isLine
                      ? 'bg-[#06C755] text-white shadow-2xs'
                      : 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-80">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isLine
                  ? 'ค้นหาชื่อ LINE, ชื่อลูกค้า, เบอร์โทร, UID...'
                  : 'ค้นหาชื่อ WhatsApp, เบอร์โทร (+66), ชื่อลูกค้า...'
              }
              className="h-9 pl-8.5 text-xs rounded-xl bg-slate-50 border-slate-200"
            />
          </div>
        </div>

        {/* Unified Detailed Table */}
        <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[11px]">
                <th className="py-3 px-3 w-12 text-center">#</th>
                <th className="py-3 px-3">
                  {isLine ? 'วันที่แอด LINE (Followed At)' : 'วันที่ทักครั้งแรก (First Contact)'}
                </th>
                <th className="py-3 px-3">
                  {isLine ? 'โปรไฟล์ LINE ลูกค้า' : 'โปรไฟล์ WhatsApp & เบอร์โทร'}
                </th>
                <th className="py-3 px-3">ประเภทลูกค้า & ข้อความล่าสุด</th>
                <th className="py-3 px-3">ข้อมูลลูกค้า CRM / ยอดเปิดบิล</th>
                <th className="py-3 px-3 text-right">
                  {isLine ? 'LINE User ID' : 'เบอร์ติดต่อ (Phone)'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    กำลังโหลดข้อมูลรายชื่อลูกค้า...
                  </td>
                </tr>
              ) : isLine ? (
                filteredLineList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      ไม่พบรายชื่อผู้ติดตาม LINE ที่ตรงกับเงื่อนไข
                    </td>
                  </tr>
                ) : (
                  paginatedLineList.map((f, idx) => {
                    let dateStr = '';
                    try {
                      dateStr = format(new Date(f.followedAt), 'dd/MM/yyyy HH:mm');
                    } catch {
                      dateStr = f.followedAt;
                    }

                    let existingSinceStr = '';
                    if (f.existingSinceAt) {
                      try {
                        existingSinceStr = format(new Date(f.existingSinceAt), 'dd/MM/yyyy');
                      } catch {}
                    }

                    const isConverted = Boolean(f.linkedCustomerId) || f.orderCount > 0;
                    const rowNumber = pageStartIndex + idx + 1;

                    return (
                      <tr key={f.userId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 text-center font-mono text-slate-400 font-bold">
                          {rowNumber}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <div className="font-bold text-slate-800">{dateStr}</div>
                          <div className="text-[10px] text-slate-400 font-semibold">
                            เดือน {f.monthKey}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2.5">
                            {f.pictureUrl ? (
                              <img
                                src={f.pictureUrl}
                                alt={f.displayName}
                                className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div
                                className={`w-9 h-9 rounded-full text-white font-black text-xs flex items-center justify-center shrink-0 ${
                                  f.leadType === 'existing_customer'
                                    ? 'bg-slate-500'
                                    : 'bg-[#06C755]'
                                }`}
                              >
                                {(f.displayName || 'L').slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-black text-slate-900 text-[13px] truncate max-w-[200px]">
                                {f.displayName}
                              </div>
                              {f.linkedCustomerPhone ? (
                                <div className="text-[11px] text-emerald-700 font-mono font-bold truncate max-w-[200px]">
                                  {f.linkedCustomerPhone}
                                </div>
                              ) : (
                                f.statusMessage && (
                                  <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                                    {f.statusMessage}
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 max-w-[300px]">
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            {f.leadType === 'existing_customer' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                                <History size={10} />
                                <span>
                                  ลูกค้าเก่าใน CRM
                                  {existingSinceStr ? ` (ตั้งแต่ ${existingSinceStr})` : ''}
                                </span>
                              </span>
                            ) : isConverted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Sparkles size={10} />
                                <span>ลูกค้าใหม่แท้ • เปิดบิลแล้ว</span>
                              </span>
                            ) : f.hasChatted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                <CheckCircle2 size={10} />
                                <span>ลูกค้าใหม่แท้ • ทักแชทแล้ว</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock size={10} />
                                <span>ลูกค้าใหม่แท้ • แอดยังไม่ทัก</span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 truncate">
                            {f.lastMessageText}
                          </p>
                        </td>
                        <td className="py-2.5 px-3">
                          {f.linkedCustomerName || f.orderCount > 0 ? (
                            <div className="space-y-0.5">
                              <div className="font-bold text-emerald-800 flex items-center gap-1">
                                <UserCheck size={12} className="text-emerald-600 shrink-0" />
                                <span>{f.linkedCustomerName || 'Linked Customer'}</span>
                                {f.memberId && (
                                  <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-1.5 rounded">
                                    #{f.memberId}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {f.orderCount > 0 ? (
                                  <span className="font-bold text-emerald-700">
                                    {f.orderCount} ออเดอร์ (฿{f.paidRevenue.toLocaleString()})
                                  </span>
                                ) : (
                                  <span>ผูกโปรไฟล์ CRM แล้ว</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px]">
                              ยังไม่ผูกโปรไฟล์ลูกค้า CRM
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(f.userId);
                              toast.success('Copied LINE User ID');
                            }}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 px-2 py-1 rounded-lg border border-slate-200/80 cursor-pointer"
                            title="Copy LINE User ID"
                          >
                            <span>{f.userId.slice(0, 10)}…</span>
                            <Copy size={10} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )
              ) : filteredWaList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    ไม่พบรายชื่อลูกค้า WhatsApp ที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              ) : (
                paginatedWaList.map((w, idx) => {
                  let dateStr = '';
                  try {
                    dateStr = format(new Date(w.firstContactAt), 'dd/MM/yyyy HH:mm');
                  } catch {
                    dateStr = w.firstContactAt;
                  }

                  let existingSinceStr = '';
                  if (w.existingSinceAt) {
                    try {
                      existingSinceStr = format(new Date(w.existingSinceAt), 'dd/MM/yyyy');
                    } catch {}
                  }

                  const isConverted = Boolean(w.linkedCustomerId) || w.orderCount > 0;
                  const rowNumber = pageStartIndex + idx + 1;

                  return (
                    <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400 font-bold">
                        {rowNumber}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-bold text-slate-800">{dateStr}</div>
                        <div className="text-[10px] text-slate-400 font-semibold">
                          เดือน {w.monthKey}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-9 h-9 rounded-full text-white font-black text-xs flex items-center justify-center shrink-0 ${
                              w.leadType === 'existing_customer'
                                ? 'bg-slate-500'
                                : 'bg-emerald-600'
                            }`}
                          >
                            {(w.displayName || 'W').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-black text-slate-900 text-[13px] truncate max-w-[200px]">
                              {w.displayName}
                            </div>
                            <div className="text-[11px] text-emerald-700 font-mono font-bold truncate max-w-[200px]">
                              {w.contactPhone}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 max-w-[300px]">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          {w.leadType === 'existing_customer' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                              <History size={10} />
                              <span>
                                ลูกค้าเก่าใน CRM
                                {existingSinceStr ? ` (ตั้งแต่ ${existingSinceStr})` : ''}
                              </span>
                            </span>
                          ) : isConverted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Sparkles size={10} />
                              <span>ลูกค้าใหม่แท้ • เปิดบิลแล้ว</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Sparkles size={10} />
                              <span>ลูกค้าใหม่แท้ • ทักสอบถาม</span>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 truncate">
                          {w.lastMessageText}
                        </p>
                      </td>
                      <td className="py-2.5 px-3">
                        {w.linkedCustomerName || w.orderCount > 0 ? (
                          <div className="space-y-0.5">
                            <div className="font-bold text-emerald-800 flex items-center gap-1">
                              <UserCheck size={12} className="text-emerald-600 shrink-0" />
                              <span>{w.linkedCustomerName || 'Linked Customer'}</span>
                              {w.memberId && (
                                <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-1.5 rounded">
                                  #{w.memberId}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {w.orderCount > 0 ? (
                                <span className="font-bold text-emerald-700">
                                  {w.orderCount} ออเดอร์ (฿{w.paidRevenue.toLocaleString()})
                                </span>
                              ) : (
                                <span>ผูกโปรไฟล์ CRM แล้ว</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">
                            ยังไม่ผูกโปรไฟล์ลูกค้า CRM
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(w.contactPhone || w.externalContactId);
                            toast.success(`Copied ${w.contactPhone || w.externalContactId}`);
                          }}
                          className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-700 hover:text-emerald-900 bg-emerald-50/70 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200/80 cursor-pointer font-bold"
                          title="Copy Phone Number"
                        >
                          <span>{w.contactPhone || w.externalContactId}</span>
                          <Copy size={10} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {!loading && activeFilteredCount > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-3 flex-wrap text-slate-600">
              <span>
                แสดง{' '}
                <strong className="font-black text-slate-900">
                  {(pageStartIndex + 1).toLocaleString()}
                </strong>
                –
                <strong className="font-black text-slate-900">
                  {Math.min(pageStartIndex + pageSize, activeFilteredCount).toLocaleString()}
                </strong>{' '}
                จากทั้งหมด{' '}
                <strong className="font-black text-emerald-700">
                  {activeFilteredCount.toLocaleString()}
                </strong>{' '}
                {unitLabel}
              </span>

              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                <span className="text-[11px] text-slate-500 font-semibold">แสดงต่อหน้า:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) || 25)}
                  aria-label="จำนวนรายการต่อหน้า (Rows per page)"
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  {[20, 25, 50, 100].map((sz) => (
                    <option key={sz} value={sz}>
                      {sz} รายการ
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage <= 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                title="หน้าแรก (First Page)"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft size={13} />
                <span>ก่อนหน้า</span>
              </button>

              {visiblePageNumbers.map((pageNum) => {
                const isCurrent = pageNum === safeCurrentPage;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      isCurrent
                        ? isLine
                          ? 'bg-[#06C755] text-white shadow-2xs'
                          : 'bg-emerald-600 text-white shadow-2xs'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none inline-flex items-center gap-1 cursor-pointer"
              >
                <span>ถัดไป</span>
                <ChevronRight size={13} />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                title="หน้าสุดท้าย (Last Page)"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
