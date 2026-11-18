const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain en ' + __V + ')'); process.exit(0); }
// Arnés de interfaz: carga la app real (index.html + app.js…) en jsdom con una API `window.brain` simulada y datos reales del Brain
const { JSDOM, VirtualConsole } = require('jsdom'), fs = require('fs'), path = require('path');
const APP = require('path').resolve(__dirname, '..'), VAULT = __V;
const dashboard = require(APP + '/src/dashboard.js');
function notasBrain() {
  const V = VAULT + '/02-Asignaturas', out = [];
  for (const s of fs.readdirSync(V)) { const d = path.join(V, s, 'apuntes'); if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) { if (!f.endsWith('.md')) continue; const raw = fs.readFileSync(path.join(d, f), 'utf8'), m = raw.match(/^---\n([\s\S]*?)\n---\n/), meta = {};
      if (m) for (const l of m[1].split('\n')) { const kv = l.match(/^([\w-]+):\s*(.*)$/); if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, ''); }
      const body = raw.replace(/^---[\s\S]*?---\n/, ''), h = body.match(/^#\s+(.+)$/m);
      out.push({ path: `02-Asignaturas/${s}/apuntes/${f}`, base: f.replace('.md', ''), ext: 'md', title: meta.title || (h && h[1]) || f, sigla: s.toUpperCase(), type: '', updated: '', meta, body, externo: false, borrador: /NO sale de las diapositivas del profesor/.test(body) }); } }
  return out;
}
async function arranca(extra = {}) {
  const errores = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errores.push('jsdomError: ' + (e.detail && e.detail.stack || e.message).split('\n').slice(0, 3).join(' | '))); vc.on('error', (...a) => errores.push('console.error: ' + a.join(' ').slice(0, 200)));
  let html = fs.readFileSync(APP + '/src/index.html', 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace(/<link rel="stylesheet" href="\.\.\/node_modules[^>]*>/g, '');
  html = html.replace(/<script src="([^"]+)"><\/script>/g, (_m, src) => { if (/xterm|addon-fit|perfiles-ui/.test(src)) return ''; return '<script>' + fs.readFileSync(path.resolve(APP + '/src', src), 'utf8').replace(/<\/script>/g, '<\\/script>') + '</script>'; });
  const notes = notasBrain(), hoy = '2026-11-18', dash = dashboard.build(VAULT, hoy), ficha = (extra.notasBB !== undefined) ? extra.notasBB : { status: 'ok', leido: '2026-11-18T13:00:00Z', cursos: [{ sigla: 'brs', nombre: 'BRS', filas: [{ nombre: 'Test UD-2', estado: 'Calificado', fecha: '2026-09-24', nota: 7.5, max: 10, notaTexto: '7,5/10', sinCalificar: false }, { nombre: 'Práctica 1', estado: 'Calificado', fecha: '2026-10-11', nota: 9, max: 10, notaTexto: '9/10' }, { nombre: 'Práctica 2', estado: 'Enviado', fecha: '2026-11-22', nota: null, sinCalificar: true }, { nombre: 'Examen final', estado: '', fecha: '2026-12-15', nota: null }] }, { sigla: 'pps', nombre: 'PPS', filas: [] }] };
  const llamadas = [];
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) {
    const FIJA = new Date(2026, 10, 18, 12, 0, 0).getTime(), RD = w.Date; w.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIJA); } static now() { return FIJA; } };   // «hoy» fijo (18-11-2026) para que las pruebas no dependan del día en que se ejecutan
    const base = {
      platform: 'darwin', index: async () => ({ ok: true, root: VAULT, modo: 'brain', notes }), subjects: async () => ['afi', 'brs', 'he', 'inc', 'nc', 'pps'].map(s => ({ sigla: s, nombre: s.toUpperCase(), libre: false })),
      dashData: async () => dash, bbState: async () => ({ status: 'ok', msg: 'Sin novedades', lastCheck: '2026-11-18T12:00:00Z', novedades: [], sinVer: 0 }), mensajesState: async () => ({ status: 'no-aplica', msg: '', conversaciones: [] }),
      horarioData: async () => ({ ok: true, cal: fs.readdirSync(VAULT + '/01-Curso').filter(f => /^calendario/.test(f)).map(f => fs.readFileSync(VAULT + '/01-Curso/' + f, 'utf8')).join('\n'), curso: fs.readFileSync(VAULT + '/01-Curso/curso.md', 'utf8'), fuente: 'test' }),
      notasState: async () => ficha, notasLeer: async () => ({ ok: true, ...ficha }),
      iaEstado: async () => extra.iaEst || ({ ok: false, ollama: { ok: false, modelos: [], defecto: 'qwen2.5:7b' }, gemini: { clave: false, cifrada: true, modelos: ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite'], defecto: 'gemini-flash-lite-latest' } }),
      iaPreguntar: async (d) => { llamadas.push(['iaPreguntar', d]); w.__trozo && w.__trozo({ id: d.id, t: 'chunk', txt: 'Respuesta [1]' }); return { ok: true, fuentes: [] }; }, iaCancelar: async () => {}, iaGuardarClave: async (k) => { llamadas.push(['clave', k]); return { ok: true, persistente: true }; }, iaQuitarClave: async () => ({ ok: true }),
      enlacesLista: async () => ({ ok: true, campus: 'https://campus.ejemplo.edu', lista: extra.enlaces || [] }), enlacesGuardar: async (l) => { llamadas.push(['enl', l]); return { ok: true, lista: l.map(x => ({ nombre: x.nombre || 'x', url: x.url })) }; },
      external: async (u) => { llamadas.push(['external', u]); }, bbLogin: async () => { llamadas.push(['bbLogin']); }, bbCheck: async () => ({}), status: async () => ({ ok: false }), uploadInfo: async () => ({ siglas: [], subs: [] }),
    };
    w.brain = new Proxy(Object.assign(base, extra.brain || {}), { get: (t, k) => (k in t ? t[k] : (/^on[A-Z]/.test(String(k)) ? (cb) => { (w.__cb = w.__cb || {})[k] = cb; if (k === 'onIaTrozo') w.__trozo = cb; } : async () => ({ ok: false, msg: 'stub ' + String(k) }))) });
    w.HTMLElement.prototype.scrollIntoView = function () {}; w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, addEventListener() {} }));
  } });
  const w = dom.window; await new Promise(r => { if (w.document.readyState === 'complete') r(); else w.addEventListener('load', () => r()); }); await sleep(400);
  return { w, errores, llamadas, dash, notes };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
module.exports = { arranca, sleep };
