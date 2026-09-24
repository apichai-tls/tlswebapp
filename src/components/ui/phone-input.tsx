import React, { useState, useRef, useEffect } from "react";
import { Input } from "./input";
import { ChevronDown, Search } from "lucide-react";

import { COUNTRY_CODES, type CountryCodeItem } from "@/lib/country-codes";
export { COUNTRY_CODES };

interface PhoneInputProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
}

export function PhoneInput({ value, onChange, className = "", placeholder = "08x-xxx-xxxx" }: PhoneInputProps) {
  // Parse existing value (e.g. "+66 812345678" or just "0812345678")
  const splitIndex = value.indexOf(" ");
  const initialCode = splitIndex > 0 && value.startsWith("+") ? value.substring(0, splitIndex) : "+66";
  const initialNumber = splitIndex > 0 && value.startsWith("+") ? value.substring(splitIndex + 1) : value;

  const [countryCode, setCountryCode] = useState(initialCode);
  const [phoneNumber, setPhoneNumber] = useState(initialNumber);
  
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync back to parent when inputs change
  useEffect(() => {
    // If the phone number is entirely empty, we could return empty string or the code + empty.
    // For standard forms, it's usually better to just return the full thing if there's any text.
    if (!phoneNumber.trim()) {
      onChange(""); 
    } else {
      onChange(`${countryCode} ${phoneNumber}`);
    }
  }, [countryCode, phoneNumber]); // Removing onChange from deps to avoid infinite loops if parent re-renders

  // Update internal state if value from prop changes completely (e.g. form reset)
  useEffect(() => {
    if (!value) {
      setPhoneNumber("");
      setCountryCode("+66");
    } else {
      const idx = value.indexOf(" ");
      if (idx > 0 && value.startsWith("+")) {
        setCountryCode(value.substring(0, idx));
        setPhoneNumber(value.substring(idx + 1));
      } else if (!value.startsWith("+")) {
        setPhoneNumber(value);
      }
    }
  }, [value]);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCountries = COUNTRY_CODES.filter(c => 
    c.country.toLowerCase().includes(search.toLowerCase()) || 
    c.code.includes(search)
  );

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) || { code: countryCode, country: "Custom", flag: "🌐" };

  return (
    <div className={`flex gap-1.5 relative ${className}`} ref={dropdownRef}>
      <div className="relative">
        <button
          type="button"
          className="flex items-center gap-1 h-8 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          onClick={() => {
            setIsOpen(!isOpen);
            setSearch(""); 
          }}
        >
          <span className="text-sm">{selectedCountry.flag}</span>
          <span className="font-medium text-slate-700">{selectedCountry.code}</span>
          <ChevronDown size={12} className="text-slate-400 ml-0.5" />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-[220px] bg-white border border-slate-200 rounded-lg shadow-lg z-[100] overflow-hidden flex flex-col">
            <div className="p-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Search size={14} className="text-slate-400 shrink-0" />
              <input 
                type="text" 
                placeholder="Search country or code..." 
                className="w-full bg-transparent text-xs outline-none"
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto p-1 custom-scrollbar">
              {filteredCountries.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-500">No countries found</div>
              ) : (
                filteredCountries.map(c => (
                  <button
                    key={c.code + c.country}
                    type="button"
                    className={`w-full flex items-center justify-between p-2 text-xs rounded-md hover:bg-indigo-50 transition-colors ${countryCode === c.code ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'}`}
                    onClick={() => {
                      setCountryCode(c.code);
                      setIsOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{c.flag}</span>
                      <span>{c.country}</span>
                    </div>
                    <span className="text-slate-500">{c.code}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <Input 
        type="tel"
        placeholder={placeholder}
        value={phoneNumber}
        onChange={e => setPhoneNumber(e.target.value.replace(/[^\d\s-]/g, ''))}
        className="flex-1 h-8 text-xs border-slate-200"
      />
    </div>
  );
}
