"use client";

import { useState, useMemo } from "react";
import { useJobs } from "@/lib/use-jobs";
import { useRiders } from "@/lib/use-riders";
import { jobStore, type Job } from "@/lib/store";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Truck, MapPin, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

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

export function AdminDispatch() {
  const allJobs = useJobs();
  const allRiders = useRiders();
  
  const [selectedRiderIds, setSelectedRiderIds] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editRiderId, setEditRiderId] = useState<string>("");

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState<any>('week');

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
    if (selectedRiderIds.size === allRiders.length) {
      setSelectedRiderIds(new Set());
    } else {
      setSelectedRiderIds(new Set(allRiders.map(r => r.id)));
    }
  };

  // Filter & Map Jobs to Events
  const events = useMemo(() => {
    let jobs = allJobs;
    
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
      if (selectedRiderIds.size === 0 || !job.pickupRiderId || selectedRiderIds.has(job.pickupRiderId)) {
        const pStart = new Date(job.pickupScheduledAt || job.scheduledAt || job.createdAt);
        calendarEvents.push({
          id: `${job.id}-pickup`,
          jobId: job.id,
          type: 'pickup',
          title: `[รับผ้า] ${job.customerName || job.id}`,
          start: pStart,
          end: addMinutes(pStart, 45), // Allocate 45 mins
          riderId: job.pickupRiderId,
          jobStatus: job.status,
        });
      }

      // Create Delivery Event (Indigo)
      if (selectedRiderIds.size === 0 || !job.deliveryRiderId || selectedRiderIds.has(job.deliveryRiderId)) {
        const dStart = new Date(job.deliveryScheduledAt || new Date(job.createdAt).getTime() + 86400000);
        calendarEvents.push({
          id: `${job.id}-delivery`,
          jobId: job.id,
          type: 'delivery',
          title: `[ส่งผ้า] ${job.customerName || job.id}`,
          start: dStart,
          end: addMinutes(dStart, 45),
          riderId: job.deliveryRiderId,
          jobStatus: job.status,
        });
      }
    });

    return calendarEvents;
  }, [allJobs, selectedRiderIds, showCompleted]);

  const onEventDrop = async ({ event, start, end }: any) => {
    const e = event as CalendarEvent;
    try {
      if (e.type === 'pickup') {
        await jobStore.assignPickupRider(e.jobId, e.riderId || "", start);
      } else {
        await jobStore.assignDeliveryRider(e.jobId, e.riderId || "", start);
      }
      toast.success(`Updated ${e.type} time successfully`);
    } catch (error) {
      toast.error("Failed to update time");
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

  // Custom Event Styling
  const eventStyleGetter = (event: any) => {
    let backgroundColor = event.type === 'pickup' ? '#f59e0b' : '#4f46e5'; // Amber vs Indigo
    if (event.jobStatus === 'completed') {
      backgroundColor = '#10b981'; // Emerald
    }
    return {
      style: {
        backgroundColor,
        borderRadius: '6px',
        opacity: 0.9,
        color: 'white',
        border: 'none',
        display: 'block',
        fontSize: '12px',
        fontWeight: 500,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
      }
    };
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden h-full bg-slate-50/50">
      <style dangerouslySetInnerHTML={{__html: `
        .rbc-toolbar button { font-family: inherit; font-weight: 500; border-radius: 6px; }
        .rbc-toolbar button.rbc-active { background-color: #312e81; color: white; border-color: #312e81; }
        .rbc-header { padding: 8px 0; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #64748b; }
        .rbc-today { background-color: #f8fafc; }
        .rbc-event-content { padding: 2px 4px; }
      `}} />

      {/* Left Sidebar - Rider Filters */}
      <div className="w-full md:w-64 border-r border-slate-200 bg-white flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            <Truck size={16} className="text-indigo-600" />
            Riders Filter
          </h3>
          <p className="text-xs text-slate-500 mt-1">Select riders to view their schedule</p>
        </div>
        
        <div className="p-4 border-b border-slate-100">
          <Label className="flex items-center gap-2 cursor-pointer group">
            <input 
              type="checkbox"
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 h-4 w-4 cursor-pointer"
              checked={selectedRiderIds.size === allRiders.length && allRiders.length > 0} 
              onChange={toggleAllRiders}
            />
            <span className="text-sm font-semibold group-hover:text-indigo-600 transition-colors">Select All Riders</span>
          </Label>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {allRiders.map(rider => (
            <Label 
              key={rider.id}
              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selectedRiderIds.has(rider.id) ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}
            >
              <input 
                type="checkbox"
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 h-4 w-4 cursor-pointer"
                checked={selectedRiderIds.has(rider.id)} 
                onChange={() => toggleRider(rider.id)}
              />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <img src={rider.avatarUrl} alt="" className="w-6 h-6 rounded-full bg-slate-200 object-cover shrink-0" />
                <span className="text-sm font-medium truncate">{rider.name}</span>
              </div>
              <div className={`w-2 h-2 rounded-full shrink-0 ${rider.status === 'online' ? 'bg-emerald-500' : rider.status === 'busy' ? 'bg-amber-500' : 'bg-slate-300'}`} />
            </Label>
          ))}
        </div>
      </div>

      {/* Main Calendar Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Task Schedule Calendar</h2>
            <p className="text-xs text-slate-500 flex gap-4 mt-1">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" /> Pickup</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-500" /> Delivery</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Completed</span>
            </p>
          </div>
          <Label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
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
            onSelectEvent={onSelectEvent}
            eventPropGetter={eventStyleGetter}
            resizable={false}
            step={30}
            timeslots={2}
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
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-sm font-medium text-slate-900">{editingEvent?.title}</p>
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
                {allRiders.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.status})</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEvent(null)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleSaveEdit} className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
