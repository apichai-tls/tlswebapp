import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Phone, MapPin, Star, FileText, Calendar, CreditCard, Wallet, Crown, Building, Mail, 
  Clock, AlertTriangle, Receipt, Eye, Coins, ImageIcon, ExternalLink, X, Edit, MessageCircle, 
  MessageSquare, ShieldCheck, CheckCircle2, Plus, Trash2, Tag, Check, Smartphone, Globe, 
  AlertCircle, ChevronRight, UserCheck, Shield
} from "lucide-react";

import { format } from "date-fns";
import { type Customer, type CustomerAddress, customerStore, shopStore, walletApprovalStore } from "@/lib/store";
import { api } from "@/lib/api";
import { useSyncExternalStore, useState, useEffect, useMemo } from "react";
import { useJobs } from "@/lib/use-jobs";
import { motion, AnimatePresence } from "framer-motion";
import { 
  getTopUpTransactionsAction, 
  addCustomerAddressAction, 
  deleteCustomerAddressAction, 
  setPrimaryCustomerAddressAction 
} from "@/actions/db";
import { A5ReceiptDialog } from "@/components/a5-receipt-dialog";
import { type ReceiptData } from "@/components/thermal-receipt-dialog";
import { isWalletExpired, isValidPhoneNumber } from "@/lib/utils";

// Helper to extract initials for avatar
const getInitials = (name: string) => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
};

// Calculate age from DOB string (YYYY-MM-DD)
function calculateAge(dobStr?: string | null): number | null {
  if (!dobStr) return null;
  const birth = new Date(dobStr);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

// Clean international whatsapp URL
function getWhatsAppUrl(phoneStr?: string | null): string | null {
  if (!phoneStr) return null;
  let digits = phoneStr.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) {
    digits = "66" + digits.substring(1);
  }
  return `https://wa.me/${digits}`;
}

export interface SupportTicket {
  id: string;
  title: string;
  category: string;
  urgency: "NORMAL URGENCY" | "URGENT" | "LOW URGENCY";
  status: "RESOLVED" | "IN PROGRESS" | "OPEN";
  affectedItem: string;
  customerMessage: string;
  staffResponse: string;
  channel: string;
  loggedAt: string;
}

