"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/logo";
import { ProtectedRoute } from "@/components/protected-route";
import { useJobs } from "@/lib/use-jobs";
import { useCustomers } from "@/lib/use-customers";
import { jobStore, customerStore, calculateFee, shopStore, serviceStore, priceListStore, poiStore, settingsStore, walletApprovalStore, realtimeStore, getClosestShopIndex, type Job, type JobStatus, type LatLng, type ServiceType, type ServiceItem, type AdminNoteLog, type Customer, type CustomerCoupon, type WalletTransactionItem, shiftStore } from "@/lib/store";
import { refreshDb, ensureDbLoaded, startRealtimeConnection, api } from "@/lib/api";
import { getClosestShopByRoute } from "@/lib/map-api";
import { useSyncExternalStore } from "react";
import { FullMap, CreateJobMap } from "@/components/map-loader";
import type { MapMarker } from "@/components/map-component";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock as LockIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cleanProformaNumber, formatProformaNumber, generateProformaBaseNumber, generateReceiptNumber, safeCeil, roundGrandTotal, isWalletExpired, getWalletStatus, isJobFullyPaid, getJobPaymentBreakdown, isValidPhoneNumber, findMatchingCustomer, formatJobDisplayId, computeCartHash, resolveCustomerPhones, isThaiPhoneNumber, isPaidTodayOrYesterday, getJobPaymentDate, matchCustomerSearch, formatBaht, calculateRiderCommission, isRewashOrNoChargeJob, getRewashFromJobId, isNoRiderCommissionJob, isSplitDeliveryJob, isSplitDeliveryChildJob, getSplitDeliveryFromJobId, getJobPackingCounts, getJobProcessingBranchId, formatReceiptCustomerPhone } from "@/lib/utils";
import { getActivePaymentChannels, getPaymentChannels, mapChannelNameToMethod } from "@/lib/payment-channels";
import { OnlinePaymentDialog } from "@/components/online-payment-dialog";
import { AutoReceiptWorker } from "@/components/auto-receipt-worker";
import { isItemMatchingCategory, getCategoryLabel, getCategoryIcon, resolveEffectiveCategory } from "@/lib/promotions";


import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { LocationInput } from "@/components/location-input";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminAllJobs } from "@/components/admin-all-jobs";
import { AdminRiders } from "@/components/admin-riders";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { AdminLiveMap } from "@/components/map-loader";
import { AdminPOS } from "@/components/admin-pos";
import { AdminServiceMenu } from "@/components/admin-service-menu";
import { AdminCRM } from "@/components/admin-crm";
import { AdminCustomerDialog } from "@/components/admin-customer-dialog";
import { AdminCustomerProfileModal } from "@/components/admin-customer-profile-modal";
import { AdminCustomerVouchersDialog } from "@/components/admin-customer-vouchers-dialog";
import { AdminSettings } from "@/components/admin-settings";
import { AdminUsers } from "@/components/admin-users";
import { AdminDispatch } from "@/components/admin-dispatch";
import { AdminVerify } from "@/components/admin-verify";
import { AdminLogs } from "@/components/admin-logs";
import { AdminReports } from "@/components/admin-reports";
import { AdminMarketing } from "@/components/admin-marketing";
import { AdminTasks, prefetchTasksData } from "@/components/admin-tasks";
import { NotificationBell } from "@/components/notification-bell";
import { TopUpDialog } from "@/components/top-up-dialog";
import { RefundCorrectDialog } from "@/components/refund-correct-dialog";
import { SplitPaymentDialog, type SplitPaymentLine } from "@/components/split-payment-dialog";
import AdminFeeCalculator from "@/components/admin-fee-calculator";
import AdminPoiManager from "@/components/admin-poi-manager";

import { MultiImageUploader, type MultiImageUploaderRef } from "@/components/ui/multi-image-uploader";
import { addJobLogAction, unlockPaidJobAction, getCustomerCouponsAction, getCustomerJobsAction, splitJobDeliveryAction } from "@/actions/db";
import { createTaxInvoiceTaskForJobAction } from "@/actions/tasks";
import { useRiders } from "@/lib/use-riders";
import {
  Plus,
  MapPin,
  Navigation,
  Truck,
  Package,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,

  LayoutDashboard,
  ArrowLeft,
  Map,
  Users,
  User,
  Phone,
  Globe,
  Eye,
  ArrowDownUp,
  Store,
  ShieldCheck,
  X,
  CreditCard,
  Tag,
  Search, UserPlus,
  ShoppingCart,
  Zap,
  LogOut,
  Settings,
  CalendarClock,
  Calculator,
  BarChart3,
  Megaphone,
  ShieldAlert,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Database,
  ZoomIn,
  Camera,
  MessageSquare,
  Receipt,
  Droplets,
  Wind,
  Shirt,
  Edit,
  ClipboardList,
  ClipboardCheck,
  Paperclip,
  Maximize2,
  Trash2,
  Lock,
  Menu,
  Printer,
  Banknote,
  PackageOpen,
  ExternalLink,
  Wallet,
  Building,
  Save,
  FileText,
  RotateCcw,
  LockOpen,
  Sparkles,
  Check,
  Ticket,
  Split,
  Send,
  History,
  UserCheck,
  Copy,
  ChevronUp,
  ChevronDown,
  Columns,
} from "lucide-react";

import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";

const getCommissionRate = (settings: Record<string, string> | undefined | null) => {
  if (!settings) return 2;
  const val = parseFloat(settings.riderCommissionPerKm);
  return isNaN(val) ? 2 : val;
};

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50",
  },
  accepted: {
    label: "Accepted",
    className: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50",
  },
  pickup: {
    label: "Pickup",
    className: "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50",
  },
  delivery: {
    label: "Delivery",
    className: "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-50",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  },
  active: {
    label: "Active",
    className: "bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50",
  },
  picked_up: {
    label: "Picked Up",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
  },
};

const statusIcon: Record<string, React.ReactNode> = {
  pending: <Clock size={13} />,
  accepted: <Truck size={13} />,
  pickup: <Package size={13} />,
  delivery: <Navigation size={13} />,
  completed: <CheckCircle2 size={13} />,
  active: <Zap size={13} />,
  picked_up: <CheckCircle2 size={13} />,
  cancelled: <Clock size={13} />,
};

// Framer Motion variants
const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0, 0, 0.2, 1] as const } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2 } },
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.06 } },
};



const rowVariant = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.3, ease: [0, 0, 0.2, 1] as const } },
};

import { ThermalReceiptDialog, formatJobToReceiptData } from "@/components/thermal-receipt-dialog";
import { A5ReceiptDialog } from "@/components/a5-receipt-dialog";
export default function AdminPage() {
  return (
    <ProtectedRoute allowedRole="non-rider">
      <AdminPageContent />
    </ProtectedRoute>
  );
}

function AdminPageContent() {
  const { user, logout } = useAuth();
  const jobs = useJobs();
  const riders = useRiders();
  const customers = useCustomers();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const services = useSyncExternalStore(serviceStore.subscribe, serviceStore.getSnapshot, serviceStore.getSnapshot);
  const priceLists = useSyncExternalStore(priceListStore.subscribe, priceListStore.getSnapshot, priceListStore.getSnapshot);
  const pois = useSyncExternalStore(poiStore.subscribe, poiStore.getSnapshot, poiStore.getSnapshot);
  const systemSettings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot, settingsStore.getSnapshot);
  const realtimeState = useSyncExternalStore(realtimeStore.subscribe, realtimeStore.getSnapshot, realtimeStore.getSnapshot);
  const [liveConflictFields, setLiveConflictFields] = useState<string[]>([]);

  // Re-bind SSE stream when authenticated user identity changes
  useEffect(() => {
    if (user?.id) {
      ensureDbLoaded();
      startRealtimeConnection(false);
    }
  }, [user?.id]);

  // Surface any background job save errors / conflicts via toast
  useEffect(() => {
    const onJobSaveError = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (!detail) return;
      toast.error(`บันทึกออเดอร์ #${formatJobDisplayId(detail.jobId || '')} ไม่สำเร็จ: ${detail.error}`);
    };
    window.addEventListener('tls:job-save-error', onJobSaveError);
    return () => window.removeEventListener('tls:job-save-error', onJobSaveError);
  }, []);

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
  
  const washServices = useMemo(() => {
    const filtered = services.filter(s => s.name.toLowerCase().startsWith('wash'));
    return filtered.sort((a, b) => {
      const getRank = (name: string) => {
        const lower = name.toLowerCase();
        if (lower.includes('hanger')) return 3;
        if (lower.includes('iron')) return 2;
        if (lower.includes('fold')) return 1;
        return 4;
      };
      return getRank(a.name) - getRank(b.name);
    });
  }, [services]);

  const [activeTab, setActiveTab] = useState<"dashboard" | "jobs" | "dispatch" | "riders" | "map" | "pos" | "services" | "customers" | "settings" | "users" | "verify" | "calculator" | "pois" | "activity-logs" | "reports" | "marketing" | "tasks">("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showTopUpDialog, setShowTopUpDialog] = useState(false);
  const [topUpCustomer, setTopUpCustomer] = useState<Customer | null>(null);
  const [refundJob, setRefundJob] = useState<Job | null>(null);
  const pendingWalletMap = useSyncExternalStore(walletApprovalStore.subscribe, walletApprovalStore.getSnapshot, walletApprovalStore.getSnapshot);
  const canApproveWallet = Boolean(user?.permissions?.includes('approve-wallet') || user?.role === 'admin');
  const canRefund = Boolean(user?.permissions?.includes('refund-job') || user?.role === 'admin');

  useEffect(() => {
    walletApprovalStore.refreshPendingMap().catch(() => {});
  }, []);

  // Pre-warm tasks data in background after login/hydration to ensure 0ms instant tab opening
  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        prefetchTasksData({
          id: user.id,
          role: user.role,
          isDepartmentHead: user.isDepartmentHead,
          department: user.department,
        }).catch(() => {});
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [user?.id, user?.role, user?.department, user?.isDepartmentHead]);

  // Restore tab from URL hash/query param, or auto-navigate to first accessible tab for this user
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const tabParam = searchParams.get("tab");
    const hash = window.location.hash.replace('#', '').split('?')[0];
    const validTabs = ["dashboard", "jobs", "dispatch", "riders", "map", "pos", "services", "customers", "settings", "users", "verify", "calculator", "pois", "activity-logs", "reports", "marketing", "tasks"];
    const targetTab = (tabParam && validTabs.includes(tabParam)) ? tabParam : hash;

    if (validTabs.includes(targetTab)) {
      // Honour explicit URL hash or query param (e.g. bookmarks / direct links / redirects)
      setActiveTab(targetTab as any);

      if (searchParams.get("create") === "true") {
        setDialogOpen(true);
        // Clean up query parameters in URL without reloading
        window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      }
      return;
    }

    if (!user) return;

    // Admin sees dashboard by default
    if (user.role === 'admin') {
      setActiveTab('dashboard');
      return;
    }

    // For all other roles: jump to the first tab they have access to (default is dashboard)
    const tabOrder: Array<"dashboard" | "jobs" | "dispatch" | "riders" | "map" | "pos" | "services" | "customers" | "settings" | "users" | "verify" | "calculator" | "pois" | "activity-logs" | "reports" | "marketing" | "tasks"> = [
      "dashboard", "jobs", "dispatch", "pos", "customers", "services", "map", "riders", "calculator", "tasks", "reports", "marketing", "settings", "users", "activity-logs"
    ];
    const hasPermission = (key: string) => {
      if (user.role === 'admin') return true;
      if (key === 'dashboard' || key === 'tasks' || key === 'calculator' || key === 'pois') return true;
      return user.permissions?.includes(key) ?? false;
    };
    const firstTab = tabOrder.find(tab => hasPermission(tab));
    if (firstTab) setActiveTab(firstTab);
  }, [user]);

  // Real-time SSE handles live order updates in <1s.
  // Only poll /api/db when viewing Live Rider GPS Map (15s), and run a lightweight delta + version check every 30s.
  useEffect(() => {
    let tickCount = 0;
    const intervalMs = activeTab === "map" ? 15000 : 30000;

    const interval = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      tickCount++;

      // Check server build version every ~60s
      if (tickCount % 2 === 0) {
        fetch('/api/version', { cache: 'no-store' })
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data?.buildTime && clientBuildTime && data.buildTime !== clientBuildTime) {
              setIsVersionOutdated(true);
              if (!dialogOpenRef.current && !isSubmittingRef.current) {
                Promise.resolve(logout()).finally(() => { window.location.replace('/login?reason=new_deploy'); });
              }
            }
          })
          .catch(() => {});
      }

      if (activeTab === "map") {
        refreshDb();
      } else {
        api.reconcileDelta().catch(() => {});
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [activeTab]);

  const handleTabChange = (tab: "dashboard" | "jobs" | "dispatch" | "riders" | "map" | "pos" | "services" | "customers" | "settings" | "users" | "verify" | "calculator" | "pois" | "activity-logs" | "reports" | "marketing" | "tasks") => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };
  const [laundryPrice, setLaundryPrice] = useState(0);
  const [dialogDiscountPercent, setDialogDiscountPercent] = useState<number>(0);
  const [showDialogDiscount, setShowDialogDiscount] = useState<boolean>(false);
  const [dialogVatType, setDialogVatType] = useState<"none" | "inclusive" | "exclusive">("none");
  const [dialogVatRate, setDialogVatRate] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState("unpaid");
  const [shopPaymentMethod, setShopPaymentMethod] = useState("unpaid");
  const [paymentChannel, setPaymentChannel] = useState("");
  const [showSplitPaymentDialog, setShowSplitPaymentDialog] = useState(false);
  const [splitPayments, setSplitPayments] = useState<SplitPaymentLine[]>([]);
  const [cashPlaced, setCashPlaced] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [onlinePaymentJob, setOnlinePaymentJob] = useState<Job | null>(null);
  const [isStartingBeamPayment, setIsStartingBeamPayment] = useState(false);
  const [isVersionOutdated, setIsVersionOutdated] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const clientBuildTime = process.env.NEXT_PUBLIC_BUILD_TIME;
  const dialogOpenRef = useRef(dialogOpen);
  dialogOpenRef.current = dialogOpen;
  const editingJobIdRef = useRef(editingJobId);
  editingJobIdRef.current = editingJobId;
  const activeJob = editingJobId ? jobs.find(j => j.id === editingJobId) : null;
  const [showJobLogs, setShowJobLogs] = useState(false);
  const [modalLayoutCols, setModalLayoutCols] = useState<"4" | "2">("4");
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [editingSubStatus, setEditingSubStatus] = useState<"billing" | "wash" | "dry" | "iron" | "ready" | null>(null);
  const [laundryTypes, setLaundryTypes] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedVIPLabel, setSelectedVIPLabel] = useState("");
  const [selectedMemberLabel, setSelectedMemberLabel] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [customerPriceListId, setCustomerPriceListId] = useState<string | null>(null);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return [];
    return customers.filter(c => matchCustomerSearch(c, customerSearchQuery));
  }, [customerSearchQuery, customers]);
  
  const [pickupLoc, setPickupLoc] = useState("");
  const [pickupCoords, setPickupCoords] = useState<LatLng | null>(null);
  const [pickupRoom, setPickupRoom] = useState("");
  const [deliveryLoc, setDeliveryLoc] = useState("");
  const [deliveryCoords, setDeliveryCoords] = useState<LatLng | null>(null);
  const [deliveryRoom, setDeliveryRoom] = useState("");

  const [profileOpen, setProfileOpen] = useState(false);
  const [customerVouchersModalOpen, setCustomerVouchersModalOpen] = useState(false);
  const [selectedProfileCustomer, setSelectedProfileCustomer] = useState<Customer | null>(null);
  const [dialogAvailableCoupons, setDialogAvailableCoupons] = useState<CustomerCoupon[]>([]);
  const [loadingDialogCoupons, setLoadingDialogCoupons] = useState(false);

  // Fetch active customer coupons when selectedProfileCustomer changes (only when dialog or voucher modal is open)
  useEffect(() => {
    if (!dialogOpen && !customerVouchersModalOpen) return;
    if (!selectedProfileCustomer?.id) {
      setDialogAvailableCoupons([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      setLoadingDialogCoupons(true);
      getCustomerCouponsAction({ customerId: selectedProfileCustomer.id, status: "ACTIVE" })
        .then((res) => {
          if (active && res.success && res.coupons) {
            setDialogAvailableCoupons(res.coupons as unknown as CustomerCoupon[]);
          }
        })
        .catch((err) => {
          console.error("[AdminPage] Failed to fetch customer coupons:", err);
          if (active) setDialogAvailableCoupons([]);
        })
        .finally(() => {
          if (active) setLoadingDialogCoupons(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selectedProfileCustomer?.id, dialogOpen, customerVouchersModalOpen]);

  // Customer Past Transactions State
  const [dbCustomerJobs, setDbCustomerJobs] = useState<any[]>([]);
  const [isLoadingCustomerJobs, setIsLoadingCustomerJobs] = useState(false);
  const [pastJobIndex, setPastJobIndex] = useState(0);
  const [expandedPastJobIds, setExpandedPastJobIds] = useState<Record<string, boolean>>({});

  // Fetch full customer jobs on-demand from DB when customer changes or modal opens (debounced to avoid blocking Server Action queue)
  useEffect(() => {
    if (!dialogOpen) return;
    const custId = selectedProfileCustomer?.id;
    const custPhone = customerPhone || selectedProfileCustomer?.phone;
    const cleanPhone = (custPhone || "").replace(/\D/g, "");
    if (!custId && cleanPhone.length < 8) {
      setDbCustomerJobs([]);
      setPastJobIndex(0);
      return;
    }

    let isCancelled = false;
    const timer = setTimeout(() => {
      if (isCancelled) return;
      setIsLoadingCustomerJobs(true);
      getCustomerJobsAction(custId || "", custPhone)
        .then((resJobs) => {
          if (!isCancelled && Array.isArray(resJobs)) {
            setDbCustomerJobs(resJobs);
          }
        })
        .catch((err) => {
          console.error("[AdminModal] Failed to fetch customer past jobs:", err);
        })
        .finally(() => {
          if (!isCancelled) setIsLoadingCustomerJobs(false);
        });
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [selectedProfileCustomer?.id, selectedProfileCustomer?.phone, customerPhone, dialogOpen]);

  useEffect(() => {
    setPastJobIndex(0);
    setExpandedPastJobIds({});
  }, [selectedProfileCustomer?.id, editingJobId]);
  
  // Auto-sync selectedProfileCustomer with latest customerStore state when credit balance or member status changes
  useEffect(() => {
    if (selectedProfileCustomer && customers.length > 0) {
      const fresh = customers.find(c => {
        if (selectedProfileCustomer.id) return c.id === selectedProfileCustomer.id;
        if (isValidPhoneNumber(selectedProfileCustomer.phone)) return c.phone === selectedProfileCustomer.phone;
        return false;
      });
      if (fresh) {
        if (
          fresh.creditBalance !== selectedProfileCustomer.creditBalance ||
          fresh.isMember !== selectedProfileCustomer.isMember ||
          fresh.isVIP !== selectedProfileCustomer.isVIP ||
          fresh.name !== selectedProfileCustomer.name ||
          fresh.memberId !== selectedProfileCustomer.memberId
        ) {
          setSelectedProfileCustomer(fresh);
        }
      }
    }
  }, [customers, selectedProfileCustomer]);

  const [isPickup, setIsPickup] = useState(true);
  const [isDelivery, setIsDelivery] = useState(true);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [differentDeliveryAddress, setDifferentDeliveryAddress] = useState(false);
  const [isDeliveryDirty, setIsDeliveryDirty] = useState(false); // Track if user manually changed delivery
  const [isStuck, setIsStuck] = useState(false);

  const [pickupDist, setPickupDist] = useState(0);
  const [deliveryDist, setDeliveryDist] = useState(0);

  const initialUserBranchIdx = user?.branchId ? shopLocations.findIndex(s => s.id === user.branchId) : -1;
  const [selectedStoreIndex, setSelectedStoreIndex] = useState(initialUserBranchIdx >= 0 ? initialUserBranchIdx : 0);

  const hasInitializedBranchRef = useRef(false);
  useEffect(() => {
    if (user && !hasInitializedBranchRef.current && shopLocations.length > 0) {
      const idx = user.branchId ? shopLocations.findIndex(s => s.id === user.branchId) : -1;
      if (idx >= 0) {
        setSelectedStoreIndex(idx);
      }
      hasInitializedBranchRef.current = true;
    }
  }, [user, shopLocations]);

  const isRealCustomerCoords = (coords: LatLng | null | undefined, addr?: string | null) => {
    const t = (addr || "").trim();
    if (t === "--" || t === "-") return false;
    if (!coords || !coords.lat || !coords.lng) return false;
    if (Math.abs(Number(coords.lat) - 13.736717) < 0.00001 && Math.abs(Number(coords.lng) - 100.523186) < 0.00001) return false;
    return true;
  };

  const updateClosestStoreAsync = async (coords: LatLng | null | undefined, address?: string) => {
    if (!isRealCustomerCoords(coords, address) || !coords) return;
    try {
      const closestId = await getClosestShopByRoute(coords, shopLocations, address);
      if (closestId) {
        const idx = shopLocations.findIndex(s => s.id === closestId);
        if (idx >= 0) {
          setSelectedStoreIndex(idx);
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to get closest route, fallback to index");
    }
    setSelectedStoreIndex(getClosestShopIndex(coords, shopLocations));
  };
  const [serviceType, setServiceType] = useState<string>("");
  const roundToNearest30 = (date: Date) => {
    const ms = 1000 * 60 * 30;
    const rounded = new Date(Math.round(date.getTime() / ms) * ms);
    let hours = rounded.getHours();
    if (hours < 10) {
      rounded.setHours(10, 0, 0, 0);
    } else if (hours > 19 || (hours === 19 && rounded.getMinutes() > 0)) {
      rounded.setHours(19, 0, 0, 0);
    }
    return rounded;
  };

  const [pickupScheduledTime, setPickupScheduledTime] = useState(format(roundToNearest30(new Date()), "yyyy-MM-dd'T'HH:mm"));
  const [deliveryScheduledTime, setDeliveryScheduledTime] = useState(format(roundToNearest30(new Date(Date.now() + 86400000)), "yyyy-MM-dd'T'HH:mm"));
  const [pickupRiderId, setPickupRiderId] = useState("");
  const [deliveryRiderId, setDeliveryRiderId] = useState("");
  const [bagImageUrls, setBagImageUrls] = useState<string[]>([]);
  const [billImageUrls, setBillImageUrls] = useState<string[]>([]);
  const [pickupProofImageUrls, setPickupProofImageUrls] = useState<string[]>([]);
  const [deliveryProofImageUrls, setDeliveryProofImageUrls] = useState<string[]>([]);
  const [origBagImageUrls, setOrigBagImageUrls] = useState<string[]>([]);
  const [origBillImageUrls, setOrigBillImageUrls] = useState<string[]>([]);
  const [origPickupProofImageUrls, setOrigPickupProofImageUrls] = useState<string[]>([]);
  const [origDeliveryProofImageUrls, setOrigDeliveryProofImageUrls] = useState<string[]>([]);
  const [isFreeDelivery, setIsFreeDelivery] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [showAdminNote, setShowAdminNote] = useState(false);
  const [adminLogs, setAdminLogs] = useState<AdminNoteLog[]>([]);
  const [adminNoteInput, setAdminNoteInput] = useState("");
  const [showNoteUploader, setShowNoteUploader] = useState(false);
  const [isUploadingNote, setIsUploadingNote] = useState(false);
  const noteUploaderRef = useRef<MultiImageUploaderRef>(null);
  const [noteLogsModalOpen, setNoteLogsModalOpen] = useState(false);
  const [previewAdminNoteImage, setPreviewAdminNoteImage] = useState<string | null>(null);

  const adminLogsEndRef = useRef<HTMLDivElement>(null);
  const expandedLogsEndRef = useRef<HTMLDivElement>(null);
  const expandedNoteInputRef = useRef<HTMLInputElement>(null);

  // Focus the input cursor when the expanded notes dialog opens
  useEffect(() => {
    if (noteLogsModalOpen) {
      const timer = setTimeout(() => {
        expandedNoteInputRef.current?.focus();
      }, 150); // Wait for modal transition to settle
      return () => clearTimeout(timer);
    }
  }, [noteLogsModalOpen]);

  // Scroll admin notes list to the bottom
  useEffect(() => {
    if (dialogOpen) {
      const timer = setTimeout(() => {
        if (adminLogsEndRef.current) {
          adminLogsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
      }, 150); // Wait for drawer/modal animation to settle
      return () => clearTimeout(timer);
    }
  }, [dialogOpen, adminLogs]);

  // Scroll the expanded dialog list when it opens or logs change
  useEffect(() => {
    if (noteLogsModalOpen) {
      const timer = setTimeout(() => {
        if (expandedLogsEndRef.current) {
          expandedLogsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
      }, 150); // Wait for dialog animation to settle
      return () => clearTimeout(timer);
    }
  }, [noteLogsModalOpen, adminLogs]);

  const prevJobIdForNotesRef = useRef<string | null>(null);

  // Sync adminLogs and non-conflicting fields with real-time updates in the background without disrupting unsaved edits
  useEffect(() => {
    if (!editingJobId) {
      if (prevJobIdForNotesRef.current !== null) {
        prevJobIdForNotesRef.current = null;
        setAdminLogs(prev => prev.length > 0 ? [] : prev);
        setAdminNoteInput(prev => prev ? "" : prev);
        setLiveConflictFields(prev => prev.length > 0 ? [] : prev);
      }
      return;
    }

    const freshJob = jobs.find(j => j.id === editingJobId);
    if (!freshJob) return;

    let freshNotes: AdminNoteLog[] = [];
    try {
      if (freshJob.adminNotesJson) {
        const parsed = JSON.parse(freshJob.adminNotesJson);
        if (Array.isArray(parsed)) {
          freshNotes = parsed;
        } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.notes)) {
          freshNotes = parsed.notes;
        }
      }
    } catch {}

    // When switching to a different job, ALWAYS load fresh notes from the target job and clear input
    if (prevJobIdForNotesRef.current !== editingJobId) {
      prevJobIdForNotesRef.current = editingJobId;
      setAdminLogs(freshNotes.map((log: any) => ({ ...log, isNew: false })));
      setAdminNoteInput("");
      setLiveConflictFields([]);
      return;
    }

    // While on the SAME job: Check if there is a pending local note that hasn't synced to server yet
    setAdminLogs(currentLogs => {
      const hasPendingLocalNote = Array.isArray(currentLogs) && currentLogs.length > 0 &&
        currentLogs[currentLogs.length - 1].userId === (user?.id || "unknown") &&
        !freshNotes.some(fn => fn.id === currentLogs[currentLogs.length - 1].id);

      if (!hasPendingLocalNote || freshNotes.length > (Array.isArray(currentLogs) ? currentLogs.length : 0)) {
        if (JSON.stringify(freshNotes) !== JSON.stringify(currentLogs)) {
          return freshNotes;
        }
      }
      return currentLogs;
    });
  }, [jobs, editingJobId, user?.id]);




  const isSendingNoteRef = useRef(false);

  const handleAddAdminLog = async (text: string, isSystem = false, imageUrls?: string[]) => {
    const trimmedText = text.trim();
    if (!trimmedText && (!imageUrls || imageUrls.length === 0)) return;
    const newLog: AdminNoteLog = {
      id: Math.random().toString(36).substring(7),
      userId: isSystem ? "system" : (user?.id || "unknown"),
      userName: isSystem ? "System (CRM)" : ((user as any)?.name || user?.email || "Admin"),
      text: trimmedText,
      imageUrls: imageUrls || [],
      timestamp: new Date().toISOString(),
      isNew: !isSystem
    };
    
    // Add locally for instant UI update (deduplicating if an identical note was just added within 10s)
    setAdminLogs(prev => {
      const nowMs = Date.now();
      const isDuplicate = prev.some(
        (existing) =>
          existing.text === trimmedText &&
          existing.userId === newLog.userId &&
          JSON.stringify(existing.imageUrls || []) === JSON.stringify(newLog.imageUrls || []) &&
          Math.abs(nowMs - new Date(existing.timestamp || 0).getTime()) < 10000
      );
      return isDuplicate ? prev : [...prev, newLog];
    });
    setAdminNoteInput("");

    // Save instantly to DB if editing an existing job
    if (editingJobId) {
      try {
        const { isNew: _ignoreIsNew, ...cleanNewLog } = newLog as any;
        const updated = await addJobLogAction(editingJobId, cleanNewLog, user?.id, user?.name || user?.email);
        if (updated) {
          if (originalJobRef.current && originalJobRef.current.id === editingJobId) {
            (originalJobRef.current as any).adminNotesJson = updated.adminNotesJson;
            (originalJobRef.current as any).updatedAt = updated.updatedAt;
          }
          api.optimisticUpdate(editingJobId, {
            adminNotesJson: updated.adminNotesJson,
            updatedAt: updated.updatedAt,
          } as any);
          jobStore.notify();
        }
      } catch (err) {
        console.error("Failed to instantly save admin log:", err);
      }
    }
  };

  const handleDeleteAdminLog = async (logId: string) => {
    const filteredLogs = adminLogs.filter(log => log.id !== logId);
    setAdminLogs(filteredLogs);

    if (editingJobId) {
      try {
        const existingJob = jobs.find(j => j.id === editingJobId);
        let parsedObj: Record<string, any> | null = null;
        if (existingJob?.adminNotesJson) {
          try {
            const parsed = JSON.parse(existingJob.adminNotesJson);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              parsedObj = { ...parsed };
            }
          } catch {}
        }

        let updatedJson: string | undefined = undefined;
        if (parsedObj) {
          updatedJson = JSON.stringify({ ...parsedObj, notes: filteredLogs });
        } else if (filteredLogs.length > 0) {
          updatedJson = JSON.stringify(filteredLogs);
        }

        const updated = await jobStore.updateJobDetails(editingJobId, {
          adminNotesJson: updatedJson,
          actorId: user?.id,
          actorName: user?.name || user?.email,
          actorRole: user?.role
        });
        if (updated && originalJobRef.current && originalJobRef.current.id === editingJobId) {
          (originalJobRef.current as any).adminNotesJson = (updated as any).adminNotesJson ?? updatedJson;
          if ((updated as any).updatedAt) {
            (originalJobRef.current as any).updatedAt = (updated as any).updatedAt;
          }
        }
      } catch (err) {
        console.error("Failed to delete admin log:", err);
        toast.error("Failed to delete admin log");
      }
    }
  };


  const handleSendAdminLog = async () => {
    if (isSendingNoteRef.current) return;
    const hasPendingImages = noteUploaderRef.current && noteUploaderRef.current.getPendingFilesCount() > 0;
    const textToSend = adminNoteInput.trim();
    if (!textToSend && !hasPendingImages) return;

    isSendingNoteRef.current = true;
    setAdminNoteInput("");
    setIsUploadingNote(true);
    let uploadedUrls: string[] = [];
    try {
      if (noteUploaderRef.current && hasPendingImages) {
         uploadedUrls = await noteUploaderRef.current.startUpload();
      }
      await handleAddAdminLog(textToSend, false, uploadedUrls);
      setShowNoteUploader(false);
      if (noteUploaderRef.current) {
        noteUploaderRef.current.reset();
      }
    } catch (err) {
      console.error("Failed to upload note images:", err);
    } finally {
      isSendingNoteRef.current = false;
      setIsUploadingNote(false);
    }
  };
  const [isPickupLobby, setIsPickupLobby] = useState(false);
  const [isPickupMeet, setIsPickupMeet] = useState(false);
  const [isDeliveryLobby, setIsDeliveryLobby] = useState(false);
  const [isDeliveryMeet, setIsDeliveryMeet] = useState(false);
  const [hasHanger, setHasHanger] = useState(false);
  const [hangerCount, setHangerCount] = useState<number>(0);
  const [hasFolded, setHasFolded] = useState(false);
  const [foldedCount, setFoldedCount] = useState<number>(0);
  const [processingBranchId, setProcessingBranchId] = useState<string>("");
  const packingSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistProcessingBranchToDb = useCallback(
    async (nextProcBranchId: string) => {
      if (!editingJobId) return;
      try {
        const existingJob = jobs.find(j => j.id === editingJobId) || originalJobRef.current;
        const originBranchId = shopLocations[selectedStoreIndex]?.id || existingJob?.branchId || "";
        const effectiveId = nextProcBranchId && nextProcBranchId !== originBranchId ? nextProcBranchId : null;

        let parsedObj: Record<string, any> = { notes: adminLogs.map(({ isNew, ...rest }) => rest) };
        if (existingJob?.adminNotesJson) {
          try {
            const parsed = JSON.parse(existingJob.adminNotesJson);
            if (Array.isArray(parsed)) {
              parsedObj = { notes: parsed };
            } else if (parsed && typeof parsed === "object") {
              parsedObj = { ...parsed };
            }
          } catch {}
        }
        parsedObj.processingBranchId = effectiveId;
        const updatedJson = JSON.stringify(parsedObj);

        const updated = await jobStore.updateJobDetails(editingJobId, {
          adminNotesJson: updatedJson,
          actorId: user?.id,
          actorName: user?.name || user?.email,
          actorRole: user?.role,
        });
        if (originalJobRef.current && originalJobRef.current.id === editingJobId) {
          (originalJobRef.current as any).adminNotesJson = (updated as any)?.adminNotesJson ?? updatedJson;
          if ((updated as any)?.updatedAt) {
            (originalJobRef.current as any).updatedAt = (updated as any).updatedAt;
          }
        }
      } catch (err) {
        console.error("Failed to save processing branch:", err);
      }
    },
    [editingJobId, jobs, shopLocations, selectedStoreIndex, adminLogs, user]
  );

  const persistPackingCountsToDb = useCallback(
    (nextHasHanger: boolean, nextHanger: number, nextHasFolded: boolean, nextFolded: number) => {
      if (!editingJobId) return;
      if (packingSaveTimerRef.current) clearTimeout(packingSaveTimerRef.current);
      packingSaveTimerRef.current = setTimeout(async () => {
        try {
          const existingJob = jobs.find(j => j.id === editingJobId) || originalJobRef.current;
          let parsedObj: Record<string, any> = { notes: adminLogs.map(({ isNew, ...rest }) => rest) };
          if (existingJob?.adminNotesJson) {
            try {
              const parsed = JSON.parse(existingJob.adminNotesJson);
              if (Array.isArray(parsed)) {
                parsedObj = { notes: parsed };
              } else if (parsed && typeof parsed === "object") {
                parsedObj = { ...parsed };
              }
            } catch {}
          }
          parsedObj.hangerCount = nextHasHanger ? Math.max(0, Number(nextHanger) || 0) : 0;
          parsedObj.foldedCount = nextHasFolded ? Math.max(0, Number(nextFolded) || 0) : 0;
          const updatedJson = JSON.stringify(parsedObj);

          const updated = await jobStore.updateJobDetails(editingJobId, {
            adminNotesJson: updatedJson,
            actorId: user?.id,
            actorName: user?.name || user?.email,
            actorRole: user?.role,
          });
          if (originalJobRef.current && originalJobRef.current.id === editingJobId) {
            (originalJobRef.current as any).adminNotesJson = (updated as any)?.adminNotesJson ?? updatedJson;
            if ((updated as any)?.updatedAt) {
              (originalJobRef.current as any).updatedAt = (updated as any).updatedAt;
            }
          }
        } catch (err) {
          console.error("Failed to save packing counts:", err);
        }
      }, 450);
    },
    [editingJobId, jobs, adminLogs, user]
  );
  const [isRewashJob, setIsRewashJob] = useState(false);
  const [rewashFromJobId, setRewashFromJobId] = useState<string | null>(null);
  const [noRiderCommission, setNoRiderCommission] = useState(false);
  const [splitDeliveryModalOpen, setSplitDeliveryModalOpen] = useState(false);
  const [splitTargetJob, setSplitTargetJob] = useState<Job | null>(null);
  const [splitItemSelections, setSplitItemSelections] = useState<Record<string, number>>({});
  const [splitScheduledTime, setSplitScheduledTime] = useState("");
  const [splitRiderId, setSplitRiderId] = useState("");
  const [splitGiveCommission, setSplitGiveCommission] = useState(true);
  const [splitNotes, setSplitNotes] = useState("");
  const [isSplittingDelivery, setIsSplittingDelivery] = useState(false);
  const [customSplitItems, setCustomSplitItems] = useState<Array<{ id: string; name: string; quantity: number; unit: string }>>([]);
  const [newCustomName, setNewCustomName] = useState("");
  const [newCustomQty, setNewCustomQty] = useState(1);
  const [newCustomUnit, setNewCustomUnit] = useState("ชิ้น");
  const [showAddCustomRow, setShowAddCustomRow] = useState(false);
  const [serviceSpeed, setServiceSpeed] = useState<"standard" | "express_50" | "express_100">("standard");
  const [clothingItems, setClothingItems] = useState<Record<string, { selected: boolean; quantity: number }>>({
    polo: { selected: false, quantity: 1 },
    tshirt: { selected: false, quantity: 1 },
    pants: { selected: false, quantity: 1 },
    dress: { selected: false, quantity: 1 },
    bedsheet: { selected: false, quantity: 1 },
    other: { selected: false, quantity: 1 },
  });
  const [otherClothingName, setOtherClothingName] = useState("");
  const [otherClothingPrice, setOtherClothingPrice] = useState<number>(0);
  const [billNo, setBillNo] = useState("");
  const [isTaxInvoiceRequested, setIsTaxInvoiceRequested] = useState(false);
  const isOtherClothingSelected = Boolean(clothingItems?.other?.selected);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(isSubmitting);
  isSubmittingRef.current = isSubmitting;
  const isSubmittingLockRef = useRef(false);
  const draftJobRequestIdRef = useRef<string>("");

  const stripRoomSuffix = useCallback((loc: string) => {
    return (loc || "").replace(/(?:\s*\(Room\s*[^)]*\))+$/i, "").trim();
  }, []);

  // Persist in-flight job updates to sessionStorage so clicking Refresh during a slow save never loses edits
  const savePendingJobToSession = useCallback((jobId: string, payload: Record<string, any>) => {
    try {
      const raw = sessionStorage.getItem("tls_pending_job_saves");
      const map = raw ? JSON.parse(raw) : {};
      map[jobId] = { payload, timestamp: Date.now() };
      sessionStorage.setItem("tls_pending_job_saves", JSON.stringify(map));
    } catch {}
  }, []);

  const clearPendingJobFromSession = useCallback((jobId: string) => {
    try {
      const raw = sessionStorage.getItem("tls_pending_job_saves");
      if (!raw) return;
      const map = JSON.parse(raw);
      if (jobId in map) {
        delete map[jobId];
        sessionStorage.setItem("tls_pending_job_saves", JSON.stringify(map));
      }
    } catch {}
  }, []);

  // Replay any interrupted in-flight job saves on page reload
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("tls_pending_job_saves");
      if (!raw) return;
      const map = JSON.parse(raw);
      const now = Date.now();
      const entries = Object.entries(map || {});
      if (entries.length === 0) return;
      for (const [jobId, item] of entries as [string, any][]) {
        if (!item?.payload || now - (item.timestamp || 0) > 120000) {
          clearPendingJobFromSession(jobId);
          continue;
        }
        api.optimisticUpdate(jobId, item.payload);
        jobStore.notify();
        api.updateJob(jobId, item.payload)
          .then(() => {
            clearPendingJobFromSession(jobId);
            jobStore.notify();
          })
          .catch(() => {
            clearPendingJobFromSession(jobId);
          });
      }
    } catch {}
  }, [clearPendingJobFromSession]);

  // Warn user if they attempt to refresh while a save is actively in flight
  useEffect(() => {
    if (!isSubmitting) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSubmittingRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSubmitting]);

  const [serviceWeight, setServiceWeight] = useState(2);
  
  const getServicePrice = useCallback((service: ServiceItem, customer: Customer | null = selectedProfileCustomer, plId: string | null = customerPriceListId) => {
    const targetPlId = plId || customer?.priceListId;
    if (targetPlId) {
      const customPl = priceLists.find(pl => pl.id === targetPlId);
      if (customPl && (customPl.isCorporate || (customPl.customItems && customPl.customItems.length > 0)) && customPl.customItems) {
        const found = customPl.customItems.find(it => it.id === service.id || it.serviceId === service.id);
        if (found) return found.price;
      }
      if (customPl && customPl.servicePrices && customPl.servicePrices[service.id] !== undefined) {
        return customPl.servicePrices[service.id];
      }
    }
    if (customer?.isMember) {
      if (service.memberPrice !== undefined && service.memberPrice > 0 && service.category !== "PACKAGE") {
        return service.memberPrice;
      }
    }
    return service.price;
  }, [selectedProfileCustomer, customerPriceListId, priceLists]);

  const handleServiceOrSpeedChange = (newServiceId: string, newSpeed: "standard" | "express_50" | "express_100", newWeight: number, priceListId: string | null = customerPriceListId, customer: Customer | null = selectedProfileCustomer) => {
    setServiceType(newServiceId);
    setServiceSpeed(newSpeed);
    setServiceWeight(newWeight);

    if (!dialogCart || dialogCart.length === 0) {
      setLaundryPrice(0);
      return;
    }

    const targetPlId = priceListId || customer?.priceListId;
    const customPl = targetPlId ? priceLists.find(pl => pl.id === targetPlId) : null;
    const corpItem = customPl?.customItems?.find(it => it.id === newServiceId);
    const baseService: ServiceItem | undefined = corpItem ? {
      id: corpItem.id,
      name: corpItem.name,
      nameEn: corpItem.nameEn || corpItem.name,
      price: corpItem.price,
      memberPrice: corpItem.price,
      category: corpItem.category || "B2B",
      unit: corpItem.unit || "ชิ้น",
      isActive: true,
    } : services.find(s => s.id === newServiceId);
    let pricePerKg = baseService ? getServicePrice(baseService, customer, priceListId) : 110;

    if (newServiceId === "other") {
      if (serviceType !== "other") {
        setLaundryPrice(0);
      }
      return;
    }

    setLaundryPrice(safeCeil(pricePerKg * newWeight));

  };
  const [editingFeeLock, setEditingFeeLock] = useState<number | null>(null);
  const uploaderRef = useRef<MultiImageUploaderRef>(null);
  const billUploaderRef = useRef<MultiImageUploaderRef>(null);
  const pickupUploaderRef = useRef<MultiImageUploaderRef>(null);
  const deliveryUploaderRef = useRef<MultiImageUploaderRef>(null);
  const originalJobRef = useRef<Job | null>(null);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const hasAccess = (key: string) => {
    if (user?.role === 'admin') return true;
    if (key === 'dashboard' || key === 'tasks' || key === 'calculator' || key === 'pois') return true;
    return user?.permissions?.includes(key) ?? false;
  };

  const parseTime = (timeStr: string) => {
    if (timeStr.includes("T")) {
      return new Date(timeStr);
    }
    const [hours, minutes] = timeStr.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  // Fee calculation using the latest tuned formula (roundHalfUp)
  const roundHalfUp = (val: number) => Math.ceil(val * 2) / 2;
  
  const calculateTotalFee = () => {
    let total = 0;
    const ratePerKm = selectedVIPLabel ? 4 : 10;
    if (isPickup) {
      total += roundHalfUp(pickupDist * 2) * ratePerKm;
    }
    if (isDelivery) {
      total += roundHalfUp(deliveryDist) * ratePerKm;
    }
    return Math.max(isPickup || isDelivery ? 30 : 0, total);
  };



  const pendingCount = jobs.filter((j) => j.status === "pending").length;
  const completedCount = jobs.filter((j) => j.status === "completed").length;

  // Map markers from active jobs (non-completed)
  const mapMarkers: MapMarker[] = jobs
    .filter((j) => j.status !== "completed")
    .map((j) => ({
      id: j.id,
      label: j.id,
      pickup: j.pickupCoords,
      dropoff: j.dropoffCoords,
      pickupLabel: j.pickupLocation,
      dropoffLabel: j.dropoffLocation,
      status: j.status,
    }));


  const isPaidJob = editingJobId ? (() => {
    const j = jobs.find(job => job.id === editingJobId) || jobStore.getSnapshot().find(job => job.id === editingJobId);
    if (isRewashJob || isRewashOrNoChargeJob(j)) return false;
    return isJobFullyPaid(j);
  })() : false;
  const isPricingLocked = isPaidJob;
  const isCartLocked = isPaidJob;
  const isLogisticsLocked = isPaidJob;

  // --- POS/Cashier Shift Enhancements ---
  const [dialogCart, setDialogCart] = useState<any[]>([]);

  // Reconcile external server changes safely without overwriting unsaved user edits
  useEffect(() => {
    if (!editingJobId) return;
    const freshJob = jobs.find(j => j.id === editingJobId);
    if (!freshJob) return;
    const orig = originalJobRef.current as any;
    if (orig && orig.id === editingJobId && !isSubmittingRef.current) {
      const freshTime = freshJob.updatedAt ? new Date(freshJob.updatedAt).getTime() : 0;
      const origTime = orig.updatedAt ? new Date(orig.updatedAt).getTime() : 0;
      if (freshTime > origTime + 50) {
        const conflicts: string[] = [];

        // 1. Always adopt confirmed payment state from server (e.g. webhook or cashier payment)
        if (Boolean(freshJob.isPaid) !== Boolean(orig.isPaid) || Boolean(freshJob.isShopPaid) !== Boolean(orig.isShopPaid)) {
          const nowPaid = Boolean(freshJob.isPaid || freshJob.isShopPaid);
          setPaymentMethod(nowPaid ? "paid" : "unpaid");
          setShopPaymentMethod(freshJob.isShopPaid ? "paid" : "unpaid");
          if (freshJob.paymentChannel) setPaymentChannel(freshJob.paymentChannel);
          orig.isPaid = freshJob.isPaid;
          orig.isShopPaid = freshJob.isShopPaid;
          orig.paymentChannel = freshJob.paymentChannel;
          orig.adminNotesJson = freshJob.adminNotesJson;
        }

        // 2. Pickup Rider
        if ((freshJob.pickupRiderId || "") !== (orig.pickupRiderId || "")) {
          if ((pickupRiderId || "") === (orig.pickupRiderId || "")) {
            setPickupRiderId(freshJob.pickupRiderId || "");
            orig.pickupRiderId = freshJob.pickupRiderId;
          } else if ((pickupRiderId || "") !== (freshJob.pickupRiderId || "")) {
            conflicts.push("Pickup Rider");
          }
        }

        // 3. Delivery Rider
        if ((freshJob.deliveryRiderId || "") !== (orig.deliveryRiderId || "")) {
          if ((deliveryRiderId || "") === (orig.deliveryRiderId || "")) {
            setDeliveryRiderId(freshJob.deliveryRiderId || "");
            orig.deliveryRiderId = freshJob.deliveryRiderId;
          } else if ((deliveryRiderId || "") !== (freshJob.deliveryRiderId || "")) {
            conflicts.push("Delivery Rider");
          }
        }

        // 4. Bill No
        if ((freshJob.billNo || "") !== (orig.billNo || "")) {
          if ((billNo || "") === (orig.billNo || "")) {
            setBillNo(freshJob.billNo || "");
            orig.billNo = freshJob.billNo;
          } else if ((billNo || "") !== (freshJob.billNo || "")) {
            conflicts.push("Bill No.");
          }
        }

        // 5. SubStatus
        if ((freshJob.subStatus || null) !== (orig.subStatus || null)) {
          if ((editingSubStatus || null) === (orig.subStatus || null)) {
            setEditingSubStatus((freshJob.subStatus as any) || null);
            orig.subStatus = freshJob.subStatus;
          } else if ((editingSubStatus || null) !== (freshJob.subStatus || null)) {
            conflicts.push("Process Stage");
          }
        }

        // 6. Customer Phone
        if ((freshJob.customerPhone || "") !== (orig.customerPhone || "")) {
          if ((customerPhone || "") === (orig.customerPhone || "")) {
            setCustomerPhone(freshJob.customerPhone || "");
            orig.customerPhone = freshJob.customerPhone;
          } else if ((customerPhone || "") !== (freshJob.customerPhone || "")) {
            conflicts.push("Phone");
          }
        }

        // 7. Items / Cart
        if (JSON.stringify(freshJob.items || []) !== JSON.stringify(orig.items || [])) {
          const currentCartSimple = dialogCart.map(i => ({ name: i.name, quantity: i.quantity, price: i.price }));
          const origCartSimple = (orig.items || []).map((i: any) => ({ name: i.name, quantity: i.quantity, price: i.price }));
          if (JSON.stringify(currentCartSimple) !== JSON.stringify(origCartSimple)) {
            conflicts.push("Order Items");
          } else {
            orig.items = freshJob.items;
            orig.totalAmount = freshJob.totalAmount;
          }
        }

        // 8. Pickup & Delivery Scheduled Time
        const toSchedStr = (val: any) => {
          if (!val) return "";
          const d = new Date(val);
          if (isNaN(d.getTime())) return "";
          return format(roundToNearest30(d), "yyyy-MM-dd'T'HH:mm");
        };
        const freshPickupStr = toSchedStr(freshJob.pickupScheduledAt || freshJob.scheduledAt);
        const origPickupStr = toSchedStr(orig.pickupScheduledAt || orig.scheduledAt);
        if (freshPickupStr && freshPickupStr !== origPickupStr) {
          if (!pickupScheduledTime || pickupScheduledTime === origPickupStr) {
            setPickupScheduledTime(freshPickupStr);
            orig.pickupScheduledAt = freshJob.pickupScheduledAt;
            orig.pickupScheduledEndAt = freshJob.pickupScheduledEndAt;
            orig.scheduledAt = freshJob.scheduledAt;
          } else if (pickupScheduledTime !== freshPickupStr) {
            conflicts.push("Pickup Time");
          }
        }

        const freshDeliveryStr = toSchedStr(freshJob.deliveryScheduledAt);
        const origDeliveryStr = toSchedStr(orig.deliveryScheduledAt);
        if (freshDeliveryStr && freshDeliveryStr !== origDeliveryStr) {
          if (!deliveryScheduledTime || deliveryScheduledTime === origDeliveryStr) {
            setDeliveryScheduledTime(freshDeliveryStr);
            orig.deliveryScheduledAt = freshJob.deliveryScheduledAt;
            orig.deliveryScheduledEndAt = freshJob.deliveryScheduledEndAt;
          } else if (deliveryScheduledTime !== freshDeliveryStr) {
            conflicts.push("Delivery Time");
          }
        }

        // 9. Image Proofs (Bag, Bill, Pickup Proofs, Delivery Proofs)
        const parseSyncUrls = (raw: any): string[] => {
          if (!raw) return [];
          if (Array.isArray(raw)) return raw.filter(Boolean);
          if (typeof raw === "string") {
            try {
              const parsed = JSON.parse(raw);
              return Array.isArray(parsed) ? parsed.filter(Boolean) : [raw];
            } catch {
              return [raw];
            }
          }
          return [];
        };
        if (freshJob.bagImageUrl !== orig.bagImageUrl) {
          const freshArr = parseSyncUrls(freshJob.bagImageUrl);
          if (JSON.stringify(bagImageUrls) === JSON.stringify(origBagImageUrls)) {
            setBagImageUrls(freshArr);
            setOrigBagImageUrls(freshArr);
            orig.bagImageUrl = freshJob.bagImageUrl;
          }
        }
        if (freshJob.billImageUrl !== orig.billImageUrl) {
          const freshArr = parseSyncUrls(freshJob.billImageUrl);
          if (JSON.stringify(billImageUrls) === JSON.stringify(origBillImageUrls)) {
            setBillImageUrls(freshArr);
            setOrigBillImageUrls(freshArr);
            orig.billImageUrl = freshJob.billImageUrl;
          }
        }
        if (freshJob.pickupProofImageUrl !== orig.pickupProofImageUrl) {
          const freshArr = parseSyncUrls(freshJob.pickupProofImageUrl);
          if (JSON.stringify(pickupProofImageUrls) === JSON.stringify(origPickupProofImageUrls)) {
            setPickupProofImageUrls(freshArr);
            setOrigPickupProofImageUrls(freshArr);
            orig.pickupProofImageUrl = freshJob.pickupProofImageUrl;
          }
        }
        const freshDelivRaw = freshJob.deliveryProofImageUrl || freshJob.proofImageUrl;
        const origDelivRaw = orig.deliveryProofImageUrl || orig.proofImageUrl;
        if (freshDelivRaw !== origDelivRaw) {
          const freshArr = parseSyncUrls(freshDelivRaw);
          if (JSON.stringify(deliveryProofImageUrls) === JSON.stringify(origDeliveryProofImageUrls)) {
            setDeliveryProofImageUrls(freshArr);
            setOrigDeliveryProofImageUrls(freshArr);
            orig.deliveryProofImageUrl = freshJob.deliveryProofImageUrl;
            orig.proofImageUrl = freshJob.proofImageUrl;
          }
        }

        // Always keep background status, adminNotesJson, and proforma metadata in sync on orig
        orig.status = freshJob.status;
        orig.completedAt = freshJob.completedAt;
        if (freshJob.adminNotesJson) orig.adminNotesJson = freshJob.adminNotesJson;
        if ((freshJob as any).proformaNumber !== undefined) orig.proformaNumber = (freshJob as any).proformaNumber;
        if ((freshJob as any).proformaRevision !== undefined) orig.proformaRevision = (freshJob as any).proformaRevision;
        if ((freshJob as any).proformaCartHash !== undefined) orig.proformaCartHash = (freshJob as any).proformaCartHash;

        if (conflicts.length > 0) {
          setLiveConflictFields(prev => Array.from(new Set([...prev, ...conflicts])));
        } else {
          orig.updatedAt = freshJob.updatedAt;
        }
      }
    }
  }, [jobs, editingJobId, pickupRiderId, deliveryRiderId, billNo, editingSubStatus, customerPhone, dialogCart, pickupScheduledTime, deliveryScheduledTime, bagImageUrls, origBagImageUrls, billImageUrls, origBillImageUrls, pickupProofImageUrls, origPickupProofImageUrls, deliveryProofImageUrls, origDeliveryProofImageUrls]);

  const hasPackage = dialogCart.some(item => item.category === "PACKAGE");
  const activeIsFreeDelivery = isRewashJob
    ? true
    : ((isPaidJob && activeJob)
      ? (activeJob.fee === 0 && activeJob.type !== "in_store")
      : (isFreeDelivery || hasPackage));
  const baseFee = (isPaidJob && activeJob && !isRewashJob)
    ? (activeJob.fee ?? 0)
    : (editingFeeLock !== null ? editingFeeLock : calculateTotalFee());
  const fee = isRewashJob
    ? 0
    : ((isPaidJob && activeJob)
      ? (activeJob.fee ?? 0)
      : (activeIsFreeDelivery ? 0 : baseFee));
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [categorySearch, setCategorySearch] = useState<string>("");
  
  // Cashier shift state
  const { activeShift } = useSyncExternalStore(shiftStore.subscribe, shiftStore.getSnapshot, shiftStore.getSnapshot);
  const currentLanguage = systemSettings?.language || "th";
  
  // Derived lock states
  const currentShopConfig = shopLocations[selectedStoreIndex] || shopLocations[0];
  const activeShopConfig = activeJob ? shopLocations.find(s => s.id === activeJob.branchId) : currentShopConfig;
  // CASHIER_SHIFT_ENABLED=false: force POS UI always on, remove shift-based locks
  const isPosEnabled = true; // was: activeShopConfig?.isPosEnabled ?? false
  
  useEffect(() => {
    if (user && (activeShopConfig?.isPosEnabled ?? false)) {
      shiftStore.fetchActiveShift(user.id, activeShopConfig?.id);
    }
  }, [user, activeShopConfig?.isPosEnabled, activeShopConfig?.id]);
  const isShiftFromPreviousDay = useMemo(() => {
    if (!activeShift?.openedAt) return false;
    const openedDate = new Date(activeShift.openedAt);
    const today = new Date();
    return (
      openedDate.getFullYear() !== today.getFullYear() ||
      openedDate.getMonth() !== today.getMonth() ||
      openedDate.getDate() !== today.getDate()
    );
  }, [activeShift]);

  const hasValidActiveShift = !!activeShift && !isShiftFromPreviousDay;

  const isNewCustomer = useMemo(() => {
    // If no customer selected or typed, not a new customer
    if (!selectedProfileCustomer && !customerPhone && !customerName) return false;

    if (selectedProfileCustomer) {
      return selectedProfileCustomer.isNew === true;
    }

    const targetPhone = customerPhone?.trim();
    const targetName = customerName?.trim().toUpperCase();

    const matched = customers.find(c =>
      (targetPhone && c.phone === targetPhone) ||
      (targetName && c.name?.trim().toUpperCase() === targetName)
    );

    if (matched) {
      return matched.isNew === true;
    }

    // Completely new customer typed manually
    return true;
  }, [selectedProfileCustomer, customerPhone, customerName, customers]);

  // Resolves primary / secondary / international phones for the active customer
  const phoneResolution = useMemo(() => {
    return resolveCustomerPhones({
      customerPhone,
      customer: selectedProfileCustomer,
    });
  }, [customerPhone, selectedProfileCustomer]);

  // Auto-populate customerPhone if empty but customer has international or alternate phone
  useEffect(() => {
    if ((!customerPhone || customerPhone.trim() === "-" || customerPhone.trim() === "--") && phoneResolution.primaryPhone) {
      setCustomerPhone(phoneResolution.primaryPhone);
    }
  }, [customerPhone, phoneResolution.primaryPhone]);


  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin' || Boolean(user?.permissions?.includes('admin'));
  const isAccounting = user?.role === 'accounting' || Boolean(user?.permissions?.includes('accounting'));
  const isCSO = user?.role === 'cso' || Boolean(user?.permissions?.includes('cso'));
  const isBranchManager = user?.role === 'manager' || Boolean(user?.permissions?.includes('manager') || user?.permissions?.includes('branch_manager'));
  const isCsoOrAdmin = isCSO || isAdmin;
  const canAdvanceBilling = isAdmin || isCSO || isBranchManager;

  const isCurrentJobBillSent = useMemo(() => {
    if (isRewashJob) return true;
    if (!editingJobId) return false;
    const currentJob = jobs.find(j => j.id === editingJobId);
    if (isRewashOrNoChargeJob(currentJob)) return true;
    if (!currentJob?.adminNotesJson) return false;
    try {
      const p = JSON.parse(currentJob.adminNotesJson);
      return Boolean(p && typeof p === "object" && !Array.isArray(p) && p.isBillSent);
    } catch {
      return false;
    }
  }, [jobs, editingJobId, isRewashJob]);

  // CSO can only unlock jobs whose payment was recorded today or yesterday (Thailand time UTC+7)
  // Admin / Superadmin / Accounting can unlock any paid job without time limit
  const canUnlockPaid = useMemo(() => {
    if (!editingJobId || !isPaidJob || activeJob?.refundId) return false;
    if (isAdmin || isAccounting) return true;
    if (isCSO) {
      const payDate = getJobPaymentDate(activeJob);
      return isPaidTodayOrYesterday(payDate);
    }
    return false;
  }, [editingJobId, isPaidJob, activeJob, isAdmin, isAccounting, isCSO]);
  const canDeleteLaundryBags = isAdmin || isCSO;
  const canDeleteBills = isAdmin;
  const canSeeTaxInvoice = isCSO || isAdmin || user?.role === 'accounting';
  const canSeeStuck = isAdmin || isCSO;
  const [dialogSelectedCategory, setDialogSelectedCategory] = useState<string | null>(null);

  // Proforma states
  const [proformaReceiptNumber, setProformaReceiptNumber] = useState<string | null>(null);
  const [proformaRevision, setProformaRevision] = useState<number | null>(null);
  const [lastProformaCartHash, setLastProformaCartHash] = useState<string | null>(null);
  // true = user pressed Proforma button at least once since opening this edit session
  // → Save Changes should NOT auto-gen a new image (user already reviewed & confirmed it)
  // false = user has NOT pressed Proforma after the most recent cart change
  // → Save Changes SHOULD auto-gen a new image (guard against user forgetting)
  const [proformaPressedSinceLastEdit, setProformaPressedSinceLastEdit] = useState<boolean>(false);
  const lastPaidProformaInfoRef = useRef<{ id: string | null; rev: number } | null>(null);
  const [isDraftPreview, setIsDraftPreview] = useState<boolean>(false);
  const [draftCreatedAt, setDraftCreatedAt] = useState<Date>(new Date());
  const [showReceipt, setShowReceipt] = useState<boolean>(false);
  const [isPaymentEvent, setIsPaymentEvent] = useState<boolean>(false);
  const [savingJobIds, setSavingJobIds] = useState<Set<string>>(new Set());
  const receiptPaperSize = systemSettings?.receiptPaperSize || "80mm";

  // Wallet Approval review context — set when opening Edit Job from Wallet Approvals table
  const [reviewingWalletTx, setReviewingWalletTx] = useState<WalletTransactionItem | null>(null);
  const [walletRejectModalOpen, setWalletRejectModalOpen] = useState(false);
  const [walletRejectReason, setWalletRejectReason] = useState("");
  const [isWalletActionProcessing, setIsWalletActionProcessing] = useState(false);

  // Unlock Paid states
  const [unlockPaidDialogOpen, setUnlockPaidDialogOpen] = useState(false);
  const [unlockPaidReason, setUnlockPaidReason] = useState("");
  const [isUnlockingPaid, setIsUnlockingPaid] = useState(false);

  // Promo Code states
  const [promoCodeInput, setPromoCodeInput] = useState<string>("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountType: string;
    discountTarget: string;
    applicableCategory?: string | null;
    discountValue: number;
    discountAmount: number;
    netPayable: number;
    maxDiscount: number | null;
    description?: string;
  } | null>(null);
  const [promoLoading, setPromoLoading] = useState<boolean>(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const forceMemberPaymentDialog = useMemo(() => {
    if (isRewashJob) return false;
    if (!selectedProfileCustomer?.isMember) return false;
    return dialogCart.some(item => 
      item.category !== "PACKAGE" && 
      item.id !== "topup-member-item" && 
      item.id !== "delivery-pickup-service-item" && 
      item.id !== "delivery-only-service-item"
    );
  }, [selectedProfileCustomer, dialogCart, isRewashJob]);

  const currentLaundryPrice = useMemo(() => {
    if (isRewashJob) return 0;
    if (isPosEnabled && dialogCart.length > 0) {
      return dialogCart.reduce((sum, item) => sum + safeCeil((item.price || 0) * (item.quantity || 0)), 0);
    }
    return safeCeil(laundryPrice || 0);
  }, [dialogCart, laundryPrice, isPosEnabled, isRewashJob]);


  const dialogDiscountAmount = useMemo(() => {
    // Discount applies after express surcharge is added
    const expressRate = serviceSpeed === 'express_50' ? 0.5 : (serviceSpeed === 'express_100' ? 1 : 0);
    const surcharge = expressRate > 0 ? safeCeil(currentLaundryPrice * expressRate) : 0;
    return (currentLaundryPrice + surcharge) * (dialogDiscountPercent / 100);
  }, [currentLaundryPrice, dialogDiscountPercent, serviceSpeed]);

  // Dynamic promo discount calculation: supports DELIVERY, category-specific (SHOES, LINENS, etc.), and ALL
  const promoDiscountAmount = useMemo(() => {
    if (!appliedPromo) return 0;
    if (appliedPromo.discountTarget === "DELIVERY" || appliedPromo.discountType === "FREE_DELIVERY") {
      let d = 0;
      if (appliedPromo.discountType === "PERCENTAGE") {
        d = (fee * appliedPromo.discountValue) / 100;
      } else {
        d = appliedPromo.discountValue > 0 ? Math.min(appliedPromo.discountValue, fee) : fee;
      }
      if (appliedPromo.maxDiscount != null && appliedPromo.maxDiscount > 0) {
        d = Math.min(d, appliedPromo.maxDiscount);
      }
      return Math.max(0, Math.min(d, fee));
    }
    const targetCat = appliedPromo.applicableCategory || (appliedPromo.discountTarget !== "ALL" && appliedPromo.discountTarget !== "DELIVERY" ? appliedPromo.discountTarget : null);
    if (targetCat && targetCat !== "ALL") {
      const catSubtotal = dialogCart
        .filter(it => isItemMatchingCategory(it, targetCat))
        .reduce((sum, it) => sum + ((Number(it.price) || 0) * (Number(it.quantity) || 1)), 0);
      if (catSubtotal <= 0) return 0;
      if (appliedPromo.discountType === "PERCENTAGE") {
        let val = (catSubtotal * appliedPromo.discountValue) / 100;
        if (appliedPromo.maxDiscount != null && appliedPromo.maxDiscount > 0) val = Math.min(val, appliedPromo.maxDiscount);
        return Math.max(0, Math.min(val, catSubtotal));
      }
      return Math.max(0, Math.min(appliedPromo.discountValue, catSubtotal));
    }
    const expressRate = serviceSpeed === 'express_50' ? 0.5 : (serviceSpeed === 'express_100' ? 1 : 0);
    const surcharge = expressRate > 0 ? safeCeil(currentLaundryPrice * expressRate) : 0;
    const base = Math.max(0, currentLaundryPrice + surcharge);
    if (appliedPromo.discountType === "PERCENTAGE") {
      let val = (base * appliedPromo.discountValue) / 100;
      if (appliedPromo.maxDiscount != null && appliedPromo.maxDiscount > 0) val = Math.min(val, appliedPromo.maxDiscount);
      return Math.max(0, Math.min(val, base));
    }
    return Math.max(0, Math.min(appliedPromo.discountValue, base));
  }, [appliedPromo, fee, dialogCart, currentLaundryPrice, serviceSpeed]);

  const dialogVatAmount = useMemo(() => {
    if (dialogVatType === "none" || dialogVatRate <= 0) return 0;
    const expressRate = serviceSpeed === 'express_50' ? 0.5 : (serviceSpeed === 'express_100' ? 1 : 0);
    const surcharge = expressRate > 0 ? safeCeil(currentLaundryPrice * expressRate) : 0;
    const promoDisc = promoDiscountAmount;
    // VAT base = (subtotal + surcharge) - % discount - promo discount + fee
    const baseForVat = currentLaundryPrice + surcharge - dialogDiscountAmount - promoDisc + fee;
    if (dialogVatType === "inclusive") {
      return baseForVat * (dialogVatRate / (100 + dialogVatRate));
    } else {
      return baseForVat * (dialogVatRate / 100);
    }
  }, [dialogVatType, dialogVatRate, currentLaundryPrice, dialogDiscountAmount, serviceSpeed, fee, promoDiscountAmount]);

  const dialogTotal = useMemo(() => {
    const expressRate = serviceSpeed === 'express_50' ? 0.5 : (serviceSpeed === 'express_100' ? 1 : 0);
    const surcharge = expressRate > 0 ? safeCeil(currentLaundryPrice * expressRate) : 0;
    const promoDisc = promoDiscountAmount;
    // Formula: (subtotal + surcharge) - % discount - promo discount + fee + VAT
    const baseTotal = currentLaundryPrice + surcharge - dialogDiscountAmount - promoDisc + fee;
    const vat = dialogVatType === "exclusive" ? (baseTotal * (dialogVatRate / 100)) : 0;
    return roundGrandTotal(Math.max(0, baseTotal + vat), dialogVatType);
  }, [currentLaundryPrice, dialogDiscountAmount, serviceSpeed, fee, dialogVatType, dialogVatRate, promoDiscountAmount]);


  const activePaymentChannels = useMemo(() => {
    return getActivePaymentChannels(systemSettings, !!selectedProfileCustomer?.isMember);
  }, [systemSettings, selectedProfileCustomer?.isMember]);

  const splitMemberDeductAmt = useMemo(() => {
    if (paymentChannel !== "Split Payment" || splitPayments.length < 2) return 0;
    return splitPayments
      .filter((s) => s.channel === "Deduct Member")
      .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  }, [paymentChannel, splitPayments]);

  const isSplitAmountInvalid = useMemo(() => {
    if (paymentChannel !== "Split Payment") return false;
    if (splitPayments.length < 2) return true;
    const splitTotal = Math.round(splitPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
    return Math.abs(splitTotal - Math.round(dialogTotal * 100) / 100) > 0.01;
  }, [paymentChannel, splitPayments, dialogTotal]);

  const isCustomerWalletExpired = isWalletExpired(selectedProfileCustomer);
  const isWalletInsufficient = !isPaidJob && (
    (paymentChannel === "Deduct Member" && ((selectedProfileCustomer?.creditBalance || 0) < dialogTotal)) ||
    (paymentChannel === "Split Payment" && splitMemberDeductAmt > 0 && ((selectedProfileCustomer?.creditBalance || 0) < splitMemberDeductAmt))
  );
  const isWalletBlocked = !isPaidJob && (
    (paymentChannel === "Deduct Member" && (isWalletInsufficient || isCustomerWalletExpired)) ||
    (paymentChannel === "Split Payment" && splitMemberDeductAmt > 0 && (isWalletInsufficient || isCustomerWalletExpired))
  );

  useEffect(() => {
    if (isWalletBlocked && !isPaidJob) {
      if (paymentMethod === 'paid') setPaymentMethod('unpaid');
      if (shopPaymentMethod === 'paid') setShopPaymentMethod('unpaid');
    }
  }, [isWalletBlocked, isPaidJob, paymentMethod, shopPaymentMethod]);


  useEffect(() => {
    if (forceMemberPaymentDialog) {
      // Auto-select "Deduct Member" as payment channel for Member customers
      // But do NOT auto-set isPaid=true — user must confirm by pressing Paid themselves
      setPaymentChannel("Deduct Member");
    }
  }, [forceMemberPaymentDialog, dialogTotal, selectedProfileCustomer?.creditBalance]);


  useEffect(() => {
    // Only apply global or customer VAT settings when NOT editing an existing job.
    // When editing a job, VAT is already restored from job.remark in handleEditFullJob.
    if (editingJobId) return;
    const rate = parseFloat(systemSettings?.vatRate || "7") || 7;
    setDialogVatRate(rate);

    if (selectedProfileCustomer?.vatType && selectedProfileCustomer.vatType !== "default") {
      setDialogVatType(selectedProfileCustomer.vatType as any);
      if (selectedProfileCustomer.vatType === "exclusive") {
        toast.info(currentLanguage === "en" ? `Customer contract: Exclude VAT (+${rate}%)` : `ลูกค้ามีข้อตกลง: แยกภาษีมูลค่าเพิ่ม (+${rate}%)`);
      } else if (selectedProfileCustomer.vatType === "inclusive") {
        toast.info(currentLanguage === "en" ? `Customer contract: Include VAT (${rate}%)` : `ลูกค้ามีข้อตกลง: รวมภาษีมูลค่าเพิ่ม (${rate}%)`);
      } else if (selectedProfileCustomer.vatType === "none") {
        toast.info(currentLanguage === "en" ? "Customer contract: No VAT" : "ลูกค้ามีข้อตกลง: ไม่คิดภาษีมูลค่าเพิ่ม");
      }
    } else if (systemSettings?.vatType) {
      setDialogVatType(systemSettings.vatType as any);
    } else {
      setDialogVatType("none");
    }
  }, [systemSettings?.vatType, systemSettings?.vatRate, selectedProfileCustomer?.id, selectedProfileCustomer?.vatType, editingJobId, currentLanguage]);

  const [showAllStoreServicesInDialog, setShowAllStoreServicesInDialog] = useState(false);

  // Corporate B2B contract detection for Create/Edit Job dialog
  const activeDialogCorpPriceList = useMemo(() => {
    const targetPlId = customerPriceListId || selectedProfileCustomer?.priceListId;
    if (!targetPlId) return null;
    const pl = priceLists.find(p => p.id === targetPlId);
    if (pl && (pl.isCorporate || (pl.customItems && pl.customItems.length > 0)) && pl.customItems && pl.customItems.length > 0) {
      return pl;
    }
    return null;
  }, [customerPriceListId, selectedProfileCustomer?.priceListId, priceLists]);

  const dialogCorporateServices = useMemo<ServiceItem[]>(() => {
    if (!activeDialogCorpPriceList?.customItems) return [];
    return activeDialogCorpPriceList.customItems.map(item => ({
      id: item.id,
      name: item.name,
      nameEn: item.nameEn || item.name,
      price: item.price,
      memberPrice: item.price,
      category: item.category || "B2B",
      unit: item.unit || "ชิ้น",
      isActive: true,
    }));
  }, [activeDialogCorpPriceList]);

  const dialogActiveServices = useMemo(() => {
    if (activeDialogCorpPriceList && !showAllStoreServicesInDialog) {
      return dialogCorporateServices;
    }
    return services;
  }, [activeDialogCorpPriceList, showAllStoreServicesInDialog, dialogCorporateServices, services]);

  // Reset dialog contract toggle and category when customer switches
  useEffect(() => {
    setShowAllStoreServicesInDialog(false);
    setDialogSelectedCategory(null);
  }, [selectedProfileCustomer?.id, customerPriceListId]);

  // Auto-recalculate dialogCart prices when selected customer or price list changes
  useEffect(() => {
    if (editingJobId) return; // Do not overwrite existing job custom prices when editing
    setDialogCart(prev => {
      if (prev.length === 0) return prev;
      let hasChanges = false;
      const updated = prev.map(item => {
        if (item.category === "PACKAGE" || item.id === "other" || (item as any).isCustomPrice || (item.basePrice !== undefined && item.price !== item.basePrice)) return item;
        const svc = services.find(s => s.id === item.id) || dialogCorporateServices.find(s => s.id === item.id);
        if (!svc) return item;
        const newPrice = getServicePrice(svc, selectedProfileCustomer, customerPriceListId);
        if (newPrice !== item.price) {
          hasChanges = true;
          return { ...item, price: newPrice, basePrice: newPrice };
        }
        return item;
      });
      const totalSum = updated.reduce((acc, it) => acc + Math.ceil((it.price || 0) * (it.quantity || 0)), 0);
      setLaundryPrice(totalSum);

      return updated;
    });
  }, [selectedProfileCustomer, customerPriceListId, services, dialogCorporateServices, getServicePrice, editingJobId]);

  const activeShop = useMemo(() => {
    return shopLocations[selectedStoreIndex] || shopLocations[0];
  }, [shopLocations, selectedStoreIndex]);

  // Derived category list (excluding PACKAGE since top-up has its own dialog)
  const categories = useMemo(() => {
    const sourceServices = (activeDialogCorpPriceList && !showAllStoreServicesInDialog) ? dialogCorporateServices : services;
    const activeServices = sourceServices.filter(s => s.isActive !== false && s.category !== 'PACKAGE');
    return Array.from(new Set(activeServices.map(s => s.category).filter(Boolean))).sort();
  }, [services, dialogCorporateServices, activeDialogCorpPriceList, showAllStoreServicesInDialog]);

  const visibleCategories = useMemo(() => {
    return categories.filter(cat => cat !== 'PACKAGE');
  }, [categories]);

  // Merged Customer Past Transactions (DB + in-memory store)
  const customerPastJobs = useMemo<any[]>(() => {
    const targetId = selectedProfileCustomer?.id || (editingJobId && activeJob?.customerId);
    const targetPhone = (customerPhone || selectedProfileCustomer?.phone || activeJob?.customerPhone || "").trim();
    const targetName = (customerName || selectedProfileCustomer?.name || activeJob?.customerName || "").trim();
    const cleanTargetPhone = targetPhone.replace(/\D/g, "");

    if (!targetId && cleanTargetPhone.length < 8 && !targetName) return [];

    const jobMap: Record<string, any> = {};

    // 1. Add DB-fetched customer jobs
    dbCustomerJobs.forEach((j: any) => {
      if (editingJobId && j.id === editingJobId) return;
      jobMap[j.id] = j;
    });

    // 2. Add in-memory store jobs (fresher or uncommitted)
    jobs.filter((j: any) => {
      if (editingJobId && j.id === editingJobId) return false;
      if (targetId && j.customerId && j.customerId === targetId) return true;
      if (cleanTargetPhone.length >= 8 && j.customerPhone) {
        const cleanJ = j.customerPhone.replace(/\D/g, "");
        if (cleanJ === cleanTargetPhone || (cleanJ.length >= 8 && cleanTargetPhone.endsWith(cleanJ)) || (cleanTargetPhone.length >= 8 && cleanJ.endsWith(cleanTargetPhone))) {
          return true;
        }
      }
      if (targetName && targetName.length > 2 && j.customerName) {
        if (j.customerName.trim().toLowerCase() === targetName.toLowerCase()) return true;
      }
      return false;
    }).forEach((j: any) => {
      jobMap[j.id] = j;
    });

    return (Object.values(jobMap) as any[]).sort((a: any, b: any) => {
      const timeA = new Date(a.createdAt || a.scheduledAt || a.date || 0).getTime();
      const timeB = new Date(b.createdAt || b.scheduledAt || b.date || 0).getTime();
      return timeB - timeA;
    });
  }, [dbCustomerJobs, jobs, editingJobId, activeJob, selectedProfileCustomer, customerPhone, customerName]);

  const currentPastJob: any = customerPastJobs[pastJobIndex] || customerPastJobs[0] || null;

  const pastItems = useMemo(() => {
    if (!currentPastJob) return [];
    if (Array.isArray(currentPastJob.items) && currentPastJob.items.length > 0) {
      return currentPastJob.items;
    }
    if (currentPastJob.itemsJson) {
      try {
        const parsed = JSON.parse(currentPastJob.itemsJson);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [];
      }
    }
    return [];
  }, [currentPastJob]);

  const handleCopyPastItems = (itemsToCopy: any[], pastJob: any) => {
    if (isPaidJob || isCartLocked) {
      toast.error(currentLanguage === "en" ? "Cannot modify items on a paid/locked order" : "ไม่สามารถแก้ไขรายการของออเดอร์ที่ชำระเงินแล้ว");
      return;
    }
    if (!itemsToCopy || itemsToCopy.length === 0) {
      toast.error(currentLanguage === "en" ? "No items found in this past transaction" : "ไม่พบรายการสินค้าในประวัติคำสั่งนี้");
      return;
    }

    const mappedNewItems: any[] = itemsToCopy.map((pi: any, idx: number) => {
      const catalogItem = services.find(si => 
        (pi.serviceId && si.id === pi.serviceId) ||
        (si.name && pi.name && si.name.trim().toLowerCase() === pi.name.trim().toLowerCase())
      ) || dialogCorporateServices.find(si => 
        (pi.serviceId && si.id === pi.serviceId) ||
        (si.name && pi.name && si.name.trim().toLowerCase() === pi.name.trim().toLowerCase())
      );

      const price = typeof pi.price === 'number' ? pi.price : (catalogItem ? getServicePrice(catalogItem, selectedProfileCustomer, customerPriceListId) : 0);
      const quantity = typeof pi.quantity === 'number' && pi.quantity > 0 ? pi.quantity : 1;

      return {
        id: catalogItem?.id || pi.serviceId || `copied-${Date.now()}-${idx}`,
        name: pi.name || catalogItem?.name || "Laundry Item",
        price,
        quantity,
        unit: pi.unit || catalogItem?.unit || "piece",
        category: pi.category || catalogItem?.category || "Wash & Fold",
        basePrice: catalogItem?.price || price,
      };
    });

    setDialogCart(mappedNewItems);
    const totalSum = mappedNewItems.reduce((acc, it) => acc + safeCeil((it.price || 0) * (it.quantity || 0)), 0);
    setLaundryPrice(totalSum);

    if (pastJob.serviceSpeed && (pastJob.serviceSpeed === "standard" || pastJob.serviceSpeed === "express_50" || pastJob.serviceSpeed === "express_100")) {
      handleServiceOrSpeedChange(serviceType, pastJob.serviceSpeed as any, serviceWeight);
    }

    toast.success(
      currentLanguage === "en" 
        ? `Copied ${mappedNewItems.length} items from past order #${formatJobDisplayId(pastJob.id)}` 
        : `คัดลอก ${mappedNewItems.length} รายการจากออเดอร์ #${formatJobDisplayId(pastJob.id)} สำเร็จ`
    );
  };
  // Clean up isNew flags when the Edit Job dialog closes without saving
  useEffect(() => {
    if (!dialogOpen && editingJobId && !showReceipt && !isSubmitting) {
      const stripNewNotes = async () => {
        const currentJob = jobs.find(j => j.id === editingJobId);
        if (currentJob && currentJob.adminNotesJson) {
          try {
            const parsed = JSON.parse(currentJob.adminNotesJson);
            let notesArr: any[] = [];
            const isObj = Boolean(parsed && typeof parsed === "object" && !Array.isArray(parsed));

            if (Array.isArray(parsed)) {
              notesArr = parsed;
            } else if (isObj && Array.isArray(parsed.notes)) {
              notesArr = parsed.notes;
            }

            // Only update if at least one note actually had the temporary `isNew` flag
            const hasNewFlag = notesArr.some((n: any) => Boolean(n && n.isNew));
            if (!hasNewFlag) return;

            const cleaned = notesArr.map((n: any) => {
              const { isNew, ...rest } = n;
              return rest;
            });

            const updatedJson = isObj
              ? JSON.stringify({ ...parsed, notes: cleaned })
              : JSON.stringify(cleaned);

            if (currentJob.adminNotesJson !== updatedJson) {
              await jobStore.updateJobDetails(editingJobId, { 
                adminNotesJson: updatedJson,
                actorId: user?.id,
                actorName: user?.name || user?.email,
                actorRole: user?.role
              });
              refreshDb();
            }
          } catch {}
        }
      };

      stripNewNotes();
      editingJobIdRef.current = null;
      setEditingJobId(null);
      setAdminLogs([]);
    }
  }, [dialogOpen, editingJobId, jobs, showReceipt, isSubmitting]);


  const resetDialogStates = () => {
    setPickupLoc("");
    setPickupRoom("");
    setDeliveryLoc("");
    setDeliveryRoom("");
    setDifferentDeliveryAddress(false);
    setIsDeliveryDirty(false);
    setIsFreeDelivery(false);
    setIsRewashJob(false);
    setRewashFromJobId(null);
    setNoRiderCommission(false);
    setIsStuck(false);
    setPickupScheduledTime(format(roundToNearest30(new Date()), "yyyy-MM-dd'T'HH:mm"));
    setDeliveryScheduledTime(format(roundToNearest30(new Date(Date.now() + 86400000)), "yyyy-MM-dd'T'HH:mm"));
    setPaymentMethod("unpaid");
    setShopPaymentMethod("unpaid");
    setPaymentChannel("");
    setSelectedProfileCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
    setPickupRiderId("");
    setDeliveryRiderId("");
    setBagImageUrls([]);
    setBillImageUrls([]);
    setPickupProofImageUrls([]);
    setDeliveryProofImageUrls([]);
    setOrigBagImageUrls([]);
    setOrigBillImageUrls([]);
    setOrigPickupProofImageUrls([]);
    setOrigDeliveryProofImageUrls([]);
    setServiceType("wash_fold");
    setLaundryTypes([]);
    setServiceSpeed("standard");
    setSelectedVIPLabel("");
    setSelectedMemberLabel("");
    setSelectedMemberId("");
    setBillNo("");
    setIsTaxInvoiceRequested(false);
    setAdminNote("");
    setAdminNoteInput("");
    setShowAdminNote(false);
    editingJobIdRef.current = null;
    setEditingJobId(null);
    setNoteLogsModalOpen(false);
    setPreviewAdminNoteImage(null);
    setShowJobLogs(false);
    setPromoCodeInput("");
    setAppliedPromo(null);
    setPromoError(null);
    setShowDialogDiscount(false);
    setDialogDiscountPercent(0);
    setDbCustomerJobs([]);
    setPastJobIndex(0);
  };

  const resetDialogForm = () => {
    originalJobRef.current = null;
    editingJobIdRef.current = null;
    setEditingJobId(null);
    setBagImageUrls([]);
    setBillImageUrls([]);
    setPickupProofImageUrls([]);
    setDeliveryProofImageUrls([]);
    setOrigBagImageUrls([]);
    setOrigBillImageUrls([]);
    setOrigPickupProofImageUrls([]);
    setOrigDeliveryProofImageUrls([]);
    setReviewingWalletTx(null);
    setBillNo("");
    setIsTaxInvoiceRequested(false);
    setDialogSelectedCategory(null);
    setDialogCart([]);

    setProformaReceiptNumber(null);
    setPaymentChannel("");
    setSplitPayments([]);
    setShowSplitPaymentDialog(false);
    setPaymentMethod("unpaid");
    setShopPaymentMethod("unpaid");
    setSelectedProfileCustomer(null);
    setCustomerName("");
    setCustomerPhone("");
    setProformaRevision(null);
    setLastProformaCartHash(null);
    setProformaPressedSinceLastEdit(false);
    setIsDraftPreview(false);
    setDraftCreatedAt(new Date());
    setShowReceipt(false);
    setShowJobLogs(false);
    setIsDetailLoading(false);
    setEditingSubStatus(null);
    setCustomerName("");
    setDbCustomerJobs([]);
    setPastJobIndex(0);
    setCustomerPhone("");
    setCustomerSearchQuery("");
    setSelectedProfileCustomer(null);
    setCustomerPriceListId(null);
    setPickupLoc("");
    setPickupRoom("");
    setPickupCoords(null);
    setDeliveryLoc("");
    setDeliveryRoom("");
    setDeliveryCoords(null);
    setDifferentDeliveryAddress(false);
    setIsPickup(true);
    setIsDelivery(true);
    setIsWalkIn(false);
    const userBranchIdx = user?.branchId ? shopLocations.findIndex(s => s.id === user.branchId) : 0;
    setSelectedStoreIndex(userBranchIdx >= 0 ? userBranchIdx : 0);
    const firstWash = washServices.length > 0 ? washServices[0].id : "";
    setServiceSpeed("standard");
    setDeliveryScheduledTime("");
    setPaymentMethod("unpaid");
    setPaymentChannel("");
    setCashPlaced(false);
    setServiceType("wash_fold");
    setServiceWeight(2);
    setLaundryTypes([]); // H3 Fix: clear laundryTypes to prevent data bleeding from previous Edit Job
    setOtherClothingName("");
    setClothingItems({
      polo: { selected: false, quantity: 1 },
      tshirt: { selected: false, quantity: 1 },
      pants: { selected: false, quantity: 1 },
      dress: { selected: false, quantity: 1 },
      bedsheet: { selected: false, quantity: 1 },
      other: { selected: false, quantity: 1 },
    });
    if (firstWash) {
      handleServiceOrSpeedChange(firstWash, "standard", 2, null);
    } else {
      setLaundryPrice(0);
    }
    setDialogDiscountPercent(0);
    setShowDialogDiscount(false);
    setPromoCodeInput("");
    setAppliedPromo(null);
    setPromoError(null);
    const defaultVatType = (systemSettings?.vatType as any) || "none";
    const defaultVatRate = parseFloat(systemSettings?.vatRate || "7") || 7;
    setDialogVatType(defaultVatType);
    setDialogVatRate(defaultVatRate);
    setEditingFeeLock(null);
    setSelectedVIPLabel("");
    setSelectedMemberLabel("");
    setSelectedMemberId("");
    setAdminNote("");
    setBagImageUrls([]);
    setBillImageUrls([]);
    setPickupProofImageUrls([]);
    setDeliveryProofImageUrls([]);
    setOrigBagImageUrls([]);
    setOrigBillImageUrls([]);
    setOrigPickupProofImageUrls([]);
    setOrigDeliveryProofImageUrls([]);
    setIsPickupLobby(false);
    setIsPickupMeet(false);
    setIsDeliveryLobby(false);
    setIsDeliveryMeet(false);
    setHasHanger(false);
    setHangerCount(0);
    setHasFolded(false);
    setFoldedCount(0);
    setProcessingBranchId("");
    setIsFreeDelivery(false);
    setIsRewashJob(false);
    setRewashFromJobId(null);
    setNoRiderCommission(false);
    setAdminNote("");
    setAdminLogs([]);
    setAdminNoteInput("");
    setNoteLogsModalOpen(false);
    setPreviewAdminNoteImage(null);
    setPickupRiderId("");
    setDeliveryRiderId("");
    setPickupDist(0);
    setDeliveryDist(0);
    setIsStuck(false);
    setSaveError(null);
    draftJobRequestIdRef.current = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setPickupScheduledTime(format(roundToNearest30(new Date()), "yyyy-MM-dd'T'HH:mm"));
    setDeliveryScheduledTime(format(roundToNearest30(new Date(Date.now() + 86400000)), "yyyy-MM-dd'T'HH:mm"));
  };

  const handleCreateNewJob = () => {
    resetDialogForm();
    setDialogOpen(true);
  };

  const handleToggleRewash = (nextVal: boolean) => {
    setIsRewashJob(nextVal);
    if (nextVal) {
      setNoRiderCommission(true);
      setIsFreeDelivery(true);
      setPaymentChannel("Rewash / No Charge");
      setPaymentMethod("paid");
      setShopPaymentMethod("paid");
      setSplitPayments([]);
      setAppliedPromo(null);
      setPromoCodeInput("");
      setPromoError(null);
      setShowDialogDiscount(false);
      setDialogDiscountPercent(0);
      setDialogCart(prev => prev.map(item => ({
        ...item,
        price: 0,
        isCustomPrice: true,
      })));
      setLaundryPrice(0);
    } else {
      setRewashFromJobId(null);
      setNoRiderCommission(false);
      setIsFreeDelivery(false);
      if (paymentChannel === "Rewash / No Charge") {
        setPaymentChannel("");
      }
      setPaymentMethod("unpaid");
      setShopPaymentMethod("unpaid");
      setDialogCart(prev => {
        const updated = prev.map(item => {
          const svc = services.find(s => s.id === item.id) || dialogCorporateServices.find(s => s.id === item.id);
          const restoredPrice = item.basePrice !== undefined && item.basePrice > 0
            ? item.basePrice
            : (svc ? getServicePrice(svc, selectedProfileCustomer, customerPriceListId) : 0);
          return {
            ...item,
            price: restoredPrice,
            basePrice: restoredPrice,
            isCustomPrice: false,
          };
        });
        const totalSum = updated.reduce((acc, it) => acc + safeCeil((it.price || 0) * (it.quantity || 0)), 0);
        setLaundryPrice(totalSum);
        return updated;
      });
    }
  };

  const handleStartRewashFromJob = (sourceJob: any) => {
    if (!sourceJob) return;
    const sourceDisplayId = formatJobDisplayId(sourceJob.id);
    const foundCustomer = findMatchingCustomer(customers, {
      customerId: sourceJob.customerId,
      customerName: sourceJob.customerName,
      customerPhone: sourceJob.customerPhone,
    }) || selectedProfileCustomer;

    const rawItems = Array.isArray(sourceJob.items) && sourceJob.items.length > 0
      ? sourceJob.items
      : (sourceJob.itemsJson ? (() => { try { return JSON.parse(sourceJob.itemsJson); } catch { return []; } })() : []);

    resetDialogForm();

    setSelectedProfileCustomer(foundCustomer || null);
    const resolvedPhones = resolveCustomerPhones({
      customerPhone: sourceJob.customerPhone,
      customer: foundCustomer,
    });
    setCustomerName(sourceJob.customerName || foundCustomer?.name || "");
    setCustomerPhone(resolvedPhones.primaryPhone || sourceJob.customerPhone || "");
    setSelectedVIPLabel(foundCustomer?.isVIP ? "VIP" : "");
    setSelectedMemberLabel(foundCustomer?.isMember ? "Member" : "");
    setSelectedMemberId(foundCustomer?.memberId || "");
    setCustomerPriceListId(foundCustomer?.priceListId || null);

    const branchIndex = shopLocations.findIndex(s => s.id === sourceJob.branchId);
    setSelectedStoreIndex(branchIndex >= 0 ? branchIndex : 0);

    const isPickupService = !!sourceJob.pickupLocation && !shopLocations.some(s => s.address === sourceJob.pickupLocation || s.name === sourceJob.pickupLocation || (sourceJob.pickupLocation && sourceJob.pickupLocation.includes("POS Counter")));
    const isDeliveryService = !!sourceJob.dropoffLocation && !shopLocations.some(s => s.address === sourceJob.dropoffLocation || s.name === sourceJob.dropoffLocation);
    const parseRoom = (loc: string) => {
      const match = loc.match(/^(.*?)(?:\s*\(Room\s*([^)]*)\))+$/i);
      if (match) return { base: match[1].trim(), room: (match[2] || "").trim() };
      return { base: loc, room: "" };
    };
    const custRoom = (foundCustomer?.roomNo || (foundCustomer?.secondaryAddress ? foundCustomer.secondaryAddress.replace(/^Room\s*/i, '') : '') || '').trim();
    const p = isPickupService ? parseRoom(sourceJob.pickupLocation || "") : { base: "", room: "" };
    const d = isDeliveryService ? parseRoom(sourceJob.dropoffLocation || "") : { base: "", room: "" };

    const cleanCustAddr = foundCustomer?.defaultAddress && foundCustomer.defaultAddress.trim() !== "--" && foundCustomer.defaultAddress.trim() !== "-" ? foundCustomer.defaultAddress : "";
    const fallbackAddr = p.base || d.base || cleanCustAddr || "";
    const fallbackRoom = p.room || d.room || custRoom || "";
    const fallbackCoords = sourceJob.pickupCoords || sourceJob.dropoffCoords || foundCustomer?.defaultCoords || null;

    const isWalkInSource = sourceJob.source === "pos" || sourceJob.type === "in_store";
    setIsWalkIn(isWalkInSource);
    setIsPickup(isWalkInSource ? false : (isPickupService || true));
    setIsDelivery(isWalkInSource ? isDeliveryService : (isDeliveryService || true));

    setPickupLoc(p.base || fallbackAddr);
    setPickupRoom(p.room || fallbackRoom);
    setPickupCoords(sourceJob.pickupCoords || fallbackCoords);
    setDeliveryLoc(d.base || fallbackAddr);
    setDeliveryRoom(d.room || fallbackRoom);
    setDeliveryCoords(sourceJob.dropoffCoords || fallbackCoords);
    setPickupDist(sourceJob.pickupDistance || sourceJob.distance || 0);
    setDeliveryDist(sourceJob.deliveryDistance || sourceJob.distance || 0);

    const rewashCart = rawItems
      .filter((it: any) => it && it.category !== "PACKAGE")
      .map((it: any, idx: number) => {
        const matched = services.find(s => s.id === it.serviceId || s.name === it.name) || dialogCorporateServices.find(s => s.id === it.serviceId || s.name === it.name);
        return {
          id: it.serviceId || matched?.id || `rewash-${Date.now()}-${idx}`,
          name: it.name || matched?.name || "Laundry Item",
          nameEn: it.nameEn || matched?.nameEn || it.name || "Laundry Item",
          quantity: Number(it.quantity) || 1,
          price: 0,
          basePrice: Number(it.basePrice || it.price || matched?.price) || 0,
          isCustomPrice: true,
          category: it.category || matched?.category || "Wash & Fold",
          unit: it.unit || matched?.unit || "pcs",
        };
      });

    setDialogCart(rewashCart);
    setLaundryPrice(0);
    setIsRewashJob(true);
    setRewashFromJobId(sourceDisplayId);
    setNoRiderCommission(true);
    setIsFreeDelivery(true);
    setPaymentChannel("Rewash / No Charge");
    setPaymentMethod("paid");
    setShopPaymentMethod("paid");

    const staffName = (user as any)?.name || user?.email || "Admin";
    setAdminLogs([{
      id: Math.random().toString(36).substring(2, 9),
      userId: user?.id || "system",
      userName: staffName,
      text: `🔄 Rewash / Re-process created from Order #${sourceDisplayId} (No Charge ฿0, No Rider Commission)`,
      imageUrls: [],
      timestamp: new Date().toISOString(),
    }]);

    setDialogOpen(true);
    toast.success(
      currentLanguage === "en"
        ? `🔄 Prepared Rewash Order from #${sourceDisplayId} (฿0 No Charge & ฿0 Rider Commission)`
        : `🔄 เตรียมบิลซักซ้ำจากออเดอร์ #${sourceDisplayId} เรียบร้อย (ฟรี ฿0 และไม่คิดค่าคอมไรเดอร์)`
    );
  };

  const handleOpenSplitDelivery = (job: Job) => {
    if (!job) return;
    setSplitTargetJob(job);
    const rawItems = Array.isArray(job.items) && job.items.length > 0
      ? job.items
      : (job.itemsJson ? (() => { try { return JSON.parse(job.itemsJson); } catch { return []; } })() : dialogCart);

    const initialMap: Record<string, number> = {};
    rawItems.forEach((it: any, idx: number) => {
      const k = String(it.id || it.serviceId || it.name || `item-${idx}`);
      initialMap[k] = 0;
    });
    setSplitItemSelections(initialMap);
    setCustomSplitItems([]);
    setNewCustomName("");
    setNewCustomQty(1);
    setNewCustomUnit("ชิ้น");
    setShowAddCustomRow(false);

    const baseDate = job.deliveryScheduledAt ? new Date(job.deliveryScheduledAt) : new Date();
    const nextDate = new Date(baseDate.getTime() + 2 * 86400000);
    setSplitScheduledTime(format(roundToNearest30(nextDate), "yyyy-MM-dd'T'HH:mm"));
    setSplitRiderId(job.deliveryRiderId || "");
    setSplitGiveCommission(!isNoRiderCommissionJob(job));
    setSplitNotes("");
    setSplitDeliveryModalOpen(true);
  };

  const handleSplitPreset50 = () => {
    if (!splitTargetJob) return;
    const rawItems = Array.isArray(splitTargetJob.items) && splitTargetJob.items.length > 0
      ? splitTargetJob.items
      : (splitTargetJob.itemsJson ? (() => { try { return JSON.parse(splitTargetJob.itemsJson); } catch { return []; } })() : dialogCart);

    const nextMap: Record<string, number> = {};
    rawItems.forEach((it: any, idx: number) => {
      const k = String(it.id || it.serviceId || it.name || `item-${idx}`);
      const totalQty = Number(it.quantity) || 1;
      nextMap[k] = Math.max(1, Math.floor(totalQty / 2));
    });
    setSplitItemSelections(nextMap);
  };

  const handleSplitSelectAll = () => {
    if (!splitTargetJob) return;
    const rawItems = Array.isArray(splitTargetJob.items) && splitTargetJob.items.length > 0
      ? splitTargetJob.items
      : (splitTargetJob.itemsJson ? (() => { try { return JSON.parse(splitTargetJob.itemsJson); } catch { return []; } })() : dialogCart);

    const nextMap: Record<string, number> = {};
    rawItems.forEach((it: any, idx: number) => {
      const k = String(it.id || it.serviceId || it.name || `item-${idx}`);
      nextMap[k] = Number(it.quantity) || 1;
    });
    setSplitItemSelections(nextMap);
  };

  const handleSplitResetAll = () => {
    if (!splitTargetJob) return;
    const rawItems = Array.isArray(splitTargetJob.items) && splitTargetJob.items.length > 0
      ? splitTargetJob.items
      : (splitTargetJob.itemsJson ? (() => { try { return JSON.parse(splitTargetJob.itemsJson); } catch { return []; } })() : dialogCart);

    const nextMap: Record<string, number> = {};
    rawItems.forEach((it: any, idx: number) => {
      const k = String(it.id || it.serviceId || it.name || `item-${idx}`);
      nextMap[k] = 0;
    });
    setSplitItemSelections(nextMap);
    setCustomSplitItems([]);
  };

  const handleConfirmSplitDelivery = async () => {
    if (!splitTargetJob) return;
    const rawItems = Array.isArray(splitTargetJob.items) && splitTargetJob.items.length > 0
      ? splitTargetJob.items
      : (splitTargetJob.itemsJson ? (() => { try { return JSON.parse(splitTargetJob.itemsJson); } catch { return []; } })() : dialogCart);

    const itemsToSplit: any[] = [];
    rawItems.forEach((it: any, idx: number) => {
      const k = String(it.id || it.serviceId || it.name || `item-${idx}`);
      const qty = splitItemSelections[k] || 0;
      if (qty > 0) {
        itemsToSplit.push({
          ...it,
          quantity: Math.min(qty, Number(it.quantity) || 1),
        });
      }
    });

    customSplitItems.forEach((cit) => {
      if (cit && cit.quantity > 0 && cit.name.trim()) {
        itemsToSplit.push({
          id: cit.id || `custom-${Date.now()}`,
          name: cit.name.trim(),
          quantity: cit.quantity,
          unit: cit.unit || "ชิ้น",
          price: 0,
        });
      }
    });

    if (itemsToSplit.length === 0) {
      toast.error(currentLanguage === "en" ? "Please select or add at least 1 item to split for 2nd delivery" : "กรุณาเลือกรายการสินค้า หรือเพิ่มรายการที่ต้องการแยกส่งในรอบที่ 2");
      return;
    }

    try {
      setIsSplittingDelivery(true);
      const res = await splitJobDeliveryAction({
        originalJobId: splitTargetJob.id,
        itemsToSplit,
        deliveryScheduledAt: splitScheduledTime,
        deliveryRiderId: splitRiderId || null,
        noRiderCommission: !splitGiveCommission,
        notes: splitNotes || null,
        actorId: user?.id,
        actorName: user?.name || user?.email,
        actorRole: user?.role,
        expectedUpdatedAt: splitTargetJob.updatedAt ? new Date(splitTargetJob.updatedAt).toISOString() : undefined,
      });

      if (res?.success) {
        toast.success(
          currentLanguage === "en"
            ? `Split Delivery created! Order #${formatJobDisplayId(res.newJob.id)} scheduled for 2nd delivery.`
            : `แยกจัดส่งสำเร็จ! สร้าง Order รอบที่ 2 #${formatJobDisplayId(res.newJob.id)} เรียบร้อยแล้ว (฿0 Pre-paid)`
        );
        setSplitDeliveryModalOpen(false);
        setDialogOpen(false);
        resetDialogForm();
        refreshDb();
      } else {
        toast.error("Failed to split delivery. Please try again.");
      }
    } catch (err: any) {
      console.error("Split delivery error:", err);
      toast.error(err?.message || "Error creating split delivery");
    } finally {
      setIsSplittingDelivery(false);
    }
  };

  // ── Promo Code Helpers ───────────────────────────────────────────────────────
  // Calls are made to local Next.js proxy routes (/api/pos/promo/*)
  // which forward to the production server with the server-side API key (TLS_PROMO_API_KEY env var)

  const handleApplyPromo = async (codeOverride?: unknown) => {
    if (isPaidJob) return;
    const targetCode = typeof codeOverride === "string" ? codeOverride : promoCodeInput;
    const code = targetCode.trim().toUpperCase();
    if (!code) return;

    // Must have a customer selected or specified to validate 1-time per customer
    const custId = selectedProfileCustomer?.id;
    const custPhone = customerPhone?.trim();
    const custName = customerName?.trim();

    if (!custId && !custPhone && !custName) {
      setPromoError("กรุณาเลือกลูกค้าหรือระบุข้อมูลลูกค้าก่อนใช้โค้ดส่วนลด");
      toast.error("กรุณาเลือกลูกค้าหรือระบุข้อมูลลูกค้าก่อนใช้โค้ดส่วนลด");
      return;
    }

    if (typeof codeOverride === "string") {
      setPromoCodeInput(codeOverride);
      setShowDialogDiscount(true);
    }

    setPromoLoading(true);
    setPromoError(null);
    setAppliedPromo(null);
    try {
      const expressRate = serviceSpeed === 'express_50' ? 0.5 : (serviceSpeed === 'express_100' ? 1 : 0);
      const surcharge = expressRate > 0 ? safeCeil(currentLaundryPrice * expressRate) : 0;
      // Exclude delivery fee so minimum order value evaluates strictly against laundry service amount
      const orderTotal = Math.max(0, currentLaundryPrice + surcharge - dialogDiscountAmount);
      const grandTotalBeforePromo = Math.max(0, currentLaundryPrice + surcharge + fee - dialogDiscountAmount);

      const res = await fetch(`/api/pos/promo/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          orderTotal,
          deliveryFee: fee || 0,
          customerId: custId,
          customerPhone: custPhone,
          customerName: custName,
          currentJobId: editingJobId || undefined,
          items: dialogCart,
        }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        const isDeliveryOnly = data.discountTarget === "DELIVERY" || data.discountType === "FREE_DELIVERY";
        let calcDiscount = data.discountAmount;

        if (isDeliveryOnly) {
          // Manual Section 8: discountTarget === "DELIVERY" must be calculated from deliveryFee (fee)
          if (data.discountType === "PERCENTAGE") {
            calcDiscount = (fee * data.discountValue) / 100;
          } else {
            calcDiscount = data.discountValue > 0 ? Math.min(data.discountValue, fee) : fee;
          }
          if (data.maxDiscount != null && data.maxDiscount > 0) {
            calcDiscount = Math.min(calcDiscount, data.maxDiscount);
          }
          calcDiscount = Math.max(0, Math.min(calcDiscount, fee));

          if (fee <= 0) {
            toast.warning(`โค้ด ${data.code} เป็นส่วนลดค่าจัดส่ง (ออเดอร์นี้ไม่มีค่าจัดส่ง ฿0)`);
          } else {
            toast.success(`✅ โค้ด ${data.code} — ส่วนลดค่าจัดส่ง ฿${calcDiscount.toFixed(2)}`);
          }
        } else {
          toast.success(`✅ โค้ด ${data.code} — ลด ฿${calcDiscount.toFixed(2)}`);
        }

        const resolvedTarget = isDeliveryOnly ? "DELIVERY" : (data.applicableCategory || data.discountTarget || "ALL");
        setAppliedPromo({
          code: data.code,
          discountType: data.discountType,
          discountTarget: resolvedTarget,
          applicableCategory: data.applicableCategory ?? (resolvedTarget !== "ALL" && resolvedTarget !== "DELIVERY" ? resolvedTarget : null),
          discountValue: data.discountValue,
          discountAmount: calcDiscount,
          netPayable: Math.max(0, grandTotalBeforePromo - calcDiscount),
          maxDiscount: data.maxDiscount ?? null,
          description: data.description,
        });
      } else {
        setPromoError(data.error || "โค้ดไม่ถูกต้อง");
        toast.error(data.error || "โค้ดส่วนลดไม่ถูกต้อง");
      }
    } catch {
      setPromoError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
      toast.error("ไม่สามารถตรวจสอบโค้ดได้ กรุณาลองใหม่");
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRedeemPromo = async (code: string, receiptNo: string, orderTotal: number, discountAmount: number) => {
    try {
      await fetch(`/api/pos/promo/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, receiptNo, orderTotal, discountAmount }),
      });
      setDialogAvailableCoupons(prev => prev.filter(c => c.code.toUpperCase() !== code.toUpperCase()));
    } catch (e) {
      console.warn("[PromoCode] Redeem failed (non-blocking):", e);
    }
  };

  // Auto-apply best eligible voucher in admin order dialog when enabled in settings
  const [userDismissedPromo, setUserDismissedPromo] = useState<boolean>(false);

  // Reset user dismissed state when customer or modal state changes
  useEffect(() => {
    setUserDismissedPromo(false);
  }, [selectedProfileCustomer?.id, dialogOpen]);

  useEffect(() => {
    const isAutoApply = systemSettings?.posAutoApplyVoucher === "true";
    if (!isAutoApply || isPaidJob) return;
    if (appliedPromo || promoLoading || userDismissedPromo) return;
    if (!selectedProfileCustomer?.id || dialogAvailableCoupons.length === 0 || dialogCart.length === 0) return;

    const deliveryFee = fee || 0;
    const expressRate = serviceSpeed === 'express_50' ? 0.5 : (serviceSpeed === 'express_100' ? 1 : 0);
    const surcharge = expressRate > 0 ? safeCeil(currentLaundryPrice * expressRate) : 0;
    const orderSubtotal = Math.max(0, currentLaundryPrice + surcharge - dialogDiscountAmount);

    let bestCoupon: CustomerCoupon | null = null;
    let highestDiscount = 0;

    for (const coupon of dialogAvailableCoupons) {
      // Never auto-apply a reward coupon onto the exact same job that issued it
      if (editingJobId && coupon.sourceJobId && coupon.sourceJobId === editingJobId) {
        continue;
      }
      // 1. Check brand match
      if (coupon.brand && selectedProfileCustomer.brand && coupon.brand !== selectedProfileCustomer.brand) {
        continue;
      }

      // 2. Check category match & applicable subtotal
      const targetCategory = resolveEffectiveCategory(coupon);
      let applicableSubtotal = orderSubtotal;

      if (targetCategory) {
        const matchingItems = dialogCart.filter((it: any) => isItemMatchingCategory(it, targetCategory));
        if (matchingItems.length === 0) continue;
        applicableSubtotal = matchingItems.reduce((sum: number, it: any) => sum + ((Number(it.price) || 0) * (Number(it.quantity) || 1)), 0);
      }

      // 3. Check minimum spend
      if (coupon.minOrderAmount && applicableSubtotal < coupon.minOrderAmount) {
        continue;
      }

      // 4. Calculate discount amount
      let disc = 0;
      if (coupon.discountType === "PERCENTAGE") {
        disc = applicableSubtotal * (coupon.discountValue / 100);
        if (coupon.maxDiscount && coupon.maxDiscount > 0) {
          disc = Math.min(disc, coupon.maxDiscount);
        }
      } else if (coupon.discountType === "FREE_DELIVERY") {
        if (deliveryFee <= 0) continue;
        disc = coupon.maxDiscount && coupon.maxDiscount > 0 ? Math.min(deliveryFee, coupon.maxDiscount) : deliveryFee;
      } else {
        // FIXED
        disc = Math.min(coupon.discountValue, applicableSubtotal);
      }

      if (disc > highestDiscount) {
        highestDiscount = disc;
        bestCoupon = coupon;
      }
    }

    if (bestCoupon && highestDiscount > 0) {
      handleApplyPromo(bestCoupon.code);
    }
  }, [
    systemSettings?.posAutoApplyVoucher,
    isPaidJob,
    editingJobId,
    appliedPromo,
    promoLoading,
    userDismissedPromo,
    selectedProfileCustomer?.id,
    dialogAvailableCoupons,
    dialogCart,
    currentLaundryPrice,
    serviceSpeed,
    fee,
    dialogDiscountAmount
  ]);

  const handleEditFullJob = (job: Job) => {
    setSaveError(null);
    originalJobRef.current = JSON.parse(JSON.stringify(job));
    editingJobIdRef.current = job.id;
    setEditingJobId(job.id);
    setDialogDiscountPercent(job.discountPercent || 0);
    const hasDiscountOn = job.remark ? job.remark.includes("Discount: on") : false;
    const promoMatch = job.remark?.match(/Promo:\s*([^\s(|]+)(?:\s*\((ALL|DELIVERY|[A-Z_ ]+):([\d.]+)\))?/i);
    const hasValidPromo = Boolean(promoMatch && promoMatch[3] && parseFloat(promoMatch[3]) > 0);
    const hasRawPromo = Boolean(promoMatch && promoMatch[1]);
    setShowDialogDiscount(Boolean(hasDiscountOn || (job.discountPercent && job.discountPercent > 0) || hasValidPromo || hasRawPromo));
    if (promoMatch && promoMatch[1]) {
      const pCode = promoMatch[1].trim().toUpperCase();
      setPromoCodeInput(pCode);
      if (hasValidPromo) {
        const pTarget = (promoMatch[2] || "ALL").trim().toUpperCase();
        const isCatSpecific = pTarget !== "ALL" && pTarget !== "DELIVERY";
        const pAmount = parseFloat(promoMatch[3]);
        setAppliedPromo({
          code: pCode,
          discountType: "FIXED",
          discountTarget: pTarget,
          applicableCategory: isCatSpecific ? pTarget : null,
          discountValue: pAmount,
          discountAmount: pAmount,
          netPayable: Math.max(0, (job.totalAmount || 0)),
          maxDiscount: null,
        });
      } else {
        setAppliedPromo(null);
      }
      setPromoError(null);
    } else {
      setPromoCodeInput("");
      setAppliedPromo(null);
      setPromoError(null);
    }

    const vatMatch = job.remark?.match(/VAT:\s*(\w+)\s*\((\d+(?:\.\d+)?)\%\)/i);
    if (vatMatch) {
      setDialogVatType(vatMatch[1].toLowerCase() as any);
      setDialogVatRate(parseFloat(vatMatch[2]));
    } else {
      const defaultVatType = (systemSettings?.vatType as any) || "none";
      const defaultVatRate = parseFloat(systemSettings?.vatRate || "7") || 7;
      setDialogVatType(defaultVatType);
      setDialogVatRate(defaultVatRate);
    }
    
    setShowJobLogs(false);
    setEditingSubStatus(job.subStatus || null);
    setIsStuck(job.isStuck || false);
    setDialogSelectedCategory(null);
    const itemsList = Array.isArray(job.items) 
      ? job.items 
      : (job.itemsJson 
          ? (() => { try { return JSON.parse(job.itemsJson); } catch { return []; } })() 
          : (typeof (job as any).items === "string" 
              ? (() => { try { return JSON.parse((job as any).items); } catch { return []; } })() 
              : []));
    const mappedCart = itemsList.map((item: any) => {
      // Priority 1: exact serviceId match (most reliable — prevents name collisions like Blouse IRON vs Blouse PCS)
      const matchedById = item.serviceId ? (services.find(s => s.id === item.serviceId) || dialogCorporateServices.find(s => s.id === item.serviceId)) : null;
      // Priority 2: name match (fallback for legacy items without serviceId)
      const matched = matchedById || services.find(s => s.name === item.name || s.nameEn === item.nameEn) || dialogCorporateServices.find(s => s.name === item.name || s.nameEn === item.nameEn);
      // basePrice: use stored value first, then stored item.price (DB is the truth), then catalog as last resort.
      // Using item.price prevents false-positive "custom price" toast when catalog changes since last save.
      const basePrice = item.basePrice !== undefined ? item.basePrice : (item.price || matched?.price || 0);
      return {
        id: item.serviceId || matched?.id || Math.random().toString(), // always prefer stored serviceId
        name: item.name,
        nameEn: item.nameEn || item.name,
        quantity: item.quantity || 1,
        price: item.price || 0,
        basePrice,
        category: item.category || matched?.category || "",
        unit: item.unit || matched?.unit || "pcs"
      };
    });
    // Populate dummy cart item for legacy jobs that lack cart items
    if (mappedCart.length === 0 && job.serviceType) {
      const legacyServicePrice = (job.totalAmount !== undefined && job.totalAmount !== null)
        ? Math.max(0, job.totalAmount - (job.fee || 0))
        : (job.fee || 0);

      if ((job.serviceType as any) === "other") {
        mappedCart.push({
          id: "other",
          name: "Other (Custom Price)",
          nameEn: "Other (Custom Price)",
          quantity: 1,
          price: legacyServicePrice,
          basePrice: legacyServicePrice,
          category: "other",
          unit: "piece"
        });
      } else {
        const matched = services.find(s => s.id === job.serviceType);
        if (matched) {
          mappedCart.push({
            id: matched.id,
            name: matched.name,
            nameEn: matched.nameEn || matched.name,
            quantity: 1,
            price: legacyServicePrice || matched.price,
            basePrice: matched.price,
            category: matched.category,
            unit: matched.unit || "piece"
          });
        }
      }
    }

    setDialogCart(mappedCart);

    // ── Load proforma versioning from DB fields (primary) ──────────────────────────────
    const isRfJob = Boolean(job.id && String(job.id).toUpperCase().startsWith("RF-"));

    // Priority 1: dedicated DB fields added in migration add_proforma_fields
    let loadedProformaNum: string | null = (job as any).proformaNumber || null;
    let loadedRevision: number | null = (job as any).proformaRevision !== undefined && (job as any).proformaRevision !== null ? (job as any).proformaRevision : null;
    let loadedCartHash: string | null = (job as any).proformaCartHash || null;

    // Priority 2: legacy fallback — parse from remark (old jobs before DB fields)
    if (!loadedProformaNum && !isRfJob) {
      const existingProformaMatch = job.remark?.match(/Proforma:\s*(PR-[^\s|]+)/i);
      const existingRevisionMatch = job.remark?.match(/Revision:\s*(\d+)/i);
      loadedProformaNum = cleanProformaNumber((job as any).proformaReceiptNumber || (existingProformaMatch ? existingProformaMatch[1] : null)) || null;
      if (loadedRevision === null && existingRevisionMatch) {
        loadedRevision = parseInt(existingRevisionMatch[1], 10);
      }
    }

    // Priority 3: legacy fallback — parse from billImageUrl filenames (very old jobs)
    if (!loadedProformaNum && job.billImageUrl && !isRfJob) {
      try {
        const billUrls: string[] = JSON.parse(job.billImageUrl);
        for (const url of billUrls) {
          const filename = url.split('/').pop() || '';
          const proformaFileMatch = filename.match(/^proforma-(PR-.+)-rev(\d+)\.png$/i);
          if (proformaFileMatch) {
            // Strip any trailing -R{n} suffix (e.g. "PR-TLS-00009-R1" → "PR-TLS-00009")
            const rawNum = proformaFileMatch[1].replace(/-R\d+$/i, "");
            loadedProformaNum = cleanProformaNumber(rawNum);
            if (loadedRevision === null) loadedRevision = parseInt(proformaFileMatch[2], 10);
            break;
          }
        }
      } catch {}
    }

    // If RF job, ensure proforma number matches clean original ID and revision defaults to at least 1
    if (isRfJob) {
      if (!loadedProformaNum) {
        loadedProformaNum = generateProformaBaseNumber(job.id);
      }
      if (loadedRevision === null || loadedRevision === 0) {
        loadedRevision = 1;
      }
    }

    const hasExistingProforma = Boolean(loadedProformaNum);
    const effectiveRevision: number | null = hasExistingProforma ? (loadedRevision ?? 0) : null;

    setProformaReceiptNumber(loadedProformaNum);
    setProformaRevision(effectiveRevision);

    const speedMatch = job.remark?.match(/Express\s*(\d+)%/i);
    const initialSpeed = speedMatch ? `express_${speedMatch[1]}` : "standard";
    const initialDiscountOn = Boolean(hasDiscountOn || (job.discountPercent && job.discountPercent > 0) || hasValidPromo || hasRawPromo);
    const initialDiscountPercent = initialDiscountOn ? (job.discountPercent || 0) : 0;
    const initialVatType = vatMatch ? (vatMatch[1].toLowerCase() as any) : ((systemSettings?.vatType as any) || "none");
    const initialVatRate = vatMatch ? parseFloat(vatMatch[2]) : (parseFloat(systemSettings?.vatRate || "7") || 7);

    // Initial cart hash: compute from loaded cart items and initial state so that
    // subsequent modifications are accurately detected without false positive revision bumps.
    const initialLoadedCartHash = computeCartHash({
      items: mappedCart,
      serviceSpeed: initialSpeed,
      fee: job.fee || 0,
      discountPercent: initialDiscountPercent,
      promoCode: promoMatch ? promoMatch[1] : null,
      promoDiscount: (promoMatch && promoMatch[3]) ? parseFloat(promoMatch[3]) : 0,
      vatType: initialVatType,
      vatRate: initialVatRate,
    });

    const validLoadedCartHash = loadedCartHash && loadedCartHash.includes('"speed":') ? loadedCartHash : null;
    setLastProformaCartHash(hasExistingProforma ? (validLoadedCartHash || initialLoadedCartHash) : null);
    setProformaPressedSinceLastEdit(false); // reset: user hasn't pressed Proforma yet in this edit session
    setIsDraftPreview(false);
    setShowReceipt(false);
    const rawLaundry = job.laundryTypes as any;
    setLaundryTypes(
      Array.isArray(rawLaundry) 
        ? rawLaundry 
        : (typeof rawLaundry === "string" && rawLaundry.trim() !== "")
          ? rawLaundry.split(",")
          : []
    );
    const foundCustomer = findMatchingCustomer(customers, {
      customerId: job.customerId,
      customerName: job.customerName,
      customerPhone: job.customerPhone,
    });
    setSelectedProfileCustomer(foundCustomer || null);

    const resolvedPhones = resolveCustomerPhones({
      customerPhone: job.customerPhone,
      customer: foundCustomer,
    });
    setCustomerName(job.customerName || "");
    setCustomerPhone(resolvedPhones.primaryPhone);
    const isPickupService = !!job.pickupLocation && !shopLocations.some(s => s.address === job.pickupLocation || s.name === job.pickupLocation || (job.pickupLocation && job.pickupLocation.includes("POS Counter")));
    const isDeliveryService = !!job.dropoffLocation && !shopLocations.some(s => s.address === job.dropoffLocation || s.name === job.dropoffLocation);

    const parseRoom = (loc: string) => {
      const match = loc.match(/^(.*?)(?:\s*\(Room\s*([^)]*)\))+$/i);
      if (match) return { base: match[1].trim(), room: (match[2] || "").trim() };
      return { base: loc, room: "" };
    };

    const custRoom = (foundCustomer?.roomNo || (foundCustomer?.secondaryAddress ? foundCustomer.secondaryAddress.replace(/^Room\s*/i, '') : '') || '').trim();

    const p = isPickupService ? parseRoom(job.pickupLocation || "") : { base: "", room: "" };
    setPickupLoc(p.base);
    setPickupRoom(p.room || custRoom || "");
    setPickupCoords(isPickupService ? job.pickupCoords || null : null);
    
    const d = isDeliveryService ? parseRoom(job.dropoffLocation || "") : { base: "", room: "" };
    setDeliveryLoc(d.base);
    setDeliveryRoom(d.room || custRoom || "");
    if (isDeliveryService && job.dropoffCoords) setDeliveryCoords(job.dropoffCoords);
    else setDeliveryCoords(null);
    const isDifferentAddr = Boolean(
      isPickupService && 
      isDeliveryService && 
      (p.base.trim().toLowerCase() !== d.base.trim().toLowerCase() || (p.room || "").trim() !== (d.room || "").trim())
    );
    setDifferentDeliveryAddress(isDifferentAddr);
    setIsDeliveryDirty(isDifferentAddr);
    setPickupDist(job.pickupDistance || 0);
    setDeliveryDist(job.deliveryDistance || 0);
    const isExp50 = job.remark?.includes("Express 50%");
    const isExp100 = job.remark?.includes("Express 100%");
    const parsedSpeed = isExp100 ? "express_100" : (isExp50 ? "express_50" : "standard");
    setServiceSpeed(parsedSpeed);
    
    const totalMinusFee = job.totalAmount ? job.totalAmount - (job.fee || 0) : 0;
    let basePrice = totalMinusFee;
    const discPct = job.discountPercent || 0;
    const expressRate = isExp100 ? 1 : (isExp50 ? 0.5 : 0);
    const multiplier = (1 + expressRate) * (1 - discPct / 100);
    if (multiplier > 0) {
      basePrice = Math.round(totalMinusFee / multiplier);
    }
    if (mappedCart.length > 0) {
      basePrice = mappedCart.reduce((sum: number, item: any) => sum + Math.ceil((item.price || 0) * (item.quantity || 0)), 0);
    }

    
    setLaundryPrice(basePrice);
    setPaymentMethod(job.isPaid ? 'paid' : 'unpaid');
    setShopPaymentMethod(job.isShopPaid ? 'paid' : 'unpaid');
    setCashPlaced(job.cashPlaced || false);
    let fallbackChannel = job.paymentChannel || "";
    if (!fallbackChannel && job.paymentMethod) {
      const pm = job.paymentMethod.toLowerCase();
      if (pm === "transfer") fallbackChannel = "Transfer";
      else if (pm === "cash") fallbackChannel = "Cash / COD";
      else if (pm === "credit" || pm === "card") fallbackChannel = "Credit Card";
    }
    setPaymentChannel(fallbackChannel);

    if (job.adminNotesJson) {
      try {
        const parsed = JSON.parse(job.adminNotesJson);
        if (Array.isArray(parsed?.payments) && parsed.payments.length >= 2) {
          setSplitPayments(
            parsed.payments.map((p: any) => ({
              id: p.id || `split-${Math.random()}`,
              channel: p.channel || p.method,
              amount: Number(p.amount) || 0,
              note: p.note || "",
            }))
          );
          if (!job.paymentChannel || job.paymentChannel.toLowerCase().includes("split")) {
            setPaymentChannel("Split Payment");
          }
        } else {
          setSplitPayments([]);
          if (fallbackChannel === "Split Payment") {
            setPaymentChannel("");
          }
        }
      } catch {
        setSplitPayments([]);
        if (fallbackChannel === "Split Payment") {
          setPaymentChannel("");
        }
      }
    } else {
      setSplitPayments([]);
      if (fallbackChannel === "Split Payment") {
        setPaymentChannel("");
      }
    }
    setServiceType(job.serviceType || "wash_fold");
    setEditingFeeLock(job.fee);
    const matchedCustomer = foundCustomer;
    setSelectedVIPLabel(matchedCustomer?.isVIP ? "VIP" : "");
    setSelectedMemberLabel(matchedCustomer?.isMember ? "Member" : "");
    setSelectedMemberId(matchedCustomer?.memberId || "");
    setCustomerPriceListId(matchedCustomer?.priceListId || null);
    
    setServiceWeight(2);
    const initialClothingItems: Record<string, { selected: boolean; quantity: number }> = {
      polo: { selected: false, quantity: 1 },
      tshirt: { selected: false, quantity: 1 },
      pants: { selected: false, quantity: 1 },
      dress: { selected: false, quantity: 1 },
      bedsheet: { selected: false, quantity: 1 },
      other: { selected: false, quantity: 1 },
    };
    let otherName = "";

    if (job.items && Array.isArray(job.items)) {
      const labelsReverseMap: Record<string, string> = {
        "Polo Shirt": "polo",
        "T-Shirt": "tshirt",
        "Pants": "pants",
        "Dress": "dress",
        "Bedsheet": "bedsheet"
      };

      job.items.forEach(item => {
        const standardKey = labelsReverseMap[item.name];
        if (standardKey) {
          initialClothingItems[standardKey] = { selected: true, quantity: item.quantity };
        } else {
          initialClothingItems.other = { selected: true, quantity: item.quantity };
          otherName = item.name;
        }
      });
    }

    setClothingItems(initialClothingItems);
    setOtherClothingName(otherName);

    const parseUrls = (imgUrl: any): string[] => {
      if (!imgUrl) return [];
      // Helper to resolve a single value to a full URL
      const resolveUrl = (url: string): string => {
        if (typeof url !== 'string') return '';
        const clean = url.trim().replace(/^[\"'\\]+|[\"'\\]+$/g, '');
        if (!clean || clean === 'null' || clean === 'undefined') return '';
        if (clean.startsWith('http') || clean.startsWith('/')) return clean;
        return `https://storage.googleapis.com/tls-images-test/${clean}`;
      };

      const flattenAndResolve = (val: any): string[] => {
        if (!val) return [];
        if (typeof val === 'string') {
          // Try parsing as JSON (handles nested JSON strings)
          try {
            const inner = JSON.parse(val);
            return flattenAndResolve(inner);
          } catch {
            // Plain URL string
            const resolved = resolveUrl(val);
            return resolved ? [resolved] : [];
          }
        }
        if (Array.isArray(val)) {
          return val.flatMap((item: any) => flattenAndResolve(item));
        }
        return [];
      };

      return flattenAndResolve(imgUrl).filter(Boolean);
    };

    // 🚀 Load images INSTANTLY from the local in-memory job object
    const localBagUrls = parseUrls(job.bagImageUrl);
    const localBillUrls = parseUrls(job.billImageUrl);
    const localPickupUrls = parseUrls(job.pickupProofImageUrl);
    const localDeliveryUrls = parseUrls(job.deliveryProofImageUrl || job.proofImageUrl);

    setBagImageUrls(localBagUrls);
    setBillImageUrls(localBillUrls);
    setPickupProofImageUrls(localPickupUrls);
    setDeliveryProofImageUrls(localDeliveryUrls);
    setOrigBagImageUrls(localBagUrls);
    setOrigBillImageUrls(localBillUrls);
    setOrigPickupProofImageUrls(localPickupUrls);
    setOrigDeliveryProofImageUrls(localDeliveryUrls);

    // No need to show blocking loader because we loaded images instantly!
    setIsDetailLoading(false);

    editingJobIdRef.current = job.id;
    setEditingJobId(job.id);
    setLiveConflictFields([]);
    realtimeStore.clearExternalJobUpdate(job.id);

    // Image URLs are already included in JOB_SELECT_FIELDS and synced via SSE/delta.
    // Only fetch /details as a fallback if the job record was partially loaded.
    if (job.bagImageUrl === undefined && job.billImageUrl === undefined) {
      fetch(`/api/jobs/${job.id}/details`)
        .then(r => r.json())
        .then(data => {
          if (editingJobIdRef.current !== job.id) return;
          const remoteBagUrls = parseUrls(data.bagImageUrl);
          const remoteBillUrls = parseUrls(data.billImageUrl);
          const remotePickupUrls = parseUrls(data.pickupProofImageUrl);
          const remoteDeliveryUrls = parseUrls(data.deliveryProofImageUrl || data.proofImageUrl);

          if (JSON.stringify(remoteBagUrls) !== JSON.stringify(localBagUrls)) { setBagImageUrls(remoteBagUrls); setOrigBagImageUrls(remoteBagUrls); }
          if (JSON.stringify(remoteBillUrls) !== JSON.stringify(localBillUrls)) { setBillImageUrls(remoteBillUrls); setOrigBillImageUrls(remoteBillUrls); }
          if (JSON.stringify(remotePickupUrls) !== JSON.stringify(localPickupUrls)) { setPickupProofImageUrls(remotePickupUrls); setOrigPickupProofImageUrls(remotePickupUrls); }
          if (JSON.stringify(remoteDeliveryUrls) !== JSON.stringify(localDeliveryUrls)) { setDeliveryProofImageUrls(remoteDeliveryUrls); setOrigDeliveryProofImageUrls(remoteDeliveryUrls); }
        })
        .catch(e => console.error("Failed to fetch job details images in background", e));
    }
    
    setAdminNote(job.remark || "");
    try {
      if (job.adminNotesJson) {
        const parsed = JSON.parse(job.adminNotesJson);
        if (Array.isArray(parsed)) {
          setAdminLogs(parsed.map((log: any) => ({ ...log, isNew: false })));
        } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.notes)) {
          setAdminLogs(parsed.notes.map((log: any) => ({ ...log, isNew: false })));
        } else {
          setAdminLogs([]);
        }
      } else {
        setAdminLogs([]);
      }
    } catch (e) {
      setAdminLogs([]);
    }
    setIsPickupLobby(job.remark ? job.remark.includes("Pickup: Leave at Lobby") : false);
    setIsPickupMeet(job.remark ? job.remark.includes("Pickup: Meet up") : false);
    setIsDeliveryLobby(job.remark ? job.remark.includes("Delivery: Leave at Lobby") : false);
    setIsDeliveryMeet(job.remark ? job.remark.includes("Delivery: Meet up") : false);
    const loadedPacking = getJobPackingCounts(job);
    setHasHanger(loadedPacking.hangerCount > 0);
    setHangerCount(loadedPacking.hangerCount);
    setHasFolded(loadedPacking.foldedCount > 0);
    setFoldedCount(loadedPacking.foldedCount);
    setProcessingBranchId(getJobProcessingBranchId(job) || "");
    const loadedIsRewash = isRewashOrNoChargeJob(job);
    const loadedIsSplitChild = isSplitDeliveryChildJob(job);
    const loadedRewashFrom = getRewashFromJobId(job);
    const loadedNoComm = isNoRiderCommissionJob(job);
    setIsRewashJob(loadedIsRewash);
    setRewashFromJobId(loadedRewashFrom);
    setNoRiderCommission(loadedNoComm);
    setIsFreeDelivery(Boolean((job.remark && job.remark.includes("Free Delivery")) || loadedIsRewash || loadedIsSplitChild));
    if (loadedIsRewash) {
      setPaymentChannel("Rewash / No Charge");
      setPaymentMethod("paid");
      setShopPaymentMethod("paid");
    } else if (loadedIsSplitChild) {
      setPaymentChannel("Pre-paid / Split Delivery");
      setPaymentMethod("paid");
      setShopPaymentMethod("paid");
    }
    const safeDate = (val: any, fallbackMs: number) => {
      if (!val) return new Date(fallbackMs);
      const d = new Date(val);
      return isNaN(d.getTime()) ? new Date(fallbackMs) : d;
    };
    setPickupScheduledTime(format(roundToNearest30(safeDate(job.pickupScheduledAt || job.scheduledAt, Date.now())), "yyyy-MM-dd'T'HH:mm"));
    setDeliveryScheduledTime(format(roundToNearest30(safeDate(job.deliveryScheduledAt, Date.now() + 86400000)), "yyyy-MM-dd'T'HH:mm"));
    setPickupRiderId(job.pickupRiderId || "");
    setDeliveryRiderId(job.deliveryRiderId || "");

    setIsPickup(isPickupService);
    setIsDelivery(isDeliveryService);
    setIsWalkIn(job.source === 'pos' || (job.type as string) === 'in_store');

    const branchIndex = shopLocations.findIndex(s => s.id === job.branchId);
    setSelectedStoreIndex(branchIndex >= 0 ? branchIndex : 0);

    setBillNo(job.billNo || "");
    let isTaxReq = Boolean(job.remark && (job.remark.includes("ขอใบกำกับภาษี") || job.remark.includes("Tax Invoice") || job.remark.includes("Req Tax Inv")));
    if (job.adminNotesJson) {
      try {
        const parsed = JSON.parse(job.adminNotesJson);
        if (parsed && typeof parsed === "object" && parsed.isTaxInvoiceRequested !== undefined) {
          isTaxReq = Boolean(parsed.isTaxInvoiceRequested);
        }
      } catch (e) {}
    }
    setIsTaxInvoiceRequested(isTaxReq);
    setAdminNoteInput("");

    setShowNoteUploader(false);
    if (noteUploaderRef.current) {
      noteUploaderRef.current.reset();
    }
    setShowJobLogs(false);
    setDialogOpen(true);
    setNoteLogsModalOpen(false);
    setPreviewAdminNoteImage(null);
  };


  async function handleCreate(isPayment: boolean = false) {
    if (isSubmittingLockRef.current) {
      console.warn("handleCreate blocked: submit is already in progress");
      return;
    }
    isSubmittingLockRef.current = true;
    setIsSubmitting(true);

    const abortSubmit = (msg?: string) => {
      if (msg) toast.error(msg);
      isSubmittingLockRef.current = false;
      setIsSubmitting(false);
    };

    if (isPickup && !pickupLoc.trim()) {
      abortSubmit("Please fill in the pickup location.");
      return;
    }
    if (isDelivery && !deliveryLoc.trim()) {
      abortSubmit("Please fill in the delivery location.");
      return;
    }
    // No service type selected is allowed — Package/Online sale (will be set to TBA or completed)

    // Shift check disabled (CASHIER_SHIFT_ENABLED=false)
    // if (isPosEnabled && isShiftFromPreviousDay) { ... }


    if (!isRewashJob && paymentMethod === 'paid' && (!paymentChannel || !paymentChannel.trim())) {
      abortSubmit(currentLanguage === "en" ? "Please select a payment channel." : "กรุณาเลือกช่องทางการชำระเงิน (Payment Channel)");
      return;
    }

    const existingJob = editingJobId ? (jobs.find(j => String(j.id) === String(editingJobId)) || originalJobRef.current) : null;
    const isAlreadyCompleted = existingJob?.status === "completed";
    
    const shop = shopLocations[selectedStoreIndex] || shopLocations[0];
    const targetShift = (isWalkIn && activeShift && activeShift.branchId === shop.id) ? activeShift : null;

    const targetShiftId = targetShift?.id || (existingJob ? (existingJob as any).shiftId : null) || null;

    const getValidDateOrNull = (timeStr: string): Date | null => {

      if (!timeStr) return null;
      try {
        const d = parseTime(timeStr);
        return (d instanceof Date && !isNaN(d.getTime())) ? d : null;
      } catch {
        return null;
      }
    };

    const validPickupDate = getValidDateOrNull(pickupScheduledTime);
    const validDeliveryDate = getValidDateOrNull(deliveryScheduledTime);
    let finalBagImageUrls: string[] = [];
    let finalBillImageUrls: string[] = [];
    let finalPickupProofUrls: string[] = [];
    let finalDeliveryProofUrls: string[] = [];
    const targetEditingJobId = editingJobId;
    const isEditMode = !!targetEditingJobId;

    // Trigger upload promises concurrently
    const bagUploadPromise = uploaderRef.current ? uploaderRef.current.startUpload() : Promise.resolve(finalBagImageUrls);
    const billUploadPromise = billUploaderRef.current ? billUploaderRef.current.startUpload() : Promise.resolve(finalBillImageUrls);
    const pickupUploadPromise = (isAdmin && pickupUploaderRef.current) ? pickupUploaderRef.current.startUpload() : Promise.resolve(pickupProofImageUrls);
    const deliveryUploadPromise = (isAdmin && deliveryUploaderRef.current) ? deliveryUploaderRef.current.startUpload() : Promise.resolve(deliveryProofImageUrls);

    const oldRemarks = adminNote.split(" | ").map(r => r.trim()).filter(Boolean);
    const customRemarks = Array.from(new Set(oldRemarks.filter(r => 
      !["Free Delivery", "Rewash", "No Rider Comm", "Express 50%", "Express 100%", "Pickup: Leave at Lobby", "Pickup: Meet up", "Delivery: Leave at Lobby", "Delivery: Meet up", "ขอใบกำกับภาษี", "Tax Invoice", "Req Tax Inv"].includes(r) &&
      !r.startsWith("Rewash #") &&
      !r.startsWith("VAT:") &&
      !r.startsWith("Proforma:") &&
      !r.startsWith("Revision:") &&
      !r.startsWith("Promo:") &&
      !r.startsWith("Discount:")
    )));

    let finalAdminLogs = Array.isArray(adminLogs) ? [...adminLogs] : [];
    const pendingNoteText = adminNoteInput.trim();
    if (pendingNoteText) {
      const nowMs = Date.now();
      const alreadyAddedRecently = finalAdminLogs.some(
        (existing) =>
          existing.text === pendingNoteText &&
          existing.userId === (user?.id || "unknown") &&
          Math.abs(nowMs - new Date(existing.timestamp || 0).getTime()) < 15000
      );
      if (!alreadyAddedRecently) {
        finalAdminLogs.push({
          id: Math.random().toString(36).substring(7),
          userId: user?.id || "unknown",
          userName: (user as any)?.name || user?.email || "Admin",
          text: pendingNoteText,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Business Logic Audit Log when Rewash or No Rider Commission is toggled on an existing job
    if (editingJobId && existingJob) {
      const prevWasRewash = isRewashOrNoChargeJob(existingJob);
      const prevWasNoComm = isNoRiderCommissionJob(existingJob);
      const staffActor = (user as any)?.name || user?.email || "Admin";
      if (isRewashJob !== prevWasRewash) {
        finalAdminLogs.push({
          id: Math.random().toString(36).substring(7),
          userId: user?.id || "system",
          userName: staffActor,
          text: isRewashJob
            ? `[Audit] Marked order as Rewash / Claim (฿0 No Charge, ฿0 Rider Commission)`
            : `[Audit] Unmarked Rewash / Claim status`,
          timestamp: new Date().toISOString(),
        });
      } else if (noRiderCommission !== prevWasNoComm) {
        finalAdminLogs.push({
          id: Math.random().toString(36).substring(7),
          userId: user?.id || "system",
          userName: staffActor,
          text: noRiderCommission
            ? `[Audit] Enabled No Rider Commission override (Pickup: ฿0, Delivery: ฿0)`
            : `[Audit] Disabled No Rider Commission override`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    const itemsPayload = dialogCart.map(item => ({
      name: item.name,
      nameEn: item.nameEn || item.name,
      quantity: item.quantity,
      price: isRewashJob ? 0 : item.price,
      basePrice: item.basePrice,
      serviceId: item.id,
      category: item.category,
      unit: item.unit || 'pcs' // M4 Fix: include unit field so reports can distinguish kg vs pcs
    }));

    const uniqueCategories = Array.from(new Set(dialogCart.map(item => item.category).filter(Boolean)));
    const derivedLaundryTypes = uniqueCategories.length > 0 ? uniqueCategories : undefined;

    const subtotal = isRewashJob ? 0 : dialogCart.reduce((sum, item) => sum + safeCeil((item.price || 0) * (item.quantity || 0)), 0);

    const expressRate = serviceSpeed === "express_50" ? 0.5 : (serviceSpeed === "express_100" ? 1 : 0);
    const surcharge = (!isRewashJob && expressRate > 0) ? safeCeil(subtotal * expressRate) : 0;

    // Discount on (subtotal + surcharge), then subtract promo discount (only if applied via Apply button), then add fee and VAT
    const discountVal = (!isRewashJob && showDialogDiscount) ? (subtotal + surcharge) * (dialogDiscountPercent / 100) : 0;
    const promoDisc = (!isRewashJob && appliedPromo) ? promoDiscountAmount : 0;
    const baseTotal = isRewashJob ? 0 : (subtotal + surcharge - discountVal - promoDisc + fee);
    const vatVal = (!isRewashJob && dialogVatType === "exclusive") ? (baseTotal * (dialogVatRate / 100)) : 0;
    const calculatedTotal = isRewashJob ? 0 : roundGrandTotal(Math.max(0, baseTotal + vatVal), dialogVatType);

    const now = new Date();
    const effectiveCreatedAt = editingJobId 
      ? (existingJob?.createdAt ? new Date(existingJob.createdAt) : now) 
      : (proformaReceiptNumber ? draftCreatedAt : now);
      
    if (!editingJobId && !proformaReceiptNumber) {
      setDraftCreatedAt(now);
    }

    if (serviceType === 'other') {
      const hasOther = itemsPayload.some(i => i.name.toLowerCase().includes('other'));
      if (!hasOther) {
        itemsPayload.push({
          name: "Other (Custom Service)",
          nameEn: "Other (Custom Service)",
          quantity: 1,
          price: laundryPrice || 0,
          basePrice: laundryPrice || 0,
          serviceId: "other",
          category: "other",
          unit: "pcs"
        });
      }
    }

    let existingPayments: any[] = [];
    let existingParsedNotes: any = {};
    if (existingJob && existingJob.adminNotesJson) {
      try {
        const parsed = JSON.parse(existingJob.adminNotesJson);
        if (parsed && typeof parsed === "object") {
          existingParsedNotes = parsed;
          if (Array.isArray(parsed.payments)) {
            existingPayments = parsed.payments;
          }
        }
      } catch (e) {}
    }

    const alreadyPaidTotal = existingPayments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const remainingToPay = Math.max(0, calculatedTotal - alreadyPaidTotal);

    const isSplitPayment = splitPayments.length >= 2;
    const splitMemberDeductAmt = isSplitPayment 
      ? splitPayments.filter(s => s.channel === "Deduct Member").reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
      : 0;

    const isAlreadyPaidJob = (isPaidJob || Boolean(existingJob?.isShopPaid)) && remainingToPay <= 0;
    const isNewDeduction = (paymentChannel === "Deduct Member" || splitMemberDeductAmt > 0) && isPayment && !isAlreadyPaidJob;
    const effectiveMemberDeduct = isSplitPayment ? splitMemberDeductAmt : remainingToPay;

    if (!isAlreadyPaidJob && (paymentChannel === "Deduct Member" || splitMemberDeductAmt > 0) && !selectedProfileCustomer?.isMember) {
      abortSubmit("Customer is not a member. Cannot use Deduct Member payment channel.");
      return;
    }

    if (isNewDeduction) {
      if (isWalletExpired(selectedProfileCustomer)) {
        abortSubmit("Wallet ของลูกค้ารายนี้หมดอายุการใช้งานแล้ว ไม่สามารถตัดเงินได้ กรุณาให้ลูกค้า Top Up เพื่อต่ออายุ");
        return;
      }
      const currentBalance = selectedProfileCustomer?.creditBalance || 0;
      if (currentBalance < effectiveMemberDeduct) {
        abortSubmit(`ยอดเงิน Wallet ไม่เพียงพอ (มี ${formatBaht(currentBalance)}, ต้องการ ${formatBaht(effectiveMemberDeduct)})`);
        return;
      }
    }

    if (isPayment && paymentChannel === "Split Payment") {
      if (splitPayments.length < 2) {
        abortSubmit("กรุณาระบุช่องทางการแบ่งชำระอย่างน้อย 2 ช่องทาง หรือเลือกช่องทางการชำระเงินแบบเดี่ยว");
        return;
      }
      const splitTotal = Math.round(splitPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0) * 100) / 100;
      if (Math.abs(splitTotal - Math.round(remainingToPay * 100) / 100) > 0.01) {
        abortSubmit(`ยอดรวมของการแบ่งชำระ (฿${splitTotal.toFixed(2)}) ไม่ตรงกับยอดที่ต้องชำระ (฿${remainingToPay.toFixed(2)}) กรุณากดแก้ไขยอดแบ่งชำระให้ตรงกับยอดบิล`);
        return;
      }
    }

    const currentCartHash = computeCartHash({
      items: dialogCart,
      serviceSpeed,
      fee,
      discountPercent: showDialogDiscount ? dialogDiscountPercent : 0,
      promoCode: appliedPromo?.code || promoCodeInput.trim() || null,
      promoDiscount: appliedPromo ? promoDiscountAmount : 0,
      vatType: dialogVatType,
      vatRate: dialogVatRate,
    });

    // Proforma should only be preserved/used if it was explicitly generated/exists
    let existingProformaNum = (proformaReceiptNumber && proformaReceiptNumber !== "DRAFT")
      ? cleanProformaNumber(proformaReceiptNumber)
      : (existingJob ? (cleanProformaNumber((existingJob as any).proformaNumber) || null) : null);

    const isRfJob = Boolean(targetEditingJobId && targetEditingJobId.startsWith("RF-"));
    const cleanOriginalId = targetEditingJobId ? formatJobDisplayId(targetEditingJobId).replace(/^RF-/i, "") : "";

    if (targetEditingJobId && isRfJob) {
      existingProformaNum = existingProformaNum || (cleanOriginalId ? `PR-${cleanOriginalId}` : generateProformaBaseNumber(targetEditingJobId));
    }

    const isNewJobProformaRequested = !editingJobId && (proformaReceiptNumber === "DRAFT" || proformaPressedSinceLastEdit);

    const rawExistingHash = (existingJob as any)?.proformaCartHash;
    const validExistingHash = rawExistingHash && rawExistingHash.includes('"speed":') ? rawExistingHash : null;
    const baseCartHashToCompare = validExistingHash || lastProformaCartHash;
    const isCartChangedFromLastProforma = Boolean(
      baseCartHashToCompare
        ? currentCartHash !== baseCartHashToCompare
        : existingJob && (
            Math.abs((Number(existingJob.totalAmount) || 0) - calculatedTotal) > 0.01 ||
            (existingJob.itemsJson && (() => {
              try {
                const oldArr = JSON.parse(existingJob.itemsJson);
                return computeCartHash({ items: oldArr }) !== computeCartHash({ items: dialogCart });
              } catch {
                return false;
              }
            })()) ||
            Math.abs((Number(existingJob.fee) || 0) - fee) > 0.01
          )
    );

    const hasActualItems = Boolean((itemsPayload && itemsPayload.length > 0) || (dialogCart && dialogCart.length > 0));

    let targetProformaNum: string | null = null;
    let effectiveProformaRevision: number | null = null;
    let effectiveProformaCartHash: string | null = null;

    if (isPayment) {
      // ── Payment flow (Pay button clicked) ───────────────────────────
      // Rule: Paid job always has a paired Proforma ONLY IF it has actual laundry items!
      // If there are NO actual items (e.g. initial booking with delivery fee only), do NOT auto-generate proforma!
      const hasPriorProforma = Boolean(existingProformaNum || (proformaPressedSinceLastEdit && proformaReceiptNumber && proformaReceiptNumber !== "DRAFT"));

      if (!hasActualItems && !proformaPressedSinceLastEdit) {
        // Guard: 0-item job (delivery fee only) must NEVER auto-generate Proforma!
        targetProformaNum = existingProformaNum || null;
        effectiveProformaRevision = proformaRevision;
        effectiveProformaCartHash = (existingJob as any)?.proformaCartHash || null;
      } else if (hasPriorProforma) {
        targetProformaNum = existingProformaNum || (proformaReceiptNumber && proformaReceiptNumber !== "DRAFT" ? cleanProformaNumber(proformaReceiptNumber) : null);
        if (!targetProformaNum && targetEditingJobId) {
          targetProformaNum = generateProformaBaseNumber(targetEditingJobId);
        }

        if (isCartChangedFromLastProforma && !proformaPressedSinceLastEdit) {
          // Items were edited and user clicked Pay directly -> Auto-bump revision!
          effectiveProformaRevision = (proformaRevision !== null ? proformaRevision : (isRfJob ? 1 : 0)) + 1;
          effectiveProformaCartHash = currentCartHash;
        } else {
          effectiveProformaRevision = isRfJob ? Math.max(1, proformaRevision ?? 1) : (proformaRevision ?? 0);
          effectiveProformaCartHash = baseCartHashToCompare || currentCartHash;
        }
      } else {
        // Job NEVER had a Proforma before, but user clicked Pay with actual items:
        // Rule: Create Proforma Rev 0 paired with it!
        targetProformaNum = targetEditingJobId ? generateProformaBaseNumber(targetEditingJobId) : null;
        effectiveProformaRevision = isRfJob ? 1 : 0;
        effectiveProformaCartHash = currentCartHash;
      }

      setProformaReceiptNumber(targetProformaNum);
      setProformaRevision(effectiveProformaRevision);
      setLastProformaCartHash(effectiveProformaCartHash);
      if (lastPaidProformaInfoRef) {
        lastPaidProformaInfoRef.current = targetProformaNum ? { id: targetProformaNum, rev: effectiveProformaRevision ?? 0 } : null;
      }
    } else {
      // ── Save Changes flow (isPayment === false) ────────────────────
      // Rule: Revision will ONLY bump if user explicitly pressed Proforma in this session.
      // Saving edits without pressing Proforma retains the existing revision (or null if never issued).
      if (proformaPressedSinceLastEdit) {
        targetProformaNum = (proformaReceiptNumber && proformaReceiptNumber !== "DRAFT")
          ? cleanProformaNumber(proformaReceiptNumber)
          : (targetEditingJobId ? generateProformaBaseNumber(targetEditingJobId) : null);
        effectiveProformaRevision = isRfJob ? Math.max(1, proformaRevision ?? 1) : (proformaRevision ?? 0);
        effectiveProformaCartHash = currentCartHash;
      } else if (existingProformaNum) {
        targetProformaNum = existingProformaNum;
        if (isCartChangedFromLastProforma && !isAlreadyPaidJob) {
          // Smart Auto-Regen: Items / weights / fee changed on unpaid job with existing proforma -> bump revision!
          effectiveProformaRevision = (proformaRevision !== null ? proformaRevision : (isRfJob ? 1 : 0)) + 1;
          effectiveProformaCartHash = currentCartHash;
        } else {
          effectiveProformaRevision = isRfJob ? Math.max(1, proformaRevision ?? 1) : (proformaRevision ?? 0);
          effectiveProformaCartHash = (existingJob as any)?.proformaCartHash || lastProformaCartHash || currentCartHash;
        }
      } else {
        // Job had NO proforma and user did NOT press Proforma button -> keep null!
        targetProformaNum = null;
        effectiveProformaRevision = null;
        effectiveProformaCartHash = null;
      }

      setProformaReceiptNumber(targetProformaNum);
      setProformaRevision(effectiveProformaRevision);
      setLastProformaCartHash(effectiveProformaCartHash);
    }
    const cannotDeduct = !isAlreadyPaidJob && isPayment && (
      (paymentChannel === "Deduct Member" && (((selectedProfileCustomer?.creditBalance || 0) < remainingToPay) || isWalletExpired(selectedProfileCustomer))) ||
      (isSplitPayment && splitMemberDeductAmt > 0 && (((selectedProfileCustomer?.creditBalance || 0) < splitMemberDeductAmt) || isWalletExpired(selectedProfileCustomer)))
    );

    // Billing stage transition guard on save:
    // Orders in Billing stage can only advance to the next stage by CSO, Admin, or Branch Manager, with Bill Sent clicked.
    const isCurrentlyInBilling = existingJob && existingJob.status === "billing" && (!existingJob.subStatus || existingJob.subStatus === "billing");
    const isAdvancingToNextStage = false;
    if (isCurrentlyInBilling && isAdvancingToNextStage) {
      if (!canAdvanceBilling) {
        toast.error("Orders in Billing stage can only be moved to the next stage by CSO, Admin, or Branch Managers");
        setIsSubmitting(false);
        return;
      }
      let isBillSentCheck = Boolean(isRewashJob || isRewashOrNoChargeJob(existingJob) || isSplitDeliveryChildJob(existingJob));
      if (!isBillSentCheck && existingJob.adminNotesJson) {
        try {
          const p = JSON.parse(existingJob.adminNotesJson);
          if (p && typeof p === "object") isBillSentCheck = Boolean(p.isBillSent);
        } catch {}
      }
      if (!isBillSentCheck) {
        toast.error("Cannot move to next stage: Bill must be marked as Sent to Customer first (Bill Sent ✓)");
        setIsSubmitting(false);
        return;
      }
    }

    const isSplitChildJob = Boolean(editingJobId && existingJob && isSplitDeliveryChildJob(existingJob));
    const isNoChargePrepaidJob = Boolean(isRewashJob || isSplitChildJob);

    const newJobData: any = {


      isStuck,
      createdAt: effectiveCreatedAt,
      discount: isNoChargePrepaidJob ? 0 : (discountVal + (appliedPromo ? promoDiscountAmount : 0)),
      discountPercent: (!isNoChargePrepaidJob && showDialogDiscount) ? dialogDiscountPercent : 0,
      customerId: selectedProfileCustomer?.id || (existingJob ? existingJob.customerId : null) || null,
      items: itemsPayload,
      type: (isAlreadyPaidJob && existingJob?.type)
        ? existingJob.type
        : (isWalkIn ? (isDelivery ? "delivery" : "in_store") : ((isPickup && isDelivery) ? "full_service" : (isPickup ? "pickup" : (isDelivery ? "delivery" : "in_store")))),
      subStatus: isWalkIn && !editingSubStatus ? "billing" : editingSubStatus,
      source: isWalkIn ? "pos" : "app",
      status: (() => {
        const isNoService = !isPickup && !isDelivery && !isWalkIn;
        // Package/Online sale — no service type selected
        if (isNoService) {
          return (paymentMethod === 'paid' || isNoChargePrepaidJob) ? 'completed' : 'tba';
        }
        // Normal laundry job: when marked 'ready', move to 'delivery' status for all jobs (including Walk-In)
        // so that finished laundry waits in Delivery column for actual handover to customer
        if (!isAlreadyCompleted && editingSubStatus === 'ready') {
          return 'delivery';
        }
        // If creating a new Delivery-only job, start directly in Process (billing)
        if (!editingJobId && !isPickup && isDelivery) {
          return 'billing';
        }
        // For existing jobs, keep current status. For new jobs, let api.ts decide (tba vs pending based on creatorRole)
        return (editingJobId && existingJob) ? existingJob.status : undefined;
      })(),
      laundryTypes: derivedLaundryTypes,

      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickupLocation: isPickup ? (() => {
        const baseLoc = stripRoomSuffix(pickupLoc);
        const cleanRoom = (pickupRoom || "").replace(/^Room\s*/i, '').trim();
        return cleanRoom ? `${baseLoc} (Room ${cleanRoom})` : baseLoc;
      })() : shop.address,
      dropoffLocation: isDelivery ? (() => {
        const baseLoc = stripRoomSuffix(deliveryLoc);
        const cleanRoom = (deliveryRoom || "").replace(/^Room\s*/i, '').trim();
        return cleanRoom ? `${baseLoc} (Room ${cleanRoom})` : baseLoc;
      })() : shop.address,
      pickupCoords: isPickup ? pickupCoords : shop.coords,
      dropoffCoords: isDelivery ? deliveryCoords : shop.coords,
      scheduledAt: (isPickup ? validPickupDate : (isDelivery ? validDeliveryDate : null)) || new Date(),
      pickupScheduledAt: isPickup ? validPickupDate : null,
      pickupScheduledEndAt: isPickup && validPickupDate ? new Date(validPickupDate.getTime() + 30 * 60000) : null,
      deliveryScheduledAt: isDelivery ? validDeliveryDate : null,
      deliveryScheduledEndAt: isDelivery && validDeliveryDate ? new Date(validDeliveryDate.getTime() + 30 * 60000) : null,
      pickupRiderId: isPickup ? pickupRiderId || null : null,
      deliveryRiderId: isDelivery ? deliveryRiderId || null : null,
      paymentMethod: null, // paymentMethod field is legacy — use isPaid + paymentChannel instead
      isPaid: isNoChargePrepaidJob ? true : (cannotDeduct ? false : (isPaidJob || (isPayment && remainingToPay <= 0) || (isPayment && alreadyPaidTotal + remainingToPay >= calculatedTotal) || (alreadyPaidTotal >= calculatedTotal && calculatedTotal > 0) || (isWalkIn ? false : paymentMethod === 'paid'))),
      isShopPaid: isNoChargePrepaidJob ? true : (cannotDeduct ? false : (isPaidJob || (isPayment && remainingToPay <= 0) || (isPayment && alreadyPaidTotal + remainingToPay >= calculatedTotal) || (alreadyPaidTotal >= calculatedTotal && calculatedTotal > 0) || (editingJobId ? Boolean(existingJob?.isShopPaid) : false))),

      fee: isNoChargePrepaidJob ? 0 : ((isAlreadyPaidJob && existingJob && !isCartChangedFromLastProforma && !isPayment) ? (existingJob.fee ?? 0) : fee),
      totalAmount: isNoChargePrepaidJob ? 0 : ((isAlreadyPaidJob && existingJob && !isCartChangedFromLastProforma && !isPayment) ? (Number(existingJob.totalAmount) || 0) : calculatedTotal),
      billNo: billNo?.trim() || null,
      serviceType: dialogCart[0]?.id || "wash_fold",

      pickupDistance: isPickup ? pickupDist : 0,
      deliveryDistance: isDelivery ? deliveryDist : 0,
      distance: (isDelivery && deliveryDist) ? deliveryDist : (isPickup ? pickupDist : 0),
      shiftId: targetShiftId,
      pickupCommission: (isRewashJob || noRiderCommission || isSplitChildJob)
        ? 0
        : (isPickup 
          ? ((editingJobId && existingJob && (existingJob.status === 'billing' || existingJob.status === 'delivery' || existingJob.status === 'completed') && (existingJob.pickupCommission ?? 0) > 0) 
              ? (existingJob.pickupCommission ?? 0) 
              : calculateRiderCommission({
                  customer: selectedProfileCustomer || (editingJobId ? findMatchingCustomer(customers, { customerId: existingJob?.customerId, customerName: existingJob?.customerName, customerPhone: existingJob?.customerPhone }) : null),
                  isPickup,
                  pickupDist,
                  isDelivery,
                  deliveryDist,
                  systemSettings,
                  isVIP: Boolean(selectedVIPLabel),
                  isFreeDelivery: activeIsFreeDelivery,
                  isRewash: isRewashJob,
                  noRiderCommission,
                }).pickupCommission) 
          : 0),
      deliveryCommission: (isRewashJob || noRiderCommission)
        ? 0
        : (isDelivery 
          ? ((editingJobId && existingJob && (existingJob.status === 'completed' || existingJob.legs?.deliveryOutbound?.status === 'completed') && (existingJob.deliveryCommission ?? 0) > 0) 
              ? (existingJob.deliveryCommission ?? 0) 
              : calculateRiderCommission({
                  customer: selectedProfileCustomer || (editingJobId ? findMatchingCustomer(customers, { customerId: existingJob?.customerId, customerName: existingJob?.customerName, customerPhone: existingJob?.customerPhone }) : null),
                  isPickup,
                  pickupDist,
                  isDelivery,
                  deliveryDist,
                  systemSettings,
                  isVIP: Boolean(selectedVIPLabel),
                  isFreeDelivery: isSplitChildJob ? false : activeIsFreeDelivery,
                  isRewash: isRewashJob,
                  noRiderCommission,
                }).deliveryCommission) 
          : 0),
      remark: Array.from(new Set([
        targetProformaNum ? `Proforma: ${cleanProformaNumber(targetProformaNum)}${effectiveProformaRevision !== null && effectiveProformaRevision > 0 ? `-R${effectiveProformaRevision}` : ""}` : "",
        isRewashJob ? (rewashFromJobId ? `Rewash #${rewashFromJobId}` : "Rewash") : "",
        (noRiderCommission || isRewashJob) ? "No Rider Comm" : "",
        ...customRemarks,
        (!isNoChargePrepaidJob && showDialogDiscount) ? "Discount: on" : "",
        activeIsFreeDelivery ? "Free Delivery" : "",
        serviceSpeed === "express_50" ? "Express 50%" : "",
        serviceSpeed === "express_100" ? "Express 100%" : "",
        isPickup ? (isPickupLobby ? "Pickup: Leave at Lobby" : (isPickupMeet ? "Pickup: Meet up" : "")) : "",
        isDelivery ? (isDeliveryLobby ? "Delivery: Leave at Lobby" : (isDeliveryMeet ? "Delivery: Meet up" : "")) : "",
        (!isNoChargePrepaidJob && dialogVatType !== "none") ? `VAT: ${dialogVatType} (${dialogVatRate}%)` : "",
        isTaxInvoiceRequested ? "Req Tax Inv" : "",
        (!isNoChargePrepaidJob && (showDialogDiscount || appliedPromo || promoCodeInput.trim())) ? (
          appliedPromo
            ? `Promo: ${appliedPromo.code} (${appliedPromo.discountTarget}:${promoDiscountAmount})`
            : (promoCodeInput.trim() ? `Promo: ${promoCodeInput.trim().toUpperCase()}` : "")
        ) : "",
      ].filter(Boolean))).join(" | ") || null,
      adminNotesJson: (() => {
        const finalPayments = [...existingPayments];

        if (isPayment && remainingToPay > 0 && !isNoChargePrepaidJob) {
          if (isSplitPayment) {
            splitPayments.forEach((sp) => {
              const pMethod = mapChannelNameToMethod(sp.channel, getPaymentChannels(systemSettings));
              finalPayments.push({
                id: sp.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`),
                amount: Number(sp.amount) || 0,
                method: pMethod,
                channel: sp.channel,
                timestamp: new Date().toISOString(),
                shiftId: targetShiftId,
                paidBy: user?.name || user?.email || "Admin",
                note: sp.note || null,
              });
            });
          } else {
            const pMethod = mapChannelNameToMethod(paymentChannel, getPaymentChannels(systemSettings));
            finalPayments.push({
              id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              amount: remainingToPay,
              method: pMethod,
              channel: paymentChannel || "Cash / COD",
              timestamp: new Date().toISOString(),
              shiftId: targetShiftId,
              paidBy: user?.name || user?.email || "Admin"
            });
          }
        }

        const cleanLogs = finalAdminLogs.map(({ isNew, ...rest }) => rest);
        const notesObj: any = {
          ...existingParsedNotes,
          notes: cleanLogs,
          isTaxInvoiceRequested,
          isRewash: Boolean(isRewashJob),
          rewashFromJobId: isRewashJob ? (rewashFromJobId || null) : null,
          noRiderCommission: Boolean(noRiderCommission || isRewashJob),
          hangerCount: hasHanger ? Math.max(0, Number(hangerCount) || 0) : 0,
          foldedCount: hasFolded ? Math.max(0, Number(foldedCount) || 0) : 0,
          processingBranchId: (processingBranchId && processingBranchId !== shop.id) ? processingBranchId : null,
        };
        if (isNoChargePrepaidJob) {
          notesObj.isBillSent = true;
        }
        if (false && editingSubStatus && ['wash', 'dry', 'iron', 'ready'].includes(editingSubStatus || '')) {
          notesObj.kanbanStage = 'process';
        } else if (editingSubStatus === 'billing' && existingJob?.status !== 'delivery') {
          notesObj.kanbanStage = 'billing';
        }
        if (finalPayments.length > 0) {
          notesObj.payments = finalPayments;
        }
        return JSON.stringify(notesObj);
      })(),

      branchId: shop.id,
      paymentChannel: isRewashJob ? "Rewash / No Charge" : (isSplitChildJob ? "Pre-paid / Split Delivery" : (isSplitPayment ? "Split Payment" : (paymentChannel || null))),
      proformaReceiptNumber: (targetProformaNum && targetProformaNum !== "DRAFT") ? targetProformaNum : null,
      proformaNumber: (targetProformaNum && targetProformaNum !== "DRAFT") ? targetProformaNum : null,
      proformaRevision: targetProformaNum ? (effectiveProformaRevision !== null ? effectiveProformaRevision : 0) : null,
      proformaCartHash: targetProformaNum ? effectiveProformaCartHash : null,
      creatorRole: editingJobId && existingJob ? ((existingJob as any).creatorRole || (user?.role === 'admin' ? 'admin' : (isCSO ? 'cso' : user?.role))) : (user?.role === 'admin' ? 'admin' : (isCSO ? 'cso' : user?.role)),
      createdBy: editingJobId && existingJob ? (existingJob.createdBy || user?.name || user?.email || "Admin") : (user?.name || user?.email || "Admin"),
      cashPlaced: (paymentChannel === "Cash / COD" && paymentMethod === "unpaid") ? cashPlaced : false,
      actorId: user?.id,
      actorName: user?.name || user?.email,
      actorRole: user?.role
    };
    if (targetEditingJobId && existingJob) {
      newJobData.bagImageUrl = existingJob.bagImageUrl || null;
      newJobData.billImageUrl = existingJob.billImageUrl || null;
      newJobData.pickupProofImageUrl = existingJob.pickupProofImageUrl || null;
      newJobData.deliveryProofImageUrl = existingJob.deliveryProofImageUrl || null;
      newJobData.proofImageUrl = existingJob.proofImageUrl || null;
    }

    try {
      let savedJobId = targetEditingJobId;
      if (isEditMode && targetEditingJobId) {
        const payload: Partial<Job> = {};
        if (originalJobRef.current) {
          const orig = originalJobRef.current as any;
          const data = newJobData as any;

          // Normalize untouched derived fields so true field-level diffing ONLY sends fields the user actually modified
          const toRoundedMinStr = (val: any) => {
            if (!val) return '';
            const d = val instanceof Date ? val : new Date(val);
            if (isNaN(d.getTime())) return '';
            return format(roundToNearest30(d), "yyyy-MM-dd'T'HH:mm");
          };
          if (pickupScheduledTime === toRoundedMinStr(orig.pickupScheduledAt || orig.scheduledAt)) {
            data.pickupScheduledAt = orig.pickupScheduledAt;
            data.pickupScheduledEndAt = orig.pickupScheduledEndAt;
            data.scheduledAt = orig.scheduledAt;
          }
          if (deliveryScheduledTime === toRoundedMinStr(orig.deliveryScheduledAt)) {
            data.deliveryScheduledAt = orig.deliveryScheduledAt;
            data.deliveryScheduledEndAt = orig.deliveryScheduledEndAt;
          }

          const normItems = (arr: any) => {
            const list = Array.isArray(arr) ? arr : (typeof arr === 'string' && arr ? (() => { try { return JSON.parse(arr); } catch { return []; } })() : []);
            return JSON.stringify(list.map((i: any) => ({
              name: i.name || '',
              quantity: Number(i.quantity) || 0,
              price: Number(i.price) || 0,
              serviceId: i.serviceId || i.id || '',
            })));
          };
          if (normItems(orig.items || orig.itemsJson) === normItems(data.items)) {
            data.items = orig.items;
            data.serviceType = orig.serviceType;
          }

          const normLT = (v: any) => (Array.isArray(v) ? v : (typeof v === 'string' && v.trim() ? v.split(',') : [])).map((s: string) => s.trim()).filter(Boolean).sort().join(',');
          if (normLT(orig.laundryTypes) === normLT(data.laundryTypes)) {
            data.laundryTypes = orig.laundryTypes;
          }

          const normAdminNotes = (raw: any) => {
            if (!raw) return JSON.stringify({ notes: [], payments: [], isTaxInvoiceRequested: false, isRewash: false, rewashFromJobId: null, noRiderCommission: false, hangerCount: 0, foldedCount: 0, processingBranchId: null });
            try {
              const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
              const notes = (Array.isArray(p) ? p : (Array.isArray(p?.notes) ? p.notes : [])).map(({ isNew, ...rest }: any) => rest);
              const payments = Array.isArray(p?.payments) ? p.payments : [];
              const isTax = Boolean(p?.isTaxInvoiceRequested);
              const isRewash = Boolean(p?.isRewash);
              const rewashFromJobId = p?.rewashFromJobId || null;
              const noRiderCommission = Boolean(p?.noRiderCommission);
              const hangerCountVal = Math.max(0, Number(p?.hangerCount) || 0);
              const foldedCountVal = Math.max(0, Number(p?.foldedCount) || 0);
              const processingBranchIdVal = p?.processingBranchId || null;
              return JSON.stringify({ notes, payments, isTaxInvoiceRequested: isTax, isRewash, rewashFromJobId, noRiderCommission, hangerCount: hangerCountVal, foldedCount: foldedCountVal, processingBranchId: processingBranchIdVal });
            } catch {
              return String(raw);
            }
          };
          if (!adminNoteInput.trim() && !isPayment && normAdminNotes(orig.adminNotesJson) === normAdminNotes(data.adminNotesJson)) {
            data.adminNotesJson = orig.adminNotesJson;
          }

          const origPCoord = orig.pickupCoords || { lat: orig.pickupLat || 0, lng: orig.pickupLng || 0 };
          if (data.pickupCoords && Math.abs(Number(origPCoord.lat || 0) - Number(data.pickupCoords.lat || 0)) < 0.00001 && Math.abs(Number(origPCoord.lng || 0) - Number(data.pickupCoords.lng || 0)) < 0.00001) {
            data.pickupCoords = orig.pickupCoords;
          }
          const origDCoord = orig.dropoffCoords || { lat: orig.dropoffLat || 0, lng: orig.dropoffLng || 0 };
          if (data.dropoffCoords && Math.abs(Number(origDCoord.lat || 0) - Number(data.dropoffCoords.lat || 0)) < 0.00001 && Math.abs(Number(origDCoord.lng || 0) - Number(data.dropoffCoords.lng || 0)) < 0.00001) {
            data.dropoffCoords = orig.dropoffCoords;
          }
          
          const fieldsToCompare = [
            'isStuck', 'customerId', 'type', 'status', 'subStatus', 'source', 'customerName', 'customerPhone',
            'pickupLocation', 'dropoffLocation', 'pickupCoords', 'dropoffCoords', 'scheduledAt',
            'pickupScheduledAt', 'pickupScheduledEndAt', 'deliveryScheduledAt', 'deliveryScheduledEndAt',
            'pickupRiderId', 'deliveryRiderId', 'isPaid', 'fee', 'totalAmount', 'discount', 'discountPercent', 'serviceType',
            'pickupDistance', 'deliveryDistance', 'pickupCommission', 'deliveryCommission',
            'remark', 'adminNotesJson', 'branchId', 'createdBy', 'cashPlaced',
            'bagImageUrl', 'billImageUrl', 'pickupProofImageUrl', 'deliveryProofImageUrl', 'proofImageUrl',
            'laundryTypes', 'items', 'paymentChannel', 'isShopPaid', 'billNo',
            'proformaNumber', 'proformaRevision', 'proformaCartHash',
            'walletBalanceAfter'
          ];
          
          fieldsToCompare.forEach(f => {
            if (data[f] !== undefined) {
              const oVal = orig[f];
              const nVal = data[f];
              let isChanged = false;
              
              if (oVal instanceof Date || nVal instanceof Date) {
                const oTime = oVal instanceof Date ? oVal.getTime() : (oVal ? new Date(oVal).getTime() : 0);
                const nTime = nVal instanceof Date ? nVal.getTime() : (nVal ? new Date(nVal).getTime() : 0);
                isChanged = oTime !== nTime;
              } else if (typeof oVal === 'object' || typeof nVal === 'object') {
                isChanged = JSON.stringify(oVal) !== JSON.stringify(nVal);
              } else {
                const normO = oVal === null || oVal === undefined ? '' : String(oVal);
                const normN = nVal === null || nVal === undefined ? '' : String(nVal);
                isChanged = normO !== normN;
              }
              
              if (isChanged) {
                payload[f as keyof Job] = nVal;
              }
            }
          });

          if (Object.keys(payload).length > 0) {
            (payload as any).actorId = user?.id;
            (payload as any).actorName = user?.name || user?.email;
            (payload as any).actorRole = user?.role;
            (payload as any).updatedAt = orig.updatedAt;
            (payload as any).expectedUpdatedAt = orig.updatedAt;
          }
        } else {
          Object.assign(payload, newJobData);
        }

        // Handle wallet adjustments for job updates (BEFORE saving job, so walletBalanceAfter is saved atomically with isShopPaid!)
        // Strictly trigger on explicit Pay button click (isPayment === true) — never deduct on simple Save
        const isShopPaidNow_update = isPayment;
        const wasShopPaidBefore_update = existingJob ? !!(existingJob as any).isShopPaid : false;
        // Capture customer wallet balance BEFORE any deduction occurs in this update cycle
        const walletBalanceBeforePay = selectedProfileCustomer
          ? (selectedProfileCustomer.creditBalance ?? 0)
          : undefined;
        if (isShopPaidNow_update && (!wasShopPaidBefore_update || remainingToPay > 0) && selectedProfileCustomer) {
          const deductAmt = isSplitPayment ? splitMemberDeductAmt : remainingToPay;
          if ((paymentChannel === "Deduct Member" || (isSplitPayment && splitMemberDeductAmt > 0)) && deductAmt > 0) {
            const currentBalance = selectedProfileCustomer.creditBalance || 0;
            if (currentBalance < deductAmt) {
              toast.error(`ยอดเงิน Wallet ไม่เพียงพอ (มี ${formatBaht(currentBalance)}, ต้องการ ${formatBaht(deductAmt)})`);
              setIsSubmitting(false);
              return;
            }
          }
          let balAdj = 0;
          if (isSplitPayment) {
            if (splitMemberDeductAmt > 0) balAdj -= splitMemberDeductAmt;
          } else if (paymentChannel === "Deduct Member") {
            balAdj -= remainingToPay;
          }
          const packageItems_u = !wasShopPaidBefore_update ? dialogCart.filter(item => item.category === "PACKAGE") : [];
          if (packageItems_u.length > 0) balAdj += packageItems_u.reduce((acc, item) => acc + (item.price * item.quantity), 0);
          if (balAdj !== 0) {
            const isDeduct = balAdj < 0;
            const refDisplay = (existingJob as any)?.billNo || targetEditingJobId;
            const upd: Partial<Customer> & Record<string, any> = { 
              creditBalanceDelta: balAdj,
              walletTxType: isDeduct ? 'DEDUCT' : 'ADJUST_ADD',
              walletRefId: targetEditingJobId,
              walletRefType: 'job',
              actorId: user?.id || null,
              actorName: user?.name || user?.email || 'Staff',
              branchId: (existingJob as any)?.branchId || activeShop?.id || null,
              reason: isDeduct ? `Order Payment #${refDisplay}` : `Package Top-Up #${refDisplay}`,
            };
            if (balAdj > 0 && !selectedProfileCustomer.isMember) {
              upd.isMember = true;
              const pls = priceListStore.getSnapshot();
              const ml = pls.find(p => p.name.toLowerCase().includes("member"));
              if (ml) upd.priceListId = ml.id;
            }
            const updatedCust = await customerStore.updateCustomer(selectedProfileCustomer.id, upd);
            const confirmedBal = updatedCust?.creditBalance ?? ((selectedProfileCustomer.creditBalance || 0) + balAdj);
            payload.walletBalanceAfter = confirmedBal;
            setSelectedProfileCustomer(prev => prev ? { ...prev, creditBalance: confirmedBal, isMember: upd.isMember ?? prev.isMember, priceListId: upd.priceListId ?? prev.priceListId } : null);
            toast.success(`Customer wallet updated. New balance: ${formatBaht(confirmedBal)}`);
          }
        }

        // 1. Optimistic memory update & session backup FIRST (before awaiting uploads) so clicking Refresh never loses edits!
        if (Object.keys(payload).length > 0) {
          savePendingJobToSession(targetEditingJobId, payload);
          api.optimisticUpdate(targetEditingJobId, payload);
        }

        // 2. Complete uploads concurrently (with 20s safety cap so hung uploads cannot freeze the modal)
        const [bagUrls, billUrls, pickupUrls, deliveryUrls] = await Promise.race([
          Promise.all([
            bagUploadPromise,
            billUploadPromise,
            pickupUploadPromise,
            deliveryUploadPromise
          ]),
          new Promise<[string[], string[], string[], string[]]>((resolve) =>
            setTimeout(() => resolve([bagImageUrls, billImageUrls, pickupProofImageUrls, deliveryProofImageUrls]), 20000)
          ),
        ]);

        // Defense-in-depth: Ensure unauthorized roles cannot delete existing images
        let safeBagUrls = bagUrls;
        if (!canDeleteLaundryBags && origBagImageUrls.length > 0) {
          const missingBags = origBagImageUrls.filter(url => !safeBagUrls.includes(url));
          if (missingBags.length > 0) {
            safeBagUrls = [...missingBags, ...safeBagUrls];
          }
        }

        const isBillUrlBelongingToJob = (u: string, jobId: string | null) => {
          if (typeof u !== "string" || u.includes("proforma-DRAFT") || u.includes("/DRAFT/")) return false;
          if (!jobId) {
            return !u.includes("proforma-") && !u.includes("receipt-");
          }
          const cleanId = jobId.replace(/^RF-/i, "");
          if (u.includes("proforma-") && !u.includes(jobId) && !u.includes(cleanId)) return false;
          if (u.includes("receipt-") && !u.includes(jobId) && !u.includes(cleanId)) return false;
          return true;
        };

        let safeBillUrls = billUrls.filter(u => isBillUrlBelongingToJob(u, targetEditingJobId));
        if (!isAdmin && origBillImageUrls.length > 0) {
          const cleanOrigBills = origBillImageUrls.filter(url => isBillUrlBelongingToJob(url, targetEditingJobId));
          const missingBills = cleanOrigBills.filter(url => !safeBillUrls.includes(url));
          if (missingBills.length > 0) {
            safeBillUrls = [...missingBills, ...safeBillUrls];
          }
        }

        let safePickupUrls = pickupUrls;
        if (!isAdmin && origPickupProofImageUrls.length > 0) {
          const missingPickups = origPickupProofImageUrls.filter(url => !safePickupUrls.includes(url));
          if (missingPickups.length > 0) {
            safePickupUrls = [...missingPickups, ...safePickupUrls];
          }
        }

        let safeDeliveryUrls = deliveryUrls;
        if (!isAdmin && origDeliveryProofImageUrls.length > 0) {
          const missingDeliveries = origDeliveryProofImageUrls.filter(url => !safeDeliveryUrls.includes(url));
          if (missingDeliveries.length > 0) {
            safeDeliveryUrls = [...missingDeliveries, ...safeDeliveryUrls];
          }
        }

        if (JSON.stringify(safeBagUrls) !== JSON.stringify(origBagImageUrls)) {
          payload.bagImageUrl = (safeBagUrls.length > 0 ? JSON.stringify(safeBagUrls) : null) as any;
        }
        const isItemsOrAmountChanged = Boolean(payload.items || payload.totalAmount !== undefined);
        if (isPayment || (isItemsOrAmountChanged && existingJob?.isPaid)) {
          safeBillUrls = safeBillUrls.filter(u => typeof u === "string" && !u.includes(`receipt-${targetEditingJobId}`) && !u.includes("/receipt-"));
          payload.billImageUrl = (safeBillUrls.length > 0 ? JSON.stringify(safeBillUrls) : null) as any;
        } else if (JSON.stringify(safeBillUrls) !== JSON.stringify(origBillImageUrls)) {
          payload.billImageUrl = (safeBillUrls.length > 0 ? JSON.stringify(safeBillUrls) : null) as any;
        }
        if (JSON.stringify(safePickupUrls) !== JSON.stringify(origPickupProofImageUrls)) {
          payload.pickupProofImageUrl = (safePickupUrls.length > 0 ? JSON.stringify(safePickupUrls) : null) as any;
        }
        if (JSON.stringify(safeDeliveryUrls) !== JSON.stringify(origDeliveryProofImageUrls)) {
          payload.deliveryProofImageUrl = (safeDeliveryUrls.length > 0 ? JSON.stringify(safeDeliveryUrls) : null) as any;
          payload.proofImageUrl = (safeDeliveryUrls.length > 0 ? JSON.stringify(safeDeliveryUrls) : null) as any;
        }

        // [AUTO-PROFORMA] Capture proforma ONLY IF:
        // 1. Proforma preview was explicitly requested in this session, OR
        // 2. Shop payment occurred (isShopPaid) AND job actually has laundry items!
        const isShopPaidNow = Boolean(
          cannotDeduct ? false : (
            isPaidJob || 
            (isPayment && remainingToPay <= 0) || 
            (isPayment && alreadyPaidTotal + remainingToPay >= calculatedTotal) || 
            (alreadyPaidTotal >= calculatedTotal && calculatedTotal > 0) || 
            (editingJobId ? Boolean(existingJob?.isShopPaid) : false)
          )
        );
        const shouldCaptureProforma = Boolean(
          targetProformaNum && 
          (proformaPressedSinceLastEdit || (isShopPaidNow && hasActualItems) || (isCartChangedFromLastProforma && !isAlreadyPaidJob))
        );
        let resolvedFinalProformaNum = "";
        let resolvedFinalRevision = 0;
        let resolvedFinalCartHash = effectiveProformaCartHash;
        if (shouldCaptureProforma) {
          let finalProformaNum = targetProformaNum!;
          if (targetEditingJobId.startsWith("RF-")) {
            finalProformaNum = cleanProformaNumber(finalProformaNum) || (cleanOriginalId ? `PR-${cleanOriginalId}` : generateProformaBaseNumber(targetEditingJobId));
          } else if (!finalProformaNum) {
            finalProformaNum = generateProformaBaseNumber(targetEditingJobId);
          }
          resolvedFinalProformaNum = cleanProformaNumber(finalProformaNum);
          resolvedFinalRevision = isRfJob ? Math.max(1, effectiveProformaRevision ?? 1) : (effectiveProformaRevision ?? 0);
          resolvedFinalCartHash = effectiveProformaCartHash;

          // Merge proforma metadata into main payload ONLY IF changed so we don't send unchanged fields!
          const origPf = originalJobRef.current as any;
          if (!origPf || (origPf.proformaNumber || null) !== (resolvedFinalProformaNum || null)) {
            (payload as any).proformaNumber = resolvedFinalProformaNum;
          }
          if (!origPf || (origPf.proformaRevision ?? null) !== (resolvedFinalRevision ?? null)) {
            (payload as any).proformaRevision = resolvedFinalRevision;
          }
          if (!origPf || (origPf.proformaCartHash || null) !== (resolvedFinalCartHash || null)) {
            (payload as any).proformaCartHash = resolvedFinalCartHash;
          }
        }

        // 3. Persist to DB and await confirmation (includes walletBalanceAfter and proforma metadata in a single call!)
        if (Object.keys(payload).length > 0) {
          (payload as any).actorId = user?.id;
          (payload as any).actorName = user?.name || user?.email;
          (payload as any).actorRole = user?.role;
          if ((originalJobRef.current as any)?.updatedAt) {
            (payload as any).updatedAt = (originalJobRef.current as any).updatedAt;
            (payload as any).expectedUpdatedAt = (originalJobRef.current as any).updatedAt;
          }
          savePendingJobToSession(targetEditingJobId, payload);
          const updatePromise = api.updateJob(targetEditingJobId, payload).then((saved) => {
            clearPendingJobFromSession(targetEditingJobId);
            if ((saved as any)?.updatedAt && originalJobRef.current && editingJobIdRef.current === targetEditingJobId) {
              (originalJobRef.current as any).updatedAt = (saved as any).updatedAt;
            }
            jobStore.notify();
            return saved;
          }).catch((err) => {
            const isConflictErr =
              Boolean(err?.isConflict) ||
              String(err?.message || '').includes('409') ||
              String(err?.message || '').toLowerCase().includes('conflict');
            if (isConflictErr) {
              clearPendingJobFromSession(targetEditingJobId);
            }
            throw err;
          });

          if (!isPayment) {
            let timedOut = false;
            const savedMainJob = await Promise.race([
              updatePromise,
              new Promise<null>((resolve) =>
                setTimeout(() => {
                  timedOut = true;
                  resolve(null);
                }, 5000)
              ),
            ]);
            if (timedOut) {
              updatePromise.catch((bgErr: any) => {
                const bgMsg = bgErr?.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล";
                toast.error(`บันทึกไม่สำเร็จ: ${bgMsg}`);
                api.fetchAndApplyJob(targetEditingJobId).catch(() => {});
              });
            } else if ((savedMainJob as any)?.updatedAt && originalJobRef.current && editingJobIdRef.current === targetEditingJobId) {
              (originalJobRef.current as any).updatedAt = (savedMainJob as any).updatedAt;
            }
          } else {
            await updatePromise;
          }
          jobStore.notify();
        }

        if (shouldCaptureProforma) {
          const finalProformaNum = resolvedFinalProformaNum;
          const finalRevision = resolvedFinalRevision;
          const finalCartHash = resolvedFinalCartHash;

          setProformaReceiptNumber(finalProformaNum);
          setProformaRevision(finalRevision);
          setLastProformaCartHash(finalCartHash);
          if (lastPaidProformaInfoRef) {
            lastPaidProformaInfoRef.current = { id: finalProformaNum, rev: finalRevision };
          }
          if (existingJob) {
            (existingJob as any).proformaNumber = finalProformaNum;
            (existingJob as any).proformaRevision = finalRevision;
            (existingJob as any).proformaCartHash = finalCartHash;
          }

          // Fire background capture of Proforma image if not yet captured for this revision
          const proformaFilename = `proforma-${finalProformaNum}-rev${finalRevision}.png`;
          const existingBillUrls: string[] = (() => {
            try {
              return existingJob?.billImageUrl ? JSON.parse(existingJob.billImageUrl) : [];
            } catch { return []; }
          })();
          const alreadyHasThisRev = existingBillUrls.some(u => u.includes(proformaFilename));

          if (!alreadyHasThisRev || (isPayment && isCartChangedFromLastProforma) || (isCartChangedFromLastProforma && !isAlreadyPaidJob)) {
            const proformaAdminNotesJson = (() => {
              try {
                const raw = existingJob?.adminNotesJson || newJobData.adminNotesJson;
                if (!raw) return undefined;
                const parsed = JSON.parse(raw);
                delete parsed.payments;
                return JSON.stringify(parsed);
              } catch {
                return undefined;
              }
            })();

            const proformaCapData = {
              ...formatJobToReceiptData({
                ...existingJob,
                id: targetEditingJobId,
                items: itemsPayload,
                itemsJson: JSON.stringify(itemsPayload),
                fee: newJobData.fee !== undefined ? newJobData.fee : existingJob?.fee,
                discount: newJobData.discount !== undefined ? newJobData.discount : existingJob?.discount,
                discountPercent: newJobData.discountPercent !== undefined ? newJobData.discountPercent : existingJob?.discountPercent,
                type: newJobData.type || existingJob?.type,
                proformaNumber: finalProformaNum,
                proformaRevision: finalRevision,
                remark: (newJobData.remark !== undefined ? newJobData.remark : existingJob?.remark),
                totalAmount: calculatedTotal,
                isShopPaid: false,
                isPaid: false,
                adminNotesJson: proformaAdminNotesJson,
                walletBalance: walletBalanceBeforePay,
                walletBalanceAfter: undefined,
                isDraft: true,
              } as any),
              items: itemsPayload,
              isDraft: true,
              isPaid: false,
              isShopPaid: false,
              adminNotesJson: proformaAdminNotesJson,
              proformaRevision: finalRevision,
              proformaId: finalProformaNum,
              jobId: targetEditingJobId,
              autoCapture: false,
              walletBalance: walletBalanceBeforePay,
              walletBalanceAfter: undefined,
            };
            const baseBillsForCapture = [...safeBillUrls];
            // Offload to microtask so it doesn't block dialog close
            Promise.resolve().then(async () => {
              try {
                const { uploadReceiptImage, generateThermalReceiptImage } = await import("@/lib/thermal-canvas-generator");
                const proformaBlob = systemSettings?.receiptPaperSize === "A5"
                  ? await (await import("@/lib/a5-canvas-generator")).generateA5ReceiptImage(proformaCapData, activeShop)
                  : await generateThermalReceiptImage(proformaCapData, activeShop);
                if (proformaBlob) {
                  const proformaFilename = `proforma-${finalProformaNum}-rev${finalRevision}.png`;
                  const proformaUrl = await uploadReceiptImage(proformaBlob, targetEditingJobId, proformaFilename);
                  if (proformaUrl) {
                    const capturedUrl = proformaUrl;
                    const cleanBase = finalProformaNum;
                    const sortBills = (arr: string[]) => {
                      arr.sort((a, b) => {
                        const aIsPf = a.includes("proforma-");
                        const bIsPf = b.includes("proforma-");
                        if (aIsPf && !bIsPf) return -1;
                        if (!aIsPf && bIsPf) return 1;
                        if (aIsPf && bIsPf) {
                          const aRev = parseInt((a.match(/-rev(\d+)\.png/i) || [])[1] || "0", 10);
                          const bRev = parseInt((b.match(/-rev(\d+)\.png/i) || [])[1] || "0", 10);
                          return bRev - aRev;
                        }
                        const aIsRc = a.includes("receipt-");
                        const bIsRc = b.includes("receipt-");
                        if (aIsRc && !bIsRc) return 1;
                        if (!aIsRc && bIsRc) return -1;
                        return 0;
                      });
                      return arr;
                    };

                    // Always compute next bills from target job's latest store snapshot (or baseBillsForCapture)
                    // so we NEVER mix with another job's billImageUrls state!
                    const currentTargetJob = jobStore.getSnapshot().find(j => j.id === targetEditingJobId);
                    let targetCurrentBills = baseBillsForCapture;
                    try {
                      if (currentTargetJob?.billImageUrl) {
                        const parsed = JSON.parse(currentTargetJob.billImageUrl);
                        if (Array.isArray(parsed)) targetCurrentBills = parsed;
                      }
                    } catch {}
                    const filteredTargetBills = targetCurrentBills
                      .filter(u => isBillUrlBelongingToJob(u, targetEditingJobId) && !u.includes(`proforma-${cleanBase}-rev${finalRevision}.png`));
                    const nextTargetBills = sortBills(Array.from(new Set([capturedUrl, ...filteredTargetBills])));

                    const updatedProformaJob = await jobStore.updateJobDetails(targetEditingJobId, { billImageUrl: JSON.stringify(nextTargetBills) } as any);
                    if ((updatedProformaJob as any)?.updatedAt && originalJobRef.current && editingJobIdRef.current === targetEditingJobId) {
                      (originalJobRef.current as any).updatedAt = (updatedProformaJob as any).updatedAt;
                    }

                    // ONLY update React state if the dialog is still editing this exact same job!
                    if (editingJobIdRef.current === targetEditingJobId) {
                      setBillImageUrls(prev => {
                        const filtered = prev.filter(u => isBillUrlBelongingToJob(u, targetEditingJobId) && !u.includes(`proforma-${cleanBase}-rev${finalRevision}.png`));
                        return sortBills(Array.from(new Set([capturedUrl, ...filtered])));
                      });
                    }
                  }
                }
              } catch (e) {
                console.warn("[AutoProforma] Background proforma capture failed:", e);
              }
            });
          }
        }

        // [AUTO-RECEIPT for EXISTING JOB] Guarantee REC image is generated in background when paid with laundry items,
        // even if the cashier closes the Receipt Dialog immediately.
        if (isPayment && isShopPaidNow && hasActualItems) {
          const receiptFilename = `receipt-${targetEditingJobId}.png`;
          const baseBillsForRec = [...safeBillUrls];
          Promise.resolve().then(async () => {
            try {
              const { generateA5ReceiptImage, markReceiptCaptureStarted, clearReceiptCaptureLock } = await import("@/lib/a5-canvas-generator");
              const { generateThermalReceiptImage, uploadReceiptImage } = await import("@/lib/thermal-canvas-generator");
              if (!markReceiptCaptureStarted(receiptFilename)) return;

              const currentTargetJob = jobStore.getSnapshot().find(j => j.id === targetEditingJobId) || existingJob;
              if (!currentTargetJob) {
                clearReceiptCaptureLock(receiptFilename);
                return;
              }
              const recData = formatJobToReceiptData({
                ...currentTargetJob,
                id: targetEditingJobId,
                items: itemsPayload,
                itemsJson: JSON.stringify(itemsPayload),
                totalAmount: calculatedTotal,
                isPaid: true,
                isShopPaid: true,
              } as any);
              recData.isDraft = false;
              recData.isPaid = true;
              recData.autoCapture = true;
              if (appliedPromo) {
                recData.promoCode = appliedPromo.code;
                recData.promoDiscount = promoDiscountAmount;
                recData.promoTarget = appliedPromo.discountTarget;
              }

              const recBlob = systemSettings?.receiptPaperSize === "A5"
                ? await generateA5ReceiptImage(recData, activeShop)
                : await generateThermalReceiptImage(recData, activeShop);
              if (!recBlob) {
                clearReceiptCaptureLock(receiptFilename);
                return;
              }
              const recUrl = await uploadReceiptImage(recBlob, targetEditingJobId, receiptFilename);
              if (!recUrl) {
                clearReceiptCaptureLock(receiptFilename);
                return;
              }

              const latestTargetJob = jobStore.getSnapshot().find(j => j.id === targetEditingJobId);
              let targetCurrentBills = baseBillsForRec;
              try {
                if (latestTargetJob?.billImageUrl) {
                  const parsed = JSON.parse(latestTargetJob.billImageUrl);
                  if (Array.isArray(parsed)) targetCurrentBills = parsed;
                }
              } catch {}
              const filteredTargetBills = targetCurrentBills
                .filter(u => isBillUrlBelongingToJob(u, targetEditingJobId) && !u.includes(receiptFilename) && !u.includes("/receipt-"));
              const nextTargetBills = Array.from(new Set([recUrl, ...filteredTargetBills]));
              const updatedRecJob = await jobStore.updateJobDetails(targetEditingJobId, { billImageUrl: JSON.stringify(nextTargetBills) } as any);
              if ((updatedRecJob as any)?.updatedAt && originalJobRef.current && editingJobIdRef.current === targetEditingJobId) {
                (originalJobRef.current as any).updatedAt = (updatedRecJob as any).updatedAt;
              }

              if (editingJobIdRef.current === targetEditingJobId) {
                setBillImageUrls(prev => prev.includes(recUrl) ? prev : [...prev, recUrl]);
              }
            } catch (e) {
              console.warn("[AutoReceipt] Background existing-job receipt capture failed:", e);
            }
          });
        }

        // 4. Close dialog ONLY AFTER DB save succeeds!
        setSavingJobIds(prev => new Set(prev).add(targetEditingJobId));
        setAdminNoteInput("");
        setSaveError(null);
        setDialogOpen(false);
        if (isPayment) {
          setIsDraftPreview(false);
          setIsPaymentEvent(true);
          setShowReceipt(true);
          // Auto kick cash drawer if payment contains cash and setting is enabled
          import("@/lib/cash-drawer").then(({ triggerCashDrawerIfEnabled }) => {
            triggerCashDrawerIfEnabled("pay", paymentChannel, splitPayments, systemSettings);
          }).catch(() => {});

          if (selectedProfileCustomer?.isNew && selectedProfileCustomer?.id) {
            customerStore.updateCustomer(selectedProfileCustomer.id, { 
              isNew: false,
              actorId: user?.id || null,
              actorName: user?.name || user?.email || 'Staff',
            });
            setSelectedProfileCustomer(prev => prev ? { ...prev, isNew: false } : null);
          }
          // Redeem promo code if applied (fire-and-forget)
          if (appliedPromo) {
            handleRedeemPromo(appliedPromo.code, targetEditingJobId, calculatedTotal + promoDiscountAmount, promoDiscountAmount);
          }
        } else {
          resetDialogForm();
        }

        toast.success(`Job updated successfully!`);

      } else {
        // Upload images for NEW job (with 20s safety cap so hung uploads cannot freeze creation)
        const [bagUrls, billUrls, pickupUrls, deliveryUrls] = await Promise.race([
          Promise.all([
            bagUploadPromise,
            billUploadPromise,
            pickupUploadPromise,
            deliveryUploadPromise
          ]),
          new Promise<[string[], string[], string[], string[]]>((resolve) =>
            setTimeout(() => resolve([bagImageUrls, billImageUrls, pickupProofImageUrls, deliveryProofImageUrls]), 20000)
          ),
        ]);
        newJobData.bagImageUrl = bagUrls.length > 0 ? JSON.stringify(bagUrls) : null;
        const safeNewBillUrls = billUrls.filter(u => typeof u === "string" && !u.includes("proforma-DRAFT") && !u.includes("/DRAFT/") && !u.includes("proforma-") && !u.includes("receipt-"));
        newJobData.billImageUrl = safeNewBillUrls.length > 0 ? JSON.stringify(safeNewBillUrls) : null;
        newJobData.pickupProofImageUrl = pickupUrls.length > 0 ? JSON.stringify(pickupUrls) : null;
        newJobData.deliveryProofImageUrl = deliveryUrls.length > 0 ? JSON.stringify(deliveryUrls) : null;
        newJobData.proofImageUrl = deliveryUrls.length > 0 ? JSON.stringify(deliveryUrls) : null;
        // H2 Fix: For NEW jobs paid via "Deduct Member", deduct wallet BEFORE creating the job.
        // If deduction fails → job is never created → no money leak.
        // Strictly trigger on explicit Pay button click (isPayment === true) — never deduct on simple Create
        const isShopPaidNow_new = isPayment;
        let preDeductedBalance: number | null = null;
        let walletUpdates: (Partial<Customer> & Record<string, any>) | null = null;

        const isMemberDeductNeeded_new = isShopPaidNow_new && selectedProfileCustomer && (
          paymentChannel === "Deduct Member" || (isSplitPayment && splitMemberDeductAmt > 0)
        );
        const memberDeductAmt_new = isSplitPayment ? splitMemberDeductAmt : calculatedTotal;
        const walletBalanceBeforePay_new = selectedProfileCustomer
          ? (selectedProfileCustomer.creditBalance ?? 0)
          : undefined;

        if (isMemberDeductNeeded_new) {
          // Validate balance is sufficient before proceeding
          const currentBalance = selectedProfileCustomer.creditBalance || 0;
          if (currentBalance < memberDeductAmt_new) {
            toast.error(`ยอดเงิน Wallet ไม่เพียงพอ (มี ${formatBaht(currentBalance)}, ต้องการ ${formatBaht(memberDeductAmt_new)})`);
            setIsSubmitting(false);
            return;
          }
          preDeductedBalance = Math.max(0, currentBalance - memberDeductAmt_new);
        }

        // Also handle topup packages (balance increase — safe to do after job creation)
        const packageItems = dialogCart.filter(item => item.category === "PACKAGE");
        const packageTotal = packageItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

        const isNewJobShopPaid = isPayment && !cannotDeduct;
        const shouldAutoAssignNewJobProforma = Boolean(isNewJobProformaRequested || (isNewJobShopPaid && hasActualItems));
        const expectedWalletBalAfterTopup = (isShopPaidNow_new && selectedProfileCustomer && packageTotal > 0)
          ? ((preDeductedBalance ?? (selectedProfileCustomer.creditBalance || 0)) + packageTotal)
          : preDeductedBalance;

        // Now create the job — include walletBalanceAfter and autoAssignProforma so DB saves everything in 1 INSERT!
        if (!draftJobRequestIdRef.current) {
          draftJobRequestIdRef.current = typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        }
        const jobDataWithWallet = {
          ...newJobData,
          clientRequestId: draftJobRequestIdRef.current,
          ...(expectedWalletBalAfterTopup !== null ? { walletBalanceAfter: expectedWalletBalAfterTopup } : {}),
          ...(shouldAutoAssignNewJobProforma ? { autoAssignProforma: true, proformaCartHash: currentCartHash } : {}),
        };

        const job = await jobStore.addJob(jobDataWithWallet as any);
        savedJobId = job.id;

        // Perform atomic wallet deduction with job reference now that job is created
        if (isMemberDeductNeeded_new && savedJobId) {
          const refDisplay = (job as any)?.billNo || savedJobId;
          walletUpdates = { 
            creditBalanceDelta: -memberDeductAmt_new,
            walletTxType: 'DEDUCT',
            walletRefId: savedJobId,
            walletRefType: 'job',
            actorId: user?.id || null,
            actorName: user?.name || user?.email || 'Staff',
            branchId: (job as any)?.branchId || activeShop?.id || null,
            reason: `Order Payment #${refDisplay}${isSplitPayment ? ' (Split Pay)' : ''}`,
          };
          const updatedCust = await customerStore.updateCustomer(selectedProfileCustomer.id, walletUpdates);
          preDeductedBalance = updatedCust?.creditBalance ?? preDeductedBalance;
        }

        // [AUTO-PROFORMA for NEW JOB] If previewed or shop paid WITH actual laundry items → auto-assign + capture in background
        if (savedJobId && shouldAutoAssignNewJobProforma) {
          const autoProformaNum = (job as any)?.proformaNumber || generateProformaBaseNumber(savedJobId);
          const proformaRemark = `Proforma: ${autoProformaNum}`;
          const existingRemark = (job as any)?.remark || newJobData.remark || "";
          const updatedRemark = existingRemark
            ? (existingRemark.includes("Proforma:") ? existingRemark : `${proformaRemark} | ${existingRemark}`)
            : proformaRemark;

          if ((job as any)?.proformaNumber !== autoProformaNum) {
            await jobStore.updateJobDetails(savedJobId, {
              proformaNumber: autoProformaNum,
              proformaRevision: 0,
              proformaCartHash: currentCartHash,
              remark: updatedRemark,
            } as any);
          } else {
            api.optimisticUpdate(savedJobId, {
              proformaNumber: autoProformaNum,
              proformaRevision: 0,
              proformaCartHash: currentCartHash,
              remark: updatedRemark,
            } as any);
            jobStore.notify();
          }
          setProformaReceiptNumber(autoProformaNum);
          setProformaRevision(0);
          if (lastPaidProformaInfoRef) {
            lastPaidProformaInfoRef.current = { id: autoProformaNum, rev: 0 };
          }

          const newJobProformaAdminNotesJson = (() => {
            try {
              const raw = job.adminNotesJson;
              if (!raw) return undefined;
              const parsed = JSON.parse(raw);
              delete parsed.payments;
              return JSON.stringify(parsed);
            } catch {
              return undefined;
            }
          })();

          // Fire background proforma image capture for new jobs (fire-and-forget)
          const newJobReceiptBase = formatJobToReceiptData({
            ...job,
            items: itemsPayload,
            itemsJson: JSON.stringify(itemsPayload),
            proformaNumber: autoProformaNum,
            proformaRevision: 0,
            remark: updatedRemark,
            totalAmount: calculatedTotal,
            isShopPaid: false,
            isPaid: false,
            adminNotesJson: newJobProformaAdminNotesJson,
            walletBalance: walletBalanceBeforePay_new,
            walletBalanceAfter: undefined,
            isDraft: true,
          } as any);
          const proformaCapData = {
            ...newJobReceiptBase,
            items: itemsPayload,
            isDraft: true,
            isPaid: false,
            isShopPaid: false,
            adminNotesJson: newJobProformaAdminNotesJson,
            proformaRevision: 0,
            proformaId: autoProformaNum,
            jobId: savedJobId,
            autoCapture: false,
            walletBalance: walletBalanceBeforePay_new,
            walletBalanceAfter: undefined,
          };
          const capturedSavedJobId = savedJobId;
          Promise.resolve().then(async () => {
            try {
              const { uploadReceiptImage, generateThermalReceiptImage } = await import("@/lib/thermal-canvas-generator");
              const proformaBlob = systemSettings?.receiptPaperSize === "A5"
                ? await (await import("@/lib/a5-canvas-generator")).generateA5ReceiptImage(proformaCapData, activeShop)
                : await generateThermalReceiptImage(proformaCapData, activeShop);
              if (proformaBlob) {
                const proformaFilename = `proforma-${autoProformaNum}-rev0.png`;
                const proformaUrl = await uploadReceiptImage(proformaBlob, capturedSavedJobId, proformaFilename);
                if (proformaUrl) {
                  const capturedUrl = proformaUrl;
                  const currentTargetJob = jobStore.getSnapshot().find(j => j.id === capturedSavedJobId);
                  let targetCurrentBills = [...safeNewBillUrls];
                  try {
                    if (currentTargetJob?.billImageUrl) {
                      const parsed = JSON.parse(currentTargetJob.billImageUrl);
                      if (Array.isArray(parsed)) targetCurrentBills = parsed;
                    }
                  } catch {}
                  const nextTargetBills = targetCurrentBills.includes(capturedUrl)
                    ? targetCurrentBills
                    : [capturedUrl, ...targetCurrentBills];
                  jobStore.updateJobDetails(capturedSavedJobId, { billImageUrl: JSON.stringify(nextTargetBills) } as any).catch(() => {});

                  if (editingJobIdRef.current === capturedSavedJobId) {
                    setBillImageUrls(prev => prev.includes(capturedUrl) ? prev : [capturedUrl, ...prev]);
                  }
                }
              }
            } catch (e) {
              console.warn("[AutoProforma] Background new-job proforma capture failed:", e);
            }
          });
        }

        // Update local customer state if wallet was pre-deducted
        if (preDeductedBalance !== null && selectedProfileCustomer) {
          setSelectedProfileCustomer(prev => prev ? { ...prev, creditBalance: preDeductedBalance! } : null);
          toast.success(`Customer wallet updated. New balance: ฿${preDeductedBalance!.toLocaleString()}`);
        }

        // Handle topup package wallet top-up BEFORE opening receipt dialog so REC captures updated walletBalanceAfter!
        if (isShopPaidNow_new && selectedProfileCustomer && packageTotal > 0) {
          const refDisplay = (job as any)?.billNo || savedJobId;
          const upd: Partial<Customer> & Record<string, any> = { 
            creditBalanceDelta: packageTotal,
            walletTxType: 'ADJUST_ADD',
            walletRefId: savedJobId,
            walletRefType: 'job',
            actorId: user?.id || null,
            actorName: user?.name || user?.email || 'Staff',
            branchId: (job as any)?.branchId || activeShop?.id || null,
            reason: `Package Top-Up #${refDisplay}`,
          };
          if (!selectedProfileCustomer.isMember) {
            upd.isMember = true;
            const pls = priceListStore.getSnapshot();
            const ml = pls.find(p => p.name.toLowerCase().includes("member"));
            if (ml) upd.priceListId = ml.id;
          }
          const updatedCust = await customerStore.updateCustomer(selectedProfileCustomer.id, upd);
          const currentBal = preDeductedBalance ?? (selectedProfileCustomer.creditBalance || 0);
          const confirmedBal = updatedCust?.creditBalance ?? (currentBal + packageTotal);
          if (Math.abs((expectedWalletBalAfterTopup ?? -1) - confirmedBal) > 0.001) {
            await jobStore.updateJobDetails(savedJobId, { walletBalanceAfter: confirmedBal });
          } else {
            api.optimisticUpdate(savedJobId, { walletBalanceAfter: confirmedBal } as any);
            jobStore.notify();
          }
          setSelectedProfileCustomer(prev => prev ? { ...prev, creditBalance: confirmedBal, isMember: upd.isMember ?? prev.isMember, priceListId: upd.priceListId ?? prev.priceListId } : null);
          toast.success(`Member wallet topped up. New balance: ฿${confirmedBal.toLocaleString()}`);
        }

        // [AUTO-RECEIPT for NEW JOB] Guarantee REC image is generated in background when paid with laundry items,
        // even if the cashier closes the Receipt Dialog immediately.
        if (savedJobId && isNewJobShopPaid && hasActualItems) {
          const capturedNewJobId = savedJobId;
          const receiptFilename = `receipt-${capturedNewJobId}.png`;
          const baseNewBills = [...safeNewBillUrls];
          Promise.resolve().then(async () => {
            try {
              const { generateA5ReceiptImage, markReceiptCaptureStarted, clearReceiptCaptureLock } = await import("@/lib/a5-canvas-generator");
              const { generateThermalReceiptImage, uploadReceiptImage } = await import("@/lib/thermal-canvas-generator");
              if (!markReceiptCaptureStarted(receiptFilename)) return;

              const currentTargetJob = jobStore.getSnapshot().find(j => j.id === capturedNewJobId) || job;
              if (!currentTargetJob) {
                clearReceiptCaptureLock(receiptFilename);
                return;
              }
              const recData = formatJobToReceiptData({
                ...currentTargetJob,
                id: capturedNewJobId,
                items: itemsPayload,
                itemsJson: JSON.stringify(itemsPayload),
                totalAmount: calculatedTotal,
                isPaid: true,
                isShopPaid: true,
              } as any);
              recData.isDraft = false;
              recData.isPaid = true;
              recData.autoCapture = true;
              if (appliedPromo) {
                recData.promoCode = appliedPromo.code;
                recData.promoDiscount = promoDiscountAmount;
                recData.promoTarget = appliedPromo.discountTarget;
              }

              const recBlob = systemSettings?.receiptPaperSize === "A5"
                ? await generateA5ReceiptImage(recData, activeShop)
                : await generateThermalReceiptImage(recData, activeShop);
              if (!recBlob) {
                clearReceiptCaptureLock(receiptFilename);
                return;
              }
              const recUrl = await uploadReceiptImage(recBlob, capturedNewJobId, receiptFilename);
              if (!recUrl) {
                clearReceiptCaptureLock(receiptFilename);
                return;
              }

              const latestTargetJob = jobStore.getSnapshot().find(j => j.id === capturedNewJobId);
              let targetCurrentBills = baseNewBills;
              try {
                if (latestTargetJob?.billImageUrl) {
                  const parsed = JSON.parse(latestTargetJob.billImageUrl);
                  if (Array.isArray(parsed)) targetCurrentBills = parsed;
                }
              } catch {}
              const filteredTargetBills = targetCurrentBills
                .filter(u => !u.includes(receiptFilename) && !u.includes("/receipt-"));
              const nextTargetBills = Array.from(new Set([recUrl, ...filteredTargetBills]));
              await jobStore.updateJobDetails(capturedNewJobId, { billImageUrl: JSON.stringify(nextTargetBills) } as any);

              if (editingJobIdRef.current === capturedNewJobId) {
                setBillImageUrls(prev => prev.includes(recUrl) ? prev : [...prev, recUrl]);
              }
            } catch (e) {
              console.warn("[AutoReceipt] Background new-job receipt capture failed:", e);
            }
          });
        }

        // Close dialog immediately — UI updates in 0ms!
        setAdminNoteInput("");
        setSaveError(null);
        setDialogOpen(false);
        if (isPayment) {
          editingJobIdRef.current = savedJobId;
          setEditingJobId(savedJobId);
          setIsDraftPreview(false);
          setIsPaymentEvent(true);
          setShowReceipt(true);
          // Auto kick cash drawer if payment contains cash and setting is enabled
          import("@/lib/cash-drawer").then(({ triggerCashDrawerIfEnabled }) => {
            triggerCashDrawerIfEnabled("pay", paymentChannel, splitPayments, systemSettings);
          }).catch(() => {});

          if (selectedProfileCustomer?.isNew && selectedProfileCustomer?.id) {
            customerStore.updateCustomer(selectedProfileCustomer.id, { 
              isNew: false,
              actorId: user?.id || null,
              actorName: user?.name || user?.email || 'Staff',
            });
            setSelectedProfileCustomer(prev => prev ? { ...prev, isNew: false } : null);
          }
          // Redeem promo code if applied (fire-and-forget)
          if (appliedPromo && savedJobId) {
            handleRedeemPromo(appliedPromo.code, savedJobId, calculatedTotal + promoDiscountAmount, promoDiscountAmount);
          }
        } else {
          resetDialogForm();
        }


        toast.success(`Job ${job.id} created — Fee ฿${job.fee.toFixed(0)} CMS${isFreeDelivery ? ' (Free)' : ''}`);
      }

      // Auto-create Tax Invoice Task for Accounting Team if requested
      if (isTaxInvoiceRequested && savedJobId) {
        createTaxInvoiceTaskForJobAction({
          jobId: savedJobId,
          customerName: customerName || selectedProfileCustomer?.name,
          customerPhone: customerPhone || selectedProfileCustomer?.phone || selectedProfileCustomer?.secondaryPhone || undefined,
          isCorporate: selectedProfileCustomer?.isCorporate,
          totalAmount: calculatedTotal,
          paymentChannel: paymentChannel || undefined,
          branchName: shop?.name,
          createdById: user?.id,
          createdByName: user?.name || user?.email || "CSO/Admin",
        }).then((res) => {
          if (res.success && !res.alreadyExisted) {
            toast.info("📋 ส่งเรื่องออกใบกำกับภาษีไปยังฝ่ายบัญชีแล้ว");
          }
        }).catch((err) => {
          console.error("Failed to auto-create tax invoice task:", err);
        });
      }
    } catch (err: any) {
      console.error("Job Save Error:", err);
      const errMsg = err?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล';
      setSaveError(errMsg);
      if (
        targetEditingJobId &&
        (err?.isConflict ||
          String(errMsg).includes('409') ||
          String(errMsg).toLowerCase().includes('conflict') ||
          String(errMsg).includes('CONFLICT_ERROR'))
      ) {
        api.fetchAndApplyJob(targetEditingJobId).catch(() => {});
      }
      toast.error(`บันทึกไม่สำเร็จ: ${errMsg}`);
    } finally {
      isSubmittingLockRef.current = false;
      setIsSubmitting(false);
      if (targetEditingJobId) {
        setSavingJobIds(prev => {
          const next = new Set(prev);
          next.delete(targetEditingJobId);
          return next;
        });
      }
    }
  }

  const dialogReceiptData = useMemo(() => {
    if (showReceipt && isDraftPreview) {
      const subtotal = dialogCart.reduce((sum, item) => sum + safeCeil((item.price || 0) * (item.quantity || 0)), 0);

      const expressRate = serviceSpeed === "express_50" ? 0.5 : (serviceSpeed === "express_100" ? 1 : 0);
      const surcharge = expressRate > 0 ? safeCeil(subtotal * expressRate) : 0;

      // Discount on (subtotal + surcharge)
      const discountVal = (subtotal + surcharge) * (dialogDiscountPercent / 100);
      const promoDisc = promoDiscountAmount;
      const baseTotal = subtotal + surcharge - discountVal - promoDisc + fee;
      const vatVal = dialogVatType === "exclusive" ? (baseTotal * (dialogVatRate / 100)) : 0;
      const calculatedTotal = roundGrandTotal(Math.max(0, baseTotal + vatVal), dialogVatType);
      
      const uniqueCategories = Array.from(new Set(dialogCart.map(item => item.category).filter(Boolean)));
      const derivedLaundryTypes = uniqueCategories.length > 0 ? uniqueCategories : undefined;
      
      const remarkParts = [
        activeIsFreeDelivery ? "Free Delivery" : "",
        serviceSpeed === "express_50" ? "Express 50%" : "",
        serviceSpeed === "express_100" ? "Express 100%" : "",
        proformaReceiptNumber ? `Proforma: ${cleanProformaNumber(proformaReceiptNumber)}` : "",
        proformaReceiptNumber ? `Revision: ${proformaRevision}` : "",
        dialogVatType !== "none" ? `VAT: ${dialogVatType} (${dialogVatRate}%)` : "",
        (showDialogDiscount || appliedPromo || promoCodeInput.trim()) ? (
          appliedPromo
            ? `Promo: ${appliedPromo.code} (${appliedPromo.discountTarget}:${promoDiscountAmount})`
            : (promoCodeInput.trim() ? `Promo: ${promoCodeInput.trim().toUpperCase()}` : "")
        ) : "",
      ].filter(Boolean);
      
      const existingJobForProforma = editingJobId ? jobs.find(j => j.id === editingJobId) : null;
      const existingJobWalletPaid = (() => {
        try {
          if (!existingJobForProforma?.adminNotesJson) return 0;
          const parsed = JSON.parse(existingJobForProforma.adminNotesJson);
          if (!Array.isArray(parsed?.payments)) return 0;
          return parsed.payments
            .filter((p: any) => {
              const m = (p.method || "").toLowerCase();
              const ch = (p.channel || "").toLowerCase();
              return m.includes("wallet") || m.includes("credit") || m === "member_wallet" || ch.includes("deduct");
            })
            .reduce((s: number, p: any) => s + (p.amount || 0), 0);
        } catch {
          return 0;
        }
      })();

      const effectiveWalletBalanceForProforma = (isPaidJob && (existingJobForProforma as any)?.walletBalanceAfter != null)
        ? (Number((existingJobForProforma as any).walletBalanceAfter) + (existingJobWalletPaid > 0 ? existingJobWalletPaid : (Number(existingJobForProforma?.totalAmount) || 0)))
        : (selectedProfileCustomer?.creditBalance !== undefined ? selectedProfileCustomer.creditBalance : undefined);

      const mockJob: any = {
        id: editingJobId || "DRAFT",
        customerId: selectedProfileCustomer?.id || (editingJobId ? jobs.find(j => j.id === editingJobId)?.customerId : undefined),
        createdAt: draftCreatedAt,
        customerName: customerName || "Walk-In",
        customerPhone: formatReceiptCustomerPhone({ jobPhone: customerPhone, customer: selectedProfileCustomer }),
        isMember: selectedProfileCustomer?.isMember !== undefined ? selectedProfileCustomer.isMember : (editingJobId ? (jobs.find(j => j.id === editingJobId) as any)?.isMember : undefined),
        memberId: selectedProfileCustomer?.memberId || (editingJobId ? (jobs.find(j => j.id === editingJobId) as any)?.memberId : undefined) || null,
        walletBalance: effectiveWalletBalanceForProforma,
        deliveryAddress: isDelivery ? (() => {
          const baseLoc = stripRoomSuffix(deliveryLoc);
          const cleanRoom = (deliveryRoom || "").replace(/^Room\s*/i, '').trim();
          return cleanRoom ? `${baseLoc} (Room ${cleanRoom})` : baseLoc;
        })() : (selectedProfileCustomer?.defaultAddress || null),
        dropoffLocation: isDelivery ? (() => {
          const baseLoc = stripRoomSuffix(deliveryLoc);
          const cleanRoom = (deliveryRoom || "").replace(/^Room\s*/i, '').trim();
          return cleanRoom ? `${baseLoc} (Room ${cleanRoom})` : baseLoc;
        })() : (selectedProfileCustomer?.defaultAddress || activeShop?.address || ""),
        items: dialogCart.map(item => ({
          name: item.name,
          nameEn: item.nameEn || item.name,
          quantity: item.quantity,
          price: item.price,
          category: item.category,
          unit: item.unit,
        })),
        totalAmount: calculatedTotal,
        discount: discountVal,
        discountPercent: dialogDiscountPercent,
        fee,
        isPaid: editingJobId ? isPaidJob : false,
        paymentChannel: (editingJobId && isPaidJob) ? (paymentChannel || null) : null,
        remark: remarkParts.join(" | ") || null,
        status: editingSubStatus || "billing",
        laundryTypes: derivedLaundryTypes,
        proformaReceiptNumber,
        proformaRevision: proformaRevision ?? undefined,
        vatType: dialogVatType,
        vatRate: dialogVatRate,
        deliveryScheduledAt: deliveryScheduledTime ? new Date(deliveryScheduledTime) : undefined,
        adminNotesJson: editingJobId ? (jobs.find(j => j.id === editingJobId)?.adminNotesJson || null) : null,
      };
      
      const formatted = formatJobToReceiptData(mockJob);
      formatted.isDraft = true; // Mark as draft preview
      formatted.proformaRevision = proformaRevision ?? undefined;
      formatted.isPaid = editingJobId ? isPaidJob : false;
      if (!editingJobId || !isPaidJob) {
        formatted.paymentChannel = undefined;
      }
      // Promo code discount
      if (appliedPromo) {
        formatted.promoCode = appliedPromo.code;
        formatted.promoDiscount = promoDiscountAmount;
        formatted.promoTarget = appliedPromo.discountTarget;
      }
      // Always pass the real jobId so capture logic can find it in jobStore
      if (editingJobId) {
        formatted.jobId = editingJobId;
      }
      return formatted;
    } else if (activeJob) {
      const formatted = formatJobToReceiptData(activeJob);
      formatted.autoCapture = isPaymentEvent;
      if (isPaymentEvent) {
        formatted.isPaid = true;
        formatted.isDraft = false;
      }
      const targetProforma = lastPaidProformaInfoRef.current?.id || (proformaReceiptNumber && proformaReceiptNumber !== "DRAFT" ? cleanProformaNumber(proformaReceiptNumber) : null) || (activeJob as any)?.proformaNumber;
      const targetRevision = lastPaidProformaInfoRef.current ? lastPaidProformaInfoRef.current.rev : proformaRevision;
      if (targetProforma) {
        formatted.proformaId = cleanProformaNumber(targetProforma);
        formatted.proformaRevision = targetRevision ?? undefined;
      }
      // Pass promo info for payment receipts too
      if (appliedPromo) {
        formatted.promoCode = appliedPromo.code;
        formatted.promoDiscount = promoDiscountAmount;
        formatted.promoTarget = appliedPromo.discountTarget;
      }
      return formatted;
    }
    return null;
  }, [showReceipt, isDraftPreview, dialogCart, serviceSpeed, fee, isFreeDelivery, proformaReceiptNumber, proformaRevision, editingJobId, customerName, customerPhone, isDelivery, deliveryLoc, deliveryRoom, selectedProfileCustomer, paymentMethod, paymentChannel, editingSubStatus, activeJob, dialogDiscountPercent, dialogDiscountAmount, isPaymentEvent, draftCreatedAt, deliveryScheduledTime, appliedPromo, promoDiscountAmount]);


  const handleEditFullJobRef = useRef(handleEditFullJob);
  handleEditFullJobRef.current = handleEditFullJob;
  const stableHandleEditFullJob = useCallback((job: Job, walletTx?: any) => {
    setReviewingWalletTx(walletTx || null);
    handleEditFullJobRef.current(job);
  }, []);

  const handleApproveFromJobDialog = async () => {
    if (!reviewingWalletTx) return;
    setIsWalletActionProcessing(true);
    try {
      await walletApprovalStore.approve(
        reviewingWalletTx.id,
        user?.id || "system",
        user?.name || user?.email || "Admin"
      );
      toast.success(`Approved ${reviewingWalletTx.type} ฿${reviewingWalletTx.amount.toLocaleString()} สำเร็จ`);
      setReviewingWalletTx(null);
    } catch (e: any) {
      toast.error("ไม่สามารถอนุมัติได้: " + e.message);
    } finally {
      setIsWalletActionProcessing(false);
    }
  };

  const handleConfirmWalletReject = async () => {
    if (!reviewingWalletTx || !walletRejectReason.trim()) return;
    setIsWalletActionProcessing(true);
    try {
      await walletApprovalStore.reject(
        reviewingWalletTx.id,
        user?.id || "system",
        user?.name || user?.email || "Admin",
        walletRejectReason.trim()
      );
      toast.success(`Rejected #${reviewingWalletTx.id.slice(0, 8)} สำเร็จ`);
      setReviewingWalletTx(null);
      setWalletRejectModalOpen(false);
      setWalletRejectReason("");
    } catch (e: any) {
      toast.error("ไม่สามารถปฏิเสธได้: " + e.message);
    } finally {
      setIsWalletActionProcessing(false);
    }
  };

  const handleUnlockPaid = async () => {
    if (!editingJobId || !unlockPaidReason.trim() || !canUnlockPaid) return;
    setIsUnlockingPaid(true);
    try {
      const result = await unlockPaidJobAction({
        jobId: editingJobId,
        reason: unlockPaidReason.trim(),
        actorId: user?.id,
        actorName: user?.name || user?.email,
        actorRole: user?.role,
      });

      if (!result.success) {
        toast.error(result.error || "ไม่สามารถ Unlock ได้");
        return;
      }

      // 1. Reset dialog payment states immediately
      setPaymentMethod("unpaid");
      setShopPaymentMethod("unpaid");

      // Clear old receipt proofs from local edit state so saving doesn't restore old receipts
      const cleanReceiptUrls = (urls: string[]) => 
        urls.filter(u => typeof u === "string" && !u.includes("/receipt-") && !u.includes(`receipt-${editingJobId}`));
      setBillImageUrls(prev => cleanReceiptUrls(prev));
      setOrigBillImageUrls(prev => cleanReceiptUrls(prev));

      // 2. Update originalJobRef.current so OCC (field-level diffing) doesn't re-save stale isPaid: true or stale receipts
      if (originalJobRef.current) {
        originalJobRef.current.isPaid = false;
        originalJobRef.current.isShopPaid = false;
        originalJobRef.current.shopPaidAt = null;
        originalJobRef.current.csoPaidAt = null;
        originalJobRef.current.adminNotesJson = result.updatedJob?.adminNotesJson;
        if (result.updatedJob?.billImageUrl !== undefined) {
          originalJobRef.current.billImageUrl = result.updatedJob.billImageUrl;
        }
      }

      // 3. Update in-memory job store (Kanban & Edit Dialog unlock immediately)
      api.optimisticUpdate(editingJobId, {
        isPaid: false,
        isShopPaid: false,
        shopPaidAt: null,
        csoPaidAt: null,
        adminNotesJson: result.updatedJob?.adminNotesJson,
        billImageUrl: result.updatedJob?.billImageUrl ?? null,
      } as any);

      // 4. Update in-memory customer wallet & dialog customer badge if refund occurred
      if (result.walletRefundAmount && result.walletRefundAmount > 0 && selectedProfileCustomer) {
        const newBal = (selectedProfileCustomer.creditBalance || 0) + result.walletRefundAmount;
        setSelectedProfileCustomer(prev => prev ? { ...prev, creditBalance: newBal } : null);
        api.optimisticUpdateCustomer(selectedProfileCustomer.id, {
          creditBalance: newBal,
        });
        customerStore.notify();
      }

      toast.success(
        `🔓 ปลดล็อค Job สำเร็จ${result.walletRefundAmount && result.walletRefundAmount > 0 
          ? ` — คืน Wallet ฿${result.walletRefundAmount.toLocaleString()}` 
          : ""}`
      );

      setUnlockPaidDialogOpen(false);
      setUnlockPaidReason("");
    } catch (err: any) {
      toast.error(err?.message || "เกิดข้อผิดพลาดในการปลดล็อค");
    } finally {
      setIsUnlockingPaid(false);
    }
  };
  const handleOpenBeamPaymentFromDialog = async () => {
    if (!editingJobId || isStartingBeamPayment) return;
    setIsStartingBeamPayment(true);
    try {
      const current = jobs.find((j) => j.id === editingJobId) || activeJob;
      if (!current) return;

      const itemsPayload = dialogCart.map((item) => ({
        name: item.name,
        nameEn: item.nameEn || item.name,
        quantity: item.quantity,
        price: item.price,
        basePrice: item.basePrice,
        serviceId: item.id,
        category: item.category,
        unit: item.unit || "pcs",
      }));

      const uniqueCategories = Array.from(
        new Set(dialogCart.map((item) => item.category).filter(Boolean))
      );
      const derivedLaundryTypes =
        uniqueCategories.length > 0 ? uniqueCategories : undefined;

      const subtotal = dialogCart.reduce(
        (sum, item) => sum + safeCeil((item.price || 0) * (item.quantity || 0)),
        0
      );
      const expressRate =
        serviceSpeed === "express_50" ? 0.5 : serviceSpeed === "express_100" ? 1 : 0;
      const surcharge = expressRate > 0 ? safeCeil(subtotal * expressRate) : 0;
      const discountVal = showDialogDiscount
        ? (subtotal + surcharge) * (dialogDiscountPercent / 100)
        : 0;

      const hasActualItems = dialogCart.some(
        (item) => item.category !== "PACKAGE" && !String(item.name || "").toLowerCase().includes("package")
      );
      const currentCartHash = computeCartHash({
        items: dialogCart,
        serviceSpeed,
        fee,
        discountPercent: showDialogDiscount ? dialogDiscountPercent : 0,
        promoCode: appliedPromo?.code || promoCodeInput.trim() || null,
        promoDiscount: appliedPromo ? promoDiscountAmount : 0,
        vatType: dialogVatType,
        vatRate: dialogVatRate,
      });

      const isRfJob = editingJobId.startsWith("RF-");
      let targetPfNum: string | null = null;
      let targetPfRev: number | null = null;
      let targetPfHash: string | null = null;

      if (hasActualItems) {
        const existingPf = cleanProformaNumber(
          (current as any).proformaNumber ||
            (current as any).proformaReceiptNumber ||
            (proformaReceiptNumber && proformaReceiptNumber !== "DRAFT" ? proformaReceiptNumber : null)
        );
        if (existingPf) {
          targetPfNum = existingPf;
          const prevHash = (current as any).proformaCartHash || lastProformaCartHash;
          const isCartChanged = Boolean(prevHash && prevHash !== currentCartHash);
          const baseRev =
            (current as any).proformaRevision !== null && (current as any).proformaRevision !== undefined
              ? Number((current as any).proformaRevision)
              : proformaRevision !== null && proformaRevision !== undefined
                ? Number(proformaRevision)
                : isRfJob
                  ? 1
                  : 0;
          targetPfRev =
            isCartChanged && !proformaPressedSinceLastEdit && !current.isPaid && !(current as any).isShopPaid
              ? baseRev + 1
              : baseRev;
          targetPfHash = currentCartHash;
        } else {
          targetPfNum = generateProformaBaseNumber(editingJobId);
          targetPfRev = isRfJob ? 1 : 0;
          targetPfHash = currentCartHash;
        }

        setProformaReceiptNumber(targetPfNum);
        setProformaRevision(targetPfRev);
        setLastProformaCartHash(targetPfHash);
      }

      const updatedData: Partial<Job> = {
        items: itemsPayload as any,
        totalAmount: dialogTotal,
        fee,
        discount: discountVal,
        discountPercent: showDialogDiscount ? dialogDiscountPercent : 0,
        paymentChannel: paymentChannel || "Gateway",
        serviceType: dialogCart[0]?.id || current.serviceType || "wash_fold",
        ...(derivedLaundryTypes ? { laundryTypes: derivedLaundryTypes as any } : {}),
        ...(targetPfNum
          ? {
              proformaNumber: targetPfNum,
              proformaRevision: targetPfRev ?? 0,
              proformaCartHash: targetPfHash,
            }
          : {}),
      } as any;

      // Persist to store & DB immediately so the job reflects the new price and items
      await jobStore.updateJobDetails(editingJobId, updatedData);

      if (originalJobRef.current && originalJobRef.current.id === editingJobId) {
        Object.assign(originalJobRef.current, updatedData);
      }

      const updatedJob = {
        ...current,
        ...updatedData,
      };

      setOnlinePaymentJob(updatedJob);
    } catch (err: any) {
      console.error("Failed to update job before opening Beam Payment:", err);
      toast.error("ไม่สามารถอัปเดตราคาก่อนชำระเงินได้");
    } finally {
      setIsStartingBeamPayment(false);
    }
  };

  const handleCreateNewJobRef = useRef(handleCreateNewJob);
  handleCreateNewJobRef.current = handleCreateNewJob;
  const stableHandleCreateNewJob = useCallback(() => {
    handleCreateNewJobRef.current();
  }, []);

  return (
    <>
      <AnimatePresence mode="wait">
        <motion.div
        className="flex min-h-screen bg-slate-50/70"
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        key="admin-page"
      >
        {/* Sidebar */}
        <aside className={`hidden lg:flex flex-col border-r border-slate-200/80 bg-white/95 backdrop-blur-xl transition-all duration-300 sticky top-0 h-screen z-20 shadow-[1px_0_12px_-4px_rgba(15,23,42,0.04)] ${isSidebarCollapsed ? "w-[76px]" : "w-64"}`}>
          <div className="flex h-16 items-center justify-center border-b border-slate-100/90 px-4 overflow-hidden shrink-0">
            {isSidebarCollapsed ? (
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl flex items-center justify-center font-black text-white text-lg shadow-sm shadow-indigo-500/20">
                T
              </div>
            ) : (
              <Logo />
            )}
          </div>
          
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
            className="absolute -right-3 top-5 bg-white border border-slate-200/90 rounded-full p-1 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 shadow-sm z-30 transition-all cursor-pointer hover:scale-105"
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>

          <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto overflow-x-hidden hide-scrollbar">
            {/* Group 1: Operations */}
            {(hasAccess("dashboard") || hasAccess("jobs") || hasAccess("pos") || hasAccess("billing") || hasAccess("tasks")) && (
              <div className="space-y-1">
                {!isSidebarCollapsed ? (
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">
                    Operations
                  </p>
                ) : (
                  <div className="mx-3 my-1 border-t border-slate-100" />
                )}

                {hasAccess("dashboard") && (
                  <motion.a
                    href="#dashboard"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("dashboard"); }}
                    whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                    className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                      activeTab === "dashboard"
                        ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    }`}
                    title="Dashboard"
                  >
                    {activeTab === "dashboard" && !isSidebarCollapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                    )}
                    <LayoutDashboard size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "dashboard" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                    {!isSidebarCollapsed && <span className="truncate">Dashboard</span>}
                  </motion.a>
                )}

                {hasAccess("jobs") && (
                  <motion.a
                    href="#jobs"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("jobs"); }}
                    whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                    className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                      activeTab === "jobs"
                        ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    }`}
                    title="All Jobs"
                  >
                    {activeTab === "jobs" && !isSidebarCollapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                    )}
                    <Package size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "jobs" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                    {!isSidebarCollapsed && <span className="truncate">All Jobs</span>}
                  </motion.a>
                )}

                {hasAccess("pos") && (
                  <motion.a
                    href="#pos"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("pos"); }}
                    whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                    className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                      activeTab === "pos"
                        ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    }`}
                    title="POS Terminal"
                  >
                    {activeTab === "pos" && !isSidebarCollapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                    )}
                    <CreditCard size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "pos" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                    {!isSidebarCollapsed && <span className="truncate">POS Terminal</span>}
                  </motion.a>
                )}

                {hasAccess("billing") && (
                  <Link 
                    href="/billing" 
                    className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-100/70`}
                    title="Billing & Verification"
                  >
                    <Camera size={isSidebarCollapsed ? 20 : 17} className="shrink-0 text-slate-400 group-hover:text-slate-700 transition-colors" />
                    {!isSidebarCollapsed && <span className="truncate">Billing</span>}
                  </Link>
                )}

                <motion.a
                  href="#tasks"
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("tasks"); }}
                  whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                  className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                    activeTab === "tasks"
                      ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                  }`}
                  title="Tasks"
                >
                  {activeTab === "tasks" && !isSidebarCollapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                  )}
                  <ClipboardCheck size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "tasks" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                  {!isSidebarCollapsed && <span className="truncate">Tasks</span>}
                </motion.a>
              </div>
            )}

            {/* Group 2: Sales & CRM */}
            {(hasAccess("customers") || hasAccess("services") || hasAccess("marketing")) && (
              <div className="space-y-1">
                {!isSidebarCollapsed ? (
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">
                    Sales & CRM
                  </p>
                ) : (
                  <div className="mx-3 my-1 border-t border-slate-100" />
                )}

                {hasAccess("customers") && (
                  <motion.a
                    href="#customers"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("customers"); }}
                    whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                    className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                      activeTab === "customers"
                        ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    }`}
                    title="Customers (CRM)"
                  >
                    {activeTab === "customers" && !isSidebarCollapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                    )}
                    <div className="relative shrink-0">
                      <Users size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "customers" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                      {isSidebarCollapsed && canApproveWallet && pendingWalletMap.total > 0 && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse border border-white" />
                      )}
                    </div>
                    {!isSidebarCollapsed && (
                      <div className="flex items-center justify-between flex-1 min-w-0">
                        <span className="truncate">Customers (CRM)</span>
                        {canApproveWallet && pendingWalletMap.total > 0 && (
                          <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white animate-pulse">
                            {pendingWalletMap.total}
                          </span>
                        )}
                      </div>
                    )}
                  </motion.a>
                )}

                {hasAccess("services") && (
                  <motion.a
                    href="#services"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("services"); }}
                    whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                    className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                      activeTab === "services"
                        ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    }`}
                    title="Service Menu"
                  >
                    {activeTab === "services" && !isSidebarCollapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                    )}
                    <Tag size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "services" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                    {!isSidebarCollapsed && <span className="truncate">Service Menu</span>}
                  </motion.a>
                )}

                {hasAccess("marketing") && (
                  <motion.a
                    href="#marketing"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("marketing"); }}
                    whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                    className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                      activeTab === "marketing"
                        ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    }`}
                    title="Marketing & Promos"
                  >
                    {activeTab === "marketing" && !isSidebarCollapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                    )}
                    <Megaphone size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "marketing" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                    {!isSidebarCollapsed && <span className="truncate">Marketing & Promos</span>}
                  </motion.a>
                )}
              </div>
            )}

            {/* Group 3: Fleet & Map */}
            {(hasAccess("dispatch") || hasAccess("riders") || hasAccess("map") || hasAccess("calculator")) && (
              <div className="space-y-1">
                {!isSidebarCollapsed ? (
                  <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">
                    Fleet & Map
                  </p>
                ) : (
                  <div className="mx-3 my-1 border-t border-slate-100" />
                )}

                {hasAccess("dispatch") && (
                  <motion.a
                    href="#dispatch"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("dispatch"); }}
                    whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                    className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                      activeTab === "dispatch"
                        ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    }`}
                    title="Dispatch Schedule"
                  >
                    {activeTab === "dispatch" && !isSidebarCollapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                    )}
                    <CalendarClock size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "dispatch" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                    {!isSidebarCollapsed && <span className="truncate">Dispatch Schedule</span>}
                  </motion.a>
                )}

                {hasAccess("riders") && (
                  <motion.a
                    href="#riders"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("riders"); }}
                    whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                    className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                      activeTab === "riders"
                        ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    }`}
                    title="Riders"
                  >
                    {activeTab === "riders" && !isSidebarCollapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                    )}
                    <Truck size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "riders" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                    {!isSidebarCollapsed && <span className="truncate">Riders</span>}
                  </motion.a>
                )}

                {hasAccess("map") && (
                  <motion.a
                    href="#map"
                    onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("map"); }}
                    whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                    className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                      activeTab === "map"
                        ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                    }`}
                    title="Live Map"
                  >
                    {activeTab === "map" && !isSidebarCollapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                    )}
                    <Map size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "map" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                    {!isSidebarCollapsed && <span className="truncate">Live Map</span>}
                  </motion.a>
                )}

                {hasAccess("calculator") && (
                  <button onClick={() => handleTabChange("calculator")} className="block w-full text-left">
                    <motion.div
                      whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                      className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                        activeTab === "calculator" || activeTab === "pois"
                          ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                      }`}
                      title="Distance Calculator"
                    >
                      {(activeTab === "calculator" || activeTab === "pois") && !isSidebarCollapsed && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                      )}
                      <Calculator size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "calculator" || activeTab === "pois" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                      {!isSidebarCollapsed && <span className="truncate">Distance Calculator</span>}
                    </motion.div>
                  </button>
                )}
              </div>
            )}

            {/* Group 4: Management */}
            <div className="space-y-1">
              {!isSidebarCollapsed ? (
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">
                  Management
                </p>
              ) : (
                <div className="mx-3 my-1 border-t border-slate-100" />
              )}

              {hasAccess("reports") && (
                <motion.a
                  href="#reports"
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("reports"); }}
                  whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                  className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                    activeTab === "reports"
                      ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                  }`}
                  title="Reports & Analytics"
                >
                  {activeTab === "reports" && !isSidebarCollapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                  )}
                  <BarChart3 size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "reports" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                  {!isSidebarCollapsed && <span className="truncate">Reports & Analytics</span>}
                </motion.a>
              )}

              {hasAccess("activity-logs") && (
                <motion.a
                  href="#activity-logs"
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("activity-logs"); }}
                  whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                  className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                    activeTab === "activity-logs"
                      ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                  }`}
                  title="Activity Logs"
                >
                  {activeTab === "activity-logs" && !isSidebarCollapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                  )}
                  <ClipboardList size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "activity-logs" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                  {!isSidebarCollapsed && <span className="truncate">Activity Logs</span>}
                </motion.a>
              )}

              {hasAccess("users") && (
                <motion.a
                  href="#users"
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("users"); }}
                  whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                  className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                    activeTab === "users"
                      ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                  }`}
                  title="Manage Users"
                >
                  {activeTab === "users" && !isSidebarCollapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                  )}
                  <ShieldCheck size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "users" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                  {!isSidebarCollapsed && <span className="truncate">Manage Users</span>}
                </motion.a>
              )}

              {hasAccess("settings") && (
                <motion.a
                  href="#settings"
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("settings"); }}
                  whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                  className={`group relative flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer ${
                    activeTab === "settings"
                      ? "bg-indigo-50/90 text-indigo-700 ring-1 ring-indigo-500/15 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/70"
                  }`}
                  title="Settings"
                >
                  {activeTab === "settings" && !isSidebarCollapsed && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-600 rounded-r-full" />
                  )}
                  <Settings size={isSidebarCollapsed ? 20 : 17} className={`shrink-0 transition-colors ${activeTab === "settings" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-700"}`} />
                  {!isSidebarCollapsed && <span className="truncate">Settings</span>}
                </motion.a>
              )}

              <motion.a
                href="https://thelaunderingcompany.com/"
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ x: isSidebarCollapsed ? 0 : 2 }}
                className={`group flex items-center gap-3 rounded-xl ${isSidebarCollapsed ? 'px-0 justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} text-[13px] font-semibold transition-all cursor-pointer text-slate-600 hover:text-slate-900 hover:bg-slate-100/70`}
                title="Order Detergent"
              >
                <Droplets size={isSidebarCollapsed ? 20 : 17} className="shrink-0 text-sky-500" />
                {!isSidebarCollapsed && (
                  <span className="truncate flex items-center justify-between flex-1">
                    <span>Order Detergent</span>
                    <ExternalLink size={12} className="text-slate-400 ml-1.5 shrink-0" />
                  </span>
                )}
              </motion.a>
            </div>
          </nav>

          {/* Sidebar User Profile & Actions Footer */}
          <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50/50">
            {!isSidebarCollapsed ? (
              <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl bg-white border border-slate-200/70 shadow-2xs">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-sky-500 text-white font-bold text-xs flex items-center justify-center shrink-0 uppercase shadow-2xs">
                  {(user?.name || user?.email || "U").slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 truncate leading-tight">
                    {user?.name || user?.email?.split("@")[0] || "Staff"}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 truncate">
                    {user?.role || "Staff"}
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="w-9 h-9 mx-auto rounded-xl bg-gradient-to-br from-indigo-600 to-sky-500 text-white font-bold text-xs flex items-center justify-center uppercase shadow-2xs"
                title={`${user?.name || user?.email || "Staff"} (${user?.role || "staff"})`}
              >
                {(user?.name || user?.email || "U").slice(0, 2)}
              </div>
            )}
            <div className={`flex ${isSidebarCollapsed ? "flex-col gap-1" : "items-center gap-1"}`}>
              <Link href="/privacy" className={isSidebarCollapsed ? "w-full" : "flex-1"}>
                <Button variant="ghost" size="sm" className={`w-full h-8 gap-1.5 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 rounded-lg cursor-pointer ${isSidebarCollapsed ? 'px-0 justify-center' : 'justify-start px-2.5'}`} title="Privacy Policy">
                  <ShieldCheck size={15} className="shrink-0" />
                  {!isSidebarCollapsed && <span className="truncate">Privacy</span>}
                </Button>
              </Link>
              <Button variant="ghost" size="sm" className={`${isSidebarCollapsed ? "w-full px-0 justify-center" : "flex-1 justify-start px-2.5"} h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer`} onClick={handleLogout} title="Logout">
                <LogOut size={15} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Logout</span>}
              </Button>
            </div>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <>
              {/* Drawer Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.4 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden"
              />
              {/* Drawer Sidebar Menu */}
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 left-0 w-72 bg-white shadow-2xl z-50 lg:hidden flex flex-col h-full border-r border-slate-200/80"
              >
                {/* Header logo & close action */}
                <div className="flex h-16 items-center justify-between border-b border-slate-100 px-5 shrink-0">
                  <Logo />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="text-slate-400 hover:text-slate-700 rounded-xl"
                  >
                    <X size={18} />
                  </Button>
                </div>

                {/* Sidebar Tab Nav Items (Grouped) */}
                <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto hide-scrollbar">
                  {/* Operations */}
                  <div className="space-y-1">
                    <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Operations</p>
                    {hasAccess("dashboard") && (
                      <a
                        href="#dashboard"
                        onClick={(e) => {
                          e.preventDefault();
                          handleTabChange("dashboard");
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                          activeTab === "dashboard" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                        }`}
                      >
                        <LayoutDashboard size={17} className={activeTab === "dashboard" ? "text-indigo-600" : "text-slate-400"} />
                        <span>Dashboard</span>
                      </a>
                    )}
                    {hasAccess("jobs") && (
                      <a
                        href="#jobs"
                        onClick={(e) => {
                          e.preventDefault();
                          handleTabChange("jobs");
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                          activeTab === "jobs" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                        }`}
                      >
                        <Package size={17} className={activeTab === "jobs" ? "text-indigo-600" : "text-slate-400"} />
                        <span>All Jobs</span>
                      </a>
                    )}
                    {hasAccess("pos") && (
                      <a
                        href="#pos"
                        onClick={(e) => {
                          e.preventDefault();
                          handleTabChange("pos");
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                          activeTab === "pos" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                        }`}
                      >
                        <CreditCard size={17} className={activeTab === "pos" ? "text-indigo-600" : "text-slate-400"} />
                        <span>POS Terminal</span>
                      </a>
                    )}
                    {hasAccess("billing") && (
                      <Link
                        href="/billing"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer text-slate-600 hover:bg-slate-100/70"
                      >
                        <Camera size={17} className="text-slate-400" />
                        <span>Billing</span>
                      </Link>
                    )}
                    <a
                      href="#tasks"
                      onClick={(e) => {
                        e.preventDefault();
                        handleTabChange("tasks");
                        setIsMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                        activeTab === "tasks" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                      }`}
                    >
                      <ClipboardCheck size={17} className={activeTab === "tasks" ? "text-indigo-600" : "text-slate-400"} />
                      <span>Tasks</span>
                    </a>
                  </div>

                  {/* Sales & CRM */}
                  {(hasAccess("customers") || hasAccess("services") || hasAccess("marketing")) && (
                    <div className="space-y-1">
                      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Sales & CRM</p>
                      {hasAccess("customers") && (
                        <a
                          href="#customers"
                          onClick={(e) => {
                            e.preventDefault();
                            handleTabChange("customers");
                            setIsMobileMenuOpen(false);
                          }}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                            activeTab === "customers" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                          }`}
                        >
                          <Users size={17} className={activeTab === "customers" ? "text-indigo-600" : "text-slate-400"} />
                          <span className="flex-1">Customers (CRM)</span>
                          {canApproveWallet && pendingWalletMap.total > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white animate-pulse">
                              {pendingWalletMap.total}
                            </span>
                          )}
                        </a>
                      )}
                      {hasAccess("services") && (
                        <a
                          href="#services"
                          onClick={(e) => {
                            e.preventDefault();
                            handleTabChange("services");
                            setIsMobileMenuOpen(false);
                          }}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                            activeTab === "services" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                          }`}
                        >
                          <Tag size={17} className={activeTab === "services" ? "text-indigo-600" : "text-slate-400"} />
                          <span>Service Menu</span>
                        </a>
                      )}
                      {hasAccess("marketing") && (
                        <a
                          href="#marketing"
                          onClick={(e) => {
                            e.preventDefault();
                            handleTabChange("marketing");
                            setIsMobileMenuOpen(false);
                          }}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                            activeTab === "marketing" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                          }`}
                        >
                          <Megaphone size={17} className={activeTab === "marketing" ? "text-indigo-600" : "text-slate-400"} />
                          <span>Marketing & Promos</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Fleet & Map */}
                  {(hasAccess("dispatch") || hasAccess("riders") || hasAccess("map") || hasAccess("calculator")) && (
                    <div className="space-y-1">
                      <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Fleet & Map</p>
                      {hasAccess("dispatch") && (
                        <a
                          href="#dispatch"
                          onClick={(e) => {
                            e.preventDefault();
                            handleTabChange("dispatch");
                            setIsMobileMenuOpen(false);
                          }}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                            activeTab === "dispatch" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                          }`}
                        >
                          <CalendarClock size={17} className={activeTab === "dispatch" ? "text-indigo-600" : "text-slate-400"} />
                          <span>Dispatch Schedule</span>
                        </a>
                      )}
                      {hasAccess("riders") && (
                        <a
                          href="#riders"
                          onClick={(e) => {
                            e.preventDefault();
                            handleTabChange("riders");
                            setIsMobileMenuOpen(false);
                          }}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                            activeTab === "riders" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                          }`}
                        >
                          <Truck size={17} className={activeTab === "riders" ? "text-indigo-600" : "text-slate-400"} />
                          <span>Riders</span>
                        </a>
                      )}
                      {hasAccess("map") && (
                        <a
                          href="#map"
                          onClick={(e) => {
                            e.preventDefault();
                            handleTabChange("map");
                            setIsMobileMenuOpen(false);
                          }}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                            activeTab === "map" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                          }`}
                        >
                          <Map size={17} className={activeTab === "map" ? "text-indigo-600" : "text-slate-400"} />
                          <span>Live Map</span>
                        </a>
                      )}
                      {hasAccess("calculator") && (
                        <a
                          href="#calculator"
                          onClick={(e) => {
                            e.preventDefault();
                            handleTabChange("calculator");
                            setIsMobileMenuOpen(false);
                          }}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                            activeTab === "calculator" || activeTab === "pois" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                          }`}
                        >
                          <Calculator size={17} className={activeTab === "calculator" || activeTab === "pois" ? "text-indigo-600" : "text-slate-400"} />
                          <span>Distance Calculator</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Management */}
                  <div className="space-y-1">
                    <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Management</p>
                    {hasAccess("reports") && (
                      <a
                        href="#reports"
                        onClick={(e) => {
                          e.preventDefault();
                          handleTabChange("reports");
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                          activeTab === "reports" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                        }`}
                      >
                        <BarChart3 size={17} className={activeTab === "reports" ? "text-indigo-600" : "text-slate-400"} />
                        <span>Reports & Analytics</span>
                      </a>
                    )}
                    {hasAccess("activity-logs") && (
                      <a
                        href="#activity-logs"
                        onClick={(e) => {
                          e.preventDefault();
                          handleTabChange("activity-logs");
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                          activeTab === "activity-logs" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                        }`}
                      >
                        <ClipboardList size={17} className={activeTab === "activity-logs" ? "text-indigo-600" : "text-slate-400"} />
                        <span>Activity Logs</span>
                      </a>
                    )}
                    {hasAccess("users") && (
                      <a
                        href="#users"
                        onClick={(e) => {
                          e.preventDefault();
                          handleTabChange("users");
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                          activeTab === "users" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                        }`}
                      >
                        <ShieldCheck size={17} className={activeTab === "users" ? "text-indigo-600" : "text-slate-400"} />
                        <span>Manage Users</span>
                      </a>
                    )}
                    {hasAccess("settings") && (
                      <a
                        href="#settings"
                        onClick={(e) => {
                          e.preventDefault();
                          handleTabChange("settings");
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all cursor-pointer ${
                          activeTab === "settings" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-500/15" : "text-slate-600 hover:bg-slate-100/70"
                        }`}
                      >
                        <Settings size={17} className={activeTab === "settings" ? "text-indigo-600" : "text-slate-400"} />
                        <span>Settings</span>
                      </a>
                    )}
                    <a
                      href="https://thelaunderingcompany.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all text-slate-600 hover:bg-slate-100/70 cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <Droplets size={17} className="text-sky-500" />
                        <span>Order Detergent</span>
                      </div>
                      <ExternalLink size={13} className="text-slate-400" />
                    </a>
                  </div>
                </nav>

                {/* Drawer Footer Actions */}
                <div className="border-t border-slate-100 p-3 space-y-2 bg-slate-50/50">
                  <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white border border-slate-200/70">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-sky-500 text-white font-bold text-xs flex items-center justify-center shrink-0 uppercase">
                      {(user?.name || user?.email || "U").slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{user?.name || user?.email?.split("@")[0] || "Staff"}</p>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 truncate">{user?.role || "Staff"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link href="/privacy" onClick={() => setIsMobileMenuOpen(false)} className="flex-1">
                      <Button variant="ghost" size="sm" className="w-full h-8 gap-1.5 text-xs text-slate-500 hover:text-slate-900 justify-start">
                        <ShieldCheck size={15} />
                        <span>Privacy</span>
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-8 gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 justify-start"
                      onClick={() => {
                        handleLogout();
                        setIsMobileMenuOpen(false);
                      }}
                    >
                      <LogOut size={15} />
                      <span>Logout</span>
                    </Button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-50/70">
          {isVersionOutdated && (
            <div className="w-full bg-amber-500 text-slate-950 px-4 py-2.5 text-xs font-bold flex items-center justify-between shadow-md z-30 shrink-0">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-slate-950 shrink-0" />
                <span>ระบบมีการอัปเดตเวอร์ชันใหม่ กรุณากดรีเฟรชหน้าจอเพื่อโหลดเวอร์ชันล่าสุด</span>
              </div>
              <button 
                type="button"
                onClick={() => { Promise.resolve(logout()).finally(() => { window.location.replace('/login?reason=new_deploy'); }); }}
                className="bg-slate-900 text-white px-3 py-1 rounded text-xs font-bold hover:bg-slate-800 transition shrink-0 cursor-pointer"
              >
                รีเฟรชเดี๋ยวนี้ (Refresh)
              </button>
            </div>
          )}
          {/* Top bar */}
          <header className={`sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/85 backdrop-blur-md px-4 sm:px-6 lg:px-8 shrink-0 ${activeTab === 'pos' ? 'lg:hidden' : ''}`}>
            <div className="flex items-center gap-3 lg:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileMenuOpen(true)}
                className="text-slate-600 hover:text-slate-900 rounded-xl"
              >
                <Menu size={20} />
              </Button>
              <Logo />
            </div>

            {(() => {
              const tabMeta: Record<string, { section: string; title: string; subtitle: string }> = {
                dashboard: { section: "Operations", title: "Command Center", subtitle: "Live orders, fleet overview & team tasks" },
                jobs: { section: "Operations", title: "All Jobs", subtitle: "Kanban board, order tracking & payment statuses" },
                pos: { section: "Operations", title: "POS Terminal", subtitle: "In-store walk-in & order creation" },
                tasks: { section: "Operations", title: "Task Management", subtitle: "Team assignments, checklists & SLA tracking" },
                customers: { section: "Sales & CRM", title: "Customers (CRM)", subtitle: "Profiles, corporate accounts, wallets & vouchers" },
                services: { section: "Sales & CRM", title: "Service Menu", subtitle: "Pricing tiers, laundry packages & catalog" },
                marketing: { section: "Sales & CRM", title: "Marketing & Promos", subtitle: "Campaigns, vouchers & customer acquisition" },
                dispatch: { section: "Fleet & Map", title: "Dispatch Schedule", subtitle: "Rider shifts, pickup & delivery routing" },
                riders: { section: "Fleet & Map", title: "Rider Fleet", subtitle: "Rider profiles, commissions & status" },
                map: { section: "Fleet & Map", title: "Live GPS Map", subtitle: "Real-time rider locations & branch hubs" },
                calculator: { section: "Fleet & Map", title: "Distance Calculator", subtitle: "Route fee estimation & POI management" },
                pois: { section: "Fleet & Map", title: "POI Locations", subtitle: "Saved buildings, condos & coordinates" },
                reports: { section: "Management", title: "Reports & Analytics", subtitle: "Revenue, payment splits & historical insights" },
                "activity-logs": { section: "Management", title: "Activity Logs", subtitle: "System audit trail & staff actions" },
                users: { section: "Management", title: "Manage Users", subtitle: "Staff accounts, roles & branch permissions" },
                settings: { section: "Management", title: "System Settings", subtitle: "Branches, payment channels & configurations" },
              };
              const currentMeta = tabMeta[activeTab] || { section: "Workspace", title: "Dashboard", subtitle: "That Laundry Shop" };
              return (
                <div className="hidden lg:flex items-center gap-3 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600/90 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                        {currentMeta.section}
                      </span>
                      <span className="text-slate-300 text-xs">/</span>
                      <h1 className="text-base font-bold text-slate-900 tracking-tight truncate">
                        {currentMeta.title}
                      </h1>
                    </div>
                  </div>
                  <span className="hidden xl:inline-flex items-center gap-1.5 ml-2 px-2.5 py-1 rounded-lg bg-slate-100/80 text-slate-500 text-xs font-medium border border-slate-200/60">
                    <Clock size={12} className="text-slate-400" />
                    {format(new Date(), "EEE, dd MMM yyyy")}
                  </span>
                </div>
              );
            })()}
            
            <div className="flex items-center gap-2.5">
              {/* Real-time Connection & Save Status Indicator */}
              {(() => {
                const saveEntries = Object.entries(realtimeState.jobSaveStates || {});
                const savingCount = saveEntries.filter(([, s]) => s.status === 'saving').length;
                const failedEntry = saveEntries.find(([, s]) => s.status === 'failed' || s.status === 'conflict');
                const conn = realtimeState.connectionStatus;

                if (savingCount > 0) {
                  return (
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200 shadow-2xs"
                      title="Saving changes to server..."
                    >
                      <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
                      <span>Saving{savingCount > 1 ? ` (${savingCount})` : '...'}</span>
                    </div>
                  );
                }
                if (failedEntry) {
                  const [failedJobId, failedState] = failedEntry;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        const targetJob = jobs.find(j => j.id === failedJobId);
                        if (targetJob) {
                          handleEditFullJob(targetJob);
                          setDialogOpen(true);
                        } else {
                          realtimeStore.clearJobSaveState(failedJobId);
                        }
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer shadow-2xs"
                      title={failedState.message || "Save failed"}
                    >
                      <AlertTriangle size={12} className="text-rose-600 shrink-0" />
                      <span>{failedState.status === 'conflict' ? 'Save Conflict' : 'Save Failed'} (#{failedJobId})</span>
                    </button>
                  );
                }
                if (conn === 'connected') {
                  return (
                    <div
                      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50/90 text-emerald-700 border border-emerald-200/80"
                      title="Real-time order updates active (SSE)"
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span>Live</span>
                    </div>
                  );
                }
                if (conn === 'reconnecting' || conn === 'connecting') {
                  return (
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                      title="Reconnecting to real-time stream..."
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span className="hidden sm:inline">Reconnecting...</span>
                    </div>
                  );
                }
                if (conn === 'fallback_polling') {
                  return (
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-300"
                      title="Live stream unavailable — syncing automatically via lightweight fallback polling"
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="hidden sm:inline">Fallback Sync</span>
                    </div>
                  );
                }
                return (
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200"
                    title="Offline — changes will not save until connection is restored"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span>Disconnected</span>
                  </div>
                );
              })()}
              {canApproveWallet && pendingWalletMap.total > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleTabChange("customers");
                    window.dispatchEvent(new CustomEvent("open-crm-tab", { detail: { tab: "wallet_approvals" } }));
                  }}
                  className="h-9 px-3 bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 flex items-center gap-1.5 rounded-xl text-xs font-bold shadow-2xs animate-pulse cursor-pointer"
                  title="Pending wallet approvals"
                >
                  <Wallet size={14} className="text-amber-600 shrink-0" />
                  <span className="hidden sm:inline">Wallet Approvals</span>
                  <span className="px-1.5 py-0.2 bg-amber-600 text-white rounded-full text-[10px] font-black">
                    {pendingWalletMap.total}
                  </span>
                </Button>
              )}
              <NotificationBell
                onSelectTask={(taskId) => {
                  handleTabChange("tasks");
                  window.dispatchEvent(new CustomEvent("open-task-modal", { detail: { taskId } }));
                }}
              />
              <Button 
                variant="outline" 
                size="icon"
                className="lg:hidden text-rose-500 hover:text-rose-600 hover:bg-rose-50 border-rose-200 rounded-xl" 
                onClick={handleLogout}
                title="Logout"
              >
                <LogOut size={16} />
              </Button>

              {(user?.role === 'admin' || hasAccess('dashboard') || hasAccess('jobs') || hasAccess('dispatch')) && (
                <Dialog 
                  open={dialogOpen} 
                  onOpenChange={(open, eventDetails) => {
                    if (!open && eventDetails?.reason === 'outside-press') {
                      return;
                    }
                    if (!open) {
                      resetDialogForm();
                    }
                    setDialogOpen(open);
                  }} 
                  disablePointerDismissal={true}

                >
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                    <Button 
                      onClick={handleCreateNewJob}
                      className="h-9 px-4 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs shadow-indigo-600/20 cursor-pointer border-none text-xs sm:text-sm"
                    >
                      <Plus size={16} />
                      <span className="hidden sm:inline">Create New Job</span>
                      <span className="sm:hidden">New Job</span>
                    </Button>
                  </motion.div>
                  <DialogContent className="w-full max-w-[98vw] 2xl:max-w-[1740px] xl:max-w-[97vw] p-0 overflow-hidden bg-slate-100/80 rounded-2xl border border-slate-200/90 shadow-2xl flex flex-col h-[95vh]">
                    {isVersionOutdated && (
                      <div className="sticky top-0 z-50 flex items-center justify-between gap-2 px-4 py-2 bg-amber-500 text-slate-950 text-xs font-bold shadow-md shrink-0">
                        <div className="flex items-center gap-2">
                          <AlertTriangle size={15} className="text-slate-950 shrink-0" />
                          <span>ระบบมีเวอร์ชันอัปเดตใหม่ กรุณาบันทึกงานให้เรียบร้อยแล้วกดรีเฟรชหน้าจอ</span>
                        </div>
                        <button 
                          type="button"
                          onClick={() => { Promise.resolve(logout()).finally(() => { window.location.replace('/login?reason=new_deploy'); }); }}
                          className="bg-slate-900 text-white px-2.5 py-1 rounded text-[11px] font-bold hover:bg-slate-800 transition shrink-0 cursor-pointer"
                        >
                          รีเฟรชหน้าจอเดี๋ยวนี้ (Refresh)
                        </button>
                      </div>
                    )}
                <DialogHeader className="px-4 py-3 border-b border-slate-200/90 bg-white shrink-0 flex flex-col lg:flex-row gap-3 items-start lg:items-center justify-between">
                  <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                    <DialogTitle className="flex items-center gap-2.5 text-base sm:text-lg font-extrabold text-slate-900 shrink-0">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200/80 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
                        <Package size={18} />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="tracking-tight">{editingJobId ? "Edit Job" : "Create New Job"}</span>
                          {editingJobId && (
                            <span className="font-mono text-xs font-extrabold text-indigo-700 bg-indigo-50/90 px-2 py-0.5 rounded-lg border border-indigo-200/80">
                              #{formatJobDisplayId(editingJobId)}
                            </span>
                          )}
                          {editingJobId && (() => {
                            const js = realtimeState.jobSaveStates?.[editingJobId];
                            if (!js) return null;
                            if (js.status === 'saving') {
                              return (
                                <Badge className="bg-sky-50 text-sky-700 border border-sky-200 py-0 px-2 h-5 text-[10px] font-bold rounded-full flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                                  Saving...
                                </Badge>
                              );
                            }
                            if (js.status === 'saved') {
                              return (
                                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 py-0 px-2 h-5 text-[10px] font-bold rounded-full">
                                  ✓ Saved
                                </Badge>
                              );
                            }
                            if (js.status === 'conflict') {
                              return (
                                <Badge className="bg-amber-100 text-amber-900 border border-amber-300 py-0 px-2 h-5 text-[10px] font-bold rounded-full">
                                  ⚠ Conflict
                                </Badge>
                              );
                            }
                            if (js.status === 'failed') {
                              return (
                                <Badge className="bg-rose-100 text-rose-800 border border-rose-300 py-0 px-2 h-5 text-[10px] font-bold rounded-full">
                                  ✕ Save Failed
                                </Badge>
                              );
                            }
                            return null;
                          })()}
                          {isNewCustomer && (
                            <Badge className="bg-sky-50 text-sky-700 border border-sky-200/60 shadow-2xs py-0 px-1.5 h-4 text-[9px] font-black uppercase tracking-wider rounded">
                              NEW
                            </Badge>
                          )}
                          {selectedVIPLabel && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 font-bold">
                              VIP {selectedVIPLabel}
                            </Badge>
                          )}
                          {activeJob?.refundId && (
                            <Badge variant="outline" className="bg-rose-100 text-rose-800 border-rose-300 font-bold text-[10px]">
                              REFUNDED
                            </Badge>
                          )}
                          {activeJob?.refundedFromId && (
                            <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300 font-bold text-[10px]">
                              CORRECTED
                            </Badge>
                          )}
                        </div>
                      </div>
                    </DialogTitle>

                    {editingJobId && hasAccess("activity-logs") && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowJobLogs(!showJobLogs)}
                        className={`h-8 px-3 text-xs flex items-center gap-1.5 font-semibold rounded-xl shadow-2xs cursor-pointer transition-all ${
                          showJobLogs
                            ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
                            : "border-slate-200/90 bg-slate-50/80 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <ClipboardList size={13} className={showJobLogs ? "text-white" : "text-slate-500"} />
                        {showJobLogs ? "Back to Edit" : "Activity Logs"}
                      </Button>
                    )}

                    {/* Screen Fit / Column View Adjuster for different laptop screen sizes */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const nextCols = modalLayoutCols === "4" ? "2" : "4";
                        setModalLayoutCols(nextCols);
                        toast.success(nextCols === "2" ? "2-Column layout active (เหมาะกับจอเล็ก)" : "4-Column layout active (แบบเต็ม 4 คอลัมน์)");
                      }}
                      className="h-8 px-2.5 text-xs flex items-center gap-1.5 font-semibold rounded-xl border-slate-200/90 bg-slate-50/80 text-slate-700 hover:bg-slate-100 shadow-2xs cursor-pointer shrink-0"
                      title={modalLayoutCols === "4" ? "Switch to 2-Column Wide View (for smaller laptop screens)" : "Switch to 4-Column Compact View"}
                    >
                      <Columns size={13} className="text-slate-500" />
                      <span className="hidden sm:inline">{modalLayoutCols === "4" ? "4 Cols" : "2 Cols"}</span>
                    </Button>

                    <div className="relative w-full sm:w-auto sm:min-w-[300px] z-50">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1 min-w-[220px]">
                          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input
                            id="customer-search"
                            placeholder="Search customer name, phone, WA ID..."
                            value={customerSearchQuery}
                            onChange={(e) => {
                              setCustomerSearchQuery(e.target.value);
                              setShowCustomerDropdown(true);
                            }}
                            onFocus={() => {
                              if (customerSearchQuery) setShowCustomerDropdown(true);
                            }}
                            onBlur={() => {
                              setTimeout(() => setShowCustomerDropdown(false), 200);
                            }}
                            className="h-8.5 pl-8.5 text-xs bg-slate-50/90 border-slate-200/90 focus:bg-white focus-visible:ring-indigo-500 rounded-xl w-full"
                          />
                        </div>
                        <Button 
                          type="button"
                          onClick={() => setCustomerDialogOpen(true)}
                          className="h-8 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/90 shadow-2xs rounded-xl flex items-center gap-1.5 font-bold shrink-0 cursor-pointer"
                        >
                          <UserPlus size={13} />
                          <span className="text-xs">Add Customer</span>
                        </Button>
                      </div>
                      
                      {showCustomerDropdown && customerSearchQuery && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto top-[100%]">
                          {filteredCustomers.length > 0 ? (
                            filteredCustomers.map(c => (
                              <div
                                key={c.id}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0"
                                onClick={() => {
                                  setServiceWeight(2);
                                  setOtherClothingName("");
                                  setOtherClothingPrice(0);
                                  setClothingItems({
                                    polo: { selected: false, quantity: 1 },
                                    tshirt: { selected: false, quantity: 1 },
                                    pants: { selected: false, quantity: 1 },
                                    dress: { selected: false, quantity: 1 },
                                    bedsheet: { selected: false, quantity: 1 },
                                    other: { selected: false, quantity: 1 },
                                  });
                                  const resolvedPhones = resolveCustomerPhones({ customer: c });
                                  setCustomerName(c.name);
                                  setCustomerPhone(resolvedPhones.primaryPhone);
                                  setSelectedProfileCustomer(c);
                                  setAppliedPromo(null);
                                  setPromoCodeInput("");
                                  setPromoError(null);
                                  
                                  const cleanCustAddr = c.defaultAddress && c.defaultAddress.trim() !== "--" && c.defaultAddress.trim() !== "-" ? c.defaultAddress : "";
                                  const validCustCoords = isRealCustomerCoords(c.defaultCoords, c.defaultAddress) ? c.defaultCoords : null;
                                  setPickupLoc(cleanCustAddr);
                                  setPickupRoom((c.roomNo || (c.secondaryAddress ? c.secondaryAddress.replace(/^Room\s*/i, '') : '') || '').trim());
                                  setPickupCoords(validCustCoords);
                                  
                                  setDeliveryLoc(cleanCustAddr);
                                  setDeliveryRoom((c.roomNo || (c.secondaryAddress ? c.secondaryAddress.replace(/^Room\s*/i, '') : '') || '').trim());
                                  setDeliveryCoords(validCustCoords);
                                  
                                  setDifferentDeliveryAddress(false);
                                  setIsDeliveryDirty(false);
                                  setIsFreeDelivery(false);
                                  updateClosestStoreAsync(c.defaultCoords, c.defaultAddress);
                                  setEditingFeeLock(null);
                                  
                                  if (c.isVIP) {
                                    setSelectedVIPLabel("VIP");
                                  } else {
                                    setSelectedVIPLabel("");
                                  }
                                  if (c.isMember) {
                                    setSelectedMemberLabel("Member");
                                    setSelectedMemberId(c.memberId || "");
                                  } else {
                                    setSelectedMemberLabel("");
                                    setSelectedMemberId("");
                                  }
                                  setCustomerPriceListId(c.priceListId || null);
                                  handleServiceOrSpeedChange(serviceType, serviceSpeed, serviceWeight, c.priceListId || null);
                                  
                                  setCustomerSearchQuery("");
                                  setShowCustomerDropdown(false);
                                  
                                  if (c.remark && c.remark.trim() !== "") {
                                    handleAddAdminLog(`CRM Remark: ${c.remark}`, true);
                                  }
                                }}
                              >
                                <div>
                                  <p className="font-semibold text-slate-800">{c.name}</p>
                                  <p className="text-xs text-slate-500 font-mono flex items-center flex-wrap gap-1">
                                    <span>
                                      {c.phone && c.phone !== "-" ? c.phone : (c.secondaryPhone || (c.whatsappId ? `WA: ${c.whatsappId}` : "-"))}
                                    </span>
                                    {c.secondaryPhone && c.phone && c.phone !== "-" && c.secondaryPhone !== c.phone && (
                                      <span className="text-[11px] text-sky-600 font-sans">({c.secondaryPhone})</span>
                                    )}
                                    {c.whatsappId && (c.phone && c.phone !== "-") && (
                                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0 rounded border border-emerald-200 font-sans">
                                        WA: {c.whatsappId}
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  {c.isNew === true && (
                                    <Badge className="bg-sky-50 text-sky-700 border border-sky-200/60 shadow-2xs py-0 px-1.5 h-4 text-[9px] font-black uppercase tracking-wider rounded">
                                      NEW
                                    </Badge>
                                  )}
                                  {c.isVIP && (
                                    <Badge variant="outline" className="text-[10px] py-0 h-4 bg-amber-50 text-amber-700 border-amber-200 font-bold">
                                      VIP
                                    </Badge>
                                  )}
                                  {(c.isMember || c.memberId) && (
                                    <div className="flex items-center gap-1">
                                      <Badge variant="outline" className="text-[10px] py-0 h-4 bg-blue-50 text-blue-700 border-blue-200 font-bold">
                                        {c.memberId ? `#${c.memberId}` : "Member"}
                                      </Badge>
                                      <Badge variant="outline" className={`text-[10px] py-0 px-1.5 h-4 font-bold flex items-center gap-0.5 ${(c.creditBalance || 0) < 0 ? "bg-rose-50 text-rose-700 border-rose-300" : "bg-emerald-50 text-emerald-700 border-emerald-300"}`}>
                                        <Wallet size={9} className={(c.creditBalance || 0) < 0 ? "text-rose-600" : "text-emerald-600"} />
                                        <span>{formatBaht(c.creditBalance || 0)}</span>
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-4 text-center text-sm text-slate-500 bg-slate-50">
                              No customers found. Fill details manually below.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="w-full lg:w-auto flex justify-end pr-8 lg:pr-10">
                    {editingJobId && (
                      <div className="flex flex-wrap gap-2 sm:gap-3 items-center justify-end">
                        <div className="flex items-center gap-1.5">
                          <span className="hidden sm:inline text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type:</span>
                          <div className="flex bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80 gap-0.5">
                            {[
                              { id: 'W', label: 'Wash' },
                              { id: 'F', label: 'Fold' },
                              { id: 'I', label: 'Iron' },
                              { id: 'H', label: 'Hanger' },
                              { id: 'D', label: 'Dryclean' },
                              { id: 'L', label: 'Linen' },
                              { id: 'P', label: 'PCS' },
                            ].map(t => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setLaundryTypes(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}
                                className={`flex flex-col items-center justify-center rounded-lg transition-all w-[26px] h-[26px] sm:w-9 sm:h-9 cursor-pointer ${
                                  laundryTypes.includes(t.id)
                                    ? 'bg-slate-900 shadow-2xs'
                                    : 'hover:bg-white text-slate-500 hover:text-slate-800'
                                }`}
                                title={t.label}
                              >
                                <span className={`text-[11px] sm:text-xs font-black leading-none flex items-center justify-center ${laundryTypes.includes(t.id) ? 'text-white' : 'text-slate-700'}`}>
                                  {t.id}
                                </span>
                                <span className={`hidden sm:inline text-[8.5px] font-bold leading-none mt-0.5 ${laundryTypes.includes(t.id) ? 'text-slate-200' : 'text-slate-500'}`}>
                                  {t.label === 'Dryclean' ? 'Dry' : t.label}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="hidden sm:inline text-[10px] font-bold text-slate-400 uppercase tracking-wider">Process:</span>
                          <div className="flex bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80 gap-0.5">

                            {/* Billing Issued — auto-indicator */}
                          {(() => {
                            const hasAnyBillIssued = Boolean(
                              billImageUrls.length > 0 ||
                              (billNo && billNo.trim() !== "") ||
                              (proformaReceiptNumber && proformaReceiptNumber !== "DRAFT") ||
                              dialogCart.length > 0
                            );
                            const currentJobObj = editingJobId ? jobs.find(j => j.id === editingJobId) : null;
                            let isCurrentBillSent = false;
                            if (currentJobObj?.adminNotesJson) {
                              try {
                                const p = JSON.parse(currentJobObj.adminNotesJson);
                                if (p && typeof p === "object" && !Array.isArray(p)) {
                                  isCurrentBillSent = Boolean(p.isBillSent);
                                }
                              } catch { /* ignore */ }
                            }
                            return (
                              <>
                                <div
                                  className={`flex flex-col items-center justify-center rounded-lg transition-all w-[26px] h-[26px] sm:w-9 sm:h-9 cursor-default ${
                                    hasAnyBillIssued
                                      ? 'bg-violet-600 shadow-2xs text-white'
                                      : 'text-slate-400'
                                  }`}
                                  title={hasAnyBillIssued ? 'Bill issued' : 'No bill issued yet'}
                                >
                                  <div className="flex items-center justify-center">
                                    <Receipt className="w-3.5 h-3.5" strokeWidth={2} />
                                  </div>
                                  <span className={`hidden sm:inline text-[8.5px] font-bold leading-none mt-0.5 ${hasAnyBillIssued ? 'text-white' : 'text-slate-400'}`}>Bill</span>
                                </div>

                                {editingJobId && currentJobObj && (
                                  <button
                                    type="button"
                                    disabled={!isCsoOrAdmin}
                                    onClick={async () => {
                                      if (!isCsoOrAdmin) {
                                        toast.error("Only CSO and Admin positions can update Bill Sent status");
                                        return;
                                      }
                                      const nextSent = !isCurrentBillSent;
                                      const staffName = (user as any)?.name || user?.email || "Staff";
                                      let baseObj: Record<string, any> = {};
                                      let notesArr: any[] = [];
                                      let paymentsArr: any[] = [];
                                      if (currentJobObj.adminNotesJson) {
                                        try {
                                          const parsed = JSON.parse(currentJobObj.adminNotesJson);
                                          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                                            baseObj = { ...parsed };
                                            notesArr = Array.isArray(parsed.notes) ? [...parsed.notes] : [];
                                            paymentsArr = Array.isArray(parsed.payments) ? [...parsed.payments] : [];
                                          } else if (Array.isArray(parsed)) {
                                            notesArr = [...parsed];
                                          }
                                        } catch { /* ignore */ }
                                      }
                                      notesArr.push({
                                        id: Math.random().toString(36).substring(2, 9),
                                        userId: user?.id || "unknown",
                                        userName: staffName,
                                        text: nextSent ? `Bill sent to customer by ${staffName}` : `Bill sent status unmarked by ${staffName}`,
                                        imageUrls: [],
                                        timestamp: new Date().toISOString(),
                                      });
                                      const updatedObj: Record<string, any> = {
                                        ...baseObj,
                                        isBillSent: nextSent,
                                        billSentAt: nextSent ? new Date().toISOString() : null,
                                        billSentBy: nextSent ? staffName : null,
                                        notes: notesArr,
                                      };
                                      if (paymentsArr.length > 0 || Array.isArray(baseObj.payments)) {
                                        updatedObj.payments = paymentsArr;
                                      }
                                      const updatedJson = JSON.stringify(updatedObj);
                                      const actorDetails = user ? { actorId: user.id, actorName: staffName, actorRole: user.role } : undefined;
                                      await jobStore.updateJobDetails(editingJobId, { adminNotesJson: updatedJson }, actorDetails);
                                      if (originalJobRef.current) {
                                        (originalJobRef.current as any).adminNotesJson = updatedJson;
                                      }
                                      toast.success(nextSent ? "Marked as Bill Sent to Customer ✓" : "Marked as Bill Not Sent");
                                    }}
                                    className={`flex flex-col items-center justify-center rounded-lg transition-all w-[26px] h-[26px] sm:w-9 sm:h-9 ${
                                      !isCsoOrAdmin
                                        ? 'opacity-60 cursor-not-allowed text-slate-400'
                                        : isCurrentBillSent
                                          ? 'bg-emerald-600 shadow-2xs text-white cursor-pointer'
                                          : 'hover:bg-white text-amber-600 hover:text-amber-700 cursor-pointer'
                                    }`}
                                    title={
                                      !isCsoOrAdmin
                                        ? `Customer Bill Status: ${isCurrentBillSent ? 'Bill Sent' : 'Not Sent'} (Only CSO and Admin can change)`
                                        : isCurrentBillSent ? 'Bill sent to customer (Click to unmark)' : 'Bill not sent yet (Click to mark as Sent to Customer)'
                                    }
                                  >
                                    <div className="flex items-center justify-center">
                                      <CheckCircle2 className={`w-3.5 h-3.5 ${isCurrentBillSent ? 'text-white' : ''}`} strokeWidth={2} />
                                    </div>
                                    <span className={`hidden sm:inline text-[8.5px] font-bold leading-none mt-0.5 ${isCurrentBillSent ? 'text-white' : 'text-amber-600'}`}>Sent</span>
                                  </button>
                                )}
                              </>
                            );
                          })()}

                          {/* Wash */}
                          <button
                            type="button"
                            onClick={() => {
                              const currentJobObj = editingJobId ? jobs.find(j => j.id === editingJobId) : null;
                              const isCurrentlyInBilling = currentJobObj && currentJobObj.status === "billing" && (!currentJobObj.subStatus || currentJobObj.subStatus === "billing");
                              if (false && isCurrentlyInBilling && editingSubStatus !== 'wash') {
                                if (!canAdvanceBilling) {
                                  toast.error("Orders in Billing stage can only be moved to the next stage by CSO, Admin, or Branch Managers");
                                  return;
                                }
                                if (!isCurrentJobBillSent) {
                                  toast.error("Cannot move to next stage: Bill must be marked as Sent to Customer first (Bill Sent ✓)");
                                  return;
                                }
                              }
                              setEditingSubStatus(editingSubStatus === 'wash' ? null : 'wash');
                            }}
                            className={`flex flex-col items-center justify-center rounded-lg transition-all w-[26px] h-[26px] sm:w-9 sm:h-9 cursor-pointer ${
                              editingSubStatus === 'wash'
                                ? 'bg-blue-600 shadow-2xs text-white'
                                : 'hover:bg-white text-slate-500 hover:text-slate-800'
                            }`}
                            title="Washing"
                          >
                            <div className="flex items-center justify-center">
                              <Droplets className={`w-3.5 h-3.5 ${editingSubStatus === 'wash' ? 'text-white' : ''}`} strokeWidth={2} />
                            </div>
                            <span className={`hidden sm:inline text-[8.5px] font-bold leading-none mt-0.5 ${editingSubStatus === 'wash' ? 'text-white' : 'text-slate-500'}`}>Wash</span>
                          </button>

                          {/* Dry */}
                          <button
                            type="button"
                            onClick={() => {
                              const currentJobObj = editingJobId ? jobs.find(j => j.id === editingJobId) : null;
                              const isCurrentlyInBilling = currentJobObj && currentJobObj.status === "billing" && (!currentJobObj.subStatus || currentJobObj.subStatus === "billing");
                              if (false && isCurrentlyInBilling && editingSubStatus !== 'dry') {
                                if (!canAdvanceBilling) {
                                  toast.error("Orders in Billing stage can only be moved to the next stage by CSO, Admin, or Branch Managers");
                                  return;
                                }
                                if (!isCurrentJobBillSent) {
                                  toast.error("Cannot move to next stage: Bill must be marked as Sent to Customer first (Bill Sent ✓)");
                                  return;
                                }
                              }
                              setEditingSubStatus(editingSubStatus === 'dry' ? null : 'dry');
                            }}
                            className={`flex flex-col items-center justify-center rounded-lg transition-all w-[26px] h-[26px] sm:w-9 sm:h-9 cursor-pointer ${
                              editingSubStatus === 'dry'
                                ? 'bg-orange-600 shadow-2xs text-white'
                                : 'hover:bg-white text-slate-500 hover:text-slate-800'
                            }`}
                            title="Drying"
                          >
                            <div className="flex items-center justify-center">
                              <Wind className={`w-3.5 h-3.5 ${editingSubStatus === 'dry' ? 'text-white' : ''}`} strokeWidth={2} />
                            </div>
                            <span className={`hidden sm:inline text-[8.5px] font-bold leading-none mt-0.5 ${editingSubStatus === 'dry' ? 'text-white' : 'text-slate-500'}`}>Dry</span>
                          </button>

                          {/* Iron */}
                          <button
                            type="button"
                            onClick={() => {
                              const currentJobObj = editingJobId ? jobs.find(j => j.id === editingJobId) : null;
                              const isCurrentlyInBilling = currentJobObj && currentJobObj.status === "billing" && (!currentJobObj.subStatus || currentJobObj.subStatus === "billing");
                              if (false && isCurrentlyInBilling && editingSubStatus !== 'iron') {
                                if (!canAdvanceBilling) {
                                  toast.error("Orders in Billing stage can only be moved to the next stage by CSO, Admin, or Branch Managers");
                                  return;
                                }
                                if (!isCurrentJobBillSent) {
                                  toast.error("Cannot move to next stage: Bill must be marked as Sent to Customer first (Bill Sent ✓)");
                                  return;
                                }
                              }
                              setEditingSubStatus(editingSubStatus === 'iron' ? null : 'iron');
                            }}
                            className={`flex flex-col items-center justify-center rounded-lg transition-all w-[26px] h-[26px] sm:w-9 sm:h-9 cursor-pointer ${
                              editingSubStatus === 'iron'
                                ? 'bg-indigo-700 shadow-2xs text-white'
                                : 'hover:bg-white text-slate-500 hover:text-slate-800'
                            }`}
                            title="Ironing"
                          >
                            <div className="flex items-center justify-center">
                              <Shirt className={`w-3.5 h-3.5 ${editingSubStatus === 'iron' ? 'text-white' : ''}`} strokeWidth={2} />
                            </div>
                            <span className={`hidden sm:inline text-[8.5px] font-bold leading-none mt-0.5 ${editingSubStatus === 'iron' ? 'text-white' : 'text-slate-500'}`}>Iron</span>
                          </button>

                          {/* Ready */}
                          <button
                            type="button"
                            onClick={() => {
                              const currentJobObj = editingJobId ? jobs.find(j => j.id === editingJobId) : null;
                              const isCurrentlyInBilling = currentJobObj && currentJobObj.status === "billing" && (!currentJobObj.subStatus || currentJobObj.subStatus === "billing");
                              if (false && isCurrentlyInBilling && editingSubStatus !== 'ready') {
                                if (!canAdvanceBilling) {
                                  toast.error("Orders in Billing stage can only be moved to the next stage by CSO, Admin, or Branch Managers");
                                  return;
                                }
                                if (!isCurrentJobBillSent) {
                                  toast.error("Cannot move to next stage: Bill must be marked as Sent to Customer first (Bill Sent ✓)");
                                  return;
                                }
                              }
                              setEditingSubStatus(editingSubStatus === 'ready' ? null : 'ready');
                            }}
                            className={`flex flex-col items-center justify-center rounded-lg transition-all w-[26px] h-[26px] sm:w-9 sm:h-9 cursor-pointer ${
                              editingSubStatus === 'ready'
                                ? 'bg-emerald-600 shadow-2xs text-white'
                                : 'hover:bg-white text-slate-500 hover:text-slate-800'
                            }`}
                            title="Ready"
                          >
                            <div className="flex items-center justify-center">
                              <CheckCircle2 className={`w-3.5 h-3.5 ${editingSubStatus === 'ready' ? 'text-white' : ''}`} strokeWidth={2} />
                            </div>
                            <span className={`hidden sm:inline text-[8.5px] font-bold leading-none mt-0.5 ${editingSubStatus === 'ready' ? 'text-white' : 'text-slate-500'}`}>Ready</span>
                          </button>

                        </div>
                      </div>
                      </div>
                    )}
                  </div>
                </DialogHeader>

                {/* Live External Update & Conflict Resolution Banner */}
                {editingJobId && (() => {
                  const extUpdate = realtimeState.externalJobUpdates?.[editingJobId];
                  const saveState = realtimeState.jobSaveStates?.[editingJobId];
                  const hasConflict = liveConflictFields.length > 0 || saveState?.status === 'conflict';
                  const hasSaveFailure = saveState?.status === 'failed';

                  if (!extUpdate && !hasConflict && !hasSaveFailure) return null;

                  if (hasConflict || hasSaveFailure) {
                    return (
                      <div className="mx-3 mt-2 px-4 py-2.5 bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs rounded-xl shrink-0">
                        <div className="flex items-start sm:items-center gap-2 text-xs min-w-0">
                          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                          <div className="min-w-0">
                            <p className="font-bold">
                              {hasConflict
                                ? `ตรวจพบการแก้ไขพร้อมกันจาก ${extUpdate?.actorName || "พนักงานท่านอื่น"}`
                                : `บันทึกไม่สำเร็จ: ${saveState?.message || "กรุณาลองใหม่อีกครั้ง"}`}
                            </p>
                            {liveConflictFields.length > 0 && (
                              <p className="text-[11px] text-amber-800">
                                ข้อมูลที่คุณกำลังพิมพ์ชนกับการอัปเดตล่าสุด ({liveConflictFields.join(", ")}) — ระบบเก็บข้อความที่คุณพิมพ์ไว้ให้แล้ว
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 bg-white hover:bg-amber-100 text-amber-900 border-amber-300 font-bold text-[11px] cursor-pointer rounded-lg"
                            onClick={async () => {
                              const freshJob = await api.fetchAndApplyJob(editingJobId);
                              const target = freshJob || jobs.find(j => j.id === editingJobId);
                              if (target) {
                                handleEditFullJob(target);
                              }
                              setLiveConflictFields([]);
                              setSaveError(null);
                              realtimeStore.clearExternalJobUpdate(editingJobId);
                              realtimeStore.clearJobSaveState(editingJobId);
                            }}
                          >
                            โหลดข้อมูลล่าสุด (Reload Server Data)
                          </Button>
                          {hasConflict && (
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] cursor-pointer rounded-lg"
                              onClick={() => {
                                const latestServerJob = jobs.find(j => j.id === editingJobId);
                                if (latestServerJob && originalJobRef.current) {
                                  (originalJobRef.current as any).updatedAt = latestServerJob.updatedAt;
                                }
                                setLiveConflictFields([]);
                                setSaveError(null);
                                realtimeStore.clearExternalJobUpdate(editingJobId);
                                realtimeStore.clearJobSaveState(editingJobId);
                                toast.info("ปลดล็อกแล้ว สามารถกด Save เพื่อบันทึกข้อมูลชุดของคุณทับได้ทันที");
                              }}
                            >
                              เก็บข้อมูลที่ฉันพิมพ์ต่อ (Keep My Edits)
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="mx-3 mt-2 px-3.5 py-2 bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 rounded-xl shrink-0 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                        <span className="truncate font-medium">
                          ซิงก์ข้อมูลล่าสุดอัตโนมัติจาก <strong>{extUpdate?.actorName || "ระบบ"}</strong> แล้ว (โดยไม่กระทบช่องที่คุณกำลังแก้ไข)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => realtimeStore.clearExternalJobUpdate(editingJobId)}
                        className="text-emerald-700 hover:text-emerald-950 text-[11px] font-bold shrink-0 cursor-pointer px-1.5 py-0.5 rounded hover:bg-emerald-100"
                      >
                        รับทราบ
                      </button>
                    </div>
                  );
                })()}

                {/* Wallet Approval Review Banner */}
                {reviewingWalletTx && (
                  <div className="mx-3 mt-2 px-4 py-2.5 bg-amber-500 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md rounded-xl shrink-0">
                    <div className="flex items-center gap-2 text-xs font-bold min-w-0">
                      <ShieldCheck size={18} className="text-white shrink-0" />
                      <span className="truncate">
                        รออนุมัติ Wallet: {reviewingWalletTx.type === "DEDUCT" ? "ตัดเงินค่าออเดอร์" : (reviewingWalletTx.type === "REFUND" ? "คืนเงินออเดอร์" : reviewingWalletTx.type)} 
                        {" "}฿{reviewingWalletTx.amount.toLocaleString()} 
                        {reviewingWalletTx.createdByName && ` (โดย: ${reviewingWalletTx.createdByName})`}
                      </span>
                    </div>
                    {reviewingWalletTx.approvalStatus === "PENDING" && (
                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-xs rounded-lg gap-1"
                          onClick={handleApproveFromJobDialog}
                          disabled={isWalletActionProcessing}
                        >
                          <CheckCircle2 size={13} />
                          <span>Approve (อนุมัติ)</span>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 bg-rose-600 hover:bg-rose-700 text-white border-none font-bold text-xs cursor-pointer shadow-xs rounded-lg gap-1"
                          onClick={() => {
                            setWalletRejectReason("");
                            setWalletRejectModalOpen(true);
                          }}
                          disabled={isWalletActionProcessing}
                        >
                          <X size={13} />
                          <span>Reject (ปฏิเสธ)</span>
                        </Button>
                      </div>
                    )}
                    {reviewingWalletTx.approvalStatus !== "PENDING" && (
                      <Badge className={`text-xs font-bold shrink-0 ${reviewingWalletTx.approvalStatus === "APPROVED" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                        {reviewingWalletTx.approvalStatus}
                      </Badge>
                    )}
                  </div>
                )}

                {/* Main Content Grid */}
                <div className="flex-1 overflow-y-auto lg:overflow-hidden p-3.5 min-h-0 flex flex-col">
                  {!showJobLogs ? (
                    <div className={`grid grid-cols-1 ${modalLayoutCols === "2" ? "lg:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4"} gap-3.5 h-auto ${modalLayoutCols === "2" ? "overflow-y-auto" : "xl:h-full overflow-y-auto xl:overflow-hidden"}`}>
                    
                    {/* COL 1: Customer Profile, Origin Branch & Scheduling */}
                    <motion.div
                      className="col-span-1 flex flex-col gap-2.5 overflow-y-auto pr-0.5 pb-2 min-w-0 h-full"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1, duration: 0.3 }}
                    >
                      {/* Customer Info & Logistics Card */}
                      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-3 shrink-0">
                        {/* Customer Name & Phone Section */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pb-2.5 border-b border-slate-100">
                          {/* Col 1: Customer Name & Badges (7 cols) */}
                          <div className="space-y-1.5 sm:col-span-7 min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0 flex-wrap min-h-[18px]">
                              <Label htmlFor="custName" className="flex items-center gap-1 text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
                                <User size={12} className="text-indigo-500 shrink-0" />
                                <span>Customer <span className="text-red-500">*</span></span>
                              </Label>

                              <div className="flex items-center gap-1 shrink-0 flex-wrap">
                                {isNewCustomer && (
                                  <Badge className="bg-sky-50 text-sky-700 border border-sky-200/60 shadow-2xs py-0 px-1.5 h-4 text-[9px] font-black uppercase tracking-wider rounded shrink-0">
                                    NEW
                                  </Badge>
                                )}
                                {selectedVIPLabel && (
                                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 bg-amber-50 text-amber-700 border-amber-200 font-bold shrink-0">
                                    VIP
                                  </Badge>
                                )}
                                {selectedMemberLabel && (
                                  <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 bg-blue-50 text-blue-700 border-blue-200 font-bold shrink-0 select-text cursor-text" style={{ userSelect: 'text' }}>
                                    {selectedMemberId ? `ID: ${selectedMemberId}` : 'Member'}
                                  </Badge>
                                )}
                                {selectedProfileCustomer?.isMember && (
                                  <Badge variant="outline" className={`text-[9px] py-0 px-1.5 h-4 font-bold shrink-0 flex items-center gap-0.5 shadow-2xs ${(selectedProfileCustomer.creditBalance || 0) < 0 ? "bg-rose-50 text-rose-700 border-rose-300" : "bg-emerald-50 text-emerald-700 border-emerald-300"}`} title="ยอดเงินคงเหลือใน Wallet">
                                    <Wallet size={9} className={(selectedProfileCustomer.creditBalance || 0) < 0 ? "text-rose-600" : "text-emerald-600"} />
                                    <span>{formatBaht(selectedProfileCustomer.creditBalance || 0)}</span>
                                  </Badge>
                                )}
                                {dialogAvailableCoupons.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setCustomerVouchersModalOpen(true);
                                    }}
                                    className="h-4 px-1.5 py-0 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 font-bold text-[9px] flex items-center gap-1 shadow-2xs cursor-pointer transition-colors shrink-0"
                                    title="คลิกเพื่อดูและเลือก Voucher ทั้งหมดของลูกค้า"
                                  >
                                    <Ticket size={9} className="text-amber-600" />
                                    <span>Voucher ({dialogAvailableCoupons.length})</span>
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="relative flex items-center">
                              <Input
                                id="custName"
                                placeholder="Customer Name"
                                value={customerName}
                                readOnly={true}
                                className={`h-9 text-xs font-semibold bg-slate-50/90 border-slate-200/90 rounded-xl cursor-text text-slate-800 select-all ${selectedProfileCustomer ? 'pr-9' : ''}`}
                              />
                              {selectedProfileCustomer && (
                                <button
                                  type="button"
                                  className="absolute right-1.5 h-6.5 w-6.5 flex items-center justify-center bg-white hover:bg-indigo-50 text-indigo-600 rounded-lg border border-slate-200 hover:border-indigo-200 transition-colors shadow-2xs cursor-pointer"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setCustomerDialogOpen(true);
                                  }}
                                  title="Edit Customer CRM"
                                >
                                  <Edit size={12} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Col 2: Customer Phone (5 cols) */}
                          <div className="space-y-1.5 sm:col-span-5 min-w-0">
                            <div className="flex items-center justify-between text-xs min-h-[18px]">
                              <Label htmlFor="custPhone" className="flex items-center gap-1 text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
                                <Phone size={12} className="text-slate-400 shrink-0" />
                                <span>Phone</span>
                              </Label>
                              {phoneResolution.isIntlPrimary ? (
                                <Badge variant="outline" className="text-[9px] py-0 px-1.5 h-4 bg-sky-50 text-sky-700 border-sky-200 font-bold flex items-center gap-1 shrink-0">
                                  <Globe size={9} />
                                  <span>Intl</span>
                                </Badge>
                              ) : phoneResolution.hasThaiPhone ? (
                                <span className="text-[9px] text-slate-400 font-semibold">TH Mobile</span>
                              ) : null}
                            </div>
                            <div className="relative flex items-center">
                              <Input
                                id="custPhone"
                                placeholder="08x-xxx-xxxx or WA ID"
                                value={customerPhone}
                                onChange={(e) => setCustomerPhone(e.target.value)}
                                className="h-9 text-xs bg-white text-slate-800 font-mono font-semibold border-slate-200/90 rounded-xl"
                              />
                            </div>
                            {Boolean(phoneResolution.secondaryPhone || (selectedProfileCustomer?.secondaryPhone && selectedProfileCustomer.phone)) && (() => {
                              const p1 = phoneResolution.primaryPhone || selectedProfileCustomer?.phone || "";
                              const p2 = phoneResolution.secondaryPhone || selectedProfileCustomer?.secondaryPhone || "";
                              if (!p2 || p1 === p2) return null;
                              const isCurrentlyP2 = customerPhone === p2;
                              const targetSwapPhone = isCurrentlyP2 ? p1 : p2;
                              const isTargetIntl = !isThaiPhoneNumber(targetSwapPhone);

                              return (
                                <div className="flex items-center justify-between gap-1 text-[10px] pt-0.5 text-slate-500 overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setCustomerPhone(targetSwapPhone);
                                    }}
                                    className="flex items-center gap-1 text-slate-600 hover:text-sky-700 font-mono transition-colors text-left truncate cursor-pointer group"
                                    title={`คลิกเพื่อสลับไปใช้เบอร์ ${targetSwapPhone}`}
                                  >
                                    {isTargetIntl ? <Globe size={10} className="text-sky-600 shrink-0" /> : <span className="text-[10px]">🇹🇭</span>}
                                    <span className="truncate group-hover:underline">{targetSwapPhone}</span>
                                    <span className="text-[8px] text-slate-400 font-sans shrink-0">(สลับ)</span>
                                  </button>
                                  {phoneResolution.isSecondaryWhatsapp && (
                                    <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 shrink-0">
                                      WhatsApp
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                            {selectedProfileCustomer?.whatsappId && (
                              <div className="flex items-center justify-between gap-1 text-[10px] pt-0.5 text-emerald-700 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const waVal = selectedProfileCustomer.whatsappId!.trim().toUpperCase().startsWith("WA:")
                                      ? selectedProfileCustomer.whatsappId!.trim()
                                      : `WA: ${selectedProfileCustomer.whatsappId!.trim()}`;
                                    setCustomerPhone(waVal);
                                  }}
                                  className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-mono font-semibold transition-colors text-left truncate cursor-pointer group"
                                  title="คลิกเพื่อใช้ WhatsApp ID เป็นช่องทางติดต่อของงานนี้"
                                >
                                  <span className="text-[9px] font-bold bg-emerald-50 px-1 py-0 rounded border border-emerald-200 shrink-0">WA ID</span>
                                  <span className="truncate group-hover:underline">{selectedProfileCustomer.whatsappId}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Origin Store Branch & Service Mode (Well-proportioned so Branch dropdown never squishes) */}
                        <div className="space-y-2 pb-2.5 border-b border-slate-100 shrink-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <Label htmlFor="store-select" className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                              <Store size={13} className="text-indigo-600" />
                              <span>Origin Branch</span>
                            </Label>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              <div className="inline-flex items-center bg-slate-100/90 p-0.5 rounded-xl border border-slate-200/80 gap-0.5">
                                <Label 
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                                    isPickup ? "bg-white text-emerald-700 shadow-2xs font-bold" : "text-slate-500"
                                  } ${isLogisticsLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                  title={isLogisticsLocked ? "งานนี้ชำระเงินแล้ว ไม่สามารถเปลี่ยนประเภทบริการรับ-ส่งได้ (กรุณากด Unlock Paid หากต้องการแก้ไข)" : undefined}
                                >
                                  <input 
                                    type="checkbox" 
                                    checked={isPickup}
                                    disabled={isLogisticsLocked}
                                    onChange={(e) => {
                                      if (isLogisticsLocked) return;
                                      setIsPickup(e.target.checked);
                                      if (e.target.checked) setIsWalkIn(false);
                                      setEditingFeeLock(null);
                                    }}
                                    className="rounded text-emerald-600 w-3 h-3 border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                  <span>Pickup</span>
                                </Label>

                                <Label 
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                                    isDelivery ? "bg-white text-indigo-700 shadow-2xs font-bold" : "text-slate-500"
                                  } ${isLogisticsLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                  title={isLogisticsLocked ? "งานนี้ชำระเงินแล้ว ไม่สามารถเปลี่ยนประเภทบริการรับ-ส่งได้ (กรุณากด Unlock Paid หากต้องการแก้ไข)" : undefined}
                                >
                                  <input 
                                    type="checkbox" 
                                    checked={isDelivery}
                                    disabled={isLogisticsLocked}
                                    onChange={(e) => {
                                      if (isLogisticsLocked) return;
                                      setIsDelivery(e.target.checked);
                                      if (e.target.checked && isPickup) setIsWalkIn(false);
                                      setEditingFeeLock(null);
                                    }}
                                    className="rounded text-indigo-600 w-3 h-3 border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                  <span>Delivery</span>
                                </Label>

                                <Label 
                                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                                    isWalkIn ? "bg-amber-50 text-amber-800 shadow-2xs font-bold" : "text-slate-500"
                                  } ${isLogisticsLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                  title={isLogisticsLocked ? "งานนี้ชำระเงินแล้ว ไม่สามารถเปลี่ยนประเภทบริการรับ-ส่งได้ (กรุณากด Unlock Paid หากต้องการแก้ไข)" : undefined}
                                >
                                  <input 
                                    type="checkbox" 
                                    checked={isWalkIn}
                                    disabled={isLogisticsLocked}
                                    onChange={(e) => {
                                      if (isLogisticsLocked) return;
                                      setIsWalkIn(e.target.checked);
                                      if (e.target.checked) {
                                        setIsPickup(false);
                                      }
                                      setEditingFeeLock(null);
                                    }}
                                    className="rounded text-amber-500 w-3 h-3 border-slate-300 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                  <span>Walk-In</span>
                                </Label>
                              </div>

                              {isLogisticsLocked && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg shadow-2xs" title="งานนี้ชำระเงินแล้ว ค่าบริการและการรับ-ส่งถูกล็อค">
                                  <LockIcon size={10} className="text-amber-600" />
                                  <span>Locked</span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <span className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block">
                                {currentLanguage === "en" ? "Nearest Branch (Fee Calc)" : "สาขาใกล้สุด (คิดค่าส่ง)"}
                              </span>
                              <select 
                                id="store-select"
                                disabled={isPaidJob}
                                className="flex h-9 w-full rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                value={selectedStoreIndex}
                                onChange={(e) => {
                                  if (isPaidJob) return;
                                  const nextIdx = Number(e.target.value);
                                  const prevOriginId = shopLocations[selectedStoreIndex]?.id || "";
                                  setSelectedStoreIndex(nextIdx);
                                  setEditingFeeLock(null);
                                  if (processingBranchId && processingBranchId === prevOriginId) {
                                    setProcessingBranchId("");
                                  }
                                }}
                              >
                                {shopLocations.map((shop, idx) => {
                                  const shortName = shop.name.match(/\(([^)]+)\)/)?.[1]?.trim() || shop.name.replace(/^That Laundry Shop\s*\(?/i, "").replace(/\)$/, "").trim();
                                  return (
                                    <option key={shop.id} value={idx}>{shortName}</option>
                                  );
                                })}
                              </select>
                            </div>

                            <div className="space-y-1">
                              {(() => {
                                const originId = shopLocations[selectedStoreIndex]?.id || "";
                                const effectiveProcId = processingBranchId || originId;
                                const isDifferentProc = Boolean(processingBranchId && processingBranchId !== originId);
                                return (
                                  <>
                                    <span className={`text-[9.5px] font-bold uppercase tracking-wider block ${isDifferentProc ? "text-indigo-700" : "text-slate-500"}`}>
                                      {currentLanguage === "en" ? "Processing Branch (Wash)" : "สาขาที่รับผ้า/ซัก"}
                                    </span>
                                    <select
                                      id="processing-store-select"
                                      className={`flex h-9 w-full rounded-xl border px-2.5 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 transition-colors ${
                                        isDifferentProc
                                          ? "bg-indigo-50/80 border-indigo-400 text-indigo-900 font-bold"
                                          : "bg-slate-50/70 hover:bg-white border-slate-200/90 text-slate-800"
                                      }`}
                                      value={effectiveProcId}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        const nextVal = val === originId ? "" : val;
                                        setProcessingBranchId(nextVal);
                                        persistProcessingBranchToDb(nextVal);
                                      }}
                                    >
                                      {shopLocations.map((shop) => {
                                        const shortName = shop.name.match(/\(([^)]+)\)/)?.[1]?.trim() || shop.name.replace(/^That Laundry Shop\s*\(?/i, "").replace(/\)$/, "").trim();
                                        return (
                                          <option key={shop.id} value={shop.id}>
                                            {shortName}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>

                        {/* Pickup & Delivery Address Section */}
                        <div className="flex flex-col gap-2.5 shrink-0">
                          {/* Pickup Address Field */}
                          {isPickup && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <Label htmlFor="pickup-location" className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                  <span title="เปิดตำแหน่งใน Google Maps">
                                    <MapPin 
                                      size={13} 
                                      className="text-emerald-600 cursor-pointer hover:text-emerald-800 transition-colors" 
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (pickupLoc) {
                                          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickupLoc)}`, '_blank');
                                        } else if (pickupCoords && (pickupCoords.lat !== 0 || pickupCoords.lng !== 0)) {
                                          window.open(`https://www.google.com/maps/search/?api=1&query=${pickupCoords.lat},${pickupCoords.lng}`, '_blank');
                                        }
                                      }}
                                    />
                                  </span>
                                  <span>Pickup Address <span className="text-red-500">*</span></span>
                                </Label>

                                {!isDelivery && (
                                  <button
                                    type="button"
                                    disabled={isLogisticsLocked}
                                    onClick={() => {
                                      setIsDelivery(true);
                                      setDifferentDeliveryAddress(true);
                                      setIsDeliveryDirty(true);
                                      setEditingFeeLock(null);
                                      setTimeout(() => {
                                        const el = document.getElementById("delivery-location") as HTMLInputElement | null;
                                        if (el) el.focus();
                                      }, 50);
                                    }}
                                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-lg cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                                  >
                                    + Add Delivery Address
                                  </button>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <LocationInput
                                    id="pickup-location"
                                    placeholder="Customer pickup address"
                                    value={pickupLoc}
                                    localData={localDataForSearch}
                                    onChange={(v) => {
                                      setPickupLoc(v);
                                      if (!isDeliveryDirty && !differentDeliveryAddress) {
                                        setDeliveryLoc(v);
                                      }
                                    }}
                                    onSelectLocation={(loc) => {
                                      const newCoords = { lat: loc.lat, lng: loc.lng };
                                      setPickupCoords(newCoords);
                                      updateClosestStoreAsync(newCoords, loc.name);
                                      setEditingFeeLock(null);
                                      if (!isDeliveryDirty && !differentDeliveryAddress) {
                                        setDeliveryLoc(loc.name);
                                        setDeliveryCoords(newCoords);
                                      }
                                    }}
                                  />
                                </div>
                                <div className="w-20 shrink-0">
                                  <Input
                                    placeholder="Room"
                                    value={pickupRoom}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setPickupRoom(val);
                                      if (!isDeliveryDirty && !differentDeliveryAddress) {
                                        setDeliveryRoom(val);
                                      }
                                    }}
                                    className="h-9 text-xs font-semibold px-2.5 rounded-xl border-slate-200/90"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Delivery Address Field */}
                          {isDelivery && (
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                <Label htmlFor="delivery-location" className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                  <span title="เปิดตำแหน่งใน Google Maps">
                                    <Navigation 
                                      size={13} 
                                      className="text-rose-600 cursor-pointer hover:text-rose-800 transition-colors" 
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (deliveryLoc) {
                                          window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(deliveryLoc)}`, '_blank');
                                        } else if (deliveryCoords && (deliveryCoords.lat !== 0 || deliveryCoords.lng !== 0)) {
                                          window.open(`https://www.google.com/maps/search/?api=1&query=${deliveryCoords.lat},${deliveryCoords.lng}`, '_blank');
                                        }
                                      }}
                                    />
                                  </span>
                                  <span>Delivery Address <span className="text-red-500">*</span></span>
                                </Label>

                                {isPickup ? (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <label className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-100/90 hover:bg-indigo-50/70 border border-slate-200/90 cursor-pointer select-none transition-colors">
                                      <input
                                        type="checkbox"
                                        id="toggle-different-delivery"
                                        checked={differentDeliveryAddress || isDeliveryDirty}
                                        disabled={isLogisticsLocked}
                                        onChange={(e) => {
                                          const checked = e.target.checked;
                                          setDifferentDeliveryAddress(checked);
                                          setIsDeliveryDirty(checked);
                                          if (checked) {
                                            if (deliveryLoc === pickupLoc) {
                                              setDeliveryLoc("");
                                              setDeliveryRoom("");
                                              setDeliveryCoords(null);
                                            }
                                            setTimeout(() => {
                                              const el = document.getElementById("delivery-location") as HTMLInputElement | null;
                                              if (el) el.focus();
                                            }, 50);
                                          } else {
                                            setDeliveryLoc(pickupLoc);
                                            setDeliveryCoords(pickupCoords);
                                            setDeliveryRoom(pickupRoom);
                                            setEditingFeeLock(null);
                                          }
                                        }}
                                        className="rounded text-indigo-600 w-3 h-3 border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                                      />
                                      <span className="text-[10px] font-bold text-slate-700">
                                        {currentLanguage === "en" ? "Different delivery address" : "ส่งคนละที่กับจุดรับผ้า"}
                                      </span>
                                    </label>

                                    {selectedProfileCustomer?.secondaryAddress && (
                                      <button
                                        type="button"
                                        disabled={isLogisticsLocked}
                                        onClick={() => {
                                          const sec = (selectedProfileCustomer.secondaryAddress || "").trim();
                                          setDifferentDeliveryAddress(true);
                                          setIsDeliveryDirty(true);
                                          setDeliveryLoc(sec);
                                          setEditingFeeLock(null);
                                        }}
                                        className="h-5.5 px-2 text-[9.5px] font-bold text-indigo-700 border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 rounded-lg cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                                        title={`ใช้ที่อยู่สำรอง: ${selectedProfileCustomer.secondaryAddress}`}
                                      >
                                        + 2nd Addr
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={isLogisticsLocked}
                                    onClick={() => {
                                      setIsPickup(true);
                                      setIsWalkIn(false);
                                      setDifferentDeliveryAddress(true);
                                      setIsDeliveryDirty(true);
                                      setEditingFeeLock(null);
                                    }}
                                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-lg cursor-pointer transition-colors shadow-2xs disabled:opacity-50"
                                  >
                                    + Add Pickup Location
                                  </button>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <LocationInput
                                    id="delivery-location"
                                    placeholder={isPickup && (differentDeliveryAddress || isDeliveryDirty) ? "Enter different delivery address..." : "Customer delivery address"}
                                    value={deliveryLoc}
                                    localData={localDataForSearch}
                                    onChange={(v) => {
                                      setDeliveryLoc(v);
                                      setIsDeliveryDirty(true);
                                      if (isPickup && v.trim().toLowerCase() !== pickupLoc.trim().toLowerCase()) {
                                        setDifferentDeliveryAddress(true);
                                      }
                                    }}
                                    onSelectLocation={(loc) => {
                                      const newCoords = { lat: loc.lat, lng: loc.lng };
                                      setDeliveryCoords(newCoords);
                                      setIsDeliveryDirty(true);
                                      if (isPickup && loc.name.trim().toLowerCase() !== pickupLoc.trim().toLowerCase()) {
                                        setDifferentDeliveryAddress(true);
                                      }
                                      setEditingFeeLock(null);
                                      if (!isPickup) {
                                        updateClosestStoreAsync(newCoords, loc.name);
                                      }
                                    }}
                                  />
                                </div>
                                <div className="w-20 shrink-0">
                                  <Input
                                    placeholder="Room"
                                    value={deliveryRoom}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setDeliveryRoom(val);
                                      setIsDeliveryDirty(true);
                                      if (isPickup && val.trim() !== pickupRoom.trim()) {
                                        setDifferentDeliveryAddress(true);
                                      }
                                    }}
                                    className="h-9 text-xs font-semibold px-2.5 rounded-xl border-slate-200/90"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Scheduling Block */}
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          {isPickup && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="schedule-pickup" className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                  <Clock size={13} className="text-amber-500" />
                                  <span>Pickup Time & Rider</span>
                                </Label>
                                <div className="flex items-center gap-2.5">
                                  <Label className="flex items-center gap-1 cursor-pointer w-fit">
                                    <input 
                                      type="checkbox" 
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                      checked={isPickupMeet}
                                      onChange={(e) => {
                                        setIsPickupMeet(e.target.checked);
                                        if (e.target.checked) setIsPickupLobby(false);
                                      }}
                                    />
                                    <span className="text-[11px] text-slate-600 font-semibold">Meet up</span>
                                  </Label>
                                  <Label className="flex items-center gap-1 cursor-pointer w-fit">
                                    <input 
                                      type="checkbox" 
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                      checked={isPickupLobby}
                                      onChange={(e) => {
                                        setIsPickupLobby(e.target.checked);
                                        if (e.target.checked) setIsPickupMeet(false);
                                      }}
                                    />
                                    <span className="text-[11px] text-slate-600 font-semibold">Lobby</span>
                                  </Label>
                                </div>
                              </div>
                              <div className="grid grid-cols-[1.55fr_1fr] gap-2">
                                <DateTimePicker
                                  id="schedule-pickup"
                                  value={pickupScheduledTime}
                                  onChange={setPickupScheduledTime}
                                />
                                <select
                                  className="flex h-8 w-full rounded-lg border border-slate-200/90 bg-slate-50/70 hover:bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                                  value={pickupRiderId}
                                  onChange={(e) => setPickupRiderId(e.target.value)}
                                >
                                  <option value="">-- Assign Rider --</option>
                                  {riders
                                    .filter(r => r.isActive !== false || (pickupRiderId && r.id === pickupRiderId))
                                    .map(r => (
                                      <option key={`p-${r.id}`} value={r.id}>
                                        {r.name}{r.isActive === false ? " (Resigned / ลาออกแล้ว)" : ""}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          )}

                          <div className={`space-y-1 ${isPickup ? 'pt-1.5 border-t border-slate-100' : ''}`}>
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="schedule-delivery" className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                                <CalendarClock size={13} className="text-indigo-500" />
                                <span>{isDelivery ? "Delivery Time & Rider" : "Est. Return Date"}</span>
                              </Label>
                              {isDelivery && (
                                <div className="flex items-center gap-2.5">
                                  <Label className="flex items-center gap-1 cursor-pointer w-fit">
                                    <input 
                                      type="checkbox" 
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                      checked={isDeliveryMeet}
                                      onChange={(e) => {
                                        setIsDeliveryMeet(e.target.checked);
                                        if (e.target.checked) setIsDeliveryLobby(false);
                                      }}
                                    />
                                    <span className="text-[11px] text-slate-600 font-semibold">Meet up</span>
                                  </Label>
                                  <Label className="flex items-center gap-1 cursor-pointer w-fit">
                                    <input 
                                      type="checkbox" 
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                                      checked={isDeliveryLobby}
                                      onChange={(e) => {
                                        setIsDeliveryLobby(e.target.checked);
                                        if (e.target.checked) setIsDeliveryMeet(false);
                                      }}
                                    />
                                    <span className="text-[11px] text-slate-600 font-semibold">Lobby</span>
                                  </Label>
                                </div>
                              )}
                            </div>
                            <div className={isDelivery ? "grid grid-cols-[1.55fr_1fr] gap-2" : "flex flex-col gap-1"}>
                              <DateTimePicker
                                id="schedule-delivery"
                                value={deliveryScheduledTime}
                                onChange={setDeliveryScheduledTime}
                              />
                              {isDelivery && (
                                <select
                                  className="flex h-8 w-full rounded-lg border border-slate-200/90 bg-slate-50/70 hover:bg-white px-2 py-1 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                                  value={deliveryRiderId}
                                  onChange={(e) => setDeliveryRiderId(e.target.value)}
                                >
                                  <option value="">-- Assign Rider --</option>
                                  {riders
                                    .filter(r => r.isActive !== false || (deliveryRiderId && r.id === deliveryRiderId))
                                    .map(r => (
                                      <option key={`d-${r.id}`} value={r.id}>
                                        {r.name}{r.isActive === false ? " (Resigned / ลาออกแล้ว)" : ""}
                                      </option>
                                    ))}
                                </select>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Customer Past Orders Card (Bottom Left - Listed Downwards by Order Bills, Fills Bottom Space) */}
                      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-2 flex-1 min-h-[220px]">
                        {isLoadingCustomerJobs ? (
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-center gap-2 text-slate-500 text-xs flex-1">
                            <Loader2 size={13} className="animate-spin text-amber-500" />
                            <span className="text-[10.5px] font-medium">Loading customer past transactions...</span>
                          </div>
                        ) : customerPastJobs.length > 0 ? (
                          <div className="flex-1 flex flex-col gap-2 min-h-0">
                            {/* Past Orders Header */}
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 shrink-0">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <History size={13} className="text-amber-500 shrink-0" />
                                <Label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider truncate">
                                  {currentLanguage === "en" ? "Customer Past Orders" : "ประวัติการสั่งของลูกค้า"}
                                </Label>
                                <span className="text-[9.5px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.2 rounded-full shrink-0">
                                  {customerPastJobs.length} {currentLanguage === "en" ? (customerPastJobs.length > 1 ? "orders" : "order") : "บิล"}
                                </span>
                              </div>

                              {customerPastJobs.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const anyCollapsed = customerPastJobs.some(j => expandedPastJobIds[j.id] === false);
                                    const nextState: Record<string, boolean> = {};
                                    customerPastJobs.forEach(j => { nextState[j.id] = anyCollapsed; });
                                    setExpandedPastJobIds(nextState);
                                  }}
                                  className="text-[9.5px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
                                >
                                  {customerPastJobs.some(j => expandedPastJobIds[j.id] === false)
                                    ? (currentLanguage === "en" ? "Expand All" : "ขยายทั้งหมด")
                                    : (currentLanguage === "en" ? "Collapse All" : "ย่อทั้งหมด")}
                                </button>
                              )}
                            </div>

                            {/* Downwards List of Order Bills - Fills available bottom height */}
                            <div className="space-y-2 flex-1 overflow-y-auto pr-0.5 show-scrollbar min-h-0">
                              {customerPastJobs.map((pj: any, pjIdx: number) => {
                                const isExpanded = expandedPastJobIds[pj.id] !== false;
                                const pjItems = Array.isArray(pj.items) && pj.items.length > 0
                                  ? pj.items
                                  : (pj.itemsJson ? (() => { try { return JSON.parse(pj.itemsJson); } catch { return []; } })() : []);
                                const isLatest = pjIdx === 0;

                                return (
                                  <div
                                    key={pj.id || pjIdx}
                                    className={`rounded-xl border transition-all ${
                                      isLatest
                                        ? "bg-slate-50/90 border-slate-200/90 shadow-2xs"
                                        : "bg-white/90 border-slate-200/70 hover:border-slate-300"
                                    } p-2.5 space-y-1.5`}
                                  >
                                    {/* Bill Header (Click to expand/collapse) */}
                                    <div
                                      onClick={() => {
                                        setExpandedPastJobIds(prev => ({
                                          ...prev,
                                          [pj.id]: prev[pj.id] === false ? true : false,
                                        }));
                                      }}
                                      className="flex items-center justify-between cursor-pointer select-none gap-2 pb-1 border-b border-slate-200/60"
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-1.5 py-0.2 rounded-md shadow-2xs shrink-0">
                                          #{formatJobDisplayId(pj.id)}
                                        </span>
                                        {isLatest && (
                                          <span className="text-[8.5px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded shrink-0">
                                            Latest
                                          </span>
                                        )}
                                        <span className="text-[10px] text-slate-500 truncate">
                                          {pj.createdAt ? format(new Date(pj.createdAt), "dd MMM yyyy, HH:mm") : "-"}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="font-mono font-black text-amber-600 text-xs">
                                          ฿{(pj.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: (pj.totalAmount || 0) % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-slate-400">
                                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Bill Metadata: Fulfillment, Speed, Channel */}
                                    <div className="flex items-center justify-between text-[9.5px] text-slate-500 px-0.5">
                                      <span className="flex items-center gap-1 truncate font-medium">
                                        <Truck size={10} className="text-sky-500 shrink-0" />
                                        <span className="truncate">
                                          {pj.pickupLocation && pj.dropoffLocation
                                            ? (pj.pickupLocation === pj.dropoffLocation ? "Walk-In" : "Pickup & Delivery")
                                            : (pj.deliveryAddress ? "Delivery" : "Standard Order")}
                                        </span>
                                        {pj.billNo && (
                                          <span className="text-slate-400 font-mono">({pj.billNo})</span>
                                        )}
                                      </span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="font-medium text-slate-500">
                                          {pj.paymentChannel || (pj.isPaid ? "Paid" : "Unpaid")}
                                        </span>
                                        {pj.serviceSpeed && pj.serviceSpeed !== "standard" && (
                                          <span className="font-bold text-indigo-600">
                                            {pj.serviceSpeed === "express_50" ? "⚡ Exp 50%" : "⚡ Exp 100%"}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Expanded Items Breakdown */}
                                    {isExpanded && pjItems.length > 0 && (
                                      <div className="space-y-1 pt-0.5">
                                        <div className="space-y-1 max-h-[120px] overflow-y-auto pr-0.5 show-scrollbar">
                                          {pjItems.map((pi: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center text-[10.5px] bg-white hover:bg-slate-100/70 px-2 py-1 rounded-lg border border-slate-200/70 transition-colors">
                                              <span className="text-slate-700 truncate pr-1 font-semibold">{pi.name || "Item"}</span>
                                              <div className="flex items-center gap-1.5 shrink-0">
                                                <span className="text-slate-400 text-[9.5px]">×{pi.quantity || 1} {pi.unit || ""}</span>
                                                <span className="text-amber-600 font-bold text-[10.5px]">฿{safeCeil((pi.price || 0) * (pi.quantity || 1)).toLocaleString()}</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Copy Items & Rewash Buttons for this specific bill */}
                                        {!isPaidJob && !isCartLocked && (
                                          <div className="grid grid-cols-2 gap-1.5 mt-1">
                                            <button
                                              type="button"
                                              onClick={() => handleCopyPastItems(pjItems, pj)}
                                              className="py-1 px-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[9.5px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs truncate"
                                              title="คัดลอกรายการสินค้าจากออเดอร์นี้ใส่ตะกร้าปัจจุบัน"
                                            >
                                              <Copy size={10} className="text-indigo-600 shrink-0" />
                                              <span className="truncate">{currentLanguage === "en" ? `Copy #${formatJobDisplayId(pj.id)}` : `คัดลอก #${formatJobDisplayId(pj.id)}`}</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleStartRewashFromJob(pj)}
                                              className="py-1 px-2 rounded-lg bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-300 text-[9.5px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs truncate"
                                              title="เปิดบิลซักซ้ำ / เคลมฟรี (฿0 และไม่คิดค่าคอมไรเดอร์) จากออเดอร์นี้"
                                            >
                                              <RotateCcw size={10} className="text-cyan-700 shrink-0" />
                                              <span className="truncate">{currentLanguage === "en" ? `Rewash #${formatJobDisplayId(pj.id)}` : `ซักซ้ำฟรี #${formatJobDisplayId(pj.id)}`}</span>
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (selectedProfileCustomer || customerPhone || customerName) ? (
                          <div className="p-3 rounded-xl bg-slate-50/80 border border-dashed border-slate-200 text-center text-slate-500 text-[10.5px] flex items-center justify-center gap-1.5 flex-1 min-h-[90px]">
                            <UserCheck size={13} className="text-slate-400" />
                            <span className="italic">{currentLanguage === "en" ? "New customer (no previous transaction history)" : "ลูกค้ารายใหม่ (ไม่มีประวัติการสั่งก่อนหน้า)"}</span>
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-slate-50/80 border border-dashed border-slate-200 text-center text-slate-500 text-[10.5px] flex items-center justify-center gap-1.5 flex-1 min-h-[90px]">
                            <Search size={13} className="text-slate-400" />
                            <span className="italic">{currentLanguage === "en" ? "Select a customer to view latest past transaction" : "เลือกหรือค้นหาลูกค้าเพื่อดูประวัติการสั่งล่าสุด"}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>

                    {/* COL 2: Route & Map + Admin Note Logs */}
                    <motion.div
                      className="col-span-1 flex flex-col gap-2.5 overflow-y-auto pr-0.5 pb-2 min-w-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15, duration: 0.3 }}
                    >
                      {/* Interactive Route & Live Map Card */}
                      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-2 shrink-0">
                        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                          <Label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                            <MapPin size={13} className="text-emerald-600" />
                            <span>Route & Location Map</span>
                          </Label>
                          {(pickupLoc || deliveryLoc) && (
                            <button
                              type="button"
                              onClick={() => {
                                const target = deliveryLoc || pickupLoc;
                                if (target) {
                                  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`, '_blank');
                                }
                              }}
                              className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline cursor-pointer"
                            >
                              <span>Google Maps</span>
                              <ExternalLink size={10} />
                            </button>
                          )}
                        </div>

                        {/* Interactive Map (Noticeably bigger for high readability) */}
                        <div className="min-h-[200px] h-[215px] xl:h-[235px] rounded-xl overflow-hidden border border-slate-200/90 relative shadow-2xs">
                          <CreateJobMap 
                            branchCoords={shopLocations[selectedStoreIndex]?.coords || { lat: 13.7417, lng: 100.5526 }} 
                            pickupCoords={isPickup ? pickupCoords : null}
                            deliveryCoords={isDelivery ? deliveryCoords : null}
                            onMarkerDrag={(type, coords) => {
                              setEditingFeeLock(null);
                              if (type === 'pickup') {
                                setPickupCoords(coords);
                                updateClosestStoreAsync(coords);
                                if (!isDeliveryDirty) {
                                  setDeliveryCoords(coords);
                                }
                              } else if (type === 'delivery') {
                                setDeliveryCoords(coords);
                                setIsDeliveryDirty(true);
                                if (!isPickup) {
                                  updateClosestStoreAsync(coords);
                                }
                              }
                            }}
                            onDistanceCalculated={(p, d) => {
                              setPickupDist(p);
                              setDeliveryDist(d);
                            }}
                          />
                        </div>

                        {/* Route & Distance Info Strip */}
                        {(isPickup || isDelivery) && (
                          <div className="flex justify-between items-center text-[10px] bg-slate-50/90 p-2 rounded-xl border border-slate-200/70">
                            <div className="flex items-center gap-1.5 text-slate-600 font-semibold truncate">
                              <Truck size={12} className="text-indigo-600 shrink-0" />
                              {isPickup && <span>Pickup: {pickupDist} km (×2)</span>}
                              {isPickup && isDelivery && <span className="text-slate-400">/</span>}
                              {isDelivery && <span>Delivery: {deliveryDist} km</span>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              <span className="text-slate-400 font-bold">Rider Comm:</span>
                              {(() => {
                                const targetCustomer = selectedProfileCustomer || (editingJobId && activeJob ? findMatchingCustomer(customers, { customerId: activeJob.customerId, customerName: activeJob.customerName, customerPhone: activeJob.customerPhone }) : null);
                                const comm = calculateRiderCommission({
                                  customer: targetCustomer,
                                  isPickup,
                                  pickupDist,
                                  isDelivery,
                                  deliveryDist,
                                  systemSettings,
                                  isVIP: Boolean(selectedVIPLabel),
                                  isFreeDelivery: activeIsFreeDelivery,
                                  isRewash: isRewashJob,
                                  noRiderCommission,
                                });
                                const pVal = (isRewashJob || noRiderCommission)
                                  ? 0
                                  : ((editingJobId && activeJob && (activeJob.status === 'billing' || activeJob.status === 'delivery' || activeJob.status === 'completed') && (activeJob.pickupCommission ?? 0) > 0)
                                    ? (activeJob.pickupCommission ?? 0)
                                    : comm.pickupCommission);
                                const dVal = (isRewashJob || noRiderCommission)
                                  ? 0
                                  : ((editingJobId && activeJob && activeJob.status === 'completed' && (activeJob.deliveryCommission ?? 0) > 0)
                                    ? (activeJob.deliveryCommission ?? 0)
                                    : comm.deliveryCommission);
                                const totalComm = (isRewashJob || noRiderCommission) ? 0 : (comm.isCorporateRule ? (pVal + dVal) : (selectedVIPLabel || activeIsFreeDelivery ? 0 : (pVal + dVal)));
                                return (
                                  <span className="font-extrabold text-amber-600">฿{totalComm.toFixed(0)}</span>
                                );
                              })()}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Admin Notes & Activity Feed Card */}
                      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col gap-2 flex-1 min-h-[220px] overflow-hidden">
                        <div className="flex items-center justify-between gap-1.5 shrink-0">
                          <Label className="text-[10.5px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1 shrink-0">
                            <MessageSquare size={12} className="text-indigo-500 shrink-0" />
                            <span>Admin Note Logs</span>
                            {adminLogs.length > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200/70">
                                {adminLogs.length}
                              </span>
                            )}
                          </Label>

                          <div className="flex items-center gap-1 ml-auto">
                            {/* Hanger (H) */}
                            <div
                              title="จำนวนผ้าแขวน (H) แจ้ง Rider"
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border transition-colors ${
                                hangerCount > 0
                                  ? "bg-indigo-50/60 border-indigo-400 shadow-2xs"
                                  : "bg-slate-50/70 border-slate-200/90"
                              }`}
                            >
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextQty = Math.max(0, (Number(hangerCount) || 0) - 1);
                                    const nextHas = nextQty > 0;
                                    setHasHanger(nextHas);
                                    setHangerCount(nextQty);
                                    persistPackingCountsToDb(nextHas, nextQty, foldedCount > 0, foldedCount);
                                  }}
                                  className="w-4 h-4 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-[10px] leading-none flex items-center justify-center cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={999}
                                  value={hangerCount || 0}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    const nextHas = val > 0;
                                    setHasHanger(nextHas);
                                    setHangerCount(val);
                                    persistPackingCountsToDb(nextHas, val, foldedCount > 0, foldedCount);
                                  }}
                                  className="w-6 h-4 text-center text-[11px] font-black bg-white border border-slate-200 rounded text-indigo-900 focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextQty = Math.min(999, (Number(hangerCount) || 0) + 1);
                                    setHasHanger(true);
                                    setHangerCount(nextQty);
                                    persistPackingCountsToDb(true, nextQty, foldedCount > 0, foldedCount);
                                  }}
                                  className="w-4 h-4 rounded bg-indigo-100/80 hover:bg-indigo-200 text-indigo-700 font-bold text-[10px] leading-none flex items-center justify-center cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                              <span className="text-[11px] font-black text-indigo-700 leading-none select-none">H</span>
                            </div>

                            {/* Folded (F) */}
                            <div
                              title="จำนวนผ้าพับ (F) แจ้ง Rider"
                              className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border transition-colors ${
                                foldedCount > 0
                                  ? "bg-emerald-50/60 border-emerald-400 shadow-2xs"
                                  : "bg-slate-50/70 border-slate-200/90"
                              }`}
                            >
                              <div className="flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextQty = Math.max(0, (Number(foldedCount) || 0) - 1);
                                    const nextHas = nextQty > 0;
                                    setHasFolded(nextHas);
                                    setFoldedCount(nextQty);
                                    persistPackingCountsToDb(hangerCount > 0, hangerCount, nextHas, nextQty);
                                  }}
                                  className="w-4 h-4 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-[10px] leading-none flex items-center justify-center cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={999}
                                  value={foldedCount || 0}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    const nextHas = val > 0;
                                    setHasFolded(nextHas);
                                    setFoldedCount(val);
                                    persistPackingCountsToDb(hangerCount > 0, hangerCount, nextHas, val);
                                  }}
                                  className="w-6 h-4 text-center text-[11px] font-black bg-white border border-slate-200 rounded text-emerald-900 focus:outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextQty = Math.min(999, (Number(foldedCount) || 0) + 1);
                                    setHasFolded(true);
                                    setFoldedCount(nextQty);
                                    persistPackingCountsToDb(hangerCount > 0, hangerCount, true, nextQty);
                                  }}
                                  className="w-4 h-4 rounded bg-emerald-100/80 hover:bg-emerald-200 text-emerald-700 font-bold text-[10px] leading-none flex items-center justify-center cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                              <span className="text-[11px] font-black text-emerald-700 leading-none select-none">F</span>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer shrink-0"
                              onClick={() => setNoteLogsModalOpen(true)}
                              title="Expand Notes"
                            >
                              <Maximize2 size={12} />
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 flex-1 overflow-hidden">
                          {adminLogs.length > 0 ? (
                            <div 
                              className="flex-1 min-h-0 overflow-y-auto space-y-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/60 text-xs"
                            >
                              {adminLogs.map((log, i) => (
                                <div key={log.id || i} className="group relative p-2.5 rounded-xl bg-white border border-slate-200/70 shadow-2xs pr-6">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className={`font-extrabold text-[11px] uppercase tracking-wide ${log.userId === 'system' ? 'text-indigo-600' : 'text-slate-800'}`}>
                                      {log.userName || (log as any).createdBy || "System"}
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] font-medium text-slate-400">
                                        {format(new Date(log.timestamp || (log as any).createdAt), "MMM d, HH:mm")}
                                      </span>
                                      {log.isNew && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteAdminLog(log.id!);
                                          }}
                                          className="text-slate-400 hover:text-rose-500 rounded p-0.5 transition-colors"
                                          title="Delete note"
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{log.text}</p>
                                  {log.imageUrls && log.imageUrls.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                      {log.imageUrls.map((url, idx) => (
                                        <div 
                                          key={idx} 
                                          className="relative w-10 h-10 rounded-lg border border-slate-200 overflow-hidden cursor-pointer bg-slate-100 shadow-2xs"
                                          onClick={(e) => { e.stopPropagation(); setPreviewAdminNoteImage(url); }}
                                          title="Click to view full image"
                                        >
                                          <img src={url} alt={`Attachment ${idx}`} className="w-full h-full object-cover hover:scale-110 transition-transform" />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                              <div ref={adminLogsEndRef} />
                            </div>
                          ) : (
                            <div 
                              className="text-xs text-slate-400 italic px-3 flex-1 flex flex-col items-center justify-center border border-dashed border-slate-200 bg-slate-50/60 rounded-xl gap-1"
                            >
                              <MessageSquare size={18} className="text-slate-300" />
                              <span>No notes recorded yet</span>
                            </div>
                          )}
                          <div className="flex flex-col gap-1 shrink-0">
                            <div className="flex gap-1.5 items-center">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={`h-9 w-9 p-0 rounded-xl border shrink-0 cursor-pointer ${showNoteUploader && !noteLogsModalOpen ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'bg-slate-50/80 border-slate-200/90 text-slate-500 hover:bg-slate-100'}`}
                                onClick={() => setShowNoteUploader(prev => !prev)}
                                disabled={isUploadingNote}
                                title="Attach images"
                              >
                                <Paperclip size={14} />
                              </Button>
                              <Input
                                placeholder="Type a note & press Enter..."
                                value={adminNoteInput}
                                onChange={(e) => setAdminNoteInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleSendAdminLog();
                                  }
                                }}
                                disabled={isUploadingNote}
                                className="h-9 text-xs bg-slate-50/70 focus:bg-white border-slate-200/90 flex-1 rounded-xl"
                              />
                              <Button 
                                type="button" 
                                size="sm" 
                                disabled={isUploadingNote}
                                className="h-9 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer shrink-0"
                                onClick={handleSendAdminLog}
                              >
                                {isUploadingNote ? (
                                  <Loader2 className="animate-spin" size={14} />
                                ) : (
                                  <Send size={13} />
                                )}
                                <span className="ml-1.5">Send</span>
                              </Button>
                            </div>
                            {showNoteUploader && !noteLogsModalOpen && (
                              <div className="border border-slate-200 bg-white p-2 rounded-xl shadow-2xs mt-1 max-h-[160px] overflow-y-auto">
                                <MultiImageUploader
                                  ref={noteUploaderRef}
                                  entityType="job"
                                  entityId={editingJobId || "temp-note"}
                                  subType="proofs"
                                  maxFiles={3}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>

{isPosEnabled ? (
  <>
                    {/* COL 3: Job Photos & Service Catalog / Payment Overview */}
                    <motion.div
                      className="col-span-1 flex flex-col gap-2.5 overflow-y-auto pr-0.5 pb-2 min-w-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15, duration: 0.3 }}
                    >
                      {/* Job Photos Unified Section */}
                      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs space-y-2.5">
                        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                              <Camera size={13} />
                            </div>
                            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">Job Photos</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {(bagImageUrls.length + billImageUrls.length + pickupProofImageUrls.length + deliveryProofImageUrls.length) > 0 && (
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full">
                                {bagImageUrls.length + billImageUrls.length + pickupProofImageUrls.length + deliveryProofImageUrls.length} total
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Laundry Bags</Label>
                              {bagImageUrls.length > 0 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-700">{bagImageUrls.length}</span>
                              )}
                            </div>
                            <MultiImageUploader
                              ref={uploaderRef}
                              entityType="job"
                              entityId={editingJobId || Date.now().toString()}
                              subType="bags"
                              value={bagImageUrls}
                              onValueChange={setBagImageUrls}
                              maxFiles={5}
                              disableDelete={!canDeleteLaundryBags}
                            />
                          </div>

                          <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Bill / Transfer</Label>
                              {billImageUrls.length > 0 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-700">{billImageUrls.length}</span>
                              )}
                            </div>
                            <MultiImageUploader
                              ref={billUploaderRef}
                              entityType="job"
                              entityId={editingJobId || Date.now().toString()}
                              subType="bills"
                              value={billImageUrls}
                              onValueChange={setBillImageUrls}
                              maxFiles={10}
                              disableDelete={!isAdmin}
                            />
                          </div>

                          <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Pickup Proofs</Label>
                              {pickupProofImageUrls.length > 0 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-sky-100 text-sky-700">{pickupProofImageUrls.length}</span>
                              )}
                            </div>
                            <MultiImageUploader
                              ref={isAdmin ? pickupUploaderRef : undefined}
                              entityType="job"
                              entityId={editingJobId || Date.now().toString()}
                              subType="proofs"
                              value={pickupProofImageUrls}
                              onValueChange={isAdmin ? setPickupProofImageUrls : undefined}
                              maxFiles={isAdmin ? 5 : pickupProofImageUrls.length}
                              readOnly={!isAdmin}
                              disableDelete={!isAdmin}
                            />
                          </div>

                          <div className="p-2 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Delivery Proofs</Label>
                              {deliveryProofImageUrls.length > 0 && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-700">{deliveryProofImageUrls.length}</span>
                              )}
                            </div>
                            <MultiImageUploader
                              ref={isAdmin ? deliveryUploaderRef : undefined}
                              entityType="job"
                              entityId={editingJobId || Date.now().toString()}
                              subType="proofs"
                              value={deliveryProofImageUrls}
                              onValueChange={isAdmin ? setDeliveryProofImageUrls : undefined}
                              maxFiles={isAdmin ? 5 : deliveryProofImageUrls.length}
                              readOnly={!isAdmin}
                              disableDelete={!isAdmin}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Laundry Service Type & Speed / Paid Summary */}
                      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-2xs flex-1 flex flex-col gap-2 min-h-[350px]">
                        {isPaidJob ? (
                          <div className="flex-1 flex flex-col rounded-xl overflow-hidden border border-emerald-200/80 bg-gradient-to-b from-emerald-50/40 via-white to-slate-50/50">
                            {/* Paid Banner Header */}
                            <div className="p-3 bg-emerald-50/90 border-b border-emerald-200/80 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                                  <CheckCircle2 size={16} />
                                </div>
                                <div>
                                  <h3 className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                                    {currentLanguage === "en" ? "Payment Completed" : "ชำระเงินเรียบร้อยแล้ว"}
                                  </h3>
                                  <p className="text-[10px] text-emerald-700 font-medium">
                                    {currentLanguage === "en" ? "Order pricing and items are locked" : "รายการสินค้าและราคาถูกล็อคแล้ว"}
                                  </p>
                                </div>
                              </div>
                              <span className="text-sm font-black text-emerald-700 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 shadow-2xs">
                                ฿{dialogTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>

                            {/* Paid Job Info Grid */}
                            <div className="p-3 space-y-3 flex-1 flex flex-col justify-between">
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="p-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                                  <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">Payment Channel</span>
                                  <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1 mt-0.5">
                                    <CreditCard size={12} className="text-indigo-600" />
                                    {paymentChannel || "N/A"}
                                  </span>
                                </div>
                                <div className="p-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                                  <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">Bill / Ref No.</span>
                                  <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1 mt-0.5">
                                    <Receipt size={12} className="text-amber-600" />
                                    {billNo || proformaReceiptNumber || "-"}
                                  </span>
                                </div>
                                <div className="p-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                                  <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">Fulfillment Type</span>
                                  <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1 mt-0.5">
                                    <Truck size={12} className="text-sky-600" />
                                    {isWalkIn ? "Walk-In" : (isPickup && isDelivery ? "Pickup & Delivery" : isPickup ? "Pickup Only" : "Delivery Only")}
                                  </span>
                                </div>
                                <div className="p-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                                  <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">Total Items</span>
                                  <span className="font-extrabold text-slate-800 text-xs flex items-center gap-1 mt-0.5">
                                    <Package size={12} className="text-purple-600" />
                                    {dialogCart.length} items ({dialogCart.reduce((sum, i) => sum + (typeof i.quantity === 'number' ? i.quantity : 1), 0)})
                                  </span>
                                </div>
                              </div>

                              {/* Mini Cart Breakdown */}
                              {dialogCart.length > 0 && (
                                <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 space-y-1.5 max-h-[140px] overflow-y-auto">
                                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Items Summary</span>
                                  <div className="space-y-1">
                                    {dialogCart.map((it, idx) => (
                                      <div key={idx} className="flex justify-between items-center text-[11px] text-slate-700 py-0.5 border-b border-slate-100 last:border-0">
                                        <span className="font-medium truncate max-w-[180px]">{it.name} <span className="text-slate-400 font-normal">x{it.quantity}</span></span>
                                        <span className="font-bold text-slate-900">฿{safeCeil((it.price || 0) * (it.quantity || 0)).toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Unlock Paid Action Notice */}
                              {canUnlockPaid && (
                                <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/90 flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 text-xs text-amber-800 font-medium">
                                    <Lock size={13} className="text-amber-600 shrink-0" />
                                    <span className="text-[11px]">Need to add items or adjust bill?</span>
                                  </div>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setUnlockPaidReason("");
                                      setUnlockPaidDialogOpen(true);
                                    }}
                                    className="h-7 px-2.5 text-[10.5px] font-bold bg-white text-amber-800 border-amber-300 hover:bg-amber-100 shadow-2xs cursor-pointer rounded-lg shrink-0 gap-1"
                                  >
                                    <LockOpen size={11} className="text-amber-600" />
                                    Unlock Paid
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (

                          <div className="flex-1 flex flex-col gap-1">
                            {/* Corporate Contract Banner in Dialog */}
                            {activeDialogCorpPriceList && (
                              <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200/80 flex items-center justify-between gap-2 shrink-0 mb-1">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-7 h-7 rounded-md bg-indigo-600 text-white flex items-center justify-center shrink-0">
                                    <Building size={14} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-black text-indigo-950 truncate">
                                        {activeDialogCorpPriceList.name}
                                      </span>
                                      <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                        {showAllStoreServicesInDialog 
                                          ? (currentLanguage === "en" ? "Store Catalog" : "สินค้าทั้งหมดของร้าน")
                                          : (currentLanguage === "en" ? `Contract (${dialogCorporateServices.length} items)` : `สัญญา (${dialogCorporateServices.length} รายการ)`)}
                                      </span>
                                      {dialogVatType !== "none" && (
                                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                          {dialogVatType === "exclusive" 
                                            ? (currentLanguage === "en" ? `Exclude VAT (+${dialogVatRate}%)` : `แยก VAT (+${dialogVatRate}%)`)
                                            : (currentLanguage === "en" ? `Include VAT (${dialogVatRate}%)` : `รวม VAT (${dialogVatRate}%)`)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setShowAllStoreServicesInDialog(!showAllStoreServicesInDialog);
                                    setDialogSelectedCategory(null);
                                  }}
                                  className="shrink-0 h-6.5 text-[10.5px] font-bold px-2.5 rounded-md border-indigo-300 text-indigo-700 hover:bg-indigo-100 cursor-pointer"
                                >
                                  {showAllStoreServicesInDialog
                                    ? (currentLanguage === "en" ? "Contract Only" : "ดูเฉพาะสินค้าสัญญา")
                                    : (currentLanguage === "en" ? "All Services" : "ดูสินค้าทั้งหมดของร้าน")}
                                </Button>
                              </div>
                            )}

                            <span className="flex items-center justify-between pb-1.5 border-b border-slate-100 shrink-0 select-none">
                              <Label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 border-none pb-0">
                                <ArrowDownUp size={14} className="text-purple-600" />
                                {activeDialogCorpPriceList && !showAllStoreServicesInDialog
                                  ? (currentLanguage === "en" ? "Corporate Contract Catalog" : "รายการสินค้าตามสัญญา")
                                  : (dialogSelectedCategory ? dialogSelectedCategory : "Laundry Service Type")}
                              </Label>
                              {dialogSelectedCategory !== null && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-50 border-slate-200 rounded-md shadow-sm flex items-center gap-1 cursor-pointer"
                                  onClick={() => setDialogSelectedCategory(null)}
                                >
                                  <ArrowLeft size={9} />
                                  Back to Categories
                                </Button>
                              )}
                            </span>

                            {dialogSelectedCategory === null && (!activeDialogCorpPriceList || showAllStoreServicesInDialog || visibleCategories.length > 1) ? (
                              visibleCategories.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50 my-2">
                                  <Package size={32} className="mb-2 text-slate-300" />
                                  <p className="text-xs font-bold text-slate-600">CSO Booking Mode</p>
                                  <p className="text-[11px] text-slate-400 mt-1 max-w-[220px]">
                                    Only customer and delivery details are recorded by CSO. Item counting is handled at shop shift.
                                  </p>
                                </div>
                              ) : (
                                <div className={`grid grid-cols-2 gap-2.5 pt-2 flex-1 ${visibleCategories.length <= 4 ? "auto-rows-[48px]" : "grid-rows-[repeat(5,1fr)]"}`}>
                                  {visibleCategories.map((cat) => (
                                    <Button
                                      key={cat}
                                      type="button"
                                      variant="outline"
                                      disabled={isPricingLocked}
                                      className="h-full text-xs font-bold uppercase justify-center hover:bg-indigo-50 hover:text-indigo-600 border-slate-200 rounded-lg shadow-sm"
                                      onClick={() => setDialogSelectedCategory(cat)}
                                    >
                                      {cat}
                                    </Button>
                                  ))}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={isPricingLocked}
                                    className="h-full text-xs font-bold uppercase justify-center hover:bg-rose-50 hover:text-rose-600 border-slate-200 rounded-lg shadow-sm col-span-2 text-rose-600 min-h-[36px]"
                                    onClick={() => {
                                      handleServiceOrSpeedChange("other", serviceSpeed, serviceWeight);
                                      setDialogCart(prev => {
                                        if (prev.some(x => x.id === "other")) return prev;
                                        return [...prev, {
                                          id: "other",
                                          name: "Other (Custom Price)",
                                          nameEn: "Other (Custom Price)",
                                          quantity: 1,
                                          price: laundryPrice || 0,
                                          basePrice: laundryPrice || 0,
                                          category: "other",
                                          unit: "piece"
                                        }];
                                      });
                                    }}
                                  >
                                    Other (Custom Price)
                                  </Button>
                                </div>
                              )
                            ) : (
                              <div className="flex-1 flex flex-col gap-2 pt-2">
                                <div className="grid grid-cols-3 auto-rows-max gap-2 overflow-y-auto flex-1 pr-0.5 animate-in fade-in duration-200">
                                  {dialogActiveServices
                                    .filter((s) => (dialogSelectedCategory === null ? true : s.category === dialogSelectedCategory) && s.category !== 'PACKAGE')
                                    .filter((s) => {
                                      if (activeDialogCorpPriceList && !showAllStoreServicesInDialog) return true;
                                      const name = (s.name || "").toLowerCase();
                                      const en = (s.nameEn || "").toLowerCase();
                                      return !name.includes("delivery") && !en.includes("delivery") &&
                                             !name.includes("pickup") && !en.includes("pickup") &&
                                             !name.includes("pick up") && !en.includes("pick up") &&
                                             !name.includes("express") && !en.includes("express") &&
                                             !name.includes("ผ้าด่วน");
                                    })
                                    .map((s) => {
                                      const cartItem = dialogCart.find(item => item.id === s.id);
                                      const quantity = cartItem ? cartItem.quantity : 0;
                                      const resolvedPrice = getServicePrice(s, selectedProfileCustomer, customerPriceListId);
                                      return (
                                        <Button
                                          key={s.id}
                                          type="button"
                                          variant={quantity > 0 ? "default" : "outline"}
                                          disabled={isPricingLocked}
                                          className={`relative h-12 text-xs font-semibold flex flex-col items-center justify-center p-1 rounded-lg shadow-sm transition-all ${
                                            quantity > 0 
                                              ? 'bg-indigo-600 text-white hover:bg-indigo-700 font-bold border-none' 
                                              : 'hover:bg-indigo-50 hover:text-indigo-600 border-slate-200'
                                          }`}
                                          onClick={() => {
                                            handleServiceOrSpeedChange(s.id, serviceSpeed, serviceWeight);
                                            setDialogCart(prev => {
                                              const existing = prev.find(item => item.id === s.id);
                                              const isKiloService = s.unit === 'kg' || s.category?.toUpperCase().includes('KILO');
                                              let updated;
                                              if (existing) {
                                                const step = isKiloService ? 0.5 : 1;
                                                updated = prev.map(item => 
                                                  item.id === s.id 
                                                    ? { ...item, quantity: Math.round((item.quantity + step) * 100) / 100 }
                                                    : item
                                                );
                                              } else {
                                                // L1 Fix: Warn if other items in cart have custom prices that won't carry over
                                                const hasCustomPriced = prev.some(item => item.basePrice !== undefined && item.price !== item.basePrice);
                                                if (hasCustomPriced) {
                                                  toast(`⚠️ มีรายการที่ปรับราคาพิเศษอยู่ในตะกร้า — ราคาสินค้าใหม่จะใช้ราคาตามปกติ`, { duration: 3000 });
                                                }
                                                const defaultQty = isKiloService ? 2 : 1;
                                                const effectiveItemPrice = isRewashJob ? 0 : resolvedPrice;
                                                updated = [...prev, {
                                                  id: s.id,
                                                  name: s.name,
                                                  nameEn: s.nameEn || s.name,
                                                  quantity: defaultQty,
                                                  price: effectiveItemPrice,
                                                  basePrice: resolvedPrice,
                                                  isCustomPrice: isRewashJob,
                                                  category: s.category || "",
                                                  unit: s.unit || "piece"
                                                }];
                                              }
                                              const totalSum = updated.reduce((acc, it) => acc + (it.price * it.quantity), 0);
                                              setLaundryPrice(totalSum);
                                              return updated;
                                            });
                                          }}
                                        >
                                          <span className="truncate w-full text-center">{s.name}</span>
                                          <span className={`text-[10px] ${quantity > 0 ? "text-indigo-100" : "text-slate-500 font-bold"}`}>
                                            ฿{resolvedPrice}{s.unit ? `/${s.unit}` : ''}
                                          </span>
                                          {quantity > 0 && (
                                            <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[9px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white shadow-sm animate-in zoom-in duration-200">
                                              {quantity}
                                            </span>
                                          )}
                                        </Button>
                                      );
                                    })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </motion.div>

                    {/* COL 4: Order Items Cart & Financial Checkout */}
                    <motion.div
                      className="col-span-1 flex flex-col gap-2.5 overflow-y-auto pr-0.5 pb-2 min-w-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.3 }}
                    >
                      {/* One Unified Consolidated Dark Card */}
                      <div className="bg-slate-900 text-white rounded-2xl p-3 shadow-lg flex-1 flex flex-col gap-2 min-h-0 border border-slate-800">
                        
                        {/* Cart / Order Items List */}
                        <div className="flex flex-col gap-2 flex-1 min-h-0">
                          <div className="flex justify-between items-center shrink-0 select-none pb-0.5 border-b border-slate-800/80">
                            <span className="flex items-center gap-1.5 text-xs font-extrabold text-slate-300 uppercase tracking-wider">
                              {isPosEnabled ? (
                                <>
                                  <Package size={14} className="text-indigo-400" />
                                  <span>Order Items Cart</span>
                                  {dialogCart.length > 0 && (
                                    <span className="text-[10px] font-bold text-indigo-300 bg-indigo-950/80 border border-indigo-700/60 px-1.5 py-0.2 rounded-full">
                                      {dialogCart.length}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <Banknote size={14} className="text-emerald-400" />
                                  Laundry Price
                                </>
                              )}
                            </span>
                            
                            <div className="flex items-center gap-1.5 flex-wrap justify-end">
                              <Label
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[9.5px] font-bold cursor-pointer select-none transition-all ${
                                  isRewashJob
                                    ? 'bg-cyan-950/90 border-cyan-500/80 text-cyan-300 shadow-xs'
                                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:text-cyan-300'
                                }`}
                                title="Rewash / Claim Order (ซักซ้ำ / เคลมฟรี ฿0 — ไม่คิดเงินลูกค้า และไม่คิดค่าคอมไรเดอร์)"
                              >
                                <input
                                  type="checkbox"
                                  disabled={isPaidJob}
                                  checked={isRewashJob}
                                  onChange={(e) => handleToggleRewash(e.target.checked)}
                                  className="sr-only"
                                />
                                <RotateCcw size={10} className={isRewashJob ? "text-cyan-400" : "text-slate-400"} />
                                <span>{currentLanguage === "en" ? "Rewash ฿0" : "ซักซ้ำ ฿0"}</span>
                              </Label>
                              {canSeeTaxInvoice && (
                                <Label className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[9.5px] font-bold cursor-pointer select-none transition-all ${
                                  isTaxInvoiceRequested 
                                    ? 'bg-amber-950/70 border-amber-600/70 text-amber-300' 
                                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:text-slate-300'
                                }`}>
                                  <input 
                                    type="checkbox" 
                                    checked={isTaxInvoiceRequested} 
                                    onChange={(e) => setIsTaxInvoiceRequested(e.target.checked)} 
                                    className="sr-only"
                                  />
                                  <FileText size={11} className={isTaxInvoiceRequested ? "text-amber-400" : "text-slate-400"} />
                                  <span>Tax Inv</span>
                                </Label>
                              )}
                              {canSeeStuck && (
                                <Label className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[9.5px] font-bold cursor-pointer select-none transition-all ${
                                  isStuck 
                                    ? 'bg-rose-950/80 border-rose-600/70 text-rose-300' 
                                    : 'bg-slate-800/50 border-slate-700/60 text-slate-400 hover:text-rose-400'
                                }`}>
                                  <input 
                                    type="checkbox" 
                                    checked={isStuck} 
                                    onChange={(e) => setIsStuck(e.target.checked)} 
                                    className="sr-only"
                                  />
                                  <span>Stuck</span>
                                </Label>
                              )}
                            </div>
                          </div>
                          {isRewashJob && (
                            <div className="px-2.5 py-1.5 rounded-xl bg-cyan-950/80 border border-cyan-600/60 text-cyan-200 text-[10px] font-bold flex items-center justify-between gap-2 shadow-xs">
                              <span className="flex items-center gap-1.5 truncate">
                                <RotateCcw size={12} className="text-cyan-400 shrink-0" />
                                <span className="truncate">
                                  {currentLanguage === "en"
                                    ? `REWASH / CLAIM${rewashFromJobId ? ` (#${rewashFromJobId})` : ""} • No Charge (฿0)`
                                    : `บิลซักซ้ำ / เคลมฟรี${rewashFromJobId ? ` (#${rewashFromJobId})` : ""} • ไม่คิดค่าใช้จ่าย (฿0)`}
                                </span>
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-cyan-900/90 text-cyan-300 text-[8.5px] font-black uppercase tracking-wider shrink-0 border border-cyan-700/60">
                                Rider Comm ฿0
                              </span>
                            </div>
                          )}
                          <div id="order-items-list" className="overflow-y-auto space-y-1.5 pr-0.5 show-scrollbar max-h-[26vh] shrink-0">
                            {!isPosEnabled ? (
                              <div className="flex-1 flex flex-col items-center justify-center p-4 h-full min-h-[200px]">
                                <div className="w-full max-w-[240px] space-y-4 text-center">
                                  <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl font-bold">฿</span>
                                    <input 
                                      type="number"
                                      className="w-full h-16 pl-12 pr-4 bg-slate-900 border border-slate-700 text-white font-black text-right text-3xl rounded-xl focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-inner placeholder:text-slate-600"
                                      placeholder="0"
                                      value={laundryPrice || ""}
                                      onChange={e => setLaundryPrice(parseFloat(e.target.value) || 0)}
                                      disabled={isCartLocked}
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : dialogCart.length > 0 ? (
                              dialogCart.map((item, idx) => (
                                <div key={`${item.id}_${idx}`} className="flex justify-between items-center bg-slate-800/70 hover:bg-slate-800 p-2 rounded-xl border border-slate-700/60 text-[11px] transition-all">
                                  <div className="flex-1 min-w-0 pr-1.5 flex flex-col">
                                    <span className="font-bold text-white truncate text-xs">{item.name}</span>
                                    <span className="text-[9px] text-slate-400 font-bold uppercase">{item.category}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <div className="flex items-center border border-slate-700 rounded-lg bg-slate-950 p-0.5">
                                      <button
                                        type="button"
                                        disabled={isCartLocked}
                                        className={`w-4 h-4 flex items-center justify-center text-slate-400 font-bold rounded ${isCartLocked ? 'opacity-40 cursor-not-allowed' : 'hover:text-rose-400 hover:bg-slate-800'}`}
                                        onClick={() => {
                                          setDialogCart(prev => {
                                            const updated = prev.map(it => {
                                              if (it.id !== item.id) return it;
                                              const isKilo = it.unit === 'kg' || it.category?.toUpperCase().includes('KILO');
                                              const step = isKilo ? 0.5 : 1;
                                              return { ...it, quantity: Math.round(Math.max(0, it.quantity - step) * 100) / 100 };
                                            }).filter(it => it.quantity > 0);
                                            const totalSum = updated.reduce((acc, it) => acc + safeCeil((it.price || 0) * (it.quantity || 0)), 0);
                                            setLaundryPrice(totalSum);
                                            return updated;
                                          });
                                        }}
                                      >
                                        -
                                      </button>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        disabled={isCartLocked}
                                        value={item.quantity === 0 || (item.quantity as any) === "" ? "" : item.quantity}
                                        placeholder="0"
                                        className="w-12 text-center text-[10px] font-black text-slate-200 bg-transparent border-none outline-none p-0 focus:ring-0 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-slate-600"
                                        onChange={(e) => {
                                          const valStr = e.target.value;
                                          const raw = parseFloat(valStr);
                                          setDialogCart(prev => {
                                            const updated = prev.map(it => it.id === item.id ? { ...it, quantity: valStr === "" ? ("" as any) : (!isNaN(raw) ? raw : it.quantity) } : it);
                                            setLaundryPrice(updated.reduce((acc, it) => acc + safeCeil((it.price || 0) * (typeof it.quantity === 'number' ? it.quantity : 0)), 0));
                                            return updated;
                                          });
                                        }}
                                        onBlur={(e) => {
                                          const raw = parseFloat(e.target.value);
                                          const isKilo = item.unit === 'kg' || item.category?.toUpperCase().includes('KILO');
                                          const rounded = (!isNaN(raw) && raw > 0) ? Math.round(raw * 100) / 100 : (isKilo ? 0.5 : 1);
                                          setDialogCart(prev => {
                                            const updated = prev.map(it => it.id === item.id ? { ...it, quantity: rounded } : it);
                                            setLaundryPrice(updated.reduce((acc, it) => acc + safeCeil((it.price || 0) * (it.quantity || 0)), 0));
                                            return updated;
                                          });
                                        }}
                                      />
                                      <button
                                        type="button"
                                        disabled={isCartLocked}
                                        className={`w-4 h-4 flex items-center justify-center text-slate-400 font-bold rounded ${isCartLocked ? 'opacity-40 cursor-not-allowed' : 'hover:text-indigo-400 hover:bg-slate-800'}`}
                                        onClick={() => {
                                          setDialogCart(prev => {
                                            const updated = prev.map(it => {
                                              if (it.id !== item.id) return it;
                                              const isKilo = it.unit === 'kg' || it.category?.toUpperCase().includes('KILO');
                                              const step = isKilo ? 0.5 : 1;
                                              return { ...it, quantity: Math.round((it.quantity + step) * 100) / 100 };
                                            });
                                            const totalSum = updated.reduce((acc, it) => acc + safeCeil((it.price || 0) * (it.quantity || 0)), 0);
                                            setLaundryPrice(totalSum);
                                            return updated;
                                          });
                                        }}
                                      >
                                        +
                                      </button>
                                    </div>
                                    <div className="flex items-center border border-slate-700 rounded-lg bg-slate-950 px-1.5 py-0.5 w-16" title="Unit price (ราคาต่อหน่วย)">
                                      <input 
                                        type="number"
                                        step="0.01"
                                        disabled={isCartLocked}
                                        value={item.price === 0 || (item.price as any) === "" ? "" : item.price}
                                        placeholder="0"
                                        className="w-full text-right text-[10px] font-black text-slate-200 bg-transparent border-none p-0 focus:ring-0 focus:outline-none placeholder:text-slate-600"
                                        onChange={e => {
                                          const valStr = e.target.value;
                                          const raw = parseFloat(valStr);
                                          setDialogCart(prev => {
                                            const updated = prev.map(it => 
                                              it.id === item.id 
                                                ? { ...it, price: valStr === "" ? ("" as any) : (!isNaN(raw) ? raw : it.price), isCustomPrice: true }
                                                : it
                                            );
                                            const totalSum = updated.reduce((acc, it) => acc + safeCeil(((typeof it.price === 'number' ? it.price : 0) || 0) * (typeof it.quantity === 'number' ? it.quantity : 0)), 0);
                                            setLaundryPrice(totalSum);
                                            return updated;
                                          });
                                        }}
                                        onBlur={e => {
                                          const raw = parseFloat(e.target.value);
                                          const finalPrice = (!isNaN(raw) && raw >= 0) ? Math.round(raw * 100) / 100 : 0;
                                          setDialogCart(prev => {
                                            const updated = prev.map(it => it.id === item.id ? { ...it, price: finalPrice, isCustomPrice: true } : it);
                                            setLaundryPrice(updated.reduce((acc, it) => acc + safeCeil((it.price || 0) * (it.quantity || 0)), 0));
                                            return updated;
                                          });
                                        }}
                                      />
                                    </div>
                                    <div className="min-w-[42px] text-right" title="Total for this item (ราคารวมรายการนี้)">
                                      <span className="text-xs font-black text-amber-400">
                                        ฿{safeCeil((item.price || 0) * (item.quantity || 0)).toLocaleString()}
                                      </span>
                                    </div>
                                    {!isCartLocked && (
                                      <button
                                        type="button"
                                        className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-red-400 transition-colors cursor-pointer shrink-0 animate-in fade-in"
                                        onClick={() => {
                                          setDialogCart(prev => {
                                            const updated = prev.filter(it => it.id !== item.id);
                                            const totalSum = updated.reduce((acc, it) => acc + safeCeil((it.price || 0) * (it.quantity || 0)), 0);
                                            setLaundryPrice(totalSum);
                                            return updated;
                                          });
                                        }}
                                      >
                                        <Trash2 size={11} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))
                            ) : isCartLocked ? (
                                <div className="h-full flex flex-col items-center justify-center p-4 bg-slate-800/40 rounded-xl border border-dashed border-slate-700/50 text-center text-slate-400">
                                  {isPaidJob ? (
                                    <>
                                      <CheckCircle2 size={24} className="text-emerald-500 mb-1.5" />
                                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-300">
                                        {currentLanguage === "en" ? "Order Already Paid" : "ออเดอร์นี้ชำระเงินแล้ว"}
                                      </span>
                                    </>
                                  ) : isShiftFromPreviousDay ? (
                                    <>
                                      <ShieldAlert size={24} className="text-rose-400 mb-1.5 animate-bounce" />
                                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-rose-300">
                                        {currentLanguage === "en" ? "Cross-Day Shift: Please Close First" : "มีกะค้างจากวันก่อน กรุณาปิดกะก่อน"}
                                      </span>
                                    </>
                                  ) : (
                                    <>
                                      <PackageOpen size={24} className="text-slate-600 mb-1.5" />
                                      <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                                        {currentLanguage === "en" ? "No Active Shift" : "ไม่มีรอบกะที่รันอยู่"}
                                      </span>
                                    </>
                                  )}
                                </div>
                            ) : (
                              <div className="h-full flex flex-col items-center justify-center p-4 bg-slate-800/20 rounded-xl border border-dashed border-slate-700/30 text-center text-slate-500">
                                <PackageOpen size={20} className="mb-1" />
                                <span className="text-[10px] italic">
                                  {currentLanguage === "en" ? "No items selected" : "ไม่มีสินค้าในตะกร้า"}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Summary and Controls (Bottom Section) */}
                        <div className="border-t border-slate-800/90 pt-1.5 flex flex-col gap-1.5 shrink-0">
                          {/* Service Speed - Modern 3-Segment Pill Group */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="flex items-center gap-1 text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                                <Zap size={11} className="text-amber-400" />
                                Service Speed
                              </Label>
                              {serviceSpeed !== "standard" && (
                                <span className="text-[10px] font-bold text-amber-300">
                                  +฿{(serviceSpeed === 'express_50' ? Math.ceil(currentLaundryPrice * 0.5) : currentLaundryPrice).toFixed(0)} ({serviceSpeed === 'express_50' ? '+50%' : '+100%'})
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
                              {[
                                { id: "standard", label: "Standard", extra: "" },
                                { id: "express_50", label: "Exp 50%", extra: "+50%" },
                                { id: "express_100", label: "Exp 100%", extra: "+100%" },
                              ].map(spd => (
                                <button
                                  key={spd.id}
                                  type="button"
                                  disabled={isPaidJob}
                                  onClick={() => handleServiceOrSpeedChange(serviceType, spd.id as any, serviceWeight)}
                                  className={`py-1 text-[10.5px] font-bold rounded-lg transition-all cursor-pointer ${
                                    serviceSpeed === spd.id
                                      ? (spd.id === "standard" ? "bg-indigo-600 text-white shadow-xs" : spd.id === "express_50" ? "bg-amber-500 text-slate-950 shadow-xs font-black" : "bg-rose-600 text-white shadow-xs font-black")
                                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                                  } ${isPaidJob ? "opacity-60 cursor-not-allowed" : ""}`}
                                >
                                  {spd.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {clothingItems.other.selected && !(isPosEnabled && dialogCart.length > 0) && (
                            <div className="flex justify-between items-center mt-1 p-2 rounded-xl bg-slate-800/70 border border-amber-500/30 animate-in fade-in duration-200">
                              <Label className="text-xs font-medium text-amber-300 flex items-center gap-1">
                                Other Price ({otherClothingName.trim() || 'Specify'})
                              </Label>
                              <div className="relative w-24">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">฿</span>
                                <Input 
                                  type="number"
                                  className="h-7 pl-6 pr-2 bg-slate-900 border-amber-500/50 text-amber-300 font-bold text-right text-xs rounded-lg focus:border-amber-400"
                                  value={otherClothingPrice || ""}
                                  onChange={e => setOtherClothingPrice(parseFloat(e.target.value) || 0)}
                                  placeholder="0"
                                />
                              </div>
                            </div>
                          )}

                          {/* Logistics & Commission Info */}
                          {(isPickup || isDelivery) && (
                            <div className="flex justify-between items-center text-[9.5px] bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/80 animate-in fade-in duration-200">
                              <div className="flex items-center gap-1.5 text-slate-300">
                                <Truck size={12} className="text-sky-400" />
                                <span className="text-slate-400 font-bold">Route:</span>
                                {isPickup && <span>Pickup {pickupDist} km (×2)</span>}
                                {isPickup && isDelivery && <span className="text-slate-600">/</span>}
                                {isDelivery && <span>Delivery {deliveryDist} km</span>}
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-slate-400 font-bold">Rider:</span>
                                {(() => {
                                  const targetCustomer = selectedProfileCustomer || (editingJobId && activeJob ? findMatchingCustomer(customers, { customerId: activeJob.customerId, customerName: activeJob.customerName, customerPhone: activeJob.customerPhone }) : null);
                                  const comm = calculateRiderCommission({
                                    customer: targetCustomer,
                                    isPickup,
                                    pickupDist,
                                    isDelivery,
                                    deliveryDist,
                                    systemSettings,
                                    isVIP: Boolean(selectedVIPLabel),
                                    isFreeDelivery: activeIsFreeDelivery,
                                    isRewash: isRewashJob,
                                    noRiderCommission,
                                  });
                                  const pVal = (isRewashJob || noRiderCommission)
                                    ? 0
                                    : ((editingJobId && activeJob && (activeJob.status === 'billing' || activeJob.status === 'delivery' || activeJob.status === 'completed') && (activeJob.pickupCommission ?? 0) > 0)
                                      ? (activeJob.pickupCommission ?? 0)
                                      : comm.pickupCommission);
                                  const dVal = (isRewashJob || noRiderCommission)
                                    ? 0
                                    : ((editingJobId && activeJob && activeJob.status === 'completed' && (activeJob.deliveryCommission ?? 0) > 0)
                                      ? (activeJob.deliveryCommission ?? 0)
                                      : comm.deliveryCommission);
                                  const totalComm = (isRewashJob || noRiderCommission) ? 0 : (comm.isCorporateRule ? (pVal + dVal) : (selectedVIPLabel || activeIsFreeDelivery ? 0 : (pVal + dVal)));
                                  return (
                                    <>
                                      <span className={`font-extrabold ${(isRewashJob || noRiderCommission) ? "text-rose-400" : "text-amber-400"}`}>฿{totalComm.toFixed(0)}</span>
                                      {comm.isCorporateRule && !isRewashJob && !noRiderCommission && (
                                        <span className="text-[8px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 rounded font-bold">
                                          Corp
                                        </span>
                                      )}
                                      {(isRewashJob || noRiderCommission) && (
                                        <span className="text-[8px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1 rounded font-bold">
                                          No Comm
                                        </span>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          )}

                          {/* Free Delivery & No Rider Commission Row */}
                          {(isPickup || isDelivery) && (
                            <div className="flex justify-between items-center text-[10px] px-1 py-0.5 animate-in fade-in duration-200 gap-2 flex-wrap">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                 <Label className={`flex items-center gap-1 text-slate-300 select-none ${hasPackage || isPaidJob || isRewashJob ? 'opacity-75 cursor-not-allowed' : 'cursor-pointer'}`}>
                                    <input 
                                      type="checkbox" 
                                      disabled={hasPackage || isPaidJob || isRewashJob}
                                      checked={activeIsFreeDelivery} 
                                      onChange={(e) => setIsFreeDelivery(e.target.checked)} 
                                      className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500 h-3 w-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <span className="font-bold">Free Delivery</span>
                                  </Label>
                                  <Label
                                    className={`flex items-center gap-1 select-none px-1.5 py-0.2 rounded border transition-colors ${
                                      isRewashJob || noRiderCommission
                                        ? "bg-rose-950/70 border-rose-600/60 text-rose-300"
                                        : "border-slate-700/70 bg-slate-800/40 text-slate-300 hover:text-rose-300"
                                    } ${isRewashJob ? "opacity-80 cursor-not-allowed" : "cursor-pointer"}`}
                                    title="งดคิดค่าคอมมิชชั่นไรเดอร์สำหรับงานรับ-ส่งนี้ (No Rider Commission for Rewash or Other Assignments)"
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={isRewashJob}
                                      checked={Boolean(noRiderCommission || isRewashJob)}
                                      onChange={(e) => setNoRiderCommission(e.target.checked)}
                                      className="rounded border-slate-600 bg-slate-900 text-rose-500 focus:ring-rose-500 h-3 w-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                    <span className="font-bold text-[9.5px]">{currentLanguage === "en" ? "No Rider Comm" : "งดค่าคอมไรเดอร์"}</span>
                                  </Label>
                              </div>
                              <div className="text-right select-none">
                                {activeIsFreeDelivery && <span className="text-[9px] line-through text-slate-500 mr-1.5">฿{baseFee.toFixed(0)}</span>}
                                <span className={`text-[11px] font-black ${activeIsFreeDelivery ? 'text-emerald-400' : 'text-slate-200'}`}>Fee: ฿{fee.toFixed(0)}</span>
                              </div>
                            </div>
                          )}

                          {/* Discount % Input */}
                          {showDialogDiscount && (
                            <div className="flex justify-between items-center text-xs py-1 border-t border-slate-800">
                              <span className="font-bold text-slate-300 uppercase">{currentLanguage === "en" ? "Discount (%)" : "ส่วนลด (%)"}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="any"
                                  placeholder="0"
                                  disabled={isPaidJob}
                                  className="h-6 w-14 text-[10px] font-bold bg-slate-800 border border-slate-650 rounded-md outline-none focus:border-indigo-500 text-center text-white disabled:opacity-50 disabled:cursor-not-allowed"
                                  value={dialogDiscountPercent || ""}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (isNaN(val)) {
                                      setDialogDiscountPercent(0);
                                    } else {
                                      setDialogDiscountPercent(Math.max(0, Math.min(100, val)));
                                    }
                                  }}
                                />
                                {dialogDiscountAmount > 0 && (
                                  <span className="font-bold text-rose-450">
                                    -฿{dialogDiscountAmount.toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Promo Code Row */}
                          {showDialogDiscount && (
                            <div className="border-t border-slate-800 py-1.5 space-y-1">
                              {!isPaidJob ? (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">Promo</span>
                                    <input
                                      type="text"
                                      placeholder="กรอกโค้ดส่วนลด"
                                      value={promoCodeInput}
                                      onChange={(e) => {
                                        setPromoCodeInput(e.target.value.toUpperCase());
                                        if (appliedPromo) { setAppliedPromo(null); setPromoError(null); }
                                      }}
                                      onKeyDown={(e) => { if (e.key === "Enter") handleApplyPromo(); }}
                                      className="flex-1 h-6 text-[10px] font-bold bg-slate-800 border border-slate-650 rounded-md outline-none focus:border-amber-400 text-center text-white placeholder:text-slate-600 uppercase"
                                    />
                                    <button
                                      type="button"
                                      onClick={handleApplyPromo}
                                      disabled={promoLoading || !promoCodeInput.trim()}
                                      className="h-6 px-2 text-[9px] font-black rounded-md bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
                                    >
                                      {promoLoading ? "..." : "Apply"}
                                    </button>
                                    {dialogAvailableCoupons.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setCustomerVouchersModalOpen(true)}
                                        className="h-6 px-1.5 text-[9px] font-bold rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors shadow-2xs"
                                        title="คลิกเพื่อดูและเลือก Voucher ทั้งหมดของลูกค้า"
                                      >
                                        <Ticket size={11} className="text-amber-400" />
                                        <span>Voucher ({dialogAvailableCoupons.length})</span>
                                      </button>
                                    )}
                                    {(appliedPromo || !!promoCodeInput.trim()) && (
                                      <button
                                        type="button"
                                        onClick={() => { setAppliedPromo(null); setPromoCodeInput(""); setPromoError(null); }}
                                        className="h-6 w-6 flex items-center justify-center rounded-md bg-slate-700 hover:bg-rose-900 text-slate-400 hover:text-rose-400 transition-colors text-xs font-black cursor-pointer shrink-0"
                                        title="ลบโค้ด"
                                      >✕</button>
                                    )}
                                  </div>
                                  {appliedPromo && (
                                    <div className="flex justify-between items-center">
                                      <span className="text-[9px] text-amber-400 font-bold">
                                        🎟 {appliedPromo.code} {appliedPromo.discountTarget === "DELIVERY" ? (currentLanguage === "en" ? "(Delivery)" : "(ค่าส่ง)") : ""} {appliedPromo.discountType === "PERCENTAGE" ? `(${appliedPromo.discountValue}%${appliedPromo.maxDiscount ? ` max ฿${appliedPromo.maxDiscount}` : ""})` : ""}
                                      </span>
                                      <span className="text-[10px] font-black text-rose-400">-฿{promoDiscountAmount.toFixed(2)}</span>
                                    </div>
                                  )}
                                  {promoError && !appliedPromo && (
                                    <p className="text-[9px] text-rose-400 font-bold">{promoError}</p>
                                  )}
                                </>
                              ) : (
                                appliedPromo && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-[9px] text-amber-400 font-bold">
                                      🎟 {appliedPromo.code} {appliedPromo.discountTarget === "DELIVERY" ? (currentLanguage === "en" ? "(Delivery)" : "(ค่าส่ง)") : ""}
                                    </span>
                                    <span className="text-[10px] font-black text-rose-400">-฿{promoDiscountAmount.toFixed(2)}</span>
                                  </div>
                                )
                              )}
                            </div>
                          )}

                          {/* VAT Row */}
                          {dialogVatType === "exclusive" && dialogVatRate > 0 && (
                            <div className="flex justify-between text-xs font-semibold text-slate-400 py-0.5 border-t border-slate-800">
                              <span>VAT ({dialogVatRate}%)</span>
                              <span className="font-bold text-white">+฿{dialogVatAmount.toFixed(2)}</span>
                            </div>
                          )}

                          {dialogVatType === "inclusive" && dialogVatRate > 0 && (
                            <div className="flex justify-between text-xs font-bold text-emerald-400 py-0.5 border-t border-slate-800">
                              <span>
                                {currentLanguage === "en" ? `Incl. VAT ${dialogVatRate}%` : `รวม VAT ${dialogVatRate}%`}
                              </span>
                              <span>฿{dialogVatAmount.toFixed(2)}</span>
                            </div>
                          )}

                          {/* Grand Total Box */}
                          <div className="flex justify-between items-center bg-slate-950/90 px-3 py-2 rounded-xl border border-slate-800">
                            <div className="flex items-center gap-2 select-none">
                              <span className="text-xs font-extrabold text-slate-300 uppercase tracking-wide">Grand Total</span>
                              <label className="flex items-center gap-1 cursor-pointer text-[10px] text-slate-400 hover:text-white font-bold transition-colors">
                                <input
                                  type="checkbox"
                                  disabled={isPaidJob}
                                  className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500 h-3 w-3 cursor-pointer disabled:opacity-50"
                                  checked={showDialogDiscount}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setShowDialogDiscount(checked);
                                    if (!checked) {
                                      setDialogDiscountPercent(0);
                                      setAppliedPromo(null);
                                      setPromoCodeInput("");
                                      setPromoError(null);
                                    }
                                  }}
                                />
                                <span>{currentLanguage === "en" ? "Discount" : "ส่วนลด"}</span>
                              </label>
                            </div>
                            <span className="text-2xl font-black text-indigo-400">
                              ฿{dialogTotal.toLocaleString(undefined, {
                                minimumFractionDigits: dialogVatType === "exclusive" || dialogTotal % 1 !== 0 ? 2 : 0,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>

                          {/* Payment Section: Row 1 (Channel & Bill No), Row 2 (CSO & SHOP Statuses) */}
                          <div className="space-y-1.5 pt-1 border-t border-slate-800">
                            {/* Row 1: Payment Channel + Bill No. */}
                            <div className="grid grid-cols-2 gap-2">
                              {/* Col 1: Payment Channel */}
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <Label htmlFor="payment-channel" className="flex items-center gap-1 text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                                    <CreditCard size={11} className="text-slate-400" />
                                    Channel
                                  </Label>
                                  {!isPaidJob && (
                                    <button
                                      type="button"
                                      onClick={() => setShowSplitPaymentDialog(true)}
                                      className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 transition-colors cursor-pointer"
                                      title="Split Payment"
                                    >
                                      <Split size={10} />
                                      <span>Split</span>
                                    </button>
                                  )}
                                </div>
                                <select
                                  id="payment-channel"
                                  disabled={forceMemberPaymentDialog || isPaidJob || isRewashJob}
                                  className="flex h-8 w-full rounded-xl border border-slate-700 bg-slate-800/90 text-white px-2.5 py-0 text-xs font-medium focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                                  value={isRewashJob ? "Rewash / No Charge" : (forceMemberPaymentDialog ? "Deduct Member" : paymentChannel)}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "Split Payment") {
                                      setPaymentChannel("Split Payment");
                                      setShowSplitPaymentDialog(true);
                                    } else {
                                      setPaymentChannel(val);
                                      setSplitPayments([]);
                                    }
                                  }}
                                >
                                  <option value="">Select Channel</option>
                                  {isRewashJob && (
                                    <option value="Rewash / No Charge">Rewash / No Charge (฿0)</option>
                                  )}
                                  {paymentChannel && paymentChannel !== "Split Payment" && !activePaymentChannels.some(c => c.name === paymentChannel) && (
                                    <option value={paymentChannel}>{paymentChannel}</option>
                                  )}
                                  {activePaymentChannels.map((c) => (
                                    <option key={c.id} value={c.name}>
                                      {c.name}
                                    </option>
                                  ))}
                                  <option value="Split Payment">Split Payment</option>
                                </select>
                                {paymentChannel === "Split Payment" && splitPayments.length >= 2 && (
                                  <div className="mt-1 p-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/50 text-[9px] space-y-1 shadow-sm">
                                    <div className="flex items-center justify-between text-indigo-300 font-bold border-b border-indigo-800/50 pb-0.5">
                                      <span className="flex items-center gap-1">
                                        <Split size={10} className="text-indigo-400" />
                                        แบ่งชำระ {splitPayments.length} ช่องทาง
                                      </span>
                                      {!isPaidJob && (
                                        <button
                                          type="button"
                                          onClick={() => setShowSplitPaymentDialog(true)}
                                          className="text-[8.5px] text-indigo-300 hover:text-white underline cursor-pointer"
                                        >
                                          แก้ไขยอด
                                        </button>
                                      )}
                                    </div>
                                    <div className="space-y-0.5">
                                      {splitPayments.map((sp, idx) => (
                                        <div key={sp.id || idx} className="flex justify-between items-center text-slate-300">
                                          <span className="text-[9px] text-slate-400">{sp.channel}</span>
                                          <span className="font-mono font-bold text-white text-[9.5px]">฿{Number(sp.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {editingJobId && !isPaidJob && dialogTotal > 0 && (paymentChannel?.toLowerCase().includes("gateway") || paymentChannel?.toLowerCase().includes("beam")) && (
                                  <button
                                    type="button"
                                    disabled={isStartingBeamPayment}
                                    onClick={handleOpenBeamPaymentFromDialog}
                                    className="mt-1 w-full flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9.5px] cursor-pointer shadow-xs transition-colors disabled:opacity-50"
                                    title="สร้างลิงก์ / QR Code จ่ายเงินออนไลน์ผ่าน Beam"
                                  >
                                    <Zap size={11} className="fill-white" />
                                    <span>Beam Payment (฿{dialogTotal.toLocaleString()})</span>
                                  </button>
                                )}
                                {selectedProfileCustomer?.isMember && (
                                  <div className="mt-0.5 flex items-center justify-between text-[8.5px] px-1.5 py-0.5 rounded-lg bg-slate-950/80 border border-slate-700/50" title="ยอดเงินใน Wallet ปัจจุบัน">
                                    <span className="text-slate-400 flex items-center gap-0.5"><Wallet size={9} className={(selectedProfileCustomer.creditBalance || 0) < 0 ? "text-rose-400" : "text-emerald-400"} /> Wallet:</span>
                                    <span className={`font-bold ${(selectedProfileCustomer.creditBalance || 0) < 0 ? "text-rose-400 font-extrabold" : (selectedProfileCustomer.creditBalance || 0) >= dialogTotal ? "text-emerald-400" : "text-amber-400"}`}>
                                      {formatBaht(selectedProfileCustomer.creditBalance || 0)}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Col 2: Bill No. */}
                              <div className="space-y-1">
                                <Label htmlFor="pos-bill-no" className="flex items-center gap-1 text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                                  <Receipt size={11} className="text-amber-400" />
                                  Bill No.
                                </Label>
                                <Input
                                  id="pos-bill-no"
                                  value={billNo}
                                  onChange={(e) => setBillNo(e.target.value)}
                                  placeholder="e.g. B-1024"
                                  className="h-8 w-full rounded-xl border-slate-700 bg-slate-800/90 text-white px-2.5 py-0 text-xs font-mono font-bold placeholder:text-slate-500 focus-visible:ring-indigo-500"
                                />
                              </div>
                            </div>

                            {/* Row 2: CSO Status & SHOP Status */}
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              {/* Col 1: CSO Status */}
                              {!isWalkIn ? (
                                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
                                  <div className="flex items-center justify-between">
                                    <Label className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                      CSO
                                    </Label>
                                    <span className={`text-[8.5px] font-black px-1.5 py-0.2 rounded border ${
                                      paymentMethod === 'paid' 
                                        ? 'bg-emerald-950/90 text-emerald-400 border-emerald-700/70 shadow-sm' 
                                        : 'bg-amber-950/90 text-amber-400 border-amber-700/70'
                                    }`}>
                                      {paymentMethod === 'paid' ? '✓ PAID' : 'UNPAID'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Label className={`flex items-center gap-1 text-[10px] ${
                                      isPaidJob 
                                        ? (paymentMethod === 'unpaid' ? 'text-amber-300 font-bold' : 'text-slate-500 opacity-40') 
                                        : (isCsoOrAdmin ? 'cursor-pointer text-slate-200' : 'cursor-not-allowed text-slate-400')
                                    }`}>
                                      <input
                                        type="radio"
                                        name="payment-status"
                                        disabled={isPaidJob}
                                        checked={paymentMethod === 'unpaid'}
                                        onChange={() => { if (isCsoOrAdmin) setPaymentMethod('unpaid'); }}
                                        onClick={(e) => { if (!isCsoOrAdmin) e.preventDefault(); }}
                                        className="w-3 h-3 text-indigo-500 focus:ring-indigo-500 bg-slate-800 border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                      />
                                      <span className={paymentMethod === 'unpaid' ? 'font-bold' : 'font-medium'}>Unpaid</span>
                                    </Label>
                                    <Label className={`flex items-center gap-1 text-[10px] ${
                                      isPaidJob 
                                        ? (paymentMethod === 'paid' ? 'text-emerald-400 font-black' : 'text-slate-500 opacity-40') 
                                        : (isCsoOrAdmin && !isWalletBlocked ? 'cursor-pointer text-emerald-400 font-medium' : 'cursor-not-allowed opacity-50')
                                    }`}>
                                      <input
                                        type="radio"
                                        name="payment-status"
                                        disabled={isPaidJob || isWalletBlocked}
                                        checked={paymentMethod === 'paid'}
                                        onChange={() => { if (isCsoOrAdmin && !isWalletBlocked) setPaymentMethod('paid'); }}
                                        onClick={(e) => { if (!isCsoOrAdmin || isWalletBlocked) e.preventDefault(); }}
                                        className="w-3 h-3 text-emerald-500 focus:ring-emerald-500 bg-slate-800 border-slate-600 disabled:cursor-not-allowed cursor-pointer"
                                      />
                                      <span className={paymentMethod === 'paid' ? 'font-black text-emerald-400' : 'font-medium text-slate-400'}>
                                        {isPaidJob && paymentMethod === 'paid' ? '✓ Paid' : 'Paid'}
                                      </span>
                                    </Label>
                                  </div>
                                </div>
                              ) : <div />}

                              {/* Col 2: Shop Status (isShopPaid) */}
                              <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                  <Label className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                                    SHOP
                                  </Label>
                                  <span className={`text-[8.5px] font-black px-1.5 py-0.2 rounded border ${
                                    isRewashJob
                                      ? 'bg-cyan-950/90 text-cyan-300 border-cyan-600/70 shadow-sm'
                                      : isPaidJob || (editingJobId ? Boolean(jobs.find(j => j.id === editingJobId)?.isShopPaid) : false)
                                        ? 'bg-emerald-950/90 text-emerald-400 border-emerald-700/70 shadow-sm' 
                                        : 'bg-amber-950/90 text-amber-400 border-amber-700/70'
                                  }`}>
                                    {isRewashJob ? '✓ REWASH ฿0' : (isPaidJob || (editingJobId ? Boolean(jobs.find(j => j.id === editingJobId)?.isShopPaid) : false) ? '✓ PAID' : 'UNPAID')}
                                  </span>
                                </div>
                                <div className="flex items-center mt-1">
                                  <span className={`text-[10px] ${
                                    isRewashJob
                                      ? 'font-black text-cyan-300'
                                      : isPaidJob || (editingJobId ? Boolean(jobs.find(j => j.id === editingJobId)?.isShopPaid) : false)
                                        ? 'font-black text-emerald-400' 
                                        : 'font-medium text-slate-400'
                                  }`}>
                                    {isRewashJob
                                      ? (currentLanguage === "en" ? "✓ No Charge (Ready to Close)" : "✓ เคลมฟรี ฿0 (ปิดงานได้ทันที)")
                                      : isPaidJob || (editingJobId ? Boolean(jobs.find(j => j.id === editingJobId)?.isShopPaid) : false)
                                        ? '✓ Paid via POS' 
                                        : (currentLanguage === "en" ? "Press [Pay] to complete" : "กด [Pay] เพื่อรับเงิน")}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Wallet Expired Warning Banner */}
                          {paymentChannel === "Deduct Member" && selectedProfileCustomer?.isMember && !isPaidJob && isCustomerWalletExpired && (
                            <div className="mt-1 p-2 rounded-xl bg-rose-950/90 border border-rose-700 text-[10px] flex items-center justify-between gap-2 text-rose-200 font-bold shadow-md">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <AlertTriangle size={13} className="text-rose-400 shrink-0" />
                                <div className="min-w-0">
                                  <p className="truncate text-rose-300">
                                    ⚠️ Wallet หมดอายุแล้ว {selectedProfileCustomer.memberExpiryDate ? `(${format(new Date(selectedProfileCustomer.memberExpiryDate), "dd/MM/yyyy")})` : ""}
                                  </p>
                                  <p className="text-[9px] text-rose-400 font-normal truncate">
                                    ยอดคงเหลือ {formatBaht(selectedProfileCustomer.creditBalance || 0)} ถูกระงับชั่วคราว
                                  </p>
                                </div>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setTopUpCustomer(selectedProfileCustomer);
                                  setShowTopUpDialog(true);
                                }}
                                className="h-6 px-2 text-[9px] bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold shrink-0 gap-1 shadow cursor-pointer"
                              >
                                <Wallet size={10} />
                                Top Up ต่ออายุ
                              </Button>
                            </div>
                          )}

                          {/* Wallet Insufficient Warning Banner */}
                          {paymentChannel === "Deduct Member" && selectedProfileCustomer?.isMember && !isPaidJob && !isCustomerWalletExpired && (selectedProfileCustomer.creditBalance || 0) < dialogTotal && (
                            <div className="mt-1 p-2 rounded-xl bg-rose-950/80 border border-rose-800 text-[10px] space-y-1">
                              <div className="flex items-center justify-between text-rose-300 font-bold">
                                <span className="flex items-center gap-1">
                                  <Wallet size={11} className="text-rose-400" />
                                  <span>ยอดเงินใน Wallet ไม่พอ</span>
                                </span>
                                <span className="font-mono text-rose-200">
                                  ขาดอีก ฿{(dialogTotal - (selectedProfileCustomer.creditBalance || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              {(selectedProfileCustomer.creditBalance || 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const walletBal = Math.max(0, selectedProfileCustomer.creditBalance || 0);
                                    const rem = Math.max(0, Math.round((dialogTotal - walletBal) * 100) / 100);
                                    setSplitPayments([
                                      { id: "split-1", channel: "Deduct Member", amount: walletBal },
                                      { id: "split-2", channel: "Transfer / QR", amount: rem },
                                    ]);
                                    setPaymentChannel("Split Payment");
                                    setShowSplitPaymentDialog(true);
                                  }}
                                  className="w-full py-1 px-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[9px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow"
                                >
                                  <Split size={10} />
                                  <span>แบ่งจ่ายทันที: Wallet (฿{(selectedProfileCustomer.creditBalance || 0).toLocaleString()}) + โอน</span>
                                </button>
                              )}
                            </div>
                          )}

                          {paymentChannel === "Split Payment" && selectedProfileCustomer?.isMember && !isPaidJob && splitMemberDeductAmt > (selectedProfileCustomer.creditBalance || 0) && (
                            <div className="mt-1 p-2 rounded-xl bg-rose-950/80 border border-rose-800 text-[10px] flex items-center justify-between text-rose-300 font-bold">
                              <span className="flex items-center gap-1">
                                <Wallet size={11} className="text-rose-400" />
                                <span>ยอดแบ่งจ่าย Wallet เกินยอดคงเหลือ</span>
                              </span>
                              <span className="font-mono text-rose-200">
                                มี {formatBaht(selectedProfileCustomer.creditBalance || 0)} (ตัด ฿{splitMemberDeductAmt.toLocaleString()})
                              </span>
                            </div>
                          )}

                          {/* Consolidated Checkout Buttons */}
                          <div className="flex gap-2 mt-1 pt-1.5 border-t border-slate-800 select-none">
                            <Button 
                              type="button"
                              variant="outline"
                              disabled={dialogCart.length === 0 && (dialogTotal || 0) <= 0}
                              onClick={() => {
                                const cartHash = computeCartHash({
                                  items: dialogCart,
                                  serviceSpeed,
                                  fee,
                                  discountPercent: showDialogDiscount ? dialogDiscountPercent : 0,
                                  promoCode: appliedPromo?.code || promoCodeInput.trim() || null,
                                  promoDiscount: appliedPromo ? promoDiscountAmount : 0,
                                  vatType: dialogVatType,
                                  vatRate: dialogVatRate,
                                });

                                const cleanOriginalId = editingJobId ? formatJobDisplayId(editingJobId).replace(/^RF-/i, "") : "";
                                let targetProformaNum = proformaReceiptNumber ? cleanProformaNumber(proformaReceiptNumber) : null;
                                if (editingJobId && editingJobId.startsWith("RF-")) {
                                  targetProformaNum = targetProformaNum || (cleanOriginalId ? `PR-${cleanOriginalId}` : generateProformaBaseNumber(editingJobId));
                                }
                                let targetRevision = proformaRevision;

                                if (!targetProformaNum || targetProformaNum === "DRAFT" || targetRevision === null) {
                                  if (editingJobId) {
                                    targetProformaNum = generateProformaBaseNumber(editingJobId);
                                    targetRevision = editingJobId.startsWith("RF-") ? 1 : 0;
                                    setProformaReceiptNumber(targetProformaNum);
                                    setProformaRevision(targetRevision);
                                    setLastProformaCartHash(cartHash);
                                    jobStore.updateJobDetails(editingJobId, {
                                      proformaNumber: targetProformaNum,
                                      proformaRevision: targetRevision,
                                      proformaCartHash: cartHash,
                                    } as any);
                                  } else {
                                    targetProformaNum = "DRAFT";
                                    targetRevision = 0;
                                    setProformaReceiptNumber("DRAFT");
                                    setProformaRevision(0);
                                    setLastProformaCartHash(cartHash);
                                  }
                                } else {
                                  const currentEditingJob = editingJobId ? jobs.find(j => j.id === editingJobId) : null;
                                  const rawHash = (currentEditingJob as any)?.proformaCartHash;
                                  const validHash = rawHash && rawHash.includes('"speed":') ? rawHash : null;
                                  const baseHash = validHash || lastProformaCartHash;
                                  const isCartChanged = Boolean(baseHash ? (cartHash !== baseHash) : (Math.abs((currentEditingJob?.totalAmount || 0) - dialogTotal) > 0.01));
                                  if (isCartChanged) {
                                    targetRevision = (proformaRevision !== null ? proformaRevision : (editingJobId?.startsWith("RF-") ? 1 : 0)) + 1;
                                    setProformaRevision(targetRevision);
                                    setLastProformaCartHash(cartHash);
                                    if (editingJobId) {
                                      jobStore.updateJobDetails(editingJobId, {
                                        proformaNumber: targetProformaNum,
                                        proformaRevision: targetRevision,
                                        proformaCartHash: cartHash,
                                      } as any).then((confirmed) => {
                                        if (confirmed?.updatedAt && originalJobRef.current) {
                                          (originalJobRef.current as any).updatedAt = confirmed.updatedAt;
                                        }
                                      });
                                    }
                                  } else if (editingJobId?.startsWith("RF-") && (targetRevision === null || targetRevision === 0)) {
                                    targetRevision = 1;
                                    setProformaRevision(1);
                                  }
                                }

                                setProformaPressedSinceLastEdit(true);
                                setDraftCreatedAt(new Date());
                                setIsDraftPreview(true);
                                setShowReceipt(true);
                              }}
                              className="flex-1 h-9 rounded-xl text-xs font-bold border border-slate-700 bg-slate-800/90 text-slate-200 hover:bg-slate-750 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
                              title={currentLanguage === "en" ? "Preview Proforma Receipt before recording sale" : "ดูตัวอย่างใบรับเงินชั่วคราวก่อนบันทึกการขาย"}
                            >
                              <Eye size={12} />
                              <span>{currentLanguage === "en" ? "Proforma Receipt" : "ใบรับเงินชั่วคราว"}</span>
                            </Button>

                            <Button 
                              type="button"
                              disabled={
                                isSubmitting || 
                                isDetailLoading || 
                                (dialogCart.length === 0 && (dialogTotal || 0) <= 0) || 
                                isCartLocked || 
                                isPaidJob || 
                                (!isWalkIn && paymentMethod !== 'paid') || 
                                (!paymentChannel || !paymentChannel.trim()) || 
                                isWalletInsufficient || 
                                (paymentChannel === "Deduct Member" && isCustomerWalletExpired) ||
                                isSplitAmountInvalid ||
                                (paymentChannel === "Split Payment" && splitPayments.length < 2)
                              }
                              onClick={() => handleCreate(true)}
                              className={`flex-[1.4] h-9 rounded-xl text-xs font-extrabold transition-all shadow-md border-none text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                isPaidJob
                                  ? 'bg-slate-700 text-slate-300'
                                  : isWalletInsufficient || (paymentChannel === "Deduct Member" && isCustomerWalletExpired) || isSplitAmountInvalid
                                    ? 'bg-rose-600/80 hover:bg-rose-600'
                                    : (!isWalkIn && paymentMethod !== 'paid')
                                      ? 'bg-slate-700 text-slate-400'
                                      : 'bg-emerald-600 hover:bg-emerald-500'
                              }`}
                              title={
                                isPaidJob
                                  ? (currentLanguage === "en" ? "Payment Completed" : "บิลนี้ชำระเงินเรียบร้อยแล้ว")
                                  : (paymentChannel === "Deduct Member" && isCustomerWalletExpired)
                                    ? "Wallet หมดอายุแล้ว"
                                    : isWalletInsufficient
                                      ? `ยอดเงินใน Wallet ไม่เพียงพอ (มี ${formatBaht(selectedProfileCustomer?.creditBalance || 0)}, ต้องการ ${formatBaht(dialogTotal)})`
                                      : isSplitAmountInvalid
                                        ? "ยอดแบ่งชำระไม่ตรงกับยอดรวม"
                                        : (paymentChannel === "Split Payment" && splitPayments.length < 2)
                                          ? "กรุณาระบุช่องทางการแบ่งชำระให้ครบ"
                                          : (!isWalkIn && paymentMethod !== 'paid')
                                            ? (currentLanguage === "en" ? "Waiting for CSO verification (CSO Paid)" : "รอ CSO ยืนยันสถานะชำระเงิน (CSO Paid)")
                                            : (!paymentChannel || !paymentChannel.trim())
                                              ? (currentLanguage === "en" ? "Please select payment channel" : "กรุณาเลือกช่องทางการชำระเงิน")
                                              : undefined
                              }
                            >
                              <Banknote size={13} />
                              <span>
                                {isPaidJob
                                  ? (currentLanguage === "en" ? "Paid" : "ชำระเงินแล้ว")
                                  : (paymentChannel === "Deduct Member" && isCustomerWalletExpired)
                                    ? "Wallet หมดอายุ"
                                    : isWalletInsufficient
                                      ? `Wallet ไม่พอ (฿${dialogTotal.toFixed(0)})`
                                      : isSplitAmountInvalid
                                        ? "ยอดแบ่งจ่ายไม่ครบ"
                                        : paymentChannel === "Split Payment" && splitPayments.length >= 2
                                          ? `Pay ฿${dialogTotal.toFixed(2)} (${splitPayments.length} ช่องทาง)`
                                          : `Pay ฿${dialogTotal.toFixed(2)}`}
                              </span>
                            </Button>
                          </div>


                        </div>

                      </div>
                    </motion.div>
  </>
) : (
  <>
                    {/* COL 3: Logistics & Photos */}
                    <motion.div
                      className="col-span-1 flex flex-col gap-1.5 bg-white p-2 rounded-xl border border-slate-200 shadow-sm overflow-y-auto pr-0.5 pb-2 min-w-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15, duration: 0.3 }}
                    >
                      {/* Job Photos Unified Section */}
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm space-y-3">
                        <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2">
                          <Camera size={14} className="text-indigo-600" />
                          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">Job Photos</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Laundry Bags</Label>
                            <MultiImageUploader
                              ref={uploaderRef}
                              entityType="job"
                              entityId={editingJobId || Date.now().toString()}
                              subType="bags"
                              value={bagImageUrls}
                              onValueChange={setBagImageUrls}
                              maxFiles={5}
                              disableDelete={!canDeleteLaundryBags}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Bill / Transfer</Label>
                            <MultiImageUploader
                              ref={billUploaderRef}
                              entityType="job"
                              entityId={editingJobId || Date.now().toString()}
                              subType="bills"
                              value={billImageUrls}
                              onValueChange={setBillImageUrls}
                              maxFiles={10}
                              disableDelete={!isAdmin}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Pickup Proofs</Label>
                            <MultiImageUploader
                              ref={isAdmin ? pickupUploaderRef : undefined}
                              entityType="job"
                              entityId={editingJobId || Date.now().toString()}
                              subType="proofs"
                              value={pickupProofImageUrls}
                              onValueChange={isAdmin ? setPickupProofImageUrls : undefined}
                              maxFiles={isAdmin ? 5 : pickupProofImageUrls.length}
                              readOnly={!isAdmin}
                              disableDelete={!isAdmin}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Delivery Proofs</Label>
                            <MultiImageUploader
                              ref={isAdmin ? deliveryUploaderRef : undefined}
                              entityType="job"
                              entityId={editingJobId || Date.now().toString()}
                              subType="proofs"
                              value={deliveryProofImageUrls}
                              onValueChange={isAdmin ? setDeliveryProofImageUrls : undefined}
                              maxFiles={isAdmin ? 5 : deliveryProofImageUrls.length}
                              readOnly={!isAdmin}
                              disableDelete={!isAdmin}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Laundry Service Type & Speed */}
                      <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm space-y-1.5">
                        <div className={`grid gap-2 ${serviceType === "other" ? "grid-cols-1" : "grid-cols-[1fr_80px]"}`}>
                          <div className="space-y-1">
                            <Label htmlFor="service-select" className="flex items-center gap-1.5 text-xs font-medium">
                              <ArrowDownUp size={14} className="text-purple-600" />
                              Laundry Service Type
                            </Label>
                            <select 
                              id="service-select"
                              className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                              value={serviceType}
                              onChange={(e) => handleServiceOrSpeedChange(e.target.value, serviceSpeed, serviceWeight)}
                            >
                              <option value="" disabled>Select a service</option>
                              {washServices.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                              <option value="other">Other (Custom Price)</option>
                            </select>
                          </div>
                          {serviceType !== "other" && (
                            <div className="space-y-1">
                              <Label htmlFor="service-weight" className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                                Weight (kg)
                              </Label>
                              <Input 
                                id="service-weight"
                                type="number" 
                                min="2"
                                step="0.01"
                                className="h-8 text-xs text-center px-2"
                                value={serviceWeight || ""}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  handleServiceOrSpeedChange(serviceType, serviceSpeed, isNaN(val) ? 0 : val);
                                }}
                                onBlur={() => {
                                  if (serviceWeight < 2) {
                                    handleServiceOrSpeedChange(serviceType, serviceSpeed, 2);
                                  }
                                }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="space-y-1 pt-1 border-t border-slate-100">
                          <Label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">Clothing Types</Label>
                          <div className="grid grid-cols-2 gap-1">
                            {[
                              { id: 'other', label: 'Other (Specify)' },
                              { id: 'polo', label: 'Polo Shirt' },
                              { id: 'tshirt', label: 'T-Shirt' },
                              { id: 'pants', label: 'Pants' },
                              { id: 'dress', label: 'Dress' },
                              { id: 'bedsheet', label: 'Bedsheet' },
                            ].map(item => (
                              <div key={item.id} className="flex flex-col gap-1 col-span-1">
                                <div className="flex items-center gap-2">
                                  <Label className="flex items-center gap-2 cursor-pointer w-full text-xs text-slate-700">
                                    <input 
                                      type="checkbox" 
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 h-3.5 w-3.5 shrink-0"
                                      checked={clothingItems[item.id].selected}
                                      onChange={(e) => setClothingItems(prev => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], selected: e.target.checked }
                                      }))}
                                    />
                                    <span className="truncate">{item.label}</span>
                                  </Label>
                                  {clothingItems[item.id].selected && (
                                    <Input 
                                      type="number" 
                                      min="1"
                                      className="w-12 h-6 text-xs text-center p-1 shrink-0"
                                      value={clothingItems[item.id].quantity}
                                      onChange={(e) => setClothingItems(prev => ({
                                        ...prev,
                                        [item.id]: { ...prev[item.id], quantity: Math.max(1, parseInt(e.target.value) || 1) }
                                      }))}
                                    />
                                  )}
                                </div>
                                {item.id === 'other' && clothingItems[item.id].selected && (
                                  <Input
                                    type="text"
                                    placeholder="Specify item..."
                                    className="h-6 text-xs px-2 w-full mt-0.5"
                                    value={otherClothingName}
                                    onChange={(e) => setOtherClothingName(e.target.value)}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>




                      </div>
                      </motion.div>

                    {/* COL 4: Fulfillment & Summary */}
                    <motion.div
                      className="col-span-1 flex flex-col gap-2 overflow-y-auto pr-0.5 pb-2 min-w-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.3 }}
                    >
                      {/* Summary Card */}
                      <div className="bg-slate-900 text-white rounded-xl p-3 shadow-md shrink-0">
                        {(canSeeStuck || canSeeTaxInvoice) && (
                          <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-700/50">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Job Flags</span>
                            <div className="flex items-center gap-3">
                              {canSeeTaxInvoice && (
                                <Label className={`flex items-center gap-1.5 cursor-pointer select-none transition-colors ${isTaxInvoiceRequested ? 'text-amber-300 font-bold' : 'text-slate-400 hover:text-slate-300'}`}>
                                  <input 
                                    type="checkbox" 
                                    checked={isTaxInvoiceRequested} 
                                    onChange={(e) => setIsTaxInvoiceRequested(e.target.checked)} 
                                    className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                                  />
                                  <FileText size={12} className={isTaxInvoiceRequested ? "text-amber-400" : "text-slate-400"} />
                                  <span className="text-xs font-bold">Req Tax Inv</span>
                                </Label>
                              )}
                              {canSeeStuck && (
                                <Label className="flex items-center gap-1.5 cursor-pointer text-red-400 animate-in fade-in duration-200">
                                  <input 
                                    type="checkbox" 
                                    checked={isStuck} 
                                    onChange={(e) => setIsStuck(e.target.checked)} 
                                    className="rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500 h-3.5 w-3.5"
                                  />
                                  <span className="text-xs font-bold">Stuck</span>
                                </Label>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="flex flex-col gap-1 mb-2 pb-2 border-b border-slate-700">
                          {isPickup && (
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400">Pickup Dist.</span>
                              <span className="font-medium">{pickupDist} km (×2)</span>
                            </div>
                          )}
                          {isDelivery && (
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400">Delivery Dist.</span>
                              <span className="font-medium">{deliveryDist} km</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col mb-3">
                          <div className="flex justify-between items-center mb-1">
                            <Label className="text-xs font-medium text-slate-300">Laundry Price</Label>
                            <div className="relative w-24">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">฿</span>
                              <Input 
                                type="number"
                                className="h-8 pl-6 pr-2 bg-slate-800 border-slate-600 text-white font-bold text-right text-sm"
                                value={laundryPrice || ""}
                                onChange={e => setLaundryPrice(parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </div>
                          <span className="text-[10px] text-indigo-300 font-medium">
                            {(() => {
                              if (serviceType === "other") return "Custom service: Enter price manually";
                              const baseService = services.find(s => s.id === serviceType);
                              if (!baseService) return "Please select a service";
                              let pricePerKg = baseService.price;
                              if (customerPriceListId) {
                                const customPl = priceLists.find(pl => pl.id === customerPriceListId);
                                if (customPl && customPl.servicePrices[serviceType] !== undefined) pricePerKg = customPl.servicePrices[serviceType];
                              } else {
                                const defaultPl = priceLists.find(pl => pl.isDefault);
                                if (defaultPl && defaultPl.servicePrices[serviceType] !== undefined) pricePerKg = defaultPl.servicePrices[serviceType];
                              }
                              const effWeight = Math.max(2, serviceWeight);
                              return `${baseService.name} ${serviceWeight} ${baseService.unit || 'kg'} (${pricePerKg}x${effWeight} = ${Math.ceil(pricePerKg * effWeight)}฿)`;
                            })()}
                          </span>
                          {serviceSpeed !== "standard" && (
                            <div className="flex justify-between items-center mt-2">
                              <span className="text-xs text-orange-300 font-medium">Service Speed ({serviceSpeed === 'express_50' ? '+50%' : '+100%'})</span>
                              <span className="text-sm font-bold text-orange-300">฿{(serviceSpeed === 'express_50' ? Math.ceil(laundryPrice * 0.5) : laundryPrice).toFixed(0)}</span>
                            </div>
                          )}

                          {clothingItems.other.selected && !(isPosEnabled && dialogCart.length > 0) && (
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-700/80 animate-in fade-in duration-200">
                              <Label className="text-xs font-medium text-amber-300 flex items-center gap-1">
                                Other Price ({otherClothingName.trim() || 'Specify'})
                              </Label>
                              <div className="relative w-24">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">฿</span>
                                <Input 
                                  type="number"
                                  className="h-8 pl-6 pr-2 bg-slate-800 border-amber-500/50 text-amber-300 font-bold text-right text-sm focus:border-amber-400"
                                  value={otherClothingPrice || ""}
                                  onChange={e => setOtherClothingPrice(parseFloat(e.target.value) || 0)}
                                  placeholder="0"
                                />
                              </div>
                            </div>
                          )}

                          <div className="space-y-0.5 pt-2 mt-2 border-t border-slate-700">
                            <Label className="flex items-center gap-1 text-[10px] font-medium text-slate-400 uppercase tracking-wider">Service Speed</Label>
                            <div className="flex items-center gap-2">
                              <Label className="flex items-center gap-1 cursor-pointer">
                                <input type="radio" checked={serviceSpeed === "standard"} onChange={() => handleServiceOrSpeedChange(serviceType, "standard", serviceWeight)} className="w-3 h-3 text-indigo-500 focus:ring-indigo-500 bg-slate-800 border-slate-600" />
                                <span className="text-[11px] text-slate-200">Standard</span>
                              </Label>
                              <Label className="flex items-center gap-1 cursor-pointer">
                                <input type="radio" checked={serviceSpeed === "express_50"} onChange={() => handleServiceOrSpeedChange(serviceType, "express_50", serviceWeight)} className="w-3 h-3 text-indigo-500 focus:ring-indigo-500 bg-slate-800 border-slate-600" />
                                <span className="text-[11px] text-slate-200">Exp 50%</span>
                              </Label>
                              <Label className="flex items-center gap-1 cursor-pointer">
                                <input type="radio" checked={serviceSpeed === "express_100"} onChange={() => handleServiceOrSpeedChange(serviceType, "express_100", serviceWeight)} className="w-3 h-3 text-indigo-500 focus:ring-indigo-500 bg-slate-800 border-slate-600" />
                                <span className="text-[11px] text-slate-200">Exp 100%</span>
                              </Label>
                            </div>
                          </div>

                          {isOtherClothingSelected && (
                            <div className="space-y-1 pt-2 border-t border-slate-700">
                              <Label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                                {currentLanguage === "en" ? "Other Price (฿)" : "ราคาอื่นๆ (บาท)"}
                              </Label>
                              <div className="relative w-24">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">฿</span>
                                <Input 
                                  type="number"
                                  className="h-8 pl-6 pr-2 bg-slate-800 border-amber-500/50 text-amber-300 font-bold text-right text-sm focus:border-amber-400"
                                  value={otherClothingPrice || ""}
                                  onChange={e => setOtherClothingPrice(parseFloat(e.target.value) || 0)}
                                  placeholder="0"
                                />
                              </div>
                            </div>
                          )}

                          <div className="flex flex-col gap-2 pt-2 mt-2 border-t border-slate-700">
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-0.5">
                                <Label htmlFor="payment-channel" className="flex items-center gap-1 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                                  <CreditCard size={12} className="text-slate-500" />
                                  Payment Channel
                                </Label>
                                <select
                                  id="payment-channel"
                                  className="flex h-6 w-full rounded border border-slate-600 bg-slate-800 text-white px-1.5 py-0 text-[11px] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                                  value={paymentChannel}
                                  onChange={(e) => setPaymentChannel(e.target.value)}
                                >
                                  <option value="">Select Channel</option>
                                  {paymentChannel && !activePaymentChannels.some(c => c.name === paymentChannel) && (
                                    <option value={paymentChannel}>{paymentChannel}</option>
                                  )}
                                  {activePaymentChannels.map((c) => (
                                    <option key={c.id} value={c.name}>
                                      {c.name}
                                    </option>
                                  ))}
                                </select>
                                {editingJobId && !isPaidJob && dialogTotal > 0 && (paymentChannel?.toLowerCase().includes("gateway") || paymentChannel?.toLowerCase().includes("beam")) && (
                                  <button
                                    type="button"
                                    disabled={isStartingBeamPayment}
                                    onClick={handleOpenBeamPaymentFromDialog}
                                    className="mt-1 w-full flex items-center justify-center gap-1 py-1 px-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[9.5px] cursor-pointer shadow-xs transition-colors disabled:opacity-50"
                                    title="สร้างลิงก์ / QR Code จ่ายเงินออนไลน์ผ่าน Beam"
                                  >
                                    <Zap size={11} className="fill-white" />
                                    <span>Beam Payment (฿{dialogTotal.toLocaleString()})</span>
                                  </button>
                                )}
                              </div>

                              <div className="space-y-0.5">
                                <Label htmlFor="bill-no" className="flex items-center justify-between text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                                  <span className="flex items-center gap-1">
                                    <CreditCard size={12} className="text-slate-500" />
                                    BILL NO.
                                  </span>
                                </Label>
                                <Input
                                  id="bill-no"
                                  value={billNo}
                                  onChange={(e) => setBillNo(e.target.value)}
                                  placeholder="Enter Bill No."
                                  className="h-6 w-full rounded border-slate-600 bg-slate-800 text-white px-1.5 py-0 text-[11px] font-bold focus-visible:ring-indigo-500"
                                />
                              </div>
                            </div>

                            <div className="space-y-0.5">
                              <Label className="flex items-center gap-1 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                                <CreditCard size={12} className="text-slate-500" />
                                Status
                              </Label>
                              <div className="flex items-center gap-2 h-6">
                                <Label className="flex items-center gap-1 cursor-pointer text-[11px]">
                                  <input 
                                    type="radio" 
                                    name="payment-status"
                                    checked={paymentMethod === 'unpaid'} 
                                    onChange={() => setPaymentMethod('unpaid')} 
                                    className="w-3 h-3 text-indigo-500 focus:ring-indigo-500 bg-slate-800 border-slate-600" 
                                  />
                                  <span className="font-medium text-slate-200">Unpaid</span>
                                </Label>
                                <Label className="flex items-center gap-1 cursor-pointer text-[11px]">
                                  <input 
                                    type="radio" 
                                    name="payment-status"
                                    checked={paymentMethod === 'paid'} 
                                    onChange={() => setPaymentMethod('paid')} 
                                    className="w-3 h-3 text-emerald-500 focus:ring-emerald-500 bg-slate-800 border-slate-600" 
                                  />
                                  <span className="font-medium text-emerald-400">Paid</span>
                                </Label>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-end mb-2">
                          <div className="flex flex-col gap-0.5">
                             <Label 
                               className={`flex items-center gap-1 ${isPaidJob ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                               title={isPaidJob ? "งานนี้ชำระเงินแล้ว ไม่สามารถแก้ไขค่าจัดส่งได้" : undefined}
                             >
                                <input 
                                  type="checkbox" 
                                  checked={isFreeDelivery} 
                                  disabled={isPaidJob}
                                  onChange={(e) => { 
                                    if (isPaidJob) return;
                                    setIsFreeDelivery(e.target.checked); 
                                    if (!e.target.checked) setEditingFeeLock(null); 
                                  }} 
                                  className="disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <span className="text-xs text-slate-300">Free Delivery</span>
                              </Label>
                              <span className="text-[10px] text-slate-400 ml-5">Fee: {selectedVIPLabel ? '4' : '10'}฿/km</span>
                          </div>
                          <div className="text-right">
                            {isFreeDelivery && <span className="text-xs line-through text-slate-500 mr-1">฿{baseFee.toFixed(0)}</span>}
                            <span className={`text-sm font-bold ${isFreeDelivery ? 'text-emerald-400' : 'text-slate-300'}`}>฿{fee.toFixed(0)}</span>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-end border-t border-slate-700 pt-2">
                          <span className="text-xs font-bold text-slate-300 uppercase">Grand Total</span>
                          <span className="text-2xl font-black text-indigo-400">฿{(laundryPrice + (serviceSpeed === 'express_50' ? Math.ceil(laundryPrice * 0.5) : (serviceSpeed === 'express_100' ? laundryPrice : 0)) + fee).toFixed(0)}</span>
                        </div>

                        {(isPickup || isDelivery) && (() => {
                          const targetCustomer = selectedProfileCustomer || (activeJob ? findMatchingCustomer(customers, { customerId: activeJob.customerId, customerName: activeJob.customerName, customerPhone: activeJob.customerPhone }) : null);
                          const comm = calculateRiderCommission({
                            customer: targetCustomer,
                            isPickup,
                            pickupDist,
                            isDelivery,
                            deliveryDist,
                            systemSettings,
                            isVIP: Boolean(selectedVIPLabel),
                            isFreeDelivery,
                            isRewash: isRewashJob,
                            noRiderCommission,
                          });
                          const pVal = (isRewashJob || noRiderCommission)
                            ? 0
                            : ((editingJobId && activeJob && (activeJob.status === 'billing' || activeJob.status === 'delivery' || activeJob.status === 'completed') && (activeJob.pickupCommission ?? 0) > 0)
                              ? (activeJob.pickupCommission ?? 0)
                              : comm.pickupCommission);
                          const dVal = (isRewashJob || noRiderCommission)
                            ? 0
                            : ((editingJobId && activeJob && activeJob.status === 'completed' && (activeJob.deliveryCommission ?? 0) > 0)
                              ? (activeJob.deliveryCommission ?? 0)
                              : comm.deliveryCommission);
                          const totalComm = (isRewashJob || noRiderCommission) ? 0 : (comm.isCorporateRule ? (pVal + dVal) : (selectedVIPLabel || isFreeDelivery ? 0 : (pVal + dVal)));

                          return (
                            <div className="flex justify-between items-end mt-3 pt-3 border-t border-slate-700/50">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-amber-400 font-medium">Est. Rider Commission</span>
                                  {comm.isCorporateRule && !isRewashJob && !noRiderCommission && (
                                    <span className="text-[8.5px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 py-0.2 rounded font-bold">
                                      🏢 Corporate
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-500">{comm.ruleLabel}</span>
                                <Label className={`flex items-center gap-1.5 text-[10px] text-slate-300 ${isRewashJob ? "opacity-75 cursor-not-allowed" : "cursor-pointer"}`}>
                                  <input
                                    type="checkbox"
                                    disabled={isRewashJob}
                                    checked={Boolean(noRiderCommission || isRewashJob)}
                                    onChange={(e) => setNoRiderCommission(e.target.checked)}
                                    className="rounded border-slate-600 bg-slate-900 text-rose-500 focus:ring-rose-500 h-3 w-3 cursor-pointer"
                                  />
                                  <span>{currentLanguage === "en" ? "No Rider Commission (฿0)" : "งดคิดค่าคอมไรเดอร์ (฿0)"}</span>
                                </Label>
                              </div>
                              <div className="text-right">
                                <span className={`text-lg font-bold ${(isRewashJob || noRiderCommission) ? "text-rose-400" : "text-amber-400"}`}>
                                  ฿{totalComm.toFixed(0)}
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>



                    </motion.div>
  </>
)}
                  </div>
                  ) : (
                    <div className="h-full w-full bg-slate-50 rounded-xl border border-slate-200 overflow-hidden flex flex-col min-h-0">
                      {hasAccess("activity-logs") ? (
                        <AdminLogs jobId={editingJobId || undefined} />
                      ) : (
                        <div className="p-6 text-center text-slate-500 font-medium">Access Restricted</div>
                      )}
                    </div>
                  )}
                </div>
                
                {!showJobLogs && (
                  <DialogFooter className="mx-0 mb-0 mt-0 px-5 py-3.5 border-t border-slate-200/90 bg-slate-50/60 shrink-0">
                    <div className="flex flex-col w-full gap-2.5">
                      {saveError && !isSubmitting && (
                        <div className="w-full p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs animate-in fade-in">
                          <AlertCircle size={16} className="text-rose-600 mt-0.5 shrink-0" />
                          <div className="flex-1">
                            <p className="font-bold text-rose-700">บันทึกไม่สำเร็จ (Save Failed)</p>
                            <p className="text-rose-600 mt-0.5 text-[11px] leading-relaxed">{saveError}</p>
                          </div>
                          <Button 
                            type="button"
                            size="sm" 
                            variant="outline" 
                            className="border-rose-300 text-rose-700 hover:bg-rose-100 h-7 text-xs font-bold shrink-0 cursor-pointer rounded-lg"
                            onClick={() => { setSaveError(null); handleCreate(false); }}
                          >
                            ลองใหม่อีกครั้ง (Retry)
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-3 w-full flex-wrap">
                        {/* Left: Complete Handover, Rewash, Unlock Paid & Refund Action Buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {editingJobId && activeJob && !isRewashOrNoChargeJob(activeJob) && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleStartRewashFromJob(activeJob)}
                              className="h-9.5 px-3.5 text-xs font-bold gap-1.5 rounded-xl transition-all cursor-pointer shadow-2xs border border-cyan-400 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 hover:text-cyan-900"
                              title="เปิดออเดอร์ใหม่สำหรับซักซ้ำ / เคลมฟรี (฿0 ไม่คิดค่าใช้จ่ายลูกค้า และไม่คิดค่าคอมไรเดอร์) โดยคัดลอกข้อมูลลูกค้าและรายการผ้าจากออเดอร์นี้"
                            >
                              <RotateCcw size={14} className="text-cyan-700" />
                              <span>{currentLanguage === "en" ? "Rewash / Re-process (฿0)" : "เปิดบิลซักซ้ำ / เคลมฟรี (฿0)"}</span>
                            </Button>
                          )}
                          {editingJobId && activeJob && activeJob.status !== 'completed' && activeJob.status !== 'cancel' && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenSplitDelivery(activeJob)}
                              className="h-9.5 px-3.5 text-xs font-bold gap-1.5 rounded-xl transition-all cursor-pointer shadow-2xs border border-purple-400 bg-purple-50 text-purple-800 hover:bg-purple-100 hover:text-purple-900"
                              title="แยกส่งสินค้าบางชิ้นในรอบที่ 2 (เช่น เสื้อผ้าส่งวันนี้ รองเท้าส่งอีก 2-3 วันข้างหน้า) โดยเปิดออเดอร์จัดส่งรอบที่ 2 (฿0 Pre-paid) ให้อัตโนมัติ"
                            >
                              <Split size={14} className="text-purple-700" />
                              <span>{currentLanguage === "en" ? "Split Delivery" : "แยกจัดส่ง (Split Delivery)"}</span>
                            </Button>
                          )}
                          {editingJobId && activeJob?.status === 'delivery' && (isWalkIn && !isDelivery) && (() => {
                            const isPaid = isJobFullyPaid(activeJob);
                            return (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={`h-9.5 px-4 text-xs font-bold gap-1.5 rounded-xl transition-all cursor-pointer shadow-2xs border ${
                                  isPaid
                                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800"
                                    : "border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200"
                                }`}
                                onClick={async () => {
                                  if (!isPaid) {
                                    const breakdown = getJobPaymentBreakdown(activeJob);
                                    const remainingStr = breakdown.isPartial ? ` (คงเหลือ ฿${breakdown.remaining.toLocaleString()})` : '';
                                    toast.error(`ไม่สามารถปิดงานได้: Order #${formatJobDisplayId(editingJobId)} ยังไม่ได้ชำระเงิน${remainingStr} กรุณาบันทึกการชำระเงินก่อน`);
                                    return;
                                  }
                                  try {
                                    const actorDetails = user ? { actorId: user.id, actorName: user.name || user.email, actorRole: user.role } : undefined;
                                    await jobStore.completeJob(editingJobId, undefined, "delivery", actorDetails);
                                    toast.success(`Order #${formatJobDisplayId(editingJobId)}: Customer Picked Up (Completed)`);
                                    setDialogOpen(false);
                                    resetDialogForm();
                                  } catch (e: any) {
                                    toast.error(`ไม่สามารถปิดงานได้: ${e.message}`);
                                  }
                                }}
                                title={isPaid ? "Customer Picked Up - ลูกค้ามารับผ้าแล้ว และเปลี่ยนสถานะเป็น Completed" : "ยังไม่ได้ชำระเงิน - กรุณาบันทึกการชำระเงินก่อนส่งมอบผ้า"}
                              >
                                <CheckCircle2 size={14} className={isPaid ? "text-emerald-600" : "text-slate-400"} />
                                <span>Customer Picked Up</span>
                                {!isPaid && <span className="text-[10px] font-extrabold text-rose-600 ml-0.5">(ยังไม่ชำระ)</span>}
                              </Button>
                            );
                          })()}
                          {editingJobId && activeJob?.refundId && (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
                              <span className="w-2 h-2 rounded-full bg-rose-500" />
                              <span>บิลนี้ผ่านการ Refund & Reissue แล้ว</span>
                            </div>
                          )}
                        </div>

                        {/* Right: Cancel and Save Changes */}
                        <div className="flex items-center gap-2.5 ml-auto">
                          <Button 
                            variant="outline" 
                            className="px-5 h-9.5 rounded-xl font-bold border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer" 
                            onClick={() => { setDialogOpen(false); resetDialogForm(); }} 
                            disabled={isSubmitting}
                          >
                            Cancel
                          </Button>
                          <Button 
                            className="px-6 h-9.5 rounded-xl font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer" 
                            onClick={() => handleCreate(false)}
                            disabled={isSubmitting || isDetailLoading || !customerName || (isPickup && !pickupLoc) || (isDelivery && !deliveryLoc)}
                          >
                            {isSubmitting ? (
                              <>
                                <Loader2 size={16} className="animate-spin mr-2" />
                                Uploading & Saving...
                              </>
                            ) : isDetailLoading ? (
                              <>
                                <Loader2 size={16} className="animate-spin mr-2" />
                                Loading details...
                              </>
                            ) : (
                              editingJobId ? "Save Changes" : "Create Job"
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </DialogFooter>
                )}
                </DialogContent>
              </Dialog>
            )}

            {/* Split Delivery Modal */}
            <Dialog open={splitDeliveryModalOpen} onOpenChange={(open) => {
              if (!isSplittingDelivery) {
                setSplitDeliveryModalOpen(open);
              }
            }}>
              <DialogContent className="sm:max-w-lg w-[95vw] rounded-2xl p-0 overflow-hidden border border-slate-200 shadow-2xl bg-white max-h-[90vh] flex flex-col">
                <DialogHeader className="p-4 bg-gradient-to-r from-purple-700 to-indigo-700 text-white shrink-0">
                  <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
                    <Split size={18} />
                    <span>{currentLanguage === "en" ? "Split Delivery (Multiple Batches)" : "แยกจัดส่งสินค้าตามรอบ (Split Delivery)"}</span>
                  </DialogTitle>
                  <DialogDescription className="text-purple-100 text-xs mt-0.5">
                    {currentLanguage === "en"
                      ? "Select items or laundry bags to deliver in the 2nd batch. A linked ฿0 pre-paid order will be created automatically."
                      : "เลือกสินค้าหรือถุงผ้าที่ต้องการแยกส่งในรอบที่ 2 ระบบจะสร้างออเดอร์จัดส่งรอบ 2 ให้ที่ ฿0 (Pre-paid) ให้อัตโนมัติ"}
                  </DialogDescription>
                </DialogHeader>

                <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
                  {/* Customer & Address Quick Info */}
                  <div className="p-3 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-1">
                    <div className="flex items-center justify-between font-bold text-purple-900">
                      <span className="flex items-center gap-1.5">
                        <User size={13} className="text-purple-600" />
                        <span>{splitTargetJob?.customerName || customerName || "Customer"}</span>
                      </span>
                      <span className="font-mono text-[11px] text-purple-700">{splitTargetJob?.customerPhone || customerPhone}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 flex items-start gap-1">
                      <MapPin size={12} className="text-purple-500 mt-0.5 shrink-0" />
                      <span className="truncate">{splitTargetJob?.dropoffLocation || deliveryLoc || "Delivery Address"}</span>
                    </div>
                  </div>

                  {/* Items list with quantity steppers & Quick Presets */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between font-bold text-slate-700 flex-wrap gap-1">
                      <span>{currentLanguage === "en" ? "Select items or quantity to deliver in Batch 2:" : "เลือกสินค้า/จำนวนที่ต้องการแยกไปส่งในรอบที่ 2:"}</span>
                      <span className="text-[11px] text-purple-600 font-semibold">
                        {currentLanguage === "en"
                          ? `(Batch 1 remains in Order #${formatJobDisplayId(splitTargetJob?.id)})`
                          : `(รอบแรกยังคงอยู่ใน Order #${formatJobDisplayId(splitTargetJob?.id)})`}
                      </span>
                    </div>

                    {/* Quick Presets & Add Custom Item Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={handleSplitPreset50}
                        className="px-2 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-800 text-[10.5px] font-bold transition-colors cursor-pointer shadow-2xs"
                        title={currentLanguage === "en" ? "Split 50% of each item to Batch 2" : "แบ่ง 50% ของแต่ละรายการไปส่งในรอบที่ 2"}
                      >
                        ⚡ {currentLanguage === "en" ? "Split 50% (แบ่งครึ่ง)" : "แบ่ง 50% (Split Half)"}
                      </button>
                      <button
                        type="button"
                        onClick={handleSplitSelectAll}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-bold transition-colors cursor-pointer shadow-2xs"
                      >
                        📦 {currentLanguage === "en" ? "Select All (เลือกทั้งหมด)" : "เลือกทั้งหมด (Select All)"}
                      </button>
                      <button
                        type="button"
                        onClick={handleSplitResetAll}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-[10.5px] font-bold transition-colors cursor-pointer shadow-2xs"
                      >
                        🔄 {currentLanguage === "en" ? "Reset (ล้าง)" : "ล้าง (Reset)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddCustomRow(!showAddCustomRow)}
                        className="ml-auto px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[10.5px] font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                        title={currentLanguage === "en" ? "Add custom bag or item name (e.g. Wash & Fold Bag 2)" : "เพิ่มถุงผ้าหรือรายการระบุเอง เช่น ผ้าซักอบพับ ถุงที่ 2 (10 kg)"}
                      >
                        <Plus size={11} />
                        <span>{currentLanguage === "en" ? (showAddCustomRow ? "Close Custom Form" : "+ Add Custom Item / Bag") : (showAddCustomRow ? "ปิดฟอร์มเพิ่มเอง" : "+ เพิ่มถุงผ้า / รายการเอง")}</span>
                      </button>
                    </div>

                    {/* Add Custom Item Inline Form */}
                    {showAddCustomRow && (
                      <div className="p-2.5 bg-purple-50/90 border border-purple-200 rounded-xl space-y-2 animate-in fade-in">
                        <p className="text-[10px] font-bold text-purple-900">
                          {currentLanguage === "en"
                            ? "Specify item name or laundry bag to deliver in 2nd batch (e.g. Wash & Fold Bag 2, 2 Pairs Shoes):"
                            : "ระบุรายการหรือถุงผ้าที่จะแยกส่งในรอบที่ 2 (เช่น ผ้าซักอบพับ ถุงที่ 2, ผ้านวม 2 ผืน):"}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Input
                            placeholder={currentLanguage === "en" ? "e.g. Wash & Fold Bag 2 (10 kg)" : "เช่น ผ้าซักอบพับ ถุงที่ 2 (10 kg)"}
                            value={newCustomName}
                            onChange={(e) => setNewCustomName(e.target.value)}
                            className="text-xs h-8 flex-1 min-w-[150px] bg-white"
                          />
                          <Input
                            type="number"
                            min={1}
                            value={newCustomQty}
                            onChange={(e) => setNewCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
                            className="text-xs h-8 w-16 bg-white"
                          />
                          <select
                            value={newCustomUnit}
                            onChange={(e) => setNewCustomUnit(e.target.value)}
                            className="h-8 text-xs bg-white border border-slate-200 rounded-lg px-2 outline-none"
                          >
                            <option value="ชิ้น">{currentLanguage === "en" ? "pcs (ชิ้น)" : "ชิ้น (pcs)"}</option>
                            <option value="ถุง">{currentLanguage === "en" ? "bag (ถุง)" : "ถุง (bag)"}</option>
                            <option value="กก.">{currentLanguage === "en" ? "kg (กก.)" : "กก. (kg)"}</option>
                            <option value="คู่">{currentLanguage === "en" ? "pair (คู่)" : "คู่ (pair)"}</option>
                            <option value="ชุด">{currentLanguage === "en" ? "set (ชุด)" : "ชุด (set)"}</option>
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs"
                            onClick={() => {
                              if (!newCustomName.trim()) return;
                              setCustomSplitItems(prev => [
                                ...prev,
                                {
                                  id: `custom-${Date.now()}`,
                                  name: newCustomName.trim(),
                                  quantity: newCustomQty,
                                  unit: newCustomUnit,
                                }
                              ]);
                              setNewCustomName("");
                              setNewCustomQty(1);
                            }}
                          >
                            {currentLanguage === "en" ? "Add (เพิ่ม)" : "เพิ่ม (Add)"}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Custom Added Items Badges */}
                    {customSplitItems.length > 0 && (
                      <div className="p-2 bg-purple-100/60 border border-purple-200 rounded-xl space-y-1">
                        <span className="text-[10px] font-bold text-purple-900 block">
                          {currentLanguage === "en" ? "Custom items added for Batch 2:" : "รายการเพิ่มเติมที่ระบุเอง (รอบ 2):"}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {customSplitItems.map((cit, idx) => (
                            <span key={cit.id || idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-purple-300 text-purple-900 font-bold text-[10.5px] shadow-2xs">
                              <span>{cit.name} x{cit.quantity} {cit.unit}</span>
                              <button
                                type="button"
                                onClick={() => setCustomSplitItems(prev => prev.filter((_, i) => i !== idx))}
                                className="text-rose-500 hover:text-rose-700 ml-1 cursor-pointer"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto bg-slate-50/40">
                      {(() => {
                        const items = Array.isArray(splitTargetJob?.items) && splitTargetJob.items.length > 0
                          ? splitTargetJob.items
                          : (splitTargetJob?.itemsJson ? (() => { try { return JSON.parse(splitTargetJob.itemsJson); } catch { return []; } })() : dialogCart);
                        
                        if (!items || items.length === 0) {
                          return (
                            <div className="p-4 text-center text-slate-500 space-y-1">
                              <p className="font-bold">
                                {currentLanguage === "en" ? "This order has no item breakdown (e.g. Wash & Fold by weight)" : "ออเดอร์นี้ไม่มีรายการแยกชิ้น (เช่น งานคิดเหมารวม / ซักอบพับ)"}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {currentLanguage === "en"
                                  ? 'Click "+ Add Custom Item / Bag" above to specify what will be delivered in Batch 2.'
                                  : 'ท่านสามารถกดปุ่ม "+ เพิ่มถุงผ้า / รายการเอง" ด้านบน เพื่อระบุถุงหรือรายการที่ต้องการแยกส่งได้เลย'}
                              </p>
                            </div>
                          );
                        }

                        return items.map((it: any, idx: number) => {
                          const k = String(it.id || it.serviceId || it.name || `item-${idx}`);
                          const totalQty = Number(it.quantity) || 1;
                          const splitQty = splitItemSelections[k] || 0;
                          const remainQty = Math.max(0, totalQty - splitQty);
                          const isSelected = splitQty > 0;
                          const itemUnit = it.unit || (currentLanguage === "en" ? "pcs" : "ชิ้น");

                          return (
                            <div key={k} className={`p-2.5 flex items-center justify-between gap-3 transition-colors ${isSelected ? "bg-purple-50/80 border-l-4 border-l-purple-600" : "hover:bg-white"}`}>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 text-xs truncate">{it.name || "Item"}</p>
                                <p className="text-[10px] text-slate-500">
                                  {currentLanguage === "en" ? `Total in bill: ${totalQty} ${itemUnit}` : `ทั้งหมดในบิล: ${totalQty} ${itemUnit}`}
                                  {isSelected && (
                                    <span className="ml-2 font-bold text-purple-700">
                                      {currentLanguage === "en"
                                        ? `(Batch 1: ${remainQty} ${itemUnit} • Batch 2: ${splitQty} ${itemUnit})`
                                        : `(รอบ 1 ส่ง ${remainQty} ${itemUnit} • รอบ 2 ส่ง ${splitQty} ${itemUnit})`}
                                    </span>
                                  )}
                                </p>
                              </div>

                              {/* Quantity Stepper */}
                              <div className="flex items-center gap-1.5 shrink-0 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                                <button
                                  type="button"
                                  disabled={splitQty <= 0}
                                  onClick={() => setSplitItemSelections(prev => ({ ...prev, [k]: Math.max(0, (prev[k] || 0) - 1) }))}
                                  className="w-6 h-6 rounded flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  -
                                </button>
                                <span className={`w-8 text-center font-mono font-bold text-xs ${isSelected ? "text-purple-700" : "text-slate-400"}`}>
                                  {splitQty}
                                </span>
                                <button
                                  type="button"
                                  disabled={splitQty >= totalQty}
                                  onClick={() => setSplitItemSelections(prev => ({ ...prev, [k]: Math.min(totalQty, (prev[k] || 0) + 1) }))}
                                  className="w-6 h-6 rounded flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* Live Two-Batch Comparison Card */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-100/90 rounded-xl border border-slate-200">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                          <Package size={12} className="text-slate-500" />
                          <span>{currentLanguage === "en" ? "Batch 1 (Original Order)" : "รอบที่ 1 (บิลเดิม)"}</span>
                        </div>
                        <p className="text-[10px] text-slate-600 line-clamp-2">
                          {(() => {
                            const items = Array.isArray(splitTargetJob?.items) && splitTargetJob.items.length > 0
                              ? splitTargetJob.items
                              : (splitTargetJob?.itemsJson ? (() => { try { return JSON.parse(splitTargetJob.itemsJson); } catch { return []; } })() : dialogCart);
                            const remainings = items
                              .map((it: any, idx: number) => {
                                const k = String(it.id || it.serviceId || it.name || `item-${idx}`);
                                const totalQty = Number(it.quantity) || 1;
                                const splitQty = splitItemSelections[k] || 0;
                                const rem = totalQty - splitQty;
                                const itemUnit = it.unit || (currentLanguage === "en" ? "pcs" : "ชิ้น");
                                return rem > 0 ? `${it.name} x${rem} ${itemUnit}` : null;
                              })
                              .filter(Boolean);
                            return remainings.length > 0 ? remainings.join(", ") : (currentLanguage === "en" ? "(All items moved to Batch 2)" : "(ส่งรอบที่ 2 ทั้งหมด)");
                          })()}
                        </p>
                        <p className="text-[9.5px] text-emerald-700 font-bold">
                          {currentLanguage === "en" ? "✓ Original bill payment remains 100% intact" : "✓ ยอดขายบิลเดิมยังอยู่ครบ 100%"}
                        </p>
                      </div>
                      <div className="space-y-1 border-l border-slate-200 pl-2">
                        <div className="flex items-center gap-1 text-[11px] font-bold text-purple-700">
                          <Truck size={12} className="text-purple-600" />
                          <span>{currentLanguage === "en" ? "Batch 2 (New Order)" : "รอบที่ 2 (บิลใหม่)"}</span>
                        </div>
                        <p className="text-[10px] text-purple-900 font-bold line-clamp-2">
                          {(() => {
                            const items = Array.isArray(splitTargetJob?.items) && splitTargetJob.items.length > 0
                              ? splitTargetJob.items
                              : (splitTargetJob?.itemsJson ? (() => { try { return JSON.parse(splitTargetJob.itemsJson); } catch { return []; } })() : dialogCart);
                            const splitItemsSummary = items
                              .map((it: any, idx: number) => {
                                const k = String(it.id || it.serviceId || it.name || `item-${idx}`);
                                const splitQty = splitItemSelections[k] || 0;
                                const itemUnit = it.unit || (currentLanguage === "en" ? "pcs" : "ชิ้น");
                                return splitQty > 0 ? `${it.name} x${splitQty} ${itemUnit}` : null;
                              })
                              .filter(Boolean);
                            customSplitItems.forEach(cit => {
                              splitItemsSummary.push(`${cit.name} x${cit.quantity} ${cit.unit}`);
                            });
                            return splitItemsSummary.length > 0 ? splitItemsSummary.join(", ") : (currentLanguage === "en" ? "No items selected yet" : "ยังไม่ได้เลือกรายการ");
                          })()}
                        </p>
                        <p className="text-[9.5px] text-purple-600 font-bold">
                          {currentLanguage === "en" ? "✓ New order ฿0 (Pre-paid)" : "✓ บิลใหม่ ฿0 (Pre-paid)"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Scheduling & Rider Settings for Round 2 */}
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Delivery Scheduled Time */}
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                          {currentLanguage === "en" ? "Batch 2 Delivery Date & Time (วัน-เวลาจัดส่งรอบที่ 2)" : "วัน-เวลาจัดส่งรอบที่ 2 (DELIVERY DATE & TIME)"}
                        </Label>
                        <Input
                          type="datetime-local"
                          value={splitScheduledTime}
                          onChange={(e) => setSplitScheduledTime(e.target.value)}
                          className="text-xs h-9 bg-white"
                        />
                      </div>

                      {/* Rider Assignment */}
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                          {currentLanguage === "en" ? "Batch 2 Delivery Rider (ไรเดอร์จัดส่งรอบที่ 2)" : "ไรเดอร์จัดส่งรอบที่ 2 (DELIVERY RIDER)"}
                        </Label>
                        <select
                          value={splitRiderId}
                          onChange={(e) => setSplitRiderId(e.target.value)}
                          className="flex h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-purple-500"
                        >
                          <option value="">{currentLanguage === "en" ? "Assign Later (ยังไม่ระบุไรเดอร์)" : "ยังไม่ระบุไรเดอร์ (Assign Later)"}</option>
                          {riders.map((r: any) => (
                            <option key={r.id} value={r.id}>
                              {r.name || r.phone}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Rider Commission Toggle */}
                    <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-700 text-xs block">
                          {currentLanguage === "en" ? "Batch 2 Rider Commission (ค่าคอมไรเดอร์)" : "ค่าคอมมิชชั่นไรเดอร์รอบที่ 2 (Rider Commission)"}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {splitGiveCommission 
                            ? (currentLanguage === "en" ? "Standard distance-based commission (คำนวณตามระยะทางปกติ)" : "คำนวณค่าคอมจัดส่งตามระยะทางปกติ")
                            : (currentLanguage === "en" ? "No Rider Commission (฿0 งดค่าคอม)" : "ไม่คิดค่าคอมมิชชั่น (฿0 No Rider Comm)")}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={splitGiveCommission}
                        onChange={(e) => setSplitGiveCommission(e.target.checked)}
                        className="w-4 h-4 accent-purple-600 cursor-pointer rounded"
                      />
                    </div>

                    {/* Note */}
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                        {currentLanguage === "en" ? "Additional Note for Batch 2 (หมายเหตุเพิ่มเติม)" : "หมายเหตุเพิ่มเติมสำหรับรอบที่ 2 (OPTIONAL NOTE)"}
                      </Label>
                      <Input
                        value={splitNotes}
                        onChange={(e) => setSplitNotes(e.target.value)}
                        placeholder={currentLanguage === "en" ? "e.g. Shoes ready Wednesday, leave at lobby" : "เช่น รองเท้าพร้อมส่งวันพุธ, ส่งห้องนิติ"}
                        className="text-xs h-8 bg-white"
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSplitDeliveryModalOpen(false)}
                    disabled={isSplittingDelivery}
                    className="text-xs font-bold rounded-xl cursor-pointer"
                  >
                    {currentLanguage === "en" ? "Cancel (ยกเลิก)" : "ยกเลิก (Cancel)"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isSplittingDelivery || (Object.values(splitItemSelections).reduce((a, b) => a + b, 0) === 0 && customSplitItems.length === 0)}
                    onClick={handleConfirmSplitDelivery}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSplittingDelivery ? (
                      <>
                        <Loader2 size={13} className="animate-spin mr-1.5" />
                        <span>{currentLanguage === "en" ? "Creating Split Delivery..." : "กำลังแยกออเดอร์..."}</span>
                      </>
                    ) : (
                      <>
                        <Split size={13} className="mr-1.5" />
                        <span>{currentLanguage === "en" ? "Confirm Split Delivery (Create Batch 2)" : "ยืนยันแยกส่ง (Create 2nd Delivery)"}</span>
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Wallet Approval Reject Reason Dialog */}
            <Dialog open={walletRejectModalOpen} onOpenChange={(open) => {
              if (!isWalletActionProcessing) {
                setWalletRejectModalOpen(open);
                if (!open) setWalletRejectReason("");
              }
            }}>
              <DialogContent className="sm:max-w-md w-[95vw] rounded-2xl p-0 overflow-hidden border border-slate-200 shadow-2xl bg-white">
                <DialogHeader className="p-4 bg-rose-600 text-white">
                  <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
                    <AlertCircle size={18} />
                    <span>ระบุเหตุผลการปฏิเสธ (Reject Wallet Transaction)</span>
                  </DialogTitle>
                </DialogHeader>
                <div className="p-4 space-y-3">
                  <p className="text-xs text-slate-600">
                    กรุณาระบุเหตุผลการปฏิเสธรายการ เพื่อแจ้งเตือนและบันทึกประวัติ Task ติดตามงาน:
                  </p>
                  <Input
                    value={walletRejectReason}
                    onChange={(e) => setWalletRejectReason(e.target.value)}
                    placeholder="เช่น สลิปไม่ตรง, ยอดเงินผิด, ตะกร้าสินค้าไม่ถูกต้อง"
                    className="text-xs h-9"
                    autoFocus
                  />
                </div>
                <DialogFooter className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setWalletRejectModalOpen(false);
                      setWalletRejectReason("");
                    }}
                    disabled={isWalletActionProcessing}
                    className="text-xs font-bold rounded-xl cursor-pointer"
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                    onClick={handleConfirmWalletReject}
                    disabled={!walletRejectReason.trim() || isWalletActionProcessing}
                  >
                    {isWalletActionProcessing ? (
                      <>
                        <Loader2 size={13} className="animate-spin mr-1" />
                        <span>กำลังบันทึก...</span>
                      </>
                    ) : (
                      <>
                        <X size={13} className="mr-1" />
                        <span>ยืนยัน Reject</span>
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Unlock Paid Confirmation Dialog */}
            <Dialog open={unlockPaidDialogOpen} onOpenChange={(open) => {
              if (!isUnlockingPaid) {
                setUnlockPaidDialogOpen(open);
                if (!open) setUnlockPaidReason("");
              }
            }}>
              <DialogContent className="sm:max-w-md w-[95vw] rounded-2xl p-0 overflow-hidden border border-slate-200 shadow-2xl bg-white">
                <DialogHeader className="p-4 bg-amber-500 text-white">
                  <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
                    <LockOpen size={18} />
                    <span>ยืนยันการปลดล็อคการชำระเงิน (Unlock Paid)</span>
                  </DialogTitle>
                </DialogHeader>

                <div className="p-5 space-y-4 text-xs">
                  {/* Warning message */}
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 leading-relaxed space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                      <span>ข้อควรทราบในการ Unlock:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800/90 pl-1">
                      <li>ประวัติการชำระเงินเดิมทั้งหมดจะถูกลบออก เพื่อให้คิดเงินและชำระใหม่เต็มยอด</li>
                      <li>ตะกร้าสินค้าและราคาจะปลดล็อคทันที สามารถเพิ่ม/ลดผ้าและแก้ไขราคาได้</li>
                    </ul>
                  </div>

                  {/* Summary of payments to be cleared */}
                  {(() => {
                    let payments: any[] = [];
                    if (activeJob?.adminNotesJson) {
                      try {
                        const parsed = JSON.parse(activeJob.adminNotesJson);
                        payments = Array.isArray(parsed.payments) ? parsed.payments : [];
                      } catch {}
                    }
                    const totalPaid = payments.length > 0 
                      ? payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
                      : (activeJob?.totalAmount || 0);

                    const walletAmount = payments
                      .filter(p => (p.method || "").toLowerCase() === "credit")
                      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

                    const cashAmount = payments
                      .filter(p => (p.method || "").toLowerCase() === "cash")
                      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

                    return (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="flex justify-between items-center font-bold text-slate-800">
                          <span>ยอดชำระเดิมที่จะถูกล้าง:</span>
                          <span className="font-mono text-sm text-slate-900">฿{totalPaid.toLocaleString()}</span>
                        </div>
                        {walletAmount > 0 && (
                          <div className="flex justify-between items-center text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-1 rounded">
                            <span>• คืนเงินเข้า Wallet ลูกค้าทันที:</span>
                            <span>+฿{walletAmount.toLocaleString()}</span>
                          </div>
                        )}
                        {cashAmount > 0 && (
                          <div className="flex justify-between items-center text-[11px] text-blue-700 font-semibold bg-blue-50 px-2 py-1 rounded">
                            <span>• ปรับลดยอดเงินสดในกะ (Shift):</span>
                            <span>-฿{cashAmount.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Mandatory Reason Input */}
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-700 flex items-center gap-1">
                      <span>ระบุเหตุผลในการ Unlock</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      value={unlockPaidReason}
                      onChange={(e) => setUnlockPaidReason(e.target.value)}
                      placeholder="เช่น ลูกค้าเพิ่มผ้า 2 ชิ้น / แก้ไขยอดเงินผิด / คิดราคาผิด"
                      className="text-xs h-9"
                      autoFocus
                    />
                  </div>
                </div>

                <DialogFooter className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setUnlockPaidDialogOpen(false);
                      setUnlockPaidReason("");
                    }}
                    disabled={isUnlockingPaid}
                    className="text-xs font-bold rounded-xl cursor-pointer"
                  >
                    ยกเลิก
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer gap-1"
                    onClick={handleUnlockPaid}
                    disabled={!unlockPaidReason.trim() || isUnlockingPaid}
                  >
                    {isUnlockingPaid ? (
                      <>
                        <Loader2 size={13} className="animate-spin mr-1" />
                        <span>กำลังปลดล็อค...</span>
                      </>
                    ) : (
                      <>
                        <LockOpen size={13} className="mr-1" />
                        <span>ยืนยัน Unlock</span>
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Admin Note Logs Expanded Dialog */}
            <Dialog open={noteLogsModalOpen} onOpenChange={setNoteLogsModalOpen}>
              <DialogContent className="sm:max-w-lg w-[95vw] rounded-2xl mx-auto p-0 bg-white border-none shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <DialogHeader className="p-4 bg-indigo-600 border-b border-indigo-700 sticky top-0 shrink-0 text-white">
                  <div>
                    <DialogTitle className="text-base font-bold flex items-center gap-2">
                      <MessageSquare size={18} />
                      Admin Note Logs
                    </DialogTitle>
                    <p className="text-[10px] text-indigo-200 uppercase tracking-wider mt-0.5">Job ID: {editingJobId}</p>
                  </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 flex flex-col min-h-0">
                  {adminLogs.length > 0 ? (
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 p-1 text-slate-700">
                      {adminLogs.map((log, i) => (
                        <div key={log.id || i} className="group relative p-3 rounded-xl bg-white border border-slate-200 shadow-sm pr-8">
                          <div className="flex justify-between items-center mb-1">
                            <span className={`font-bold text-xs uppercase ${log.userId === 'system' ? 'text-indigo-600' : 'text-slate-700'}`}>
                              {log.userName || (log as any).createdBy || "System"}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-400">
                                {format(new Date(log.timestamp || (log as any).createdAt), "MMM d, yyyy HH:mm")}
                              </span>
                              {log.isNew && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteAdminLog(log.id!);
                                  }}
                                  className="text-slate-400 hover:text-rose-500 rounded p-1 transition-colors"
                                  title="Delete note"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{log.text}</p>
                          {log.imageUrls && log.imageUrls.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {log.imageUrls.map((url, idx) => (
                                <div 
                                  key={idx} 
                                  className="relative w-16 h-16 rounded-lg border border-slate-200 overflow-hidden cursor-pointer bg-slate-100 shadow-sm"
                                  onClick={() => setPreviewAdminNoteImage(url)}
                                  title="Click to view full image"
                                >
                                  <img src={url} alt={`Attachment ${idx}`} className="w-full h-full object-cover hover:scale-105 transition-transform" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <div ref={expandedLogsEndRef} />
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-2 py-12">
                      <MessageSquare size={48} className="text-slate-300" />
                      <p className="text-sm font-medium">No notes yet</p>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-white border-t border-slate-200 shrink-0 flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={`h-9 px-2.5 rounded-lg border ${showNoteUploader ? 'bg-indigo-50 border-indigo-300 text-indigo-600' : 'bg-white border-slate-200 text-slate-500'}`}
                      onClick={() => setShowNoteUploader(prev => !prev)}
                      disabled={isUploadingNote}
                      title="Attach images"
                    >
                      <Paperclip size={16} />
                    </Button>
                    <Input
                      ref={expandedNoteInputRef}
                      placeholder="Type a note & press Enter..."
                      value={adminNoteInput}
                      onChange={(e) => setAdminNoteInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSendAdminLog();
                        }
                      }}
                      disabled={isUploadingNote}
                      className="h-9 text-sm bg-white flex-1 rounded-lg"
                    />
                    <Button 
                      type="button" 
                      size="sm" 
                      disabled={isUploadingNote}
                      className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                      onClick={handleSendAdminLog}
                    >
                      {isUploadingNote ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <Plus size={16} />
                      )}
                      <span className="ml-1">Send</span>
                    </Button>
                  </div>
                  {showNoteUploader && (
                    <div className="border border-slate-200 bg-white p-2 rounded-lg shadow-sm mt-1 max-h-[160px] overflow-y-auto">
                      <MultiImageUploader
                        ref={noteUploaderRef}
                        entityType="job"
                        entityId={editingJobId || "temp-note"}
                        subType="proofs"
                        maxFiles={3}
                      />
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Admin Note Image Lightbox/Preview Modal */}
            {previewAdminNoteImage && (
              <Dialog open={!!previewAdminNoteImage} onOpenChange={(open) => !open && setPreviewAdminNoteImage(null)}>
                <DialogContent className="sm:max-w-3xl w-[95vw] rounded-2xl mx-auto p-0 bg-black/95 border-none shadow-2xl overflow-hidden flex flex-col items-center justify-center h-[70vh] sm:h-[80vh] z-[99999]">
                  <button 
                    className="absolute top-4 right-4 sm:top-6 sm:right-6 text-white hover:text-red-400 bg-black/40 hover:bg-black/60 rounded-full p-2 transition-colors z-10"
                    onClick={() => setPreviewAdminNoteImage(null)}
                  >
                    <X size={24} />
                  </button>
                  <img src={previewAdminNoteImage} className="max-w-full max-h-[80vh] object-contain rounded-xl" alt="Enlarged Note Image" />
                </DialogContent>
              </Dialog>
            )}
            </div>
          </header>

          {/* Persistent Offline / Reconnecting Alert Banner */}
          {realtimeState.connectionStatus === 'disconnected' && (
            <div className="bg-rose-500 text-white px-4 py-2 text-sm font-semibold flex items-center justify-between shadow-xs shrink-0 z-30">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                <span>⚠️ สัญญาณขาดการเชื่อมต่อ (Offline) — หน้าจอกำลังแสดงข้อมูลแคช การแก้ไขจะไม่ถูกบันทึกจนกว่าจะเชื่อมต่อสำเร็จ</span>
              </div>
              <button
                type="button"
                onClick={() => api.reconcileDelta().catch(() => {})}
                className="px-3 py-1 bg-white text-rose-700 rounded text-xs font-bold hover:bg-rose-50 transition cursor-pointer"
              >
                เชื่อมต่อใหม่ (Reconnect)
              </button>
            </div>
          )}
          {realtimeState.connectionStatus === 'reconnecting' && (
            <div className="bg-amber-500 text-slate-950 px-4 py-2 text-sm font-semibold flex items-center justify-between shadow-xs shrink-0 z-30">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-950 animate-pulse" />
                <span>🔄 กำลังเชื่อมต่อระบบอัปเดตแบบเรียลไทม์ใหม่ (Reconnecting...) กรุณารอสักครู่</span>
              </div>
            </div>
          )}

          {/* Dynamic Content Views */}
          {activeTab === "dashboard" && hasAccess("dashboard") && <AdminDashboard jobs={jobs} />}
          {activeTab === "jobs" && hasAccess("jobs") && (
            <AdminAllJobs 
              jobs={jobs} 
              onEditJob={stableHandleEditFullJob} 
              onCreateJob={stableHandleCreateNewJob} 
              onSplitDelivery={handleOpenSplitDelivery}
              savingJobIds={savingJobIds} 
            />
          )}
          {activeTab === "dispatch" && hasAccess("dispatch") && <AdminDispatch onEditJob={stableHandleEditFullJob} />}
          {activeTab === "riders" && hasAccess("riders") && <AdminRiders />}
          {activeTab === "map" && hasAccess("map") && <AdminLiveMap />}
          {activeTab === "pos" && hasAccess("pos") && <AdminPOS />}
          {activeTab === "services" && hasAccess("services") && <AdminServiceMenu />}
          {activeTab === "customers" && hasAccess("customers") && (
            <AdminCRM 
              onTopUp={(customer) => {
                setTopUpCustomer(customer || null);
                setShowTopUpDialog(true);
              }} 
              onViewJob={stableHandleEditFullJob}
            />
          )}
          {activeTab === "calculator" && (
            <AdminFeeCalculator 
              onNavigateToPois={() => handleTabChange("pois")} 
            />
          )}
          {activeTab === "pois" && (
            <AdminPoiManager 
              onBack={() => handleTabChange("calculator")} 
              initialSubTab={((typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("subtab") : "duplicates") as any) || "duplicates"}
            />
          )}
          {activeTab === "settings" && hasAccess("settings") && <AdminSettings />}
          {activeTab === "users" && hasAccess("users") && <AdminUsers />}
          {activeTab === "activity-logs" && hasAccess("activity-logs") && <AdminLogs />}
          {activeTab === "reports" && hasAccess("reports") && <AdminReports />}
          {activeTab === "marketing" && hasAccess("marketing") && <AdminMarketing onViewJob={stableHandleEditFullJob} />}

          {activeTab === "tasks" && hasAccess("tasks") && <AdminTasks />}

          {/* Fallback for no access to current tab */}
          {!hasAccess(activeTab) && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 h-full bg-slate-50/50">
              <ShieldAlert size={48} className="mb-4 text-slate-300" />
              <h2 className="text-xl font-bold text-slate-500 mb-2">Access Restricted</h2>
              <p className="text-sm">Please select an available menu from the sidebar.</p>
            </div>
          )}
        </main>
        
        <AdminCustomerDialog
          open={customerDialogOpen}
          onOpenChange={setCustomerDialogOpen}
          customer={selectedProfileCustomer}
          onTopUpCustomer={(c) => {
            setTopUpCustomer(c);
            setShowTopUpDialog(true);
          }}

          onSaved={(c) => {
            setServiceWeight(2);
            setOtherClothingName("");
    setOtherClothingPrice(0);
            setClothingItems({
              polo: { selected: false, quantity: 1 },
              tshirt: { selected: false, quantity: 1 },
              pants: { selected: false, quantity: 1 },
              dress: { selected: false, quantity: 1 },
              bedsheet: { selected: false, quantity: 1 },
              other: { selected: false, quantity: 1 },
            });
            setCustomerName(c.name);
            setCustomerPhone(c.phone);
            setSelectedProfileCustomer(c);
            setAppliedPromo(null);
            setPromoCodeInput("");
            setPromoError(null);
            
            // Always sync address from CRM when customer is selected
            const cleanCustAddr = c.defaultAddress && c.defaultAddress.trim() !== "--" && c.defaultAddress.trim() !== "-" ? stripRoomSuffix(c.defaultAddress) : "";
            const validCustCoords = isRealCustomerCoords(c.defaultCoords, c.defaultAddress) ? c.defaultCoords : null;
            setPickupLoc(cleanCustAddr);
            setPickupRoom((c.roomNo || (c.secondaryAddress ? c.secondaryAddress.replace(/^Room\s*/i, '') : '') || '').trim());
            setPickupCoords(validCustCoords);
            
            setDeliveryLoc(cleanCustAddr);
            setDeliveryRoom((c.roomNo || (c.secondaryAddress ? c.secondaryAddress.replace(/^Room\s*/i, '') : '') || '').trim());
            setDeliveryCoords(validCustCoords);
            
            setIsDeliveryDirty(false);
            setIsFreeDelivery(false);
            updateClosestStoreAsync(c.defaultCoords, c.defaultAddress);
            setEditingFeeLock(null);
            
            if (c.isVIP) {
              setSelectedVIPLabel("VIP");
            } else {
              setSelectedVIPLabel("");
            }
            if (c.isMember) {
              setSelectedMemberLabel("Member");
              setSelectedMemberId(c.memberId || "");
              setPaymentChannel("Deduct Member");
            } else {
              setSelectedMemberLabel("");
              setSelectedMemberId("");
              setPaymentChannel(prev => prev === "Deduct Member" ? "" : prev);
            }
            setCustomerPriceListId(c.priceListId || null);
            handleServiceOrSpeedChange(serviceType, serviceSpeed, serviceWeight, c.priceListId || null);
            
            setCustomerSearchQuery("");
            setShowCustomerDropdown(false);
            
            if (c.remark && c.remark.trim() !== "") {
              handleAddAdminLog(`CRM Remark: ${c.remark}`, true);
            }
          }}
        />
      </motion.div>
    </AnimatePresence>
    
      <AdminCustomerProfileModal
        open={profileOpen}
        onOpenChange={setProfileOpen}
        customer={selectedProfileCustomer}
        onEditCustomer={() => {
          setProfileOpen(false);
          setCustomerDialogOpen(true);
        }}
      />

      <AdminCustomerVouchersDialog
        open={customerVouchersModalOpen}
        onOpenChange={setCustomerVouchersModalOpen}
        customer={selectedProfileCustomer}
        coupons={dialogAvailableCoupons}
        appliedPromoCode={appliedPromo?.code || null}
        cartItems={dialogCart}
        currentLanguage={currentLanguage}
        onApplyCoupon={(code) => handleApplyPromo(code)}
        onRemoveCoupon={() => {
          setAppliedPromo(null);
          setPromoCodeInput("");
          setPromoError(null);
          setUserDismissedPromo(true);
        }}
        isLoading={promoLoading}
      />

      {receiptPaperSize === "A5" ? (
        dialogReceiptData && (
          <A5ReceiptDialog
            open={showReceipt}
            onOpenChange={setShowReceipt}
            receiptData={dialogReceiptData}
            activeShop={activeShop}
            currentLanguage={currentLanguage}
            onCloseComplete={() => {
              const wasDraft = isDraftPreview;
              lastPaidProformaInfoRef.current = null;
              setIsDraftPreview(false);
              setIsPaymentEvent(false);
              if (!wasDraft && !dialogOpen) {
                resetDialogStates();
              }
            }}
            onBillImageUploaded={(newUrl) => {
              if (typeof newUrl !== "string" || newUrl.includes("proforma-DRAFT") || newUrl.includes("/DRAFT/")) return;
              const currentEditId = editingJobIdRef.current;
              if (!currentEditId) return;
              const cleanEditId = currentEditId.replace(/^RF-/i, "");
              if ((newUrl.includes("proforma-") || newUrl.includes("receipt-")) && !newUrl.includes(currentEditId) && !newUrl.includes(cleanEditId)) {
                return;
              }
              setBillImageUrls(prev => {
                if (!prev.includes(newUrl)) {
                  return [...prev, newUrl];
                }
                return prev;
              });
            }}
          />
        )
      ) : (
        dialogReceiptData && (
          <ThermalReceiptDialog
            open={showReceipt}
            onOpenChange={setShowReceipt}
            receiptData={dialogReceiptData}
            activeShop={activeShop}
            receiptPaperSize={receiptPaperSize}
            currentLanguage={currentLanguage}
            onCloseComplete={() => {
              const wasDraft = isDraftPreview;
              lastPaidProformaInfoRef.current = null;
              setIsDraftPreview(false);
              setIsPaymentEvent(false);
              if (!wasDraft && !dialogOpen) {
                resetDialogStates();
              }
            }}
            onBillImageUploaded={(newUrl) => {
              if (typeof newUrl !== "string" || newUrl.includes("proforma-DRAFT") || newUrl.includes("/DRAFT/")) return;
              const currentEditId = editingJobIdRef.current;
              if (!currentEditId) return;
              const cleanEditId = currentEditId.replace(/^RF-/i, "");
              if ((newUrl.includes("proforma-") || newUrl.includes("receipt-")) && !newUrl.includes(currentEditId) && !newUrl.includes(cleanEditId)) {
                return;
              }
              setBillImageUrls(prev => {
                if (!prev.includes(newUrl)) {
                  return [...prev, newUrl];
                }
                return prev;
              });
            }}
          />
        )
      )}
      {/* Top Up Dialog — standalone member wallet top-up */}
      <TopUpDialog
        open={showTopUpDialog}
        preselectedCustomer={topUpCustomer}
        onClose={() => {
          setShowTopUpDialog(false);
          setTopUpCustomer(null);
        }}
        onSuccess={(receiptNo) => {
          console.log("[TopUp] Created receipt:", receiptNo);
        }}
      />

      {/* Refund & Correct Dialog */}
      <RefundCorrectDialog
        open={!!refundJob}
        job={refundJob}
        onClose={() => setRefundJob(null)}
        onSuccess={async (result) => {
          console.log("[Refund] Processed refund:", result);
          setRefundJob(null);
          setDialogOpen(false);
          resetDialogForm();
          await refreshDb();

          if (result?.duplicatedJobId) {
            setTimeout(async () => {
              try {
                const allJobs = [...jobs, ...jobStore.getSnapshot()];
                let dupJob = allJobs.find(j => j.id === result.duplicatedJobId);
                if (!dupJob) {
                  const fetchedJobs = await api.getJobs();
                  dupJob = fetchedJobs.find((j: Job) => j.id === result.duplicatedJobId);
                }
                if (dupJob) {
                  handleEditFullJob(dupJob);
                  toast.info(`📝 เปิด Job สำเนา #${dupJob.id} เรียบร้อย — ปลด lock รายการและราคาแล้ว สามารถแก้ไขและชำระเงินใหม่ได้ทันที`);
                }
              } catch (err) {
                console.error("Auto-open duplicate job error:", err);
              }
            }, 400);
          }
        }}
      />

      {/* Split Payment Dialog */}
      <SplitPaymentDialog
        open={showSplitPaymentDialog}
        onOpenChange={(isOpen) => {
          setShowSplitPaymentDialog(isOpen);
          if (!isOpen && splitPayments.length < 2 && paymentChannel === "Split Payment") {
            setPaymentChannel("");
          }
        }}
        totalAmount={dialogTotal}
        customer={selectedProfileCustomer}
        activePaymentChannels={activePaymentChannels}
        initialSplits={splitPayments}
        onConfirm={(splits) => {
          setSplitPayments(splits);
          setPaymentChannel("Split Payment");
        }}
        currentLanguage={currentLanguage}
      />

      {/* Beam Online Payment Dialog */}
      <OnlinePaymentDialog
        isOpen={!!onlinePaymentJob}
        onClose={() => setOnlinePaymentJob(null)}
        job={onlinePaymentJob}
        customAmount={onlinePaymentJob?.totalAmount ?? undefined}
        onPaymentSuccess={async (paidInfo) => {
          if (onlinePaymentJob) {
            api.optimisticUpdate(onlinePaymentJob.id, {
              isPaid: true,
              isShopPaid: true,
              paymentChannel: paidInfo.channel,
            } as any);
            jobStore.notify();
            await refreshDb();
            const current = jobs.find(j => j.id === onlinePaymentJob.id) || activeJob;
            if (current) {
              setEditingJobId(current.id);
              setIsDraftPreview(false);
              setIsPaymentEvent(true);
              setShowReceipt(true);
            }
          }
          setOnlinePaymentJob(null);
        }}
      />

      {/* Silent Background Auto-Receipt Worker */}
      <AutoReceiptWorker />
    </>
  );
}
