import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Check, Globe } from "lucide-react";
import { 
  COUNTRY_CODES, 
  CountryCodeItem, 
  searchCountries, 
  findCountryByCode, 
  normalizeCountryCode 
} from "@/lib/country-codes";

interface CountryCodeInputProps {
  value: string;
  onChange: (code: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function CountryCodeInput({
  value,
  onChange,
  className = "",
  placeholder = "+1",
  disabled = false,
}: CountryCodeInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || "+1");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal inputValue if prop changes externally
  useEffect(() => {
    setInputValue(value || "+1");
  }, [value]);

  // Find country item for current value
  const currentCountry = useMemo(() => {
    return findCountryByCode(value);
  }, [value]);

  // Filtered countries based on what user is currently typing
  const filteredList = useMemo(() => {
    return searchCountries(inputValue);
  }, [inputValue]);

  // Handle outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleBlurCommit();
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inputValue, value]);

  const handleSelectCountry = (country: CountryCodeItem) => {
    setInputValue(country.code);
    onChange(country.code);
    setIsOpen(false);
  };

  const handleBlurCommit = () => {
    const raw = inputValue.trim();
    if (!raw) {
      setInputValue(value || "+1");
      return;
    }

    // If matches a country by name or ISO (e.g. user typed "hong kong" or "HK")
    const match = findCountryByCode(raw) || filteredList[0];
    if (match && (raw.toLowerCase() === match.country.toLowerCase() || raw.toUpperCase() === match.iso)) {
      setInputValue(match.code);
      onChange(match.code);
      return;
    }

    // Normalizing numbers: "44" -> "+44", "+852" -> "+852"
    const normalized = normalizeCountryCode(raw);
    if (normalized) {
      setInputValue(normalized);
      onChange(normalized);
    } else {
      setInputValue(value || "+1");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredList.length > 0) {
        // If exact or top match
        handleSelectCountry(filteredList[0]);
      } else {
        handleBlurCommit();
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setInputValue(value || "+1");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  return (
    <div 
      ref={containerRef} 
      className={`relative inline-block ${className}`}
    >
      <div 
        className={`flex items-center h-9 bg-white border border-slate-300 rounded-xl px-2 gap-1.5 transition-all focus-within:ring-2 focus-within:ring-sky-500 focus-within:border-sky-500 hover:border-slate-400 ${disabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {/* Country Flag or Global Icon */}
        <span 
          className="text-base select-none shrink-0 cursor-pointer flex items-center justify-center min-w-[20px]"
          onClick={() => {
            if (!isOpen) setIsOpen(true);
            inputRef.current?.focus();
          }}
          title={currentCountry ? `${currentCountry.country} (${currentCountry.code})` : "Custom Calling Code"}
        >
          {currentCountry?.flag || "🌐"}
        </span>

        {/* Editable Input for Code or Search */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          disabled={disabled}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="w-14 sm:w-16 bg-transparent text-xs font-bold font-mono text-slate-800 outline-none placeholder:text-slate-400 cursor-text"
        />

        {/* Toggle Dropdown Chevron */}
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
            } else {
              setIsOpen(true);
              inputRef.current?.focus();
            }
          }}
          className="text-slate-400 hover:text-slate-600 shrink-0 p-0.5"
        >
          <ChevronDown 
            size={13} 
            className={`transition-transform duration-150 ${isOpen ? "rotate-180 text-sky-600" : ""}`} 
          />
        </button>
      </div>

      {/* Autocomplete Dropdown List */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-72 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-2xl z-[999] overflow-hidden flex flex-col animate-in fade-in-50 zoom-in-95 duration-100">
          {/* Header / Search hint */}
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <Search size={12} className="text-slate-400" />
              <span>พิมพ์รหัส หรือชื่อประเทศ</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {filteredList.length} รายการ
            </span>
          </div>

          {/* List items */}
          <div className="max-h-60 overflow-y-auto p-1 divide-y divide-slate-50 scrollbar-thin">
            {filteredList.length === 0 ? (
              <div className="p-3 text-center">
                <p className="text-xs text-slate-500">ไม่พบประเทศที่ค้นหา</p>
                {inputValue.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      const custom = normalizeCountryCode(inputValue);
                      if (custom) {
                        setInputValue(custom);
                        onChange(custom);
                      }
                      setIsOpen(false);
                    }}
                    className="mt-2 text-xs font-bold text-sky-600 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg w-full transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Globe size={13} />
                    <span>ใช้รหัสที่กรอก: {normalizeCountryCode(inputValue) || inputValue}</span>
                  </button>
                )}
              </div>
            ) : (
              filteredList.map((c) => {
                const isSelected = value === c.code;
                return (
                  <button
                    key={`${c.iso}-${c.code}-${c.country}`}
                    type="button"
                    onClick={() => handleSelectCountry(c)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-lg transition-colors text-left ${
                      isSelected 
                        ? "bg-sky-50 text-sky-700 font-bold" 
                        : "hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="text-base shrink-0">{c.flag}</span>
                      <span className="truncate">{c.country}</span>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0 uppercase">
                        ({c.iso})
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                        {c.code}
                      </span>
                      {isSelected && <Check size={13} className="text-sky-600 shrink-0" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Quick instructions footer */}
          <div className="px-2.5 py-1.5 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
            <span>พิมพ์รหัสตรงๆ ได้ (เช่น 852, +44)</span>
            <span className="font-mono">Enter เพื่อเลือก</span>
          </div>
        </div>
      )}
    </div>
  );
}
