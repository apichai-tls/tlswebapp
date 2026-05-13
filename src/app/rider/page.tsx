"use client";

import { useState, useEffect } from "react";
import { format, isToday } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/logo";
import { ProtectedRoute } from "@/components/protected-route";
import { useJobs } from "@/lib/use-jobs";
import { jobStore } from "@/lib/store";
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
  Image as ImageIcon,
  LogOut
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
import { riderStore } from "@/lib/store";



const RiderBagImages = ({ jobId }: { jobId: string }) => {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/jobs/${jobId}/details`)
      .then(r => r.json())
      .then(data => {
        if (!data.bagImageUrl) return;
        let urls: string[] = [];
        try {
          const parsed = JSON.parse(data.bagImageUrl);
          const rawUrls = Array.isArray(parsed) ? parsed : [parsed];
          urls = rawUrls.map((u: string) => {
            if (typeof u === 'string' && !u.startsWith('http') && !u.startsWith('/')) {
              const cleanPath = u.replace(/^["'\\]+|["'\\]+$/g, '');
              return `https://storage.googleapis.com/tls-images-test/${cleanPath}`;
            }
            return u;
          });
        } catch {
          const u = data.bagImageUrl;
          if (typeof u === 'string' && !u.startsWith('http') && !u.startsWith('/')) {
            const cleanPath = u.replace(/^["'\\]+|["'\\]+$/g, '');
            urls = [`https://storage.googleapis.com/tls-images-test/${cleanPath}`];
          } else {
            urls = [u];
          }
        }
        setImages(urls);
      })
      .catch(e => console.error("Failed to load bag images", e))
      .finally(() => setLoading(false));
  }, [jobId]);

  if (loading) return <div className="text-xs text-slate-400 mt-2">Loading images...</div>;
  if (images.length === 0) return null;

  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {images.map((url, idx) => (
        <div key={idx} className="w-16 h-16 rounded-lg border border-slate-200 overflow-hidden shadow-sm shrink-0 bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`Bag ${idx}`} className="w-full h-full object-cover" />
        </div>
      ))}
    </div>
  );
};

