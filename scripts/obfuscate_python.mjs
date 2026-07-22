import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

const pyPath = path.join(process.cwd(), 'public/vodafone_bridge.py');

if (fs.existsSync(pyPath)) {
  const originalCode = fs.readFileSync(pyPath, 'utf8');
  
  // Layer 1: zlib + base64
  const compressed = zlib.deflateSync(Buffer.from(originalCode, 'utf8'));
  const b64 = compressed.toString('base64');
  
  // Layer 2: A python script that decodes and executes
  // We make it look like a compiled blob
  const pyCode = `#!/usr/bin/env python3
# WARNING: VODAFONE FAKKA ENCRYPTED BRIDGE
# DO NOT MODIFY THIS FILE
import base64 as _b, zlib as _z, builtins as _B
_D = '${b64}'
_B.exec(_z.decompress(_b.b64decode(_D)).decode('utf-8'))
`;

  fs.writeFileSync(pyPath, pyCode, 'utf8');
  console.log('Successfully encrypted vodafone_bridge.py');
} else {
  console.log('vodafone_bridge.py not found');
}
