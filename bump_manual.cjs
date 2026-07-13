const fs = require('fs');

const version = '3.0.316';
const code = 231;

// package.json
const pkgPath = 'package.json';
let pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log('package.json -> ' + pkg.version);

// build.gradle
const gradlePath = 'android/app/build.gradle';
let gradle = fs.readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode \d+/, `versionCode ${code}`);
gradle = gradle.replace(/versionName "[^"]+"/, `versionName "${version}"`);
fs.writeFileSync(gradlePath, gradle);
console.log('build.gradle bumped');

// buildInfo.ts
const buildInfoPath = 'src/lib/buildInfo.ts';
let buildInfo = fs.readFileSync(buildInfoPath, 'utf8');
buildInfo = buildInfo.replace(/versionCode: \d+/, `versionCode: ${code}`);
buildInfo = buildInfo.replace(/appVersion: '[^']+'/, `appVersion: '${version}'`);
fs.writeFileSync(buildInfoPath, buildInfo);
console.log('buildInfo.ts bumped');
