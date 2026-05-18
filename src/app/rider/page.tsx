"use client";

import { useState, useEffect } from "react";
import { format, isToday, addDays, isSameDay, addMonths, isSameMonth } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/logo";
import { ProtectedRoute } from "@/components/protected-route";
import { useJobs } from "@/lib/use-jobs";
import { jobStore, Job } from "@/lib/store";
import { MiniMap } from "@/components/map-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MapPin,
  Navigation,
  Route,
  Banknote,
  CheckCircle2,
  User,
  ArrowLeft,
  Truck,
  Package,
  Clock,
  MapIcon,
  X,
  Phone,
  MessageCircle,
  ExternalLink,
  ShieldCheck,
  ZoomIn,
  Image as ImageIcon,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Crown
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useAuth } from "@/providers/auth-provider";

// Framer Motion variants
const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0, 0, 0.2, 1] as const } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.2 } },
};

const cardVariants = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      duration: 0.4,
      type: "spring" as const,
      stiffness: 260,
      damping: 22,
    },
  }),
  exit: { opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.2 } },
};

import { useRiders } from "@/lib/use-riders";
import { riderStore, shopStore } from "@/lib/store";
import { useCustomers } from "@/lib/use-customers";
import { useSyncExternalStore } from "react";



const RiderJobImages = ({ jobId, imageType }: { jobId: string, imageType: 'bagImageUrl' | 'proofImageUrl' }) => {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/details`)
      .then(r => r.json())
      .then(data => {
        const urlData = data[imageType];
        if (!urlData) return;
        let urls: string[] = [];
        try {
          const parsed = JSON.parse(urlData);
          const rawUrls = Array.isArray(parsed) ? parsed : [parsed];
          urls = rawUrls.map((u: string) => {
            if (typeof u === 'string' && !u.startsWith('http') && !u.startsWith('/')) {
              const cleanPath = u.replace(/^["'\\]+|["'\\]+$/g, '');
              return `https://storage.googleapis.com/tls-images-test/${cleanPath}`;
            }
            return u;
          });
        } catch {
          const u = urlData;
          if (typeof u === 'string' && !u.startsWith('http') && !u.startsWith('/')) {
            const cleanPath = u.replace(/^["'\\]+|["'\\]+$/g, '');
            urls = [`https://storage.googleapis.com/tls-images-test/${cleanPath}`];
          } else {
            urls = [u];
          }
        }
        setImages(urls);
      })
      .catch(e => console.error(`Failed to load ${imageType}`, e))
      .finally(() => setLoading(false));
  }, [jobId, imageType]);

  if (loading) return <div className="text-xs text-slate-400 mt-2">Loading images...</div>;
  if (images.length === 0) return null;

  return (
    <>
      <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1.5 snap-x">
        {images.map((url, idx) => (
          <div 
            key={idx} 
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl border border-slate-200 overflow-hidden shadow-sm shrink-0 bg-slate-100 snap-center relative group cursor-pointer"
            onClick={() => setSelectedImage(url)}
          >
            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
              <ZoomIn className="text-white opacity-0 hover:opacity-100 transition-opacity drop-shadow-md pointer-events-none" size={32} />
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Image ${idx}`} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>

      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-3xl w-full h-[100dvh] sm:h-auto sm:w-[95vw] p-0 overflow-hidden bg-black/95 sm:bg-black/95 border-none rounded-none sm:rounded-2xl z-[100] flex flex-col justify-center items-center">
          <div className="relative w-full h-full sm:h-[85vh] flex items-center justify-center p-2 sm:p-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {selectedImage && <img src={selectedImage} alt="Full screen preview" className="max-w-full max-h-full object-contain pointer-events-none" />}
            <Button 
              variant="ghost" 
              className="absolute top-4 right-4 sm:top-2 sm:right-2 text-white bg-black/40 hover:bg-black/60 rounded-full w-10 h-10 p-0 flex items-center justify-center shadow-lg backdrop-blur-sm"
              onClick={() => setSelectedImage(null)}
            >
              <X size={24} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default function RiderPage() {
  const jobs = useJobs();
  const riders = useRiders();
  const customers = useCustomers();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const [activeTab, setActiveTab] = useState("myjobs");
  const [expandedMap, setExpandedMap] = useState<string | null>(null);
  const [capturedImages, setCapturedImages] = useState<Record<string, string>>({});
  const [showOnlinePopup, setShowOnlinePopup] = useState(false);
  const [gpsActive, setGpsActive] = useState(false);
  const { user, logout } = useAuth();
  
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [jobToComplete, setJobToComplete] = useState<Job | null>(null);
  const [historyDate, setHistoryDate] = useState<Date>(new Date());
  const [historyMode, setHistoryMode] = useState<"daily" | "monthly">("daily");

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  // Active Rider context
  const activeRider = riders.find(r => r.id === user?.id) || riders.find(r => r.id === "RIDER-01");
  const riderBranch = shopLocations.find(s => s.id === activeRider?.branchId);
  const showCommission = !riderBranch?.noCommission;

  useEffect(() => {
    if (activeRider && activeRider.status === "offline") {
      const hasSeenPopup = sessionStorage.getItem("riderWelcomed");
      if (!hasSeenPopup) {
        setShowOnlinePopup(true);
      }
    }
  }, [activeRider]);

  // Periodic data refresh (polling for Live updates)
  useEffect(() => {
    const interval = setInterval(() => {
      import("@/lib/api").then(m => m.refreshDb());
    }, 15000); // 15 seconds
    return () => clearInterval(interval);
  }, []);

  function handleGoOnline() {
    if (activeRider) {
      riderStore.updateRider(activeRider.id, { status: "online" });
      sessionStorage.setItem("riderWelcomed", "true");
      setShowOnlinePopup(false);
      toast.success("You are now online!");
    }
  }

  // GPS Tracking Logic
  useEffect(() => {
    if (!activeRider || activeRider.status === "offline") {
      setGpsActive(false);
      return;
    }

    let lastUpdate = 0;
    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsActive(true);
        const now = Date.now();
        if (now - lastUpdate > 15000) { // 15 seconds throttle
          lastUpdate = now;
          riderStore.updateRider(activeRider.id, { 
            currentLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude } 
          });
        }
      },
      (err) => {
        console.error("GPS Error:", err);
        setGpsActive(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, [activeRider?.id, activeRider?.status]);

  const myJobs = jobs.filter((j) => {
    if (!activeRider) return false;
    const isPickupRider = j.pickupRiderId === activeRider.id || j.riderId === activeRider.id;
    const isDeliveryRider = j.deliveryRiderId === activeRider.id;

    if (isPickupRider && !isDeliveryRider) {
      return ["pending", "accepted", "pickup"].includes(j.status);
    }
    if (isDeliveryRider && !isPickupRider) {
      return ["ready_for_delivery", "delivery"].includes(j.status);
    }
    if (isPickupRider && isDeliveryRider) {
      return ["pending", "accepted", "pickup", "ready_for_delivery", "delivery"].includes(j.status);
    }
    return false;
  }).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  const historyJobs = jobs.filter((j) => {
    if (!activeRider) return false;
    const isPickupRider = j.pickupRiderId === activeRider.id || j.riderId === activeRider.id;
    const isDeliveryRider = j.deliveryRiderId === activeRider.id;

    // Check if the job was completed TODAY (either scheduled today or completed today)
    // For jobs that are completely finished, we only show them if they finished today.
    // For jobs still in progress at the shop (active, pickup_completed, ready_for_delivery),
    // we always show them to the pickup rider so they don't lose track of their pending commissions.
    const isTerminal = ["completed", "cancelled"].includes(j.status);
    if (isTerminal) {
      const jobDate = j.completedAt ? new Date(j.completedAt) : new Date(j.scheduledAt);
      if (historyMode === "daily") {
        if (!isSameDay(jobDate, historyDate)) return false;
      } else {
        if (!isSameMonth(jobDate, historyDate) || jobDate.getFullYear() !== historyDate.getFullYear()) return false;
      }
    } else {
      if (historyMode === "daily" && !isToday(historyDate)) return false;
      if (historyMode === "monthly" && (!isSameMonth(historyDate, new Date()) || historyDate.getFullYear() !== new Date().getFullYear())) return false;
    }

    if (isPickupRider && !isDeliveryRider) {
      return ["pickup_completed", "active", "ready_for_delivery", "delivery", "completed", "cancelled"].includes(j.status);
    }
    if (isDeliveryRider && !isPickupRider) {
      return ["completed", "cancelled"].includes(j.status);
    }
    if (isPickupRider && isDeliveryRider) {
      return ["completed", "cancelled"].includes(j.status);
    }
    return false;
  }).sort((a, b) => {
    const aTime = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.scheduledAt).getTime();
    const bTime = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.scheduledAt).getTime();
    return bTime - aTime;
  });

  const totalHistoryJobs = historyJobs.filter(j => j.status !== 'cancelled').length;
  const totalCommission = historyJobs.filter(j => j.status !== 'cancelled').reduce((acc, job) => {
    let comm = 0;
    const isPickupRider = job.pickupRiderId === activeRider?.id || job.riderId === activeRider?.id;
    const isDeliveryRider = job.deliveryRiderId === activeRider?.id;
    
    if (isPickupRider && ["pickup_completed", "active", "ready_for_delivery", "delivery", "completed"].includes(job.status)) {
      comm += (job.pickupCommission || 0);
    }
    if (isDeliveryRider && job.status === "completed") {
      comm += (job.deliveryCommission || 0);
    }
    
    return acc + comm;
  }, 0);

  function handleAccept(jobId: string) {
    if (!activeRider) return;
    jobStore.acceptJob(jobId, activeRider.id);
    toast.success("Job started! You are now busy.", {
      icon: <CheckCircle2 size={18} className="text-emerald-500" />,
    });
    setExpandedMap(null);
    if (activeRider) {
       riderStore.updateRider(activeRider.id, { status: "busy" });
    }
  }

  function handleComplete(jobId: string) {
    const proofUrl = capturedImages[jobId];
    if (!proofUrl) {
      toast.error("Please take a photo as proof of delivery!");
      return;
    }
    
    jobStore.completeJob(jobId, proofUrl);
    toast.success("Job marked as completed! 🎉");
    // Return to online status if no other active jobs
    if (activeRider && myJobs.filter(j => j.status !== "completed").length <= 1) {
       riderStore.updateRider(activeRider.id, { status: "online" });
    }
  }

  function handleCapture(jobId: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImages(prev => ({ ...prev, [jobId]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  }

  function toggleMap(jobId: string) {
    setExpandedMap((prev) => (prev === jobId ? null : jobId));
  }

  function toggleRiderStatus() {
    if (!activeRider) return;
    if (activeRider.status === "busy") {
      toast.error("You cannot change status while working on an active job.");
      return;
    }
    const newStatus = activeRider.status === "online" ? "offline" : "online";
    riderStore.updateRider(activeRider.id, { status: newStatus });
    if (newStatus === "online") {
      toast.success("You are now online!");
    } else {
      toast("You are now offline.", { icon: "💤" });
    }
  }

  return (
    <ProtectedRoute allowedRole="rider">
      <AnimatePresence mode="wait">
        <motion.div
        className="min-h-screen bg-gray-50"
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        key="rider-page"
      >
        {/* Mobile Container */}
        <div className="mx-auto max-w-md min-h-screen flex flex-col shadow-2xl bg-white">
          {/* Header */}
          <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm pt-4 pb-4 px-4">
            <div className="flex items-start justify-between">
              {/* Left Side: Logo & Back */}
              <div className="flex flex-col items-start gap-4">
                <button onClick={handleLogout} className="text-red-500 hover:text-red-600 transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-widest pl-1 cursor-pointer py-1">
                  <LogOut size={12} /> Logout
                </button>
                <Logo className="h-[38px] w-auto ml-1" />
              </div>

              {/* Right Side: Rider Info Stacked */}
              <div className="flex gap-3 text-right">
                <div className="flex flex-col items-end justify-center pt-1">
                  <h3 className="font-bold text-slate-900 text-base leading-tight">{activeRider?.name || "Rider"}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="uppercase text-xs font-bold tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{activeRider?.vehiclePlate || "1กข 1234"}</span>
                    <span className="text-xs text-amber-500 font-bold">★ {activeRider?.rating.toFixed(1) || "5.0"}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5 justify-end">
                    {gpsActive && activeRider?.status !== 'offline' && (
                      <span className="flex items-center gap-1 mr-2 text-[10px] uppercase font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">
                        <MapPin size={10} className="animate-pulse" /> GPS ON
                      </span>
                    )}
                    <div className={`h-2 w-2 rounded-full ${
                      activeRider?.status === 'online' ? 'bg-emerald-500 animate-pulse' :
                      activeRider?.status === 'busy' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
                    }`} />
                    <span className={`text-xs font-bold uppercase tracking-wider ${
                      activeRider?.status === 'online' ? 'text-emerald-600' :
                      activeRider?.status === 'busy' ? 'text-amber-600' : 'text-slate-500'
                    }`}>{activeRider?.status || "Offline"}</span>
                  </div>
                </div>

                <button 
                  onClick={toggleRiderStatus}
                  className="relative group transition-transform hover:scale-105 active:scale-95 shrink-0"
                >
                  <motion.div
                    className={`h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md overflow-hidden border-[2.5px] bg-white ${
                      activeRider?.status === 'online' ? 'border-emerald-500' :
                      activeRider?.status === 'busy' ? 'border-amber-500' : 'border-slate-300'
                    }`}
                  >
                    {activeRider?.avatarUrl ? (
                      <img src={activeRider.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-slate-200"></div>
                    )}
                  </motion.div>
                </button>
              </div>
            </div>
          </header>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <div className="sticky top-[73px] z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 pt-3 pb-3">
              <TabsList className="grid w-full grid-cols-2 h-12 bg-slate-100 rounded-lg p-1">
                <TabsTrigger
                  value="myjobs"
                  className="gap-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 cursor-pointer rounded-md"
                >
                  <Truck size={15} />
                  My Jobs
                  {myJobs.length > 0 && (
                    <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                      {myJobs.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="gap-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 cursor-pointer rounded-md"
                >
                  <CheckCircle2 size={15} />
                  Job History
                  {historyJobs.length > 0 && (
                    <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                      {historyJobs.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* My Jobs */}
            <TabsContent value="myjobs" className="flex-1 px-4 py-4 space-y-3 mt-0">
              {myJobs.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-16 text-slate-400"
                >
                  <Truck size={48} strokeWidth={1} />
                  <p className="mt-3 text-sm font-medium">No jobs yet</p>
                  <p className="text-xs text-slate-400 mt-1">Accept a job to get started!</p>
                </motion.div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {myJobs.map((job, i) => {
                    const legType = ["pending", "accepted", "active", "pickup"].includes(job.status) ? "pickup" : "delivery";
                    const customer = customers.find(c => c.id === job.customerId);
                    const customerLanguage = customer?.language || "th";
                    const customerIsVip = customer?.isVIP || false;
                    const formattedTime = format(job.scheduledAt ? new Date(job.scheduledAt) : new Date(), "HH:mm");
                    const targetLocation = legType === 'pickup' ? job.pickupLocation : job.dropoffLocation;
                    
                    return (
                    <motion.div
                      key={job.id}
                      custom={i}
                      variants={cardVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      layout
                      whileHover={{ scale: 1.01 }}
                    >
                      <Card
                        onClick={() => setSelectedJob(job)}
                        className={`overflow-hidden border-slate-200 shadow-sm cursor-pointer hover:border-blue-300 transition-colors ${
                          (job.status === "completed" || job.status === "pickup_completed") ? "opacity-70" : ""
                        }`}
                      >
                        <CardHeader className="pb-3 pt-3 px-4">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-slate-900 leading-tight flex items-center gap-1.5">
                                {job.customerName || "Customer Guest"}
                                {customerIsVip && <Crown size={16} className="text-amber-500 fill-amber-500 shrink-0" />}
                              </h3>
                              {customerLanguage && (
                                <Badge variant="secondary" className={`text-[10px] px-1 py-0 h-4 ${customerLanguage.toLowerCase() === 'th' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : 'bg-orange-100 text-orange-700 hover:bg-orange-100'}`}>
                                  {customerLanguage.toUpperCase()}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <Badge
                                variant="outline"
                                className={`gap-1 text-[10px] py-0 px-1.5 h-5 ${legType === 'pickup' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                              >
                                {legType === 'pickup' ? <Package size={10} /> : <Truck size={10} />}
                                {legType.toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 text-slate-500 mt-1">
                            <Clock size={14} className="text-blue-500 shrink-0" />
                            <span className="text-sm font-bold text-slate-700">{formattedTime}</span>
                          </div>

                          <div className="flex items-start gap-2 text-slate-500 mt-2">
                            <MapPin size={14} className="text-red-500 shrink-0 mt-0.5" />
                            <span className="text-sm font-medium text-slate-700 line-clamp-1">{targetLocation}</span>
                          </div>
                          
                          {job.remark && (
                            <div className="flex items-start gap-2 text-slate-500 mt-2 bg-rose-50 p-2 rounded-lg border border-rose-100">
                              <span className="text-xs font-semibold text-rose-700 line-clamp-2">{job.remark}</span>
                            </div>
                          )}

                        </CardHeader>
                      </Card>
                    </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </TabsContent>

            {/* Job History */}
            <TabsContent value="history" className="flex-1 px-4 py-4 space-y-3 mt-0">
              <div className="flex bg-slate-100 p-1 rounded-xl mb-3">
                <button
                  onClick={() => setHistoryMode("daily")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${historyMode === "daily" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Daily
                </button>
                <button
                  onClick={() => setHistoryMode("monthly")}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${historyMode === "monthly" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  Monthly
                </button>
              </div>

              <div className="flex items-center justify-between mb-4 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                <Button variant="ghost" className="w-10 h-10 p-0 rounded-full" onClick={() => setHistoryDate(prev => historyMode === 'daily' ? addDays(prev, -1) : addMonths(prev, -1))}>
                  <ChevronLeft size={20} className="text-slate-500" />
                </Button>
                <div className="flex items-center gap-2 font-bold text-slate-700 relative overflow-hidden">
                  <CalendarIcon size={16} className="text-slate-400" />
                  {historyMode === 'daily' 
                    ? (isToday(historyDate) ? "Today" : format(historyDate, "dd MMM yyyy")) 
                    : format(historyDate, "MMMM yyyy")}
                  <input 
                    type={historyMode === 'daily' ? "date" : "month"}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                    value={historyMode === 'daily' ? format(historyDate, 'yyyy-MM-dd') : format(historyDate, 'yyyy-MM')}
                    onChange={(e) => {
                      if (e.target.value) {
                        const newDate = new Date(e.target.value);
                        if (!isNaN(newDate.getTime())) {
                          setHistoryDate(newDate);
                        }
                      }
                    }}
                  />
                </div>
                <Button 
                  variant="ghost" 
                  className={`w-10 h-10 p-0 rounded-full ${((historyMode === 'daily' && isToday(historyDate)) || (historyMode === 'monthly' && isSameMonth(historyDate, new Date()))) ? 'opacity-50' : ''}`}
                  onClick={() => {
                    if (historyMode === 'daily' && !isToday(historyDate)) setHistoryDate(prev => addDays(prev, 1));
                    if (historyMode === 'monthly' && !isSameMonth(historyDate, new Date())) setHistoryDate(prev => addMonths(prev, 1));
                  }}
                  disabled={(historyMode === 'daily' && isToday(historyDate)) || (historyMode === 'monthly' && isSameMonth(historyDate, new Date()))}
                >
                  <ChevronRight size={20} className="text-slate-500" />
                </Button>
              </div>

              {showCommission && (
                <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl p-4 text-white shadow-md mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-emerald-50 text-xs font-medium uppercase tracking-wider mb-1">
                      {historyMode === 'daily' 
                        ? (isToday(historyDate) ? "Today's Earnings" : "Earnings")
                        : "Monthly Earnings"}
                    </p>
                    <p className="text-2xl font-black">฿{totalCommission}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-50 text-xs font-medium uppercase tracking-wider mb-1">Total Jobs</p>
                    <p className="text-xl font-bold">{totalHistoryJobs}</p>
                  </div>
                </div>
              )}
              
              {!showCommission && (
                <div className="bg-gradient-to-r from-indigo-500 to-blue-500 rounded-xl p-4 text-white shadow-md mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-indigo-50 text-xs font-medium uppercase tracking-wider mb-1">
                      {historyMode === 'daily' 
                        ? (isToday(historyDate) ? "Today's Deliveries" : "Deliveries")
                        : "Monthly Deliveries"}
                    </p>
                    <p className="text-2xl font-black">{totalHistoryJobs} <span className="text-sm font-medium">Jobs</span></p>
                  </div>
                  <div className="text-right flex items-center justify-center">
                    <CheckCircle2 size={32} className="text-indigo-200/50" />
                  </div>
                </div>
              )}

              {historyJobs.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-16 text-slate-400"
                >
                  <CheckCircle2 size={48} strokeWidth={1} />
                  <p className="mt-3 text-sm font-medium">
                    No completed jobs {historyMode === 'daily' ? (isToday(historyDate) ? 'today' : 'on this date') : 'this month'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Completed jobs will appear here</p>
                </motion.div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {historyJobs.map((job, i) => {
                    const legType = (job.status === "completed" && job.deliveryRiderId === activeRider?.id) ? "delivery" : "pickup";
                    const customer = customers.find(c => c.id === job.customerId);
                    const customerLanguage = customer?.language || "th";
                    const customerIsVip = customer?.isVIP || false;
                    const formattedTime = format(job.scheduledAt ? new Date(job.scheduledAt) : new Date(), "HH:mm");
                    const targetLocation = legType === 'pickup' ? job.pickupLocation : job.dropoffLocation;
                    const commission = legType === 'pickup' ? (job.pickupCommission || 0) : (job.deliveryCommission || 0);
                    
                    return (
                    <motion.div
                      key={job.id}
                      custom={i}
                      variants={cardVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      layout
                      whileHover={{ scale: 1.01 }}
                    >
                      <Card 
                        className="overflow-hidden border-slate-200 shadow-sm opacity-70 cursor-pointer hover:opacity-100 transition-opacity"
                        onClick={() => setSelectedJob(job)}
                      >
                        <CardHeader className="pb-3 pt-3 px-4">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-black text-slate-900 leading-tight flex items-center gap-1.5">
                                {job.customerName || "Customer Guest"}
                                {customerIsVip && <Crown size={16} className="text-amber-500 fill-amber-500 shrink-0" />}
                              </h3>
                              {customerLanguage && (
                                <Badge variant="secondary" className={`text-[10px] px-1 py-0 h-4 ${customerLanguage.toLowerCase() === 'th' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : 'bg-orange-100 text-orange-700 hover:bg-orange-100'}`}>
                                  {customerLanguage.toUpperCase()}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              <Badge
                                variant="outline"
                                className={`gap-1 text-[10px] py-0 px-1.5 h-5 ${legType === 'pickup' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                              >
                                {legType === 'pickup' ? <Package size={10} /> : <Truck size={10} />}
                                {legType.toUpperCase()}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-[10px] py-0 px-1.5 h-5"
                              >
                                <CheckCircle2 size={10} />
                                Completed
                              </Badge>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-2 text-slate-500">
                              <Clock size={14} className="text-blue-500 shrink-0" />
                              <span className="text-sm font-bold text-slate-700">{formattedTime}</span>
                            </div>
                            {showCommission && (
                              <div className="flex items-center gap-1 font-bold text-emerald-600">
                                <span className="text-xs">+฿</span>
                                <span className="text-sm">{commission}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-start gap-2 text-slate-500 mt-2">
                            <MapPin size={14} className="text-red-500 shrink-0 mt-0.5" />
                            <span className="text-sm font-medium text-slate-700 line-clamp-1">{targetLocation}</span>
                          </div>
                        </CardHeader>
                      </Card>
                    </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </TabsContent>
          </Tabs>
          
          <div className="mt-8 text-center pb-8">
            <Link href="/privacy" className="inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider">
              <ShieldCheck size={14} />
              Privacy Policy
            </Link>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>

      <Dialog open={showOnlinePopup} onOpenChange={setShowOnlinePopup}>
        <DialogContent className="sm:max-w-md w-[90vw] rounded-2xl mx-auto p-6 bg-white border-none shadow-2xl">
          <DialogHeader className="space-y-4 text-center sm:text-center flex flex-col items-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-900">Go Online?</DialogTitle>
            <DialogDescription className="text-sm text-slate-500 font-medium px-4 leading-relaxed">
              You are currently offline. Would you like to go online now to start receiving and processing laundry jobs?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => {
                setShowOnlinePopup(false);
                sessionStorage.setItem("riderWelcomed", "true");
              }}
              className="w-full h-12 rounded-xl text-slate-600 border-slate-200 font-bold hover:bg-slate-50"
            >
              Stay Offline
            </Button>
            <Button
              onClick={handleGoOnline}
              className="w-full h-12 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-md shadow-emerald-600/20"
            >
              Go Online Now
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Job Detail Modal */}
      <Dialog open={!!selectedJob} onOpenChange={(open) => !open && setSelectedJob(null)}>
        <DialogContent showCloseButton={false} className="sm:max-w-md w-[95vw] rounded-2xl mx-auto p-0 bg-gray-50 border-none shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
          {selectedJob && (() => {
            const legType = ["pending", "accepted", "active", "pickup"].includes(selectedJob.status) ? "pickup" : "delivery";
            const targetLocation = legType === 'pickup' ? selectedJob.pickupLocation : selectedJob.dropoffLocation;
            const targetCoords = legType === 'pickup' ? selectedJob.pickupCoords : selectedJob.dropoffCoords;
            const distance = legType === 'pickup' ? (selectedJob.pickupDistance || selectedJob.distance || 0) : (selectedJob.deliveryDistance || selectedJob.distance || 0);

            return (
              <>
                <DialogHeader className="p-3 bg-white border-b border-slate-100 sticky top-0 z-10 shrink-0">
                  <div className="flex items-start justify-between">
                    <div className="pr-2">
                      <DialogTitle className="text-lg font-black text-slate-900 leading-tight">
                        {selectedJob.customerName || "Customer Guest"}
                      </DialogTitle>
                      <span className="font-mono text-[10px] font-bold tracking-wider text-slate-500 mt-0.5 block">
                        {selectedJob.id}
                      </span>
                      <div className="mt-1.5">
                        <a href={`tel:${selectedJob.customerPhone || '0812345678'}`} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors font-bold text-xs">
                          <Phone size={12} /> {selectedJob.customerPhone || 'No Phone Number'}
                        </a>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Button variant="ghost" className="h-8 w-8 p-0 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500" onClick={() => setSelectedJob(null)}>
                        <X size={18} />
                      </Button>
                      <Badge
                        variant="outline"
                        className={`gap-1.5 text-xs py-1 px-2 ${legType === 'pickup' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                      >
                        {legType === 'pickup' ? <Package size={14} /> : <Truck size={14} />}
                        {legType.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </DialogHeader>

                <div className="p-3 overflow-y-auto flex-1 space-y-2">
                  <div className="p-2.5 bg-white border border-slate-100 shadow-sm rounded-xl space-y-2">
                    <div className="flex items-start gap-3">
                      <MapPin size={18} className="text-red-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{legType === 'pickup' ? 'Pickup At' : 'Deliver To'}</p>
                        <p className="text-sm font-medium text-slate-800">{targetLocation}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Route size={16} />
                        <span className="text-sm font-bold">{distance} km</span>
                      </div>
                      <a 
                        href={`https://www.google.com/maps/dir/?api=1&destination=${targetCoords?.lat || 13.7},${targetCoords?.lng || 100.5}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-1 rounded-lg transition-colors font-bold text-xs"
                      >
                        <Navigation size={14} /> Navigate
                      </a>
                    </div>
                  </div>

                  {selectedJob.remark && (
                    <div className="p-2 bg-rose-50 border border-rose-100 shadow-sm rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-0.5">Instructions</p>
                      <p className="text-xs font-medium text-rose-800">{selectedJob.remark}</p>
                    </div>
                  )}

                  {selectedJob.adminNotesJson && (() => {
                    try {
                      const notes = JSON.parse(selectedJob.adminNotesJson);
                      if (notes.length > 0) {
                        return (
                          <div className="p-2 bg-amber-50 border border-amber-100 shadow-sm rounded-xl">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 mb-1">Admin Notes</p>
                            <div className="space-y-1">
                              {notes.map((n: any, i: number) => (
                                <div key={i} className="text-xs text-amber-800 bg-white/60 py-1 px-2 rounded">
                                  <span className="font-bold">{n.userName}:</span> {n.text}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                    } catch {}
                    return null;
                  })()}

                  {legType === 'pickup' && (
                    <div className="p-2 bg-white border border-slate-100 shadow-sm rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Laundry Bags</p>
                      <RiderJobImages jobId={selectedJob.id} imageType="bagImageUrl" />
                    </div>
                  )}

                  {selectedJob.status === 'completed' && (
                    <div className="p-2 bg-emerald-50 border border-emerald-100 shadow-sm rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">Proof of Activity</p>
                      <RiderJobImages jobId={selectedJob.id} imageType="proofImageUrl" />
                    </div>
                  )}
                </div>

                <DialogFooter className="p-3 bg-white border-t border-slate-100 sticky bottom-0 z-10 shrink-0">
                  {["active", "pickup", "delivery"].includes(selectedJob.status) ? (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm h-12 rounded-xl text-base"
                      onClick={() => {
                        setSelectedJob(null);
                        setJobToComplete(selectedJob);
                      }}
                    >
                      <CheckCircle2 size={20} className="mr-2" />
                      Mark as Completed
                    </Button>
                  ) : null}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Camera Proof Modal */}
      <Dialog open={!!jobToComplete} onOpenChange={(open) => {
        if (!open) {
          setJobToComplete(null);
        }
      }}>
        <DialogContent className="sm:max-w-md w-[95vw] rounded-2xl mx-auto p-0 bg-white border-none shadow-2xl overflow-hidden flex flex-col">
          {jobToComplete && (() => {
            const previewUrl = capturedImages[jobToComplete.id];
            return (
              <>
                <DialogHeader className="p-4 border-b border-slate-100">
                  <DialogTitle className="text-lg font-bold text-slate-900 text-center">
                    Proof of Completion
                  </DialogTitle>
                </DialogHeader>
                <div className="p-4">
                  <div className="relative aspect-[3/4] sm:aspect-video rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 overflow-hidden group">
                    {previewUrl ? (
                      <div className="relative w-full h-full">
                        <img src={previewUrl} className="w-full h-full object-cover" alt="Proof" />
                        <button 
                          onClick={() => setCapturedImages(prev => {
                            const next = {...prev};
                            delete next[jobToComplete.id];
                            return next;
                          })}
                          className="absolute top-3 right-3 h-10 w-10 rounded-full bg-red-500/90 text-white flex items-center justify-center shadow-lg backdrop-blur"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-colors">
                        <div className="flex flex-col items-center gap-4">
                          <div className="h-16 w-16 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 group-hover:text-indigo-500 group-hover:scale-110 transition-all border border-slate-100">
                            <ImageIcon size={32} />
                          </div>
                          <div className="text-center">
                            <p className="text-base font-bold text-slate-700">Take Photo Proof</p>
                            <p className="text-sm text-slate-400 mt-1">Tap to open camera</p>
                          </div>
                        </div>
                        <input 
                          type="file" 
                          accept="image/*" 
                          capture="environment" 
                          className="hidden" 
                          onChange={(e) => handleCapture(jobToComplete.id, e)}
                        />
                      </label>
                    )}
                  </div>
                </div>
                <DialogFooter className="p-4 pt-0">
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm h-14 rounded-xl text-base disabled:opacity-50"
                    disabled={!previewUrl}
                    onClick={() => {
                      handleComplete(jobToComplete.id);
                      setJobToComplete(null);
                    }}
                  >
                    <CheckCircle2 size={20} className="mr-2" />
                    Confirm Completion
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
