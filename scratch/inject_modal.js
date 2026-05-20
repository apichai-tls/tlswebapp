const fs = require('fs');

const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\rider\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

const startStr = 'const targetCoords = selectedJob.targetCoords;';
const endStr = 'return (';

const injectStr = `
            const targetCoords = selectedJob.targetCoords;
            const distance = selectedJob.distance;
            
            const customer = customers.find(c => c.id === selectedJob.job.customerId);
            const customerIsVip = customer?.isVIP || false;
            const customerIsMember = customer?.isMember || false;
            const remarks = selectedJob.job.remark ? selectedJob.job.remark.split(" | ") : [];
            const isExpress50 = remarks.some(r => r.includes("Express 50%"));
            const isExpress100 = remarks.some(r => r.includes("Express 100%"));
            const displayDate = selectedJob.scheduledAt ? new Date(selectedJob.scheduledAt) : new Date();
            const formattedTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(displayDate);
            const legInstruction = remarks.find(r => legType === 'pickup' ? r.startsWith('ไปรับ:') : r.startsWith('ไปส่ง:'));
            
            return (
`;

code = code.replace(/const targetCoords = selectedJob\.targetCoords;\s+const distance = selectedJob\.distance;\s+return \(/, injectStr);


const headerStart = '<DialogTitle className="text-lg font-black text-slate-900 leading-tight">';
const headerEnd = '</DialogTitle>';
const headerInject = `<DialogTitle className="text-lg font-black text-slate-900 leading-tight flex items-center gap-1.5 flex-wrap">
                        {selectedJob.job.customerName || "Customer Guest"}
                        {customerIsVip && <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded-md font-bold flex items-center gap-1"><Crown size={12} className="fill-amber-500 text-amber-500"/> VIP</span>}
                        {!customerIsVip && customerIsMember && <span className="bg-indigo-100 text-indigo-800 text-[10px] px-1.5 py-0.5 rounded-md font-bold">MEMBER</span>}
                      </DialogTitle>`;
code = code.replace(new RegExp(headerStart + '\\s*\\{selectedJob\\.job\\.customerName \\|\\| "Customer Guest"\\}\\s*' + headerEnd), headerInject);

const idStart = '<span className="font-mono text-[10px] font-bold tracking-wider text-slate-500 mt-0.5 block">';
const idEnd = '</span>';
const idInject = `<span className="font-mono text-[10px] font-bold tracking-wider text-slate-500 mt-0.5 block">
                        {selectedJob.job.id} • {formattedTime}
                      </span>
                      {(isExpress50 || isExpress100) && (
                        <div className="flex items-center gap-1 mt-1.5">
                          {isExpress50 && <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-orange-200 flex items-center gap-1"><Zap size={10} className="fill-orange-500" /> EXP 50%</span>}
                          {isExpress100 && <span className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded font-bold border border-red-200 flex items-center gap-1"><Zap size={10} className="fill-red-500" /> EXP 100%</span>}
                        </div>
                      )}`;
code = code.replace(new RegExp(idStart + '\\s*\\{selectedJob\\.job\\.id\\}\\s*' + idEnd), idInject);


const badgeStart = '<Badge';
const badgeEnd = '</Badge>';
const badgeRegex = /<Badge[\s\S]*?<\/Badge>/;
const badgeInject = `<div className="flex flex-col items-end gap-1.5">
                        <Badge
                          variant="outline"
                          className={\`gap-1.5 text-xs py-1 px-2 \${legType === 'pickup' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}\`}
                        >
                          {legType === 'pickup' ? <Package size={14} /> : <Truck size={14} />}
                          {legType.toUpperCase()}
                        </Badge>
                        {showCommission && (
                          <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                            ฿{selectedJob.commission}
                          </span>
                        )}
                      </div>`;
code = code.replace(badgeRegex, badgeInject);

const pinStart = '<MapPin size={18} className="text-red-500 shrink-0 mt-0.5" />';
const pinInject = `<MapPin size={18} className="text-red-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        {legInstruction && (
                          <div className="flex items-start gap-1.5 bg-blue-50 p-1 rounded-md border border-blue-100 mb-1.5 inline-flex">
                            <Info size={12} className="text-blue-600 shrink-0 mt-0.5" />
                            <span className="text-[10px] font-bold text-blue-800 leading-tight">{legInstruction}</span>
                          </div>
                        )}`;
code = code.replace('<MapPin size={18} className="text-red-500 shrink-0 mt-0.5" />\n                      <div className="flex-1 min-w-0">', pinInject);


fs.writeFileSync(path, code);
console.log('Successfully injected modal enhancements.');
