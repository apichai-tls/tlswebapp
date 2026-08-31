import { useState, useMemo, useEffect, useSyncExternalStore } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, UserPlus, Users, Edit, Trash2, MapPin, Phone, Star, ShieldCheck, Crown, Medal, Wallet, Eye, Calendar, Tag, CreditCard, Clock, ChevronDown, ChevronUp, Mail, MessageCircle, Globe, Building, FileText, Gift, Database, TrendingUp, Sparkles, Receipt, Coins, ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { format } from "date-fns";
import { useCustomers } from "@/lib/use-customers";
import { useJobs } from "@/lib/use-jobs";
import { customerStore, priceListStore, poiStore, shopStore, type Customer } from "@/lib/store";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { AdminCustomerDialog } from "@/components/admin-customer-dialog";
import { AdminCustomerProfileModal } from "@/components/admin-customer-profile-modal";
import { getTopUpTransactionsAction } from "@/actions/db";
import { A5ReceiptDialog } from "@/components/a5-receipt-dialog";
import { type ReceiptData } from "@/components/thermal-receipt-dialog";

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

// Helper to extract initials for avatar
const getInitials = (name: string) => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
};

// Helper to assign colors based on customer tier (Standard, Member, VIP, Corporate)
const getAvatarStyles = (customer: Customer) => {
  if (customer.isVIP) {
    return "bg-gradient-to-br from-amber-400 to-amber-500 border-amber-300 text-white shadow-amber-100 shadow-sm";
  }
  if (customer.isMember) {
    return "bg-gradient-to-br from-indigo-500 to-indigo-600 border-indigo-300 text-white shadow-indigo-150 shadow-sm";
  }
  if (customer.isCorporate) {
    return "bg-gradient-to-br from-slate-600 to-slate-700 border-slate-450 text-white shadow-slate-200 shadow-sm";
  }
  // Standard
  return "bg-gradient-to-br from-slate-400 to-slate-500 border-slate-350 text-white shadow-sm";
};

// Helper to assign a small indicator badge on top right of avatar
const getAvatarBadge = (customer: Customer) => {
  if (customer.isVIP) {
    return (
      <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-white border border-amber-200 flex items-center justify-center shadow-sm z-10">
        <Star size={8} className="text-amber-500 fill-amber-500" />
      </span>
    );
  }
  if (customer.isMember) {
    return (
      <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-white border border-indigo-200 flex items-center justify-center shadow-sm z-10">
        <Crown size={8} className="text-indigo-600" />
      </span>
    );
  }
  if (customer.isCorporate) {
    return (
      <span className="absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm z-10">
        <Building size={8} className="text-slate-500" />
      </span>
    );
  }
  return null; // Standard/Retail has no badge
};

// Helper to format last active date
const getLastActiveText = (date?: Date) => {
  if (!date) return "No order history";
  try {
    const diffMs = new Date().getTime() - new Date(date).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Active today";
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
  } catch {
    return "N/A";
  }
};

