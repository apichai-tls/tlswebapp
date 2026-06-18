"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/logo";
import { ProtectedRoute } from "@/components/protected-route";
import { useJobs } from "@/lib/use-jobs";
import { useCustomers } from "@/lib/use-customers";
import { jobStore, customerStore, calculateFee, shopStore, serviceStore, priceListStore, poiStore, getClosestShopIndex, type Job, type JobStatus, type LatLng, type ServiceType, type AdminNoteLog, type Customer } from "@/lib/store";
import { getClosestShopByRoute } from "@/lib/map-api";
import { useSyncExternalStore } from "react";
import { FullMap, CreateJobMap } from "@/components/map-loader";
import type { MapMarker } from "@/components/map-component";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { AdminSettings } from "@/components/admin-settings";
import { AdminUsers } from "@/components/admin-users";
import { AdminDispatch } from "@/components/admin-dispatch";
import { AdminVerify } from "@/components/admin-verify";
import { AdminLogs } from "@/components/admin-logs";
import FeeCalculatorPage from "./fee-calculator/page";

import { MultiImageUploader, type MultiImageUploaderRef } from "@/components/ui/multi-image-uploader";
import { addJobLogAction } from "@/actions/db";
import { useRiders } from "@/lib/use-riders";
import {
  Plus,
  MapPin,
  Navigation,
  Truck,
  Package,
  Clock,
  CheckCircle2,
  LayoutDashboard,
  ArrowLeft,
  Map,
  Users,
  User,
  Phone,
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
  Paperclip,
  Maximize2
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";

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

export default function AdminPage() {
  const { user, logout } = useAuth();
  const jobs = useJobs();
  const riders = useRiders();
  const customers = useCustomers();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const services = useSyncExternalStore(serviceStore.subscribe, serviceStore.getSnapshot, serviceStore.getSnapshot);
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

  const [activeTab, setActiveTab] = useState<"dashboard" | "jobs" | "dispatch" | "riders" | "map" | "pos" | "services" | "customers" | "settings" | "users" | "verify" | "calculator">("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Restore tab from URL hash, or auto-navigate to first accessible tab for this user
  useEffect(() => {
    const hash = window.location.hash.replace('#', '').split('?')[0];
    const validTabs = ["dashboard", "jobs", "dispatch", "riders", "map", "pos", "services", "customers", "settings", "users", "verify", "calculator"];

    if (validTabs.includes(hash)) {
      // Honour explicit URL hash (e.g. bookmarks / direct links)
      setActiveTab(hash as any);

      const searchParams = new URLSearchParams(window.location.search);
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

    // For all other roles: jump to the first tab they have access to
    const tabOrder: Array<"dashboard" | "jobs" | "dispatch" | "riders" | "map" | "pos" | "services" | "customers" | "settings" | "users" | "verify" | "calculator"> = [
      "dashboard", "jobs", "dispatch", "pos", "customers", "services", "map", "riders", "calculator", "settings", "users"
    ];
    const hasPermission = (key: string) => user.permissions?.includes(key);
    const firstTab = tabOrder.find(tab => hasPermission(tab));
    if (firstTab) setActiveTab(firstTab);
  }, [user]);

  // User Activity Tracking Ref for Smart Polling (Idle Detection)
  const lastActiveTime = useRef(Date.now());

  // Periodic data refresh based on active tab + Smart Polling (Visibility & Idle Detection)
  useEffect(() => {
    // 1. Listen for user activity to detect idle state
    const handleUserActivity = () => {
      lastActiveTime.current = Date.now();
    };

    window.addEventListener("mousemove", handleUserActivity, { passive: true });
    window.addEventListener("keydown", handleUserActivity, { passive: true });
    window.addEventListener("mousedown", handleUserActivity, { passive: true });
    window.addEventListener("scroll", handleUserActivity, { passive: true });
    window.addEventListener("touchstart", handleUserActivity, { passive: true });

    let intervalTime: number | null = 3000; // Smart Polling active rate: 3 seconds (up from 5s)

    if (activeTab === "map") {
      intervalTime = 15000; // Live Map: 15 seconds (GPS-heavy, keep slower)
    } else if (activeTab === "riders") {
      intervalTime = null; // Rider Report: No auto-refresh
      import("@/lib/api").then(m => m.refreshDb()); // Refresh once when opened
    }

    let interval: ReturnType<typeof setInterval> | null = null;
    let tickCount = 0;

    if (intervalTime !== null) {
      interval = setInterval(() => {
        // Paused Mode: Skip fetching if the browser tab is hidden/minimized
        if (document.visibilityState === "hidden") {
          return;
        }

        const timeSinceLastActive = Date.now() - lastActiveTime.current;
        const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

        tickCount++;

        if (timeSinceLastActive > IDLE_TIMEOUT_MS) {
          // Monitor Mode (Idle): Slow down polling to every 4th tick (e.g. 12s for 3s interval, 60s for 15s interval)
          if (tickCount % 4 === 0) {
            import("@/lib/api").then(m => m.refreshDb());
          }
        } else {
          // Active Mode: Poll at regular interval rate
          import("@/lib/api").then(m => m.refreshDb());
        }
      }, intervalTime);
    }

    return () => {
      window.removeEventListener("mousemove", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
      window.removeEventListener("mousedown", handleUserActivity);
      window.removeEventListener("scroll", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
      if (interval) clearInterval(interval);
    };
  }, [activeTab]);

  const handleTabChange = (tab: "dashboard" | "jobs" | "dispatch" | "riders" | "map" | "pos" | "services" | "customers" | "settings" | "users" | "verify" | "calculator") => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };
  const [laundryPrice, setLaundryPrice] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("unpaid");
  const [paymentChannel, setPaymentChannel] = useState("");
  const [cashPlaced, setCashPlaced] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [showJobLogs, setShowJobLogs] = useState(false);
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
    if (!customerSearchQuery) return [];
    const query = customerSearchQuery.toLowerCase();
    return customers.filter(c => 
      c.name.toLowerCase().includes(query) || 
      c.phone.includes(query)
    );
  }, [customerSearchQuery, customers]);
  
  const [pickupLoc, setPickupLoc] = useState("");
  const [pickupCoords, setPickupCoords] = useState<LatLng | null>(null);
  const [pickupRoom, setPickupRoom] = useState("");
  const [deliveryLoc, setDeliveryLoc] = useState("");
  const [deliveryCoords, setDeliveryCoords] = useState<LatLng | null>(null);
  const [deliveryRoom, setDeliveryRoom] = useState("");

  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedProfileCustomer, setSelectedProfileCustomer] = useState<Customer | null>(null);
  
  const [isPickup, setIsPickup] = useState(true);
  const [isDelivery, setIsDelivery] = useState(true);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [isDeliveryDirty, setIsDeliveryDirty] = useState(false); // Track if user manually changed delivery
  const [isStuck, setIsStuck] = useState(false);

  const [pickupDist, setPickupDist] = useState(0);
  const [deliveryDist, setDeliveryDist] = useState(0);

  const [selectedStoreIndex, setSelectedStoreIndex] = useState(0);

  const updateClosestStoreAsync = async (coords: LatLng, address?: string) => {
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

  // Sync adminLogs with database updates in the background (real-time chat/notes sync)
  useEffect(() => {
    if (editingJobId) {
      const freshJob = jobs.find(j => j.id === editingJobId);
      if (freshJob) {
        let freshNotes: AdminNoteLog[] = [];
        try {
          if (freshJob.adminNotesJson) {
            freshNotes = JSON.parse(freshJob.adminNotesJson);
          }
        } catch {}

        // Check if there is a pending local note that hasn't synced to server yet
        const hasPendingLocalNote = adminLogs.length > 0 &&
          adminLogs[adminLogs.length - 1].userId === (user?.id || "unknown") &&
          !freshNotes.some(fn => fn.id === adminLogs[adminLogs.length - 1].id);

        if (!hasPendingLocalNote || freshNotes.length > adminLogs.length) {
          if (JSON.stringify(freshNotes) !== JSON.stringify(adminLogs)) {
            setAdminLogs(freshNotes);
          }
        }
      }
    }
  }, [jobs, editingJobId, user?.id, adminLogs]);

  const handleAddAdminLog = async (text: string, isSystem = false, imageUrls?: string[]) => {
    if (!text.trim() && (!imageUrls || imageUrls.length === 0)) return;
    const newLog: AdminNoteLog = {
      id: Math.random().toString(36).substring(7),
      userId: isSystem ? "system" : (user?.id || "unknown"),
      userName: isSystem ? "System (CRM)" : ((user as any)?.name || user?.email || "Admin"),
      text: text.trim(),
      imageUrls: imageUrls || [],
      timestamp: new Date().toISOString()
    };
    
    // Add locally for instant UI update
    setAdminLogs(prev => [...prev, newLog]);
    setAdminNoteInput("");

    // Save instantly to DB if editing an existing job
    if (editingJobId) {
      try {
        await addJobLogAction(editingJobId, newLog);
        // Sync local store so other parts of the app update immediately
        import("@/lib/api").then(m => m.refreshDb());
      } catch (err) {
        console.error("Failed to instantly save admin log:", err);
      }
    }
  };

  const handleSendAdminLog = async () => {
    const hasPendingImages = noteUploaderRef.current && noteUploaderRef.current.getPendingFilesCount() > 0;
    if (!adminNoteInput.trim() && !hasPendingImages) return;

    setIsUploadingNote(true);
    let uploadedUrls: string[] = [];
    try {
      if (noteUploaderRef.current && hasPendingImages) {
         uploadedUrls = await noteUploaderRef.current.startUpload();
      }
      await handleAddAdminLog(adminNoteInput, false, uploadedUrls);
      setShowNoteUploader(false);
      if (noteUploaderRef.current) {
        noteUploaderRef.current.reset();
      }
    } catch (err) {
      console.error("Failed to upload note images:", err);
    } finally {
      setIsUploadingNote(false);
    }
  };
  const [isPickupLobby, setIsPickupLobby] = useState(false);
  const [isPickupMeet, setIsPickupMeet] = useState(false);
  const [isDeliveryLobby, setIsDeliveryLobby] = useState(false);
  const [isDeliveryMeet, setIsDeliveryMeet] = useState(false);
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceWeight, setServiceWeight] = useState(2);
  
  const handleServiceOrSpeedChange = (newServiceId: string, newSpeed: "standard" | "express_50" | "express_100", newWeight: number, priceListId: string | null = customerPriceListId) => {
    setServiceType(newServiceId);
    setServiceSpeed(newSpeed);
    setServiceWeight(newWeight);

    const baseService = services.find(s => s.id === newServiceId);
    let pricePerKg = baseService ? baseService.price : 110;

    if (newServiceId === "other") {
      if (serviceType !== "other") {
        setLaundryPrice(0);
      }
      return;
    }

    if (priceListId) {
      const customPl = priceLists.find(pl => pl.id === priceListId);
      if (customPl && customPl.servicePrices[newServiceId] !== undefined) {
        pricePerKg = customPl.servicePrices[newServiceId];
      }
    } else {
      const defaultPl = priceLists.find(pl => pl.isDefault);
      if (defaultPl && defaultPl.servicePrices[newServiceId] !== undefined) {
        pricePerKg = defaultPl.servicePrices[newServiceId];
      }
    }

    setLaundryPrice(Math.ceil(pricePerKg * newWeight));
  };
  const [editingFeeLock, setEditingFeeLock] = useState<number | null>(null);
  const uploaderRef = useRef<MultiImageUploaderRef>(null);
  const billUploaderRef = useRef<MultiImageUploaderRef>(null);
  const pickupUploaderRef = useRef<MultiImageUploaderRef>(null);
  const deliveryUploaderRef = useRef<MultiImageUploaderRef>(null);

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  const hasAccess = (key: string) => {
    if (user?.role === 'admin') return true;
    return user?.permissions?.includes(key);
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

  const baseFee = editingFeeLock !== null ? editingFeeLock : calculateTotalFee();
  const fee = isFreeDelivery ? 0 : baseFee;

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

  const handleCreateNewJob = () => {
    setEditingJobId(null);
    setShowJobLogs(false);
    setIsDetailLoading(false);
    setEditingSubStatus(null);
    setCustomerName("");
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
    setIsPickup(true);
    setIsDelivery(true);
    setIsWalkIn(false);
    setSelectedStoreIndex(0);
    const firstWash = washServices.length > 0 ? washServices[0].id : "";
    setServiceSpeed("standard");
    setDeliveryScheduledTime("");
    setPaymentMethod("unpaid");
    setPaymentChannel("");
    setCashPlaced(false);
    setServiceType("wash_fold");
    setServiceWeight(2);
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
    setIsFreeDelivery(false);
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
    setPickupScheduledTime(format(roundToNearest30(new Date()), "yyyy-MM-dd'T'HH:mm"));
    setDeliveryScheduledTime(format(roundToNearest30(new Date(Date.now() + 86400000)), "yyyy-MM-dd'T'HH:mm"));
    setDialogOpen(true);
  };

  const handleEditFullJob = (job: Job) => {
    setEditingJobId(job.id);
    setShowJobLogs(false);
    setEditingSubStatus(job.subStatus || null);
    setIsStuck(job.isStuck || false);
    const rawLaundry = job.laundryTypes as any;
    setLaundryTypes(
      Array.isArray(rawLaundry) 
        ? rawLaundry 
        : (typeof rawLaundry === "string" && rawLaundry.trim() !== "")
          ? rawLaundry.split(",")
          : []
    );
    setCustomerName(job.customerName || "");
    setCustomerPhone(job.customerPhone || "");
    
    const foundCustomer = customers.find(c => c.id === job.customerId || c.phone === job.customerPhone);
    setSelectedProfileCustomer(foundCustomer || null);
    const isPickupService = !!job.pickupLocation && !shopLocations.some(s => s.address === job.pickupLocation);
    const isDeliveryService = !!job.dropoffLocation && !shopLocations.some(s => s.address === job.dropoffLocation);

    const parseRoom = (loc: string) => {
      const match = loc.match(/(.*?)\s*\(Room\s*(.*?)\)$/i);
      if (match) return { base: match[1].trim(), room: match[2].trim() };
      return { base: loc, room: "" };
    };

    const p = isPickupService ? parseRoom(job.pickupLocation || "") : { base: "", room: "" };
    setPickupLoc(p.base);
    setPickupRoom(p.room);
    setPickupCoords(isPickupService ? job.pickupCoords || null : null);
    
    const d = isDeliveryService ? parseRoom(job.dropoffLocation || "") : { base: "", room: "" };
    setDeliveryLoc(d.base);
    setDeliveryRoom(d.room);
    if (isDeliveryService && job.dropoffCoords) setDeliveryCoords(job.dropoffCoords);
    else setDeliveryCoords(null);
    setPickupDist(job.pickupDistance || 0);
    setDeliveryDist(job.deliveryDistance || 0);
    const isExp50 = job.remark?.includes("Express 50%");
    const isExp100 = job.remark?.includes("Express 100%");
    const parsedSpeed = isExp100 ? "express_100" : (isExp50 ? "express_50" : "standard");
    setServiceSpeed(parsedSpeed);
    
    const totalMinusFee = job.totalAmount ? job.totalAmount - (job.fee || 0) : 0;
    let basePrice = totalMinusFee;
    if (isExp100) basePrice = Math.ceil(totalMinusFee / 2);
    else if (isExp50) basePrice = Math.ceil(totalMinusFee / 1.5);
    
    setLaundryPrice(basePrice);
    setPaymentMethod(job.isPaid ? 'paid' : 'unpaid');
    setCashPlaced(job.cashPlaced || false);
    let fallbackChannel = job.paymentChannel || "";
    if (!fallbackChannel && job.paymentMethod) {
      const pm = job.paymentMethod.toLowerCase();
      if (pm === "transfer") fallbackChannel = "Transfer";
      else if (pm === "cash") fallbackChannel = "Cash / COD";
      else if (pm === "credit" || pm === "card") fallbackChannel = "Credit Card";
    }
    setPaymentChannel(fallbackChannel);
    setServiceType(job.serviceType || "wash_fold");
    setEditingFeeLock(job.fee);
    
    const matchedCustomer = customers.find(c => 
      (job.customerId && c.id === job.customerId) || 
      (job.customerName && c.name === job.customerName) || 
      (job.customerPhone && c.phone === job.customerPhone)
    );
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

    // Silent background fetch to ensure perfect consistency with the server DB
    fetch(`/api/jobs/${job.id}/details`)
      .then(r => r.json())
      .then(data => {
        const remoteBagUrls = parseUrls(data.bagImageUrl);
        const remoteBillUrls = parseUrls(data.billImageUrl);
        const remotePickupUrls = parseUrls(data.pickupProofImageUrl);
        const remoteDeliveryUrls = parseUrls(data.deliveryProofImageUrl || data.proofImageUrl);

        // Only update states if they actually changed on the server to prevent flashing or overriding local changes
        if (JSON.stringify(remoteBagUrls) !== JSON.stringify(localBagUrls)) setBagImageUrls(remoteBagUrls);
        if (JSON.stringify(remoteBillUrls) !== JSON.stringify(localBillUrls)) setBillImageUrls(remoteBillUrls);
        if (JSON.stringify(remotePickupUrls) !== JSON.stringify(localPickupUrls)) setPickupProofImageUrls(remotePickupUrls);
        if (JSON.stringify(remoteDeliveryUrls) !== JSON.stringify(localDeliveryUrls)) setDeliveryProofImageUrls(remoteDeliveryUrls);
      })
      .catch(e => console.error("Failed to fetch job details images in background", e));
    
    setAdminNote(job.remark || "");
    try {
      if (job.adminNotesJson) {
        setAdminLogs(JSON.parse(job.adminNotesJson));
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
    setIsFreeDelivery(job.remark ? job.remark.includes("Free Delivery") : false);
    setPickupScheduledTime(format(roundToNearest30(new Date(job.pickupScheduledAt || job.scheduledAt || Date.now())), "yyyy-MM-dd'T'HH:mm"));
    setDeliveryScheduledTime(format(roundToNearest30(new Date(job.deliveryScheduledAt || Date.now() + 86400000)), "yyyy-MM-dd'T'HH:mm"));
    setPickupRiderId(job.pickupRiderId || "");
    setDeliveryRiderId(job.deliveryRiderId || "");

    setIsPickup(isPickupService);
    setIsDelivery(isDeliveryService);
    setIsWalkIn(job.source === 'pos' || (job.type as string) === 'in_store');

    const branchIndex = shopLocations.findIndex(s => s.id === job.branchId);
    setSelectedStoreIndex(branchIndex >= 0 ? branchIndex : 0);

    setEditingJobId(job.id);
    setShowJobLogs(false);
    setDialogOpen(true);
    setNoteLogsModalOpen(false);
    setPreviewAdminNoteImage(null);
  };

  async function handleCreate() {
    if (isPickup && !pickupLoc.trim()) {
      toast.error("Please fill in the pickup location.");
      return;
    }
    if (isDelivery && !deliveryLoc.trim()) {
      toast.error("Please fill in the delivery location.");
      return;
    }
    if (!isWalkIn && !isPickup && !isDelivery) {
      toast.error("Please select at least one service (Pickup, Delivery, or Walk-In).");
      return;
    }

    const existingJob = editingJobId ? jobs.find(j => j.id === editingJobId) : null;
    const isAlreadyCompleted = existingJob?.status === "completed";
    
    const shop = shopLocations[selectedStoreIndex] || shopLocations[0];

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
    
    setIsSubmitting(true);
    let finalBagImageUrls: string[] = [];
    let finalBillImageUrls: string[] = [];
    let finalPickupProofUrls: string[] = [];
    let finalDeliveryProofUrls: string[] = [];
    try {
      if (uploaderRef.current) {
        finalBagImageUrls = await uploaderRef.current.startUpload();
      }
      if (billUploaderRef.current) {
        finalBillImageUrls = await billUploaderRef.current.startUpload();
      }

      if (user?.role === 'admin') {
        if (pickupUploaderRef.current) {
          finalPickupProofUrls = await pickupUploaderRef.current.startUpload();
        }
        if (deliveryUploaderRef.current) {
          finalDeliveryProofUrls = await deliveryUploaderRef.current.startUpload();
        }
      } else {
        finalPickupProofUrls = pickupProofImageUrls;
        finalDeliveryProofUrls = deliveryProofImageUrls;
      }
    } catch (err: any) {
      setIsSubmitting(false);
      toast.error(`Failed to upload images: ${err.message || 'Unknown error'}`);
      return; // Stop creation if upload fails
    }

    const oldRemarks = adminNote.split(" | ").map(r => r.trim()).filter(Boolean);
    const customRemarks = oldRemarks.filter(r => !["Free Delivery", "Express 50%", "Express 100%", "Pickup: Leave at Lobby", "Pickup: Meet up", "Delivery: Leave at Lobby", "Delivery: Meet up"].includes(r));

    let finalAdminLogs = [...adminLogs];
    if (adminNoteInput.trim()) {
      finalAdminLogs.push({
        id: Math.random().toString(36).substring(7),
        userId: user?.id || "unknown",
        userName: (user as any)?.name || user?.email || "Admin",
        text: adminNoteInput.trim(),
        timestamp: new Date().toISOString()
      });
    }

    const itemsPayload: { name: string; quantity: number; price: number }[] = [];
    const labelsMap: Record<string, string> = {
      polo: "Polo Shirt",
      tshirt: "T-Shirt",
      pants: "Pants",
      dress: "Dress",
      bedsheet: "Bedsheet"
    };

    Object.entries(clothingItems).forEach(([key, val]) => {
      if (val.selected) {
        let name = labelsMap[key];
        if (key === 'other') {
          name = otherClothingName.trim() || "Other";
        }
        itemsPayload.push({
          name: name || key,
          quantity: val.quantity,
          price: 0
        });
      }
    });

    const newJobData: any = {
      isStuck,
      customerId: selectedProfileCustomer?.id || (existingJob ? existingJob.customerId : null) || null,
      items: itemsPayload,
      type: isWalkIn ? (isDelivery ? "delivery" : "in_store") : ((isPickup && isDelivery) ? "full_service" : (isPickup ? "pickup" : (isDelivery ? "delivery" : "in_store"))),
      subStatus: isWalkIn && !editingSubStatus ? "billing" : editingSubStatus,
      source: isWalkIn ? "pos" : "app",
      // Auto-advance to Delivery or Completed when Process is set to Ready (only if job is not already completed)
      ...(!isAlreadyCompleted && editingSubStatus === 'ready' && { status: (isWalkIn && !isDelivery) ? 'completed' : 'delivery' }),
      laundryTypes: laundryTypes.length > 0 ? laundryTypes : undefined,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickupLocation: isPickup ? (pickupRoom ? `${pickupLoc} (Room ${pickupRoom})` : pickupLoc) : shop.address,
      dropoffLocation: isDelivery ? (deliveryRoom ? `${deliveryLoc} (Room ${deliveryRoom})` : deliveryLoc) : shop.address,
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
      isPaid: paymentMethod === 'paid',
      fee,
      totalAmount: laundryPrice + (serviceSpeed === "express_50" ? Math.ceil(laundryPrice * 0.5) : (serviceSpeed === "express_100" ? laundryPrice : 0)) + fee,
      serviceType,
      pickupDistance: isPickup ? pickupDist : 0,
      deliveryDistance: isDelivery ? deliveryDist : 0,
      pickupCommission: (isPickup && !selectedVIPLabel && !isFreeDelivery) ? Math.floor(pickupDist) * 2 : 0,
      deliveryCommission: (isDelivery && !selectedVIPLabel && !isFreeDelivery) ? Math.floor(deliveryDist) * 2 : 0,
      remark: [
        ...customRemarks,
        isFreeDelivery ? "Free Delivery" : "",
        serviceSpeed === "express_50" ? "Express 50%" : "",
        serviceSpeed === "express_100" ? "Express 100%" : "",
        isPickup ? (isPickupLobby ? "Pickup: Leave at Lobby" : (isPickupMeet ? "Pickup: Meet up" : "")) : "",
        isDelivery ? (isDeliveryLobby ? "Delivery: Leave at Lobby" : (isDeliveryMeet ? "Delivery: Meet up" : "")) : "",
      ].filter(Boolean).join(" | ") || null,
      adminNotesJson: finalAdminLogs.length > 0 ? JSON.stringify(finalAdminLogs) : null,
      branchId: shop.id,
      paymentChannel: paymentChannel || null,
      creatorRole: editingJobId && existingJob ? ((existingJob as any).creatorRole || user?.role) : user?.role,
      createdBy: editingJobId && existingJob ? (existingJob.createdBy || user?.name || user?.email || "Admin") : (user?.name || user?.email || "Admin"),
      cashPlaced,
      actorId: user?.id,
      actorName: user?.name || user?.email,
      actorRole: user?.role
    };

    // Only set image properties if they were actually modified, to prevent stale overrides
    if (!editingJobId || JSON.stringify(finalBagImageUrls) !== JSON.stringify(origBagImageUrls)) {
      newJobData.bagImageUrl = finalBagImageUrls.length > 0 ? JSON.stringify(finalBagImageUrls) : null;
    }
    if (!editingJobId || JSON.stringify(finalBillImageUrls) !== JSON.stringify(origBillImageUrls)) {
      newJobData.billImageUrl = finalBillImageUrls.length > 0 ? JSON.stringify(finalBillImageUrls) : null;
    }
    if (!editingJobId || JSON.stringify(finalPickupProofUrls) !== JSON.stringify(origPickupProofImageUrls)) {
      newJobData.pickupProofImageUrl = finalPickupProofUrls.length > 0 ? JSON.stringify(finalPickupProofUrls) : null;
    }
    if (!editingJobId || JSON.stringify(finalDeliveryProofUrls) !== JSON.stringify(origDeliveryProofImageUrls)) {
      newJobData.deliveryProofImageUrl = finalDeliveryProofUrls.length > 0 ? JSON.stringify(finalDeliveryProofUrls) : null;
    }

    try {
      if (editingJobId) {
        await jobStore.updateJobDetails(editingJobId, newJobData as any);
        toast.success(`Job updated successfully!`);
      } else {
        const job = await jobStore.addJob(newJobData as any);
        toast.success(`Job ${job.id} created — Fee ฿${job.fee.toFixed(0)} CMS${isFreeDelivery ? ' (Free)' : ''}`);
      }

      setPickupLoc("");
      setPickupRoom("");
      setDeliveryLoc("");
      setDeliveryRoom("");
      setIsDeliveryDirty(false);
      setIsFreeDelivery(false);
      setIsStuck(false);
      setPickupScheduledTime(format(roundToNearest30(new Date()), "yyyy-MM-dd'T'HH:mm"));
      setDeliveryScheduledTime(format(roundToNearest30(new Date(Date.now() + 86400000)), "yyyy-MM-dd'T'HH:mm"));
      setPaymentMethod("unpaid");
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
      setAdminNote("");
      setAdminNoteInput("");
      setShowAdminNote(false);
      setEditingJobId(null);
      setNoteLogsModalOpen(false);
      setPreviewAdminNoteImage(null);
      setShowJobLogs(false);
      setDialogOpen(false);
    } catch (err: any) {
      console.error("Job Save Error:", err);
      toast.error(`Failed to save job: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ProtectedRoute allowedRole={['admin', 'manager', 'cso', 'staff']}>
      <AnimatePresence mode="wait">
        <motion.div
        className="flex min-h-screen"
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        key="admin-page"
      >
        {/* Sidebar */}
        <aside className={`hidden lg:flex flex-col border-r border-slate-200 bg-white transition-all duration-300 sticky top-0 h-screen z-20 ${isSidebarCollapsed ? "w-[72px]" : "w-64"}`}>
          <div className="flex h-20 items-center justify-center border-b border-slate-100 px-4 overflow-hidden">
            {isSidebarCollapsed ? (
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-white text-xl">T</div>
            ) : (
              <Logo />
            )}
          </div>
          
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} 
            className="absolute -right-4 top-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-full p-1.5 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 shadow-md z-10 transition-transform"
            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>

          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto overflow-x-hidden hide-scrollbar">
            {hasAccess("dashboard") && (
              <motion.a
                href="#dashboard"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("dashboard"); }}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "dashboard" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                title="Dashboard"
              >
                <LayoutDashboard size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Dashboard</span>}
              </motion.a>
            )}
            
            {hasAccess("services") && (
              <motion.a
                href="#services"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("services"); }}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "services" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                title="Service Menu"
              >
                <Tag size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Service Menu</span>}
              </motion.a>
            )}

            {hasAccess("pos") && (
              <motion.a
                href="#pos"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("pos"); }}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "pos" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                title="POS"
              >
                <CreditCard size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">POS</span>}
              </motion.a>
            )}

            {hasAccess("jobs") && (
              <motion.a
                href="#jobs"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("jobs"); }}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "jobs" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                title="All Jobs"
              >
                <Package size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">All Jobs</span>}
              </motion.a>
            )}



            {hasAccess("customers") && (
              <motion.a
                href="#customers"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("customers"); }}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "customers" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                title="Customers (CRM)"
              >
                <Users size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Customers (CRM)</span>}
              </motion.a>
            )}
            
            {hasAccess("dispatch") && (
              <motion.a
                href="#dispatch"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("dispatch"); }}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "dispatch" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                title="Dispatch Schedule"
              >
                <CalendarClock size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Dispatch Schedule</span>}
              </motion.a>
            )}





            {hasAccess("billing") && (
              <Link 
                href="/billing" 
                className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
                title="Billing"
              >
                <Camera size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Billing</span>}
              </Link>
            )}

            {hasAccess("riders") && (
              <motion.a
                href="#riders"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("riders"); }}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "riders" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                title="Riders"
              >
                <Truck size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Riders</span>}
              </motion.a>
            )}

            {hasAccess("map") && (
              <motion.a
                href="#map"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("map"); }}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "map" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                title="Live Map"
              >
                <Map size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Live Map</span>}
              </motion.a>
            )}
            
            {hasAccess("calculator") && (
              <button onClick={() => handleTabChange("calculator")} className="block w-full text-left">
                <motion.div
                  whileHover={{ x: 2 }}
                  className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "calculator" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                  title="Distance Calculator"
                >
                  <Calculator size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                  {!isSidebarCollapsed && <span className="truncate">Distance Calculator</span>}
                </motion.div>
              </button>
            )}

            {hasAccess("settings") && (
              <motion.a
                href="#settings"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("settings"); }}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "settings" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                title="Settings"
              >
                <Settings size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Settings</span>}
              </motion.a>
            )}
            
            {hasAccess("users") && (
              <motion.a
                href="#users"
                onClick={(e: React.MouseEvent) => { e.preventDefault(); handleTabChange("users"); }}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg ${isSidebarCollapsed ? 'px-0 justify-center' : 'px-3'} py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "users" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
                title="Manage Users"
              >
                <ShieldCheck size={isSidebarCollapsed ? 22 : 18} className="shrink-0" />
                {!isSidebarCollapsed && <span className="truncate">Manage Users</span>}
              </motion.a>
            )}

          </nav>
          <div className={`border-t border-slate-200 px-3 py-4 space-y-2`}>
            <Link href="/privacy">
              <Button variant="ghost" size="sm" className={`w-full gap-2 text-slate-500 hover:text-slate-900 cursor-pointer ${isSidebarCollapsed ? 'px-0 justify-center' : 'justify-start'}`} title="Privacy Policy">
                <ShieldCheck size={isSidebarCollapsed ? 20 : 16} className="shrink-0" />
                {!isSidebarCollapsed && <span>Privacy Policy</span>}
              </Button>
            </Link>
            <Button variant="ghost" size="sm" className={`w-full gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 cursor-pointer ${isSidebarCollapsed ? 'px-0 justify-center' : 'justify-start'}`} onClick={handleLogout} title="Logout">
              <LogOut size={isSidebarCollapsed ? 20 : 16} className="shrink-0" />
              {!isSidebarCollapsed && <span>Logout</span>}
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col">
          {/* Top bar */}
          <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 lg:px-8 shadow-sm">
            <div className="flex items-center gap-3 lg:hidden px-2 py-2">
              <Logo />
            </div>
            <h1 className="hidden lg:block text-lg font-semibold text-slate-900">
              Dashboard - {user?.name || user?.email || ""}
            </h1>
            
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="icon"
                className="lg:hidden text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200" 
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
                    setDialogOpen(open);
                  }} 
                  disablePointerDismissal={true}
                >
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button 
                      onClick={handleCreateNewJob}
                      className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium shadow-sm cursor-pointer border-none"
                    >
                      <Plus size={16} />
                      <span className="hidden sm:inline">Create New Job</span>
                      <span className="sm:hidden">New Job</span>
                    </Button>
                  </motion.div>
                  <DialogContent className="w-full max-w-[95vw] xl:max-w-[1400px] p-0 overflow-hidden bg-slate-50 flex flex-col h-[95vh]">
                <DialogHeader className="p-3 border-b border-slate-200 bg-white shrink-0 flex flex-col lg:grid lg:grid-cols-12 gap-3 items-start lg:items-center">
                  <div className="col-span-6 lg:col-span-7 flex flex-row items-center gap-4 w-full">
                    <DialogTitle className="flex flex-col items-start gap-1 text-lg shrink-0">
                      <div className="flex items-center gap-2">
                        <Package size={18} />
                        <span>{editingJobId ? "Edit Job" : "Create New Job"}</span>
                        {selectedVIPLabel && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 font-bold ml-2 mt-0">
                            VIP {selectedVIPLabel}
                          </Badge>
                        )}
                      </div>
                      {editingJobId && (
                        <span className="text-slate-500 font-mono text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200 ml-6">
                          Order ID: #{editingJobId.split('-')[0].toUpperCase()}
                        </span>
                      )}
                    </DialogTitle>
                    <div className="relative w-full max-w-[400px] z-50 mt-0">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <Input
                            id="customer-search"
                            placeholder="Search customer by name or phone..."
                            value={customerSearchQuery}
                            disabled={!!editingJobId}
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
                            className="h-9 pl-9 text-sm bg-slate-50 border-slate-200 focus-visible:ring-indigo-500 rounded-full w-full"
                          />
                        </div>
                        <Button 
                          type="button"
                          onClick={() => setCustomerDialogOpen(true)}
                          className="h-9 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm rounded-full flex items-center gap-1.5 font-bold shrink-0"
                        >
                          <UserPlus size={14} />
                          <span className="text-xs">Add Customer</span>
                        </Button>
                      </div>
                      
                      {showCustomerDropdown && customerSearchQuery && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto top-[100%]">
                          {filteredCustomers.length > 0 ? (
                            filteredCustomers.map(c => (
                              <div
                                key={c.id}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0"
                                onClick={() => {
                                  setServiceWeight(2);
                                  setOtherClothingName("");
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
                                  
                                  setPickupLoc(c.defaultAddress);
                                  setPickupRoom(c.secondaryAddress || "");
                                  setPickupCoords(c.defaultCoords);
                                  
                                  setDeliveryLoc(c.defaultAddress);
                                  setDeliveryRoom(c.secondaryAddress || "");
                                  setDeliveryCoords(c.defaultCoords);
                                  
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
                                  <p className="text-xs text-slate-500">{c.phone}</p>
                                </div>
                                {c.isVIP && (
                                  <Badge variant="outline" className="text-[10px] py-0 h-4 bg-amber-50 text-amber-700 border-amber-200 font-bold">
                                    VIP
                                  </Badge>
                                )}
                                {c.isMember && (
                                  <Badge variant="outline" className="text-[10px] py-0 h-4 bg-blue-50 text-blue-700 border-blue-200 font-bold">
                                    Member
                                  </Badge>
                                )}
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
                  
                  <div className="col-span-6 lg:col-span-5 w-full flex justify-end pr-10 lg:pr-12">
                    {editingJobId && (
                      <div className="flex flex-row gap-4 items-center justify-end w-full">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type:</span>
                          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-0.5">
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
                                className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded transition-all min-w-[40px] ${
                                  laundryTypes.includes(t.id)
                                    ? 'bg-slate-800 shadow-sm'
                                    : 'hover:bg-white text-slate-500 hover:text-slate-800'
                                }`}
                                title={t.label}
                              >
                                <span className={`text-[14px] font-black leading-none h-[16px] flex items-center justify-center ${laundryTypes.includes(t.id) ? 'text-white' : 'text-slate-700'}`}>
                                  {t.id}
                                </span>
                                <span className={`text-[9px] font-bold leading-none ${laundryTypes.includes(t.id) ? 'text-white' : 'text-slate-500'}`}>
                                  {t.label === 'Dryclean' ? 'Dry' : t.label}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Process:</span>
                          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 gap-0.5">

                            {/* Billing — auto-indicator, not clickable */}
                          <div
                            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded transition-all min-w-[40px] cursor-default ${
                              billImageUrls.length > 0
                                ? 'bg-violet-600 shadow-sm text-white'
                                : 'text-slate-400'
                            }`}
                            title={billImageUrls.length > 0 ? 'Bill uploaded' : 'No bill uploaded'}
                          >
                            <div className="h-[16px] flex items-center justify-center">
                              <Receipt size={14} className={billImageUrls.length > 0 ? 'text-white' : 'text-slate-400'} strokeWidth={2} />
                            </div>
                            <span className={`text-[9px] font-bold leading-none ${billImageUrls.length > 0 ? 'text-white' : 'text-slate-400'}`}>Bill</span>
                          </div>

                          {/* Wash */}
                          <button
                            type="button"
                            onClick={() => setEditingSubStatus(editingSubStatus === 'wash' ? null : 'wash')}
                            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded transition-all min-w-[40px] ${
                              editingSubStatus === 'wash'
                                ? 'bg-blue-600 shadow-sm text-white'
                                : 'hover:bg-white text-slate-500 hover:text-slate-800'
                            }`}
                            title="Washing"
                          >
                            <div className="h-[16px] flex items-center justify-center">
                              <Droplets size={14} className={editingSubStatus === 'wash' ? 'text-white' : ''} strokeWidth={2} />
                            </div>
                            <span className={`text-[9px] font-bold leading-none ${editingSubStatus === 'wash' ? 'text-white' : 'text-slate-500'}`}>Wash</span>
                          </button>

                          {/* Dry */}
                          <button
                            type="button"
                            onClick={() => setEditingSubStatus(editingSubStatus === 'dry' ? null : 'dry')}
                            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded transition-all min-w-[40px] ${
                              editingSubStatus === 'dry'
                                ? 'bg-orange-600 shadow-sm text-white'
                                : 'hover:bg-white text-slate-500 hover:text-slate-800'
                            }`}
                            title="Drying"
                          >
                            <div className="h-[16px] flex items-center justify-center">
                              <Wind size={14} className={editingSubStatus === 'dry' ? 'text-white' : ''} strokeWidth={2} />
                            </div>
                            <span className={`text-[9px] font-bold leading-none ${editingSubStatus === 'dry' ? 'text-white' : 'text-slate-500'}`}>Dry</span>
                          </button>

                          {/* Iron */}
                          <button
                            type="button"
                            onClick={() => setEditingSubStatus(editingSubStatus === 'iron' ? null : 'iron')}
                            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded transition-all min-w-[40px] ${
                              editingSubStatus === 'iron'
                                ? 'bg-indigo-700 shadow-sm text-white'
                                : 'hover:bg-white text-slate-500 hover:text-slate-800'
                            }`}
                            title="Ironing"
                          >
                            <div className="h-[16px] flex items-center justify-center">
                              <Shirt size={14} className={editingSubStatus === 'iron' ? 'text-white' : ''} strokeWidth={2} />
                            </div>
                            <span className={`text-[9px] font-bold leading-none ${editingSubStatus === 'iron' ? 'text-white' : 'text-slate-500'}`}>Iron</span>
                          </button>

                          {/* Ready */}
                          <button
                            type="button"
                            onClick={() => setEditingSubStatus(editingSubStatus === 'ready' ? null : 'ready')}
                            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded transition-all min-w-[40px] ${
                              editingSubStatus === 'ready'
                                ? 'bg-emerald-600 shadow-sm text-white'
                                : 'hover:bg-white text-slate-500 hover:text-slate-800'
                            }`}
                            title="Ready"
                          >
                            <div className="h-[16px] flex items-center justify-center">
                              <CheckCircle2 size={14} className={editingSubStatus === 'ready' ? 'text-white' : ''} strokeWidth={2} />
                            </div>
                            <span className={`text-[9px] font-bold leading-none ${editingSubStatus === 'ready' ? 'text-white' : 'text-slate-500'}`}>Ready</span>
                          </button>

                        </div>
                      </div>
                      </div>
                    )}
                  </div>
                </DialogHeader>

                {/* Main Content Grid */}
                <div className="flex-1 overflow-y-auto lg:overflow-hidden p-3">
                  {!showJobLogs ? (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full">
                    
                    {/* COL 1: Basic Info (span 4) */}
                    <motion.div
                      className="lg:col-span-4 flex flex-col gap-2 overflow-y-auto pr-1 pb-4 lg:pb-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1, duration: 0.3 }}
                    >
                      {/* Customer Info & Logistics Card */}
                      <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 shrink-0">
                        <div className="grid grid-cols-2 gap-2 pb-1 border-b border-slate-100">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label htmlFor="custName" className="flex items-center gap-1 text-xs font-medium text-slate-500 whitespace-nowrap">
                                <User size={12} className="shrink-0" />
                                <span>Name <span className="text-red-500">*</span></span>
                                {selectedVIPLabel && (
                                  <Badge variant="outline" className="ml-1 text-[9px] py-0 px-1 h-4 bg-amber-50 text-amber-700 border-amber-200 font-bold shrink-0">
                                    VIP
                                  </Badge>
                                )}
                                {selectedMemberLabel && (
                                  <Badge variant="outline" className="ml-1 text-[9px] py-0 px-1 h-4 bg-blue-50 text-blue-700 border-blue-200 font-bold shrink-0">
                                    {selectedMemberId ? `ID: ${selectedMemberId}` : 'Member'}
                                  </Badge>
                                )}
                              </Label>
                              {selectedProfileCustomer && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded shadow-sm border border-indigo-100 shrink-0 ml-1 flex items-center justify-center"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setCustomerDialogOpen(true);
                                  }}
                                  title="Edit Customer CRM"
                                >
                                  <Edit size={10} />
                                </Button>
                              )}
                            </div>
                            <Input
                              id="custName"
                              placeholder="Name"
                              value={customerName}
                              readOnly={true}
                              className="h-8 text-xs bg-slate-50 cursor-text text-slate-700 select-all"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="custPhone" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              <Phone size={12} />
                              Phone
                            </Label>
                            <Input
                              id="custPhone"
                              placeholder="Phone number"
                              value={customerPhone}
                              readOnly={true}
                              className="h-8 text-xs bg-slate-50 cursor-text text-slate-700 select-all"
                            />
                          </div>
                        </div>
                        
                        <div className="flex items-end gap-3 mb-1 pb-2 border-b border-slate-100 shrink-0">
                          <div className="space-y-1 flex-1">
                            <Label htmlFor="store-select" className="flex items-center gap-1.5 text-xs font-medium">
                              <Store size={14} className="text-blue-600" />
                              Origin Store Branch
                            </Label>
                            <select 
                              id="store-select"
                              className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                              value={selectedStoreIndex}
                              onChange={(e) => {
                                setSelectedStoreIndex(Number(e.target.value));
                                setEditingFeeLock(null);
                              }}
                            >
                              {shopLocations.map((shop, idx) => (
                                <option key={shop.id} value={idx}>{shop.name}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center gap-3 pb-1">
                            <Label className="flex items-center gap-1.5 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={isPickup}
                                onChange={(e) => {
                                  setIsPickup(e.target.checked);
                                  if (e.target.checked) setIsWalkIn(false);
                                  setEditingFeeLock(null);
                                }}
                                className="rounded text-blue-600 w-3 h-3 border-slate-300"
                              />
                              <span className="text-xs font-semibold text-slate-700">Pickup</span>
                            </Label>
                            <Label className="flex items-center gap-1.5 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={isDelivery}
                                onChange={(e) => {
                                  setIsDelivery(e.target.checked);
                                  if (e.target.checked && isPickup) setIsWalkIn(false);
                                  setEditingFeeLock(null);
                                }}
                                className="rounded text-blue-600 w-3 h-3 border-slate-300"
                              />
                              <span className="text-xs font-semibold text-slate-700">Delivery</span>
                            </Label>
                            <Label className="flex items-center gap-1.5 cursor-pointer ml-2">
                              <input 
                                type="checkbox" 
                                checked={isWalkIn}
                                onChange={(e) => {
                                  setIsWalkIn(e.target.checked);
                                  if (e.target.checked) {
                                    setIsPickup(false);
                                  }
                                  setEditingFeeLock(null);
                                }}
                                className="rounded text-amber-500 w-3 h-3 border-slate-300 focus:ring-amber-500"
                              />
                              <span className="text-xs font-semibold text-amber-700">Walk-In</span>
                            </Label>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          {isPickup && (
                            <div className="space-y-1">
                              <Label htmlFor="pickup-location" className="flex items-center gap-1.5 text-xs font-medium">
                                <MapPin size={14} className="text-emerald-600" />
                                Pickup Address <span className="text-red-500">*</span>
                              </Label>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <LocationInput
                                    id="pickup-location"
                                    placeholder="Customer pickup address"
                                    value={pickupLoc}
                                    localData={localDataForSearch}
                                    onChange={(v) => {
                                      setPickupLoc(v);
                                    }}
                                    onSelectLocation={(loc) => {
                                      const newCoords = { lat: loc.lat, lng: loc.lng };
                                      setPickupCoords(newCoords);
                                      updateClosestStoreAsync(newCoords, loc.name);
                                      setEditingFeeLock(null);
                                      if (!isDeliveryDirty) {
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
                                    onChange={(e) => setPickupRoom(e.target.value)}
                                    className="h-9 text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {isDelivery && (
                            <div className="space-y-1">
                              <Label htmlFor="delivery-location" className="flex items-center gap-1.5 text-xs font-medium">
                                <Navigation size={14} className="text-red-600" />
                                Delivery Address <span className="text-red-500">*</span>
                              </Label>
                              <div className="flex gap-2">
                                <div className="flex-1">
                                  <LocationInput
                                    id="delivery-location"
                                    placeholder="Customer delivery address"
                                    value={deliveryLoc}
                                    localData={localDataForSearch}
                                    onChange={(v) => {
                                      setDeliveryLoc(v);
                                      setIsDeliveryDirty(true);
                                    }}
                                    onSelectLocation={(loc) => {
                                      const newCoords = { lat: loc.lat, lng: loc.lng };
                                      setDeliveryCoords(newCoords);
                                      setIsDeliveryDirty(true);
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
                                    onChange={(e) => setDeliveryRoom(e.target.value)}
                                    className="h-9 text-xs"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Interactive Map */}
                        <div className="min-h-[80px] h-[80px] lg:h-[90px] shrink-0 rounded-lg overflow-hidden border border-slate-200 mt-1 relative">
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

                        {/* Scheduling Block moved from Col 3 */}
                        <div className="space-y-1 pt-1 border-t border-slate-100">
                          {isPickup && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <Label htmlFor="schedule-pickup" className="flex items-center gap-1.5 text-xs font-medium">
                                  <Clock size={14} className="text-amber-500" />
                                  Pickup Time & Rider
                                </Label>
                                <div className="flex items-center gap-3">
                                  <Label className="flex items-center gap-1.5 cursor-pointer w-fit">
                                    <input 
                                      type="checkbox" 
                                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-3.5 w-3.5"
                                      checked={isPickupMeet}
                                      onChange={(e) => {
                                        setIsPickupMeet(e.target.checked);
                                        if (e.target.checked) setIsPickupLobby(false);
                                      }}
                                    />
                                    <span className="text-[11px] text-slate-600 font-medium">Meet up</span>
                                  </Label>
                                  <Label className="flex items-center gap-1.5 cursor-pointer w-fit">
                                    <input 
                                      type="checkbox" 
                                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-3.5 w-3.5"
                                      checked={isPickupLobby}
                                      onChange={(e) => {
                                        setIsPickupLobby(e.target.checked);
                                        if (e.target.checked) setIsPickupMeet(false);
                                      }}
                                    />
                                    <span className="text-[11px] text-slate-600 font-medium">Lobby</span>
                                  </Label>
                                </div>
                              </div>
                              <div className="grid grid-cols-[1.6fr_1fr] gap-2">
                                <DateTimePicker
                                  id="schedule-pickup"
                                  value={pickupScheduledTime}
                                  onChange={setPickupScheduledTime}
                                />
                                <select
                                  className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                                  value={pickupRiderId}
                                  onChange={(e) => setPickupRiderId(e.target.value)}
                                >
                                  <option value="">-- Assign Rider --</option>
                                  {riders.map(r => (
                                    <option key={`p-${r.id}`} value={r.id}>{r.name}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )}

                          <div className={`space-y-0.5 ${isPickup ? 'pt-0.5 border-t border-slate-100' : ''}`}>
                            <div className="flex items-center justify-between gap-2">
                              <Label htmlFor="schedule-delivery" className="flex items-center gap-1.5 text-xs font-medium">
                                <CalendarClock size={14} className="text-blue-500" />
                                {isDelivery ? "Delivery Time & Rider" : "Est. Return Date"}
                              </Label>
                              {isDelivery && (
                                <div className="flex items-center gap-3">
                                  <Label className="flex items-center gap-1.5 cursor-pointer w-fit">
                                    <input 
                                      type="checkbox" 
                                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-3.5 w-3.5"
                                      checked={isDeliveryMeet}
                                      onChange={(e) => {
                                        setIsDeliveryMeet(e.target.checked);
                                        if (e.target.checked) setIsDeliveryLobby(false);
                                      }}
                                    />
                                    <span className="text-[11px] text-slate-600 font-medium">Meet up</span>
                                  </Label>
                                  <Label className="flex items-center gap-1.5 cursor-pointer w-fit">
                                    <input 
                                      type="checkbox" 
                                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-3.5 w-3.5"
                                      checked={isDeliveryLobby}
                                      onChange={(e) => {
                                        setIsDeliveryLobby(e.target.checked);
                                        if (e.target.checked) setIsDeliveryMeet(false);
                                      }}
                                    />
                                    <span className="text-[11px] text-slate-600 font-medium">Lobby</span>
                                  </Label>
                                </div>
                              )}
                            </div>
                            <div className={isDelivery ? "grid grid-cols-[1.6fr_1fr] gap-1" : "flex flex-col gap-1"}>
                              <DateTimePicker
                                  id="schedule-delivery"
                                  value={deliveryScheduledTime}
                                  onChange={setDeliveryScheduledTime}
                                />
                                {isDelivery && (
                                  <select
                                    className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                                    value={deliveryRiderId}
                                    onChange={(e) => setDeliveryRiderId(e.target.value)}
                                  >
                                    <option value="">-- Assign Rider --</option>
                                    {riders.map(r => (
                                      <option key={`d-${r.id}`} value={r.id}>{r.name}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Admin Notes & Options */}
                        <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1.5 flex-1 min-h-[180px]">
                          <div className="flex items-center justify-between shrink-0">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"><MessageSquare size={14} className="text-indigo-500" /> Admin Note Logs</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                              onClick={() => setNoteLogsModalOpen(true)}
                              title="Expand Notes"
                            >
                              <Maximize2 size={12} />
                            </Button>
                          </div>
                          <div className="flex flex-col gap-1.5 flex-1 overflow-hidden">
                            {adminLogs.length > 0 ? (
                              <div 
                                className="flex-1 min-h-0 overflow-y-auto space-y-1.5 bg-slate-50 p-2 rounded-lg border border-slate-100 text-[10px] cursor-pointer hover:bg-slate-100/30 transition-colors"
                                onClick={() => setNoteLogsModalOpen(true)}
                                title="Click to expand note logs"
                              >
                                {adminLogs.map((log, i) => (
                                  <div key={log.id || i} className="group relative p-2 rounded-lg bg-white border border-slate-100 shadow-sm">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className={`font-bold text-[10px] uppercase ${log.userId === 'system' ? 'text-indigo-600' : 'text-slate-700'}`}>
                                        {log.userName || (log as any).createdBy || "System"}
                                      </span>
                                      <span className="text-[9px] text-slate-400">
                                        {format(new Date(log.timestamp || (log as any).createdAt), "MMM d, HH:mm")}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{log.text}</p>
                                    {log.imageUrls && log.imageUrls.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {log.imageUrls.map((url, idx) => (
                                          <div 
                                            key={idx} 
                                            className="relative w-10 h-10 rounded-lg border border-slate-200 overflow-hidden cursor-pointer bg-slate-100 shadow-sm"
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
                                className="text-[10px] text-slate-400 italic px-1 flex-1 flex items-center justify-center border border-slate-100 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100/30 transition-colors"
                                onClick={() => setNoteLogsModalOpen(true)}
                                title="Click to expand note logs"
                              >
                                No notes yet...
                              </div>
                            )}
                            <div className="flex flex-col gap-1 shrink-0 mt-1">
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-2 rounded-lg border bg-white border-slate-200 text-slate-500"
                                  onClick={() => {
                                    setNoteLogsModalOpen(true);
                                    setShowNoteUploader(true);
                                  }}
                                  title="Attach images"
                                >
                                  <Paperclip size={14} />
                                </Button>
                                <Input
                                  placeholder="Type a note & press Enter..."
                                  value={adminNoteInput}
                                  onChange={(e) => setAdminNoteInput(e.target.value)}
                                  onClick={() => setNoteLogsModalOpen(true)}
                                  className="h-8 text-xs bg-white flex-1 rounded-lg"
                                />
                                <Button 
                                  type="button" 
                                  size="sm" 
                                  className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                                  onClick={() => setNoteLogsModalOpen(true)}
                                >
                                  <Plus size={14} />
                                  <span className="ml-1">Send</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>

                    </motion.div>

                    {/* COL 2: Logistics & Map (span 4) */}
                    <motion.div
                      className="lg:col-span-4 flex flex-col gap-1.5 bg-white p-2 rounded-xl border border-slate-200 shadow-sm overflow-hidden"
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
                              maxFiles={4}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Pickup Proofs</Label>
                            <MultiImageUploader
                              ref={user?.role === 'admin' ? pickupUploaderRef : undefined}
                              entityType="job"
                              entityId={editingJobId || Date.now().toString()}
                              subType="proofs"
                              value={pickupProofImageUrls}
                              onValueChange={user?.role === 'admin' ? setPickupProofImageUrls : undefined}
                              maxFiles={user?.role === 'admin' ? 5 : pickupProofImageUrls.length}
                              readOnly={user?.role !== 'admin'}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Delivery Proofs</Label>
                            <MultiImageUploader
                              ref={user?.role === 'admin' ? deliveryUploaderRef : undefined}
                              entityType="job"
                              entityId={editingJobId || Date.now().toString()}
                              subType="proofs"
                              value={deliveryProofImageUrls}
                              onValueChange={user?.role === 'admin' ? setDeliveryProofImageUrls : undefined}
                              maxFiles={user?.role === 'admin' ? 5 : deliveryProofImageUrls.length}
                              readOnly={user?.role !== 'admin'}
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
                                onChange={(e) => handleServiceOrSpeedChange(serviceType, serviceSpeed, Math.max(2, parseFloat(e.target.value) || 2))}
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

                    {/* COL 3: Fulfillment & Summary (span 4) */}
                    <motion.div
                      className="lg:col-span-4 flex flex-col gap-2 overflow-y-auto pl-1 pb-4 lg:pb-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.3 }}
                    >
                      {/* Summary Card */}
                      <div className="bg-slate-900 text-white rounded-xl p-3 shadow-md shrink-0">
                        {(user?.role === 'admin' || user?.role === 'cso') && (
                          <div className="flex justify-between items-center pb-2 mb-2 border-b border-slate-700/50">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Job Flag</span>
                            <Label className="flex items-center gap-1.5 cursor-pointer text-red-400 animate-in fade-in duration-200">
                              <input 
                                type="checkbox" 
                                checked={isStuck} 
                                onChange={(e) => setIsStuck(e.target.checked)} 
                                className="rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500 h-3.5 w-3.5"
                              />
                              <span className="text-xs font-bold">Stuck</span>
                            </Label>
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
                              return `${baseService.name} ${serviceWeight} ${baseService.unit || 'kg'} (${pricePerKg}x${serviceWeight} = ${Math.ceil(pricePerKg * serviceWeight)}฿)`;
                            })()}
                          </span>
                          {serviceSpeed !== "standard" && (
                            <div className="flex justify-between items-center mt-2">
                              <span className="text-xs text-orange-300 font-medium">Service Speed ({serviceSpeed === 'express_50' ? '+50%' : '+100%'})</span>
                              <span className="text-sm font-bold text-orange-300">฿{(serviceSpeed === 'express_50' ? Math.ceil(laundryPrice * 0.5) : laundryPrice).toFixed(0)}</span>
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

                          <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t border-slate-700">
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
                                <option value="Cash / COD">Cash / COD</option>
                                <option value="Transfer">Transfer</option>
                                <option value="Credit Card">Credit Card</option>
                                <option value="Gateway">Gateway</option>
                                <option value="PromptPay">PromptPay</option>
                                <option value="Deduct Member">Deduct Member</option>
                                <option value="HQ/Credit">HQ/Credit</option>
                              </select>
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
                                {paymentChannel === "Cash / COD" && paymentMethod === "unpaid" && (
                                  <Label className="flex items-center gap-1.5 cursor-pointer text-[11px] ml-2 animate-in fade-in duration-200">
                                    <input 
                                      type="checkbox" 
                                      checked={cashPlaced} 
                                      onChange={(e) => setCashPlaced(e.target.checked)} 
                                      className="rounded border-slate-600 bg-slate-800 text-amber-500 focus:ring-amber-500 h-3 w-3"
                                    />
                                    <span className="font-medium text-amber-400">วางเงินแล้ว</span>
                                  </Label>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-end mb-2">
                          <div className="flex flex-col gap-0.5">
                             <Label className="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" checked={isFreeDelivery} onChange={(e) => setIsFreeDelivery(e.target.checked)} />
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

                        {(isPickup || isDelivery) && (
                          <div className="flex justify-between items-end mt-3 pt-3 border-t border-slate-700/50">
                            <div className="flex flex-col">
                              <span className="text-xs text-amber-400 font-medium">Est. Rider Commission</span>
                              <span className="text-[10px] text-slate-500">Distance × 2฿</span>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-bold text-amber-400">
                                ฿{selectedVIPLabel || isFreeDelivery ? "0" : ((isPickup ? Math.floor(pickupDist) * 2 : 0) + (isDelivery ? Math.floor(deliveryDist) * 2 : 0)).toFixed(0)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>



                    </motion.div>
                  </div>
                  ) : (
                    <div className="h-full w-full bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <AdminLogs jobId={editingJobId || undefined} />
                    </div>
                  )}
                </div>
                
                {!showJobLogs && (
                  <DialogFooter className="mt-0 p-4 border-t border-slate-200 bg-white shrink-0">
                    <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
                      Cancel
                    </Button>
                    <Button 
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed" 
                      onClick={handleCreate}
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
                </DialogFooter>
                )}
                </DialogContent>
              </Dialog>
            )}

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
                        <div key={log.id || i} className="group relative p-3 rounded-xl bg-white border border-slate-200 shadow-sm">
                          <div className="flex justify-between items-center mb-1">
                            <span className={`font-bold text-xs uppercase ${log.userId === 'system' ? 'text-indigo-600' : 'text-slate-700'}`}>
                              {log.userName || (log as any).createdBy || "System"}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {format(new Date(log.timestamp || (log as any).createdAt), "MMM d, yyyy HH:mm")}
                            </span>
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

          {/* Dynamic Content Views */}
          {activeTab === "dashboard" && hasAccess("dashboard") && <AdminDashboard jobs={jobs} />}
          {activeTab === "jobs" && hasAccess("jobs") && <AdminAllJobs jobs={jobs} onEditJob={handleEditFullJob} onCreateJob={handleCreateNewJob} />}
          {activeTab === "dispatch" && hasAccess("dispatch") && <AdminDispatch onEditJob={handleEditFullJob} />}
          {activeTab === "riders" && hasAccess("riders") && <AdminRiders />}
          {activeTab === "map" && hasAccess("map") && <AdminLiveMap />}
          {activeTab === "pos" && hasAccess("pos") && <AdminPOS />}
          {activeTab === "services" && hasAccess("services") && <AdminServiceMenu />}
          {activeTab === "customers" && hasAccess("customers") && <AdminCRM />}
        {activeTab === "calculator" && <FeeCalculatorPage />}
          {activeTab === "settings" && hasAccess("settings") && <AdminSettings />}
          {activeTab === "users" && hasAccess("users") && <AdminUsers />}


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
          onOpenChange={(open) => {
            setCustomerDialogOpen(open);
            if (!open) setSelectedProfileCustomer(null);
          }}
          customer={selectedProfileCustomer}
          onSaved={(c) => {
            setServiceWeight(2);
            setOtherClothingName("");
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
            
            setPickupLoc(c.defaultAddress);
            setPickupRoom(c.secondaryAddress || "");
            setPickupCoords(c.defaultCoords);
            
            setDeliveryLoc(c.defaultAddress);
            setDeliveryRoom(c.secondaryAddress || "");
            setDeliveryCoords(c.defaultCoords);
            
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
        />
      </motion.div>
    </AnimatePresence>
    
      <AdminCustomerProfileModal
        open={profileOpen}
        onOpenChange={setProfileOpen}
        customer={selectedProfileCustomer}
      />
    </ProtectedRoute>
  );
}
