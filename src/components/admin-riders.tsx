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
import { AdminTaskTracker } from "@/components/admin-task-tracker";
import { riderStore, shopStore, type Rider, type Job } from "@/lib/store";
import { useSyncExternalStore } from "react";
import { useRiders } from "@/lib/use-riders";
import { useJobs } from "@/lib/use-jobs";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";
import { ImageUploader } from "@/components/ui/image-uploader";
import { getRiderTransactionsAction } from "@/actions/db";
import { useEffect } from "react";

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
  const [tempId, setTempId] = useState<string>("");

  const riderStats = useMemo(() => {
    const stats: Record<string, { monthEarnings: number, totalEarnings: number }> = {};
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    riders.forEach(r => {
      stats[r.id] = { monthEarnings: 0, totalEarnings: r.commissionBalance || 0 };
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

  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);

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
    setDialogOpen(true);
  }

  function handleSave() {
    if (!name.trim() || !phone.trim() || !nationalId.trim() || !vehiclePlate.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const payload = { 
      name, nickname, phone, status, nationalId, vehicleType, vehiclePlate, avatarUrl, branchId: branchId || undefined
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
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2 print:hidden">
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
                           <div className="grid grid-cols-4 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 rounded-lg">
                            <span>Job / Detail</span>
                            <span>Type</span>
                            <span>Date</span>
                            <span className="text-right">Amount</span>
                          </div>
                          {monthTrans.map((t: any) => (
                            <div key={t.id} className="grid grid-cols-4 items-center px-3 py-3 text-sm border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors rounded-lg">
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
                              <div className="flex items-center gap-1.5 text-slate-600">
                                <Badge variant="outline" className="text-[10px]">{t.type.replace('commission_', '')}</Badge>
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                                {format(new Date(t.createdAt), "MMM d, HH:mm")}
                              </div>
                              <div className={`text-right font-bold ${t.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {t.amount >= 0 ? '+' : ''}฿{Math.abs(t.amount).toFixed(2)}
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
