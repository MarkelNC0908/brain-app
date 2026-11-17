// Asignaturas del Brain del usuario y correspondencia curso del campus → carpeta de asignatura.
const L = require('./layout');
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Códigos de curso habituales del campus (p. ej. «…_BARS_A») → carpeta; solo valen si esa carpeta existe en el Brain
const CODIGOS = { BARS: 'brs', NOCI: 'nc', PUPS: 'pps', INEC: 'inc', HAET: 'he', ANFI: 'afi' };

function titulo(txt) { const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/); const t = m && m[1].match(/^title:\s*["']?(.*?)["']?\s*(?:#.*)?$/m); return t ? t[1].trim() : ''; }
// Asignaturas del usuario: las de un Brain (02-Asignaturas/<sigla>/) o las subcarpetas de una carpeta de apuntes cualquiera
function asignaturas(vault) { return L.asignaturasDirs(vault).map(a => ({ sigla: a.sigla, dir: a.dir, nombre: a.nombre })); }
const toks = (s) => new Set(norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length > 2));
function siglaDeCurso(nombreCurso, asig) {
  const m = String(nombreCurso).match(/_([A-Z]{4})_[A-Z]\)/);
  if (m && CODIGOS[m[1]] && asig.some(a => a.sigla === CODIGOS[m[1]])) return CODIGOS[m[1]];
  const limpio = String(nombreCurso).replace(/\([^)]*\)/g, ''), A = toks(limpio); let mejor = '', ms = 0;
  for (const a of asig) {
    const B = toks(a.nombre); let n = 0; A.forEach(t => B.has(t) && n++);
    const sc = n / ((A.size + B.size - n) || 1), cont = norm(a.nombre).includes(norm(limpio).trim()) || norm(limpio).includes(norm(a.nombre).trim()) ? 0.9 : 0;
    if (Math.max(sc, cont) > ms) { ms = Math.max(sc, cont); mejor = a.sigla; }
  }
  return ms >= 0.5 ? mejor : '';
}
module.exports = { asignaturas, siglaDeCurso };
