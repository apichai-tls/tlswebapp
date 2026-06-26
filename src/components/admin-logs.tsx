import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, Search, ChevronDown, Wrench, ShieldAlert, AlertTriangle, Check, FileImage, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { diagnoseJobAction, resolveJobDiscrepancyAction } from "@/actions/db";
import { toast } from "sonner";

interface ActivityLog {
  id: string;
  entityId: string;
  entityType: string;
  action: string;
  details: string | null;
  userId: string | null;
  userName: string | null;
  createdAt: string;
  customerName?: string | null;
}

export function AdminLogs({ jobId }: { jobId?: string }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.email === "admin@tls.com";

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  // Diagnostics state
  const [diagJobId, setDiagJobId] = useState("");
  const [diagResult, setDiagResult] = useState<any>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const handleDiagnose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!diagJobId.trim()) return;
    setIsDiagnosing(true);
    setDiagResult(null);
    try {
      const res = await diagnoseJobAction(diagJobId.trim());
      setDiagResult(res);
      if (!res.success) {
        toast.error(res.error || "Failed to diagnose job");
      } else {
        toast.success("Job diagnostic complete!");
      }
    } catch (err: any) {
      toast.error(err.message || "Diagnostic failed");
    } finally {
      setIsDiagnosing(false);
    }
  };

  const handleResolve = async (legType: 'pickup' | 'delivery', fileUrls: string[]) => {
    if (!diagResult?.job?.id) return;
    setIsResolving(true);
    try {
      const res = await resolveJobDiscrepancyAction(
        diagResult.job.id,
        legType,
        fileUrls,
        user?.id,
        (user as any)?.name || user?.email || "Super Admin"
      );
      if (res.success) {
        toast.success(`Successfully linked GCS files and completed ${legType} leg!`);
        const updatedDiag = await diagnoseJobAction(diagResult.job.id);
        setDiagResult(updatedDiag);
        fetchLogs();
      } else {
        toast.error(res.error || "Failed to resolve discrepancy");
      }
    } catch (err: any) {
      toast.error(err.message || "Resolution failed");
    } finally {
      setIsResolving(false);
    }
  };

  const fetchLogs = async (searchVal?: string) => {
    setIsLoading(true);
    try {
      const currentQuery = searchVal !== undefined ? searchVal : searchTerm;
      let url = jobId ? `/api/logs?entityId=${jobId}` : "/api/logs";
      if (!jobId && currentQuery.trim()) {
        url = `/api/logs?q=${encodeURIComponent(currentQuery.trim())}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error("Failed to fetch logs", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // If general view and search is empty, do not load anything
    if (!jobId && !searchTerm.trim()) {
      setLogs([]);
      setIsLoading(false);
      return;
    }

    if (jobId) {
      fetchLogs();
      return;
    }

    // Debounce search query
    const delayDebounceFn = setTimeout(() => {
      fetchLogs();
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [jobId, searchTerm]);

  const toggleRow = (logId: string) => {
    setExpandedLogIds(prev => ({
      ...prev,
      [logId]: !prev[logId]
    }));
  };

  const filteredLogs = logs;

  const parseDetails = (detailsStr: string | null, action: string) => {
    if (!detailsStr) return null;
    try {
      const parsed = JSON.parse(detailsStr);
      
      if (action === 'create') {
        return (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center gap-2 text-emerald-700 font-semibold">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse animate-duration-1000" />
              Created New Job Successfully
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-1 text-xs text-slate-600 max-w-lg bg-emerald-50/40 p-3 rounded-lg border border-emerald-100/50">
              <div>
                <span className="text-slate-400">Customer:</span>{" "}
                <span className="font-semibold text-slate-800">{parsed.customerName || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400">Total Amount:</span>{" "}
                <span className="font-semibold text-slate-800">฿{parsed.totalAmount || 0}</span>
              </div>
              <div>
                <span className="text-slate-400">Initial Status:</span>{" "}
                <span className="font-semibold text-slate-800 capitalize">{parsed.status || 'Pending'}</span>
              </div>
              <div>
                <span className="text-slate-400">Process Type:</span>{" "}
                <span className="font-semibold text-slate-800 capitalize">{parsed.subStatus || 'None'}</span>
              </div>
            </div>
          </div>
        );
      }

      const cleaned = { ...parsed };
      const ignoredKeys = ['updatedAt', 'actorId', 'actorName', 'actorRole', 'createdAt', 'completedAt', 'id'];
      ignoredKeys.forEach(k => delete cleaned[k]);
      
      if (Object.keys(cleaned).length === 0) {
        return <span className="text-xs text-slate-400 italic">No specific changes recorded</span>;
      }

      const mapKeyToLabel = (key: string) => {
        const labels: Record<string, string> = {
          status: "Status",
          subStatus: "Process",
          isPaid: "Payment Status",
          paymentMethod: "Payment Method",
          totalAmount: "Total Amount",
          discount: "Discount",
          remark: "Remark",
          customerName: "Customer",
          branchId: "Branch",
          items: "Laundry Items",
          deliveryLocation: "Delivery Address",
          pickupLocation: "Pickup Address",
          pickupDistance: "Pickup Distance",
          deliveryDistance: "Delivery Distance",
          pickupCommission: "Pickup Commission",
          deliveryCommission: "Delivery Commission",
          adminNotesJson: "Admin Note",
          serviceSpeed: "Service Speed",
        };
        return labels[key] || key;
      };

      const formatValue = (key: string, val: any) => {
        if (key === 'isPaid') return val ? 'Paid' : 'Unpaid';
        if (key === 'pickupScheduledAt' || key === 'deliveryScheduledAt') {
          if (!val) return 'None';
          try {
            const date = new Date(val);
            if (!isNaN(date.getTime())) {
              return new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Bangkok',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: false
              }).format(date);
            }
          } catch (e) {
            // fallback
          }
        }
        if (typeof val === 'object') return 'Modified';
        return String(val);
      };

      return (
        <div className="flex flex-col gap-1.5 text-xs text-slate-600" title={JSON.stringify(cleaned, null, 2)}>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Modified Fields:</div>
          {Object.entries(cleaned).map(([k, v]) => (
            <div key={k} className="flex items-start gap-1.5">
              <span className="text-indigo-400 shrink-0 select-none">•</span>
              <span>
                Changed <span className="font-semibold text-slate-700">{mapKeyToLabel(k)}</span> to{" "}
                <span className="text-indigo-600 font-semibold bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/30">
                  {formatValue(k, v)}
                </span>
              </span>
            </div>
          ))}
        </div>
      );
    } catch {
      return <div className="text-xs text-slate-500">{detailsStr}</div>;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Activity Logs</h1>
            <p className="text-slate-500 text-sm mt-1">Track all automated and manual system activities</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 w-[250px] bg-white"
              />
            </div>
          </div>
        </div>

        {isSuperAdmin && !jobId && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Wrench size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Job Image Diagnostic & Sync Tool</h3>
                <p className="text-xs text-slate-500 font-medium">Verify GCS bucket files against database records and resolve sync issues instantly (Super Admin Only).</p>
              </div>
            </div>

            <form onSubmit={handleDiagnose} className="flex gap-3 max-w-md">
              <Input
                placeholder="Enter Job ID (e.g. 2026000937)..."
                value={diagJobId}
                onChange={e => setDiagJobId(e.target.value)}
                className="h-10 border-slate-200 bg-slate-50/50 focus-visible:ring-indigo-500 rounded-xl text-xs font-semibold"
              />
              <Button 
                type="submit" 
                disabled={isDiagnosing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 px-5 rounded-xl shadow-lg shadow-indigo-100 flex items-center gap-1.5 shrink-0"
              >
                {isDiagnosing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {isDiagnosing ? "Diagnosing..." : "Run Diagnosis"}
              </Button>
            </form>

            {diagResult && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
                {/* 1. Job Status in DB */}
                <div className="lg:col-span-5 bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Database Status</span>
                    <Badge variant="outline" className="text-[10px] font-black capitalize bg-indigo-50 text-indigo-700 border-indigo-200">
                      {diagResult.job?.status || 'N/A'}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Order ID:</span>
                      <span className="font-bold text-slate-800">{diagResult.job?.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Customer:</span>
                      <span className="font-bold text-slate-800">{diagResult.job?.customerName || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1 pt-2 border-t border-slate-200/50">
                      <span className="text-slate-400">Pickup Proof (DB):</span>
                      <span className="font-mono text-[10px] break-all bg-white p-1.5 rounded border border-slate-200">
                        {diagResult.job?.pickupProofImageUrl || 'null'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 pt-1">
                      <span className="text-slate-400">Delivery Proof (DB):</span>
                      <span className="font-mono text-[10px] break-all bg-white p-1.5 rounded border border-slate-200">
                        {diagResult.job?.deliveryProofImageUrl || 'null'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. GCS Files Status */}
                <div className="lg:col-span-7 bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 space-y-4 flex flex-col">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Google Cloud Storage Files</span>
                    <span className="text-xs font-bold text-slate-500">
                      Found {diagResult.gcsFiles?.length || 0} file(s)
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[220px] space-y-2 pr-1">
                    {diagResult.gcsFiles && diagResult.gcsFiles.length > 0 ? (
                      diagResult.gcsFiles.map((file: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200/60 shadow-sm text-xs gap-3">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="w-8 h-8 rounded-md bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 border border-slate-200 overflow-hidden">
                              <img src={file.publicUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                            </div>
                            <div className="flex flex-col overflow-hidden">
                              <span className="font-bold text-slate-700 truncate" title={file.name}>
                                {file.name.split('/').pop()}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                Uploaded: {file.created ? format(new Date(file.created), "dd MMM HH:mm") : 'unknown'}
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-500 font-bold shrink-0">
                            {file.size ? `${(Number(file.size) / 1024 / 1024).toFixed(2)} MB` : 'N/A'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-400 italic text-xs">
                        No files found in GCS for this Job ID.
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Discrepancy Analysis & Resolution Actions */}
                <div className="lg:col-span-12">
                  {(() => {
                    if (!diagResult.job) return null;
                    const status = diagResult.job.status;
                    const gcsFiles = diagResult.gcsFiles || [];
                    const pickupFiles = gcsFiles.filter((f: any) => f.name.includes('/proofs-') || f.name.includes('/proofs/'));
                    const hasUnlinkedPickupProof = status === 'pickup' && pickupFiles.length > 0 && !diagResult.job.pickupProofImageUrl;
                    const hasUnlinkedDeliveryProof = status === 'delivery' && pickupFiles.length > 0 && !diagResult.job.deliveryProofImageUrl;

                    if (hasUnlinkedPickupProof) {
                      return (
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-300">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                            <div>
                              <h4 className="text-sm font-black text-amber-900">Sync Discrepancy Found (Pickup Leg)</h4>
                              <p className="text-xs text-amber-700 font-semibold mt-0.5">Rider uploaded {pickupFiles.length} proof image(s) to GCS, but the job status remains "Pickup" and database URLs are empty.</p>
                            </div>
                          </div>
                          <Button
                            disabled={isResolving}
                            onClick={() => handleResolve('pickup', pickupFiles.map((f: any) => f.publicUrl))}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-9 px-4 rounded-lg shadow-md shrink-0 flex items-center gap-1 text-xs cursor-pointer"
                          >
                            {isResolving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            Sync GCS & Complete Pickup
                          </Button>
                        </div>
                      );
                    }

                    if (hasUnlinkedDeliveryProof) {
                      return (
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in duration-300">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                            <div>
                              <h4 className="text-sm font-black text-amber-900">Sync Discrepancy Found (Delivery Leg)</h4>
                              <p className="text-xs text-amber-700 font-semibold mt-0.5">Rider uploaded {pickupFiles.length} proof image(s) to GCS, but the job status remains "Delivery" and database URLs are empty.</p>
                            </div>
                          </div>
                          <Button
                            disabled={isResolving}
                            onClick={() => handleResolve('delivery', pickupFiles.map((f: any) => f.publicUrl))}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold h-9 px-4 rounded-lg shadow-md shrink-0 flex items-center gap-1 text-xs cursor-pointer"
                          >
                            {isResolving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                            Sync GCS & Complete Delivery
                          </Button>
                        </div>
                      );
                    }

                    return (
                      <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3 animate-in fade-in duration-300">
                        <Check className="text-emerald-600 shrink-0" size={18} />
                        <div>
                          <h4 className="text-sm font-black text-emerald-900">Database & GCS are in sync</h4>
                          <p className="text-xs text-emerald-700 font-semibold mt-0.5">No discrepancies detected for this job. All uploaded images are correctly registered in the database.</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[180px]">Timestamp</TableHead>
                <TableHead className="w-[130px]">Order ID</TableHead>
                <TableHead className="w-[220px]">Customer</TableHead>
                <TableHead className="w-[100px]">Action</TableHead>
                <TableHead className="w-[150px]">Actor</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Loading logs...</p>
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                    {!jobId && !searchTerm.trim() 
                      ? "Please enter a search term (Order ID, Customer, Action, or Actor) to view activity logs."
                      : "No logs found."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map(log => {
                  const isExpanded = !!expandedLogIds[log.id];
                  const displayCustomer = log.customerName || (() => {
                    try {
                      const parsed = JSON.parse(log.details || '{}');
                      return parsed.customerName;
                    } catch {}
                    return null;
                  })() || '-';

                  return (
                    <>
                      <TableRow 
                        key={log.id} 
                        className="cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
                        onClick={() => toggleRow(log.id)}
                      >
                        <TableCell className="font-medium text-slate-700 whitespace-nowrap">
                          {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm:ss")}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-semibold text-indigo-600">
                          #{log.entityId.split('-')[0].toUpperCase()}
                        </TableCell>
                        <TableCell className="font-medium text-slate-800">
                          {displayCustomer}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={log.action === 'create' ? 'default' : 'secondary'} 
                            className={`uppercase text-[10px] ${
                              log.action === 'create' 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50' 
                                : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50'
                            }`}
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-slate-700">
                          {log.userName || 'System'}
                        </TableCell>
                        <TableCell>
                          <ChevronDown 
                            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180 text-indigo-500' : ''
                            }`} 
                          />
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${log.id}-details`} className="bg-slate-50/30 hover:bg-slate-50/30">
                          <TableCell colSpan={6} className="p-4 border-t border-slate-100">
                            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm space-y-2 ml-4">
                              {parseDetails(log.details, log.action)}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
