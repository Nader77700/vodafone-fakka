const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf8');

const virtualConsole = new (require('jsdom').VirtualConsole)();
virtualConsole.on('error', (err) => { console.error('BROWSER ERROR:', err.message || err); });
virtualConsole.on('log', (...msgs) => { console.log('BROWSER LOG:', ...msgs); });
virtualConsole.on('jsdomError', (err) => { console.error('JSDOM ERROR:', err.message); });

const dom = new JSDOM(html, {
  url: 'http://localhost:5000/',
  runScripts: 'dangerously',
  resources: 'usable',
  virtualConsole
});

dom.window.addEventListener('load', () => {
  console.log('LOADED');
});

setTimeout(() => {
  console.log('TIMEOUT');
  process.exit(0);
}, 3000);