export function AdminCRM({ onTopUp }: { onTopUp?: (customer?: Customer) => void } = {}) {
  const { user } = useAuth();
  const customers = useCustomers();
  const jobs = useJobs();
  const priceLists = useSyncExternalStore(priceListStore.subscribe, priceListStore.getSnapshot, priceListStore.getSnapshot);
  const pois = useSyncExternalStore(poiStore.subscribe, poiStore.getSnapshot, poiStore.getSnapshot);
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const activeShop = shops[0];

  // Only Accounting and Admin can see Adjust Balance button (CSO excluded)
  const canAdjustBalance = user?.role === 'admin' || user?.role === 'accounting';
  // Everyone except Rider can see Top Up button
  const canTopUp = user?.role !== 'rider';

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "vip" | "member" | "corporate" | "balance" | "topup_history">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Top-Up History State
  const [allTopUpTxs, setAllTopUpTxs] = useState<any[]>([]);
  const [isLoadingTopUps, setIsLoadingTopUps] = useState(false);

  // Receipt Preview
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptData | null>(null);
  const [previewReceiptOpen, setPreviewReceiptOpen] = useState(false);

  const fetchTopUps = () => {
    setIsLoadingTopUps(true);
    getTopUpTransactionsAction()
      .then(txs => setAllTopUpTxs(txs || []))
      .catch(e => console.error("Failed to load top-up transactions:", e))
      .finally(() => setIsLoadingTopUps(false));
  };

  useEffect(() => {
    fetchTopUps();
  }, []);

  // Reset page to 1 when search or tab filters change
  useEffect(() => {
    setCurrentPage(1);
    if (activeTab === "topup_history") {
      fetchTopUps();
    }
  }, [searchTerm, activeTab]);
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

  // Detailed Customer Analytics (Jobs count, total spent/LTV, and Last Active date)
  const customerAnalytics = useMemo(() => {
    const analytics: Record<string, { jobsCount: number; ltv: number; lastActiveDate?: Date }> = {};
    
    // Maps for O(1) lookups
    const customerById = new Map<string, Customer>();
    const customerByPhone = new Map<string, Customer>();
    const customerByName = new Map<string, Customer>();
    
    customers.forEach(c => {
      analytics[c.id] = { jobsCount: 0, ltv: 0 };
      customerById.set(c.id, c);
      if (c.phone) customerByPhone.set(c.phone, c);
      if (c.name) customerByName.set(c.name.toUpperCase(), c);
    });
    
    jobs.forEach(job => {
      let matchedCustomer: Customer | undefined;
      
      if (job.customerId) {
        matchedCustomer = customerById.get(job.customerId);
      }
      if (!matchedCustomer && job.customerPhone) {
        matchedCustomer = customerByPhone.get(job.customerPhone);
      }
      if (!matchedCustomer && job.customerName) {
        matchedCustomer = customerByName.get(job.customerName.toUpperCase());
      }
      
      if (matchedCustomer) {
        const stats = analytics[matchedCustomer.id];
        if (stats) {
          if (job.status === "completed") {
            stats.jobsCount += 1;
            stats.ltv += (job.totalAmount || job.fee || 0);
          }
          const jobDate = new Date(job.createdAt);
          if (!stats.lastActiveDate || jobDate > stats.lastActiveDate) {
            stats.lastActiveDate = jobDate;
          }
        }
      }
    });
    
    return analytics;
  }, [jobs, customers]);

  // Network CRM Insights calculations
  const totalNetworkLTV = useMemo(() => {
    return Object.values(customerAnalytics).reduce((sum, item) => sum + item.ltv, 0);
  }, [customerAnalytics]);

  const totalCreditBalance = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.creditBalance || 0), 0);
  }, [customers]);

  const statsCount = useMemo(() => {
    return {
      all: customers.length,
      vip: customers.filter(c => c.isVIP).length,
      member: customers.filter(c => c.isMember).length,
      corporate: customers.filter(c => c.isCorporate).length,
      balance: customers.filter(c => (c.creditBalance || 0) > 0).length
    };
  }, [customers]);

  // Combined search & tag filtering
  const filteredCustomers = useMemo(() => {
    return customers.filter(c => {
      // 1. Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchSearch = 
        c.name.toLowerCase().includes(searchLower) || 
        c.phone.includes(searchTerm) ||
        (c.memberId && c.memberId.toLowerCase().includes(searchLower)) ||
        (c.email && c.email.toLowerCase().includes(searchLower)) ||
        (c.lineId && c.lineId.toLowerCase().includes(searchLower));
      
      if (!matchSearch) return false;

      // 2. Tab filter
      if (activeTab === "vip") return c.isVIP;
      if (activeTab === "member") return c.isMember;
      if (activeTab === "corporate") return c.isCorporate;
      if (activeTab === "balance") return (c.creditBalance || 0) > 0;
      
      return true;
    });
  }, [customers, searchTerm, activeTab]);

  // Sort by LTV descending (highest spent first)
  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
      const statsA = customerAnalytics[a.id] || { ltv: 0 };
      const statsB = customerAnalytics[b.id] || { ltv: 0 };
      return statsB.ltv - statsA.ltv;
    });
  }, [filteredCustomers, customerAnalytics]);

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedCustomers.slice(startIndex, startIndex + pageSize);
  }, [sortedCustomers, currentPage, pageSize]);

  // Top-Up History Filter & Pagination
  const filteredTopUpTxs = useMemo(() => {
    if (!searchTerm.trim()) return allTopUpTxs;
    const q = searchTerm.toLowerCase();
    return allTopUpTxs.filter(tx => {
      const custName = (tx.Customer?.name || "").toLowerCase();
      const custPhone = (tx.Customer?.phone || "").toLowerCase();
      const idMatch = (tx.id || "").toLowerCase().includes(q);
      let meta: any = {};
      try { meta = JSON.parse(tx.description || "{}"); } catch {}
      const pkgMatch = (meta.packageName || "").toLowerCase().includes(q);
      const chanMatch = (meta.paymentChannel || "").toLowerCase().includes(q);
      return custName.includes(q) || custPhone.includes(q) || idMatch || pkgMatch || chanMatch;
    });
  }, [allTopUpTxs, searchTerm]);

  const paginatedTopUpTxs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredTopUpTxs.slice(startIndex, startIndex + pageSize);
  }, [filteredTopUpTxs, currentPage, pageSize]);

  const totalItems = activeTab === "topup_history" ? filteredTopUpTxs.length : sortedCustomers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      if (start > 2) {
        pages.push("...");
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < totalPages - 1) {
        pages.push("...");
      }
      
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6 bg-slate-50/50">
      
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Database size={20} />
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">Customer Database</h1>
          </div>
          <p className="text-sm text-slate-500 font-medium">
            Customer Relationship Management ({customers.length} customers) - View history, LTV spent, and custom rates.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => onTopUp ? onTopUp() : setTopUpOpen(true)} 
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-100 transition-all rounded-xl h-11 px-5"
          >
            <Wallet size={18} />
            Top Up Wallet
          </Button>
          <Button 
            onClick={() => openForm()} 
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-100 transition-all rounded-xl h-11 px-5"
          >
            <UserPlus size={18} />
            Add New Customer
          </Button>
        </div>
      </div>

      {/* Modern Analytics Cards */}
      <motion.div 
        variants={containerVariants} 
        initial="hidden" 
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        {/* Card 1: Total Customers */}
        <motion.div variants={itemVariants} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform">
            <Users size={24} />
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Total Customers</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-black text-slate-900">{statsCount.all}</h3>
            <span className="text-xs text-slate-500">retail</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="bg-amber-50 text-amber-800 border-none font-bold text-[10px] h-5 py-0 px-2">
              VIP {statsCount.vip}
            </Badge>
            <Badge variant="secondary" className="bg-blue-50 text-blue-800 border-none font-bold text-[10px] h-5 py-0 px-2">
              Member {statsCount.member}
            </Badge>
            <Badge variant="secondary" className="bg-slate-50 text-slate-800 border-none font-bold text-[10px] h-5 py-0 px-2">
              Corp {statsCount.corporate}
            </Badge>
          </div>
        </motion.div>
        
        {/* Card 2: Total Wallet Credit Balance */}
        <motion.div variants={itemVariants} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
            <Wallet size={24} />
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Credit Wallet Balance</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-black text-emerald-600">
              ฿{totalCreditBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-3 font-medium">
            There are <span className="font-bold text-emerald-600">{statsCount.balance}</span> active wallets in system.
          </p>
        </motion.div>

        {/* Card 3: Network LTV Revenue */}
        <motion.div variants={itemVariants} className="bg-gradient-to-br from-indigo-900 to-indigo-800 rounded-2xl border border-indigo-750 p-6 shadow-md relative overflow-hidden group">
          <div className="absolute right-4 top-4 p-3 bg-indigo-800 text-indigo-200 rounded-xl group-hover:scale-110 transition-transform">
            <TrendingUp size={24} />
          </div>
          <p className="text-indigo-200/70 text-xs font-bold uppercase tracking-widest mb-2">Total Customer LTV</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-black text-white">
              ฿{totalNetworkLTV.toLocaleString()}
            </h3>
          </div>
          <p className="text-xs text-indigo-200 mt-3 font-medium">
            Completed order value stats from all customers.
          </p>
        </motion.div>
      </motion.div>

      {/* Filter and Search Action Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Quick Filters Tab Layout */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab("all")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === "all"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users size={14} />
              All ({statsCount.all})
            </button>
            <button
              onClick={() => setActiveTab("vip")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === "vip"
                  ? "bg-white text-amber-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Star size={14} className="fill-amber-400 text-amber-500" />
              VIP ({statsCount.vip})
            </button>
            <button
              onClick={() => setActiveTab("member")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === "member"
                  ? "bg-white text-indigo-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Crown size={14} className="text-indigo-600" />
              Members ({statsCount.member})
            </button>
            <button
              onClick={() => setActiveTab("corporate")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === "corporate"
                  ? "bg-white text-slate-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Building size={14} className="text-slate-600" />
              Corporate B2B ({statsCount.corporate})
            </button>
            <button
              onClick={() => setActiveTab("balance")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === "balance"
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Wallet size={14} className="text-emerald-600" />
              Active Wallets ({statsCount.balance})
            </button>
            <button
              onClick={() => setActiveTab("topup_history")}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                activeTab === "topup_history"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Receipt size={14} className={activeTab === "topup_history" ? "text-white" : "text-emerald-600"} />
              Top-up History ({allTopUpTxs.length})
            </button>
          </div>

          {/* Search bar inside the bar */}
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input 
              placeholder="Search name, phone, LINE, email, ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10 border-slate-200 bg-slate-50 focus-visible:ring-indigo-500 rounded-xl text-xs font-medium"
            />
          </div>

        </div>
      </div>

      {/* Main Beautiful Table */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
      >
        {activeTab === "topup_history" ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-emerald-50/70 hover:bg-emerald-50/70 border-b-slate-200">
                  <TableHead className="font-bold text-emerald-950 pl-6 py-4 text-xs uppercase tracking-wider">Date & Time</TableHead>
                  <TableHead className="font-bold text-emerald-950 py-4 text-xs uppercase tracking-wider">Receipt No</TableHead>
                  <TableHead className="font-bold text-emerald-950 py-4 text-xs uppercase tracking-wider">Customer Info</TableHead>
                  <TableHead className="font-bold text-emerald-950 py-4 text-xs uppercase tracking-wider">Package / Details</TableHead>
                  <TableHead className="font-bold text-emerald-950 py-4 text-xs uppercase tracking-wider text-right">Paid (฿)</TableHead>
                  <TableHead className="font-bold text-emerald-950 py-4 text-xs uppercase tracking-wider text-right">Bonus (+฿)</TableHead>
                  <TableHead className="font-bold text-emerald-950 py-4 text-xs uppercase tracking-wider text-right">Total Credit (฿)</TableHead>
                  <TableHead className="font-bold text-emerald-950 py-4 text-xs uppercase tracking-wider text-center">Channel</TableHead>
                  <TableHead className="font-bold text-emerald-950 pr-6 py-4 text-xs uppercase tracking-wider text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {isLoadingTopUps ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-44 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Coins size={28} className="animate-spin text-emerald-500" />
                          <p className="text-xs font-semibold">Loading top-up transaction history...</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredTopUpTxs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-44 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Receipt size={32} className="text-slate-300" />
                          <p className="font-semibold text-sm">No top-up transactions found</p>
                          <p className="text-xs text-slate-400">Top-up transactions recorded in the system will appear here.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedTopUpTxs.map((tx, index) => {
                      let meta: any = {};
                      try { meta = JSON.parse(tx.description || "{}"); } catch {}
                      const customerName = tx.Customer?.name || "Customer";
                      const customerPhone = tx.Customer?.phone || "-";

                      return (
                        <motion.tr
                          key={tx.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ delay: index * 0.02 }}
                          className="border-b border-slate-100 hover:bg-emerald-50/20 transition-colors"
                        >
                          <TableCell className="pl-6 py-4 text-xs font-bold text-slate-600 whitespace-nowrap">
                            {format(new Date(tx.createdAt), 'dd/MM/yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="py-4">
                            <Badge variant="outline" className="font-mono font-bold text-emerald-700 bg-emerald-50 border-emerald-200 text-xs">
                              {tx.id}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900">{customerName}</span>
                              <span className="text-[11px] font-medium text-slate-500">{customerPhone}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900">{meta.packageName || "Member Top-Up"}</span>
                              {meta.createdBy && (
                                <span className="text-[10px] text-slate-400">By: {meta.createdBy}</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-4 text-right font-bold text-slate-800 text-xs">
                            ฿{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="py-4 text-right text-xs">
                            {(meta.bonusAmount || 0) > 0 ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-none font-bold text-[10px]">
                                + ฿{meta.bonusAmount.toLocaleString()}
                              </Badge>
                            ) : (
                              <span className="text-slate-400 text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell className="py-4 text-right font-black text-emerald-600 text-sm">
                            ฿{(meta.totalCredit || tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="py-4 text-center">
                            <Badge variant="secondary" className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold">
                              {meta.paymentChannel || "Transfer"}
                            </Badge>
                          </TableCell>
                          <TableCell className="pr-6 py-4 text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 px-3 text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1.5 rounded-xl shadow-sm cursor-pointer"
                              onClick={() => {
                                if (meta.receiptData) {
                                  setPreviewReceipt(meta.receiptData);
                                } else {
                                  setPreviewReceipt({
                                    id: tx.id,
                                    receiptNumber: tx.id,
                                    isDraft: false,
                                    status: "completed",
                                    createdAt: new Date(tx.createdAt),
                                    customerName,
                                    customerPhone,
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
                              <Receipt size={13} />
                              View Receipt
                            </Button>
                          </TableCell>
                        </motion.tr>
                      );
                    })
                  )}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/70 hover:bg-slate-50/70 border-b-slate-200">
                  <TableHead className="font-bold text-slate-700 pl-6 py-4 text-xs uppercase tracking-wider">Profile & Contact Info</TableHead>
                  <TableHead className="font-bold text-slate-700 py-4 text-xs uppercase tracking-wider">Address & Building (Delivery)</TableHead>
                  <TableHead className="font-bold text-slate-700 py-4 text-xs uppercase tracking-wider">Wallet & Pricing</TableHead>
                  <TableHead className="font-bold text-slate-700 py-4 text-xs uppercase tracking-wider text-center">Accumulated LTV Stats</TableHead>
                  <TableHead className="font-bold text-slate-700 pr-6 py-4 text-xs uppercase tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {sortedCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-44 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Users size={32} className="text-slate-300" />
                          <p className="font-semibold text-sm">No customers found matching the search criteria</p>
                          <p className="text-xs text-slate-400">Please try different keywords or change filter tabs</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedCustomers.map((customer, index) => {
                      const stats = customerAnalytics[customer.id] || { jobsCount: 0, ltv: 0 };
                      const isNewCustomer = stats.jobsCount === 0;
                      
                      return (
                        <motion.tr
                          key={customer.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ delay: index * 0.02 }}
                          className="border-b border-slate-100 hover:bg-slate-50/30 transition-colors"
                        >
                          {/* 1. Profile Info & Avatar */}
                          <TableCell className="pl-6 py-4.5">
                            <div className="flex items-center gap-3">
                              {/* Initials Avatar with dynamic tier badge */}
                              <div className="relative shrink-0">
                                <div className={`w-10 h-10 rounded-xl border flex items-center justify-center font-bold text-xs shadow-sm ${getAvatarStyles(customer)}`}>
                                  {getInitials(customer.name)}
                                </div>
                                {getAvatarBadge(customer)}
                              </div>
                              
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-bold text-slate-900 text-sm">{customer.name}</span>
                                  {customer.isVIP && (
                                    <Badge className="bg-amber-50 text-amber-700 border border-amber-200/50 shadow-sm py-0 px-1.5 h-4.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 rounded-md">
                                      <Star size={8} className="text-amber-500 fill-amber-500" />
                                      VIP
                                    </Badge>
                                  )}
                                  {customer.isCorporate && (
                                    <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200/30 shadow-sm py-0 px-1.5 h-4.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5 rounded-md">
                                      <Building size={8} className="text-indigo-500" /> 
                                      B2B
                                    </Badge>
                                  )}
                                  {isNewCustomer ? (
                                    <Badge className="bg-sky-50 text-sky-700 border border-sky-200/40 shadow-sm py-0 px-1.5 h-4.5 text-[9px] font-black uppercase tracking-wider rounded-md">
                                      NEW
                                    </Badge>
                                  ) : null}
                                </div>

                                <div className="flex flex-col gap-0.5 text-slate-500 text-[11px] font-medium">
                                  <div className="flex items-center gap-1">
                                    <Phone size={10} className="text-slate-400" />
                                    <span>{customer.phone}</span>
                                  </div>
                                  {customer.email && (
                                    <div className="flex items-center gap-1">
                                      <Mail size={10} className="text-slate-400" />
                                      <span className="truncate max-w-[150px]">{customer.email}</span>
                                    </div>
                                  )}
                                  {customer.lineId && (
                                    <div className="flex items-center gap-1">
                                      <MessageCircle size={10} className="text-indigo-400" />
                                      <span>LINE: <span className="text-indigo-600 font-semibold">{customer.lineId}</span></span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          {/* 3. Address Column (Primary Address + secondary room details) */}
                          <TableCell className="py-4.5">
                            <div className="flex flex-col gap-1 max-w-[220px]">
                              <div className="flex items-start gap-1">
                                <MapPin size={12} className="text-indigo-500 shrink-0 mt-0.5" />
                                <span className="text-xs font-semibold text-slate-700 leading-snug line-clamp-2" title={customer.defaultAddress}>
                                  {customer.defaultAddress}
                                </span>
                              </div>
                              {customer.secondaryAddress ? (
                                <div className="flex items-center gap-1 ml-3.5 bg-slate-100 px-2 py-0.5 rounded-md w-fit">
                                  <Building size={10} className="text-slate-500 shrink-0" />
                                  <span className="text-[10px] font-black text-slate-600">
                                    {customer.secondaryAddress}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-amber-500 font-bold ml-3.5 italic">⚠️ No building/room</span>
                              )}
                            </div>
                          </TableCell>

                          {/* 4. Financial Wallet & Pricing Tier */}
                          <TableCell className="py-4.5">
                            <div className="space-y-1.5">
                              {/* Wallet Balance */}
                              <div className="flex items-center gap-1">
                                <Wallet size={12} className="text-slate-400" />
                                <span className={`text-xs font-bold ${
                                  (customer.creditBalance || 0) > 0 ? "text-emerald-600" : "text-slate-400"
                                }`}>
                                  ฿{(customer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              
                              {/* Price tier badge */}
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                {customer.isMember && customer.memberId && (
                                  <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-200/50 shadow-none font-bold text-[9px] h-4.5 py-0 px-1.5">
                                    ID: {customer.memberId}
                                  </Badge>
                                )}
                                
                                {customer.isMember && customer.memberExpiryDate && (
                                  <Badge className={`border shadow-none font-bold text-[9px] h-4.5 py-0 px-1.5 flex items-center gap-0.5 ${
                                    new Date(customer.memberExpiryDate).getTime() < Date.now()
                                      ? "bg-rose-50 text-rose-700 border-rose-200/50"
                                      : "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                                  }`}>
                                    <Clock size={8} />
                                    {new Date(customer.memberExpiryDate).getTime() < Date.now()
                                      ? `Expired: ${format(new Date(customer.memberExpiryDate), "dd MMM yyyy")}`
                                      : `Expires: ${format(new Date(customer.memberExpiryDate), "dd MMM yyyy")}`
                                    }
                                  </Badge>
                                )}
                                
                                {customer.priceListId && customer.priceListId !== "regular" ? (
                                  <Badge className="bg-purple-50 text-purple-700 border border-purple-200/30 shadow-none font-bold text-[9px] h-4.5 py-0 px-1.5 flex items-center gap-0.5">
                                    <Crown size={8} className="text-purple-600" /> 
                                    {priceLists.find(p => p.id === customer.priceListId)?.name || "Special Rate"}
                                  </Badge>
                                ) : (
                                  <Badge className="bg-slate-50 text-slate-500 border border-slate-200/60 shadow-none font-medium text-[9px] h-4.5 py-0 px-1.5">
                                    Standard Rate
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* 5. LTV & Activity stats */}
                          <TableCell className="py-4.5 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-sm font-black text-slate-900">
                                ฿{stats.ltv.toLocaleString()}
                              </span>
                              <span className="text-[10px] text-slate-500 bg-slate-100 font-semibold px-2 py-0.5 rounded-full">
                                {stats.jobsCount} orders
                              </span>
                              <span className="text-[9px] text-slate-400 flex items-center gap-0.5 mt-0.5">
                                <Clock size={8} />
                                {getLastActiveText(stats.lastActiveDate)}
                              </span>
                            </div>
                          </TableCell>

                          {/* 6. Action buttons */}
                          <TableCell className="py-4.5 pr-6 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              

                              {/* Top Up button — Package flow, visible to all non-rider roles (Member customers only) */}
                              {canTopUp && customer.isMember && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 border-emerald-250 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition-all gap-1 text-[11px] font-bold px-2 rounded-lg"
                                  onClick={() => {
                                    if (onTopUp) {
                                      onTopUp(customer);
                                    } else {
                                      setTopUpCustomer(customer);
                                      setTopUpAmount("");
                                      setTopUpOpen(true);
                                    }
                                  }}
                                >
                                  <Wallet size={12} />
                                  Top Up
                                </Button>
                              )}

                              {/* Adjust Balance button — Admin & Accounting only (CSO excluded, Member customers only) */}
                              {canAdjustBalance && customer.isMember && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 border-amber-300 bg-amber-50/50 text-amber-700 hover:bg-amber-500 hover:text-white transition-all gap-1 text-[11px] font-bold px-2 rounded-lg"
                                  title="Adjust Balance (Manual)"
                                  onClick={() => {
                                    setTopUpCustomer(customer);
                                    setTopUpAmount("");
                                    setTopUpOpen(true);
                                  }}
                                >
                                  <SlidersHorizontal size={12} />
                                  Adjust
                                </Button>
                              )}

                              {/* View detail button */}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors rounded-lg"
                                title="View Profile"
                                onClick={() => {
                                  setSelectedProfileCustomer(customer);
                                  setProfileOpen(true);
                                }}
                              >
                                <Eye size={15} />
                              </Button>

                              {/* Edit button */}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors rounded-lg"
                                title="Edit"
                                onClick={() => openForm(customer)}
                              >
                                <Edit size={15} />
                              </Button>

                              {/* Delete button */}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors rounded-lg"
                                title="Delete"
                                onClick={() => handleDelete(customer.id, customer.name)}
                              >
                                <Trash2 size={15} />
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
          </div>
        )}

        {/* Pagination Controls */}
        {totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
              <span>
                Showing {Math.min(totalItems, (currentPage - 1) * pageSize + 1)}-{Math.min(totalItems, currentPage * pageSize)} of {totalItems} customers
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 py-0 text-xs font-bold text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <span className="sr-only">Previous Page</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </Button>

              {getPageNumbers().map((p, idx) => {
                if (p === "...") {
                  return (
                    <span key={`ell-${idx}`} className="px-2 text-xs font-semibold text-slate-400">
                      ...
                    </span>
                  );
                }
                const isSelected = p === currentPage;
                return (
                  <Button
                    key={`page-${p}`}
                    variant={isSelected ? "default" : "outline"}
                    className={`h-8 min-w-[32px] px-2.5 text-xs font-bold rounded-lg transition-all ${
                      isSelected
                        ? "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-sm"
                        : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                    onClick={() => setCurrentPage(Number(p))}
                  >
                    {p}
                  </Button>
                );
              })}

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-lg border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                <span className="sr-only">Next Page</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </Button>
            </div>
          </div>
        )}
      </motion.div>

      {/* dialog for customer add/edit */}
      <AdminCustomerDialog 
        open={dialogOpen} 
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingCustomer(null);
        }} 
        customer={editingCustomer} 
      />

      {/* dialog for manual balance adjustment (legacy / migration) */}
      <Dialog open={topUpOpen} onOpenChange={setTopUpOpen}>
        <DialogContent className="sm:max-w-md p-0 bg-white overflow-hidden rounded-2xl border-none shadow-2xl">
          <form onSubmit={handleTopUpSubmit}>
            <DialogHeader className="p-6 pb-4 bg-amber-50 border-b border-amber-100">
              <DialogTitle className="flex items-center gap-2 text-xl font-bold text-amber-950">
                <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                  <SlidersHorizontal size={24} />
                </div>
                Adjust Balance (Manual)
              </DialogTitle>
              <DialogDescription className="text-amber-800/80 mt-1">
                ปรับยอด Wallet โดยตรงสำหรับ <strong>{topUpCustomer?.name}</strong> — ใช้สำหรับ Update ยอดจากระบบเก่า
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">Current Credit Balance</span>
                <span className="text-2xl font-black text-slate-900">
                  ฿{(topUpCustomer?.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Transaction Amount (฿)</Label>
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
                <p className="text-[11px] text-slate-500 font-medium">Use negative numbers (e.g. -500) to deduct credits from wallet.</p>
              </div>
            </div>

            <DialogFooter className="p-6 pt-4 bg-white border-t border-slate-100">
              <Button type="button" variant="ghost" onClick={() => setTopUpOpen(false)} className="h-12 rounded-xl font-semibold px-6">Cancel</Button>
              <Button type="submit" className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-8 shadow-lg shadow-emerald-100">
                Confirm Transaction
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Customer Profile detail modal */}
      <AdminCustomerProfileModal
        open={profileOpen}
        onOpenChange={setProfileOpen}
        customer={selectedProfileCustomer}
      />

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
    </div>
  );
}
