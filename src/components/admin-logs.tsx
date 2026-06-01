import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Loader2, Search, Filter } from "lucide-react";
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
}

export function AdminLogs({ jobId }: { jobId?: string }) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchLogs();
  }, [jobId]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const url = jobId ? `/api/logs?entityId=${jobId}` : "/api/logs";
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

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.entityId.toLowerCase().includes(term) ||
      (log.userName || "").toLowerCase().includes(term) ||
      log.action.toLowerCase().includes(term)
    );
  });

  const parseDetails = (detailsStr: string | null) => {
    if (!detailsStr) return null;
    try {
      const parsed = JSON.parse(detailsStr);
      const cleaned = { ...parsed };
      const ignoredKeys = ['updatedAt', 'actorId', 'actorName', 'actorRole', 'createdAt', 'completedAt', 'id'];
      ignoredKeys.forEach(k => delete cleaned[k]);
      
      if (Object.keys(cleaned).length === 0) {
        return <span className="text-xs text-slate-400 italic">No specific details</span>;
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
        <div className="flex flex-col gap-0.5 text-xs text-slate-600" title={JSON.stringify(cleaned, null, 2)}>
          {Object.entries(cleaned).map(([k, v]) => (
            <div key={k} className="flex items-start gap-1">
              <span className="text-slate-400 shrink-0">•</span>
              <span>
                Updated <span className="font-semibold text-slate-800">{mapKeyToLabel(k)}</span> to <span className="text-indigo-600 font-medium">{formatValue(k, v)}</span>
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
                <TableHead className="w-[150px]">User</TableHead>
                <TableHead className="w-[120px]">Action</TableHead>
                <TableHead className="w-[150px]">Entity ID</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Loading logs...</p>
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-slate-500">
                    No logs found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium text-slate-700 whitespace-nowrap">
                      {format(new Date(log.createdAt), "dd MMM yyyy, HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{log.userName || 'System'}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.action === 'create' ? 'default' : 'secondary'} className="uppercase text-[10px]">
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{log.entityId}</span>
                    </TableCell>
                    <TableCell>
                      {parseDetails(log.details)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
