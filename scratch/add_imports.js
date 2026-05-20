const fs = require('fs');
const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\rider\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace('} from "lucide-react";', '  Zap,\n  Info\n} from "lucide-react";');

fs.writeFileSync(path, code);
console.log('Added Zap and Info to lucide-react imports');
