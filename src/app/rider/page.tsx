"use client";

import { useState } from "react";
import { format } from "date-fns";
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

export default function RiderPage() {
  const jobs = useJobs();
  const riders = useRiders();
  const [activeTab, setActiveTab] = useState("available");
  const [expandedMap, setExpandedMap] = useState<string | null>(null);
  const [capturedImages, setCapturedImages] = useState<Record<string, string>>({});
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  // Active Rider context (Use RIDER-01 for demo)
  const activeRider = riders.find(r => r.id === "RIDER-01");

  const availableJobs = jobs.filter((j) => j.status === "pending");
  const myJobs = jobs.filter((j) => 
    (j.status === "accepted" || j.status === "active" || j.status === "completed") &&
    (j.riderId === activeRider?.id || j.pickupRiderId === activeRider?.id || j.deliveryRiderId === activeRider?.id)
  );

  function handleAccept(jobId: string) {
    if (!activeRider) return;
    jobStore.acceptJob(jobId, activeRider.id);
    toast.success("Job accepted! Check My Jobs tab.", {
      icon: <CheckCircle2 size={18} className="text-emerald-500" />,
    });
    setExpandedMap(null);
    setActiveTab("myjobs");
    // Also auto-update rider to busy
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
    const states: ("online" | "busy" | "offline")[] = ["online", "busy", "offline"];
    const nextIdx = (states.indexOf(activeRider.status) + 1) % states.length;
    riderStore.updateRider(activeRider.id, { status: states[nextIdx] });
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
                  value="available"
                  className="gap-1.5 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 cursor-pointer rounded-md"
                >
                  <Package size={15} />
                  Available
                  {availableJobs.length > 0 && (
                    <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                      {availableJobs.length}
                    </span>
                  )}
                </TabsTrigger>
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
              </TabsList>
            </div>

            {/* Available Jobs */}
            <TabsContent value="available" className="flex-1 px-4 py-4 space-y-3 mt-0">
              {availableJobs.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center py-16 text-slate-400"
                >
                  <Package size={48} strokeWidth={1} />
                  <p className="mt-3 text-sm font-medium">No available jobs</p>
                  <p className="text-xs text-slate-400 mt-1">Check back shortly for new jobs!</p>
                </motion.div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {availableJobs.map((job, i) => (
                    <motion.div
                      key={job.id}
                      custom={i}
                      variants={cardVariants}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      layout
                      whileHover={{ scale: 1.01, y: -2 }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    >
                      <Card className="overflow-hidden border-slate-200 shadow-sm">
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
                                className={`gap-1 text-xs py-0.5 ${job.type === 'pickup' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                              >
                                {job.type === 'pickup' ? <Package size={12} /> : <Truck size={12} />}
                                {job.type.toUpperCase()}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="bg-amber-50 text-amber-700 border-amber-200 gap-1 text-xs py-0.5"
                              >
                                <Clock size={12} />
                                {format(new Date(job.scheduledAt), "HH:mm")}
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
                                  <p className="text-sm font-semibold text-slate-700 leading-snug pr-2">{job.pickupLocation}</p>
                                </div>
                              </div>
                              
                              <div className="flex items-start gap-4">
                                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-red-500 bg-white"></div>
                                <div className="flex-1 min-w-0 flex items-center gap-2 justify-between">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Drop-off</p>
                                    <p className="text-sm font-semibold text-slate-700 leading-snug">{job.dropoffLocation}</p>
                                  </div>
                                  <a 
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${job.dropoffCoords.lat},${job.dropoffCoords.lng}`}
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
                          {/* Distance & Fee */}
                          <div className="flex items-center gap-3 pt-1">
                            <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5">
                              <Route size={16} className="text-slate-500" />
                              <span className="text-sm font-semibold text-slate-700">{job.distance} km</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 border border-indigo-100">
                              <span className="text-xs font-bold text-indigo-400 uppercase tracking-tighter">Earnings</span>
                              <span className="text-sm font-bold text-indigo-700">฿{(job.distance * 2).toFixed(0)}</span>
                            </div>
                          </div>

                          {/* Expandable Mini Map */}
                          <AnimatePresence>
                            {expandedMap === job.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3, ease: "easeInOut" }}
                                className="overflow-hidden"
                              >
                                <div className="pt-2">
                                  <MiniMap
                                    pickup={job.pickupCoords}
                                    dropoff={job.dropoffCoords}
                                    pickupLabel={job.pickupLocation}
                                    dropoffLabel={job.dropoffLocation}
                                  />
                                </div>
                              </motion.div>
                            )}

                            {job.bagImageUrl && (
                              <div className="mt-3 p-2 bg-slate-50 rounded-lg border border-slate-100">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                                  <ImageIcon size={10} />
                                  Bag Identification Photo
                                </p>
                                <div className="aspect-[4/3] w-full rounded-md overflow-hidden border border-slate-200 shadow-sm">
                                  <img src={job.bagImageUrl} alt="Laundry Bag" className="w-full h-full object-cover" />
                                </div>
                              </div>
                            )}
                          </AnimatePresence>
                        </CardContent>
                        <CardFooter className="px-4 pb-4 pt-0 gap-2">
                          <motion.div className="flex-1" whileTap={{ scale: 0.98 }}>
                            <Button
                              variant="outline"
                              className="w-full gap-1.5 text-slate-600 border-slate-200 hover:bg-slate-50 h-12 cursor-pointer font-medium text-sm rounded-xl"
                              onClick={() => toggleMap(job.id)}
                            >
                              {expandedMap === job.id ? (
                                <>
                                  <X size={16} />
                                  Hide Map
                                </>
                              ) : (
                                <>
                                  <MapIcon size={16} />
                                  View Map
                                </>
                              )}
                            </Button>
                          </motion.div>
                          <motion.div className="flex-1" whileTap={{ scale: 0.98 }}>
                            <Button
                              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-sm h-12 cursor-pointer text-sm rounded-xl"
                              onClick={() => handleAccept(job.id)}
                            >
                              <CheckCircle2 size={18} className="mr-2" />
                              Accept Job
                            </Button>
                          </motion.div>
                        </CardFooter>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </TabsContent>

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
                  {myJobs.map((job, i) => (
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
                          job.status === "completed" ? "opacity-70" : ""
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
                                className={`gap-1 text-xs py-0.5 ${job.type === 'pickup' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}
                              >
                                {job.type === 'pickup' ? <Package size={12} /> : <Truck size={12} />}
                                {job.type.toUpperCase()}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`gap-1 text-xs py-0.5 ${
                                  job.status !== "completed"
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}
                              >
                                {job.status !== "completed" ? <Truck size={12} /> : <CheckCircle2 size={12} />}
                              {job.status !== "completed" ? "In Progress" : "Completed"}
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
                                  <p className="text-sm font-semibold text-slate-700 leading-snug pr-2">{job.pickupLocation}</p>
                                </div>
                              </div>
                              
                              <div className="flex items-start gap-4">
                                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 border-red-500 bg-white"></div>
                                <div className="flex-1 min-w-0 flex items-center gap-2 justify-between">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Drop-off</p>
                                    <p className="text-sm font-semibold text-slate-700 leading-snug">{job.dropoffLocation}</p>
                                  </div>
                                  <a 
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${job.dropoffCoords.lat},${job.dropoffCoords.lng}`}
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
                              <span className="text-sm font-semibold text-slate-700">{job.distance} km</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 border border-indigo-100">
                              <span className="text-xs font-bold text-indigo-400 uppercase tracking-tighter">Earnings</span>
                              <span className="text-sm font-bold text-indigo-700">฿{(job.distance * 2).toFixed(0)}</span>
                            </div>
                          </div>
                        </CardContent>
                        {job.status !== "completed" && (
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
                        {job.bagImageUrl && (
                          <div className="px-4 pb-4">
                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <ImageIcon size={14} />
                                Bag Identification Photo
                              </p>
                              <div className="aspect-[4/3] w-full rounded-md overflow-hidden border border-slate-200 shadow-sm">
                                <img src={job.bagImageUrl} alt="Laundry Bag" className="w-full h-full object-cover" />
                              </div>
                            </div>
                          </div>
                        )}
                        {job.status !== "completed" && (
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
                  ))}
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
    </ProtectedRoute>
  );
}
