import { motion } from "framer-motion";
import { type Job, jobStore, type JobLegs } from "@/lib/store";
import { useRiders } from "@/lib/use-riders";
import { CheckCircle2, Circle, Truck, Package, Timer, ArrowRight, Home, Edit2, Check, X, Copy } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TimePicker } from "@/components/ui/time-picker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Step({ title, desc, legKey, leg, icon, toggleLegStatus, getRiderName }: any) {
  const isCompleted = leg.status === "completed";
  const isInTransit = leg.status === "in_transit";
  return (
    <div className="flex gap-4 relative pb-8 group">
      <div className="absolute top-8 left-[15px] w-px h-full bg-slate-200 -z-10" />
      <div 
        onClick={() => toggleLegStatus(legKey, leg.status)}
        className={`w-8 h-8 rounded-full border-2 bg-white flex items-center justify-center shrink-0 cursor-pointer shadow-sm transition-all ${
          isCompleted ? "border-emerald-500 text-emerald-500" : 
          isInTransit ? "border-blue-500 text-blue-500 shadow-blue-100" : "border-slate-300 text-slate-300 hover:border-slate-400"
        }`}
      >
        {isCompleted ? <CheckCircle2 size={16} /> : isInTransit ? icon : <Circle size={10} />}
      </div>
      <div className="flex-1 pt-0.5">
        <div className="flex items-center justify-between">
          <h4 className={`text-sm font-semibold transition-colors ${
            isCompleted ? "text-slate-900" : isInTransit ? "text-blue-700" : "text-slate-600 group-hover:text-slate-900"
          }`}>
            {title}
          </h4>
          <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">
            {format(new Date(leg.scheduledAt), "HH:mm")}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1 mb-2.5 leading-relaxed">{desc}</p>
        <div className="inline-flex items-center gap-1.5 bg-slate-50 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 border border-slate-200 shadow-sm">
          <Truck size={12} className={leg.riderId ? "text-indigo-500" : "text-amber-500"} />
          {getRiderName(leg.riderId)}
        </div>
      </div>
    </div>
  );
}

