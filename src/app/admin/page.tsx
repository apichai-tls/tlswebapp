"use client";

import { useState } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/logo";
import { ProtectedRoute } from "@/components/protected-route";
import { useJobs } from "@/lib/use-jobs";
import { useCustomers } from "@/lib/use-customers";
import { jobStore, calculateFee, shopStore, getClosestShopIndex, type JobStatus, type LatLng, type ServiceType } from "@/lib/store";
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
import { AdminLiveMap } from "@/components/map-loader";
import { AdminPOS } from "@/components/admin-pos";
import { AdminServiceMenu } from "@/components/admin-service-menu";
import { AdminCRM } from "@/components/admin-crm";
import { AdminSettings } from "@/components/admin-settings";
import { AdminDispatch } from "@/components/admin-dispatch";
import { AdminUsers } from "@/components/admin-users";
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
};

const statusIcon: Record<JobStatus, React.ReactNode> = {
  pending: <Clock size={13} />,
  accepted: <Truck size={13} />,
  pickup: <Package size={13} />,
  delivery: <Navigation size={13} />,
  completed: <CheckCircle2 size={13} />,
  active: <Zap size={13} />,
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
  const [activeTab, setActiveTab] = useState<"dashboard" | "jobs" | "dispatch" | "riders" | "map" | "pos" | "services" | "customers" | "settings" | "users">("dashboard");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  
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
  const [pickupScheduledTime, setPickupScheduledTime] = useState(format(new Date(), "HH:mm"));
  const [pickupRiderId, setPickupRiderId] = useState("");
  const [bagImageUrl, setBagImageUrl] = useState("");
  const [capturedImages, setCapturedImages] = useState<Record<string, string>>({});
  const [isFreeDelivery, setIsFreeDelivery] = useState(false);

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  const hasAccess = (key: string) => {
    if (user?.role === 'admin') return true;
    return user?.permissions?.includes(key);
  };

  // Fee calculation using the latest tuned formula (roundHalfUp)
  const roundHalfUp = (val: number) => Math.ceil(val * 2) / 2;
  
  const calculateTotalFee = () => {
    let total = 0;
    if (isPickup) {
      total += roundHalfUp(pickupDist * 2) * 10;
    }
    if (isDelivery) {
      total += roundHalfUp(deliveryDist) * 10;
    }
    return Math.max(isPickup || isDelivery ? 30 : 0, total);
  };

  const baseFee = calculateTotalFee();
  const fee = isFreeDelivery ? 0 : baseFee;

  const handleCapture = (jobId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImages(prev => ({ ...prev, [jobId]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

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
    const pDate = new Date();
    const [phours, pminutes] = pickupScheduledTime.split(":").map(Number);
    pDate.setHours(phours, pminutes, 0, 0);

    const job = await jobStore.addJob({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      pickupLocation: isPickup ? pickupLoc.trim() : shop.address,
      dropoffLocation: isDelivery ? deliveryLoc.trim() : shop.address,
      pickupCoords: isPickup && pickupCoords ? pickupCoords : shop.coords,
      dropoffCoords: isDelivery && deliveryCoords ? deliveryCoords : shop.coords,
      scheduledAt: pDate,
      pickupScheduledAt: pDate,
      pickupRiderId,
      distance: Math.max(pickupDist, deliveryDist), // legacy field, we store max
      fee,
      bagImageUrl,
      serviceType,
      remark: isFreeDelivery ? "ส่งฟรี" : undefined,
    });

    toast.success(`Job ${job.id} created — Fee ฿${job.fee.toFixed(0)} CMS${isFreeDelivery ? ' (Free)' : ''}`);
    setPickupLoc("");
    setDeliveryLoc("");
    setIsDeliveryDirty(false);
    setIsFreeDelivery(false);
    setDialogOpen(false);
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
                onClick={() => setActiveTab("dashboard")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "dashboard" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <LayoutDashboard size={18} />
                Dashboard
              </motion.div>
            )}
            
            {hasAccess("services") && (
              <motion.div
                onClick={() => setActiveTab("services")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "services" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <Tag size={18} />
                Service Menu
              </motion.div>
            )}

            {hasAccess("pos") && (
              <motion.div
                onClick={() => setActiveTab("pos")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "pos" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <CreditCard size={18} />
                POS
              </motion.div>
            )}

            {hasAccess("jobs") && (
              <motion.div
                onClick={() => setActiveTab("jobs")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "jobs" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <Package size={18} />
                All Jobs
              </motion.div>
            )}
            {hasAccess("customers") && (
              <motion.div
                onClick={() => setActiveTab("customers")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "customers" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <Users size={18} />
                Customers (CRM)
              </motion.div>
            )}
            {hasAccess("dispatch") && (
              <motion.div
                onClick={() => setActiveTab("dispatch")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "dispatch" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <CalendarClock size={18} />
                Dispatch Schedule
              </motion.div>
            )}

            {hasAccess("riders") && (
              <motion.div
                onClick={() => setActiveTab("riders")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "riders" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <Truck size={18} />
                Riders
              </motion.div>
            )}

            {hasAccess("map") && (
              <motion.div
                onClick={() => setActiveTab("map")}
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
                onClick={() => setActiveTab("settings")}
                whileHover={{ x: 2 }}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer ${activeTab === "settings" ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"}`}
              >
                <Settings size={18} />
                Settings
              </motion.div>
            )}
            
            {hasAccess("users") && (
              <motion.div
                onClick={() => setActiveTab("users")}
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
                    <DialogTrigger
                      render={
                        <Button className="gap-2 bg-slate-900 hover:bg-slate-800 text-white font-medium shadow-sm cursor-pointer border-none">
                          <Plus size={16} />
                          <span className="hidden sm:inline">Create New Job</span>
                          <span className="sm:hidden">New Job</span>
                        </Button>
                      }
                    />
                  </motion.div>
              <DialogContent className="w-full max-w-4xl p-3 md:p-4 max-h-[95vh] overflow-y-auto">
                <DialogHeader className="pb-1">
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    <Package size={18} />
                    Create New Job
                  </DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-0">
                  <motion.div
                    className="space-y-1.5 flex flex-col"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                  >
                    {/* Customer Quick Select */}
                    <div className="space-y-2">
                      <Label htmlFor="customer-select" className="flex items-center gap-1.5 text-sm font-medium">
                        <Users size={14} className="text-blue-600" />
                        Saved Contacts
                      </Label>
                      <select 
                        id="customer-select"
                        className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                        onChange={(e) => {
                          const cust = customers.find(c => c.id === e.target.value);
                          if (cust) {
                            setCustomerName(cust.name);
                            setCustomerPhone(cust.phone);
                            setPickupLoc(cust.defaultAddress);
                            setPickupCoords(cust.defaultCoords);
                            setDeliveryLoc(cust.defaultAddress);
                            setDeliveryCoords(cust.defaultCoords);
                            setIsDeliveryDirty(false);
                            setSelectedStoreIndex(getClosestShopIndex(cust.defaultCoords, shopLocations));
                          } else {
                            // Reset
                            setCustomerName("");
                            setCustomerPhone("");
                          }
                        }}
                      >
                        <option value="">-- Manual Entry --</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="custName" className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          <User size={12} />
                          Customer Name
                        </Label>
                        <Input
                          id="custName"
                          placeholder="Name"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
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
                          onChange={(e) => setCustomerPhone(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="store-select" className="flex items-center gap-1.5 text-xs font-medium">
                          <Store size={14} className="text-blue-600" />
                          Origin Store Branch
                        </Label>
                        <select 
                          id="store-select"
                          className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                          value={selectedStoreIndex}
                          onChange={(e) => setSelectedStoreIndex(Number(e.target.value))}
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

                      <div className="flex items-center gap-4 py-2">
                        <Label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={isPickup}
                            onChange={(e) => setIsPickup(e.target.checked)}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4"
                          />
                          <span className="text-sm font-medium text-slate-700">บริการไปรับ (Pickup)</span>
                        </Label>
                        <Label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={isDelivery}
                            onChange={(e) => setIsDelivery(e.target.checked)}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4"
                          />
                          <span className="text-sm font-medium text-slate-700">บริการไปส่ง (Delivery)</span>
                        </Label>
                      </div>

                      {isPickup && (
                        <div className="space-y-2">
                          <Label htmlFor="pickup-location" className="flex items-center gap-1.5 text-xs font-medium">
                            <MapPin size={14} className="text-emerald-600" />
                            ที่อยู่ไปรับ (Pickup Address)
                          </Label>
                          <LocationInput
                            id="pickup-location"
                            placeholder="Customer pickup address"
                            value={pickupLoc}
                            onChange={(v) => {
                              setPickupLoc(v);
                              if (!isDeliveryDirty) {
                                setDeliveryLoc(v);
                              }
                            }}
                            onSelectLocation={(loc) => {
                              const newCoords = { lat: loc.lat, lng: loc.lng };
                              setPickupCoords(newCoords);
                              setSelectedStoreIndex(getClosestShopIndex(newCoords, shopLocations));
                              if (!isDeliveryDirty) {
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
                            ที่อยู่ไปส่ง (Delivery Address)
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
                              if (!isPickup) {
                                setSelectedStoreIndex(getClosestShopIndex(newCoords, shopLocations));
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                      <div className="space-y-2">
                         <Label htmlFor="schedule" className="flex items-center gap-1.5 text-xs font-medium">
                          <Clock size={14} className="text-amber-500" />
                          Pickup Scheduled Time & Rider
                        </Label>
                        <div className="grid grid-cols-2 gap-3">
                          <Input
                            id="schedule-pickup"
                            type="time"
                            value={pickupScheduledTime}
                            onChange={(e) => setPickupScheduledTime(e.target.value)}
                            className="h-8 text-xs"
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
                        <p className="text-[10px] text-slate-500">Delivery assignment will be handled in the Order Lifecycle dashboard later.</p>
                      </div>
                    </div>
                    


                    {/* Laundry Bag Photo Upload */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <Label htmlFor="bagPhoto" className="flex items-center gap-1.5 text-xs font-medium">
                        <Package size={14} className="text-indigo-600" />
                        Laundry Bag Photo
                      </Label>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <Input 
                            id="bagPhoto" 
                            type="file" 
                            accept="image/*" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setBagImageUrl(URL.createObjectURL(file));
                              }
                            }}
                            className="cursor-pointer text-xs"
                          />
                        </div>
                        {bagImageUrl && (
                          <div className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden shrink-0 shadow-sm">
                            <img src={bagImageUrl} alt="Bag" className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-auto rounded-lg bg-slate-50 p-4 border border-slate-100 shadow-sm">
                      <div className="flex flex-col gap-1 mb-2 pb-2 border-b border-slate-200/60">
                        {isPickup && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Pickup Distance</span>
                            <span className="text-xs font-medium text-slate-700">{pickupDist} km (×2)</span>
                          </div>
                        )}
                        {isDelivery && (
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-500">Delivery Distance</span>
                            <span className="text-xs font-medium text-slate-700">{deliveryDist} km</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex justify-between items-center mb-2">
                        <Label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4"
                            checked={isFreeDelivery}
                            onChange={(e) => setIsFreeDelivery(e.target.checked)}
                          />
                          <span className="text-sm font-medium text-slate-700">ส่งฟรี (Free Delivery)</span>
                        </Label>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-slate-700">Calculated Fee</span>
                        <div className="text-right">
                          {isFreeDelivery && <span className="text-sm line-through text-slate-400 mr-2">฿{baseFee.toFixed(0)}</span>}
                          <span className={`text-2xl font-bold ${isFreeDelivery ? 'text-emerald-600' : 'text-slate-900'}`}>฿{fee.toFixed(0)}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 text-right">
                        ไปรับ: (ระยะทาง×2)×10 | ไปส่ง: ระยะทาง×10 (ขั้นต่ำ 30฿)
                      </p>
                    </div>
                  </motion.div>
                  
                  {/* Interactive Map */}
                  <motion.div 
                    className="h-[200px] md:h-auto md:min-h-[300px] rounded-lg overflow-hidden border border-slate-200"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <CreateJobMap 
                      branchCoords={shopLocations[selectedStoreIndex]?.coords || { lat: 13.7417, lng: 100.5526 }} 
                      pickupCoords={isPickup ? pickupCoords : null}
                      deliveryCoords={isDelivery ? deliveryCoords : null}
                      onMarkerDrag={(type, coords) => {
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
                  </motion.div>
                </div>
                <DialogFooter className="mt-0 pt-2 border-t border-slate-100">
                  <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="cursor-pointer h-8 text-xs">
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleCreate} className="bg-slate-900 hover:bg-slate-800 text-white cursor-pointer h-8 text-xs">
                    Create Job
                  </Button>
                </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            </div>
          </header>

          {/* Dynamic Content Views */}
          {activeTab === "dashboard" && hasAccess("dashboard") && <AdminDashboard jobs={jobs} />}
          {activeTab === "jobs" && hasAccess("jobs") && <AdminAllJobs jobs={jobs} />}
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
