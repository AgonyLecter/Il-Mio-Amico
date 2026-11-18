/* Build: minifica il gioco e prepara due versioni.
   - dist/web  -> sito (Vercel): con manifest, icone e service worker (installabile)
   - dist/itch -> itch.io: solo index.html, niente service worker; zippata in dist/il-mio-amico-itch.zip
   Uso: npm install && npm run build */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { minify } = require('terser');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function cp(src, dst) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }

async function buildHtml(src) {
  const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 2) throw new Error('Mi aspettavo 2 <script> inline, trovati ' + scripts.length);
  const enJs = scripts[0][1];
  const mainJs = scripts[1][1].replace(/^\s*"use strict";/, '');
  // Tutto in una funzione: i nomi interni vengono accorciati e niente finisce su window
  const merged = '(()=>{"use strict";\n' + enJs + '\n' + mainJs + '\n})();';
  const out = await minify(merged, {
    ecma: 2020,
    compress: { passes: 2, drop_console: false },
    mangle: true,
    format: { comments: false, ascii_only: false },
  });
  if (!out.code) throw new Error('terser: nessun output');
  let html = src.slice(0, scripts[0].index) + '<script>' + out.code + '</script>' + src.slice(scripts[1].index + scripts[1][0].length);
  // CSS e spazi
  html = html.replace(/<style>([\s\S]*?)<\/style>/, (_, css) => '<style>' + css.replace(/\s*\n\s*/g, '').replace(/\s*([{};:,>])\s*/g, '$1') + '</style>');
  html = html.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s*\n\s*</g, '><');
  return html;
}

function forItch(html) {
  return html
    .replace(/<link rel="manifest"[^>]*>/, '')
    .replace(/<link rel="apple-touch-icon"[^>]*>/, '')
    .replace(/<link rel="icon"[^>]*>/, '')
    .replace(/<meta name="apple-mobile-web-app-[^>]*>/g, '')
    .replace(/<meta name="mobile-web-app-capable"[^>]*>/, '');
}

/* ---- zip minimale (deflate) ---- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(files) { // files: [{name, data:Buffer}]
  const parts = [], central = []; let off = 0;
  const d = new Date(); const dt = ((d.getFullYear() - 1980) << 25) | ((d.getMonth() + 1) << 21) | (d.getDate() << 16) | (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  for (const f of files) {
    const name = Buffer.from(f.name), comp = zlib.deflateRawSync(f.data, { level: 9 }), crc = crc32(f.data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8); h.writeUInt32LE(dt >>> 0, 10);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(f.data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, name, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10); c.writeUInt32LE(dt >>> 0, 12);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, name); off += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

(async () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const html = await buildHtml(src);
  const hash = crypto.createHash('sha256').update(html).digest('hex').slice(0, 10);
  rmrf(DIST);

  // --- web (Vercel) ---
  const web = path.join(DIST, 'web');
  fs.mkdirSync(web, { recursive: true });
  fs.writeFileSync(path.join(web, 'index.html'), html);
  cp(path.join(ROOT, 'manifest.webmanifest'), path.join(web, 'manifest.webmanifest'));
  for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) cp(path.join(ROOT, 'icons', f), path.join(web, 'icons', f));
  // service worker: nuova versione della cache a ogni build, così gli aggiornamenti arrivano subito
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').replace(/const CACHE='[^']*'/, `const CACHE='il-mio-amico-${hash}'`);
  fs.writeFileSync(path.join(web, 'sw.js'), sw);

  // --- itch.io ---
  const itch = path.join(DIST, 'itch');
  fs.mkdirSync(itch, { recursive: true });
  const itchHtml = forItch(html);
  fs.writeFileSync(path.join(itch, 'index.html'), itchHtml);
  fs.writeFileSync(path.join(DIST, 'il-mio-amico-itch.zip'), zip([{ name: 'index.html', data: Buffer.from(itchHtml) }]));

  // --- kit completo per itch.io: gioco + copertina + screenshot + testi della pagina ---
  const kitDir = path.join(ROOT, 'itch');
  if (fs.existsSync(kitDir)) {
    const files = [{ name: 'il-mio-amico/il-mio-amico-itch.zip', data: fs.readFileSync(path.join(DIST, 'il-mio-amico-itch.zip')) }];
    (function walk(dir, rel) {
      for (const f of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, f), r = rel ? rel + '/' + f : f;
        if (fs.statSync(full).isDirectory()) walk(full, r); else files.push({ name: 'il-mio-amico/' + r, data: fs.readFileSync(full) });
      }
    })(kitDir, '');
    fs.writeFileSync(path.join(DIST, 'il-mio-amico-itch-kit.zip'), zip(files));
  }

  console.log(`ok  index.html ${(src.length / 1024).toFixed(0)}KB -> ${(html.length / 1024).toFixed(0)}KB  (cache ${hash})`);
})().catch(e => { console.error(e); process.exit(1); });
