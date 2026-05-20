import React from "react";
import { Input } from "@/components/ui/input";

interface DateTimePickerProps {
  id?: string;
  value: string; // "yyyy-MM-dd'T'HH:mm"
  onChange: (value: string) => void;
  className?: string;
}

export function DateTimePicker({ id, value, onChange, className = "" }: DateTimePickerProps) {
  const [datePart, timePart] = value ? value.split("T") : ["", "00:00"];
  const [hours, minutes] = (timePart || "00:00").split(":");

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(`${e.target.value}T${hours}:${minutes}`);
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(`${datePart}T${e.target.value}:${minutes}`);
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(`${datePart}T${hours}:${e.target.value}`);
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`} id={id}>
      <Input 
        type="date" 
        value={datePart} 
        onChange={handleDateChange} 
        className="h-8 text-xs px-2 flex-1 min-w-[110px]"
      />
      <select 
        value={hours} 
        onChange={handleHourChange}
        className="h-8 text-xs rounded-md border border-slate-200 bg-white px-1 focus:ring-2 focus:ring-slate-900 outline-none shrink-0 w-12"
      >
        {[10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(i => {
          const h = i.toString().padStart(2, "0");
          return <option key={h} value={h}>{h}</option>;
        })}
      </select>
      <span className="text-slate-400 font-bold">:</span>
      <select 
        value={minutes} 
        onChange={handleMinuteChange}
        className="h-8 text-xs rounded-md border border-slate-200 bg-white px-1 focus:ring-2 focus:ring-slate-900 outline-none shrink-0 w-12"
      >
        {["00", "30"].map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}
