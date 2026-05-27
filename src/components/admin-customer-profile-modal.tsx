import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Phone, MapPin, Star, FileText, Calendar, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { type Customer } from "@/lib/store";
import { useJobs } from "@/lib/use-jobs";
import { useMemo } from "react";

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
      <DialogContent className="sm:max-w-2xl p-0 bg-white overflow-hidden rounded-2xl z-[999]">
        <DialogHeader className="p-6 pb-4 bg-slate-50 border-b border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <DialogTitle className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                {customer.name}
                {(ltv >= 2000 || jobsCount >= 5) && (
                  <Badge className="bg-amber-100 text-amber-800 border-none shadow-sm py-0 px-1.5 h-5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Star size={10} className="text-amber-600 fill-amber-600" /> VIP
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                <span className="flex items-center gap-1"><Phone size={14} /> {customer.phone}</span>
                <span className="flex items-center gap-1 truncate max-w-[250px]"><MapPin size={14} /> {customer.defaultAddress}</span>
              </DialogDescription>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Credit Balance</div>
              <div className="text-2xl font-black text-emerald-600">
                ฿{(customer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Spent (LTV)</div>
              <div className="text-2xl font-bold text-slate-900">
                ฿{ltv.toLocaleString()}
              </div>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Orders</div>
              <div className="text-2xl font-bold text-slate-900">
                {jobsCount}
              </div>
            </div>
          </div>

          {(customer.email || customer.lineId || customer.remark || customer.secondaryAddress || customer.companyName || customer.taxId || customer.dob) && (
            <div>
               <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                 <FileText size={16} className="text-indigo-500" />
                 Additional Details
               </h3>
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm space-y-2">
                  {customer.email && <div><span className="text-slate-500 w-24 inline-block">Email:</span> <span className="font-medium text-slate-900">{customer.email}</span></div>}
                  {customer.lineId && <div><span className="text-slate-500 w-24 inline-block">LINE ID:</span> <span className="font-medium text-slate-900">{customer.lineId}</span></div>}
                  {customer.dob && <div><span className="text-slate-500 w-24 inline-block">Birthday:</span> <span className="font-medium text-slate-900">{customer.dob}</span></div>}
                  {customer.secondaryAddress && <div><span className="text-slate-500 w-24 inline-block align-top">2nd Address:</span> <span className="font-medium text-slate-900 inline-block w-[calc(100%-6rem)]">{customer.secondaryAddress}</span></div>}
                  {customer.remark && <div><span className="text-slate-500 w-24 inline-block align-top">Remarks:</span> <span className="font-medium text-rose-600 inline-block w-[calc(100%-6rem)]">{customer.remark}</span></div>}
                  {(customer.companyName || customer.taxId) && (
                    <div className="pt-2 mt-2 border-t border-slate-200">
                       {customer.companyName && <div><span className="text-slate-500 w-24 inline-block">Company:</span> <span className="font-medium text-slate-900">{customer.companyName}</span></div>}
                       {customer.taxId && <div><span className="text-slate-500 w-24 inline-block">Tax ID:</span> <span className="font-medium text-slate-900">{customer.taxId}</span></div>}
                    </div>
                  )}
               </div>
            </div>
          )}

          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Calendar size={18} className="text-indigo-500" />
              Order History
            </h3>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead>Pickup / Delivery</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerJobs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center h-24 text-slate-400">No orders found for this customer.</TableCell>
                      </TableRow>
                    ) : (
                      customerJobs.map(job => (
                        <TableRow key={job.id}>
                          <TableCell className="text-xs font-medium text-slate-500 whitespace-nowrap">
                            {format(new Date(job.createdAt), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-col gap-1 max-w-[200px]">
                              <span className="truncate" title={job.pickupLocation}><span className="text-emerald-500 font-semibold">รับ:</span> {job.pickupLocation}</span>
                              <span className="truncate" title={job.dropoffLocation}><span className="text-indigo-500 font-semibold">ส่ง:</span> {job.dropoffLocation}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-slate-50 text-[10px] capitalize">
                              {job.serviceType?.replace(/_/g, ' ') || 'Standard'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {job.paymentMethod ? (
                              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 uppercase">
                                <CreditCard size={12} className="text-slate-400" />
                                {job.paymentMethod}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-bold text-slate-900">
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
