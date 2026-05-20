const fs = require('fs');
const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\admin\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('UserPlus')) {
  code = code.replace(
    'Search,',
    'Search,\n  UserPlus,'
  );
  fs.writeFileSync(path, code);
  console.log('Added UserPlus to lucide-react imports');
} else {
  console.log('UserPlus is already in the file. Wait, where is it missing?');
  // Check if it's in lucide-react imports
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["']lucide-react["']/;
  const match = code.match(importRegex);
  if (match) {
    if (!match[1].includes('UserPlus')) {
       code = code.replace('Search,', 'Search, UserPlus,');
       fs.writeFileSync(path, code);
       console.log('Added UserPlus explicitly inside lucide-react');
    }
  }
}
