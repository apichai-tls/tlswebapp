import { prisma } from "@/lib/prisma";
import { GcsDebugger } from "@/components/gcs-debugger";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
  let dbStatus = "Unknown";
  let errorMessage = "";
  let shopCount = 0;
  let maskedUrl = "Not set";
  let maskedDirectUrl = "Not set";

  try {
    // Check ENV vars
    const dbUrl = process.env.DATABASE_URL || "";
    if (dbUrl) {
      // Mask password: postgres://user:***@host:port/db
      maskedUrl = dbUrl.replace(/:([^:@]+)@/, ":***@");
    }

    const directUrl = process.env.DIRECT_URL || "";
    if (directUrl) {
      maskedDirectUrl = directUrl.replace(/:([^:@]+)@/, ":***@");
    }

    // Try querying the database
    const shops = await prisma.shopLocation.findMany();
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
          <p className={`text-lg font-medium mt-1 ${dbStatus.includes('✅') ? 'text-green-600' : 'text-red-600'}`}>
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

        <div className="pt-4 border-t border-slate-100">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Environment Variables</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-400 font-semibold mb-1">DATABASE_URL (Pooler - Port 6543)</p>
              <code className="block w-full p-3 bg-slate-900 text-green-400 text-xs rounded-lg break-all">
                {maskedUrl}
              </code>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-semibold mb-1">DIRECT_URL (Direct - Port 5432)</p>
              <code className="block w-full p-3 bg-slate-900 text-green-400 text-xs rounded-lg break-all">
                {maskedDirectUrl}
              </code>
            </div>
          </div>
        </div>
      </div>
      <GcsDebugger />
    </div>
  );
}