export function AdminCustomerProfileModal({ 
  open, 
  onOpenChange, 
  customer,
  onEditCustomer
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  customer: Customer | null;
  onEditCustomer?: (c: Customer) => void;
}) {
  const jobs = useJobs();
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const activeShop = shops[0];
  const isStandardPlan = activeShop?.plan === 'standard';

  const pendingWalletMap = useSyncExternalStore(walletApprovalStore.subscribe, walletApprovalStore.getSnapshot, walletApprovalStore.getSnapshot);
  const pendingCount = customer?.id ? (pendingWalletMap.byCustomer[customer.id] || 0) : 0;

  // Main 3 Tabs: "profile" | "orders" | "tickets"
  const [activeTab, setActiveTab] = useState<"profile" | "orders" | "tickets">("profile");

  // Orders Tab sub-switch: "orders" | "ledger"
  const [ordersSubTab, setOrdersSubTab] = useState<"orders" | "ledger">("orders");

  // Local state for addresses & tickets (REAL DATA ONLY - NO MOCK)
  const [localAddresses, setLocalAddresses] = useState<CustomerAddress[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  // Modals inside profile
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);

  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [newAddrLabel, setNewAddrLabel] = useState("Home Condo");
  const [newAddrPlace, setNewAddrPlace] = useState("");
  const [newAddrFull, setNewAddrFull] = useState("");
  const [newAddrRoom, setNewAddrRoom] = useState("");
  const [newAddrDistrict, setNewAddrDistrict] = useState("Watthana");
  const [newAddrJuristic, setNewAddrJuristic] = useState(true);
  const [newAddrMaps, setNewAddrMaps] = useState("");
  const [newAddrPrimary, setNewAddrPrimary] = useState(false);
  const [isSavingAddr, setIsSavingAddr] = useState(false);

  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [newTicketTitle, setNewTicketTitle] = useState("");
  const [newTicketCat, setNewTicketCat] = useState("Special Laundry Request");
  const [newTicketUrgency, setNewTicketUrgency] = useState<"NORMAL URGENCY" | "URGENT" | "LOW URGENCY">("NORMAL URGENCY");
  const [newTicketStatus, setNewTicketStatus] = useState<"RESOLVED" | "IN PROGRESS" | "OPEN">("RESOLVED");
  const [newTicketItem, setNewTicketItem] = useState("");
  const [newTicketCustMsg, setNewTicketCustMsg] = useState("");
  const [newTicketStaffResp, setNewTicketStaffResp] = useState("");
  const [newTicketChannel, setNewTicketChannel] = useState("WHATSAPP");

  // Wallet & Top-up ledger state
  const [topUpTxs, setTopUpTxs] = useState<any[]>([]);
  const [isLoadingTopUps, setIsLoadingTopUps] = useState(false);
  const [walletTxs, setWalletTxs] = useState<any[]>([]);
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);

  // Receipt Preview
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptData | null>(null);
  const [previewReceiptOpen, setPreviewReceiptOpen] = useState(false);

  // Slip Image Preview
  const [previewSlipModalOpen, setPreviewSlipModalOpen] = useState(false);
  const [previewSlipUrl, setPreviewSlipUrl] = useState<string | null>(null);
  const [previewSlipTitle, setPreviewSlipTitle] = useState("");

  // Initialize and load customer data
  useEffect(() => {
    if (open && customer?.id) {
      // Set local addresses from database only
      setLocalAddresses(customer.addresses || []);

      // Load tickets from localStorage for this specific customer (empty if none)
      const storageKey = `crm_tickets_${customer.id}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          setTickets(JSON.parse(saved));
        } catch {
          setTickets([]);
        }
      } else {
        setTickets([]); // Real data only - no seed
      }

      // Fetch top-up & wallet history
      setIsLoadingTopUps(true);
      setIsLoadingWallet(true);
      getTopUpTransactionsAction(customer.id)
        .then(txs => setTopUpTxs(txs || []))
        .catch(err => console.error("Failed to load customer top-up transactions:", err))
        .finally(() => setIsLoadingTopUps(false));

      api.getWalletTransactions({ customerId: customer.id })
        .then(txs => setWalletTxs(txs || []))
        .catch(err => console.error("Failed to load customer wallet transactions:", err))
        .finally(() => setIsLoadingWallet(false));
    }
  }, [open, customer?.id]);

  // Jobs calculation from actual jobs
  const { jobsCount, ltv, customerJobs } = useMemo(() => {
    if (!customer) return { jobsCount: 0, ltv: 0, customerJobs: [] };
    const hasValidPhone = isValidPhoneNumber(customer.phone);
    const cName = (customer.name || "").trim().toLowerCase();
    const custJobs = jobs.filter(j => {
      if (j.customerId && j.customerId === customer.id) return true;
      if (hasValidPhone && j.customerPhone === customer.phone) return true;
      if (!hasValidPhone && j.customerName && j.customerName.trim().toLowerCase() === cName) return true;
      return false;
    });
    const countedJobs = custJobs.filter(j => isStandardPlan ? j.isPaid : j.status === "completed");
    return {
      customerJobs: custJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      jobsCount: countedJobs.length,
      ltv: countedJobs.reduce((sum, j) => sum + (j.totalAmount || j.fee || 0), 0)
    };
  }, [jobs, customer, isStandardPlan]);

  // Active vs Past jobs (Real data only)
  const { activeJobs, pastJobs, totalWeightProcessed, totalRevenue } = useMemo(() => {
    const active = customerJobs.filter(j => j.status !== "completed" && j.status !== "cancel");
    const past = customerJobs.filter(j => j.status === "completed");
    
    // Calculate total weight from actual jobs
    const weightSum = customerJobs.reduce((acc, j) => acc + (Number((j as any).weight) || 0), 0);

    // Calculate revenue from actual jobs
    const revSum = customerJobs.reduce((acc, j) => acc + (j.isPaid || j.status === "completed" ? (j.totalAmount || j.fee || 0) : 0), 0);

    return {
      activeJobs: active,
      pastJobs: past,
      totalWeightProcessed: weightSum,
      totalRevenue: revSum > 0 ? revSum : ltv
    };
  }, [customerJobs, ltv]);

  // Real Display Addresses (from DB table CustomerAddress or real defaultAddress)
  const displayAddresses = useMemo(() => {
    if (localAddresses.length > 0) return localAddresses;
    if (customer?.addresses && customer.addresses.length > 0) return customer.addresses;
    
    // Fallback ONLY to real defaultAddress if present and valid (not empty or "--")
    if (customer?.defaultAddress && customer.defaultAddress.trim() !== "--" && customer.defaultAddress.trim() !== "-") {
      return [{
        id: "addr-default-1",
        customerId: customer.id,
        label: "Default Address",
        placeName: customer.defaultAddress,
        address: customer.defaultAddress,
        roomNumber: customer.roomNo || null,
        district: "Bangkok",
        leaveWithJuristic: true,
        isPrimary: true,
      }];
    }

    return [];
  }, [localAddresses, customer]);

  if (!customer) return null;

  // Real Computed values
  const age = calculateAge(customer.dob);
  const displayPin = customer.passwordHash ? (customer.passwordHash.length === 6 ? customer.passwordHash : customer.passwordHash) : null;
  const custCode = customer.memberId || `CUST-${customer.id.replace(/\D/g, "").slice(0, 4) || customer.id.slice(0, 6).toUpperCase()}`;
  const genderDisplay = customer.gender === "male" ? "Male (ชาย)" : customer.gender === "female" ? "Female (หญิง)" : (customer.gender && customer.gender !== "Rather not say" ? customer.gender : "—");
  const thaiWaUrl = getWhatsAppUrl(customer.phone);
  const intlPhone = customer.secondaryPhone || null;
  const intlWaUrl = getWhatsAppUrl(intlPhone);

  // Address Actions
  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddrFull && !newAddrPlace) return;
    setIsSavingAddr(true);
    try {
      const created = await addCustomerAddressAction(customer.id, {
        label: newAddrLabel,
        placeName: newAddrPlace || newAddrFull,
        address: newAddrFull || newAddrPlace,
        roomNumber: newAddrRoom || undefined,
        district: newAddrDistrict || "Bangkok",
        leaveWithJuristic: newAddrJuristic,
        googleMapsUrl: newAddrMaps || undefined,
        isPrimary: newAddrPrimary || displayAddresses.length === 0
      });

      const updatedList = [created as CustomerAddress, ...localAddresses];
      setLocalAddresses(updatedList);
      setAddressModalOpen(false);
      // Reset form
      setNewAddrPlace("");
      setNewAddrFull("");
      setNewAddrRoom("");
      setNewAddrMaps("");
    } catch (err: any) {
      alert("Error adding address: " + err.message);
    } finally {
      setIsSavingAddr(false);
    }
  };

  const handleSetPrimaryAddress = async (addrId: string) => {
    try {
      await setPrimaryCustomerAddressAction(customer.id, addrId);
      setLocalAddresses(prev => prev.map(a => ({
        ...a,
        isPrimary: a.id === addrId
      })));
    } catch (err: any) {
      alert("Failed to set primary address: " + err.message);
    }
  };

  const handleDeleteAddress = async (addrId: string) => {
    if (!confirm("Are you sure you want to remove this delivery address?")) return;
    try {
      await deleteCustomerAddressAction(addrId, customer.id);
      setLocalAddresses(prev => prev.filter(a => a.id !== addrId));
    } catch (err: any) {
      alert("Failed to delete address: " + err.message);
    }
  };

  // Change PIN Action
  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinValue || pinValue.trim().length < 4) {
      alert("PIN must be 4 to 6 digits.");
      return;
    }
    setIsUpdatingPin(true);
    try {
      await customerStore.updateCustomer(customer.id, {
        passwordHash: pinValue.trim()
      });
      customer.passwordHash = pinValue.trim();
      setPinModalOpen(false);
      setPinValue("");
    } catch (err: any) {
      alert("Failed to update PIN: " + err.message);
    } finally {
      setIsUpdatingPin(false);
    }
  };

  // OTP Verification Simulation Action
  const handleSimulateOtp = async () => {
    setIsVerifyingOtp(true);
    try {
      const channel = customer.isWhatsapp ? "WHATSAPP" : "SMS";
      await customerStore.updateCustomer(customer.id, {
        isVerified: true,
        verifiedVia: channel
      });
      customer.isVerified = true;
      customer.verifiedVia = channel;
      setOtpModalOpen(false);
    } catch (err: any) {
      alert("Verification update failed: " + err.message);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Add Ticket Action
  const handleSaveTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketTitle.trim()) return;

    const newTicket: SupportTicket = {
      id: `INC-${Math.floor(100 + Math.random() * 900)}`,
      title: newTicketTitle.trim(),
      category: newTicketCat,
      urgency: newTicketUrgency,
      status: newTicketStatus,
      affectedItem: newTicketItem.trim() || "Laundry items",
      customerMessage: newTicketCustMsg.trim() || "No message detail provided.",
      staffResponse: newTicketStaffResp.trim() || "Under review by staff.",
      channel: `${newTicketChannel} • ${customer.phone || "-"}`,
      loggedAt: format(new Date(), "yyyy-MM-dd HH:mm")
    };

    const updated = [newTicket, ...tickets];
    setTickets(updated);
    localStorage.setItem(`crm_tickets_${customer.id}`, JSON.stringify(updated));
    setTicketModalOpen(false);
    // Reset form
    setNewTicketTitle("");
    setNewTicketItem("");
    setNewTicketCustMsg("");
    setNewTicketStaffResp("");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          showCloseButton={false}
          className="sm:max-w-4xl p-0 bg-white overflow-hidden rounded-3xl z-[999] border border-slate-200/90 shadow-2xl transition-all"
        >
          {/* HEADER SECTION */}
          <div className="p-6 pb-4 bg-white border-b border-slate-200/80">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              
              {/* Left Identity Group */}
              <div className="flex items-center gap-4 min-w-0">
                {/* Initials Avatar Box */}
                <div className="w-13 h-13 rounded-2xl bg-gradient-to-tr from-sky-400 via-sky-500 to-blue-600 text-white font-black text-xl flex items-center justify-center shrink-0 shadow-md shadow-sky-200/50">
                  {getInitials(customer.name)}
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-black text-slate-900 tracking-tight truncate">
                      {customer.name}
                    </h2>
                    
                    {customer.nickName && customer.nickName.trim() && (
                      <span className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200/80 px-2.5 py-0.5 rounded-full">
                        Nickname: "{customer.nickName}"
                      </span>
                    )}

                    {customer.isVIP && (
                      <span className="bg-purple-100 text-purple-700 border border-purple-200/60 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full flex items-center gap-0.5 shadow-2xs">
                        VIP
                      </span>
                    )}

                    {customer.brand === "noname_laundry" && (
                      <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] font-bold uppercase rounded-md shadow-2xs">
                        Noname
                      </span>
                    )}
                  </div>

                  {/* Metadata Subline */}
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                    <span className="font-mono font-bold text-slate-700">{custCode}</span>
                    <span className="text-slate-300">•</span>
                    <span>Gender: <strong className="text-slate-700 font-bold">{genderDisplay}</strong></span>
                    <span className="text-slate-300">•</span>
                    <span>
                      DOB: {customer.dob ? (
                        <>
                          <strong className="text-slate-700 font-bold">{customer.dob}</strong>
                          {age != null && <span className="text-slate-500 font-normal ml-1">({age} years old)</span>}
                        </>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Quick Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Primary WhatsApp Button */}
                {thaiWaUrl && (
                  <a
                    href={thaiWaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300/80 hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
                    title={`Chat on WhatsApp with ${customer.phone}`}
                  >
                    <MessageCircle size={14} className="text-emerald-600 fill-emerald-100" />
                    <span>WA</span>
                  </a>
                )}

                {/* Secondary/Intl WhatsApp Button (if secondary phone exists) */}
                {intlPhone && intlWaUrl && (
                  <a
                    href={intlWaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-300/80 hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
                    title={`Chat on WhatsApp (Intl) with ${intlPhone}`}
                  >
                    <MessageCircle size={14} className="text-emerald-600 fill-emerald-100" />
                    <span>WA (Intl)</span>
                  </a>
                )}

                {/* LINE Button */}
                <a
                  href={customer.lineId ? `https://line.me/ti/p/~${customer.lineId.replace(/^@/, '')}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (!customer.lineId) {
                      e.preventDefault();
                      alert("ไม่ได้ระบุ LINE ID สำหรับลูกค้ารายนี้ (No LINE ID registered)");
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors shadow-2xs cursor-pointer ${
                    customer.lineId 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-300/80 hover:bg-emerald-100" 
                      : "bg-slate-50 text-slate-400 border-slate-200"
                  }`}
                  title={customer.lineId ? `LINE ID: ${customer.lineId}` : "No LINE ID registered"}
                >
                  <MessageSquare size={14} className={customer.lineId ? "text-emerald-600 fill-emerald-100" : "text-slate-300"} />
                  <span>LINE</span>
                </a>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Close (ESC)"
                >
                  <span className="text-[10px] font-mono text-slate-400 border border-slate-200 px-1 py-0.2 rounded bg-slate-50">ESC</span>
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* TAB BAR (3 Main Tabs) */}
            <div className="flex items-center gap-8 mt-5 border-b border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className={`pb-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                  activeTab === "profile"
                    ? "border-sky-600 text-sky-700 font-extrabold"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <UserCheck size={15} className={activeTab === "profile" ? "text-sky-600" : "text-slate-400"} />
                <span>Profile, Addresses & Tax</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("orders")}
                className={`pb-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                  activeTab === "orders"
                    ? "border-sky-600 text-sky-700 font-extrabold"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <FileText size={15} className={activeTab === "orders" ? "text-sky-600" : "text-slate-400"} />
                <span>Transactions & Orders ({customerJobs.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("tickets")}
                className={`pb-2.5 flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                  activeTab === "tickets"
                    ? "border-sky-600 text-sky-700 font-extrabold"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <AlertCircle size={15} className={activeTab === "tickets" ? "text-sky-600" : "text-slate-400"} />
                <span>Reported Issues & Tickets ({tickets.length})</span>
              </button>
            </div>
          </div>

          {/* MAIN MODAL BODY CONTAINER (Scrollable) */}
          <div className="p-6 max-h-[78vh] overflow-y-auto space-y-6">

            {/* ========================================================================= */}
            {/* TAB 1: PROFILE, ADDRESSES & TAX                                          */}
            {/* ========================================================================= */}
            {activeTab === "profile" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                {/* SECTION 1: CUSTOMER IDENTITY & CONTACT INFORMATION */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UserCheck size={16} className="text-sky-600" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Customer Identity & Contact Information
                      </h3>
                    </div>

                    {onEditCustomer && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onOpenChange(false);
                          onEditCustomer(customer);
                        }}
                        className="h-7 px-3 text-xs font-bold text-sky-700 border-sky-200 hover:bg-sky-50 gap-1.5 rounded-full shadow-2xs cursor-pointer"
                      >
                        <Edit size={12} className="text-sky-600" />
                        <span>Edit Phone Numbers & WhatsApp</span>
                      </Button>
                    )}
                  </div>

                  {/* 3-Column Info Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 text-xs">
                    <div className="space-y-3">
                      <div>
                        <div className="text-[11px] font-semibold text-slate-400 mb-0.5">Full Legal Name:</div>
                        <div className="text-sm font-black text-slate-900">{customer.name || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-slate-400 mb-0.5">Email Address:</div>
                        <div className="text-xs font-medium text-slate-700">{customer.email || "—"}</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="text-[11px] font-semibold text-slate-400 mb-0.5">Preferred Nickname:</div>
                        <div className="text-sm font-bold text-sky-600">{customer.nickName || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-slate-400 mb-0.5">LINE OA / ID:</div>
                        <div className="text-xs font-bold text-emerald-600">{customer.lineId || "—"}</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="text-[11px] font-semibold text-slate-400 mb-0.5">Gender:</div>
                        <div className="text-sm font-black text-slate-900">{genderDisplay}</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-slate-400 mb-0.5">Tier & Profile ID:</div>
                        <div className="text-xs font-bold text-slate-800">
                          {customer.isVIP ? "VIP" : customer.isMember ? "MEMBER" : "Standard"} • {custCode}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Subcard: Dual Mobile Numbers & WhatsApp Connectivity */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Dual Mobile Numbers & WhatsApp Connectivity
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Primary Thai Mobile */}
                      <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <span className="text-xs font-black">🇹🇭</span>
                            <span>Primary Thai Mobile</span>
                          </div>
                          {customer.isWhatsapp ? (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                              <MessageCircle size={10} /> WhatsApp OK
                            </span>
                          ) : (
                            <span className="bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              SMS Only
                            </span>
                          )}
                        </div>

                        <div className="font-mono text-base font-black text-slate-900 tracking-wide">
                          {customer.phone || "—"}
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                          {thaiWaUrl ? (
                            <a
                              href={thaiWaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 hover:underline"
                            >
                              <MessageCircle size={12} />
                              <span>Check on WhatsApp ↗</span>
                            </a>
                          ) : (
                            <span className="text-slate-400">No WhatsApp</span>
                          )}
                          <span className="text-[11px] text-slate-400 font-medium">Default Local</span>
                        </div>
                      </div>

                      {/* International / Secondary Mobile */}
                      <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <Globe size={13} className="text-sky-600" />
                            <span>International Mobile (Country Code)</span>
                          </div>
                          {intlPhone ? (
                            customer.isSecondaryWhatsapp ? (
                              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                <MessageCircle size={10} /> WhatsApp OK
                              </span>
                            ) : (
                              <span className="bg-slate-200 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                SMS Only
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400 text-[10px]">ไม่ได้ระบุ</span>
                          )}
                        </div>

                        <div className="font-mono text-base font-black text-slate-900 tracking-wide">
                          {intlPhone || <span className="text-slate-400 text-xs font-normal italic">ไม่มีเบอร์สำรอง (Not provided)</span>}
                        </div>

                        <div className="flex items-center justify-between text-xs pt-1">
                          {intlWaUrl && customer.isSecondaryWhatsapp ? (
                            <a
                              href={intlWaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 hover:underline"
                            >
                              <MessageCircle size={12} />
                              <span>Check / Test on WhatsApp ↗</span>
                            </a>
                          ) : (
                            <span className="text-slate-400 text-[11px]">{intlPhone ? "No WhatsApp configured" : "—"}</span>
                          )}
                          <span className="text-[11px] text-slate-400 font-medium">Roaming/Expats</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: SECURITY, OTP VERIFICATION & 6-DIGIT PIN */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-emerald-600" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Security, OTP Verification & 6-Digit PIN
                      </h3>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setOtpModalOpen(true)}
                      className="h-7 px-3 text-xs font-bold text-sky-700 border-sky-200 hover:bg-sky-50 gap-1.5 rounded-full shadow-2xs cursor-pointer"
                    >
                      <Smartphone size={12} className="text-sky-600" />
                      <span>Simulate OTP Verification</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Verification Status */}
                    <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-400">Verification Status:</div>
                      {customer.isVerified ? (
                        <div className="flex items-center gap-1.5 text-emerald-700 font-extrabold text-sm">
                          <CheckCircle2 size={16} className="text-emerald-600" />
                          <span>Verified via {customer.verifiedVia || "WHATSAPP"}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-700 font-bold text-sm">
                          <AlertTriangle size={15} className="text-amber-500" />
                          <span>ยังไม่ได้ยืนยัน (Unverified)</span>
                        </div>
                      )}
                    </div>

                    {/* 6-Digit PIN Access */}
                    <div className="bg-slate-50/70 border border-slate-200/80 rounded-xl p-3.5 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-400">6-Digit Quick PIN Access:</div>
                      <div className="flex items-center justify-between">
                        {displayPin ? (
                          <div className="font-mono text-sm font-black text-slate-900 tracking-wider">
                            •••••• ({displayPin})
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 italic">
                            ยังไม่ได้ตั้ง PIN (Not Set)
                          </div>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setPinValue(displayPin || "");
                            setPinModalOpen(true);
                          }}
                          className="h-6.5 px-3 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-full cursor-pointer shadow-2xs"
                        >
                          {displayPin ? "Change PIN" : "Set PIN"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: SAVED DELIVERY LOCATIONS */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-sky-600" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          Saved Delivery Locations ({displayAddresses.length})
                        </h3>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        ที่อยู่คอนโด / ที่พัก / ที่ทำงาน สำหรับการเข้ารับและจัดส่งผ้า
                      </p>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setAddressModalOpen(true)}
                      className="h-7 px-3.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-full gap-1 cursor-pointer shrink-0 shadow-2xs"
                    >
                      <Plus size={13} />
                      <span>+ Add New Address</span>
                    </Button>
                  </div>

                  {displayAddresses.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
                      {displayAddresses.map((addr) => (
                        <div
                          key={addr.id}
                          className={`rounded-2xl p-4 border flex flex-col justify-between space-y-2.5 transition-all shadow-2xs ${
                            addr.isPrimary
                              ? "bg-sky-50/20 border-sky-300"
                              : "bg-white border-slate-200/90"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-slate-900">{addr.label || "Address"}</span>
                              {addr.isPrimary && (
                                <span className="bg-sky-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-2xs">
                                  Primary
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {!addr.isPrimary && (
                                <button
                                  type="button"
                                  onClick={() => handleSetPrimaryAddress(addr.id)}
                                  className="text-xs font-bold text-sky-600 hover:text-sky-800 hover:underline cursor-pointer"
                                >
                                  Set Primary
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteAddress(addr.id)}
                                className="text-slate-300 hover:text-rose-500 transition-colors p-1 cursor-pointer"
                                title="Delete Address"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1 text-xs text-slate-600">
                            <p className="font-semibold text-slate-800 leading-snug">
                              {addr.placeName || addr.address}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Room: <strong className="text-slate-700 font-bold">{addr.roomNumber || "—"}</strong> • {addr.district || "Bangkok"}
                            </p>
                          </div>

                          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                            {addr.leaveWithJuristic ? (
                              <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                                <Check size={12} className="text-emerald-600" />
                                <span>Juristic Drop-Off Allowed</span>
                              </span>
                            ) : (
                              <span className="text-slate-500 font-medium text-[11px]">
                                Direct Handover Only
                              </span>
                            )}

                            {addr.googleMapsUrl && (
                              <a
                                href={addr.googleMapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sky-600 hover:text-sky-800 font-bold text-[11px] flex items-center gap-1 hover:underline"
                              >
                                <span>Google Maps</span>
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-center text-slate-400 text-xs font-semibold space-y-1.5">
                      <MapPin size={22} className="mx-auto text-slate-300" />
                      <div>ยังไม่มีที่อยู่ที่บันทึกไว้ในระบบ (No saved delivery addresses)</div>
                      <div className="text-[11px] text-slate-400 font-normal">กดปุ่ม "+ Add New Address" เพื่อเพิ่มที่อยู่ใหม่ให้ลูกค้า</div>
                    </div>
                  )}
                </div>

                {/* SECTION 4: COMPANY TAX INVOICE & RECEIPT DETAILS */}
                {customer.companyName || customer.taxId ? (
                  <div className="bg-amber-50/30 border border-amber-200/90 rounded-2xl p-5 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Receipt size={16} className="text-amber-700" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-amber-950">
                          Company Tax Invoice & Receipt Details (ใบกำกับภาษีเต็มรูปแบบ)
                        </h3>
                      </div>
                      <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-md shadow-2xs">
                        Tax Invoice Required
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="text-sm font-black text-slate-900">
                        {customer.companyName || "—"}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
                        <div>
                          <span className="text-slate-400">13-digit Tax ID: </span>
                          <strong className="font-mono text-slate-900 font-bold">{customer.taxId || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Branch: </span>
                          <strong className="text-slate-900 font-bold">Head Office (สำนักงานใหญ่)</strong>
                        </div>
                      </div>

                      <div className="pt-1 text-slate-600 border-t border-amber-200/60">
                        <span className="text-slate-400">Registered Billing Address: </span>
                        <span className="text-slate-800 font-medium">
                          {customer.defaultAddress && customer.defaultAddress !== "--" ? customer.defaultAddress : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-slate-500">
                      <Receipt size={16} className="text-slate-400" />
                      <span className="font-semibold text-slate-700">ข้อมูลใบกำกับภาษี (Company Tax Invoice):</span>
                      <span className="text-slate-400 italic">ยังไม่ได้ลงทะเบียน (Not Registered)</span>
                    </div>
                    {onEditCustomer && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          onOpenChange(false);
                          onEditCustomer(customer);
                        }}
                        className="text-xs text-sky-600 hover:text-sky-700 h-7"
                      >
                        + เพิ่มข้อมูลใบกำกับภาษี
                      </Button>
                    )}
                  </div>
                )}

                {/* SECTION 5: INTERNAL STAFF NOTES & SPECIAL INSTRUCTIONS */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2">
                    <Edit size={15} className="text-slate-600" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Internal Staff Notes & Special Instructions
                    </h3>
                  </div>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 text-xs text-slate-700 leading-relaxed font-medium">
                    {customer.remark && customer.remark.trim() ? (
                      customer.remark
                    ) : (
                      <span className="text-slate-400 italic">ไม่มีบันทึกคำสั่งพิเศษสำหรับลูกค้ารายนี้ (No internal staff notes)</span>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: TRANSACTIONS & ORDERS                                             */}
            {/* ========================================================================= */}
            {activeTab === "orders" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                {/* TOP METRICS SUMMARY CARD */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-slate-400">Total Orders:</div>
                      <div className="text-3xl font-black text-slate-900">
                        {customerJobs.length}
                      </div>
                    </div>

                    <div className="sm:pl-4 space-y-1 pt-3 sm:pt-0">
                      <div className="text-xs font-bold text-slate-400">Total Weight Processed:</div>
                      <div className="text-3xl font-black text-sky-600">
                        {totalWeightProcessed.toFixed(1)} KG
                      </div>
                    </div>

                    <div className="sm:pl-4 space-y-1 pt-3 sm:pt-0">
                      <div className="text-xs font-bold text-slate-400">Total Paid Revenue:</div>
                      <div className="text-3xl font-black text-emerald-600">
                        ฿{totalRevenue.toLocaleString()} THB
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sub-Switch: Orders List vs Wallet Ledger */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setOrdersSubTab("orders")}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        ordersSubTab === "orders"
                          ? "bg-white text-sky-700 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Orders & Fulfillment ({customerJobs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrdersSubTab("ledger")}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        ordersSubTab === "ledger"
                          ? "bg-white text-emerald-700 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Credit Wallet Ledger ({walletTxs.length || topUpTxs.length})
                    </button>
                  </div>

                  {ordersSubTab === "ledger" && (
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                      Current Credit: ฿{(customer.creditBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>

                {/* VIEW 1: ACTIVE CURRENT ORDERS & DELIVERED HISTORY */}
                {ordersSubTab === "orders" && (
                  <div className="space-y-6">
                    {/* SECTION: ACTIVE CURRENT ORDERS */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          Active Current Orders ({activeJobs.length})
                        </h3>
                      </div>

                      {activeJobs.length > 0 ? (
                        activeJobs.map(job => (
                          <div
                            key={job.id}
                            className="bg-white border border-sky-300 rounded-2xl p-4 shadow-2xs space-y-2.5"
                          >
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-black text-sky-900">
                                {job.billNo || `JOB-${job.id.slice(0, 7).toUpperCase()}`} • {job.serviceType?.replace(/_/g, ' ') || 'Laundry Service'}
                              </div>
                              <span className="bg-sky-600 text-white text-[11px] font-black px-3 py-0.5 rounded-full shadow-2xs">
                                {job.subStatus ? `IN ${job.subStatus.toUpperCase()}` : (job.status?.toUpperCase() || "IN PROGRESS")}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600">
                              <div>
                                <span className="text-slate-400">Est Weight: </span>
                                <strong className="text-slate-800">{job.weight ? `${job.weight} KG` : "—"}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Scale: </span>
                                <strong className="text-slate-800">{job.weight ? `${job.weight} KG` : "—"}</strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Amount: </span>
                                <strong className="text-slate-900 font-black">฿{(job.totalAmount || job.fee || 0).toLocaleString()} THB</strong>
                              </div>
                              <div>
                                <span className="text-slate-400">Tag: </span>
                                <strong className="text-sky-700 font-mono">{job.billNo || job.id.slice(0, 8).toUpperCase()}</strong>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                              <span>
                                Pickup: {job.pickupScheduledAt ? format(new Date(job.pickupScheduledAt), 'yyyy-MM-dd (HH:mm)') : format(new Date(job.createdAt), 'yyyy-MM-dd (HH:mm)')}
                              </span>
                              <span>
                                Location: {job.pickupLocation || customer.defaultAddress || "Bangkok"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-center text-slate-400 text-xs font-semibold">
                          ไม่มีออเดอร์ที่กำลังดำเนินการ (No active orders in progress)
                        </div>
                      )}
                    </div>

                    {/* SECTION: PAST DELIVERED ORDER HISTORY */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Clock size={15} className="text-slate-400" />
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          Past Delivered Order History ({pastJobs.length})
                        </h3>
                      </div>

                      {pastJobs.length > 0 ? (
                        <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                          <Table>
                            <TableHeader className="bg-slate-50">
                              <TableRow>
                                <TableHead className="text-xs font-bold">Date</TableHead>
                                <TableHead className="text-xs font-bold">Bill & Service</TableHead>
                                <TableHead className="text-xs font-bold">Weight</TableHead>
                                <TableHead className="text-right text-xs font-bold">Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {pastJobs.map(job => (
                                <TableRow key={job.id} className="hover:bg-slate-50 text-xs">
                                  <TableCell className="font-semibold text-slate-600">
                                    {format(new Date(job.createdAt), "dd MMM yyyy")}
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-bold text-slate-900">{job.billNo || job.id}</div>
                                    <div className="text-[11px] text-slate-400 capitalize">{job.serviceType?.replace(/_/g, ' ') || 'Laundry'}</div>
                                  </TableCell>
                                  <TableCell className="text-slate-700">
                                    {job.weight ? `${job.weight} KG` : "—"}
                                  </TableCell>
                                  <TableCell className="text-right font-black text-slate-900">
                                    ฿{(job.totalAmount || job.fee || 0).toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-center text-slate-400 text-xs font-semibold">
                          ยังไม่มีประวัติออเดอร์ที่จัดส่งสำเร็จ (No completed past orders recorded yet)
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* VIEW 2: WALLET & TOP-UP LEDGER */}
                {ordersSubTab === "ledger" && (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                    <div className="max-h-[320px] overflow-y-auto">
                      <Table>
                        <TableHeader className="bg-emerald-50/70 sticky top-0 z-10 shadow-2xs">
                          <TableRow>
                            <TableHead className="w-[120px] text-xs font-bold py-3 text-emerald-950 pl-4">Date & Time</TableHead>
                            <TableHead className="text-xs font-bold py-3 text-emerald-950">Type & Details</TableHead>
                            <TableHead className="text-xs font-bold py-3 text-emerald-950">Status</TableHead>
                            <TableHead className="text-right text-xs font-bold py-3 text-emerald-950">Amount (฿)</TableHead>
                            <TableHead className="text-right text-xs font-bold py-3 text-emerald-950">Balance</TableHead>
                            <TableHead className="text-right text-xs font-bold py-3 text-emerald-950 pr-4">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {isLoadingWallet || isLoadingTopUps ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center h-24 text-slate-400 text-xs font-semibold">
                                Loading wallet ledger...
                              </TableCell>
                            </TableRow>
                          ) : walletTxs.length > 0 ? (
                            walletTxs.map(tx => {
                              const isCredit = tx.direction === 'CREDIT';
                              return (
                                <TableRow key={tx.id} className="hover:bg-emerald-50/30 transition-colors border-b border-slate-100 text-xs">
                                  <TableCell className="text-[11px] font-bold text-slate-500 whitespace-nowrap pl-4 py-3">
                                    {format(new Date(tx.createdAt), 'dd/MM/yyyy HH:mm')}
                                  </TableCell>
                                  <TableCell className="py-3">
                                    <div className="flex flex-col gap-0.5">
                                      <span className="font-bold text-slate-800">{tx.type}</span>
                                      <span className="text-[10px] text-slate-400">{tx.packageName || tx.reason || "Wallet transaction"}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-3">
                                    <Badge className="bg-emerald-100 text-emerald-800 border-none text-[9px] font-bold">
                                      {tx.approvalStatus || "APPROVED"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className={`text-right font-black py-3 text-xs ${isCredit ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {isCredit ? '+' : '-'}฿{Number(tx.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-right text-[11px] font-mono font-bold text-slate-600 py-3 whitespace-nowrap">
                                    ฿{Number(tx.balanceAfter || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                                  </TableCell>
                                  <TableCell className="text-right pr-4 py-3">
                                    {tx.slipImageUrl && (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-[11px] font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1 rounded-lg cursor-pointer"
                                        onClick={() => {
                                          setPreviewSlipUrl(tx.slipImageUrl);
                                          setPreviewSlipTitle(`${customer.name} — Tx ${tx.id}`);
                                          setPreviewSlipModalOpen(true);
                                        }}
                                      >
                                        <ImageIcon size={12} />
                                        Slip
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          ) : (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center h-24 text-slate-400 text-xs font-semibold">
                                ไม่มีประวัติธุรกรรมกระเป๋าเงิน (No wallet transactions recorded yet)
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: REPORTED ISSUES & TICKETS                                         */}
            {/* ========================================================================= */}
            {activeTab === "tickets" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                
                {/* Header row with + Log New Issue button */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="text-orange-500" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Reported Incident & Special Request History ({tickets.length})
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      ประวัติการแจ้งปัญหา คำขอพิเศษสำหรับผ้า และข้อร้องเรียนของลูกค้ารายนี้
                    </p>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setTicketModalOpen(true)}
                    className="h-7 px-3.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-full gap-1 cursor-pointer shrink-0 shadow-2xs"
                  >
                    <Plus size={13} />
                    <span>+ Log New Issue / Ticket</span>
                  </Button>
                </div>

                {/* Ticket Cards List */}
                {tickets.length > 0 ? (
                  <div className="space-y-4">
                    {tickets.map(ticket => (
                      <div
                        key={ticket.id}
                        className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs space-y-3.5"
                      >
                        {/* Top Row: INC-101 • Title • Category • Urgency • Status */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                              {ticket.id}
                            </span>
                            <span className="text-sm font-black text-slate-900">
                              {ticket.title}
                            </span>
                            <span className="bg-sky-50 text-sky-700 border border-sky-200/80 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                              {ticket.category}
                            </span>
                            <span className="bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                              {ticket.urgency}
                            </span>
                          </div>

                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-300 text-xs font-black px-2.5 py-0.5 rounded-full shadow-2xs">
                            {ticket.status}
                          </span>
                        </div>

                        {/* Affected Item Pill */}
                        {ticket.affectedItem && (
                          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 px-3.5 py-1.5 rounded-xl text-xs text-slate-600">
                            <Tag size={13} className="text-sky-500" />
                            <span>Affected Item / Garment:</span>
                            <strong className="text-slate-900 font-bold">{ticket.affectedItem}</strong>
                          </div>
                        )}

                        {/* Customer Message Quote Box */}
                        <div className="bg-slate-50/70 border border-slate-200/70 rounded-xl p-3.5 space-y-1 text-xs">
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Customer Message / Detail:
                          </div>
                          <p className="text-slate-800 font-medium italic leading-relaxed">
                            "{ticket.customerMessage}"
                          </p>
                        </div>

                        {/* Staff Online Response Box */}
                        <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-xl p-3.5 space-y-1 text-xs">
                          <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                            Staff Online Response:
                          </div>
                          <p className="text-emerald-950 font-semibold leading-relaxed">
                            "{ticket.staffResponse}"
                          </p>
                        </div>

                        {/* Footer: Channel & Logged Timestamp */}
                        <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100">
                          <span>Channel: <strong className="text-slate-600 font-bold">{ticket.channel}</strong></span>
                          <span>Logged: <strong className="text-slate-600 font-medium">{ticket.loggedAt}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-8 text-center text-slate-400 text-xs font-semibold space-y-2">
                    <AlertCircle size={28} className="mx-auto text-slate-300" />
                    <div>ยังไม่มีประวัติการแจ้งปัญหาหรือคำขอพิเศษ (No reported incidents or tickets)</div>
                    <div className="text-[11px] text-slate-400 font-normal">กดปุ่ม "+ Log New Issue / Ticket" เพื่อบันทึกคำขอหรือปัญหาใหม่</div>
                  </div>
                )}

              </div>
            )}

          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* DIALOG 1: CHANGE 6-DIGIT PIN                                             */}
      {/* ========================================================================= */}
      {pinModalOpen && (
        <Dialog open={pinModalOpen} onOpenChange={setPinModalOpen}>
          <DialogContent className="sm:max-w-md p-6 bg-white rounded-2xl z-[1100]">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Shield size={18} className="text-slate-700" />
                Change 6-Digit Quick PIN
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Set a 6-digit PIN for {customer.name} to quickly log in and authorize store visits.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSavePin} className="space-y-4 pt-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">New 6-Digit PIN</label>
                <input
                  type="text"
                  maxLength={6}
                  value={pinValue}
                  onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 123456"
                  className="w-full text-center tracking-widest font-mono text-xl font-black py-2.5 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPinModalOpen(false)}
                  className="rounded-xl font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isUpdatingPin || pinValue.length < 4}
                  className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs px-4"
                >
                  {isUpdatingPin ? "Saving..." : "Save PIN"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* DIALOG 2: SIMULATE OTP VERIFICATION                                      */}
      {/* ========================================================================= */}
      {otpModalOpen && (
        <Dialog open={otpModalOpen} onOpenChange={setOtpModalOpen}>
          <DialogContent className="sm:max-w-md p-6 bg-white rounded-2xl z-[1100]">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Smartphone size={18} className="text-sky-600" />
                Simulate OTP Verification
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Verify mobile ownership via SMS or WhatsApp OTP token.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-3 text-xs">
              <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-3.5 space-y-1">
                <div className="font-bold text-sky-900">OTP Code: 489210</div>
                <div className="text-slate-600">
                  Target: {customer.phone} ({customer.isWhatsapp ? "WhatsApp Channel" : "SMS Channel"})
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOtpModalOpen(false)}
                  className="rounded-xl font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isVerifyingOtp}
                  onClick={handleSimulateOtp}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs px-4"
                >
                  {isVerifyingOtp ? "Verifying..." : "Confirm & Mark Verified"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* DIALOG 3: ADD NEW DELIVERY ADDRESS                                       */}
      {/* ========================================================================= */}
      {addressModalOpen && (
        <Dialog open={addressModalOpen} onOpenChange={setAddressModalOpen}>
          <DialogContent className="sm:max-w-lg p-6 bg-white rounded-2xl z-[1100]">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                <MapPin size={18} className="text-sky-600" />
                Add New Delivery Location
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Add a Bangkok condo, residence, or workplace for {customer.name}.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleAddAddress} className="space-y-3 pt-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Label</label>
                  <input
                    type="text"
                    value={newAddrLabel}
                    onChange={(e) => setNewAddrLabel(e.target.value)}
                    placeholder="e.g. Home Condo, Office"
                    className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Room / Unit No.</label>
                  <input
                    type="text"
                    value={newAddrRoom}
                    onChange={(e) => setNewAddrRoom(e.target.value)}
                    placeholder="e.g. Room 1804"
                    className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Building / Condo Name</label>
                <input
                  type="text"
                  value={newAddrPlace}
                  onChange={(e) => setNewAddrPlace(e.target.value)}
                  placeholder="e.g. Condo Name / Place"
                  className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Full Street Address</label>
                <textarea
                  value={newAddrFull}
                  onChange={(e) => setNewAddrFull(e.target.value)}
                  placeholder="e.g. 123 Sukhumvit Rd, Khlong Tan, Watthana, Bangkok"
                  rows={2}
                  className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">District / Area</label>
                  <input
                    type="text"
                    value={newAddrDistrict}
                    onChange={(e) => setNewAddrDistrict(e.target.value)}
                    placeholder="e.g. Watthana"
                    className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Google Maps Link</label>
                  <input
                    type="url"
                    value={newAddrMaps}
                    onChange={(e) => setNewAddrMaps(e.target.value)}
                    placeholder="https://maps.google.com/..."
                    className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={newAddrJuristic}
                    onChange={(e) => setNewAddrJuristic(e.target.checked)}
                    className="rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span>Allow Juristic Drop-Off</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={newAddrPrimary}
                    onChange={(e) => setNewAddrPrimary(e.target.checked)}
                    className="rounded text-sky-600 focus:ring-sky-500"
                  />
                  <span>Set as Primary Location</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddressModalOpen(false)}
                  className="rounded-xl font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSavingAddr}
                  className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs px-4"
                >
                  {isSavingAddr ? "Saving..." : "Save Address"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* ========================================================================= */}
      {/* DIALOG 4: LOG NEW SUPPORT ISSUE / TICKET                                  */}
      {/* ========================================================================= */}
      {ticketModalOpen && (
        <Dialog open={ticketModalOpen} onOpenChange={setTicketModalOpen}>
          <DialogContent className="sm:max-w-lg p-6 bg-white rounded-2xl z-[1100]">
            <DialogHeader>
              <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Plus size={18} className="text-sky-600" />
                Log New Issue / Ticket
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Log a special laundry request, garment care note, or support incident for {customer.name}.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveTicket} className="space-y-3 pt-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Ticket Summary / Title</label>
                <input
                  type="text"
                  value={newTicketTitle}
                  onChange={(e) => setNewTicketTitle(e.target.value)}
                  placeholder="e.g. Special instruction: Extra starch on shirt"
                  className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Category</label>
                  <select
                    value={newTicketCat}
                    onChange={(e) => setNewTicketCat(e.target.value)}
                    className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                  >
                    <option value="Special Laundry Request">Special Laundry Request</option>
                    <option value="Garment Care & Stains">Garment Care & Stains</option>
                    <option value="Pickup / Delivery Issue">Pickup / Delivery Issue</option>
                    <option value="Billing & Tax Invoice">Billing & Tax Invoice</option>
                    <option value="General Inquiry">General Inquiry</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Urgency</label>
                  <select
                    value={newTicketUrgency}
                    onChange={(e) => setNewTicketUrgency(e.target.value as any)}
                    className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                  >
                    <option value="NORMAL URGENCY">NORMAL URGENCY</option>
                    <option value="URGENT">URGENT</option>
                    <option value="LOW URGENCY">LOW URGENCY</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Affected Item / Garment</label>
                  <input
                    type="text"
                    value={newTicketItem}
                    onChange={(e) => setNewTicketItem(e.target.value)}
                    placeholder="e.g. Shirt, Silk dress, Jacket"
                    className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Status</label>
                  <select
                    value={newTicketStatus}
                    onChange={(e) => setNewTicketStatus(e.target.value as any)}
                    className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                  >
                    <option value="RESOLVED">RESOLVED</option>
                    <option value="IN PROGRESS">IN PROGRESS</option>
                    <option value="OPEN">OPEN</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Customer Message / Detail</label>
                <textarea
                  value={newTicketCustMsg}
                  onChange={(e) => setNewTicketCustMsg(e.target.value)}
                  placeholder="Enter the customer's request or message..."
                  rows={2}
                  className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Staff Online Response</label>
                <textarea
                  value={newTicketStaffResp}
                  onChange={(e) => setNewTicketStaffResp(e.target.value)}
                  placeholder="Enter staff response or resolution note..."
                  rows={2}
                  className="w-full py-2 px-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTicketModalOpen(false)}
                  className="rounded-xl font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs px-4"
                >
                  Log Ticket
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

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

      {/* Payment Slip Lightbox Modal */}
      {previewSlipModalOpen && (
        <div 
          className="fixed inset-0 z-[1200] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in-0 duration-200"
          onClick={() => setPreviewSlipModalOpen(false)}
        >
          <div 
            className="relative max-w-lg w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/80 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 bg-slate-900 border-b border-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0 pr-2">
                <ImageIcon size={18} className="text-emerald-400 shrink-0" />
                <h3 className="text-sm font-bold text-white truncate">
                  Payment Slip — {previewSlipTitle}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewSlipUrl && (
                  <a
                    href={previewSlipUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-300 hover:text-white flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors border border-slate-700"
                    title="Open Full Image"
                  >
                    <ExternalLink size={12} />
                    <span>Open Original</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewSlipModalOpen(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
            
            <div className="p-4 bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
              {previewSlipUrl ? (
                <img
                  src={previewSlipUrl}
                  alt="Payment Slip"
                  className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-lg border border-slate-800"
                />
              ) : (
                <div className="py-12 text-slate-500 text-xs">No slip image available</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
