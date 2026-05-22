"use client";

import { useState, useEffect } from "react";
import { format, isToday, addDays, isSameDay, addMonths, isSameMonth } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Logo } from "@/components/logo";
import { ProtectedRoute } from "@/components/protected-route";
import { addJobLogAction } from "@/actions/db";
import { useJobs } from "@/lib/use-jobs";
import { jobStore, Job, type AdminNoteLog } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MiniMap } from "@/components/map-loader";
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
  Crown,
  Loader2,
  Zap,
  Info,
  CreditCard,
  Shirt,
  Layers,
  Receipt,
  Droplets,
  Wind
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




export interface RiderTask {
  taskId: string;
  job: Job;
  legType: "pickup" | "delivery";
  isCompleted: boolean;
  isActive: boolean;
  scheduledAt: Date;
  completedAt?: Date;
  targetLocation: string;
  targetCoords?: { lat: number; lng: number };
  distance: number;
  commission: number;
}

const RiderJobImages = ({ jobId, imageType }: { jobId: string, imageType: 'bagImageUrl' | 'pickupProofImageUrl' | 'deliveryProofImageUrl' }) => {
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

export interface RiderTask {
  taskId: string;
  job: Job;
  legType: "pickup" | "delivery";
  isCompleted: boolean;
  isActive: boolean;
  scheduledAt: Date;
  completedAt?: Date;
  targetLocation: string;
  targetCoords?: { lat: number; lng: number };
  distance: number;
  commission: number;
}


function RiderJobCard({ task, customer, onClick, showCommission, isHistory = false, branchName }: { task: RiderTask, customer: any, onClick: () => void, showCommission: boolean, isHistory?: boolean, branchName?: string }) {
  const job = task.job;
  const legType = task.legType;
  const customerLanguage = customer?.language || "th";
  const customerIsVip = customer?.isVIP || false;
  const customerIsMember = customer?.isMember || false;
  
  // Date parsing
  const displayDate = task.scheduledAt ? new Date(task.scheduledAt) : new Date();
  const formattedTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(displayDate);
  const targetLocation = task.targetLocation;
  
  // Parse Remark for specific tags
  const remarks = job.remark ? job.remark.split(" | ") : [];
  const isExpress50 = remarks.some(r => r.includes("Express 50%"));
  const isExpress100 = remarks.some(r => r.includes("Express 100%"));
  
  // Find Leg specific instruction (Pickup / Delivery)
  const legInstruction = remarks.find(r => 
    legType === 'pickup' 
      ? (r.startsWith('ไปรับ:') || r.startsWith('Pickup:')) 
      : (r.startsWith('ไปส่ง:') || r.startsWith('Delivery:'))
  );
  
  // Clean remark string
  const cleanRemark = remarks.filter(r => 
    !r.includes("Express") && 
    !r.startsWith('ไปรับ:') && !r.startsWith('Pickup:') && 
    !r.startsWith('ไปส่ง:') && !r.startsWith('Delivery:')
  ).join(" | ");

  return (
    <div
      onClick={onClick}
      className={`rounded-xl overflow-hidden border shadow-sm cursor-pointer transition-all active:scale-[0.98] ${
        legType === 'pickup' ? 'bg-amber-50 border-amber-200 hover:border-amber-400' : 'bg-emerald-50 border-emerald-200 hover:border-emerald-400'
      } ${
        (job.status === "completed" || isHistory) ? "opacity-70 grayscale-[0.2]" : "hover:shadow-md"
      }`}
    >
      <div className="pb-3 pt-3 px-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold font-mono">
              <span>#{job.id.split('-')[0].toUpperCase()}</span>
              {branchName && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10px] tracking-wider truncate max-w-[120px]">{branchName}</span>
                </>
              )}
            </div>
            <h3 className="text-base font-black text-slate-900 leading-tight flex items-center gap-1.5 flex-wrap">
              {job.customerName || "Customer Guest"}
              {customerIsVip && <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1"><Crown size={12} className="fill-amber-500 text-amber-500"/> VIP</span>}
              {!customerIsVip && customerIsMember && <span className="bg-indigo-100 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded-md font-bold">MEMBER</span>}
              {customerLanguage && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${customerLanguage.toLowerCase() === 'th' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                  {customerLanguage.toUpperCase()}
                </span>
              )}
            </h3>
            
            {/* Express Badges & Service Type */}
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {(isExpress50 || isExpress100) && (
                <>
                  {isExpress50 && <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-orange-200 flex items-center gap-1"><Zap size={10} className="fill-orange-500" /> EXP 50%</span>}
                  {isExpress100 && <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-red-200 flex items-center gap-1"><Zap size={10} className="fill-red-500" /> EXP 100%</span>}
                </>
              )}
              {job.laundryTypes && job.laundryTypes.length > 0 && (
                <span className="bg-cyan-50 text-cyan-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-cyan-200 flex items-center gap-1">
                  <Layers size={10} />
                  {job.laundryTypes.map(t => t.toUpperCase()).join(', ')}
                </span>
              )}
              {job.subStatus === 'billing' && <span className="bg-violet-100 text-violet-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-violet-200 flex items-center gap-1"><Receipt size={10} /> BILL</span>}
              {job.subStatus === 'wash' && <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-blue-200 flex items-center gap-1"><Droplets size={10} /> WASH</span>}
              {job.subStatus === 'dry' && <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-orange-200 flex items-center gap-1"><Wind size={10} /> DRY</span>}
              {job.subStatus === 'iron' && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-indigo-200 flex items-center gap-1"><Shirt size={10} /> IRON</span>}
              {job.subStatus === 'ready' && <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-emerald-200 flex items-center gap-1"><CheckCircle2 size={10} /> READY</span>}
            </div>
          </div>
          
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span
              className={`flex items-center gap-1 text-[10px] font-bold py-0.5 px-2 rounded-full border ${legType === 'pickup' ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}
            >
              {legType === 'pickup' ? <Package size={10} /> : <Truck size={10} />}
              {legType.toUpperCase()}
            </span>
            {showCommission && (
              <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 mt-0.5">
                ฿{task.commission}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-slate-500 mt-1">
          <Clock size={14} className="text-blue-500 shrink-0" />
          <span className="text-xs font-bold text-slate-700">{formattedTime}</span>
        </div>

        <div className="flex flex-col gap-1 text-slate-500 mt-2">
          {legInstruction && (
            <div className="flex items-start gap-2 bg-orange-50 p-1.5 rounded-md border border-orange-100 mb-1">
              <Info size={14} className="text-orange-600 shrink-0 mt-0.5" />
              <span className="text-xs font-bold text-orange-800 leading-tight">{legInstruction}</span>
            </div>
          )}
          <div className="flex items-start gap-2">
            <MapPin size={14} className="text-red-500 shrink-0 mt-0.5" />
            <span className="text-sm font-medium text-slate-700 line-clamp-2">{targetLocation}</span>
          </div>
          
          {!!job.totalAmount && job.totalAmount > 0 && (
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                job.isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-700 border-orange-200'
              }`}>
                <CreditCard size={10} className={job.isPaid ? "text-emerald-500" : "text-orange-500"} />
                {[job.paymentMethod?.toUpperCase(), job.paymentChannel ? `(${job.paymentChannel})` : ""].filter(Boolean).join(" ")}
                {job.paymentMethod || job.paymentChannel ? " - " : ""}
                {job.isPaid ? 'PAID' : 'UNPAID'} ฿{job.totalAmount}
              </span>
            </div>
          )}
        </div>
        
        {cleanRemark && (
          <div className="flex items-start gap-2 text-slate-500 mt-2 bg-rose-50 p-2 rounded-lg border border-rose-100">
            <span className="text-xs font-semibold text-rose-700 line-clamp-2">{cleanRemark}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RiderPage() {
  const jobs = useJobs();
  const riders = useRiders();
  const customers = useCustomers();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const [activeTab, setActiveTab] = useState("myjobs");
  const [expandedMap, setExpandedMap] = useState<string | null>(null);
  const [capturedImages, setCapturedImages] = useState<Record<string, string[]>>({});
  const [capturedFiles, setCapturedFiles] = useState<Record<string, File[]>>({});
  const [showOnlinePopup, setShowOnlinePopup] = useState(false);
  const [gpsActive, setGpsActive] = useState(false);
  const { user, logout } = useAuth();
  
  const [selectedJob, setSelectedJob] = useState<RiderTask | null>(null);
  const [jobToComplete, setJobToComplete] = useState<RiderTask | null>(null);
  const [historyDate, setHistoryDate] = useState<Date>(new Date());
  const [historyMode, setHistoryMode] = useState<"daily" | "monthly">("daily");
  const [riderNoteInput, setRiderNoteInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  const handleAddRiderLog = async (jobId: string, text: string) => {
    if (!text.trim() || !user) return;
    const newLog: AdminNoteLog = {
      id: Math.random().toString(36).substring(7),
      userId: user.id,
      userName: activeRider?.name || (user as any).name || user.email || "Rider",
      text: text.trim(),
      timestamp: new Date().toISOString()
    };
    
    // Optimistic update locally
    setRiderNoteInput("");
    if (selectedJob && selectedJob.job.id === jobId) {
      let updatedLogs = [];
      try {
        if (selectedJob.job.adminNotesJson) {
          updatedLogs = JSON.parse(selectedJob.job.adminNotesJson);
        }
      } catch(e) {}
      updatedLogs.push(newLog);
      
      const newJson = JSON.stringify(updatedLogs);
      setSelectedJob({ ...selectedJob, job: { ...selectedJob.job, adminNotesJson: newJson } });
      
      // Update store so it persists when modal closes
      import("@/lib/api").then(m => m.refreshDb());
    }

    try {
      await addJobLogAction(jobId, newLog);
    } catch (err) {
      console.error("Failed to save rider log:", err);
      toast.error("Failed to send message");
    }
  };

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

  // Periodic data refresh — 5s so Rider sees newly assigned jobs quickly
  useEffect(() => {
    const interval = setInterval(() => {
      import("@/lib/api").then(m => m.refreshDb());
    }, 5000); // 5 seconds
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
    if (!activeRider || activeRider.status === 'offline') {
      setGpsActive(false);
      return;
    }

    // Use a ref-like variable to track the last pushed location
    let lastPushedLat: number | null = null;
    let lastPushedLng: number | null = null;
    let lastPushTime = 0;
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    let firstFix = true;

    const MIN_DISTANCE_METERS = 20;   // Only push if moved > 20m
    const THROTTLE_MS = 15000;        // Push at most every 15s
    const MAX_ACCURACY_M = 5000;      // Accept up to 5000m accuracy (APK-friendly)

    function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
      const R = 6371000;
      const toRad = (x: number) => (x * Math.PI) / 180;
      const dLat = toRad(lat2 - lat1);
      const dLng = toRad(lng2 - lng1);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    const pushLocation = (lat: number, lng: number) => {
      lastPushedLat = lat;
      lastPushedLng = lng;
      lastPushTime = Date.now();

      // 1. Update in-memory store immediately (UI responds instantly)
      riderStore.updateRider(activeRider.id, {
        currentLocation: { lat, lng }
      });

      // 2. Persist to DB via lightweight GPS-only endpoint (fire-and-forget)
      fetch('/api/rider-location', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId: activeRider.id, lat, lng }),
      }).catch(err => console.error('[GPS] Failed to persist location:', err));
    };

    const watcher = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsActive(true);

        const { latitude, longitude, accuracy } = pos.coords;

        // Filter extremely inaccurate fixes (network-only location on some devices)
        if (accuracy > MAX_ACCURACY_M) return;

        const now = Date.now();
        const timeSinceLast = now - lastPushTime;

        // Check if rider has actually moved enough to warrant a push
        const hasMoved =
          lastPushedLat === null ||
          haversineDistance(lastPushedLat, lastPushedLng!, latitude, longitude) >= MIN_DISTANCE_METERS;

        // Push immediately on first good fix, then throttle
        if (firstFix || (hasMoved && timeSinceLast >= THROTTLE_MS)) {
          firstFix = false;
          if (throttleTimer) { clearTimeout(throttleTimer); throttleTimer = null; }
          pushLocation(latitude, longitude);
        } else if (hasMoved && !throttleTimer) {
          // Moved but still in throttle window — schedule push at end of window
          const remaining = THROTTLE_MS - timeSinceLast;
          throttleTimer = setTimeout(() => {
            throttleTimer = null;
            pushLocation(latitude, longitude);
          }, remaining);
        }
      },
      (err) => {
        console.error('GPS Error:', err.code, err.message);
        setGpsActive(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,       // Always request a fresh fix
        timeout: 30000,      // Give hardware 30s to get a fix
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watcher);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [activeRider?.id, activeRider?.status]);

  const allTasks: RiderTask[] = [];
  if (activeRider) {
    jobs.forEach(j => {
      if (j.pickupRiderId === activeRider.id || j.riderId === activeRider.id) {
        const isPickupCompleted = ["picked_up", "active", "ready_to_wash", "washed", "delivery", "completed", "cancel"].includes(j.status);
        allTasks.push({
          taskId: `${j.id}-pickup`,
          job: j,
          legType: "pickup",
          isCompleted: isPickupCompleted,
          isActive: ["pending", "accepted", "pickup"].includes(j.status),
          scheduledAt: j.pickupScheduledAt ? new Date(j.pickupScheduledAt) : (j.scheduledAt ? new Date(j.scheduledAt) : new Date()),
          // For history: use pickupScheduledAt as the date reference (the date the rider was assigned)
          completedAt: isPickupCompleted ? (j.pickupScheduledAt ? new Date(j.pickupScheduledAt) : (j.scheduledAt ? new Date(j.scheduledAt) : new Date())) : undefined,
          targetLocation: j.pickupLocation,
          targetCoords: j.pickupCoords,
          distance: j.pickupDistance || j.distance || 0,
          commission: j.pickupCommission || 0,
        });
      }
      if (j.deliveryRiderId === activeRider.id) {
        const isTerminal = ["completed", "cancel"].includes(j.status);
        allTasks.push({
          taskId: `${j.id}-delivery`,
          job: j,
          legType: "delivery",
          isCompleted: isTerminal,
          isActive: ["washed", "delivery"].includes(j.status),
          scheduledAt: j.deliveryScheduledAt ? new Date(j.deliveryScheduledAt) : (j.scheduledAt ? new Date(j.scheduledAt) : new Date()),
          // For history: use deliveryScheduledAt as the date reference (the date the rider was assigned)
          completedAt: isTerminal ? (j.deliveryScheduledAt ? new Date(j.deliveryScheduledAt) : (j.scheduledAt ? new Date(j.scheduledAt) : new Date())) : undefined,
          targetLocation: j.dropoffLocation,
          targetCoords: j.dropoffCoords,
          distance: j.deliveryDistance || j.distance || 0,
          commission: j.deliveryCommission || 0,
        });
      }
    });
  }

  const myJobs = allTasks
    .filter(t => t.isActive && !t.isCompleted)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const historyJobs = allTasks
    .filter(t => {
      // Show tasks that are "done" (pickup completed, or delivery completed)
      if (!t.isCompleted) return false;
      // Use completedAt if available, otherwise fall back to scheduledAt for date matching
      const jobDate = t.completedAt || t.scheduledAt;
      if (historyMode === "daily") {
        if (!isSameDay(jobDate, historyDate)) return false;
      } else {
        if (!isSameMonth(jobDate, historyDate) || jobDate.getFullYear() !== historyDate.getFullYear()) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aTime = a.completedAt?.getTime() || a.scheduledAt.getTime();
      const bTime = b.completedAt?.getTime() || b.scheduledAt.getTime();
      return bTime - aTime;
    });

  const totalHistoryJobs = historyJobs.filter(t => t.job.status !== 'cancel').length;
  const totalCommission = historyJobs.filter(t => t.job.status !== 'cancel').reduce((acc, t) => acc + t.commission, 0);

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

  const [isUploadingProof, setIsUploadingProof] = useState(false);

  async function handleComplete(taskId: string) {
    const jobId = taskId.replace(/-pickup$|-delivery$/, '');
    const proofUrls = capturedImages[taskId];
    const proofFiles = capturedFiles[taskId];
    if (!proofUrls || proofUrls.length === 0 || !proofFiles || proofFiles.length === 0) {
      toast.error("Please take at least one photo as proof of delivery!");
      return;
    }
    
    setIsUploadingProof(true);
    let finalProofUrls: string[] = [];

    try {
      if (proofFiles && proofFiles.length > 0) {
        // Upload all files in parallel
        const uploadPromises = proofFiles.map(async (proofFile, index) => {
          const actualContentType = proofFile.type || 'image/jpeg';
          
          // Upload to GCS
          const response = await fetch("/api/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entityType: "job",
              entityId: jobId,
              subType: `proofs-${index}`,
              contentType: actualContentType,
            }),
          });

          if (!response.ok) throw new Error("Failed to get upload authorization for a photo");

          const { uploadUrl, publicUrl } = await response.json();

          const uploadResponse = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": actualContentType },
            body: proofFile,
          });

          if (!uploadResponse.ok) throw new Error("Upload failed: " + uploadResponse.statusText);
          
          return publicUrl;
        });

        finalProofUrls = await Promise.all(uploadPromises);
      }
      
      const jsonProofUrls = JSON.stringify(finalProofUrls);
      
      await jobStore.completeJob(jobId, jsonProofUrls);
      toast.success("Job marked as completed! 🎉");
      // Return to online status if no other active jobs
      if (activeRider && myJobs.filter(t => !t.isCompleted).length <= 1) {
         riderStore.updateRider(activeRider.id, { status: "online" });
      }
    } catch (error) {
      console.error(error);
      toast.error(`Failed to upload proof: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsUploadingProof(false);
    }
  }

  function handleCapture(taskId: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Store file for upload
    setCapturedFiles(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), file] }));
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setCapturedImages(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), dataUrl] }));
    };
    reader.readAsDataURL(file);

    // Save photo to device gallery
    savePhotoToDevice(file, `${taskId}-proof.jpg`);
  }

  async function takePhotoNative(taskId: string) {
    try {
      // Dynamically import Capacitor plugins to avoid SSR issues
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const { Filesystem, Directory } = await import('@capacitor/filesystem');

      // Use Uri resultType — this is the ONLY mode where saveToGallery actually works on Android
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        saveToGallery: true,
        correctOrientation: true,
        presentationStyle: 'fullscreen',
      });

      if (!photo.path && !photo.webPath) return;

      // Read file content as base64 so we can display & upload it
      let dataUrl: string;
      try {
        // Try reading via Filesystem plugin (works reliably on native)
        const fileData = await Filesystem.readFile({
          path: photo.path!,
        });
        const base64 = typeof fileData.data === 'string' ? fileData.data : '';
        dataUrl = `data:image/jpeg;base64,${base64}`;
      } catch {
        // Fallback: use webPath (works in browser/PWA mode)
        dataUrl = photo.webPath || '';
      }

      if (!dataUrl) return;

      // Convert dataUrl → File for upload
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const file = new File([blob], `${taskId}-proof.jpg`, { type: 'image/jpeg' });

      setCapturedFiles(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), file] }));
      setCapturedImages(prev => ({ ...prev, [taskId]: [...(prev[taskId] || []), dataUrl] }));

      toast.success('Photo saved to gallery ✅');
    } catch (err: any) {
      if (err?.message?.includes('cancelled') || err?.message?.includes('cancel') || err?.message?.includes('User cancelled')) return;
      console.error('[Camera] Native capture failed:', err);
      toast.error('Could not open camera. Please try again.');
    }
  }

  async function savePhotoToDevice(file: File, filename: string) {
    // 1. Try Web Share API (Android WebView & modern mobile browsers)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [new File([file], filename, { type: file.type || 'image/jpeg' })],
          title: 'Proof Photo',
        });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.warn('[savePhoto] Web Share API failed:', err);
      }
    }

    // 2. Fallback: <a download> for desktop browsers
    try {
      const objectUrl = window.URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(objectUrl), 2000);
    } catch (err) {
      console.error('[savePhoto] Fallback download failed:', err);
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
            <TabsContent value="myjobs" className="flex-1 px-4 py-4 space-y-3 mt-0 relative">
              {activeRider?.status === 'offline' && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm rounded-xl">
                  <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center max-w-[80%] text-center border border-slate-100">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                      <Truck size={32} className="text-slate-400" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">You are Offline</h3>
                    <p className="text-sm font-medium text-slate-500 mb-6">
                      Go online to accept and manage your jobs.
                    </p>
                    <Button 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 rounded-xl text-lg shadow-sm"
                      onClick={handleGoOnline}
                    >
                      Go Online
                    </Button>
                  </div>
                </div>
              )}
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
                  {myJobs.map((task, i) => {
                    const customer = customers.find(c => c.id === task.job.customerId || (task.job.customerPhone && c.phone === task.job.customerPhone));
                    return (
                      <motion.div
                        key={task.taskId}
                        custom={i}
                        variants={cardVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        layout
                        whileHover={{ scale: 1.01 }}
                      >
                        <RiderJobCard 
                          task={task} 
                          customer={customer} 
                          showCommission={showCommission} 
                          onClick={() => setSelectedJob(task)} 
                          branchName={shopLocations.find(s => s.id === task.job.branchId)?.name}
                        />
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
                  {historyJobs.map((task, i) => {
                    const customer = customers.find(c => c.id === task.job.customerId || (task.job.customerPhone && c.phone === task.job.customerPhone));
                    return (
                      <motion.div
                        key={task.taskId}
                        custom={i}
                        variants={cardVariants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        layout
                      >
                        <RiderJobCard 
                          task={task} 
                          customer={customer} 
                          showCommission={showCommission} 
                          isHistory={true}
                          branchName={shopLocations.find(s => s.id === task.job.branchId)?.name}
                          onClick={() => {}} 
                        />
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
            const legType = selectedJob.legType;
            const targetLocation = selectedJob.targetLocation;
            
            const targetCoords = selectedJob.targetCoords;
            const distance = selectedJob.distance;
            
            const customer = customers.find(c => c.id === selectedJob.job.customerId || (selectedJob.job.customerPhone && c.phone === selectedJob.job.customerPhone));
            const customerIsVip = customer?.isVIP || false;
            const customerIsMember = customer?.isMember || false;
            const remarks = selectedJob.job.remark ? selectedJob.job.remark.split(" | ") : [];
            const isExpress50 = remarks.some(r => r.includes("Express 50%"));
            const isExpress100 = remarks.some(r => r.includes("Express 100%"));
            const displayDate = selectedJob.scheduledAt ? new Date(selectedJob.scheduledAt) : new Date();
            const formattedTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(displayDate);
            const legInstruction = remarks.find(r => 
              legType === 'pickup' 
                ? (r.startsWith('ไปรับ:') || r.startsWith('Pickup:')) 
                : (r.startsWith('ไปส่ง:') || r.startsWith('Delivery:'))
            );
            
            let notes: any[] = [];
            try {
              if (selectedJob.job.adminNotesJson) {
                notes = JSON.parse(selectedJob.job.adminNotesJson);
              }
            } catch {}
            
            return (

              <>
                <DialogHeader className="p-3 bg-white border-b border-slate-100 sticky top-0 z-10 shrink-0">
                  <div className="flex items-start justify-between">
                    <div className="pr-2">
                      <DialogTitle className="text-lg font-black text-slate-900 leading-tight flex items-center gap-1.5 flex-wrap">
                        {selectedJob.job.customerName || "Customer Guest"}
                        {customerIsVip && <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1"><Crown size={12} className="fill-amber-500 text-amber-500"/> VIP</span>}
                        {!customerIsVip && customerIsMember && <span className="bg-indigo-100 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded-md font-bold">MEMBER</span>}
                        {selectedJob.job.laundryTypes && selectedJob.job.laundryTypes.length > 0 && (
                          <span className="bg-cyan-50 text-cyan-700 text-[10px] px-1.5 py-0.5 rounded-md font-bold border border-cyan-200 flex items-center gap-1">
                            <Layers size={10} />
                            {selectedJob.job.laundryTypes.map(t => t.toUpperCase()).join(', ')}
                          </span>
                        )}
                        {selectedJob.job.subStatus === 'billing' && <span className="bg-violet-100 text-violet-700 text-[10px] px-1.5 py-0.5 rounded-md font-bold border border-violet-200 flex items-center gap-1"><Receipt size={10} /> BILL</span>}
                        {selectedJob.job.subStatus === 'wash' && <span className="bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-md font-bold border border-blue-200 flex items-center gap-1"><Droplets size={10} /> WASH</span>}
                        {selectedJob.job.subStatus === 'dry' && <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded-md font-bold border border-orange-200 flex items-center gap-1"><Wind size={10} /> DRY</span>}
                        {selectedJob.job.subStatus === 'iron' && <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-md font-bold border border-indigo-200 flex items-center gap-1"><Shirt size={10} /> IRON</span>}
                        {selectedJob.job.subStatus === 'ready' && <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-md font-bold border border-emerald-200 flex items-center gap-1"><CheckCircle2 size={10} /> READY</span>}
                      </DialogTitle>
                      <span className="font-mono text-[10px] font-bold tracking-wider text-slate-500 mt-0.5 block">
                        {selectedJob.job.id}
                      </span>
                      <div className="mt-1.5">
                        <a href={`tel:${selectedJob.job.customerPhone || '0812345678'}`} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition-colors font-bold text-xs">
                          <Phone size={12} /> {selectedJob.job.customerPhone || 'No Phone Number'}
                        </a>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <Button variant="ghost" className="h-8 w-8 p-0 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500" onClick={() => setSelectedJob(null)}>
                        <X size={18} />
                      </Button>
                      <div className="flex flex-col items-end gap-1.5">
                        <Badge
                          variant="outline"
                          className={`gap-1.5 text-xs py-1 px-2 ${legType === 'pickup' ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}
                        >
                          {legType === 'pickup' ? <Package size={14} /> : <Truck size={14} />}
                          {legType.toUpperCase()}
                        </Badge>
                        {showCommission && (
                          <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                            ฿{selectedJob.commission}
                          </span>
                        )}
                      </div>
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
                    
                    {!!selectedJob.job.totalAmount && selectedJob.job.totalAmount > 0 && (
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded border flex items-center gap-1.5 ${
                          selectedJob.job.isPaid ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-700 border-orange-200'
                        }`}>
                          <CreditCard size={12} className={selectedJob.job.isPaid ? "text-emerald-500" : "text-orange-500"} />
                          {[selectedJob.job.paymentMethod?.toUpperCase(), selectedJob.job.paymentChannel ? `(${selectedJob.job.paymentChannel})` : ""].filter(Boolean).join(" ")}
                          {selectedJob.job.paymentMethod || selectedJob.job.paymentChannel ? " - " : ""}
                          {selectedJob.job.isPaid ? 'PAID' : 'UNPAID'} ฿{selectedJob.job.totalAmount}
                        </span>
                      </div>
                    )}
                  </div>

                  {legInstruction && (
                    <div className="p-2.5 bg-orange-50 border border-orange-100 rounded-xl flex items-start gap-2.5">
                      <Info size={16} className="text-orange-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-orange-800 leading-tight">{legInstruction}</p>
                      </div>
                    </div>
                  )}

                  {selectedJob.job.remark && (
                    <div className="p-2 bg-rose-50 border border-rose-100 shadow-sm rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-0.5">Instructions</p>
                      <p className="text-xs font-medium text-rose-800">{selectedJob.job.remark}</p>
                    </div>
                  )}

                  <div className="p-2 bg-slate-50 border border-slate-200 shadow-sm rounded-xl flex flex-col h-32 relative">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1 flex-shrink-0">Job Chat / Logs</p>
                    
                    <div 
                      className="flex-1 flex flex-col justify-center cursor-pointer hover:bg-slate-100/50 rounded-lg transition-colors px-1 mb-1"
                      onClick={() => setChatOpen(true)}
                    >
                      {notes.length > 0 ? (() => {
                        const latest = notes[notes.length - 1];
                        const isMe = latest.userId === user?.id;
                        return (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-[9px] font-bold ${isMe ? 'text-indigo-600' : 'text-slate-500'}`}>
                                {isMe ? 'You' : latest.userName}
                              </span>
                              <span className="text-[8px] text-slate-400">
                                {latest.timestamp ? format(new Date(latest.timestamp), "HH:mm") : ""}
                              </span>
                            </div>
                            <div className={`px-2 py-1.5 rounded-lg ${isMe ? 'bg-indigo-500 text-white rounded-br-none self-end' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'}`}>
                              <p className="text-xs leading-snug line-clamp-2 whitespace-pre-wrap">{latest.text}</p>
                            </div>
                            {notes.length > 1 && (
                              <p className="text-[9px] text-slate-400 italic mt-0.5">
                                +{notes.length - 1} more message{notes.length > 2 ? 's' : ''} — tap to view all
                              </p>
                            )}
                          </div>
                        );
                      })() : (
                        <div className="h-full flex flex-col items-center justify-center text-xs text-slate-400 italic">
                          <MessageCircle size={16} className="mb-1 opacity-50" />
                          <span>Tap to open chat</span>
                        </div>
                      )}
                    </div>

                    {selectedJob.job.status !== 'completed' && selectedJob.job.status !== 'cancel' && (
                      <div className="flex gap-1.5 flex-shrink-0 mt-auto pt-1 border-t border-slate-200">
                        <Input
                          placeholder="Type a message..."
                          value={riderNoteInput}
                          onChange={(e) => setRiderNoteInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && riderNoteInput.trim()) {
                              e.preventDefault();
                              handleAddRiderLog(selectedJob.job.id, riderNoteInput);
                              setRiderNoteInput("");
                            }
                          }}
                          className="h-8 text-xs bg-white flex-1"
                        />
                        <Button 
                          type="button" 
                          size="sm" 
                          className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white"
                          onClick={() => {
                            if (riderNoteInput.trim()) {
                              handleAddRiderLog(selectedJob.job.id, riderNoteInput);
                              setRiderNoteInput("");
                            }
                          }}
                          disabled={!riderNoteInput.trim()}
                        >
                          Send
                        </Button>
                      </div>
                    )}
                    
                    {/* Expand Icon Hint */}
                    <div className="absolute top-2 right-2 text-slate-400 pointer-events-none">
                      <ZoomIn size={14} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="p-2 bg-white border border-slate-100 shadow-sm rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Laundry Bags (จากร้าน)</p>
                      <RiderJobImages jobId={selectedJob.job.id} imageType="bagImageUrl" />
                    </div>
                    <div className="p-2 bg-emerald-50 border border-emerald-100 shadow-sm rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">Pickup Proof (รูปตอนไปรับ)</p>
                      <RiderJobImages jobId={selectedJob.job.id} imageType="pickupProofImageUrl" />
                    </div>
                  </div>

                  {selectedJob.job.status === 'completed' && (
                    <div className="p-2 bg-emerald-50 border border-emerald-100 shadow-sm rounded-xl">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">Delivery Proof (รูปตอนไปส่ง)</p>
                      <RiderJobImages jobId={selectedJob.job.id} imageType="deliveryProofImageUrl" />
                    </div>
                  )}
                </div>

                <DialogFooter className="p-3 bg-white border-t border-slate-100 sticky bottom-0 z-10 shrink-0">
                  {["active", "pickup", "delivery"].includes(selectedJob.job.status) ? (
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm h-12 rounded-xl text-base"
                      onClick={() => {
                        setSelectedJob(null);
                        setJobToComplete(selectedJob);
                      }}
                    >
                      <CheckCircle2 size={20} className="mr-2" />
                      {["pending", "accepted", "active", "pickup"].includes(selectedJob.job.status) ? "Mark as Picked Up" : "Mark as Delivered"}
                    </Button>
                  ) : null}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Chat Dialog */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="max-w-[100vw] h-[100dvh] sm:max-w-md sm:h-[80vh] p-0 flex flex-col bg-white border-none rounded-none sm:rounded-xl z-[70] overflow-hidden">
          <DialogHeader className="p-4 bg-indigo-600 border-b border-indigo-700 sticky top-0 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-white">
                <Button variant="ghost" className="h-8 w-8 p-0 rounded-full hover:bg-indigo-500 text-white" onClick={() => setChatOpen(false)}>
                  <ChevronLeft size={20} />
                </Button>
                <div>
                  <DialogTitle className="text-base font-bold flex items-center gap-2">
                    Job Chat
                  </DialogTitle>
                  <p className="text-[10px] text-indigo-200 uppercase tracking-wider">{selectedJob?.job.id.split('-')[0]}</p>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50 flex flex-col">
            {selectedJob && (() => {
              let notes: any[] = [];
              try {
                if (selectedJob.job.adminNotesJson) {
                  notes = JSON.parse(selectedJob.job.adminNotesJson);
                }
              } catch {}
              return notes.length > 0 ? notes.map((n: any, i: number) => {
                const isMe = n.userId === user?.id;
                return (
                  <div key={n.id || i} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`px-3 py-2 rounded-xl max-w-[85%] ${isMe ? 'bg-indigo-500 text-white rounded-br-none shadow-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'}`}>
                      <div className="flex justify-between items-end gap-3 mb-1">
                        <span className={`text-[10px] font-bold ${isMe ? 'text-indigo-100' : 'text-slate-500'}`}>{n.userName}</span>
                        <span className={`text-[9px] ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                          {n.timestamp ? format(new Date(n.timestamp), "HH:mm") : ""}
                        </span>
                      </div>
                      <p className="text-sm leading-snug whitespace-pre-wrap">{n.text}</p>
                    </div>
                  </div>
                );
              }) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 space-y-2">
                  <MessageCircle size={32} className="text-slate-300" />
                  <p className="text-sm font-medium">No messages yet</p>
                  <p className="text-xs">Send a message to update job status or report issues</p>
                </div>
              );
            })()}
          </div>

          {selectedJob?.job.status !== 'completed' && selectedJob?.job.status !== 'cancel' && (
            <div className="p-3 bg-white border-t border-slate-200 shrink-0">
              <div className="flex gap-2 relative">
                <Input
                  placeholder="Type your message..."
                  value={riderNoteInput}
                  onChange={(e) => setRiderNoteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && riderNoteInput.trim() && selectedJob) {
                      e.preventDefault();
                      handleAddRiderLog(selectedJob.job.id, riderNoteInput);
                      setRiderNoteInput("");
                    }
                  }}
                  className="h-10 text-sm bg-slate-50 border-slate-200 pr-12 focus-visible:ring-indigo-500 rounded-full"
                />
                <Button 
                  type="button" 
                  size="icon" 
                  className="absolute right-1 top-1 h-8 w-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => {
                    if (riderNoteInput.trim() && selectedJob) {
                      handleAddRiderLog(selectedJob.job.id, riderNoteInput);
                      setRiderNoteInput("");
                    }
                  }}
                  disabled={!riderNoteInput.trim()}
                >
                  <Navigation size={14} className="ml-0.5 rotate-45" />
                </Button>
              </div>
            </div>
          )}
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
            const previewUrl = capturedImages[jobToComplete.taskId];
            return (
              <>
                <DialogHeader className="p-4 border-b border-slate-100">
                  <DialogTitle className="text-lg font-bold text-slate-900 text-center">
                    Proof of Completion
                  </DialogTitle>
                </DialogHeader>
                <div className="p-4">
                  <p className="text-sm font-medium text-slate-600 mb-3 text-center">
                    Take up to 3 photos ({(capturedImages[jobToComplete.taskId] || []).length}/3)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {(capturedImages[jobToComplete.taskId] || []).map((url, index) => (
                      <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200">
                        <img src={url} className="w-full h-full object-cover" alt={`Proof ${index + 1}`} />
                        <button 
                          onClick={() => {
                            setCapturedImages(prev => ({
                              ...prev,
                              [jobToComplete.taskId]: prev[jobToComplete.taskId].filter((_, i) => i !== index)
                            }));
                            setCapturedFiles(prev => ({
                              ...prev,
                              [jobToComplete.taskId]: prev[jobToComplete.taskId].filter((_, i) => i !== index)
                            }));
                          }}
                          className="absolute top-2 right-2 h-7 w-7 rounded-full bg-red-500/90 text-white flex items-center justify-center shadow-lg backdrop-blur"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    
                    {(capturedImages[jobToComplete.taskId] || []).length < 3 && (
                      <div
                        className="aspect-square rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={async () => {
                          const { Capacitor } = await import('@capacitor/core');
                          if (Capacitor.isNativePlatform()) {
                            await takePhotoNative(jobToComplete.taskId);
                          } else {
                            document.getElementById(`file-input-${jobToComplete.taskId}`)?.click();
                          }
                        }}
                      >
                        <div className="h-10 w-10 mb-2 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400 group-hover:text-indigo-500 group-hover:scale-110 transition-all border border-slate-100">
                          <ImageIcon size={20} />
                        </div>
                        <p className="text-xs font-bold text-slate-700">Add Photo</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Hidden input — used on web only */}
                  <input
                    id={`file-input-${jobToComplete.taskId}`}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => handleCapture(jobToComplete.taskId, e)}
                  />
                </div>
                <DialogFooter className="p-4 pt-0">
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-sm h-14 rounded-xl text-base disabled:opacity-50"
                    disabled={!(capturedImages[jobToComplete.taskId] || []).length || isUploadingProof}
                    onClick={async () => {
                      await handleComplete(jobToComplete.taskId);
                      setJobToComplete(null);
                    }}
                  >
                    {isUploadingProof ? <Loader2 size={20} className="mr-2 animate-spin" /> : <CheckCircle2 size={20} className="mr-2" />}
                    {isUploadingProof ? "Uploading..." : "Confirm Completion"}
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
