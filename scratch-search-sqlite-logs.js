const fs = require('fs');
const readline = require('readline');

async function main() {
  const fileStream = fs.createReadStream('C:\\Users\\ASUS\\.gemini\\antigravity\\brain\\f6b2dfb5-5780-402e-b141-ff818bfb2cf5\\.system_generated\\logs\\transcript.jsonl');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  console.log('Searching logs for sqlite and postgresql...');
  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    if (line.includes('sqlite') || line.includes('postgresql')) {
      const obj = JSON.parse(line);
      if (obj.tool_calls) {
        console.log(`[Line ${lineCount}] Tool call:`, JSON.stringify(obj.tool_calls).substring(0, 300));
      }
    }
  }
}

main();
