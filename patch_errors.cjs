const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

walk('/workspace/app-ck2v94t1nev5/src', function(file) {
  if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return;
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  content = content.replace(/e instanceof Error \? e\.message : String\(e\)/g, 'formatError(e)');
  content = content.replace(/String\(e\)/g, 'formatError(e)');
  
  if (content !== original) {
    const importStmt = "import { formatError } from '@/lib/formatError';\n";
    if (!content.includes("import { formatError }")) {
      const lines = content.split('\n');
      let lastImportIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ')) lastImportIdx = i;
      }
      if (lastImportIdx >= 0) {
        lines.splice(lastImportIdx + 1, 0, importStmt);
        content = lines.join('\n');
      } else {
        content = importStmt + content;
      }
    }
    fs.writeFileSync(file, content, 'utf8');
    console.log('Patched', file);
  }
});
