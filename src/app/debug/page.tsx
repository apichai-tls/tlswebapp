import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolveServerActionUser } from "@/lib/server-auth";
import { GcsDebugger } from "@/components/gcs-debugger";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { user } = await resolveServerActionUser();
  const role = (user?.role || "").toLowerCase();
  if (!user || !user.isActive || (role !== "admin" && role !== "superadmin")) {
    return (
      <div className="p-8 max-w-xl mx-auto font-mono text-red-600">
        403 Forbidden: Administrator authentication is required to view system diagnostics.
      </div>
    );
  }

  let dbStatus = "Unknown";
  let errorMessage = "";
  let shopCount = 0;

  try {
    const shops = await prisma.shopLocation.findMany({ select: { id: true } });
    shopCount = shops.length;
    dbStatus = "Connected successfully! ✅";
  } catch (error: any) {
    dbStatus = "Connection Failed ❌";
    errorMessage = error?.message || String(error);
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6 bg-slate-50 min-h-screen font-mono">
      <h1 className="text-2xl font-bold text-slate-800">🛠 Database Connection Debugger</h1>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Status</h2>
          <p className={`text-lg font-medium mt-1 ${dbStatus.includes("✅") ? "text-green-600" : "text-red-600"}`}>
            {dbStatus}
          </p>
        </div>

        {errorMessage && (
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <h2 className="text-sm font-semibold text-red-800 uppercase tracking-wider mb-2">Error Details</h2>
            <pre className="text-xs text-red-600 whitespace-pre-wrap break-words">{errorMessage}</pre>
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">ShopLocation Records</h2>
          <p className="text-lg text-slate-800 mt-1">{shopCount} branches found in database</p>
        </div>
      </div>
      <GcsDebugger />
    </div>
  );
}
