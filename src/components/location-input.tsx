"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { searchLocation, type SearchResult } from "@/lib/map-api";
import { MapPin, Search, Loader2 } from "lucide-react";
import { useDebounce } from "use-debounce";

interface LocationInputProps {
  id?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSelectLocation: (location: SearchResult) => void;
  className?: string;
}

export function LocationInput({ id, placeholder, value, onChange, onSelectLocation, className }: LocationInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [debouncedValue] = useDebounce(value, 500);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchResults() {
      if (debouncedValue.length < 3) {
        setResults([]);
        return;
      }
      setLoading(true);
      const data = await searchLocation(debouncedValue);
      setResults(data);
      setLoading(false);
      if (data.length > 0) setIsOpen(true);
    }
    fetchResults();
  }, [debouncedValue]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div className="relative">
        <Input
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          autoComplete="off"
          className="pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </div>
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 z-[100] mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden">
          <ul className="max-h-60 overflow-auto py-1 text-sm">
            {results.map((result) => (
              <li
                key={result.placeId}
                onClick={() => {
                  onChange(result.name);
                  onSelectLocation(result);
                  setIsOpen(false);
                }}
                className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-slate-50 transition-colors"
              >
                <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                <span className="line-clamp-2 text-slate-700">{result.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
