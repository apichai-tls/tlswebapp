"use client";

import { useState, useMemo } from "react";
import { useJobs } from "@/lib/use-jobs";
import { useRiders } from "@/lib/use-riders";
import { jobStore, shopStore, type Job } from "@/lib/store";
import { useAuth } from "@/providers/auth-provider";
import { useSyncExternalStore } from "react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Truck, MapPin, User, X, Copy, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AdminTaskTracker } from "@/components/admin-task-tracker";

import { Calendar, dateFnsLocalizer, EventProps } from 'react-big-calendar';
import withDragAndDrop, { withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop';
import { format, parse, startOfWeek, getDay, addMinutes } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const DnDCalendar = withDragAndDrop(Calendar as any);

interface CalendarEvent {
  id: string;
  jobId: string;
  type: 'pickup' | 'delivery';
  title: string;
  start: Date;
  end: Date;
  riderId?: string;
  jobStatus: string;
}

const RIDER_COLORS = [
  '#3b82f6', // blue
  '#ec4899', // pink
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#ef4444', // red
  '#84cc16', // lime
];

export function AdminDispatch({ onEditJob }: { onEditJob?: (job: Job) => void }) {
  const allJobs = useJobs();
  const allRiders = useRiders();
  const { user } = useAuth();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  
  const [filterArea, setFilterArea] = useState<string>("ALL");
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editRiderId, setEditRiderId] = useState<string>("");
  const [viewJobId, setViewJobId] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<any>('week');

  // Filter riders by selected area
  const filteredRiders = useMemo(() => {
    if (filterArea === "ALL") return allRiders;
    return allRiders.filter(r => {
      const branch = shopLocations.find(s => s.id === r.branchId);
      return branch?.area === filterArea;
    });
  }, [allRiders, filterArea, shopLocations]);

  // Toggle rider selection
  const toggleRider = (riderId: string) => {
    const next = new Set(selectedRiderIds);
    if (next.has(riderId)) {
      next.delete(riderId);
    } else {
      next.add(riderId);
    }
    setSelectedRiderIds(next);
  };

  const toggleAllRiders = () => {
    if (selectedRiderIds.size === filteredRiders.length) {
      setSelectedRiderIds(new Set());
    } else {
      setSelectedRiderIds(new Set(filteredRiders.map(r => r.id)));
    }
  };

  // Filter & Map Jobs to Events
  const events = useMemo(() => {
    let jobs = allJobs.filter(j => j.status !== "pending" && j.status !== "cancel");
    
    // Filter jobs by selected area
    if (filterArea !== "ALL") {
      jobs = jobs.filter(j => {
        const branch = shopLocations.find(s => s.id === j.branchId);
        return branch?.area === filterArea;
      });
    }
    
    if (!showCompleted) {
      jobs = jobs.filter(j => j.status !== "completed");
    }

    if (selectedRiderIds.size > 0) {
      jobs = jobs.filter(j => {
        const hasPickupRider = j.pickupRiderId && selectedRiderIds.has(j.pickupRiderId);
        const hasDeliveryRider = j.deliveryRiderId && selectedRiderIds.has(j.deliveryRiderId);
        const isUnassignedPickup = !j.pickupRiderId;
        const isUnassignedDelivery = !j.deliveryRiderId;
        return hasPickupRider || hasDeliveryRider || isUnassignedPickup || isUnassignedDelivery;
      });
    }

    const calendarEvents: CalendarEvent[] = [];

    jobs.forEach(job => {
      // Create Pickup Event (Amber)
      if (job.type !== 'delivery') {
        if (selectedRiderIds.size === 0 || !job.pickupRiderId || selectedRiderIds.has(job.pickupRiderId)) {
          const pStart = new Date(job.pickupScheduledAt || job.scheduledAt || job.createdAt);
          const pEnd = job.pickupScheduledEndAt ? new Date(job.pickupScheduledEndAt) : addMinutes(pStart, 30);
          calendarEvents.push({
            id: `${job.id}-pickup`,
            jobId: job.id,
            type: 'pickup',
            title: `[รับผ้า] ${job.customerName || 'Guest'} (${job.pickupLocation})`,
            start: pStart,
            end: pEnd, // Use custom end time if available
            riderId: job.pickupRiderId,
            jobStatus: job.status,
          });
        }
      }

      // Create Delivery Event (Indigo)
      if (job.type !== 'pickup') {
        // Only show delivery on calendar if the items have actually been picked up (Cleaning phase or ready)
        const isPickupDone = !['pending', 'accepted', 'pickup'].includes(job.status);
        if (isPickupDone || job.type === 'delivery') { // Always show if it's a delivery-only job
          if (selectedRiderIds.size === 0 || !job.deliveryRiderId || selectedRiderIds.has(job.deliveryRiderId)) {
            const dStart = new Date(job.deliveryScheduledAt || new Date(job.createdAt).getTime() + 86400000);
            const dEnd = job.deliveryScheduledEndAt ? new Date(job.deliveryScheduledEndAt) : addMinutes(dStart, 30);
            calendarEvents.push({
              id: `${job.id}-delivery`,
              jobId: job.id,
              type: 'delivery',
              title: `[ส่งผ้า] ${job.customerName || 'Guest'} (${job.dropoffLocation})`,
              start: dStart,
              end: dEnd,
              riderId: job.deliveryRiderId,
              jobStatus: job.status,
            });
          }
        }
      }
    });

    return calendarEvents;
  }, [allJobs, selectedRiderIds, showCompleted, filterArea, shopLocations]);

  const onEventDrop = async ({ event, start, end }: any) => {
    const e = event as CalendarEvent;
    try {
      if (e.type === 'pickup') {
        await jobStore.updateJobDetails(e.jobId, { pickupScheduledAt: start, pickupScheduledEndAt: end, pickupRiderId: e.riderId || undefined });
      } else {
        await jobStore.updateJobDetails(e.jobId, { deliveryScheduledAt: start, deliveryScheduledEndAt: end, deliveryRiderId: e.riderId || undefined });
      }
      toast.success(`Updated ${e.type} time successfully`);
    } catch (error) {
      toast.error("Failed to update time");
    }
  };

  const onEventResize = async ({ event, start, end }: any) => {
    const e = event as CalendarEvent;
    try {
      if (e.type === 'pickup') {
        await jobStore.updateJobDetails(e.jobId, { pickupScheduledAt: start, pickupScheduledEndAt: end });
      } else {
        await jobStore.updateJobDetails(e.jobId, { deliveryScheduledAt: start, deliveryScheduledEndAt: end });
      }
      toast.success(`Updated ${e.type} duration successfully`);
    } catch (error) {
      toast.error("Failed to update duration");
    }
  };

  // Event Click Handler
  const onSelectEvent = (event: any) => {
    setEditingEvent(event);
    setEditRiderId(event.riderId || "");
  };

  const handleSaveEdit = async () => {
    if (!editingEvent) return;
    try {
      if (editingEvent.type === 'pickup') {
        await jobStore.assignPickupRider(editingEvent.jobId, editRiderId, editingEvent.start);
      } else {
        await jobStore.assignDeliveryRider(editingEvent.jobId, editRiderId, editingEvent.start);
      }
      toast.success("Rider reassigned successfully");
      setEditingEvent(null);
    } catch (error) {
      toast.error("Failed to reassign rider");
    }
  };

  const handleDuplicateJob = async () => {
    if (!editingEvent) return;
    const jobToDup = allJobs.find(j => j.id === editingEvent.jobId);
    if (!jobToDup) return;

    try {
      const newJobData = { ...jobToDup };
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
      setEditingEvent(null);
    } catch (e: any) {
      toast.error(`Error duplicating job: ${e.message}`);
    }
  };

  const getRiderColor = (riderId?: string) => {
    if (!riderId) return '#94a3b8'; // unassigned = slate
    const index = allRiders.findIndex(r => r.id === riderId);
    if (index === -1) return '#94a3b8';
    return RIDER_COLORS[index % RIDER_COLORS.length];
  };

  // Custom Event Styling
  const eventStyleGetter = (event: any) => {
    let isEventCompleted = false;
    
    if (event.type === 'pickup') {
      // Pickup is done if status has progressed past 'pickup'
      isEventCompleted = !['pending', 'accepted', 'pickup'].includes(event.jobStatus);
    } else if (event.type === 'delivery') {
      // Delivery is done if status is 'completed'
      isEventCompleted = event.jobStatus === 'completed';
    }

    let backgroundColor = getRiderColor(event.riderId);
    if (isEventCompleted) {
      backgroundColor = '#475569'; // slate-600 (Dark Gray)
    }

    let opacity = isEventCompleted ? 0.7 : 0.95;
    
    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity,
        color: 'white',
        border: '1px solid rgba(255,255,255,0.7)',
        display: 'block',
        fontSize: '10px',
        fontWeight: 500,
        boxShadow: 'none',
      }
    };
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full bg-slate-50/50">
      <style dangerouslySetInnerHTML={{__html: `
        .rbc-toolbar button { font-family: inherit; font-weight: 500; border-radius: 6px; }
        .rbc-toolbar button.rbc-active { background-color: #312e81; color: white; border-color: #312e81; }
        .rbc-header { padding: 8px 0; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #64748b; }
        .rbc-today { background-color: #f8fafc; }
        .rbc-event { overflow: hidden; }
        .rbc-event-label { display: none !important; }
        .rbc-event-content { padding: 1px 3px; white-space: normal; line-height: 1.2; word-break: break-word; text-overflow: ellipsis; }
      `}} />

      {/* Main Calendar Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
          <div className="shrink-0">
            <h2 className="text-lg font-bold text-slate-900">Task Schedule Calendar</h2>
            <div className="text-xs text-slate-500 flex gap-4 mt-1">
              <span className="flex items-center gap-1"><div className="w-2 h-4 rounded-sm bg-amber-500" /> Pickup</span>
              <span className="flex items-center gap-1"><div className="w-2 h-4 rounded-sm bg-indigo-500" /> Delivery</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-400" /> Unassigned</span>
            </div>
          </div>

          {/* Rider Filters inside header */}
          <div className="flex items-center gap-3 overflow-x-auto hide-scrollbar flex-1 mx-6 justify-center">
            <div className="flex items-center gap-2 pr-4 border-r border-slate-200 shrink-0">
              <select
                className="text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-slate-50 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700"
                value={filterArea}
                onChange={(e) => {
                  setFilterArea(e.target.value);
                  setSelectedRiderIds(new Set()); // Reset selected riders when area changes
                }}
              >
                <option value="ALL">All Areas</option>
                <option value="BKK">BKK</option>
                <option value="PTY">PTY</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pr-4 border-r border-slate-200 shrink-0">
              <Truck size={16} className="text-indigo-600" />
              <span className="text-sm font-bold text-slate-900">Riders</span>
              <Button 
                variant={selectedRiderIds.size === filteredRiders.length && filteredRiders.length > 0 ? "default" : "outline"} 
                size="sm" 
                onClick={toggleAllRiders} 
                className="h-7 text-xs ml-2 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                All
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              {filteredRiders.map(rider => (
                <button 
                  key={rider.id}
                  onClick={() => toggleRider(rider.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors shrink-0 ${selectedRiderIds.has(rider.id) ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: getRiderColor(rider.id) }} />
                  <img src={rider.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover shrink-0 bg-slate-100" />
                  <span className="text-xs font-semibold">{rider.nickname || rider.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <Label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors shrink-0">
            <input 
              type="checkbox"
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 h-4 w-4 cursor-pointer"
              checked={showCompleted} 
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            <span className="text-sm font-medium text-slate-700">Show Completed</span>
          </Label>
        </div>

        <div className="flex-1 p-4 bg-white m-4 rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <DnDCalendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            date={currentDate}
            onNavigate={(date: Date) => setCurrentDate(date)}
            view={currentView}
            onView={(view: any) => setCurrentView(view)}
            views={['month', 'week', 'day', 'agenda']}
            onEventDrop={onEventDrop}
            onEventResize={onEventResize}
            onSelectEvent={onSelectEvent}
            eventPropGetter={eventStyleGetter}
            dayLayoutAlgorithm="no-overlap"
            resizable={true}
            step={30}
            timeslots={2}
            min={new Date(new Date().setHours(8, 0, 0, 0))}
            max={new Date(new Date().setHours(21, 0, 0, 0))}
            formats={{
              timeGutterFormat: 'HH:mm',
              eventTimeRangeFormat: ({ start, end }: any, culture: any, local: any) =>
                `${local.format(start, 'HH:mm', culture)} - ${local.format(end, 'HH:mm', culture)}`,
              agendaTimeRangeFormat: ({ start, end }: any, culture: any, local: any) =>
                `${local.format(start, 'HH:mm', culture)} - ${local.format(end, 'HH:mm', culture)}`,
              dayHeaderFormat: 'EEEE, MMM d, yyyy',
            }}
            className="font-sans flex-1"
          />
        </div>
      </div>

      {/* Edit Modal */}
      <Dialog open={!!editingEvent} onOpenChange={(open) => !open && setEditingEvent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingEvent?.type === 'pickup' ? <Truck size={18} className="text-amber-500" /> : <MapPin size={18} className="text-indigo-500" />}
              Reassign Rider (โยกงาน)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 relative">
              <p className="text-sm font-medium text-slate-900 pr-24">{editingEvent?.title}</p>
              <Button 
                variant="outline" 
                size="sm"
                className="absolute top-2 right-2 text-[10px] h-6 px-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                onClick={() => {
                  if (onEditJob && editingEvent) {
                    const fullJob = allJobs.find(j => j.id === editingEvent.jobId);
                    if (fullJob) {
                      setEditingEvent(null);
                      onEditJob(fullJob);
                    }
                  } else {
                    setViewJobId(editingEvent?.jobId || null);
                  }
                }}
              >
                View Details
              </Button>
              <p className="text-xs text-slate-500 mt-1">Scheduled: {editingEvent?.start && format(editingEvent.start, 'MMM d, yyyy HH:mm')}</p>
              <p className="text-xs text-slate-400 mt-1 italic">Tip: You can drag and drop the event on the calendar to change its time.</p>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <User size={14} className="text-slate-500" />
                Assign to Rider
              </Label>
              <select
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                value={editRiderId}
                onChange={(e) => setEditRiderId(e.target.value)}
              >
                <option value="">-- Unassigned --</option>
                {filteredRiders.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.status})</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="sm:justify-between flex-row gap-2">
            <Button variant="outline" onClick={handleDuplicateJob} className="text-indigo-600 border-indigo-200 hover:bg-indigo-50">
              <Copy size={14} className="mr-2" /> Duplicate Job
            </Button>
            <div className="flex gap-2 justify-end w-full sm:w-auto">
              <Button variant="outline" onClick={() => setEditingEvent(null)} className="cursor-pointer">Cancel</Button>
              <Button onClick={handleSaveEdit} className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer">Save Changes</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewJobId} onOpenChange={(v) => !v && setViewJobId(null)}>
        <DialogContent className="max-w-md p-4 max-h-[90vh] overflow-hidden flex flex-col pt-8 z-[60]">
          <DialogTitle className="sr-only">Task Tracker</DialogTitle>
          {viewJobId && allJobs.find((j) => j.id === viewJobId) && (
            <AdminTaskTracker job={allJobs.find((j) => j.id === viewJobId)!} readOnly />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
