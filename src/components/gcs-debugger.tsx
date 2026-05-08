"use client";

import { useState } from "react";

export function GcsDebugger() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testConnection = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/test-gcs");
      const data = await res.json();
      setResult({ status: res.status, ...data });
    } catch (error: any) {
      setResult({ success: false, message: "Network error", error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mt-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">☁️ GCS Connection Test</h2>
          <p className="text-sm text-slate-500">Test if your Google Cloud Storage credentials are working</p>
        </div>
        <button 
          onClick={testConnection}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          {loading ? "Testing..." : "Test Connection"}
        </button>
      </div>

      {result && (
        <div className={`p-4 rounded-lg border ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h3 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${result.success ? 'text-green-800' : 'text-red-800'}`}>
            {result.success ? "Success" : "Failed"}
          </h3>
          <p className="text-sm mb-2">{result.message}</p>
          
          <pre className={`text-xs p-3 rounded bg-slate-900 text-slate-200 overflow-x-auto break-words`}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
