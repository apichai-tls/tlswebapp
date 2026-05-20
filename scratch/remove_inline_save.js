const fs = require('fs');
const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\admin\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

const regex = /\{customerName\.trim\(\) && !customers\.some\(c => c\.name === customerName \|\| \(customerPhone && c\.phone === customerPhone\)\) && \(\s*<div className="pb-2 border-b border-slate-100 shrink-0">\s*<Button[\s\S]*?<\/Button>\s*<\/div>\s*\)\}/;

code = code.replace(regex, '');

fs.writeFileSync(path, code);
console.log('Removed inline button');
