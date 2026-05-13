import React from "react";

interface TimePickerProps {
  id?: string;
  value: string; // "HH:mm"
  onChange: (value: string) => void;
  className?: string;
}

export function TimePicker({ id, value, onChange, className = "" }: TimePickerProps) {
  const [hours, minutes] = (value || "00:00").split(":");

  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(`${e.target.value}:${minutes}`);
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(`${hours}:${e.target.value}`);
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`} id={id}>
      <select 
        value={hours} 
        onChange={handleHourChange}
        className="h-8 text-xs rounded-md border border-slate-200 bg-white px-2 focus:ring-2 focus:ring-slate-900 outline-none shrink-0 w-12"
      >
        {Array.from({ length: 24 }).map((_, i) => {
          const h = i.toString().padStart(2, "0");
          return <option key={h} value={h}>{h}</option>;
        })}
      </select>
      <span className="text-slate-400 font-bold">:</span>
      <select 
        value={minutes} 
        onChange={handleMinuteChange}
        className="h-8 text-xs rounded-md border border-slate-200 bg-white px-2 focus:ring-2 focus:ring-slate-900 outline-none shrink-0 w-12"
      >
        {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
    </div>
  );
}
