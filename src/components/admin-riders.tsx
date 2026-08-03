"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2, Phone, Star, Activity, Circle, CheckCircle2, BarChart3, ChevronRight, ChevronDown, Calendar, ArrowRight, Banknote, Image as ImageIcon, Download, UserX, UserCheck } from "lucide-react";

const RIDER_COLORS = [
  { name: 'Berry', hex: '#B81D5E' },
  { name: 'Red Orange', hex: '#E65100' },
  { name: 'Goldenrod', hex: '#FBC02D' },
  { name: 'Forest', hex: '#0B8043' },
  { name: 'Indigo', hex: '#3F51B5' },
  { name: 'Purple', hex: '#8E24AA' },
  
  { name: 'Pink', hex: '#D81B60' },
  { name: 'Orange', hex: '#F57C00' },
  { name: 'Lime', hex: '#C0CA33' },
  { name: 'Teal', hex: '#009688' },
  { name: 'Periwinkle', hex: '#7986CB' },
  { name: 'Brown', hex: '#795548' },
  
  { name: 'Red', hex: '#D50000' },
  { name: 'Amber', hex: '#FFB300' },
  { name: 'Leaf', hex: '#7CB342' },
  { name: 'Blue', hex: '#039BE5' },
  { name: 'Lavender', hex: '#BA68C8' },
  { name: 'Graphite', hex: '#616161' },
  
  { name: 'Salmon', hex: '#F08080' },
  { name: 'Yellow', hex: '#FFD54F' },
  { name: 'Mint', hex: '#4DB6AC' },
  { name: 'Sky', hex: '#4285F4' },
  { name: 'Amethyst', hex: '#9575CD' },
  { name: 'Taupe', hex: '#A1887F' }
];
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AdminTaskTracker } from "@/components/admin-task-tracker";
import { riderStore, shopStore, type Rider, type Job } from "@/lib/store";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRiders } from "@/lib/use-riders";
import { useJobs } from "@/lib/use-jobs";
import { useAuth } from "@/providers/auth-provider";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";
import { ImageUploader } from "@/components/ui/image-uploader";
import { getRiderTransactionsAction, getJobsByIdsAction } from "@/actions/db";
import { useEffect } from "react";

const statusColorMap = {
  online: "bg-emerald-500",
  offline: "bg-slate-300",
  busy: "bg-amber-500",
};

