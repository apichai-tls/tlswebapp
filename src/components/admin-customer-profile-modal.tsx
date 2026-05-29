import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Phone, MapPin, Star, FileText, Calendar, CreditCard, Wallet, Crown, Building, Mail, MessageCircle, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { type Customer } from "@/lib/store";
import { useJobs } from "@/lib/use-jobs";
import { useMemo } from "react";

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

  const { jobsCount, ltv, customerJobs } = useMemo(() => {
    if (!customer) return { jobsCount: 0, ltv: 0, customerJobs: [] };
    const custJobs = jobs.filter(j => j.customerPhone === customer.phone || j.customerId === customer.id);
    const completedJobs = custJobs.filter(j => j.status === "completed");
    return {
      customerJobs: custJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      jobsCount: completedJobs.length,
      ltv: completedJobs.reduce((sum, j) => sum + (j.totalAmount || j.fee || 0), 0)
    };
  }, [jobs, customer]);

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 bg-white overflow-hidden rounded-2xl z-[999] border-none shadow-2xl">
        
        {/* Header Section with dynamic avatar and info */}
        <DialogHeader className="p-6 pb-5 bg-slate-50 border-b border-slate-200/60">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              {/* Dynamic Gradient Avatar */}
              <div className={`w-14 h-14 rounded-2xl border flex items-center justify-center font-bold text-lg shrink-0 shadow-md ${getAvatarBg(customer.name)}`}>
                {getInitials(customer.name)}
              </div>
              
              <div className="space-y-1">
                <DialogTitle className="flex flex-wrap items-center gap-1.5 text-xl font-black text-slate-900 tracking-tight">
                  {customer.name}
                  {customer.isVIP && (
                    <Badge className="bg-amber-50 text-amber-700 border border-amber-250/50 shadow-sm py-0 px-1.5 h-4.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 rounded-md">
                      <Star size={8} className="text-amber-500 fill-amber-500" /> VIP
                    </Badge>
                  )}
                  {customer.isCorporate && (
                    <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200/30 shadow-sm py-0 px-1.5 h-4.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 rounded-md">
                      <Building size={8} className="text-indigo-500" /> B2B
                    </Badge>
                  )}
                  {customer.isMember && customer.memberId && (
                    <Badge className="bg-slate-100 text-slate-700 border border-slate-200 shadow-sm py-0 px-1.5 h-4.5 text-[9px] font-bold rounded-md">
                      MEMBER ID: {customer.memberId}
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
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-right shrink-0 min-w-[140px]">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-end gap-1 mb-0.5">
                <Wallet size={10} className="text-emerald-500" /> Credit Wallet
              </div>
              <div className="text-xl font-black text-emerald-600">
                ฿{(customer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
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

          {/* Order History */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Calendar size={14} className="text-indigo-500" />
              Recent Order History
            </h3>
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
