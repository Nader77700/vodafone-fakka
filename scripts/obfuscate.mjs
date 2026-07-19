import fs from 'fs';
import path from 'path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const dir = path.join(process.cwd(), 'dist/assets');

if (!fs.existsSync(dir)) {
  console.log('No dist/assets directory found.');
  process.exit(0);
}

const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

console.log(`Obfuscating ${files.length} files...`);

for (const file of files) {
  const filePath = path.join(dir, file);
  const code = fs.readFileSync(filePath, 'utf8');
  
  try {
    const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      debugProtection: false, // Disabled to prevent blocking legit user tools and crashes
      debugProtectionInterval: 0,
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
      stringArrayCallsTransform: false,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 1,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 2,
      stringArrayWrappersType: 'variable',
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

console.log('Obfuscation complete!');