export default function RiderPage() {
  const jobs = useJobs();
  const riders = useRiders();
  const [activeTab, setActiveTab] = useState("myjobs");
  const [expandedMap, setExpandedMap] = useState<string | null>(null);
  const [capturedImages, setCapturedImages] = useState<Record<string, string>>({});
  const [showOnlinePopup, setShowOnlinePopup] = useState(false);
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  // Active Rider context
  const activeRider = riders.find(r => r.id === user?.id) || riders.find(r => r.id === "RIDER-01");

  useEffect(() => {
    if (activeRider && activeRider.status === "offline") {
      const hasSeenPopup = sessionStorage.getItem("riderWelcomed");
      if (!hasSeenPopup) {
        setShowOnlinePopup(true);
      }
    }
  }, [activeRider]);

  function handleGoOnline() {
    if (activeRider) {
      riderStore.updateRider(activeRider.id, { status: "online" });
      sessionStorage.setItem("riderWelcomed", "true");
      setShowOnlinePopup(false);
      toast.success("You are now online!");
    }
  }

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
  });

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
      if (!isToday(jobDate)) return false;
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
                  <div className="flex items-center gap-1.5 mt-1.5">
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
                        className={`overflow-hidden border-slate-200 shadow-sm ${
                          (job.status === "completed" || job.status === "pickup_completed") ? "opacity-70" : ""
                        }`}
                      >
                        <CardHeader className="pb-3 pt-4 px-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex flex-col">
                              <span className="font-mono text-xs font-bold tracking-wider text-slate-400 mb-1">
                                {job.id}
                              </span>
                              <div className="flex items-center gap-3">
                                <h3 className="text-base font-bold text-slate-900 leading-none">{job.customerName || "Customer Guest"}</h3>
                                <a href="tel:0812345678" className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors" title="Call Customer">
                                  <Phone size={14} />
                                </a>
                                <a href="https://line.me" target="_blank" className="flex items-center justify-center w-8 h-8 rounded-full bg-[#00B900]/10 text-[#00B900] hover:bg-[#00B900]/20 transition-colors" title="Message via Line">
                                  <MessageCircle size={14} />
                                </a>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge
                                variant="outline"
                                className={`gap-1 text-xs py-0.5 ${legType === 'pickup' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                              >
                                {legType === 'pickup' ? <Package size={12} /> : <Truck size={12} />}
                                {legType.toUpperCase()}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`gap-1 text-xs py-0.5 ${
                                  (job.status !== "completed" && job.status !== "pickup_completed")
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}
                              >
                                {(job.status !== "completed" && job.status !== "pickup_completed") ? <Truck size={12} /> : <CheckCircle2 size={12} />}
                              {(job.status !== "completed" && job.status !== "pickup_completed") ? "In Progress" : "Completed"}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-3 space-y-3">
                          <div className="p-3 bg-white border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] rounded-xl relative">
                            <div className="absolute left-[20px] top-8 bottom-8 border-l-2 border-dashed border-slate-200"></div>
                            
                            <div className="flex flex-col gap-4 relative z-10">
                              <div className="flex items-start gap-4">
                                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-emerald-400 bg-white"></div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Pickup</p>
                                  <p className="text-sm font-semibold text-slate-700 leading-snug pr-2">
                                    {legType === 'delivery' ? 'Store Branch' : job.pickupLocation}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="flex items-start gap-4">
                                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-red-500 bg-white"></div>
                                <div className="flex-1 min-w-0 flex items-center gap-2 justify-between">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Drop-off</p>
                                    <p className="text-sm font-semibold text-slate-700 leading-snug">
                                      {legType === 'pickup' ? 'Store Branch (Return)' : job.dropoffLocation}
                                    </p>
                                  </div>
                                  <a 
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${legType === 'pickup' ? `${job.pickupCoords.lat},${job.pickupCoords.lng}` : `${job.dropoffCoords.lat},${job.dropoffCoords.lng}`}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 flex flex-col items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 p-3 rounded-xl transition-all shadow-sm active:scale-95 border border-blue-100"
                                    title="Navigate to destination"
                                  >
                                    <Navigation size={18} className="mb-1" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest leading-none">Nav</span>
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 pt-1">
                            <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5">
                              <Route size={16} className="text-slate-500" />
                              <span className="text-sm font-semibold text-slate-700">
                                {legType === 'pickup' ? (job.pickupDistance || job.distance || 0) : (job.deliveryDistance || job.distance || 0)} km
                              </span>
                            </div>

                          </div>
                        </CardContent>
                        {(job.status === "pending" || job.status === "accepted") ? (
                          <CardFooter className="px-4 pb-4 pt-0">
                            <motion.div className="w-full" whileTap={{ scale: 0.98 }}>
                              <Button
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-sm h-14 cursor-pointer text-base rounded-xl"
                                onClick={() => handleAccept(job.id)}
                              >
                                <Truck size={20} className="mr-2" />
                                Accept & Start Job
                              </Button>
                            </motion.div>
                          </CardFooter>
                        ) : (job.status !== "completed" && job.status !== "pickup_completed") && (
                          <div className="px-4 pb-4 space-y-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Proof of Completion</p>
                            <div className="relative aspect-video rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 overflow-hidden group">
                              {capturedImages[job.id] ? (
                                <div className="relative w-full h-full">
                                  <img src={capturedImages[job.id]} className="w-full h-full object-cover" alt="Proof" />
                                  <button 
                                    onClick={() => setCapturedImages(prev => {
                                      const next = {...prev};
                                      delete next[job.id];
                                      return next;
                                    })}
                                    className="absolute top-2 right-2 h-9 w-9 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg"
                                  >
                                    <X size={18} />
                                  </button>
                                </div>
                              ) : (
                                <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-colors">
                                  <div className="flex flex-col items-center gap-3">
                                    <div className="h-14 w-14 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 group-hover:text-indigo-500 group-hover:scale-110 transition-all border border-slate-100">
                                      <ImageIcon size={28} />
                                    </div>
                                    <span className="text-sm font-bold text-slate-600">Take Photo Proof</span>
                                    <span className="text-xs text-slate-400 leading-none">Tap to open camera</span>
                                  </div>
                                  <input 
                                    type="file" 
                                    accept="image/*" 
                                    capture="environment" 
                                    className="hidden" 
                                    onChange={(e) => handleCapture(job.id, e)}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        )}
                          <div className="px-4 pb-4">
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <ImageIcon size={14} />
                                Bag Identification Photo
                              </p>
                              <div className="grid">
                                <RiderBagImages jobId={job.id} />
                              </div>
                            </div>
                          </div>
                        {(job.status === "active" || job.status === "pickup" || job.status === "delivery") && (
                          <CardFooter className="px-4 pb-4 pt-0">
                            <motion.div className="w-full" whileTap={{ scale: 0.98 }}>
                              <Button
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm h-14 cursor-pointer text-base rounded-xl"
                                onClick={() => handleComplete(job.id)}
                              >
                                <CheckCircle2 size={20} className="mr-2" />
                                Mark as Completed
                              </Button>
                            </motion.div>
                          </CardFooter>
                        )}
                      </Card>
                    </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </TabsContent>

            {/* Job History */}
            <TabsContent value="history" className="flex-1 px-4 py-4 space-y-3 mt-0">
              {historyJobs.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-16 text-slate-400"
                >
                  <CheckCircle2 size={48} strokeWidth={1} />
                  <p className="mt-3 text-sm font-medium">No completed jobs today</p>
                  <p className="text-xs text-slate-400 mt-1">Completed jobs will appear here</p>
                </motion.div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {historyJobs.map((job, i) => {
                    const legType = (job.status === "completed" && job.deliveryRiderId === activeRider?.id) ? "delivery" : "pickup";
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
                      <Card className="overflow-hidden border-slate-200 shadow-sm opacity-70">
                        <CardHeader className="pb-3 pt-4 px-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex flex-col">
                              <span className="font-mono text-xs font-bold tracking-wider text-slate-400 mb-1">
                                {job.id}
                              </span>
                              <div className="flex items-center gap-3">
                                <h3 className="text-base font-bold text-slate-900 leading-none">{job.customerName || "Customer Guest"}</h3>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <Badge
                                variant="outline"
                                className={`gap-1 text-xs py-0.5 ${legType === 'pickup' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                              >
                                {legType === 'pickup' ? <Package size={12} /> : <Truck size={12} />}
                                {legType.toUpperCase()}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1 text-xs py-0.5"
                              >
                                <CheckCircle2 size={12} />
                                Completed
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="px-4 pb-3 space-y-3">
                          <div className="p-3 bg-white border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] rounded-xl relative">
                            <div className="absolute left-[20px] top-8 bottom-8 border-l-2 border-dashed border-slate-200"></div>
                            
                            <div className="flex flex-col gap-4 relative z-10">
                              <div className="flex items-start gap-4">
                                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-emerald-400 bg-white"></div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Pickup</p>
                                  <p className="text-sm font-semibold text-slate-700 leading-snug pr-2">
                                    {legType === 'delivery' ? 'Store Branch' : job.pickupLocation}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="flex items-start gap-4">
                                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-red-500 bg-white"></div>
                                <div className="flex-1 min-w-0 flex items-center gap-2 justify-between">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Drop-off</p>
                                    <p className="text-sm font-semibold text-slate-700 leading-snug">
                                      {legType === 'pickup' ? 'Store Branch (Return)' : job.dropoffLocation}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 pt-1">
                            <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5">
                              <Route size={16} className="text-slate-500" />
                              <span className="text-sm font-semibold text-slate-700">
                                {legType === 'pickup' ? (job.pickupDistance || job.distance || 0) : (job.deliveryDistance || job.distance || 0)} km
                              </span>
                            </div>

                          </div>
                        </CardContent>
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
    </AnimatePresence>
    </ProtectedRoute>
  );
}
