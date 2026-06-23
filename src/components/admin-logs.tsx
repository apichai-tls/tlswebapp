import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, Search, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

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
        };
        return labels[key] || key;
      };

      const formatValue = (key: string, val: any) => {
        if (key === 'isPaid') return val ? 'Paid' : 'Unpaid';
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
