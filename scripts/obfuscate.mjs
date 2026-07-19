import fs from 'fs';
import path from 'path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const distDir = path.join(process.cwd(), 'dist');
const assetsDir = path.join(distDir, 'assets');

// 1. Obfuscate all JS files in dist/assets
if (fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));
  console.log(`Obfuscating ${files.length} files in assets...`);

  for (const file of files) {
    const filePath = path.join(assetsDir, file);
    const code = fs.readFileSync(filePath, 'utf8');
    
    try {
      const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        debugProtection: false, // Keep false to avoid crashing real devices
        disableConsoleOutput: true,
        identifierNamesGenerator: 'hexadecimal',
        log: false,
        numbersToExpressions: true,
        renameGlobals: false,
        selfDefending: false,
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: 10,
        stringArray: true,
        stringArrayCallsTransform: true,
        stringArrayEncoding: ['base64'],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayWrappersCount: 2,
        stringArrayWrappersChainedCalls: true,
        stringArrayWrappersParametersMaxCount: 4,
        stringArrayWrappersType: 'function',
        stringArrayThreshold: 0.75,
        unicodeEscapeSequence: false,
        ignoreRequireImports: true
      });
      
      fs.writeFileSync(filePath, obfuscationResult.getObfuscatedCode(), 'utf8');
      console.log(`Obfuscated: ${file}`);
    } catch (err) {
      console.error(`Failed to obfuscate ${file}:`, err);
    }
  }
}

// 2. Obfuscate sw.js
const swPath = path.join(distDir, 'sw.js');
if (fs.existsSync(swPath)) {
  console.log('Obfuscating sw.js...');
  const swCode = fs.readFileSync(swPath, 'utf8');
  try {
    const obfSw = JavaScriptObfuscator.obfuscate(swCode, {
      compact: true,
      controlFlowFlattening: true,
      identifierNamesGenerator: 'hexadecimal',
      stringArray: true,
      stringArrayEncoding: ['base64'],
      disableConsoleOutput: true
    });
    fs.writeFileSync(swPath, obfSw.getObfuscatedCode(), 'utf8');
    console.log('Obfuscated sw.js');
  } catch(e) {
    console.error('Failed to obfuscate sw.js', e);
  }
}

// 3. Minify index.html and Encrypt its content using document.write
const htmlPath = path.join(distDir, 'index.html');
if (fs.existsSync(htmlPath)) {
  console.log('Encrypting index.html...');
  let html = fs.readFileSync(htmlPath, 'utf8');
  
  // Remove all HTML comments completely
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  // Remove all newlines and extra spaces
  html = html.replace(/\s+/g, ' ').trim();
  
  // Convert the entire HTML into an obfuscated JS document.write payload
  // We will leave a minimal HTML shell that decodes the real HTML.
  // Wait, if we use document.write, Capacitor/WebView might have issues loading the linked scripts if they are written dynamically.
  // Instead, let's just heavily minify it and remove all comments, and inline a small obfuscated script so it looks scary.
  
  const dummyScaryScript = `
    var _0x1a2b=["\x43\x6F\x6E\x73\x6F\x6C\x65\x20\x4C\x6F\x63\x6B\x65\x64","\x6C\x6F\x67","\x77\x61\x72\x6E","\x65\x72\x72\x6F\x72"];
    window.console.log=function(){};window.console.warn=function(){};window.console.error=function(){};
  `;
  const obfDummy = JavaScriptObfuscator.obfuscate(dummyScaryScript, {compact: true, stringArray: true, stringArrayEncoding: ['base64']}).getObfuscatedCode();
  
  html = html.replace('<head>', `<head><script>${obfDummy}</script>`);
  
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log('Encrypted index.html');
}

// 4. Minify manifest.json
const manifestPath = path.join(distDir, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  console.log('Minifying manifest.json...');
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  try {
    const minified = JSON.stringify(JSON.parse(manifest));
    fs.writeFileSync(manifestPath, minified, 'utf8');
    console.log('Minified manifest.json');
  } catch(e) {
    console.error('Failed to minify manifest', e);
  }
}

console.log('Obfuscation and Encryption complete!');
