"use client";

import { useState, useMemo } from "react";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2, Phone, Star, Activity, Circle, CheckCircle2, BarChart3, ChevronRight, ChevronDown, Calendar, ArrowRight, Banknote, Image as ImageIcon } from "lucide-react";
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
import { riderStore, type Rider, type Job } from "@/lib/store";
import { useRiders } from "@/lib/use-riders";
import { useJobs } from "@/lib/use-jobs";
import { toast } from "sonner";
import Image from "next/image";

const statusColorMap = {
  online: "bg-emerald-500",
  offline: "bg-slate-300",
  busy: "bg-amber-500",
};

export function AdminRiders() {
  const riders = useRiders();
  const jobs = useJobs();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reportRiderId, setReportRiderId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const riderStats = useMemo(() => {
    const stats: Record<string, { monthEarnings: number, totalEarnings: number }> = {};
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    jobs.forEach(j => {
      if (j.status !== 'completed' || !j.riderId) return;
      if (!stats[j.riderId]) stats[j.riderId] = { monthEarnings: 0, totalEarnings: 0 };
      
      const earning = j.distance * 2;
      stats[j.riderId].totalEarnings += earning;
      
      const date = new Date(j.completedAt || j.createdAt);
      if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
        stats[j.riderId].monthEarnings += earning;
      }
    });
    return stats;
  }, [jobs]);

  // Form State
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<Rider["status"]>("offline");
  const [nationalId, setNationalId] = useState("");
  const [vehicleType, setVehicleType] = useState<Rider["vehicleType"]>("motorcycle");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  function openCreate() {
    setEditingId(null);
    setName("");
    setPhone("");
    setStatus("offline");
    setNationalId("");
    setVehicleType("motorcycle");
    setVehiclePlate("");
    setAvatarUrl("");
    setDialogOpen(true);
  }

  function openEdit(rider: Rider) {
    setEditingId(rider.id);
    setName(rider.name);
    setNickname(rider.nickname || "");
    setPhone(rider.phone);
    setStatus(rider.status);
    setNationalId(rider.nationalId || "");
    setVehicleType(rider.vehicleType || "motorcycle");
    setVehiclePlate(rider.vehiclePlate || "");
    setAvatarUrl(rider.avatarUrl || "");
    setDialogOpen(true);
  }

  function handleSave() {
    if (!name.trim() || !phone.trim() || !nationalId.trim() || !vehiclePlate.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const payload = { 
      name, nickname, phone, status, nationalId, vehicleType, vehiclePlate, avatarUrl
    };

    if (editingId) {
      riderStore.updateRider(editingId, payload);
      toast.success("Rider profile updated.");
    } else {
      riderStore.addRider({
        ...payload,
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

  return (
    <div className="flex-1 overflow-auto p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Rider Management</h2>
          <p className="text-sm text-slate-500 mt-1">Add, update, or remove delivery personnel.</p>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          {/* Add New Rider button removed to enforce creation via Manage Users */}
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
                    <Badge variant={status === "busy" ? "default" : "outline"} className={`cursor-pointer ${status === 'busy' ? 'bg-amber-500 hover:bg-amber-600' : ''}`} onClick={() => setStatus("busy")}>Busy</Badge>
                    <Badge variant={status === "offline" ? "default" : "outline"} className={`cursor-pointer ${status === 'offline' ? 'bg-slate-600 hover:bg-slate-700' : ''}`} onClick={() => setStatus("offline")}>Offline</Badge>
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
                  <Label htmlFor="vehiclePlate">License Plate *</Label>
                  <Input id="vehiclePlate" value={vehiclePlate} onChange={(e) => setVehiclePlate(e.target.value)} placeholder="e.g. 1กข 1234 กทม" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="avatarUpload">Profile Picture (Upload)</Label>
                  <div className="flex items-center gap-4">
                    {avatarUrl ? (
                      <div className="w-12 h-12 rounded-full border border-slate-200 overflow-hidden shrink-0">
                        <img src={avatarUrl} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-full border border-dashed border-slate-300 bg-slate-50 shrink-0" />
                    )}
                    <Input 
                      id="avatarUpload"
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setAvatarUrl(URL.createObjectURL(e.target.files[0]));
                        }
                      }}
                      className="cursor-pointer text-xs"
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <AnimatePresence>
          {riders.map((rider, i) => (
            <motion.div
              key={rider.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group relative flex flex-col overflow-hidden"
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
                
                <div className="grid grid-cols-4 gap-1 mt-5 pt-4 border-t border-slate-100 w-full">
                  <div className="text-center flex flex-col items-center justify-center">
                    <div className="flex items-center justify-center gap-1 text-slate-700 font-semibold text-sm">
                      <Star size={12} className="text-amber-400 fill-amber-400" />
                      {rider.rating.toFixed(1)}
                    </div>
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">Rating</p>
                  </div>
                  <div className="text-center flex flex-col items-center justify-center border-l border-slate-100">
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
                      {rider.completedJobs}
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

  if (!rider) return null;

  // Group completed jobs by month
  const riderJobs = jobs.filter(j => j.riderId === rider.id && j.status === 'completed');
  
  const grouped = riderJobs.reduce((acc, job: Job) => {
    const monthYear = format(new Date(job.completedAt || job.createdAt), 'MMMM yyyy');
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(job);
    return acc;
  }, {} as Record<string, any[]>);

  const months = Object.keys(grouped).sort((a: string, b: string) => {
    return new Date(b).getTime() - new Date(a).getTime();
  });

  return (
    <Dialog open={!!rider} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-0 shadow-2xl">
        <DialogHeader className="p-8 pb-4 bg-slate-900 text-white rounded-t-lg">
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
            <Button 
              variant="outline" 
              className="bg-white/10 border-white/20 text-white hover:bg-white/20 gap-2 cursor-pointer"
              onClick={() => {
                window.print();
                toast.success("Preparing report for print...");
              }}
            >
              <ArrowRight size={16} className="rotate-90" />
              Download PDF Report
            </Button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6 bg-slate-50/80 print:bg-white print:p-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2 print:hidden">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Total Jobs Completed</p>
              <p className="text-2xl font-bold text-slate-900">{riderJobs.length}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Total Distance Traveled</p>
              <p className="text-2xl font-bold text-slate-900">{riderJobs.reduce((sum, j) => sum + j.distance, 0).toFixed(1)} km</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Lifetime Commission</p>
              <p className="text-2xl font-bold text-indigo-600">฿{riderJobs.reduce((sum, j) => sum + (j.distance * 2), 0).toFixed(0)}</p>
            </div>
          </div>

          {months.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-200">
              <Calendar className="mx-auto text-slate-300 mb-3" size={40} />
              <p className="text-slate-500 font-medium">No completed jobs found for this rider.</p>
            </div>
          ) : (
            months.map((month) => {
              const monthJobs = grouped[month];
              const monthEarnings = monthJobs.reduce((sum: number, j: Job) => sum + (j.distance * 2), 0);
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
                        <p className="text-xs text-slate-500">{monthJobs.length} assignments completed</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Total Earned</p>
                        <p className="text-lg font-bold text-indigo-600">฿{monthEarnings.toFixed(0)}</p>
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
                           <div className="grid grid-cols-4 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 rounded-lg">
                            <span>Job ID / Date</span>
                            <span>Distance</span>
                            <span>Customer Fee</span>
                            <span className="text-right">Commission</span>
                          </div>
                          {monthJobs.map((job: Job) => (
                            <div key={job.id} className="grid grid-cols-4 items-center px-3 py-3 text-sm border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors rounded-lg">
                              <div className="flex flex-col">
                                <span className="font-mono font-bold text-slate-700">{job.id}</span>
                                <span className="text-[10px] text-slate-400">{format(new Date(job.completedAt || job.createdAt), "MMM d, HH:mm")}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-600">
                                <Activity size={14} className="text-slate-400" />
                                {job.distance} km
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-600">
                                <Banknote size={14} className="text-emerald-500" />
                                ฿{job.fee.toFixed(0)}
                              </div>
                              <div className="text-right font-bold text-indigo-600">
                                ฿{(job.distance * 2).toFixed(0)}
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
        <DialogFooter className="p-4 border-t border-slate-100 bg-white">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto cursor-pointer">Close Report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
