// Texto de PDF, Word (.docx) y PowerPoint (.pptx) para que entren en la búsqueda y en «Preguntar». Todo en local, con caché en la carpeta de datos de la app.
// Solo se usa con carpetas de apuntes libres (en un Brain, los originales viven en _entrada y solo se leen al ingestar).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const MAX_BYTES = 30 * 1024 * 1024, MAX_CHARS = 400000;
const entidades = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const limpia = (s) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
// XML de Office: un salto de línea por párrafo y el texto de las etiquetas <a:t> (PowerPoint) o <w:t> (Word)
function xmlOffice(xml, tag) {
  const p = xml.split(new RegExp(`</${tag}:p>`)), out = [];
  for (const parte of p) { const t = [...parte.matchAll(new RegExp(`<${tag}:t(?:\\s[^>]*)?>([^<]*)</${tag}:t>`, 'g'))].map(m => entidades(m[1])).join(''); if (t.trim()) out.push(t); }
  return out.join('\n');
}
async function docx(buf) { const JSZip = require('jszip'), z = await JSZip.loadAsync(buf), f = z.file('word/document.xml'); return f ? xmlOffice(await f.async('string'), 'w') : ''; }
async function pptx(buf) {
  const JSZip = require('jszip'), z = await JSZip.loadAsync(buf), nombres = Object.keys(z.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10)), out = [];
  for (const n of nombres) { const t = xmlOffice(await z.file(n).async('string'), 'a'); if (t) out.push(`## Diapositiva ${parseInt(n.match(/(\d+)\.xml/)[1], 10)}\n${t}`); }
  return out.join('\n\n');
}
async function pdf(buf) { const parse = require('pdf-parse/lib/pdf-parse.js'), r = await parse(buf, { max: 300 }); return r.text || ''; }
const conTiempo = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo agotado')), ms))]);
// Extracción directa (en este proceso). Se ejecuta dentro de un proceso hijo (extraer-cli.js) para que un PDF enorme o raro no bloquee la app y para que el estado interno de pdf.js no se contamine entre ficheros.
async function extraerDirecto(abs) {
  const ext = path.extname(abs).slice(1).toLowerCase(); if (!/^(pdf|docx|pptx)$/.test(ext)) return '';
  let st; try { st = fs.statSync(abs); } catch { return ''; } if (!st.isFile() || st.size > MAX_BYTES) return '';
  try { const buf = fs.readFileSync(abs); return limpia(await conTiempo(ext === 'pdf' ? pdf(buf) : ext === 'docx' ? docx(buf) : pptx(buf), 20000)).slice(0, MAX_CHARS); } catch { return ''; }
}
// ruta absoluta → texto (o '' si no se puede). cacheDir: carpeta donde guardar el texto ya extraído (se invalida si el fichero cambia)
function extraerTexto(abs, cacheDir) {
  const ext = path.extname(abs).slice(1).toLowerCase(); if (!/^(pdf|docx|pptx)$/.test(ext)) return Promise.resolve('');
  let st; try { st = fs.statSync(abs); } catch { return Promise.resolve(''); } if (!st.isFile() || st.size > MAX_BYTES) return Promise.resolve('');
  const key = crypto.createHash('sha1').update(`${abs}|${st.size}|${st.mtimeMs}`).digest('hex'), cache = cacheDir ? path.join(cacheDir, key + '.txt') : null;
  if (cache) { try { return Promise.resolve(fs.readFileSync(cache, 'utf8')); } catch {} }
  return new Promise((resolve) => {
    // En Electron, ELECTRON_RUN_AS_NODE hace que el propio ejecutable actúe como Node (sin ventana); fuera de Electron es simplemente node.
    execFile(process.execPath, [path.join(__dirname, 'extraer-cli.js'), abs], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, out) => {
      let txt = ''; if (!err) { try { txt = String(JSON.parse(out).txt || ''); } catch {} }
      if (cache && txt) { try { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cache, txt); } catch {} }
      resolve(txt);
    });
  });
}
module.exports = { extraerTexto, extraerDirecto, _xmlOffice: xmlOffice };