export function AdminTaskTracker({ job, readOnly = false }: { job: Job, readOnly?: boolean }) {
  const riders = useRiders();
  const [deliveryRiderId, setDeliveryRiderId] = useState(job.legs?.deliveryOutbound.riderId || "");
  const [deliveryTime, setDeliveryTime] = useState(
    job.legs?.deliveryOutbound.scheduledAt ? format(new Date(job.legs.deliveryOutbound.scheduledAt), "HH:mm") : ""
  );
  


  const handleDuplicateJob = async () => {
    try {
      const newJobData = { ...job };
      delete (newJobData as any).id;
      delete (newJobData as any).createdAt;
      delete (newJobData as any).completedAt;
      delete (newJobData as any).customer;
      delete (newJobData as any).legs;
      
      await jobStore.addJob({
        ...newJobData,
        status: "pending",
        pickupRiderId: undefined,
        deliveryRiderId: undefined,
        bagImageUrl: undefined,
        billImageUrl: undefined,
        proofImageUrl: undefined,
      } as any);

      toast.success("Job duplicated and sent to Order Verify.");
    } catch (e: any) {
      toast.error(`Error duplicating job: ${e.message}`);
    }
  };

  if (!job.legs) return (
    <div className="p-4 text-center text-slate-500">Legacy Job without full 4-trip details.</div>
  );

  const toggleLegStatus = (legKey: keyof JobLegs, currentStatus: string) => {
    if (readOnly) return;
    let nextStatus: "pending" | "in_transit" | "completed" = "pending";
    if (currentStatus === "pending") nextStatus = "in_transit";
    else if (currentStatus === "in_transit") nextStatus = "completed";
    else nextStatus = "pending";

    jobStore.updateJobLeg(job.id, legKey, { status: nextStatus });
  };

  const handleScheduleDelivery = () => {
    if (!deliveryTime) return;
    const date = new Date();
    const [hours, minutes] = deliveryTime.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);

    // If it's earlier than pickup or already passed, assume tomorrow
    if (date <= new Date(job.pickupScheduledAt || job.scheduledAt)) {
      date.setDate(date.getDate() + 1);
    }

    jobStore.assignDeliveryRider(job.id, deliveryRiderId, date);
  };

  const getRiderName = (id?: string) => {
    if (!id) return "Unassigned";
    return riders.find(r => r.id === id)?.name || id;
  };



  return (
    <div className="bg-white p-2 flex flex-col h-full rounded-xl overflow-y-auto">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
        <div className="bg-indigo-50 p-2.5 rounded-lg text-indigo-600">
          <Package size={22} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900 leading-tight">Order Lifecycle <span className="text-slate-400 font-normal ml-2">{job.id}</span></h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-100 py-0 h-5">
              {job.serviceType === 'wash_iron_fold' ? 'Wash/Iron/Fold' : 'Wash/Fold'}
            </Badge>
            <p className="text-xs font-medium text-slate-500">Commission: <span className="text-emerald-600 font-bold ml-1">฿{((job.pickupCommission || 0) + (job.deliveryCommission || 0)).toFixed(0)}</span></p>
          </div>
          
          <div className="mt-3 flex items-center gap-3">
            <Badge className={`${job.isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'} border-none shadow-none`}>
              {job.isPaid ? 'PAID' : 'UNPAID'}
            </Badge>
            {!readOnly && (
              <Button 
                variant="outline" 
                size="sm" 
                className="h-6 text-[10px]"
                onClick={() => jobStore.updateJobDetails(job.id, { isPaid: !job.isPaid })}
              >
                Toggle Payment
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 px-1">
        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
          <ArrowRight size={14} className="text-emerald-400" /> Pickup Logistics
        </h3>

        <Step 
          toggleLegStatus={toggleLegStatus}
          getRiderName={getRiderName} 
          title="Outbound Pickup" 
          desc={`Going to retrieve dirty laundry at ${job.pickupLocation}`}
          legKey="pickupOutbound"
          leg={job.legs.pickupOutbound}
          icon={<Truck size={16} />} 
        />
        <Step 
          toggleLegStatus={toggleLegStatus}
          getRiderName={getRiderName} 
          title="Return to Shop (Inbound)" 
          desc="Returning to shop with customer laundry."
          legKey="pickupInbound"
          leg={job.legs.pickupInbound}
          icon={<Home size={16} />} 
        />

        <div className="my-2 py-4 border-y border-slate-100">
           <h3 className="text-xs font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-2">
            <Timer size={14} /> Shop Phase (Washing/Cleaning)
          </h3>
          <p className="text-[10px] text-slate-400 mt-1 pl-6">Store Branch Processing Phase</p>
          {!readOnly && (
            <div className="flex gap-2 mt-4 ml-6">
               {job.status === "billing" && (
                 <Button 
                   size="sm" 
                   className="bg-indigo-600 text-white hover:bg-indigo-700"
                   onClick={() => jobStore.updateJobDetails(job.id, { status: (job.source === 'pos' || job.type === 'in_store') ? "completed" : "delivery", subStatus: undefined })}
                 >
                   Processing Complete {(job.source === 'pos' || job.type === 'in_store') ? "(Job Finished)" : "(Ready for Delivery)"}
                 </Button>
               )}
            </div>
          )}
        </div>

        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-6 mb-4 flex items-center gap-2">
          <ArrowRight size={14} className="text-blue-400" /> Delivery Logistics
        </h3>

        {/* Delivery Assignment Subtask */}
        {!readOnly && (
          <div className="mb-6 p-3 rounded-lg border border-indigo-100 bg-indigo-50/30 space-y-3">
            <p className="text-[11px] font-bold text-indigo-600 uppercase">Schedule Delivery Subtask</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">Rider</Label>
                <select
                  className="w-full h-8 text-xs rounded border border-slate-200 bg-white px-2"
                  value={deliveryRiderId}
                  onChange={(e) => setDeliveryRiderId(e.target.value)}
                >
                  <option value="">-- Assign --</option>
                  {riders.map(r => (
                    <option key={`tracker-d-${r.id}`} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500">Time</Label>
                <TimePicker
                  value={deliveryTime}
                  onChange={setDeliveryTime}
                />
              </div>
            </div>
            <Button 
              size="sm" 
              variant="secondary" 
              className="w-full h-7 text-[10px] font-bold bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={handleScheduleDelivery}
            >
              Update Delivery Legs
            </Button>
          </div>
        )}

        <Step 
          toggleLegStatus={toggleLegStatus}
          getRiderName={getRiderName} 
          title="Outbound Delivery" 
          desc={`Delivering clean laundry to ${job.dropoffLocation}`}
          legKey="deliveryOutbound"
          leg={job.legs.deliveryOutbound}
          icon={<Truck size={16} />} 
        />
        <Step 
          toggleLegStatus={toggleLegStatus}
          getRiderName={getRiderName} 
          title="Return to Shop (Final)" 
          desc="Rider returning back to home base. Job concluded."
          legKey="deliveryInbound"
          leg={job.legs.deliveryInbound}
          icon={<Home size={16} />} 
        />
        
        {!readOnly && (
          <div className="pt-4 mt-6 border-t border-slate-200 space-y-2">
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={handleDuplicateJob} 
                className="flex-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
              >
                <Copy size={16} className="mr-2" />
                Duplicate
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  if (confirm("Are you sure you want to cancel this job?")) {
                    jobStore.updateJobDetails(job.id, { status: "cancel" });
                  }
                }}
                className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
              >
                <X size={16} className="mr-2" />
                Cancel
              </Button>
            </div>
            {job.status === "pickup" && (
              <Button 
                variant="outline" 
                onClick={() => jobStore.updateJobDetails(job.id, { status: "billing" })}
                className="w-full text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              >
                <Check size={16} className="mr-2" />
                Mark as Picked Up
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