export function AdminRiders() {
  let riders = useRiders();
  const jobs = useJobs();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reportRiderId, setReportRiderId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempId, setTempId] = useState<string>("");
  const [viewMode, setViewMode] = useState<"active" | "resigned">("active");

  const activeRiders = riders.filter(r => r.isActive !== false);
  const resignedRiders = riders.filter(r => r.isActive === false);
  const displayedRiders = viewMode === "active" ? activeRiders : resignedRiders;

  const riderStats = useMemo(() => {
    const stats: Record<string, { monthEarnings: number, totalEarnings: number, completedJobsCount: number }> = {};

    riders.forEach(r => {
      stats[r.id] = {
        monthEarnings: (r as any).monthEarnings || 0,
        totalEarnings: (r as any).lifetimeEarnings || 0,
        completedJobsCount: (r as any).completedJobsCount || 0
      };
    });
    return stats;
  }, [riders]);



  // Form State
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Rider["status"]>("offline");
  const [nationalId, setNationalId] = useState("");
  const [vehicleType, setVehicleType] = useState<Rider["vehicleType"]>("motorcycle");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [branchId, setBranchId] = useState("");
  const [color, setColor] = useState("#3b82f6");

  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

  // Area Filter for Riders
  if (user?.role === 'manager' && user.area) {
    riders = riders.filter(r => {
      const branch = shops.find(s => s.id === r.branchId);
      return branch?.area === user.area;
    });
  }

  function openCreate() {
    setEditingId(null);
    setTempId(crypto.randomUUID());
    setName("");
    setPhone("");
    setStatus("offline");
    setNationalId("");
    setVehicleType("motorcycle");
    setVehiclePlate("");
    setAvatarUrl("");
    setBranchId("");
    setColor("#3b82f6");
    setDialogOpen(true);
  }

  function openEdit(rider: Rider) {
    setEditingId(rider.id);
    setTempId(rider.id);
    setName(rider.name);
    setNickname(rider.nickname || "");
    setPhone(rider.phone);
    setStatus(rider.status);
    setNationalId(rider.nationalId || "");
    setVehicleType(rider.vehicleType || "motorcycle");
    setVehiclePlate(rider.vehiclePlate || "");
    setAvatarUrl(rider.avatarUrl || "");
    setBranchId(rider.branchId || "");
    setColor(rider.color || "#3b82f6");
    setDialogOpen(true);
  }

  function handleSave() {
    if (!name.trim() || !phone.trim() || !nationalId.trim() || !vehiclePlate.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const payload = { 
      name, nickname, phone, status, nationalId, vehicleType, vehiclePlate, avatarUrl, branchId: branchId || undefined, color
    };

    if (editingId) {
      riderStore.updateRider(editingId, payload);
      toast.success("Rider profile updated.");
    } else {
      riderStore.addRider({
        ...payload,
        id: tempId, // Use the generated UUID so the image path matches the record
        rating: 5.0, // Default for new
        completedJobs: 0,
        avatarUrl: avatarUrl || `https://i.pravatar.cc/150?u=${Date.now()}`,
      });
      toast.success("New rider added successfully.");
    }
    setDialogOpen(false);
  }

  function handleDelete(id: string, riderName: string) {
    if (confirm(`Are you sure you want to remove ${riderName}?`)) {
      riderStore.deleteRider(id);
      toast.success("Rider removed.");
    }
  }

  async function handleToggleResign(rider: Rider) {
    const isResigning = rider.isActive !== false;
    if (confirm(`Are you sure you want to ${isResigning ? 'resign' : 'reactivate'} ${rider.name}?`)) {
      await riderStore.updateRider(rider.id, { isActive: !isResigning });
      toast.success(`Rider ${isResigning ? 'resigned' : 'reactivated'}.`);
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Rider Management</h2>
          <p className="text-sm text-slate-500 mt-1">Add, update, or remove delivery personnel.</p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Rider Profile" : "Create New Rider"}</DialogTitle>
              <DialogDescription>
                Fill in the details for the delivery personnel.
              </DialogDescription>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-6 py-4">
              {/* Column 1 */}
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="riderName">Full Name *</Label>
                  <Input id="riderName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Somchai R." />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="riderNickname">Nickname / Short Code</Label>
                  <Input id="riderNickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. RIDER-01 or Boy" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="riderPhone">Phone Number *</Label>
                  <Input id="riderPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08X-XXX-XXXX" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="riderId">National ID *</Label>
                  <Input id="riderId" value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="1-xxxx-xxxxx-xx-x" />
                </div>
                <div className="grid gap-2">
                  <Label>Current Status</Label>
                  <div className="flex gap-2">
                    <Badge variant={status === "online" ? "default" : "outline"} className={`cursor-pointer ${status === 'online' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`} onClick={() => setStatus("online")}>Online</Badge>
                    <Badge variant={status === "offline" ? "default" : "outline"} className={`cursor-pointer ${status === 'offline' ? 'bg-slate-600 hover:bg-slate-700' : ''}`} onClick={() => setStatus("offline")}>Offline</Badge>
                    <Badge 
                      variant={status === "busy" ? "default" : "outline"} 
                      className={`${status === 'busy' ? 'bg-amber-500 hover:bg-amber-600 cursor-default' : 'opacity-40 cursor-not-allowed'}`} 
                      title="Busy status is set automatically when a rider starts a job"
                    >
                      Busy
                    </Badge>
                  </div>
                </div>
              </div>
              
              {/* Column 2 */}
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>Vehicle Type</Label>
                  <div className="flex gap-2">
                    <Badge variant={vehicleType === "motorcycle" ? "default" : "outline"} className="cursor-pointer" onClick={() => setVehicleType("motorcycle")}>🏍️ Motorcycle</Badge>
                    <Badge variant={vehicleType === "car" ? "default" : "outline"} className="cursor-pointer" onClick={() => setVehicleType("car")}>🚗 Car</Badge>
                    <Badge variant={vehicleType === "truck" ? "default" : "outline"} className="cursor-pointer" onClick={() => setVehicleType("truck")}>🚚 Truck</Badge>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="branchId">Branch Assignment</Label>
                  <select
                    id="branchId"
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                  >
                    <option value="">-- No Branch Assigned --</option>
                    {shops.map(shop => (
                      <option key={shop.id} value={shop.id}>{shop.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="vehiclePlate">License Plate *</Label>
                  <Input id="vehiclePlate" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} placeholder="e.g. 1กข 1234 กทม" />
                </div>
                <div className="grid gap-2">
                  <Label>Calendar Color</Label>
                  <div className="grid grid-cols-6 gap-3 mt-1 w-max">
                    {RIDER_COLORS.map(c => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => setColor(c.hex)}
                        className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-transform ${color.toUpperCase() === c.hex ? 'border-slate-900 scale-110 shadow-md' : 'border-transparent hover:scale-110'}`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      >
                        {color.toUpperCase() === c.hex && <CheckCircle2 size={18} className="text-white drop-shadow-sm" />}
                      </button>
                    ))}
                    <div className="relative w-9 h-9">
                      <input
                        type="color"
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        title="Custom Color"
                      />
                      <button
                        type="button"
                        className={`w-9 h-9 rounded-full flex items-center justify-center bg-slate-200 text-slate-600 border-2 transition-transform ${!RIDER_COLORS.find(c => c.hex === color.toUpperCase()) ? 'border-slate-900 scale-110 shadow-md bg-white' : 'border-transparent hover:scale-110'}`}
                        style={{ backgroundColor: !RIDER_COLORS.find(c => c.hex === color.toUpperCase()) ? color : undefined }}
                      >
                        {!RIDER_COLORS.find(c => c.hex === color.toUpperCase()) ? (
                          <CheckCircle2 size={18} className={parseInt(color.slice(1), 16) > 0xffffff / 2 ? 'text-slate-800' : 'text-white drop-shadow-sm'} />
                        ) : (
                          <Plus size={18} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Profile Picture (Cloud Upload)</Label>
                  <div className="w-32">
                    <ImageUploader 
                      entityType="rider"
                      entityId={tempId}
                      currentImageUrl={avatarUrl}
                      onUploadSuccess={(url) => {
                        setAvatarUrl(url);
                        toast.success("Profile picture uploaded successfully");
                      }}
                      onError={(err) => toast.error(`Upload failed: ${err}`)}
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="cursor-pointer">Cancel</Button>
              <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer">
                Save Profile
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex border-b border-slate-200 gap-6">
        <button
          className={`pb-3 font-semibold text-sm transition-colors ${viewMode === 'active' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setViewMode('active')}
        >
          Active Riders ({activeRiders.length})
        </button>
        <button
          className={`pb-3 font-semibold text-sm transition-colors ${viewMode === 'resigned' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setViewMode('resigned')}
        >
          Resigned ({resignedRiders.length})
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <AnimatePresence>
          {displayedRiders.map((rider, i) => (
            <motion.div
              key={rider.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group relative flex flex-col overflow-hidden"
              style={{ borderTop: `4px solid ${rider.color || '#3b82f6'}` }}
            >
              <div className="h-24 bg-gradient-to-r from-indigo-50 to-blue-50 relative rounded-t-2xl">
                <div className="absolute inset-x-0 bottom-0 translate-y-1/2 flex justify-center">
                  <div className="relative">
                    <img
                      src={rider.avatarUrl || "https://i.pravatar.cc/150"}
                      alt={rider.name}
                      className="w-20 h-20 rounded-full border-4 border-white object-cover bg-slate-100 shadow-sm"
                    />
                    <div className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white ${statusColorMap[rider.status]}`} />
                  </div>
                </div>
              </div>
              
              <div className="pt-14 pb-6 px-6 text-center">
                <h3 className="text-lg font-bold text-slate-900">{rider.name}</h3>
                <p className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 inline-block px-2 py-0.5 rounded-full mt-1.5">{rider.nickname || rider.id.split('-')[0]}</p>
                
                <div className="flex items-center justify-center gap-1.5 mt-3 text-slate-600">
                  <Phone size={14} />
                  <span className="text-sm">{rider.phone}</span>
                </div>

                {rider.vehiclePlate && (
                  <div className="mt-3 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    {rider.vehicleType === 'motorcycle' ? '🏍️' : rider.vehicleType === 'truck' ? '🚚' : '🚗'} {rider.vehiclePlate}
                  </div>
                )}

                {rider.branchId && (
                  <div className="mt-2 text-xs font-medium text-slate-500 flex items-center justify-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block"></span>
                    {shops.find(s => s.id === rider.branchId)?.name || 'Unknown Branch'}
                  </div>
                )}
                
                <div className="grid grid-cols-3 gap-1 mt-5 pt-4 border-t border-slate-100 w-full">
                  <div className="text-center flex flex-col items-center justify-center">
                    <div className="flex items-center justify-center gap-1 text-slate-700 font-semibold text-indigo-600 text-sm">
                      ฿{(riderStats[rider.id]?.monthEarnings || 0).toFixed(0)}
                    </div>
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">Month</p>
                  </div>
                  <div className="text-center flex flex-col items-center justify-center border-l border-slate-100">
                    <div className="flex items-center justify-center gap-1 text-slate-600 font-medium text-sm">
                      ฿{(riderStats[rider.id]?.totalEarnings || 0).toFixed(0)}
                    </div>
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">Total</p>
                  </div>
                  <div className="text-center flex flex-col items-center justify-center border-l border-slate-100">
                    <div className="flex items-center justify-center gap-1 text-slate-700 font-semibold text-sm">
                      <CheckCircle2 size={12} className="text-emerald-500" />
                      {riderStats[rider.id]?.completedJobsCount || 0}
                    </div>
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">Jobs</p>
                  </div>
                </div>

                {/* Edit Actions Overlay */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 group-hover:pointer-events-auto">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8 bg-white/80 backdrop-blur border-slate-200 text-slate-600 hover:text-indigo-600 shadow-sm cursor-pointer"
                    onClick={() => setReportRiderId(rider.id)}
                    title="Monthly Earnings Report"
                  >
                    <BarChart3 size={14} />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8 bg-white/80 backdrop-blur border-slate-200 text-slate-600 hover:text-indigo-600 shadow-sm cursor-pointer"
                    onClick={() => openEdit(rider)}
                  >
                    <Edit2 size={14} />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8 bg-white/80 backdrop-blur border-slate-200 text-slate-600 hover:text-orange-600 shadow-sm cursor-pointer"
                    onClick={() => handleToggleResign(rider)}
                    title={rider.isActive !== false ? "Resign Rider" : "Reactivate Rider"}
                  >
                    {rider.isActive !== false ? <UserX size={14} /> : <UserCheck size={14} />}
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-8 w-8 bg-white/80 backdrop-blur border-slate-200 text-slate-600 hover:text-red-600 shadow-sm cursor-pointer"
                    onClick={() => handleDelete(rider.id, rider.name)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <MonthlyReportModal 
        rider={riders.find(r => r.id === reportRiderId) || null} 
        jobs={jobs}
        onClose={() => setReportRiderId(null)} 
      />
    </div>
  );
}

function MonthlyReportModal({ 
  rider, 
  jobs, 
  onClose 
}: { 
  rider: Rider | null; 
  jobs: Job[]; 
  onClose: () => void 
}) {
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [historyJobs, setHistoryJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    if (transactions.length > 0) {
      const missingIds = transactions
        .map(t => t.jobId)
        .filter(id => id && !jobs.find(j => j.id === id)) as string[];
      
      if (missingIds.length > 0) {
        getJobsByIdsAction(Array.from(new Set(missingIds))).then(data => {
          setHistoryJobs(data as any);
        }).catch(err => {
          console.error("Failed to load historical jobs for report", err);
        });
      }
    }
  }, [transactions, jobs]);

  useEffect(() => {
    if (rider) {
      setIsLoading(true);
      getRiderTransactionsAction(rider.id).then(data => {
        setTransactions(data);
      }).catch(err => {
        console.error(err);
        toast.error("Failed to load transactions");
      }).finally(() => {
        setIsLoading(false);
      });
    } else {
      setTransactions([]);
    }
  }, [rider]);

  if (!rider) return null;

  const grouped = transactions.reduce((acc, t) => {
    const monthYear = format(new Date(t.createdAt), 'MMMM yyyy');
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(t);
    return acc;
  }, {} as Record<string, any[]>);

  const months = Object.keys(grouped).sort((a: string, b: string) => {
    return new Date(b).getTime() - new Date(a).getTime();
  });

  const downloadCSV = () => {
    if (!rider) return;
    
    // Create CSV content with BOM for Thai support
    let csvContent = "\uFEFF";
    csvContent += "Date,Job ID,Customer Name,Status,Type,Location,Distance (km),Amount (THB)\n";
    
    transactions.forEach(t => {
      const job = jobs.find(j => j.id === t.jobId) || historyJobs.find(j => j.id === t.jobId);
      const date = format(new Date(t.createdAt), "yyyy-MM-dd HH:mm");
      const jobId = t.jobId || "-";
      let customerName = "-";
      let customerStatus = "-";
      let type = t.type.replace('commission_', '');
      let location = "-";
      let distance = "0";
      
      if (job) {
        customerName = job.customerName || "-";
        customerStatus = (job as any).customerStatus === 'vip' ? 'VIP' : (job as any).customerStatus === 'member' ? 'Member' : 'Normal';
        
        if (t.type.includes('pickup')) {
          location = job.pickupLocation?.replace(/,/g, ' ') || "-";
          distance = (job.pickupDistance || 0).toString();
        } else if (t.type.includes('delivery')) {
          location = job.dropoffLocation?.replace(/,/g, ' ') || "-";
          distance = (job.deliveryDistance || 0).toString();
        }
      }
      
      const safeCustomerName = `"${customerName.replace(/"/g, '""')}"`;
      const safeLocation = `"${location.replace(/"/g, '""')}"`;
      
      csvContent += `${date},${jobId},${safeCustomerName},${customerStatus},${type},${safeLocation},${distance},${t.amount}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `rider_report_${rider.id}_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={!!rider} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-0 shadow-2xl">
        <DialogHeader className="p-8 pb-4 bg-slate-900 text-white rounded-t-lg print:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="relative">
                <img src={rider.avatarUrl} alt={rider.name} className="w-16 h-16 rounded-full border-2 border-white/20 object-cover shadow-lg" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold flex items-center gap-2 text-white">
                  Monthly Performance Report
                </DialogTitle>
                <DialogDescription className="text-slate-400 font-medium">
                  Detailed earnings log for {rider.name} • Internal Reference: {rider.id}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                className="bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 gap-2 cursor-pointer"
                onClick={downloadCSV}
              >
                <Download size={16} />
                Export Excel
              </Button>
              <Button 
                variant="outline" 
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 gap-2 cursor-pointer"
                onClick={() => {
                  const originalTitle = document.title;
                  const monthToUse = expandedMonth || (months.length > 0 ? months[0] : format(new Date(), "MMMM yyyy"));
                  document.title = `${rider.name} - ${monthToUse}`;
                  window.print();
                  setTimeout(() => {
                    document.title = originalTitle;
                  }, 100);
                  toast.success("Preparing report for print...");
                }}
              >
                <ArrowRight size={16} className="rotate-90" />
                Download PDF
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 bg-slate-50/80 print:hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Total Transactions</p>
              <p className="text-2xl font-bold text-slate-900">{transactions.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Current Balance</p>
              <p className="text-2xl font-bold text-indigo-600">฿{(rider.commissionBalance || 0).toFixed(2)}</p>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-slate-500">Loading transactions...</p>
            </div>
          ) : months.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200">
              <Calendar className="mx-auto text-slate-300 mb-3" size={40} />
              <p className="text-slate-500 font-medium">No transactions found for this rider.</p>
            </div>
          ) : (
            months.map((month) => {
              const monthTrans = grouped[month];
              const monthEarnings = monthTrans.reduce((sum: number, t: any) => sum + t.amount, 0);
              const isExpanded = expandedMonth === month;
              
              return (
                <div key={month} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <button 
                    onClick={() => setExpandedMonth(isExpanded ? null : month)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Calendar size={18} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">{month}</h4>
                        <p className="text-xs text-slate-500">{monthTrans.length} transactions</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Total Earned</p>
                        <p className="text-lg font-bold text-indigo-600">฿{monthEarnings.toFixed(2)}</p>
                      </div>
                      {isExpanded ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                    </div>
                  </button>
                  
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        className="overflow-hidden border-t border-slate-100"
                      >
                        <div className="p-4 space-y-2">
                           <div className="grid grid-cols-[1.5fr_1.5fr_2fr_1fr_1fr_1fr] px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 rounded-lg gap-2">
                            <span>Job</span>
                            <span>Customer</span>
                            <span>Location</span>
                            <span>Type/Dist</span>
                            <span>Date</span>
                            <span className="text-right">Amount</span>
                          </div>
                          {monthTrans.map((t: any) => {
                            const job = jobs.find(j => j.id === t.jobId) || historyJobs.find(j => j.id === t.jobId);
                            let location = "-";
                            let distance = 0;
                            let isVip = (job as any)?.customerStatus === 'vip';
                            let isMember = (job as any)?.customerStatus === 'member';

                            if (job) {
                              if (t.type.includes('pickup')) {
                                location = job.pickupLocation || "-";
                                distance = job.pickupDistance || 0;
                              } else if (t.type.includes('delivery')) {
                                location = job.dropoffLocation || "-";
                                distance = job.deliveryDistance || 0;
                              }
                            }

                            return (
                              <div key={t.id} className="grid grid-cols-[1.5fr_1.5fr_2fr_1fr_1fr_1fr] gap-2 items-center px-3 py-3 text-sm border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors rounded-lg">
                                <div className="flex flex-col">
                                  {t.jobId ? (
                                    <button onClick={() => setSelectedJobId(t.jobId)} className="font-mono font-bold text-indigo-600 hover:underline text-left cursor-pointer">
                                      {t.jobId}
                                    </button>
                                  ) : (
                                    <span className="font-mono font-bold text-slate-700">-</span>
                                  )}
                                  <span className="text-[10px] text-slate-500 line-clamp-1">{t.detail}</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-semibold text-slate-800 line-clamp-1">{job?.customerName || "-"}</span>
                                  {isVip && <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded w-fit mt-0.5">VIP</span>}
                                  {!isVip && isMember && <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded w-fit mt-0.5">MEMBER</span>}
                                </div>
                                <div className="flex items-center">
                                  <span className="text-xs text-slate-600 line-clamp-2" title={location}>{location}</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <Badge variant="outline" className="text-[9px] w-fit">{t.type.replace('commission_', '')}</Badge>
                                  {distance > 0 && <span className="text-[10px] text-slate-500 font-medium">{distance} km</span>}
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-medium">
                                  {format(new Date(t.createdAt), "MMM d, HH:mm")}
                                </div>
                                <div className={`text-right font-bold ${t.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {t.amount >= 0 ? '+' : ''}฿{Math.abs(t.amount).toFixed(2)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
        <DialogFooter className="p-4 border-t border-slate-100 bg-white print:hidden">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto cursor-pointer">Close Report</Button>
        </DialogFooter>

        {/* --- FORMAL PRINT LAYOUT (HIDDEN ON SCREEN, VISIBLE ON PRINT) --- */}
        {typeof window !== 'undefined' && createPortal(
          <div className="hidden print:block bg-white text-black p-6 w-full print-root">
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <img src={rider.avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover grayscale" />
                <div>
                  <h1 className="text-xl font-black uppercase tracking-tight">Rider Performance Report</h1>
                  <p className="text-xs font-medium">Internal Ref: {rider.id}</p>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-lg font-bold">{rider.name}</h2>
                <p className="text-xs">Printed on: {format(new Date(), "dd MMMM yyyy, HH:mm")}</p>
              </div>
            </div>

            {/* Summary Row */}
            <div className="flex justify-between bg-slate-100 p-3 rounded-lg mb-6">
              <div>
                <p className="text-[10px] uppercase font-bold text-slate-500">Total Transactions</p>
                <p className="text-lg font-black">{transactions.length}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-slate-500">Current Balance</p>
                <p className="text-lg font-black">฿{(rider.commissionBalance || 0).toFixed(2)}</p>
              </div>
            </div>

            {/* Transactions Table */}
            {months.length === 0 ? (
              <p className="text-center py-6 text-slate-500 text-sm">No transactions recorded.</p>
            ) : (
              months
                .filter((month) => !expandedMonth || month === expandedMonth)
                .map((month) => {
                  const monthTrans = grouped[month];
                  const monthEarnings = monthTrans.reduce((sum: number, t: any) => sum + t.amount, 0);

                  return (
                    <div key={month} className="mb-6">
                      <div className="flex justify-between items-end border-b border-slate-300 pb-1 mb-2">
                        <h3 className="text-base font-bold">{month}</h3>
                        <p className="text-sm font-bold text-slate-700">Total: ฿{monthEarnings.toFixed(2)}</p>
                      </div>

                    
                    <table className="w-full text-left text-[9px] leading-tight">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-1.5 font-bold uppercase w-[20%]">Date & Time</th>
                          <th className="py-1.5 font-bold uppercase w-[20%]">Job / Customer</th>
                          <th className="py-1.5 font-bold uppercase w-[35%]">Location Details</th>
                          <th className="py-1.5 font-bold uppercase w-[15%]">Type</th>
                          <th className="py-1.5 font-bold uppercase text-right w-[10%]">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthTrans.map((t: any) => {
                          const job = jobs.find(j => j.id === t.jobId) || historyJobs.find(j => j.id === t.jobId);
                          let location = "-";
                          let distance = 0;
                          if (job) {
                            if (t.type.includes('pickup')) {
                              location = job.pickupLocation || "-";
                              distance = job.pickupDistance || 0;
                            } else if (t.type.includes('delivery')) {
                              location = job.dropoffLocation || "-";
                              distance = job.deliveryDistance || 0;
                            }
                          }

                          return (
                            <tr key={t.id} className="border-b border-slate-100 last:border-0 break-inside-avoid">
                              <td className="py-1.5 pr-2 whitespace-nowrap">{format(new Date(t.createdAt), "dd MMM yy, HH:mm")}</td>
                              <td className="py-1.5 pr-2">
                                <div className="font-mono font-bold">{t.jobId || "-"}</div>
                                <div className="text-slate-600 truncate max-w-[120px]">{job?.customerName || "-"}</div>
                              </td>
                              <td className="py-1.5 pr-2">
                                <div className="line-clamp-2 leading-tight">{location}</div>
                              </td>
                              <td className="py-1.5 pr-2">
                                <div>{t.type.replace('commission_', '')}</div>
                                {distance > 0 && <div className="text-slate-500">{distance} km</div>}
                              </td>
                              <td className="py-1.5 text-right font-bold whitespace-nowrap">
                                {t.amount >= 0 ? '+' : ''}฿{Math.abs(t.amount).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })
            )}
          </div>,
          document.body
        )}
      </DialogContent>

      <Dialog open={!!selectedJobId} onOpenChange={(v) => !v && setSelectedJobId(null)}>
        <DialogContent className="max-w-md p-4 max-h-[90vh] overflow-hidden flex flex-col pt-8 z-[60]">
          <DialogTitle className="sr-only">Task Tracker</DialogTitle>
          {selectedJobId && jobs.find((j) => j.id === selectedJobId) && (
            <AdminTaskTracker job={jobs.find((j) => j.id === selectedJobId)!} readOnly />
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
