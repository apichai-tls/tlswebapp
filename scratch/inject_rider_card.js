const fs = require('fs');

const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\rider\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

// We need to inject the RiderJobCard component just before the default export.
const componentCode = `
function RiderJobCard({ task, customer, onClick, showCommission, isHistory = false }: { task: RiderTask, customer: any, onClick: () => void, showCommission: boolean, isHistory?: boolean }) {
  const job = task.job;
  const legType = task.legType;
  const customerLanguage = customer?.language || "th";
  const customerIsVip = customer?.isVIP || false;
  const customerIsMember = customer?.isMember || false;
  
  // Date parsing
  const displayDate = task.scheduledAt ? new Date(task.scheduledAt) : new Date();
  const formattedTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(displayDate);
  const targetLocation = task.targetLocation;
  
  // Parse Remark for specific tags
  const remarks = job.remark ? job.remark.split(" | ") : [];
  const isExpress50 = remarks.some(r => r.includes("Express 50%"));
  const isExpress100 = remarks.some(r => r.includes("Express 100%"));
  
  // Find Leg specific instruction (Pickup / Delivery)
  const legInstruction = remarks.find(r => legType === 'pickup' ? r.startsWith('ไปรับ:') : r.startsWith('ไปส่ง:'));
  
  // Clean remark string
  const cleanRemark = remarks.filter(r => !r.includes("Express") && !r.startsWith('ไปรับ:') && !r.startsWith('ไปส่ง:')).join(" | ");

  return (
    <div
      onClick={onClick}
      className={\`bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm cursor-pointer hover:border-blue-300 transition-colors \${
        (job.status === "completed" || job.status === "picked_up" || isHistory) ? "opacity-70" : ""
      }\`}
    >
      <div className="pb-3 pt-3 px-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex flex-col gap-1">
            <h3 className="text-base font-black text-slate-900 leading-tight flex items-center gap-1.5 flex-wrap">
              {job.customerName || "Customer Guest"}
              {customerIsVip && <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1"><Crown size={12} className="fill-amber-500 text-amber-500"/> VIP</span>}
              {!customerIsVip && customerIsMember && <span className="bg-indigo-100 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded-md font-bold">MEMBER</span>}
              {customerLanguage && (
                <span className={\`text-[10px] px-1.5 py-0.5 rounded-md font-bold \${customerLanguage.toLowerCase() === 'th' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}\`}>
                  {customerLanguage.toUpperCase()}
                </span>
              )}
            </h3>
            
            {/* Express Badges */}
            {(isExpress50 || isExpress100) && (
              <div className="flex items-center gap-1 mt-0.5">
                {isExpress50 && <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-orange-200 flex items-center gap-1"><Zap size={10} className="fill-orange-500" /> EXP 50%</span>}
                {isExpress100 && <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-red-200 flex items-center gap-1"><Zap size={10} className="fill-red-500" /> EXP 100%</span>}
              </div>
            )}
          </div>
          
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span
              className={\`flex items-center gap-1 text-[10px] font-bold py-0.5 px-2 rounded-full border \${legType === 'pickup' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}\`}
            >
              {legType === 'pickup' ? <Package size={10} /> : <Truck size={10} />}
              {legType.toUpperCase()}
            </span>
            {showCommission && (
              <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 mt-0.5">
                ฿{task.commission}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-slate-500 mt-1">
          <Clock size={14} className="text-blue-500 shrink-0" />
          <span className="text-xs font-bold text-slate-700">{formattedTime}</span>
        </div>

        <div className="flex flex-col gap-1 text-slate-500 mt-2">
          {legInstruction && (
            <div className="flex items-start gap-2 bg-blue-50 p-1.5 rounded-md border border-blue-100 mb-1">
              <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
              <span className="text-xs font-bold text-blue-800 leading-tight">{legInstruction}</span>
            </div>
          )}
          <div className="flex items-start gap-2">
            <MapPin size={14} className="text-red-500 shrink-0 mt-0.5" />
            <span className="text-sm font-medium text-slate-700 line-clamp-2">{targetLocation}</span>
          </div>
        </div>
        
        {cleanRemark && (
          <div className="flex items-start gap-2 text-slate-500 mt-2 bg-rose-50 p-2 rounded-lg border border-rose-100">
            <span className="text-xs font-semibold text-rose-700 line-clamp-2">{cleanRemark}</span>
          </div>
        )}
      </div>
    </div>
  );
}

`;

// Insert RiderJobCard before `export default function RiderPage`
const defaultExportIdx = code.indexOf('export default function RiderPage() {');
if (defaultExportIdx === -1) {
  console.log('Cannot find export default function RiderPage() {');
  process.exit(1);
}

code = code.slice(0, defaultExportIdx) + componentCode + code.slice(defaultExportIdx);

fs.writeFileSync(path, code);
console.log('Successfully injected RiderJobCard component.');
