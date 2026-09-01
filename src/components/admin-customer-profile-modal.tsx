import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Phone, MapPin, Star, FileText, Calendar, CreditCard, Wallet, Crown, Building, Mail, Clock, AlertTriangle, Receipt, Eye, Coins, ImageIcon, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { type Customer, shopStore } from "@/lib/store";
import { useSyncExternalStore, useState, useEffect, useMemo } from "react";
import { useJobs } from "@/lib/use-jobs";
import { motion } from "framer-motion";
import { getTopUpTransactionsAction } from "@/actions/db";
import { A5ReceiptDialog } from "@/components/a5-receipt-dialog";
import { type ReceiptData } from "@/components/thermal-receipt-dialog";

// Helper to extract initials for avatar
const getInitials = (name: string) => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
};

// Helper to assign a persistent beautiful gradient based on customer name
const getAvatarBg = (name: string) => {
  const gradients = [
    "bg-gradient-to-br from-indigo-500 to-purple-600 border-indigo-200 text-white shadow-indigo-100",
    "bg-gradient-to-br from-blue-500 to-indigo-600 border-blue-200 text-white shadow-blue-100",
    "bg-gradient-to-br from-violet-500 to-fuchsia-600 border-violet-200 text-white shadow-violet-100",
    "bg-gradient-to-br from-indigo-600 to-blue-700 border-indigo-300 text-white shadow-indigo-100",
  ];
  let sum = 0;
  for (let i = 0; i < name.length; i++) {
    sum += name.charCodeAt(i);
  }
  return gradients[sum % gradients.length];
};

const getAvatarStylesForProfile = (customer: Customer, isStandardPlan?: boolean) => {
  if (!isStandardPlan) {
    if (customer.isVIP) {
      return "bg-gradient-to-tr from-rose-300 via-amber-200 via-teal-200 to-purple-300 border-pink-200 text-indigo-950 shadow-md shadow-purple-200/30";
    }
    if (customer.isMember) {
      return "bg-gradient-to-r from-slate-300 via-slate-100 to-slate-400 border-slate-300 text-slate-800 shadow-sm";
    }
  }
  if (customer.isCorporate) {
    return "bg-gradient-to-br from-slate-600 to-slate-700 border-slate-400 text-white shadow-slate-200/30 shadow-sm";
  }
  return getAvatarBg(customer.name);
};

