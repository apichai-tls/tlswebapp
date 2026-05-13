"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/logo";
import { ProtectedRoute } from "@/components/protected-route";
import { useJobs } from "@/lib/use-jobs";
import { useCustomers } from "@/lib/use-customers";
import { jobStore, calculateFee, shopStore, getClosestShopIndex, type Job, type JobStatus, type LatLng, type ServiceType } from "@/lib/store";
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
import { LocationInput } from "@/components/location-input";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminAllJobs } from "@/components/admin-all-jobs";
import { AdminRiders } from "@/components/admin-riders";
import { DateTimePicker } from "@/components/ui/datetime-picker";
import { AdminLiveMap } from "@/components/map-loader";
import { AdminPOS } from "@/components/admin-pos";
import { AdminServiceMenu } from "@/components/admin-service-menu";
import { AdminCRM } from "@/components/admin-crm";
import { AdminSettings } from "@/components/admin-settings";
import { AdminDispatch } from "@/components/admin-dispatch";
import { AdminUsers } from "@/components/admin-users";
import { AdminVerify } from "@/components/admin-verify";
import { MultiImageUploader, type MultiImageUploaderRef } from "@/components/ui/multi-image-uploader";
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
  ArrowDownUp,
  Store,
  ShieldCheck,
  X,
  CreditCard,
  Tag,
  Search,
  ShoppingCart,
  Zap,
  LogOut,
  Settings,
  CalendarClock,
  Calculator,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";

const statusConfig: Record<JobStatus, { label: string; className: string }> = {
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
  pickup_completed: {
    label: "Pickup Completed",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-50 text-red-700 border-red-200 hover:bg-red-50",
  },
};

