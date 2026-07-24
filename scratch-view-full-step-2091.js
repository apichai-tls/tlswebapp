const fs = require('fs');

const content = fs.readFileSync('C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\f6b2dfb5-5780-402e-b141-ff818bfb2cf5\\.system_generated\\steps\\2091\\content.md', 'utf8');
const lines = content.split('\n');

console.log(`Scanning step 2091 content.md for JEANS / JUMPSUIT...`);
let foundCount = 0;
lines.forEach((line, idx) => {
  if (line.includes('JEANS') || line.includes('JUMPSUIT') || line.includes('POLO/T-SHIRT-DRY') || line.includes('เสื้อกั๊ก')) {
    console.log(`Line ${idx+1}: ${line.trim()}`);
    foundCount++;
  }
});
console.log(`Found matches: ${foundCount}`);