export function AdminCustomerProfileModal({ 
  open, 
  onOpenChange, 
  customer 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  customer: Customer | null;
}) {
  const jobs = useJobs();
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const activeShop = shops[0];
  const isStandardPlan = activeShop?.plan === 'standard';

  // History Tab: "orders" | "topup"
  const [historyTab, setHistoryTab] = useState<"orders" | "topup">("orders");
  const [topUpTxs, setTopUpTxs] = useState<any[]>([]);
  const [isLoadingTopUps, setIsLoadingTopUps] = useState(false);

  // Receipt Preview
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptData | null>(null);
  const [previewReceiptOpen, setPreviewReceiptOpen] = useState(false);

  // Slip Image Preview
  const [previewSlipModalOpen, setPreviewSlipModalOpen] = useState(false);
  const [previewSlipUrl, setPreviewSlipUrl] = useState<string | null>(null);
  const [previewSlipTitle, setPreviewSlipTitle] = useState("");


  useEffect(() => {
    if (open && customer?.id) {
      setIsLoadingTopUps(true);
      getTopUpTransactionsAction(customer.id)
        .then(txs => setTopUpTxs(txs || []))
        .catch(err => console.error("Failed to load customer top-up transactions:", err))
        .finally(() => setIsLoadingTopUps(false));
    }
  }, [open, customer?.id]);

  const { jobsCount, ltv, customerJobs } = useMemo(() => {
    if (!customer) return { jobsCount: 0, ltv: 0, customerJobs: [] };
    const custJobs = jobs.filter(j => j.customerPhone === customer.phone || j.customerId === customer.id);
    const countedJobs = custJobs.filter(j => isStandardPlan ? j.isPaid : j.status === "completed");
    return {
      customerJobs: custJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      jobsCount: countedJobs.length,
      ltv: countedJobs.reduce((sum, j) => sum + (j.totalAmount || j.fee || 0), 0)
    };
  }, [jobs, customer, isStandardPlan]);

  const progression = useMemo(() => {
    let nextTierName = "";
    let targetLtv = 0;
    let percent = 0;
    let currentTierName = "Standard";
    let tierColor = "bg-slate-400";

    if (ltv < 1000) {
      currentTierName = "Standard";
      nextTierName = "Member";
      targetLtv = 1000;
      percent = Math.min(100, Math.max(0, (ltv / 1000) * 100));
      tierColor = "bg-slate-400";
    } else if (ltv < 5000) {
      currentTierName = "Member";
      nextTierName = "VIP Gold";
      targetLtv = 5000;
      percent = Math.min(100, Math.max(0, ((ltv - 1000) / 4000) * 100));
      tierColor = "bg-gradient-to-r from-slate-300 via-slate-100 to-slate-400";
    } else {
      currentTierName = "VIP Gold";
      nextTierName = "Max Tier";
      targetLtv = 5000;
      percent = 100;
      tierColor = "bg-gradient-to-r from-pink-300 via-purple-300 via-amber-200 to-pink-300";
    }

    return {
      currentTierName,
      nextTierName,
      targetLtv,
      percent,
      tierColor
    };
  }, [ltv]);

  const memberProgress = useMemo(() => {
    if (!customer || !customer.isMember || !customer.memberStartDate || !customer.memberExpiryDate) {
      return null;
    }
    const start = new Date(customer.memberStartDate);
    const expiry = new Date(customer.memberExpiryDate);
    const today = new Date();
    
    const totalDays = Math.max(1, Math.ceil((expiry.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const daysRemaining = Math.max(0, Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    
    const daysElapsed = totalDays - daysRemaining;
    const percent = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));
    const isExpired = expiry.getTime() < today.getTime();
    
    return {
      start,
      expiry,
      totalDays,
      daysRemaining,
      percent,
      isExpired
    };
  }, [customer]);

  if (!customer) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl p-0 bg-white overflow-hidden rounded-2xl z-[999] border-none shadow-2xl">

        
        {/* Header Section with dynamic avatar and info */}
        <DialogHeader className="p-6 pb-5 bg-slate-50 border-b border-slate-200/60">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              {/* Dynamic Gradient Avatar */}
              <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center font-bold text-lg shrink-0 shadow-md ${getAvatarStylesForProfile(customer, isStandardPlan)}`}>
                {getInitials(customer.name)}
              </div>
              
              <div className="space-y-1">
                <DialogTitle className="flex flex-wrap items-center gap-1.5 text-xl font-black text-slate-900 tracking-tight">
                  {customer.name}
                  {!isStandardPlan && customer.isVIP && (
                    <Badge className="bg-gradient-to-r from-pink-100 via-purple-100 to-amber-100 text-indigo-950 border border-pink-200 shadow-sm py-0 px-1.5 h-4.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 rounded-md">
                      <Star size={8} className="text-indigo-950 fill-indigo-950" /> VIP
                    </Badge>
                  )}
                  {customer.isCorporate && (
                    <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200/30 shadow-sm py-0 px-1.5 h-4.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 rounded-md">
                      <Building size={8} className="text-indigo-500" /> B2B
                    </Badge>
                  )}
                  {!isStandardPlan && customer.isMember && !customer.isVIP && (
                    <Badge className="bg-gradient-to-r from-slate-200 via-slate-100 to-slate-300 text-slate-700 border border-slate-300 shadow-sm py-0 px-1.5 h-4.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 rounded-md">
                      <Crown size={8} className="text-slate-700" /> MEMBER
                    </Badge>
                  )}
                  {!isStandardPlan && customer.isMember && customer.memberId && (
                    <Badge className="bg-slate-100 text-slate-700 border border-slate-200 shadow-sm py-0 px-1.5 h-4.5 text-[9px] font-bold rounded-md">
                      ID: {customer.memberId}
                    </Badge>
                  )}
                </DialogTitle>
                
                <DialogDescription className="flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-1 mt-1.5 text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-1"><Phone size={12} className="text-slate-400" /> {customer.phone}</span>
                  {customer.email && (
                    <span className="flex items-center gap-1 truncate max-w-[200px]"><Mail size={12} className="text-slate-400" /> {customer.email}</span>
                  )}
                </DialogDescription>
              </div>
            </div>
            
            {/* Wallet Credit Balance */}
            {!isStandardPlan && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-right shrink-0 min-w-[140px]">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-end gap-1 mb-0.5">
                  <Wallet size={10} className="text-emerald-500" /> Credit Wallet
                </div>
                <div className="text-xl font-black text-emerald-600">
                  ฿{(customer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Main Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          
          {/* LTV & Orders Metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-slate-50 to-indigo-50/10 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <CreditCard size={12} className="text-indigo-500" /> Accumulated Spend (LTV)
              </span>
              <span className="text-2xl font-black text-indigo-950">
                ฿{ltv.toLocaleString()}
              </span>
            </div>
            
            <div className="bg-gradient-to-br from-slate-50 to-indigo-50/10 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Clock size={12} className="text-indigo-500" /> Completed Orders
              </span>
              <span className="text-2xl font-black text-indigo-950">
                {jobsCount} <span className="text-xs font-semibold text-slate-500">times</span>
              </span>
            </div>
          </div>

          {/* Member Validity Details */}
          {customer.isMember && memberProgress && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5 shadow-sm">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Crown size={12} className="text-indigo-500" /> Member Validity
                </span>
                <span className={memberProgress.isExpired ? "text-rose-600 font-extrabold" : "text-emerald-650 font-extrabold"}>
                  {memberProgress.isExpired ? "Expired" : `${memberProgress.daysRemaining} Days Remaining`}
                </span>
              </div>
              
              <div className="w-full bg-slate-100 border border-slate-200 h-3 rounded-full overflow-hidden relative">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${100 - memberProgress.percent}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full ${memberProgress.isExpired ? "bg-rose-500" : "bg-gradient-to-r from-emerald-400 to-indigo-500"}`}
                />
              </div>
              
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Start: <strong className="text-slate-900">{format(memberProgress.start, "dd MMM yyyy")}</strong></span>
                <span>Expiry: <strong className={memberProgress.isExpired ? "text-rose-600" : "text-slate-900"}>{format(memberProgress.expiry, "dd MMM yyyy")}</strong></span>
              </div>
            </div>
          )}

          {/* LTV Progression Progress Bar */}
          {!isStandardPlan && (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-slate-400 uppercase tracking-wider">Milestone Progression</span>
                <span className="text-indigo-600 font-bold">฿{ltv.toLocaleString()} / ฿{progression.targetLtv.toLocaleString()}</span>
              </div>
              <div className="w-full bg-slate-100 border border-slate-200 h-3 rounded-full overflow-hidden relative">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progression.percent}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full ${progression.tierColor}`}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Current: <strong className="text-slate-900">{progression.currentTierName}</strong></span>
                {progression.percent < 100 ? (
                  <span>Next: <strong className="text-indigo-600">{progression.nextTierName}</strong> (Need ฿{(progression.targetLtv - ltv).toLocaleString()} more)</span>
                ) : (
                  <span className="text-amber-500 font-extrabold flex items-center gap-0.5"><Crown size={10} /> Ultimate VIP Status reached</span>
                )}
              </div>
            </div>
          )}

          {/* Special Instructions/Remarks (Crucial Banner) */}
          {customer.remark && (
            <div className="bg-rose-50 border border-rose-200/60 p-4 rounded-xl flex gap-3 text-rose-800 shadow-sm animate-pulse">
              <AlertTriangle size={20} className="text-rose-500 shrink-0" />
              <div className="space-y-0.5">
                <h4 className="text-xs font-black uppercase tracking-wider">Special Laundry Instructions (Remarks)</h4>
                <p className="text-sm font-extrabold leading-relaxed">{customer.remark}</p>
              </div>
            </div>
          )}

          {/* Additional Structured Details */}
          <div className="space-y-2.5">
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
               <FileText size={14} className="text-indigo-500" />
               Additional Customer Info
             </h3>
             <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 text-xs space-y-3 font-semibold text-slate-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {customer.lineId && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 w-24 shrink-0">LINE ID:</span>
                      <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">{customer.lineId}</span>
                    </div>
                  )}
                  {customer.dob && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 w-24 shrink-0">Date of Birth:</span>
                      <span className="text-slate-900">{customer.dob}</span>
                    </div>
                  )}
                  {customer.language && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 w-24 shrink-0">Supported Language:</span>
                      <span className="text-slate-900 uppercase">{customer.language === "th" ? "Thai (TH)" : "English (EN)"}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-slate-400 w-24 shrink-0 mt-0.5">Primary Address:</span>
                    <span className="text-slate-900 leading-relaxed font-bold flex items-start gap-1">
                      <MapPin size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                      {customer.defaultAddress}
                    </span>
                  </div>
                  {customer.secondaryAddress && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 w-24 shrink-0">Building/Room:</span>
                      <span className="text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md font-extrabold flex items-center gap-1">
                        <Building size={12} />
                        {customer.secondaryAddress}
                      </span>
                    </div>
                  )}
                </div>

                {(customer.companyName || customer.taxId) && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                     {customer.companyName && (
                       <div className="flex items-center gap-2">
                         <span className="text-slate-400 w-24 shrink-0">B2B Company Name:</span>
                         <span className="text-slate-900 font-extrabold">{customer.companyName}</span>
                       </div>
                     )}
                     {customer.taxId && (
                       <div className="flex items-center gap-2">
                         <span className="text-slate-400 w-24 shrink-0">Tax ID:</span>
                         <span className="text-slate-900">{customer.taxId}</span>
                       </div>
                     )}
                  </div>
                )}
             </div>
          </div>

          {/* History Section: Segmented Control for Orders vs Top-ups */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setHistoryTab("orders")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    historyTab === "orders" 
                      ? "bg-white text-indigo-700 shadow-sm" 
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Calendar size={13} />
                  <span>Order History</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded-full font-bold">
                    {customerJobs.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setHistoryTab("topup")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    historyTab === "topup" 
                      ? "bg-white text-emerald-700 shadow-sm" 
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Coins size={13} className="text-emerald-600" />
                  <span>Top-up & Wallet</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-50 text-emerald-700 rounded-full font-bold">
                    {topUpTxs.length}
                  </span>
                </button>
              </div>

              {historyTab === "topup" && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                  Current Balance: ฿{(customer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              )}
            </div>

            {/* TAB 1: ORDER HISTORY */}
            {historyTab === "orders" && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="max-h-[220px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="w-[110px] text-xs font-bold py-3 text-slate-600 pl-4">Transaction Date</TableHead>
                        <TableHead className="text-xs font-bold py-3 text-slate-600">Service Type & Package</TableHead>
                        <TableHead className="text-xs font-bold py-3 text-slate-600">Payment</TableHead>
                        <TableHead className="text-right text-xs font-bold py-3 text-slate-600 pr-4">Net Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerJobs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center h-24 text-slate-400 text-xs font-semibold">
                            No order history found in system
                          </TableCell>
                        </TableRow>
                      ) : (
                        customerJobs.map(job => (
                          <TableRow key={job.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                            <TableCell className="text-[11px] font-bold text-slate-500 whitespace-nowrap pl-4 py-3">
                              {format(new Date(job.createdAt), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-bold text-slate-900 capitalize">
                                  {job.serviceType?.replace(/_/g, ' ') || 'General Service'}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {job.type === "full_service" ? "Full Service" : job.type === "pickup" ? "Pickup Only" : "Delivery Only"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              {job.paymentMethod ? (
                                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-600 uppercase bg-slate-100 px-2 py-0.5 rounded-full w-fit">
                                  <CreditCard size={10} className="text-slate-400" />
                                  {job.paymentMethod === "credit" ? "Credit Wallet" : job.paymentMethod}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">N/A</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-black text-slate-900 pr-4 py-3 text-xs">
                              ฿{(job.totalAmount || job.fee || 0).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* TAB 2: TOP-UP & WALLET HISTORY */}
            {historyTab === "topup" && (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="max-h-[220px] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-emerald-50/70 sticky top-0 z-10 shadow-sm">
                      <TableRow>
                        <TableHead className="w-[120px] text-xs font-bold py-3 text-emerald-950 pl-4">Date & Time</TableHead>
                        <TableHead className="text-xs font-bold py-3 text-emerald-950">Receipt No</TableHead>
                        <TableHead className="text-xs font-bold py-3 text-emerald-950">Package Description</TableHead>
                        <TableHead className="text-right text-xs font-bold py-3 text-emerald-950">Paid (฿)</TableHead>
                        <TableHead className="text-right text-xs font-bold py-3 text-emerald-950">Credit (฿)</TableHead>
                        <TableHead className="text-right text-xs font-bold py-3 text-emerald-950 pr-4">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoadingTopUps ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center h-24 text-slate-400 text-xs font-semibold">
                            Loading top-up history...
                          </TableCell>
                        </TableRow>
                      ) : topUpTxs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center h-24 text-slate-400 text-xs font-semibold">
                            No top-up transactions found for this customer
                          </TableCell>
                        </TableRow>
                      ) : (
                        topUpTxs.map(tx => {
                          let meta: any = {};
                          try {
                            meta = JSON.parse(tx.description || "{}");
                          } catch {}
                          const slipUrl = meta.slipImageUrl || meta.receiptData?.slipImageUrl || null;

                          return (
                            <TableRow key={tx.id} className="hover:bg-emerald-50/30 transition-colors border-b border-slate-100">
                              <TableCell className="text-[11px] font-bold text-slate-500 whitespace-nowrap pl-4 py-3">
                                {format(new Date(tx.createdAt), 'dd/MM/yyyy HH:mm')}
                              </TableCell>
                              <TableCell className="py-3">
                                <Badge variant="outline" className="font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px]">
                                  {tx.id}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-3">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-bold text-slate-900">
                                    {meta.packageName || "Member Top-Up"}
                                  </span>
                                  {meta.paymentChannel && (
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      Via {meta.paymentChannel}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-bold text-slate-700 py-3 text-xs">
                                ฿{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right font-black text-emerald-600 py-3 text-xs">
                                ฿{(meta.totalCredit || tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right pr-4 py-3">
                                <div className="flex items-center justify-end gap-1.5">
                                  {slipUrl && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 text-[11px] font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1 rounded-lg"
                                      onClick={() => {
                                        setPreviewSlipUrl(slipUrl);
                                        setPreviewSlipTitle(`${customer?.name || "Customer"} — Receipt ${tx.id}`);
                                        setPreviewSlipModalOpen(true);
                                      }}
                                      title="ดูรูปสลิปหลักฐานการโอน"
                                    >
                                      <ImageIcon size={12} />
                                      Slip
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[11px] font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1 rounded-lg"
                                    onClick={() => {
                                      if (meta.receiptData) {
                                        setPreviewReceipt(meta.receiptData);
                                      } else {
                                        // Fallback construct receipt data
                                        setPreviewReceipt({
                                          id: tx.id,
                                          receiptNumber: tx.id,
                                          isDraft: false,
                                          status: "completed",
                                          createdAt: new Date(tx.createdAt),
                                          customerName: customer?.name || "Customer",
                                          customerPhone: customer?.phone || "-",
                                          items: [{ name: meta.packageName || "Member Top-Up", quantity: 1, price: tx.amount }],
                                          subtotal: tx.amount,
                                          total: tx.amount,
                                          discount: 0,
                                          deliveryFee: 0,
                                          expressSurcharge: 0,
                                          vatAmount: 0,
                                          vatType: "none",
                                          vatRate: 0,
                                          paymentChannel: meta.paymentChannel || "Transfer",
                                          isPaid: true,
                                          proformaId: undefined,
                                          adminNotesJson: null,
                                          deliveryScheduledAt: null,
                                          serviceSpeed: "standard",
                                        });
                                      }
                                      setPreviewReceiptOpen(true);
                                    }}
                                  >
                                    <Receipt size={12} />
                                    Receipt
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>


      {/* A5 Receipt Reprint Dialog */}
      {previewReceiptOpen && previewReceipt && (
        <A5ReceiptDialog
          open={previewReceiptOpen}
          onOpenChange={setPreviewReceiptOpen}
          receiptData={previewReceipt}
          activeShop={activeShop as any}
          currentLanguage="en"
        />
      )}

      {/* Payment Slip Lightbox Dialog */}
      <Dialog open={previewSlipModalOpen} onOpenChange={setPreviewSlipModalOpen}>
        <DialogContent className="max-w-lg p-0 bg-white overflow-hidden rounded-2xl border-none shadow-2xl z-[80]">
          <DialogHeader className="p-4 bg-slate-900 text-white flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon size={18} className="text-emerald-400" />
              <DialogTitle className="text-sm font-bold text-white">
                หลักฐานการชำระเงิน — {previewSlipTitle}
              </DialogTitle>
            </div>
            {previewSlipUrl && (
              <a
                href={previewSlipUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-300 hover:text-white flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors mr-6"
              >
                <ExternalLink size={12} />
                <span>เปิดรูปเต็ม</span>
              </a>
            )}
          </DialogHeader>
          <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
            {previewSlipUrl ? (
              <img
                src={previewSlipUrl}
                alt="Payment Slip"
                className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-lg border border-slate-800"
              />
            ) : (
              <div className="py-12 text-slate-500 text-xs">ไม่มีรูปภาพสลิป</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