const statusIcon: Record<JobStatus, React.ReactNode> = {
  pending: <Clock size={13} />,
  accepted: <Truck size={13} />,
  pickup: <Package size={13} />,
  delivery: <Navigation size={13} />,
  completed: <CheckCircle2 size={13} />,
  active: <Zap size={13} />,
  pickup_completed: <CheckCircle2 size={13} />,
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
  const [activeTab, setActiveTab] = useState<"dashboard" | "jobs" | "dispatch" | "riders" | "map" | "pos" | "services" | "customers" | "settings" | "users" | "verify">("dashboard");

  // Restore tab from URL hash
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    const validTabs = ["dashboard", "jobs", "dispatch", "riders", "map", "pos", "services", "customers", "settings", "users", "verify"];
    if (validTabs.includes(hash)) {
      setActiveTab(hash as any);
    }
  }, []);

  const handleTabChange = (tab: "dashboard" | "jobs" | "dispatch" | "riders" | "map" | "pos" | "services" | "customers" | "settings" | "users" | "verify") => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedVIPLabel, setSelectedVIPLabel] = useState("");

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
  const [deliveryLoc, setDeliveryLoc] = useState("");
  const [deliveryCoords, setDeliveryCoords] = useState<LatLng | null>(null);
  
  const [isPickup, setIsPickup] = useState(true);
  const [isDelivery, setIsDelivery] = useState(true);
  const [isDeliveryDirty, setIsDeliveryDirty] = useState(false); // Track if user manually changed delivery

  const [pickupDist, setPickupDist] = useState(0);
  const [deliveryDist, setDeliveryDist] = useState(0);

  const [selectedStoreIndex, setSelectedStoreIndex] = useState(0);
  const [serviceType, setServiceType] = useState<ServiceType>("wash_fold");
  const roundToNearest5 = (date: Date) => {
    const ms = 1000 * 60 * 5;
    return new Date(Math.round(date.getTime() / ms) * ms);
  };

  const [pickupScheduledTime, setPickupScheduledTime] = useState(format(roundToNearest5(new Date()), "yyyy-MM-dd'T'HH:mm"));
  const [deliveryScheduledTime, setDeliveryScheduledTime] = useState(format(roundToNearest5(new Date(Date.now() + 86400000)), "yyyy-MM-dd'T'HH:mm"));
  const [paymentMethod, setPaymentMethod] = useState("unpaid");
  const [pickupRiderId, setPickupRiderId] = useState("");
  const [deliveryRiderId, setDeliveryRiderId] = useState("");
  const [bagImageUrls, setBagImageUrls] = useState<string[]>([]);
  const [isFreeDelivery, setIsFreeDelivery] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [showAdminNote, setShowAdminNote] = useState(false);
  const [handoverType, setHandoverType] = useState<"meet" | "lobby">("meet");
  const [serviceSpeed, setServiceSpeed] = useState<"standard" | "express_50" | "express_100">("standard");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [laundryPrice, setLaundryPrice] = useState(0);
  const [editingFeeLock, setEditingFeeLock] = useState<number | null>(null);
  const uploaderRef = useRef<MultiImageUploaderRef>(null);

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
  const acceptedCount = jobs.filter((j) => j.status === "accepted").length;
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
    setCustomerName("");
    setCustomerPhone("");
    setPickupLoc("");
    setPickupCoords(null);
    setDeliveryLoc("");
    setDeliveryCoords(null);
    setIsPickup(true);
    setIsDelivery(true);
    setServiceType("wash_fold");
    setPaymentMethod("unpaid");
    setLaundryPrice(0);
    setEditingFeeLock(null);
    setSelectedVIPLabel("");
    setBagImageUrls([]);
    setAdminNote("");
    setPickupRiderId("");
    setDeliveryRiderId("");
    setPickupDist(0);
    setDeliveryDist(0);
    setPickupScheduledTime(format(roundToNearest5(new Date()), "yyyy-MM-dd'T'HH:mm"));
    setDeliveryScheduledTime(format(roundToNearest5(new Date(Date.now() + 86400000)), "yyyy-MM-dd'T'HH:mm"));
    setDialogOpen(true);
  };

  const handleEditFullJob = (job: Job) => {
    setCustomerName(job.customerName || "");
    setCustomerPhone(job.customerPhone || "");
    const isPickupService = !!job.pickupLocation && !shopLocations.some(s => s.address === job.pickupLocation);
    const isDeliveryService = !!job.dropoffLocation && !shopLocations.some(s => s.address === job.dropoffLocation);

    setPickupLoc(isPickupService ? job.pickupLocation || "" : "");
    if (isPickupService && job.pickupCoords) setPickupCoords(job.pickupCoords);
    else setPickupCoords(null);
    
    setDeliveryLoc(isDeliveryService ? job.dropoffLocation || "" : "");
    if (isDeliveryService && job.dropoffCoords) setDeliveryCoords(job.dropoffCoords);
    else setDeliveryCoords(null);
    setPickupDist(job.pickupDistance || 0);
    setDeliveryDist(job.deliveryDistance || 0);
    setServiceType((job.serviceType as ServiceType) || "wash_fold");
    setPaymentMethod(job.paymentMethod || "unpaid");
    setLaundryPrice(Math.max(0, (job.totalAmount || 0) - (job.fee || 0)));
    setEditingFeeLock(job.fee);
    
    const matchedCustomer = customers.find(c => 
      (job.customerId && c.id === job.customerId) || 
      (job.customerName && c.name === job.customerName) || 
      (job.customerPhone && c.phone === job.customerPhone)
    );
    setSelectedVIPLabel(matchedCustomer?.isVIP ? "VIP" : "");
    
    setBagImageUrls([]);
    fetch(`/api/jobs/${job.id}/details`)
      .then(r => r.json())
      .then(data => {
        let bags: string[] = [];
        if (data.bagImageUrl) {
          try {
            const parsed = JSON.parse(data.bagImageUrl);
            const rawBags = Array.isArray(parsed) ? parsed : [parsed];
            bags = rawBags.map((url: string) => {
              if (typeof url === 'string' && !url.startsWith('http') && !url.startsWith('/')) {
                const cleanPath = url.replace(/^["'\\]+|["'\\]+$/g, '');
                return `https://storage.googleapis.com/tls-images-test/${cleanPath}`;
              }
              return url;
            });
          } catch {
            const url = data.bagImageUrl;
            if (typeof url === 'string' && !url.startsWith('http') && !url.startsWith('/')) {
              const cleanPath = url.replace(/^["'\\]+|["'\\]+$/g, '');
              bags = [`https://storage.googleapis.com/tls-images-test/${cleanPath}`];
            } else {
              bags = [url];
            }
          }
        }
        setBagImageUrls(bags);
      })
      .catch(e => console.error("Failed to fetch bag images", e));
    
    setAdminNote(job.remark || "");
    setPickupScheduledTime(format(roundToNearest5(new Date(job.pickupScheduledAt || job.scheduledAt || Date.now())), "yyyy-MM-dd'T'HH:mm"));
    setDeliveryScheduledTime(format(roundToNearest5(new Date(job.deliveryScheduledAt || Date.now() + 86400000)), "yyyy-MM-dd'T'HH:mm"));
    setPickupRiderId(job.pickupRiderId || "");
    setDeliveryRiderId(job.deliveryRiderId || "");

    setIsPickup(isPickupService);
    setIsDelivery(isDeliveryService);

    setEditingJobId(job.id);
    setDialogOpen(true);
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
    if (!isPickup && !isDelivery) {
      toast.error("Please select at least one service (Pickup or Delivery).");
      return;
    }
    
    const shop = shopLocations[selectedStoreIndex] || shopLocations[0];

    // Parse scheduled pickup time for today
    const pDate = parseTime(pickupScheduledTime);
    
    setIsSubmitting(true);
    let finalBagImageUrls: string[] = [];
    try {
      if (uploaderRef.current) {
        finalBagImageUrls = await uploaderRef.current.startUpload();
      }
    } catch (err) {
      setIsSubmitting(false);
      return; // Stop creation if upload fails
    }

    const newJobData = {
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickupLocation: isPickup ? pickupLoc.trim() : shop.address,
      dropoffLocation: isDelivery ? deliveryLoc.trim() : shop.address,
      pickupCoords: isPickup && pickupCoords ? pickupCoords : shop.coords,
      dropoffCoords: isDelivery && deliveryCoords ? deliveryCoords : shop.coords,
      scheduledAt: pDate || null,
      pickupScheduledAt: pDate || null,
      deliveryScheduledAt: isDelivery ? (deliveryScheduledTime ? parseTime(deliveryScheduledTime) : null) : null,
      pickupRiderId: isPickup ? pickupRiderId || null : null,
      deliveryRiderId: isDelivery ? deliveryRiderId || null : null,
      bagImageUrl: finalBagImageUrls.length > 0 ? JSON.stringify(finalBagImageUrls) : null,
      paymentMethod: paymentMethod === 'unpaid' ? null : (paymentMethod as any),
      fee,
      totalAmount: laundryPrice + fee,
      serviceType,
      pickupDistance: isPickup ? pickupDist : 0,
      deliveryDistance: isDelivery ? deliveryDist : 0,
      pickupCommission: (isPickup && !selectedVIPLabel) ? Math.floor(pickupDist * 2) * 2 : 0,
      deliveryCommission: (isDelivery && !selectedVIPLabel) ? Math.floor(deliveryDist) * 2 : 0,
      remark: [
        isFreeDelivery ? "ส่งฟรี" : "",
        serviceSpeed === "express_50" ? "ด่วน Express 50%" : "",
        serviceSpeed === "express_100" ? "ด่วนพิเศษ Express 100%" : "",
        handoverType === "lobby" ? "ฝากไว้ที่ Lobby / Concierge" : "นัดรับ/เจอตัว",
        adminNote ? `Note: ${adminNote}` : ""
      ].filter(Boolean).join(" | ") || null,
    };

    // Clean up nulls to avoid passing explicit nulls where the schema might not expect them, 
    // or just pass as is if schema allows. Actually, `api.updateJob` uses Object.assign.
    // It's safer to delete properties that are null if we don't want to explicitly set them,
    // but in an edit form, we DO want to clear them if they were removed!
    // So we'll pass null, and let `updateJobAction` handle `null` properly.

    try {
      if (editingJobId) {
        await jobStore.updateJobDetails(editingJobId, newJobData as any);
        toast.success(`Job updated successfully!`);
      } else {
        const job = await jobStore.addJob(newJobData as any);
        toast.success(`Job ${job.id} created — Fee ฿${job.fee.toFixed(0)} CMS${isFreeDelivery ? ' (Free)' : ''}`);
      }

      setPickupLoc("");
      setDeliveryLoc("");
      setIsDeliveryDirty(false);
      setIsFreeDelivery(false);
      setPickupScheduledTime(format(roundToNearest5(new Date()), "yyyy-MM-dd'T'HH:mm"));
      setDeliveryScheduledTime(format(roundToNearest5(new Date(Date.now() + 86400000)), "yyyy-MM-dd'T'HH:mm"));
      setPaymentMethod("unpaid");
      setPickupRiderId("");
      setDeliveryRiderId("");
      setBagImageUrls([]);
      setServiceType("wash_fold");
      setServiceSpeed("standard");
      setSelectedVIPLabel("");
      setAdminNote("");
      setShowAdminNote(false);
      setHandoverType("meet");
      setEditingJobId(null);
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
        <aside className="hidden lg:flex w-64 flex-col border-r border-slate-200 bg-white">
          <div className="flex h-20 items-center justify-center border-b border-slate-100 px-6">
            <Logo />
          </div>
          <nav className="flex-1 px-4 py-6 space-y-1">
            {hasAccess("dashboard") && (
              <motion.div
                onClick={() => handleTabChange("dashboard")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "dashboard" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <LayoutDashboard size={18} />
                Dashboard
              </motion.div>
            )}
            
            {hasAccess("services") && (
              <motion.div
                onClick={() => handleTabChange("services")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "services" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <Tag size={18} />
                Service Menu
              </motion.div>
            )}

            {hasAccess("pos") && (
              <motion.div
                onClick={() => handleTabChange("pos")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "pos" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <CreditCard size={18} />
                POS
              </motion.div>
            )}

            {hasAccess("jobs") && (
              <motion.div
                onClick={() => handleTabChange("jobs")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "jobs" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <Package size={18} />
                All Jobs
              </motion.div>
            )}


            {hasAccess("customers") && (
              <motion.div
                onClick={() => handleTabChange("customers")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "customers" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <Users size={18} />
                Customers (CRM)
              </motion.div>
            )}
            {hasAccess("dispatch") && (
              <motion.div
                onClick={() => handleTabChange("dispatch")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "dispatch" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <CalendarClock size={18} />
                Dispatch Schedule
              </motion.div>
            )}

            {hasAccess("riders") && (
              <motion.div
                onClick={() => handleTabChange("riders")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "riders" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <Truck size={18} />
                Riders
              </motion.div>
            )}

            {hasAccess("map") && (
              <motion.div
                onClick={() => handleTabChange("map")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "map" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <Map size={18} />
                Live Map
              </motion.div>
            )}
            
            {hasAccess("calculator") && (
              <Link href="/tools/fee-calculator" className="block">
                <motion.div
                  whileHover={{ x: 2 }}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer text-slate-500 hover:text-slate-900 hover:bg-slate-50`}
                >
                  <Calculator size={18} />
                  Distance Calculator
                </motion.div>
              </Link>
            )}

            {hasAccess("settings") && (
              <motion.div
                onClick={() => handleTabChange("settings")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "settings" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <Settings size={18} />
                Settings
              </motion.div>
            )}
            
            {hasAccess("users") && (
              <motion.div
                onClick={() => handleTabChange("users")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "users" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <ShieldCheck size={18} />
                Manage Users
              </motion.div>
            )}
          </nav>
          <div className="border-t border-slate-200 px-4 py-4 space-y-2">
            <Link href="/privacy">
              <Button variant="ghost" size="sm" className="w-full gap-2 text-slate-500 hover:text-slate-900 cursor-pointer justify-start">
                <ShieldCheck size={16} />
                Privacy Policy
              </Button>
            </Link>
            <Button variant="ghost" size="sm" className="w-full gap-2 text-red-500 hover:text-red-600 hover:bg-red-50 cursor-pointer justify-start" onClick={handleLogout}>
              <LogOut size={16} />
              Logout
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
              Dashboard
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

              {user?.role === 'admin' && (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
                <DialogHeader className="p-4 pb-3 border-b border-slate-200 bg-white shrink-0">
                  <DialogTitle className="flex items-center text-lg pr-6">
                    <div className="flex items-center gap-2">
                      <Package size={18} />
                      {editingJobId ? "Edit Job Details" : "Create New Job"}
                    </div>
                    {selectedVIPLabel && (
                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 font-bold ml-auto mt-0">
                        VIP {selectedVIPLabel}
                      </Badge>
                    )}
                  </DialogTitle>
                </DialogHeader>

                {/* Main Content Grid */}
                <div className="flex-1 overflow-y-auto lg:overflow-hidden p-3">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 h-full">
                    
                    {/* COL 1: Basic Info (span 3) */}
                    <motion.div
                      className="lg:col-span-3 flex flex-col gap-2 overflow-y-auto pr-1 pb-4 lg:pb-0"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1, duration: 0.3 }}
                    >
                      {/* Customer Info Card */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-2">
                        <div className="space-y-2 relative">
                          <Label htmlFor="customer-search" className="flex items-center gap-1.5 text-sm font-medium">
                            <Search size={14} className="text-blue-600" />
                            Search Customer
                          </Label>
                          <Input
                            id="customer-search"
                            placeholder="Search by name or phone..."
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
                              // Small delay to allow clicking on dropdown items
                              setTimeout(() => setShowCustomerDropdown(false), 200);
                            }}
                            className="h-8 text-xs"
                          />
                          
                          {showCustomerDropdown && customerSearchQuery && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto top-[100%]">
                              {filteredCustomers.length > 0 ? (
                                filteredCustomers.map(c => (
                                  <div
                                    key={c.id}
                                    className="px-3 py-2 text-xs cursor-pointer hover:bg-slate-50 flex items-center justify-between border-b border-slate-50 last:border-0"
                                    onClick={() => {
                                      setCustomerName(c.name);
                                      setCustomerPhone(c.phone);
                                      setPickupLoc(c.defaultAddress);
                                      setPickupCoords(c.defaultCoords);
                                      setDeliveryLoc(c.defaultAddress);
                                      setDeliveryCoords(c.defaultCoords);
                                      setIsDeliveryDirty(false);
                                      setSelectedStoreIndex(getClosestShopIndex(c.defaultCoords, shopLocations));
                                      setEditingFeeLock(null);
                                      
                                      if (c.isVIP) {
                                        setSelectedVIPLabel("VIP");
                                      } else {
                                        setSelectedVIPLabel("");
                                      }
                                      
                                      setCustomerSearchQuery("");
                                      setShowCustomerDropdown(false);
                                    }}
                                  >
                                    <div>
                                      <p className="font-semibold text-slate-800">{c.name}</p>
                                      <p className="text-[10px] text-slate-500">{c.phone}</p>
                                    </div>
                                    {c.isVIP && (
                                      <Badge variant="outline" className="text-[9px] py-0 h-4 bg-amber-50 text-amber-700 border-amber-200 font-bold">
                                        VIP
                                      </Badge>
                                    )}
                                  </div>
                                ))
                              ) : (
                                <div className="px-3 py-4 text-center text-xs text-slate-500 bg-slate-50">
                                  No customers found. Fill details manually below.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label htmlFor="custName" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                                <User size={12} />
                                Customer Name <span className="text-red-500">*</span>
                              </Label>
                            </div>
                            <Input
                              id="custName"
                              placeholder="Name"
                              value={customerName}
                              disabled={!!editingJobId}
                              onChange={(e) => {
                                setCustomerName(e.target.value);
                                setSelectedVIPLabel("");
                              }}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="custPhone" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                              <Phone size={12} />
                              Phone
                            </Label>
                            <Input
                              id="custPhone"
                              placeholder="Phone number"
                              value={customerPhone}
                              disabled={!!editingJobId}
                              onChange={(e) => setCustomerPhone(e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Service Info Card */}
                      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3">
                        <div className="space-y-2">
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

                        <div className="space-y-2">
                          <Label htmlFor="service-select" className="flex items-center gap-1.5 text-xs font-medium">
                            <ArrowDownUp size={14} className="text-purple-600" />
                            Laundry Service Type
                          </Label>
                          <select 
                            id="service-select"
                            className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                            value={serviceType}
                            onChange={(e) => setServiceType(e.target.value as ServiceType)}
                          >
                            <option value="wash_fold">Wash/Fold</option>
                            <option value="wash_iron_fold">Wash/Iron/Fold</option>
                          </select>
                        </div>

                        <div className="space-y-2 pt-1">
                          <Label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">Service Speed</Label>
                          <div className="grid grid-cols-3 gap-2">
                            <Label className={`flex items-center justify-center text-[10px] p-2 border rounded-lg cursor-pointer transition-colors ${serviceSpeed === "standard" ? "border-indigo-600 bg-indigo-50 font-bold text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                              <input type="radio" className="hidden" checked={serviceSpeed === "standard"} onChange={() => setServiceSpeed("standard")} />
                              Standard
                            </Label>
                            <Label className={`flex items-center justify-center text-[10px] p-2 border rounded-lg cursor-pointer transition-colors ${serviceSpeed === "express_50" ? "border-amber-500 bg-amber-50 font-bold text-amber-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                              <input type="radio" className="hidden" checked={serviceSpeed === "express_50"} onChange={() => setServiceSpeed("express_50")} />
                              Express 50%
                            </Label>
                            <Label className={`flex items-center justify-center text-[10px] p-2 border rounded-lg cursor-pointer transition-colors ${serviceSpeed === "express_100" ? "border-red-500 bg-red-50 font-bold text-red-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                              <input type="radio" className="hidden" checked={serviceSpeed === "express_100"} onChange={() => setServiceSpeed("express_100")} />
                              Express 100%
                            </Label>
                          </div>
                        </div>
                      </div>

                    </motion.div>

                    {/* COL 2: Logistics & Map (span 5) */}
                    <motion.div
                      className="lg:col-span-5 flex flex-col gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15, duration: 0.3 }}
                    >
                      <div className="flex items-center gap-4 shrink-0">
                        <Label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={isPickup}
                            onChange={(e) => {
                              setIsPickup(e.target.checked);
                              setEditingFeeLock(null);
                            }}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4"
                          />
                          <span className="text-sm font-medium text-slate-700">บริการไปรับ (Pickup)</span>
                        </Label>
                        <Label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={isDelivery}
                            onChange={(e) => {
                              setIsDelivery(e.target.checked);
                              setEditingFeeLock(null);
                            }}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4"
                          />
                          <span className="text-sm font-medium text-slate-700">บริการไปส่ง (Delivery)</span>
                        </Label>
                      </div>

                      <div className="flex flex-col gap-3 shrink-0">
                        {isPickup && (
                          <div className="space-y-2">
                            <Label htmlFor="pickup-location" className="flex items-center gap-1.5 text-xs font-medium">
                              <MapPin size={14} className="text-emerald-600" />
                              ที่อยู่ไปรับ (Pickup Address) <span className="text-red-500">*</span>
                            </Label>
                            <LocationInput
                              id="pickup-location"
                              placeholder="Customer pickup address"
                              value={pickupLoc}
                              onChange={(v) => {
                                setPickupLoc(v);
                              }}
                              onSelectLocation={(loc) => {
                                const newCoords = { lat: loc.lat, lng: loc.lng };
                                setPickupCoords(newCoords);
                                setSelectedStoreIndex(getClosestShopIndex(newCoords, shopLocations));
                                setEditingFeeLock(null);
                                if (!isDeliveryDirty) {
                                  setDeliveryLoc(loc.name);
                                  setDeliveryCoords(newCoords);
                                }
                              }}
                            />
                          </div>
                        )}

                        {isDelivery && (
                          <div className="space-y-2">
                            <Label htmlFor="delivery-location" className="flex items-center gap-1.5 text-xs font-medium">
                              <Navigation size={14} className="text-red-600" />
                              ที่อยู่ไปส่ง (Delivery Address) <span className="text-red-500">*</span>
                            </Label>
                            <LocationInput
                              id="delivery-location"
                              placeholder="Customer delivery address"
                              value={deliveryLoc}
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
                                  setSelectedStoreIndex(getClosestShopIndex(newCoords, shopLocations));
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Interactive Map */}
                      <div className="flex-1 min-h-[160px] lg:h-auto rounded-lg overflow-hidden border border-slate-200 mt-1 relative">
                        <CreateJobMap 
                          branchCoords={shopLocations[selectedStoreIndex]?.coords || { lat: 13.7417, lng: 100.5526 }} 
                          pickupCoords={isPickup ? pickupCoords : null}
                          deliveryCoords={isDelivery ? deliveryCoords : null}
                          onMarkerDrag={(type, coords) => {
                            setEditingFeeLock(null);
                            if (type === 'pickup') {
                              setPickupCoords(coords);
                              setSelectedStoreIndex(getClosestShopIndex(coords, shopLocations));
                              if (!isDeliveryDirty) {
                                setDeliveryCoords(coords);
                              }
                            } else if (type === 'delivery') {
                              setDeliveryCoords(coords);
                              setIsDeliveryDirty(true);
                              if (!isPickup) {
                                setSelectedStoreIndex(getClosestShopIndex(coords, shopLocations));
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
                      <div className="space-y-2 pt-1 border-t border-slate-100">
                        {isPickup && (
                          <div className="space-y-2">
                            <Label htmlFor="schedule-pickup" className="flex items-center gap-1.5 text-xs font-medium">
                              <Clock size={14} className="text-amber-500" />
                              Pickup Scheduled Time & Rider
                            </Label>
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

                        <div className={`grid grid-cols-[1.6fr_1fr] gap-2 ${isPickup ? 'pt-2 border-t border-slate-100' : ''}`}>
                          <div className="space-y-2">
                            <Label htmlFor="schedule-delivery" className="flex items-center gap-1.5 text-xs font-medium">
                              <CalendarClock size={14} className="text-blue-500" />
                              {isDelivery ? "Delivery Time & Rider" : "Est. Return Date"}
                            </Label>
                            <div className="flex flex-col gap-2">
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
                                  <option value="">-- Assign Delivery Rider --</option>
                                  {riders.map(r => (
                                    <option key={`d-${r.id}`} value={r.id}>{r.name}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="payment-method" className="flex items-center gap-1.5 text-xs font-medium">
                              <CreditCard size={14} className="text-slate-600" />
                              Payment Status
                            </Label>
                            <select
                              id="payment-method"
                              className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                              value={paymentMethod}
                              onChange={(e) => setPaymentMethod(e.target.value)}
                            >
                              <option value="unpaid">ยังไม่จ่าย (Unpaid)</option>
                              <option value="transfer">โอนเงิน (PromptPay)</option>
                              <option value="cash">จ่ายแล้ว (Cash)</option>
                              <option value="credit">หักเครดิต (Member)</option>
                            </select>
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
                      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-3 flex-1 flex flex-col">

                        {/* Laundry Bag Photo Upload */}
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <Label className="flex items-center gap-1.5 text-xs font-medium">
                            <Package size={14} className="text-indigo-600" />
                            Laundry Bag Photos
                          </Label>
                          <MultiImageUploader
                            ref={uploaderRef}
                            entityType="job"
                            entityId={Date.now().toString()} // Temp ID since job isn't created yet
                            subType="bags"
                            value={bagImageUrls}
                            onValueChange={setBagImageUrls}
                            maxFiles={5}
                          />
                        </div>


                        {/* Admin Notes & Options */}
                        <div className="space-y-2 pt-2 border-t border-slate-100 mt-auto">
                          <div className="grid grid-cols-2 gap-2 mt-1">
                            <Label className={`flex items-center justify-center gap-2 cursor-pointer p-2 border rounded-lg transition-colors ${handoverType === "meet" ? 'border-indigo-600 bg-indigo-50 font-medium' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <input 
                                type="radio" 
                                name="handoverType"
                                className="hidden"
                                checked={handoverType === "meet"}
                                onChange={() => setHandoverType("meet")}
                              />
                              <span className="text-xs text-slate-900 text-center">นัดรับ / เจอตัว<br/><span className="text-[10px] text-slate-500 font-normal">(Meet in person)</span></span>
                            </Label>
                            <Label className={`flex items-center justify-center gap-2 cursor-pointer p-2 border rounded-lg transition-colors ${handoverType === "lobby" ? 'border-indigo-600 bg-indigo-50 font-medium' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <input 
                                type="radio" 
                                name="handoverType"
                                className="hidden"
                                checked={handoverType === "lobby"}
                                onChange={() => setHandoverType("lobby")}
                              />
                              <span className="text-xs text-slate-900 text-center">ฝาก Lobby / Concierge<br/><span className="text-[10px] text-slate-500 font-normal">(Leave at Lobby)</span></span>
                            </Label>
                          </div>

                          {!showAdminNote ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs border-dashed border-slate-300 text-slate-500 hover:text-slate-700"
                              onClick={() => setShowAdminNote(true)}
                            >
                              <Plus size={14} className="mr-1" /> Add Admin Note
                            </Button>
                          ) : (
                            <div className="space-y-2">
                              <Label htmlFor="adminNote" className="text-xs font-medium text-slate-500">Admin Note</Label>
                              <Input
                                id="adminNote"
                                placeholder="Enter instructions..."
                                value={adminNote}
                                onChange={(e) => setAdminNote(e.target.value)}
                                className="h-8 text-xs bg-white"
                              />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Summary Card */}
                      <div className="bg-slate-900 text-white rounded-xl p-3 shadow-md shrink-0">
                        <div className="flex flex-col gap-1 mb-2 pb-2 border-b border-slate-700">
                          {isPickup && (
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-400">Pickup Dist.</span>
                              <span className="text-xs font-medium">{pickupDist} km (×2)</span>
                            </div>
                          )}
                          {isDelivery && (
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-400">Delivery Dist.</span>
                              <span className="text-xs font-medium">{deliveryDist} km</span>
                            </div>
                          )}
                        </div>

                        {/* Editable Laundry Price */}
                        <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-700">
                          <Label className="text-sm font-medium text-slate-300">Laundry Price (ราคาซัก)</Label>
                          <div className="relative w-24">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">฿</span>
                            <Input 
                              type="number"
                              className="h-8 pl-6 pr-2 bg-slate-800 border-slate-600 text-white font-bold text-right text-sm"
                              value={laundryPrice || ""}
                              onChange={e => setLaundryPrice(parseFloat(e.target.value) || 0)}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        
                        <div className="flex justify-between items-center mb-2">
                          <Label className="flex items-center gap-2 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 h-4 w-4 bg-slate-800"
                              checked={isFreeDelivery}
                              onChange={(e) => setIsFreeDelivery(e.target.checked)}
                            />
                            <span className="text-sm font-medium text-slate-300">ส่งฟรี (Free)</span>
                          </Label>
                        </div>

                        <div className="flex justify-between items-end">
                          <div className="flex flex-col">
                            <span className="text-xs text-slate-400">Delivery Fee ({selectedVIPLabel ? '4' : '10'}฿/km)</span>
                            <span className="text-[10px] text-slate-500">Min 30฿</span>
                          </div>
                          <div className="text-right">
                            {isFreeDelivery && <span className="text-sm line-through text-slate-500 mr-2">฿{baseFee.toFixed(0)}</span>}
                            <span className={`text-lg font-bold ${isFreeDelivery ? 'text-emerald-400' : 'text-slate-300'}`}>฿{fee.toFixed(0)}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-end mt-2 pt-2 border-t border-slate-600">
                          <span className="text-sm font-bold text-slate-300 uppercase">Grand Total</span>
                          <span className="text-3xl font-black text-indigo-400">฿{(laundryPrice + fee).toFixed(0)}</span>
                        </div>

                        {(isPickup || isDelivery) && (
                          <div className="flex justify-between items-end mt-3 pt-3 border-t border-slate-700/50">
                            <div className="flex flex-col">
                              <span className="text-xs text-amber-400 font-medium">Est. Rider Commission</span>
                              <span className="text-[10px] text-slate-500">Distance × 2฿</span>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-bold text-amber-400">
                                ฿{selectedVIPLabel ? "0" : ((isPickup ? Math.floor(pickupDist * 2) * 2 : 0) + (isDelivery ? Math.floor(deliveryDist) * 2 : 0)).toFixed(0)}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                </div>
                <DialogFooter className="mt-0 p-4 border-t border-slate-200 bg-white shrink-0">
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)} disabled={isSubmitting}>
                      Cancel
                    </Button>
                    <Button 
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 disabled:cursor-not-allowed" 
                      onClick={handleCreate}
                      disabled={isSubmitting || !customerName || (isPickup && !pickupLoc) || (isDelivery && !deliveryLoc)}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={16} className="animate-spin mr-2" />
                          Uploading & Saving...
                        </>
                      ) : (
                        editingJobId ? "Save Changes" : "Create Job"
                      )}
                    </Button>
                  </div>
                </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            </div>
          </header>

          {/* Dynamic Content Views */}
          {activeTab === "dashboard" && hasAccess("dashboard") && <AdminDashboard jobs={jobs} />}
          {activeTab === "jobs" && hasAccess("jobs") && <AdminAllJobs jobs={jobs} onEditJob={handleEditFullJob} />}
          {activeTab === "dispatch" && hasAccess("dispatch") && <AdminDispatch />}
          {activeTab === "riders" && hasAccess("riders") && <AdminRiders />}
          {activeTab === "map" && hasAccess("map") && <AdminLiveMap />}
          {activeTab === "pos" && hasAccess("pos") && <AdminPOS />}
          {activeTab === "services" && hasAccess("services") && <AdminServiceMenu />}
          {activeTab === "customers" && hasAccess("customers") && <AdminCRM />}
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
      </motion.div>
    </AnimatePresence>
    </ProtectedRoute>
  );
}
