import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, UserPlus, Users, Edit, Trash2, MapPin, Phone, Star, ShieldCheck, Crown, Medal, Wallet, Eye, Calendar, Tag, CreditCard, Clock, ChevronDown, ChevronUp, Mail, MessageCircle, Globe, Building, FileText, Gift, Database } from "lucide-react";
import { format } from "date-fns";
import { useCustomers } from "@/lib/use-customers";
import { useJobs } from "@/lib/use-jobs";
import { customerStore, priceListStore, poiStore, type Customer } from "@/lib/store";
import { useSyncExternalStore } from "react";
import { LocationInput } from "@/components/location-input";
import { toast } from "sonner";
import { AdminCustomerDialog } from "@/components/admin-customer-dialog";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};

export function AdminCRM() {
  const customers = useCustomers();
  const jobs = useJobs();
  const priceLists = useSyncExternalStore(priceListStore.subscribe, priceListStore.getSnapshot, priceListStore.getSnapshot);
  const pois = useSyncExternalStore(poiStore.subscribe, poiStore.getSnapshot, poiStore.getSnapshot);

  const localDataForSearch = useMemo(() => {
    return pois.map(p => ({
      name: p.name,
      address: p.address,
      lat: p.coords.lat,
      lng: p.coords.lng,
      placeId: p.placeId || p.id,
      isLocal: true
    }));
  }, [pois]);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Profile Dialog State
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedProfileCustomer, setSelectedProfileCustomer] = useState<Customer | null>(null);

  // Top Up State
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [topUpCustomer, setTopUpCustomer] = useState<Customer | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");

  const handleTopUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topUpCustomer) return;
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount === 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    const currentBalance = topUpCustomer.creditBalance || 0;
    const newBalance = currentBalance + amount;
    
    customerStore.updateCustomer(topUpCustomer.id, { creditBalance: newBalance });
    toast.success(`Successfully ${amount > 0 ? 'added' : 'deducted'} ฿${Math.abs(amount)}. New balance: ฿${newBalance}`);
    setTopUpOpen(false);
    setTopUpAmount("");
  };

  const openForm = (customer?: Customer) => {
    setEditingCustomer(customer || null);
    setDialogOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete ${name}?`)) {
      customerStore.deleteCustomer(id);
      toast.info(`Deleted customer ${name}`);
    }
  };

  const customerAnalytics = useMemo(() => {
    const analytics: Record<string, { jobsCount: number; ltv: number }> = {};
    customers.forEach(c => {
      analytics[c.id] = { jobsCount: 0, ltv: 0 };
    });
    
    jobs.forEach(job => {
      const matchedCustomer = customers.find(c => 
        (job.customerPhone && c.phone === job.customerPhone) || 
        (job.customerName && c.name === job.customerName)
      );
      
      if (matchedCustomer && job.status === "completed") {
        analytics[matchedCustomer.id].jobsCount += 1;
        analytics[matchedCustomer.id].ltv += (job.totalAmount || job.fee || 0);
      }
    });
    
    return analytics;
  }, [jobs, customers]);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.phone.includes(searchTerm)
  );

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6 bg-slate-50">
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 leading-tight">Customer Database</h1>
          <p className="text-sm text-slate-500 font-medium tracking-tight">Manage {customers.length} registered customers and view their history.</p>
        </div>
        <Button 
          onClick={() => openForm()} 
          className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-all"
        >
          <UserPlus size={16} />
          Add Customer
        </Button>
      </div>

      <motion.div 
        variants={containerVariants} 
        initial="hidden" 
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm relative overflow-hidden group">
           <div className="absolute -right-4 -top-4 text-slate-100 group-hover:text-indigo-50 transition-colors">
            <Users size={120} />
          </div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1 relative z-10">Total Network</p>
          <h3 className="text-3xl font-bold text-slate-900 relative z-10">{customers.length}</h3>
        </motion.div>
        
        <motion.div variants={itemVariants} className="bg-gradient-to-br from-indigo-900 to-indigo-800 rounded-xl border border-indigo-700 p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 text-indigo-800 group-hover:text-indigo-700/50 transition-colors">
            <Crown size={120} />
          </div>
          <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1 relative z-10">Custom Rates</p>
          <h3 className="text-3xl font-bold text-white relative z-10">{customers.filter(c => c.priceListId && c.priceListId !== "regular").length}</h3>
        </motion.div>

        <motion.div variants={itemVariants} className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-center">
           <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
             <Input 
               placeholder="Search by name or phone..." 
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
               className="pl-9 h-11 bg-slate-50 border-slate-200 focus-visible:ring-indigo-500"
             />
           </div>
        </motion.div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b-slate-200">
              <TableHead className="font-semibold text-slate-600 pl-6 w-[280px]">Customer Data</TableHead>
              <TableHead className="font-semibold text-slate-600">Primary Location</TableHead>
              <TableHead className="font-semibold text-slate-600 text-center w-[150px]">LTV & History</TableHead>
              <TableHead className="font-semibold text-slate-600 text-right pr-6 w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <AnimatePresence mode="popLayout">
              {filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-slate-400">
                    No customers found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((customer, index) => {
                  const stats = customerAnalytics[customer.id];
                  return (
                    <motion.tr
                      key={customer.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: index * 0.03 }}
                      className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                    >
                      <TableCell className="pl-6 py-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-900">{customer.name}</span>
                            {customer.isVIP ? (
                              <Badge className="bg-amber-100 text-amber-800 border-none shadow-sm py-0 px-1.5 h-5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <Star size={10} className="text-amber-600 fill-amber-600" />
                                VIP
                              </Badge>
                            ) : stats.jobsCount === 0 ? (
                              <Badge className="bg-blue-100 text-blue-800 border-none shadow-sm py-0 px-1.5 h-5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <ShieldCheck size={10} className="text-blue-600" />
                                New
                              </Badge>
                            ) : null}
                            {customer.isCorporate && (
                              <Badge className="bg-slate-100 text-slate-800 border-none shadow-sm py-0 px-1.5 h-5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <Building size={10} className="text-slate-600" /> 
                                CORP
                              </Badge>
                            )}
                            {customer.priceListId && customer.priceListId !== "regular" && (
                              <Badge className="bg-indigo-100 text-indigo-800 border-none shadow-sm py-0 px-1.5 h-5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <Crown size={10} className="text-indigo-600" /> 
                                {priceLists.find(p => p.id === customer.priceListId)?.name || "Custom Price"}
                              </Badge>
                            )}
                            {(customer.creditBalance || 0) > 0 && (
                              <Badge className="bg-emerald-100 text-emerald-800 border-none shadow-sm py-0 px-1.5 h-5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <Wallet size={10} className="text-emerald-600" /> 
                                ฿{customer.creditBalance?.toLocaleString()}
                              </Badge>
                            )}
                            {customer.memberId && (
                              <Badge className="bg-blue-100 text-blue-800 border-none shadow-sm py-0 px-1.5 h-5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                ID: {customer.memberId}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                            <Phone size={12} className="text-slate-400" />
                            {customer.phone}
                          </div>
                        </div>
                      </TableCell>
                      
                      <TableCell className="py-4">
                        <div className="flex items-start gap-1.5 max-w-sm">
                          <MapPin size={14} className="text-emerald-500 mt-0.5 shrink-0" />
                          <span className="text-sm text-slate-600 leading-snug">{customer.defaultAddress}</span>
                        </div>
                      </TableCell>

                      <TableCell className="py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-sm font-bold text-slate-900">฿{stats.ltv.toLocaleString()}</span>
                          <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{stats.jobsCount} Orders</span>
                        </div>
                      </TableCell>

                      <TableCell className="py-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 hover:border-emerald-200 transition-colors gap-1.5 text-xs font-semibold px-2"
                            onClick={() => {
                              setTopUpCustomer(customer);
                              setTopUpAmount("");
                              setTopUpOpen(true);
                            }}
                          >
                            <Wallet size={14} className="text-emerald-500" />
                            Top Up
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            onClick={() => {
                              setSelectedProfileCustomer(customer);
                              setProfileOpen(true);
                            }}
                          >
                            <Eye size={16} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            onClick={() => openForm(customer)}
                          >
                            <Edit size={16} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            onClick={() => handleDelete(customer.id, customer.name)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </TableBody>
        </Table>
      </motion.div>

      <AdminCustomerDialog 
        open={dialogOpen} 
        onOpenChange={setDialogOpen} 
        customer={editingCustomer} 
      />

      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="sm:max-w-md p-0 bg-white overflow-hidden rounded-2xl border-none shadow-2xl">
          <form onSubmit={handleTopUpSubmit}>
            <DialogHeader className="p-6 pb-4 bg-emerald-50 border-b border-emerald-100">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-emerald-900">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                  <Wallet size={24} />
                </div>
                Credit Wallet Top-Up
              </DialogTitle>
              <DialogDescription className="text-emerald-700/80 mt-1">
                Add or deduct credit balance for {topUpCustomer?.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">Current Balance</span>
                <span className="text-2xl font-black text-slate-900">
                  ฿{(topUpCustomer?.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-black text-slate-400 uppercase tracking-widest">Top-Up Amount (฿)</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">฿</span>
                  <Input 
                    type="number" 
                    step="0.01"
                    required
                    autoFocus
                    placeholder="e.g. 1000" 
                    value={topUpAmount} 
                    onChange={e => setTopUpAmount(e.target.value)} 
                    className="h-14 pl-10 border-slate-200 text-xl font-bold rounded-xl focus-visible:ring-emerald-500 bg-white" 
                  />
                </div>
                <p className="text-[11px] text-slate-500">Use a negative number (e.g. -500) to deduct from the balance.</p>
              </div>
            </div>

            <DialogFooter className="p-6 pt-4 bg-white border-t border-slate-100">
              <Button type="button" variant="ghost" onClick={() => setTopUpOpen(false)} className="h-12 rounded-xl font-semibold px-6">Cancel</Button>
              <Button type="submit" className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-8 shadow-lg shadow-emerald-200">
                Confirm Transaction
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-2xl p-0 bg-white overflow-hidden rounded-2xl">
          {selectedProfileCustomer && (
            <>
              <DialogHeader className="p-6 pb-4 bg-slate-50 border-b border-slate-100">
                <div className="flex justify-between items-start">
                  <div>
                    <DialogTitle className="flex items-center gap-2 text-2xl font-bold text-slate-900">
                      {selectedProfileCustomer.name}
                      {((customerAnalytics[selectedProfileCustomer.id]?.ltv || 0) >= 2000 || (customerAnalytics[selectedProfileCustomer.id]?.jobsCount || 0) >= 5) && (
                        <Badge className="bg-amber-100 text-amber-800 border-none shadow-sm py-0 px-1.5 h-5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                          <Star size={10} className="text-amber-600 fill-amber-600" /> VIP
                        </Badge>
                      )}
                    </DialogTitle>
                    <DialogDescription className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                      <span className="flex items-center gap-1"><Phone size={14} /> {selectedProfileCustomer.phone}</span>
                      <span className="flex items-center gap-1 truncate max-w-[250px]"><MapPin size={14} /> {selectedProfileCustomer.defaultAddress}</span>
                    </DialogDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Credit Balance</div>
                    <div className="text-2xl font-black text-emerald-600">
                      ฿{(selectedProfileCustomer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Spent (LTV)</div>
                    <div className="text-2xl font-bold text-slate-900">
                      ฿{(customerAnalytics[selectedProfileCustomer.id]?.ltv || 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Orders</div>
                    <div className="text-2xl font-bold text-slate-900">
                      {customerAnalytics[selectedProfileCustomer.id]?.jobsCount || 0}
                    </div>
                  </div>
                </div>

                {(selectedProfileCustomer.email || selectedProfileCustomer.lineId || selectedProfileCustomer.remark || selectedProfileCustomer.secondaryAddress || selectedProfileCustomer.companyName || selectedProfileCustomer.taxId || selectedProfileCustomer.dob || (selectedProfileCustomer.language && selectedProfileCustomer.language !== 'th')) && (
                  <div>
                     <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                       <FileText size={16} className="text-indigo-500" />
                       Additional Details
                     </h3>
                     <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm space-y-2">
                        {selectedProfileCustomer.email && <div><span className="text-slate-500 w-24 inline-block">Email:</span> <span className="font-medium text-slate-900">{selectedProfileCustomer.email}</span></div>}
                        {selectedProfileCustomer.lineId && <div><span className="text-slate-500 w-24 inline-block">LINE ID:</span> <span className="font-medium text-slate-900">{selectedProfileCustomer.lineId}</span></div>}
                        {selectedProfileCustomer.language && selectedProfileCustomer.language !== 'th' && <div><span className="text-slate-500 w-24 inline-block">Language:</span> <span className="font-medium text-slate-900">{selectedProfileCustomer.language === 'en' ? '🇬🇧 English' : selectedProfileCustomer.language === 'zh' ? '🇨🇳 Chinese' : '🇹🇭 Thai'}</span></div>}
                        {selectedProfileCustomer.dob && <div><span className="text-slate-500 w-24 inline-block">Birthday:</span> <span className="font-medium text-slate-900">{selectedProfileCustomer.dob}</span></div>}
                        {selectedProfileCustomer.secondaryAddress && <div><span className="text-slate-500 w-24 inline-block align-top">2nd Address:</span> <span className="font-medium text-slate-900 inline-block w-[calc(100%-6rem)]">{selectedProfileCustomer.secondaryAddress}</span></div>}
                        {selectedProfileCustomer.remark && <div><span className="text-slate-500 w-24 inline-block align-top">Remarks:</span> <span className="font-medium text-rose-600 inline-block w-[calc(100%-6rem)]">{selectedProfileCustomer.remark}</span></div>}
                        {(selectedProfileCustomer.companyName || selectedProfileCustomer.taxId) && (
                          <div className="pt-2 mt-2 border-t border-slate-200">
                             {selectedProfileCustomer.companyName && <div><span className="text-slate-500 w-24 inline-block">Company:</span> <span className="font-medium text-slate-900">{selectedProfileCustomer.companyName}</span></div>}
                             {selectedProfileCustomer.taxId && <div><span className="text-slate-500 w-24 inline-block">Tax ID:</span> <span className="font-medium text-slate-900">{selectedProfileCustomer.taxId}</span></div>}
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
                          {jobs.filter(j => j.customerPhone === selectedProfileCustomer.phone || j.customerId === selectedProfileCustomer.id).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center h-24 text-slate-400">No orders found for this customer.</TableCell>
                            </TableRow>
                          ) : (
                            jobs.filter(j => j.customerPhone === selectedProfileCustomer.phone || j.customerId === selectedProfileCustomer.id)
                              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                              .map(job => (
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
