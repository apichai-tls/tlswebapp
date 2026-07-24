const fs = require('fs');
const path = require('path');

function searchFiles(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      // Ignore binary folders to speed up
      if (file === 'node_modules' || file === '.next' || file === '.git' || file === '.gemini') return;
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(searchFiles(fullPath));
        } else {
          if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.sql') || file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.log') || file.endsWith('.jsonl')) {
            // Only search files smaller than 10MB to be safe
            if (stat.size < 10 * 1024 * 1024) {
              const content = fs.readFileSync(fullPath, 'utf8');
              if (content.includes('JUMPSUIT') || content.includes('POLO/T-SHIRT-DRY')) {
                results.push({ path: fullPath, size: stat.size });
              }
            }
          }
        }
      } catch(e) {}
    });
  } catch(e) {}
  return results;
}

console.log('Scanning all brain conversations and parent folders for JUMPSUIT / POLO/T-SHIRT-DRY...');
const found = searchFiles('C:\\Users\\ASUS\\.gemini\\antigravity\\brain');
const found2 = searchFiles('d:\\Antigravity');
console.log('Matches found in brain:', found);
console.log('Matches found in d:\\Antigravity:', found2);
