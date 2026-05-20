const fs = require('fs');
const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\rider\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Revert myJobs
code = code.replace(
  /const myJobs = activeRider\?\.status === "offline"\s*\?\s*\[\]\s*:\s*allTasks\s*\.filter\(t => t\.isActive && !t\.isCompleted\)\s*\.sort\(\(a, b\) => a\.scheduledAt\.getTime\(\) - b\.scheduledAt\.getTime\(\)\);/,
  `const myJobs = allTasks
    .filter(t => t.isActive && !t.isCompleted)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());`
);

// 2. Add overlay
const tabsContentStart = '<TabsContent value="myjobs" className="flex-1 px-4 py-4 space-y-3 mt-0">';
const overlayHtml = `<TabsContent value="myjobs" className="flex-1 px-4 py-4 space-y-3 mt-0 relative">
              {activeRider?.status === 'offline' && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm rounded-xl">
                  <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center max-w-[80%] text-center border border-slate-100">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                      <Truck size={32} className="text-slate-400" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800 mb-2">You are Offline</h3>
                    <p className="text-sm font-medium text-slate-500 mb-6">
                      Go online to accept and manage your jobs.
                    </p>
                    <Button 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 rounded-xl text-lg shadow-sm"
                      onClick={handleGoOnline}
                    >
                      Go Online
                    </Button>
                  </div>
                </div>
              )}`;

code = code.replace(tabsContentStart, overlayHtml);

fs.writeFileSync(path, code);
console.log('Successfully updated offline mode rendering');
