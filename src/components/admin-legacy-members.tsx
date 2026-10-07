"use client";

import React, { useState, useMemo } from "react";
import {
  Archive,
  Search,
  Download,
  Building,
  Calendar,
  Phone,
  Tag,
  User,
  Check,
  Copy,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  FileText,
  DollarSign,
  Sparkles,
  MapPin,
  RefreshCw
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";
import rawLegacyMembers from "@/data/legacy-members.json";

export interface LegacyMember {
  id: string;
  seq: number;
  memNo: string;
  branch: string;
  startDate: string;
  expireDate: string;
  amount: number | null;
  amountRaw: string;
  sales: string;
  package: string;
  title: string;
  name: string;
  condo: string;
  room: string;
  phone: string;
  email: string;
  remarks: string;
}

const membersData: LegacyMember[] = rawLegacyMembers as LegacyMember[];

// Branch Badge Styling
export function getBranchBadgeStyle(branch: string): { bg: string; text: string; border: string } {
  switch (branch) {
    case "15 Sukhumvit":
      return { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" };
    case "Office / Delivery":
      return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
    case "Pattaya":
      return { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-300" };
    case "Circle Condo":
      return { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200" };
    case "Rhythm Asoke":
      return { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200" };
    case "Sukhumvit 1":
      return { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" };
    default:
      return { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };
  }
}

export function AdminLegacyMembers() {
  const [search, setSearch] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>("ALL");
  const [selectedSales, setSelectedSales] = useState<string>("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedMember, setSelectedMember] = useState<LegacyMember | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Extract unique branches and sales
  const branchesList = useMemo(() => {
    const set = new Set<string>();
    membersData.forEach((m) => {
      if (m.branch) set.add(m.branch);
    });
    return Array.from(set).sort();
  }, []);

  const salesList = useMemo(() => {
    const set = new Set<string>();
    membersData.forEach((m) => {
      if (m.sales && m.sales !== "-") set.add(m.sales);
    });
    return Array.from(set).sort();
  }, []);

  // Filtered members
  const filteredMembers = useMemo(() => {
    let result = membersData;

    // Filter by branch
    if (selectedBranch !== "ALL") {
      result = result.filter((m) => m.branch === selectedBranch);
    }

    // Filter by sales
    if (selectedSales !== "ALL") {
      result = result.filter((m) => m.sales.toUpperCase() === selectedSales.toUpperCase());
    }

    // Filter by search query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((m) => {
        return (
          m.memNo.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.phone.toLowerCase().includes(q) ||
          m.condo.toLowerCase().includes(q) ||
          m.room.toLowerCase().includes(q) ||
          m.package.toLowerCase().includes(q) ||
          m.sales.toLowerCase().includes(q) ||
          m.remarks.toLowerCase().includes(q) ||
          m.branch.toLowerCase().includes(q)
        );
      });
    }

    return result;
  }, [search, selectedBranch, selectedSales]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalRecords = membersData.length;
    let totalAmount = 0;
    const branchCounts: Record<string, number> = {};

    membersData.forEach((m) => {
      if (m.amount) totalAmount += m.amount;
      branchCounts[m.branch] = (branchCounts[m.branch] || 0) + 1;
    });

    return {
      totalRecords,
      totalAmount,
      branchCounts,
    };
  }, []);

  // Pagination
  const totalPages = Math.ceil(filteredMembers.length / pageSize) || 1;
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMembers.slice(start, start + pageSize);
  }, [filteredMembers, currentPage, pageSize]);

  // Reset page when filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedBranch, selectedSales, pageSize]);

  // Copy to clipboard helper
  const handleCopy = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(`Copied: ${text}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Export filtered data as CSV
  const handleExportCSV = () => {
    const headers = [
      "Member No",
      "Branch",
      "Start Date",
      "Expire Date",
      "Amount",
      "Package",
      "Sales",
      "Title",
      "Name",
      "Condo/House",
      "Room/Unit",
      "Mobile",
      "Email",
      "Remarks"
    ];

    const rows = filteredMembers.map((m) => [
      `"${m.memNo}"`,
      `"${m.branch}"`,
      `"${m.startDate}"`,
      `"${m.expireDate}"`,
      m.amount || 0,
      `"${m.package.replace(/"/g, '""')}"`,
      `"${m.sales}"`,
      `"${m.title}"`,
      `"${m.name.replace(/"/g, '""')}"`,
      `"${m.condo.replace(/"/g, '""')}"`,
      `"${m.room.replace(/"/g, '""')}"`,
      `"${m.phone}"`,
      `"${m.email}"`,
      `"${m.remarks.replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `legacy_members_${selectedBranch}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredMembers.length} records to CSV`);
  };

  return (
    <div className="p-5 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Archive size={20} />
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Legacy Members Archive (ฐานข้อมูลสมาชิกเดิม)
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 mt-1.5 flex items-center gap-2">
            <span>ข้อมูลประวัติแพ็กเกจสมาชิกและแคชแอคเคาท์จากระบบเดิม สำหรับสืบค้นและอ้างอิง</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-emerald-400 font-semibold">Standalone Mode (ไม่ผูกหรือกระทบข้อมูล CRM ปัจจุบัน)</span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <Button
            onClick={handleExportCSV}
            variant="outline"
            className="h-9 px-3.5 bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs font-bold gap-1.5 rounded-xl cursor-pointer"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </Button>
        </div>
      </div>

      {/* Quick Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Archive</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
              <FileText size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.totalRecords.toLocaleString()}</span>
            <span className="text-xs font-semibold text-slate-500">records</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">จากประวัติแพ็กเกจเดิมทั้งหมด</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Package Amount</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
              <DollarSign size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-700">฿{stats.totalAmount.toLocaleString()}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">มูลค่าแพ็กเกจรวมในประวัติ</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">15 Sukhumvit</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              HQ
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{stats.branchCounts["15 Sukhumvit"] || 0}</span>
            <span className="text-xs font-semibold text-slate-500">members</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">และ Office Delivery {stats.branchCounts["Office / Delivery"] || 0} รายการ</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Other Branches</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
              Branch
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">
              {(stats.branchCounts["Pattaya"] || 0) +
                (stats.branchCounts["Circle Condo"] || 0) +
                (stats.branchCounts["Rhythm Asoke"] || 0) +
                (stats.branchCounts["Sukhumvit 1"] || 0)}
            </span>
            <span className="text-xs font-semibold text-slate-500">members</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">PTY: {stats.branchCounts["Pattaya"] || 0} | Circle: {stats.branchCounts["Circle Condo"] || 0}</span>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              type="text"
              placeholder="ค้นหา Member No (เช่น SR2006, OF2100), ชื่อลูกค้า, เบอร์โทร, คอนโด, หรือแพ็กเกจ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-10 bg-slate-50/70 border-slate-200 text-xs rounded-xl focus:bg-white"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Branch Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500">Branch:</span>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="h-10 text-xs font-bold border border-slate-200 rounded-xl px-3 bg-slate-50/70 focus:bg-white text-slate-700 cursor-pointer"
              >
                <option value="ALL">All Branches ({membersData.length})</option>
                {branchesList.map((b) => (
                  <option key={b} value={b}>
                    {b} ({stats.branchCounts[b] || 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Sales Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500">Sales:</span>
              <select
                value={selectedSales}
                onChange={(e) => setSelectedSales(e.target.value)}
                className="h-10 text-xs font-bold border border-slate-200 rounded-xl px-3 bg-slate-50/70 focus:bg-white text-slate-700 cursor-pointer max-w-[150px]"
              >
                <option value="ALL">All Sales</option>
                {salesList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear All Filters */}
            {(search || selectedBranch !== "ALL" || selectedSales !== "ALL") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setSelectedBranch("ALL");
                  setSelectedSales("ALL");
                }}
                className="h-10 px-2.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold rounded-xl"
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Results summary bar */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
          <span>
            พบข้อมูลทั้งหมด <strong className="text-slate-800">{filteredMembers.length}</strong> รายการ
            {selectedBranch !== "ALL" && ` ในสาขา ${selectedBranch}`}
            {selectedSales !== "ALL" && ` โดยเซลส์ ${selectedSales}`}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">แสดงต่อหน้า:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="text-xs font-bold border border-slate-200 rounded-lg px-2 py-1 bg-white cursor-pointer"
            >
              <option value={20}>20</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 select-none">
              <tr>
                <th className="py-3 px-4">Member No</th>
                <th className="py-3 px-4">Customer Name</th>
                <th className="py-3 px-4">Mobile</th>
                <th className="py-3 px-4">Condo / Building</th>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-4">Package / Amount</th>
                <th className="py-3 px-4">Period</th>
                <th className="py-3 px-4">Sales</th>
                <th className="py-3 px-4">Remarks</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {paginatedMembers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400">
                    <Archive size={36} className="mx-auto text-slate-300 mb-2" />
                    <p className="font-bold text-sm text-slate-600">ไม่พบข้อมูลสมาชิกเดิมที่ตรงกับการค้นหา</p>
                    <p className="text-xs text-slate-400 mt-1">ลองเปลี่ยนคำค้นหา หรือกด Reset ตัวกรอง</p>
                  </td>
                </tr>
              ) : (
                paginatedMembers.map((m) => {
                  const bStyle = getBranchBadgeStyle(m.branch);

                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedMember(m)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Member No */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-indigo-700 bg-indigo-50/80 px-2 py-0.5 rounded-md border border-indigo-200/60 shadow-2xs">
                            {m.memNo}
                          </span>
                        </div>
                      </td>

                      {/* Customer Name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          {m.title && <span className="text-[10px] text-slate-400">{m.title}</span>}
                          <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate max-w-[170px]">
                            {m.name}
                          </span>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {m.phone ? (
                          <div className="flex items-center gap-1 font-mono text-[11px] text-slate-600">
                            <span>{m.phone}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(m.phone, m.id);
                              }}
                              className="text-slate-400 hover:text-indigo-600 p-0.5 cursor-pointer"
                              title="Copy Phone"
                            >
                              {copiedId === m.id ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Condo / Building & Room */}
                      <td className="py-3 px-4">
                        {m.condo ? (
                          <div className="max-w-[180px]">
                            <div className="truncate font-semibold text-slate-800" title={m.condo}>
                              {m.condo}
                            </div>
                            {m.room && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                Room: {m.room}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Branch */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${bStyle.bg} ${bStyle.text} ${bStyle.border}`}
                        >
                          {m.branch}
                        </span>
                      </td>

                      {/* Package / Amount */}
                      <td className="py-3 px-4">
                        <div className="max-w-[190px]">
                          <div className="truncate font-bold text-slate-900 text-xs" title={m.package}>
                            {m.package}
                          </div>
                          {m.amount && (
                            <span className="text-[11px] font-black text-emerald-600">
                              ฿{m.amount.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Period (Start - Expire) */}
                      <td className="py-3 px-4 whitespace-nowrap text-[11px] font-mono text-slate-500">
                        <div>{m.startDate !== "-" ? m.startDate : "—"}</div>
                        {m.expireDate && m.expireDate !== "-" && (
                          <div className="text-[10px] text-slate-400">to {m.expireDate}</div>
                        )}
                      </td>

                      {/* Sales Staff */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {m.sales && m.sales !== "-" ? (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200">
                            {m.sales}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Remarks */}
                      <td className="py-3 px-4">
                        {m.remarks ? (
                          <p className="text-[11px] text-slate-500 truncate max-w-[160px]" title={m.remarks}>
                            {m.remarks}
                          </p>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMember(m);
                          }}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                          title="ดูรายละเอียด"
                        >
                          <Eye size={14} />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredMembers.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 bg-slate-50/60 border-t border-slate-200 text-xs text-slate-500">
            <div>
              กำลังแสดง {(currentPage - 1) * pageSize + 1} -{" "}
              {Math.min(currentPage * pageSize, filteredMembers.length)} จาก {filteredMembers.length} รายการ
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-8 px-2.5 rounded-lg text-xs font-bold gap-1 cursor-pointer"
              >
                <ChevronLeft size={14} />
                <span>Prev</span>
              </Button>

              <span className="px-3 py-1 font-bold text-slate-700">
                {currentPage} / {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="h-8 px-2.5 rounded-lg text-xs font-bold gap-1 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Member Detail Dialog */}
      {selectedMember && (
        <Dialog open={Boolean(selectedMember)} onOpenChange={(open) => !open && setSelectedMember(null)}>
          <DialogContent className="max-w-lg p-0 overflow-hidden rounded-2xl">
            {/* Header with Branch color */}
            <div className="bg-slate-900 text-white p-5 border-b border-slate-800">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black px-2.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                      {selectedMember.memNo}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        getBranchBadgeStyle(selectedMember.branch).bg
                      } ${getBranchBadgeStyle(selectedMember.branch).text} ${
                        getBranchBadgeStyle(selectedMember.branch).border
                      }`}
                    >
                      {selectedMember.branch}
                    </span>
                  </div>
                  <h3 className="text-xl font-black mt-2 text-white flex items-center gap-1.5">
                    {selectedMember.title && <span className="text-sm font-normal text-slate-400">{selectedMember.title}</span>}
                    <span>{selectedMember.name}</span>
                  </h3>
                </div>
              </div>
            </div>

            {/* Content Details */}
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
              {/* Package & Amount Card */}
              <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900">Package Details</span>
                  {selectedMember.amount && (
                    <span className="text-sm font-black text-indigo-700 bg-white px-2.5 py-0.5 rounded-md border border-indigo-200">
                      ฿{selectedMember.amount.toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-sm font-black text-slate-900">{selectedMember.package}</p>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-100/70 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Start Date:</span>
                    <span className="font-semibold text-slate-700">{selectedMember.startDate || "-"}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Expire Date:</span>
                    <span className="font-semibold text-slate-700">{selectedMember.expireDate || "-"}</span>
                  </div>
                </div>
              </div>

              {/* Customer Contact & Address */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Contact & Address</span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Mobile Phone:</span>
                    <div className="font-mono font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                      <span>{selectedMember.phone || "-"}</span>
                      {selectedMember.phone && (
                        <button
                          type="button"
                          onClick={() => handleCopy(selectedMember.phone, "modal-phone")}
                          className="text-slate-400 hover:text-indigo-600 cursor-pointer"
                        >
                          <Copy size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block">Sales Staff:</span>
                    <span className="font-bold text-slate-800 mt-0.5 block">{selectedMember.sales || "-"}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/60">
                  <span className="text-[10px] text-slate-400 block">Condo / Building:</span>
                  <div className="font-bold text-slate-800 flex items-center gap-1 mt-0.5">
                    <MapPin size={13} className="text-slate-400 shrink-0" />
                    <span>{selectedMember.condo || "-"}</span>
                    {selectedMember.room && (
                      <span className="text-slate-500 font-mono text-[11px]"> (Room: {selectedMember.room})</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Remarks / Renewal History */}
              {selectedMember.remarks && (
                <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                    <FileText size={12} />
                    <span>Remarks & Renewal History (บันทึก / การต่ออายุเดิม)</span>
                  </span>
                  <p className="text-xs font-medium text-amber-950 whitespace-pre-wrap leading-relaxed">
                    {selectedMember.remarks}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400 italic">
                ข้อมูลบันทึกในประวัติระบบเดิม
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedMember(null)}
                className="font-bold text-xs"
              >
                Close (ปิด)
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
