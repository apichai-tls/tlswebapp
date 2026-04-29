"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import { Upload, Play, Database, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast, Toaster } from "sonner";
import { poiStore } from "@/lib/store";

interface ParsedRow {
  name: string;
  url: string;
  status: "pending" | "processing" | "success" | "error";
  errorMsg?: string;
  manualLat?: string;
  manualLng?: string;
}

export default function PoiImporter() {
  const [data, setData] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedData = results.data.map((row: any) => ({
          name: row.name || row.Name || Object.values(row)[0],
          url: row.url || row.link || row.URL || row.Link || Object.values(row)[1],
          status: "pending" as const,
        })).filter((row) => row.name && row.url);
        
        setData(parsedData);
        setProgress(0);
        toast.success(`Loaded ${parsedData.length} rows successfully.`);
      },
      error: (error) => {
        toast.error(`Error parsing CSV: ${error.message}`);
      }
    });
  };

  const processBatch = async () => {
    if (data.length === 0) return;
    setIsProcessing(true);

    let currentData = [...data];
    let successCount = 0;

    for (let i = 0; i < currentData.length; i++) {
      if (currentData[i].status === "success") {
        successCount++;
        continue;
      }

      currentData[i].status = "processing";
      setData([...currentData]);

      try {
        let targetUrl = currentData[i].url.trim();
        if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl;

        const res = await fetch(`/api/map-convert?url=${encodeURIComponent(targetUrl)}`);
        const result = await res.json();

        if (!res.ok) throw new Error(result.error || "Failed to resolve");

        // Save to Database
        await poiStore.addPOI({
          name: currentData[i].name,
          address: result.finalUrl || currentData[i].url,
          coords: { lat: parseFloat(result.lat), lng: parseFloat(result.lng) }
        });

        currentData[i].status = "success";
        successCount++;
      } catch (err: any) {
        currentData[i].status = "error";
        currentData[i].errorMsg = err.message;
      }

      setProgress(Math.round((i + 1) / currentData.length * 100));
      setData([...currentData]);

      // Small delay to prevent overwhelming the server/Google
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsProcessing(false);
    toast.success(`Import complete! Successfully imported ${successCount}/${currentData.length} locations.`);
  };

  const handleManualSave = async (index: number) => {
    const row = data[index];
    if (!row.manualLat || !row.manualLng) {
      toast.error("Please enter both Latitude and Longitude");
      return;
    }

    try {
      await poiStore.addPOI({
        name: row.name,
        address: row.url,
        coords: { lat: parseFloat(row.manualLat), lng: parseFloat(row.manualLng) }
      });

      const newData = [...data];
      newData[index].status = "success";
      newData[index].errorMsg = undefined;
      setData(newData);
      toast.success(`Saved "${row.name}" manually!`);
    } catch (err: any) {
      toast.error("Failed to save: " + err.message);
    }
  };

  const pendingCount = data.filter(d => d.status === "pending").length;
  const successCount = data.filter(d => d.status === "success").length;
  const errorCount = data.filter(d => d.status === "error").length;

  return (
    <div className="min-h-screen bg-slate-50 p-6 lg:p-8">
      <Toaster />
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
              <Database size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Bulk POI Importer</h1>
              <p className="text-sm font-medium text-slate-500">Import Google Maps links to build your local location database.</p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 items-center">
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <Button 
              onClick={() => fileInputRef.current?.click()} 
              variant="outline"
              className="h-12 px-6 border-slate-300 font-bold"
              disabled={isProcessing}
            >
              <Upload size={18} className="mr-2" /> Upload CSV File
            </Button>

            <Button 
              onClick={processBatch}
              disabled={isProcessing || data.length === 0 || pendingCount === 0}
              className="h-12 px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {isProcessing ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Play size={18} className="mr-2" />}
              {isProcessing ? "Processing..." : "Start Import"}
            </Button>
          </div>

          {data.length > 0 && (
            <div className="mt-8 space-y-4">
              <div className="flex justify-between items-center text-sm font-bold text-slate-600 bg-slate-100 p-4 rounded-xl">
                <span>Total: {data.length}</span>
                <span className="text-emerald-600">Success: {successCount}</span>
                <span className="text-amber-500">Pending: {pendingCount}</span>
                <span className="text-red-500">Errors: {errorCount}</span>
              </div>

              {isProcessing && (
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-indigo-600 h-3 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase font-black text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">URL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 w-[100px]">
                          {row.status === "success" && <CheckCircle2 size={18} className="text-emerald-500" />}
                          {row.status === "error" && <XCircle size={18} className="text-red-500" />}
                          {row.status === "processing" && <Loader2 size={18} className="text-indigo-500 animate-spin" />}
                          {row.status === "pending" && <span className="w-2 h-2 rounded-full bg-slate-300 inline-block m-1.5"></span>}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          <div className="truncate max-w-[300px]">{row.url}</div>
                          {row.status === "error" && (
                            <div className="mt-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                              <div className="text-red-600 font-semibold mb-2">Error: {row.errorMsg}</div>
                              <div className="flex gap-2 items-center">
                                <Input 
                                  placeholder="Lat (e.g. 13.75)" 
                                  className="h-8 text-xs bg-white w-28"
                                  value={row.manualLat || ""}
                                  onChange={(e) => {
                                    const newData = [...data];
                                    newData[idx].manualLat = e.target.value;
                                    setData(newData);
                                  }}
                                />
                                <Input 
                                  placeholder="Lng (e.g. 100.51)" 
                                  className="h-8 text-xs bg-white w-28"
                                  value={row.manualLng || ""}
                                  onChange={(e) => {
                                    const newData = [...data];
                                    newData[idx].manualLng = e.target.value;
                                    setData(newData);
                                  }}
                                />
                                <Button 
                                  size="sm" 
                                  className="h-8 bg-slate-800 hover:bg-slate-700"
                                  onClick={() => handleManualSave(idx)}
                                >
                                  Save Manual
                                </Button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
