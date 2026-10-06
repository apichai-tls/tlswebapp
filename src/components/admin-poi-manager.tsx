"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Papa from "papaparse";
import {
  Upload,
  Play,
  Database,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  Trash2,
  Layers,
  Search,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  CheckSquare,
  Square,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { poiStore, type POI } from "@/lib/store";
import { getDuplicatePOIsAction, deletePOIsAction, type DuplicatePoiGroup } from "@/actions/db";

interface ParsedRow {
  name: string;
  url: string;
  status: "pending" | "processing" | "success" | "error";
  errorMsg?: string;
  manualLat?: string;
  manualLng?: string;
}

interface AdminPoiManagerProps {
  onBack?: () => void;
  initialSubTab?: "duplicates" | "directory" | "import";
}

export default function AdminPoiManager({ onBack, initialSubTab = "duplicates" }: AdminPoiManagerProps) {
  const [activeTab, setActiveTab] = useState<"duplicates" | "directory" | "import">(initialSubTab);

  // Duplicates State
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicatePoiGroup[]>([]);
  const [totalPoisCount, setTotalPoisCount] = useState<number>(0);
  const [totalDuplicateGroups, setTotalDuplicateGroups] = useState<number>(0);
  const [totalRedundantCount, setTotalRedundantCount] = useState<number>(0);
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false);
  const [selectedPoiIds, setSelectedPoiIds] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState("");
  const [matchTypeFilter, setMatchTypeFilter] = useState<"all" | "coords" | "name" | "url">("all");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ ids: string[]; label: string } | null>(null);

  // Directory State
  const [directorySearch, setDirectorySearch] = useState("");
  const [directoryPage, setDirectoryPage] = useState(1);
  const pageSize = 40;

  // Importer State
  const [data, setData] = useState<ParsedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch duplicates
  const loadDuplicates = async () => {
    setIsLoadingDuplicates(true);
    try {
      const res = await getDuplicatePOIsAction();
      setDuplicateGroups(res.groups);
      setTotalPoisCount(res.totalPoisCount);
      setTotalDuplicateGroups(res.totalDuplicateGroups);
      setTotalRedundantCount(res.totalRedundantCount);
      setSelectedPoiIds(new Set());
    } catch (e: any) {
      toast.error("Failed to load duplicate POIs: " + e.message);
    } finally {
      setIsLoadingDuplicates(false);
    }
  };

  useEffect(() => {
    loadDuplicates();
  }, []);

  // Filtered duplicate groups
  const filteredGroups = useMemo(() => {
    let result = duplicateGroups;

    if (matchTypeFilter !== "all") {
      result = result.filter(g => {
        if (matchTypeFilter === "coords") return g.matchType === "coords" || g.matchType === "coords_and_name";
        if (matchTypeFilter === "name") return g.matchType === "name";
        if (matchTypeFilter === "url") return g.matchType === "url";
        return true;
      });
    }

    if (searchFilter.trim()) {
      const q = searchFilter.trim().toLowerCase();
      result = result.filter(g =>
        g.groupTitle.toLowerCase().includes(q) ||
        g.items.some(it => it.name.toLowerCase().includes(q) || it.address.toLowerCase().includes(q) || it.id.toLowerCase().includes(q))
      );
    }

    return result;
  }, [duplicateGroups, matchTypeFilter, searchFilter]);

  // All POIs Directory from Store
  const [allPois, setAllPois] = useState<POI[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

  const refreshDirectory = async () => {
    setIsLoadingDirectory(true);
    try {
      const res = await fetch('/api/pois');
      if (res.ok) {
        const data = await res.json();
        setAllPois(data);
      }
    } catch (e: any) {
      console.error("Failed to fetch all pois:", e);
    } finally {
      setIsLoadingDirectory(false);
    }
  };

  useEffect(() => {
    if (activeTab === "directory") {
      refreshDirectory();
    }
  }, [activeTab]);

  const filteredDirectoryPois = useMemo(() => {
    if (!directorySearch.trim()) return allPois;
    const q = directorySearch.trim().toLowerCase();
    return allPois.filter(p =>
      p.name?.toLowerCase().includes(q) ||
      p.address?.toLowerCase().includes(q) ||
      p.id?.toLowerCase().includes(q)
    );
  }, [allPois, directorySearch]);

  const paginatedDirectoryPois = useMemo(() => {
    const start = (directoryPage - 1) * pageSize;
    return filteredDirectoryPois.slice(start, start + pageSize);
  }, [filteredDirectoryPois, directoryPage]);

  // Selection helpers
  const handleToggleSelectPoi = (id: string) => {
    const next = new Set(selectedPoiIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedPoiIds(next);
  };

  const handleSelectAllRedundant = () => {
    const next = new Set<string>();
    filteredGroups.forEach(g => {
      g.items.forEach(it => {
        if (it.id !== g.recommendedKeepId) {
          next.add(it.id);
        }
      });
    });
    setSelectedPoiIds(next);
    toast.info(`Auto-selected ${next.size} redundant locations (kept 1 recommended item per group)`);
  };

  const handleClearSelection = () => {
    setSelectedPoiIds(new Set());
  };

  // Group quick action: Keep one, delete others
  const handleKeepSingle = (group: DuplicatePoiGroup, keepId: string) => {
    const idsToDelete = group.items.filter(it => it.id !== keepId).map(it => it.id);
    const keepItem = group.items.find(it => it.id === keepId);
    setDeleteConfirmTarget({
      ids: idsToDelete,
      label: `Keep "${keepItem?.name || keepId}" and delete ${idsToDelete.length} other duplicate location(s) in this group`,
    });
  };

  // Execute deletion
  const executeDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsDeleting(true);
    try {
      const res = await deletePOIsAction(ids);
      if (res.success) {
        toast.success(`Successfully deleted ${res.count} location(s)`);
        await poiStore.deletePOIs(ids);
        await loadDuplicates();
        if (activeTab === "directory") {
          await refreshDirectory();
        }
      }
    } catch (e: any) {
      toast.error("Failed to delete POIs: " + e.message);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmTarget(null);
    }
  };

  // Importer Batch
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

      setProgress(Math.round(((i + 1) / currentData.length) * 100));
      setData([...currentData]);
      await new Promise(resolve => setTimeout(resolve, 400));
    }

    setIsProcessing(false);
    toast.success(`Import complete! Successfully imported ${successCount}/${currentData.length} locations.`);
    loadDuplicates();
  };

  const pendingCount = data.filter(d => d.status === "pending").length;
  const successCount = data.filter(d => d.status === "success").length;
  const errorCount = data.filter(d => d.status === "error").length;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/70 p-4 lg:p-8 space-y-6">
      {/* Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-2xl">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Confirm Location Deletion</h3>
                <p className="text-xs text-slate-500 font-medium">Deleted locations cannot be restored.</p>
              </div>
            </div>

            <div className="bg-rose-50/60 border border-rose-200/80 rounded-2xl p-4 text-xs font-semibold text-rose-950 space-y-1">
              <div>{deleteConfirmTarget.label}</div>
              <div className="text-[11px] text-rose-700">Locations to delete: <strong>{deleteConfirmTarget.ids.length} item(s)</strong></div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <Button
                variant="outline"
                onClick={() => setDeleteConfirmTarget(null)}
                disabled={isDeleting}
                className="rounded-xl font-bold h-10 px-5 cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                onClick={() => executeDelete(deleteConfirmTarget.ids)}
                disabled={isDeleting}
                className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold h-10 px-5 cursor-pointer"
              >
                {isDeleting ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Trash2 size={16} className="mr-2" />}
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Navigation & Breadcrumbs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl shadow-xs border border-slate-200">
          <div className="flex items-center gap-4">
            <button
              onClick={() => onBack ? onBack() : (window.location.href = "/admin?tab=calculator")}
              type="button"
              className="h-11 w-11 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition-colors"
              title="Back to Fee Calculator"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                <button
                  type="button"
                  onClick={() => onBack ? onBack() : (window.location.href = "/admin?tab=calculator")}
                  className="hover:text-indigo-600 transition-colors cursor-pointer"
                >
                  Fee Calculator
                </button>
                <span>/</span>
                <span className="text-indigo-600">Manage POIs</span>
              </div>
              <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Location & POI Database Manager</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold border border-slate-200">
                  {totalPoisCount.toLocaleString()} total locations
                </span>
              </h1>
            </div>
          </div>

          {/* Quick Refresh */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { loadDuplicates(); if (activeTab === "directory") refreshDirectory(); }}
              disabled={isLoadingDuplicates}
              className="rounded-xl h-10 px-4 font-bold border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <RefreshCw size={15} className={`mr-2 ${isLoadingDuplicates ? 'animate-spin text-indigo-600' : ''}`} />
              Refresh Data
            </Button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 p-1.5 bg-slate-200/80 rounded-2xl w-full sm:w-fit overflow-x-auto">
          <button
            onClick={() => setActiveTab("duplicates")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "duplicates"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <AlertTriangle size={15} className={totalDuplicateGroups > 0 ? "text-amber-500" : "text-slate-400"} />
            <span>Duplicate Finder</span>
            {totalDuplicateGroups > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black">
                {totalDuplicateGroups}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("directory")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "directory"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <Database size={15} className="text-indigo-500" />
            <span>All POIs Directory</span>
          </button>

          <button
            onClick={() => setActiveTab("import")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "import"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
            }`}
          >
            <Upload size={15} className="text-emerald-500" />
            <span>Bulk Importer</span>
          </button>
        </div>

        {/* TAB 1: DUPLICATES FINDER */}
        {activeTab === "duplicates" && (
          <div className="space-y-5">
            {/* KPI Summary Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-2xs flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                  <Database size={24} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total in Database</div>
                  <div className="text-2xl font-black text-slate-900">{totalPoisCount.toLocaleString()} <span className="text-sm font-semibold text-slate-500">POIs</span></div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-amber-200/90 shadow-2xs flex items-center gap-4 bg-linear-to-br from-amber-50/40 to-white">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                  <Layers size={24} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Duplicate Groups</div>
                  <div className="text-2xl font-black text-amber-900">{totalDuplicateGroups.toLocaleString()} <span className="text-sm font-semibold text-amber-700">Groups</span></div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-rose-200/90 shadow-2xs flex items-center gap-4 bg-linear-to-br from-rose-50/40 to-white">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                  <Trash2 size={24} />
                </div>
                <div>
                  <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Redundant POIs</div>
                  <div className="text-2xl font-black text-rose-900">{totalRedundantCount.toLocaleString()} <span className="text-sm font-semibold text-rose-700">POIs</span></div>
                </div>
              </div>
            </div>

            {/* Filter & Action Toolbar */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Search & Type filter */}
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
                    <Input
                      placeholder="Search by name, address, or coords..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="h-10 pl-9.5 rounded-xl border-slate-200 bg-slate-50 text-xs font-medium focus:bg-white"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
                    <button
                      onClick={() => setMatchTypeFilter("all")}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${matchTypeFilter === "all" ? "bg-white text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
                    >
                      All ({duplicateGroups.length})
                    </button>
                    <button
                      onClick={() => setMatchTypeFilter("coords")}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${matchTypeFilter === "coords" ? "bg-white text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
                    >
                      📍 Same Coordinates ({duplicateGroups.filter(g => g.matchType === 'coords' || g.matchType === 'coords_and_name').length})
                    </button>
                    <button
                      onClick={() => setMatchTypeFilter("name")}
                      className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${matchTypeFilter === "name" ? "bg-white text-slate-900 shadow-2xs" : "hover:text-slate-900"}`}
                    >
                      🏷️ Same Name ({duplicateGroups.filter(g => g.matchType === 'name').length})
                    </button>
                  </div>
                </div>

                {/* Bulk Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSelectAllRedundant}
                    disabled={filteredGroups.length === 0}
                    className="h-10 rounded-xl px-3.5 text-xs font-bold border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 cursor-pointer"
                    title="Auto-select all redundant duplicates while keeping 1 best location per group"
                  >
                    <Sparkles size={15} className="mr-1.5 text-amber-600" />
                    Auto-Select Redundant
                  </Button>

                  {selectedPoiIds.size > 0 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearSelection}
                        className="h-10 rounded-xl px-3 text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer"
                      >
                        Clear ({selectedPoiIds.size})
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteConfirmTarget({
                          ids: Array.from(selectedPoiIds),
                          label: `Delete all ${selectedPoiIds.size} selected location(s)`,
                        })}
                        disabled={isDeleting}
                        className="h-10 rounded-xl px-4 text-xs font-black bg-rose-600 hover:bg-rose-700 shadow-sm cursor-pointer"
                      >
                        <Trash2 size={15} className="mr-1.5" />
                        Delete Selected ({selectedPoiIds.size})
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Duplicate Groups List */}
            {isLoadingDuplicates ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
                <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-3" />
                <div className="text-sm font-bold text-slate-700">Scanning database for duplicate locations...</div>
                <div className="text-xs text-slate-400 mt-1">Analyzing geographic coordinates, lat/lng distances, and location names</div>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 space-y-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={36} />
                </div>
                <h3 className="text-lg font-black text-slate-900">Great! No Duplicate Locations Found</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {searchFilter ? "No duplicate groups match your search criteria" : "Your location database is clean. No duplicate coordinates or names found."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-xs font-bold text-slate-500 px-1">
                  Showing {filteredGroups.length} duplicate groups (out of {duplicateGroups.length} total)
                </div>

                {filteredGroups.map((group, groupIdx) => {
                  const allSelectedInGroup = group.items.every(it => selectedPoiIds.has(it.id));

                  return (
                    <div
                      key={group.groupId}
                      className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden transition-all hover:border-slate-300"
                    >
                      {/* Group Header */}
                      <div className="bg-slate-50/80 px-5 py-3.5 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-xs font-black flex items-center justify-center">
                            {groupIdx + 1}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-slate-900 text-sm">{group.groupTitle}</h4>
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-bold py-0.5 px-2 rounded-lg ${
                                  group.matchType === 'coords_and_name'
                                    ? "bg-rose-50 text-rose-700 border-rose-300"
                                    : group.matchType === 'coords'
                                    ? "bg-amber-50 text-amber-700 border-amber-300"
                                    : "bg-indigo-50 text-indigo-700 border-indigo-300"
                                }`}
                              >
                                {group.matchReason}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {/* Group Actions */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const next = new Set(selectedPoiIds);
                              if (allSelectedInGroup) {
                                group.items.forEach(it => next.delete(it.id));
                              } else {
                                group.items.forEach(it => next.add(it.id));
                              }
                              setSelectedPoiIds(next);
                            }}
                            className="h-8 px-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-200/60 rounded-lg cursor-pointer"
                          >
                            {allSelectedInGroup ? (
                              <><CheckSquare size={14} className="mr-1.5 text-indigo-600" /> Deselect Group</>
                            ) : (
                              <><Square size={14} className="mr-1.5 text-slate-400" /> Select Group</>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* POI Items within group */}
                      <div className="divide-y divide-slate-100">
                        {group.items.map((item) => {
                          const isSelected = selectedPoiIds.has(item.id);
                          const isRecommended = item.id === group.recommendedKeepId;
                          const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`;

                          return (
                            <div
                              key={item.id}
                              className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                                isSelected ? "bg-rose-50/40" : "hover:bg-slate-50/50"
                              }`}
                            >
                              <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleSelectPoi(item.id)}
                                  className="mt-0.5 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                                >
                                  {isSelected ? (
                                    <CheckSquare size={18} className="text-rose-600" />
                                  ) : (
                                    <Square size={18} />
                                  )}
                                </button>

                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-bold text-slate-900 text-sm truncate">{item.name}</span>
                                    <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                      ID: {item.id}
                                    </span>
                                    {isRecommended && (
                                      <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Check size={11} /> Recommended to Keep
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-xs text-slate-500 truncate" title={item.address}>
                                    {item.address}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                                    <span className="font-mono">📍 {item.lat.toFixed(6)}, {item.lng.toFixed(6)}</span>
                                    {item.placeId && <span className="font-mono">🏷️ PlaceID: {item.placeId.slice(0, 16)}...</span>}
                                    <a
                                      href={mapsUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-indigo-600 hover:underline flex items-center gap-0.5 font-bold"
                                    >
                                      <ExternalLink size={11} /> View on Google Maps
                                    </a>
                                  </div>
                                </div>
                              </div>

                              {/* Individual Row Action */}
                              <div className="flex items-center gap-2 shrink-0 sm:self-center">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleKeepSingle(group, item.id)}
                                  className="h-8 px-2.5 text-[11px] font-bold border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 rounded-lg cursor-pointer"
                                  title="Keep this location and delete all other duplicates in this group"
                                >
                                  <Sparkles size={12} className="mr-1 text-emerald-600" />
                                  Keep This, Delete Others
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setDeleteConfirmTarget({
                                    ids: [item.id],
                                    label: `Delete location "${item.name}" (ID: ${item.id})`,
                                  })}
                                  className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                  title="Delete this location"
                                >
                                  <Trash2 size={15} />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DIRECTORY OF ALL POIS */}
        {activeTab === "directory" && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900">All POIs & Locations Directory</h3>
                <p className="text-xs text-slate-500 font-medium">Search and manage all POIs in the database ({pageSize} per page)</p>
              </div>

              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
                <Input
                  placeholder="Search location name, address, or ID..."
                  value={directorySearch}
                  onChange={(e) => {
                    setDirectorySearch(e.target.value);
                    setDirectoryPage(1);
                  }}
                  className="h-10 pl-9.5 rounded-xl border-slate-200 text-xs font-medium"
                />
              </div>
            </div>

            {isLoadingDirectory ? (
              <div className="py-12 text-center">
                <Loader2 size={28} className="animate-spin text-indigo-600 mx-auto mb-2" />
                <div className="text-xs font-bold text-slate-500">Loading all locations...</div>
              </div>
            ) : paginatedDirectoryPois.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs font-semibold">
                No locations match your search criteria
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase font-black">
                      <tr>
                        <th className="px-4 py-3">ID</th>
                        <th className="px-4 py-3">Location Name</th>
                        <th className="px-4 py-3">Address / Link</th>
                        <th className="px-4 py-3">Coordinates (Lat, Lng)</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedDirectoryPois.map((p) => {
                        const lat = (p as any).lat ?? p.coords?.lat;
                        const lng = (p as any).lng ?? p.coords?.lng;
                        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 font-mono text-[10px] text-slate-400 font-bold whitespace-nowrap">{p.id}</td>
                            <td className="px-4 py-3 font-bold text-slate-900">{p.name}</td>
                            <td className="px-4 py-3 text-slate-500 max-w-[280px] truncate" title={p.address}>{p.address}</td>
                            <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                              {typeof lat === 'number' && typeof lng === 'number' ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "-"}
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <a
                                  href={mapsUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="Open in Google Maps"
                                >
                                  <ExternalLink size={14} />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmTarget({
                                    ids: [p.id],
                                    label: `Delete location "${p.name}" (ID: ${p.id})`,
                                  })}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Delete location"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
                  <span>
                    Showing {((directoryPage - 1) * pageSize) + 1} - {Math.min(directoryPage * pageSize, filteredDirectoryPois.length)} of {filteredDirectoryPois.length} items
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={directoryPage === 1}
                      onClick={() => setDirectoryPage(p => p - 1)}
                      className="h-8 w-8 p-0 rounded-lg cursor-pointer"
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <span className="px-2">Page {directoryPage} of {Math.ceil(filteredDirectoryPois.length / pageSize) || 1}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={directoryPage >= Math.ceil(filteredDirectoryPois.length / pageSize)}
                      onClick={() => setDirectoryPage(p => p + 1)}
                      className="h-8 w-8 p-0 rounded-lg cursor-pointer"
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: BULK IMPORTER & ADD SINGLE */}
        {activeTab === "import" && (
          <div className="bg-white p-8 rounded-3xl shadow-xs border border-slate-200 space-y-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
                <Database size={28} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Bulk POI Importer</h2>
                <p className="text-xs font-medium text-slate-500">Import locations via CSV or convert Google Maps URLs into database POIs</p>
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
                className="h-12 px-6 border-slate-300 font-bold rounded-2xl cursor-pointer"
                disabled={isProcessing}
              >
                <Upload size={18} className="mr-2" /> Upload CSV File
              </Button>

              <Button
                onClick={processBatch}
                disabled={isProcessing || data.length === 0 || pendingCount === 0}
                className="h-12 px-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl cursor-pointer"
              >
                {isProcessing ? <Loader2 size={18} className="mr-2 animate-spin" /> : <Play size={18} className="mr-2" />}
                {isProcessing ? "Processing..." : "Start Import"}
              </Button>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-4">
              <h3 className="text-base font-bold text-slate-800">Add Single Location</h3>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-3">
                <Input
                  id="manual-name"
                  placeholder="Location Name (e.g. The Base Condo)"
                  className="h-11 rounded-xl text-xs font-medium"
                />
                <Input
                  id="manual-url"
                  placeholder="Google Maps link or coordinates"
                  className="h-11 rounded-xl text-xs font-medium"
                />
                <Button
                  onClick={async () => {
                    const nameInput = document.getElementById('manual-name') as HTMLInputElement;
                    const urlInput = document.getElementById('manual-url') as HTMLInputElement;
                    const name = nameInput.value;
                    const url = urlInput.value;

                    if (!name || !url) {
                      toast.error("Please provide both location name and URL");
                      return;
                    }

                    const btn = document.getElementById('manual-btn');
                    if (btn) btn.innerHTML = "Processing...";

                    try {
                      let targetUrl = url.trim();
                      if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl;

                      const res = await fetch(`/api/map-convert?url=${encodeURIComponent(targetUrl)}`);
                      const result = await res.json();

                      if (!res.ok) throw new Error(result.error || "Failed to resolve");

                      await poiStore.addPOI({
                        name: name,
                        address: result.finalUrl || url,
                        coords: { lat: parseFloat(result.lat), lng: parseFloat(result.lng) }
                      });

                      toast.success(`Successfully added location "${name}"!`);
                      nameInput.value = "";
                      urlInput.value = "";
                      loadDuplicates();
                    } catch (err: any) {
                      toast.error("Failed to add location: " + err.message);
                    } finally {
                      if (btn) btn.innerHTML = "Add Location";
                    }
                  }}
                  id="manual-btn"
                  className="h-11 px-6 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl whitespace-nowrap text-xs cursor-pointer"
                >
                  <Plus size={16} className="mr-1.5" />
                  Add Location
                </Button>
              </div>
            </div>

            {data.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex justify-between items-center text-xs font-bold text-slate-600 bg-slate-100 p-4 rounded-2xl">
                  <span>Total: {data.length}</span>
                  <span className="text-emerald-600">Success: {successCount}</span>
                  <span className="text-amber-500">Pending: {pendingCount}</span>
                  <span className="text-rose-500">Failed: {errorCount}</span>
                </div>

                {isProcessing && (
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className="bg-indigo-600 h-2.5 transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                  </div>
                )}

                <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-[500px] overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 uppercase font-black text-slate-500 sticky top-0">
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
                            {row.status === "error" && <XCircle size={18} className="text-rose-500" />}
                            {row.status === "processing" && <Loader2 size={18} className="text-indigo-500 animate-spin" />}
                            {row.status === "pending" && <span className="w-2 h-2 rounded-full bg-slate-300 inline-block m-1.5"></span>}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-900">{row.name}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[320px]">{row.url}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
