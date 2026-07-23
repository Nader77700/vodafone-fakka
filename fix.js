const fs = require('fs');
const path = './src/lib/buildInfo.ts';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/appVersion:\s*'3\.0\.349'/, "appVersion:     '3.0.350'");
content = content.replace(/versionCode:\s*349/, "versionCode:    350");
fs.writeFileSync(path, content);
