const fs = require('fs');
const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\rider\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace('  Loader2\r\n  Zap,\r\n  Info', '  Loader2,\n  Zap,\n  Info');

fs.writeFileSync(path, code);
console.log('Fixed missing comma');
