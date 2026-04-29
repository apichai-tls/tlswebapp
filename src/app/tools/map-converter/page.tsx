"use client";

import { useState } from "react";
import { MapPin, ArrowRight, Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast, Toaster } from "sonner";

export default function MapConverterTool() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ lat: string; lng: string; finalUrl: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleConvert = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);

    try {
      // Clean up the URL if needed
      let targetUrl = url.trim();
      if (!targetUrl.startsWith("http")) {
        targetUrl = "https://" + targetUrl;
      }

      const res = await fetch(`/api/map-convert?url=${encodeURIComponent(targetUrl)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to convert URL");
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(`${result.lat}, ${result.lng}`);
    setCopied(true);
    toast.success("Coordinates copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Toaster />
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-lg w-full">
        <div className="flex items-center gap-3 mb-6 text-indigo-600">
          <div className="p-3 bg-indigo-50 rounded-2xl">
            <MapPin size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Map Link Converter</h1>
            <p className="text-sm font-medium text-slate-500">Extract GPS Coordinates from any Google Maps link</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Google Maps URL</label>
            <div className="flex gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://maps.app.goo.gl/..."
                className="h-12 bg-slate-50 border-slate-200 text-base shadow-sm"
                onKeyDown={(e) => e.key === 'Enter' && handleConvert()}
              />
              <Button 
                onClick={handleConvert} 
                disabled={loading || !url.trim()}
                className="h-12 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md"
              >
                {loading ? "..." : <ArrowRight size={18} />}
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 text-red-600 text-sm font-medium rounded-xl border border-red-100">
              ❌ {error}
            </div>
          )}

          {result && (
            <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-xl space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-[10px] uppercase tracking-widest font-black text-emerald-600/80 mb-1">Coordinates Found</h3>
                  <div className="text-2xl font-black text-slate-900 font-mono tracking-tight">
                    {result.lat}, {result.lng}
                  </div>
                </div>
                <Button 
                  onClick={copyToClipboard}
                  variant="outline" 
                  size="icon"
                  className="bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </Button>
              </div>
              
              <div className="pt-3 border-t border-emerald-200/50">
                <a 
                  href={result.finalUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs font-semibold text-emerald-700 flex items-center gap-1 hover:underline"
                >
                  <ExternalLink size={12} /> View Full Map Location
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
