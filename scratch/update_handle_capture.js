const fs = require('fs');

const path = 'd:\\Antigravity\\TLS\\TLS_V_20260427\\src\\app\\rider\\page.tsx';
let code = fs.readFileSync(path, 'utf8');

const targetStr = `  function handleCapture(taskId: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setCapturedFiles(prev => ({ ...prev, [taskId]: file }));
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setCapturedImages(prev => ({ ...prev, [taskId]: dataUrl }));
        
        // Auto-save logic
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = \`\${taskId}-proof.jpg\`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      };
      reader.readAsDataURL(file);
    }
  }`;

// Find existing handleCapture
const startIdx = code.indexOf('function handleCapture(jobId: string, event: React.ChangeEvent<HTMLInputElement>) {');
const endIdx = code.indexOf('  }', startIdx) + 3;

if (startIdx === -1) {
  console.log('Cannot find handleCapture');
  process.exit(1);
}

code = code.slice(0, startIdx) + targetStr + code.slice(endIdx);

fs.writeFileSync(path, code);
console.log('Successfully updated handleCapture.');
