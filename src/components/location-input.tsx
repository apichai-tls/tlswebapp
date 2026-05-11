"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { searchLocation, type SearchResult } from "@/lib/map-api";
import { MapPin, Search, Loader2, Database, Globe } from "lucide-react";
import { useDebounce } from "use-debounce";

interface LocationInputProps {
  id?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSelectLocation: (location: SearchResult & { isLocal?: boolean }) => void;
  className?: string;
  localData?: (SearchResult & { isLocal?: boolean })[];
}

export function LocationInput({ id, placeholder, value, onChange, onSelectLocation, className, localData }: LocationInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [googleResults, setGoogleResults] = useState<SearchResult[]>([]);
  const [hasSearchedGoogle, setHasSearchedGoogle] = useState(false);
  const [loading, setLoading] = useState(false);
  const [debouncedValue] = useDebounce(value, 500);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastSelectedRef = useRef<string>("");
  const isTypingRef = useRef<boolean>(false);

  // Local filtering
  const localResults = localData ? localData.filter(item => {
    if (value.length < 2) return false;
    const searchTerms = value.toLowerCase().trim().split(/\s+/);
    const target = `${item.name} ${item.address}`.toLowerCase();
    return searchTerms.every(term => target.includes(term));
  }) : [];

  useEffect(() => {
    async function fetchResults() {
      // If we have local data, DO NOT auto-search google.
      if (localData) {
        setGoogleResults([]);
        setHasSearchedGoogle(false);
        if (value.length >= 2 && isTypingRef.current) setIsOpen(true);
        return;
      }

      // Legacy auto-search behavior
      if (debouncedValue.length < 3 || debouncedValue === lastSelectedRef.current) {
        if (debouncedValue !== lastSelectedRef.current) {
          setGoogleResults([]);
        }
        return;
      }
      setLoading(true);
      const data = await searchLocation(debouncedValue);
      setGoogleResults(data);
      setLoading(false);
      if (data.length > 0 && isTypingRef.current) setIsOpen(true);
    }
    fetchResults();
  }, [debouncedValue, localData, value]);

  const handleManualGoogleSearch = async () => {
    if (value.length < 3) return;
    setLoading(true);
    const data = await searchLocation(value);
    setGoogleResults(data);
    setHasSearchedGoogle(true);
    setLoading(false);
  };

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
            isTypingRef.current = true;
            onChange(e.target.value);
            if (e.target.value.length >= 2) setIsOpen(true);
            else setIsOpen(false);
          }}
          autoComplete="off"
          className="pr-10"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </div>
      </div>

      {isOpen && (localResults.length > 0 || googleResults.length > 0 || (localData && value.length >= 3 && !hasSearchedGoogle)) && (
        <div className="absolute top-full left-0 z-[100] mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden">
          <ul className="max-h-60 overflow-auto py-1 text-sm">
            {[...localResults, ...googleResults].map((result: SearchResult & { isLocal?: boolean }, idx) => (
              <li
                key={result.placeId || idx}
                onClick={() => {
                  isTypingRef.current = false;
                  lastSelectedRef.current = result.name;
                  onChange(result.name);
                  onSelectLocation(result);
                  setIsOpen(false);
                }}
                className={`flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 ${result.isLocal ? 'bg-amber-50/20' : ''}`}
              >
                {result.isLocal ? (
                  <Database size={16} className="mt-1 shrink-0 text-amber-500" />
                ) : (
                  <MapPin size={16} className="mt-1 shrink-0 text-slate-400" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold truncate ${result.isLocal ? 'text-amber-900' : 'text-slate-900'}`}>{result.name}</p>
                  {result.address && result.address !== result.name && (
                    <p className={`text-[10px] line-clamp-1 mt-0.5 ${result.isLocal ? 'text-amber-700/70' : 'text-slate-500'}`}>{result.address}</p>
                  )}
                </div>
              </li>
            ))}
            
            {localData && !hasSearchedGoogle && value.length >= 3 && (
              <li className="p-2 border-t border-slate-100 bg-slate-50 sticky bottom-0">
                <button 
                  onClick={(e) => { e.preventDefault(); handleManualGoogleSearch(); }}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-blue-600 bg-blue-100/50 hover:bg-blue-100 rounded-md transition-colors"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                  ค้นหา &quot;{value}&quot; บน Google Maps
                </button>
              </li>
            )}

            {localData && hasSearchedGoogle && googleResults.length === 0 && (
              <li className="p-3 text-center text-xs text-slate-500">
                ไม่พบข้อมูลจาก Google Maps
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
