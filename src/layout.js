// Dónde están las asignaturas y los apuntes de una carpeta, con o sin estructura de Brain.
//  · Brain:   02-Asignaturas/<sigla>/{<sigla>.md, apuntes/, entregas/, recursos/, _entrada/}
//  · Carpeta de apuntes (cualquier otra): cada subcarpeta es una asignatura y sus .md/.txt (y PDF, Word…) son los apuntes;
//    los ficheros sueltos en la raíz forman una asignatura con el nombre de la carpeta.
const fs = require('fs');
const path = require('path');

const TEXTO = /\.(md|markdown|txt)$/i, EXTERNO = /\.(pdf|docx?|pptx?|xlsx?|odt|odp|rtf)$/i;
const IGNORAR = new Set(['.git', '.obsidian', 'node_modules', '.claude', '.trash', '99-privado', '_entrada', 'entregas']);
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const leer = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const esBrain = (vault) => esDir(path.join(vault, '02-Asignaturas'));
const slug = (n) => norm(n).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 12).replace(/-+$/, '') || 'general';
const titulo = (txt) => { const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/); const t = m && m[1].match(/^title:\s*["']?(.*?)["']?\s*(?:#.*)?$/m); return t ? t[1].trim() : ''; };

function recorre(dir, prof, out, raiz, soloRaiz) {
  if (prof > 6 || out.length > 3000) return;
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (!soloRaiz && !IGNORAR.has(e.name.toLowerCase())) recorre(abs, prof + 1, out, raiz, false); }
    else if (TEXTO.test(e.name) || EXTERNO.test(e.name)) out.push({ rel: path.relative(raiz, abs).split(path.sep).join('/'), abs, texto: TEXTO.test(e.name) });
  }
}
function asignaturasCarpeta(vault) {
  const out = [], usados = new Set();
  const uniq = (s) => { let x = s, i = 2; while (usados.has(x)) x = s.slice(0, 9) + '-' + i++; usados.add(x); return x; };
  let ents = []; try { ents = fs.readdirSync(vault, { withFileTypes: true }); } catch {}
  const sueltos = ents.some(e => e.isFile() && !e.name.startsWith('.') && (TEXTO.test(e.name) || EXTERNO.test(e.name)));
  if (sueltos) out.push({ sigla: uniq(slug(path.basename(vault))), dir: vault, nombre: path.basename(vault), raiz: true });
  for (const e of ents.sort((a, b) => a.name.localeCompare(b.name, 'es'))) {
    if (!e.isDirectory() || e.name.startsWith('.') || IGNORAR.has(e.name.toLowerCase())) continue;
    const dir = path.join(vault, e.name), a = []; recorre(dir, 0, a, dir, false);
    if (a.length || esDir(path.join(dir, 'entregas'))) out.push({ sigla: uniq(slug(e.name)), dir, nombre: e.name, raiz: false });
  }
  return out.slice(0, 60);
}
function asignaturasBrain(vault) {
  const base = path.join(vault, '02-Asignaturas'), out = [];
  try {
    for (const e of fs.readdirSync(base, { withFileTypes: true })) {
      if (!e.isDirectory() || !/^[a-z0-9_-]{1,12}$/i.test(e.name)) continue;
      const dir = path.join(base, e.name), ficha = leer(path.join(dir, e.name + '.md'));
      const hay = (d) => { try { return fs.readdirSync(path.join(dir, d)).some(f => /\.md$/i.test(f) && !/^README\.md$/i.test(f)); } catch { return false; } };
      if (!ficha && !hay('apuntes') && !hay('entregas')) continue;
      out.push({ sigla: e.name.toLowerCase(), dir, nombre: titulo(ficha) || e.name.toUpperCase(), raiz: false });
    }
  } catch {}
  return out.sort((a, b) => a.sigla.localeCompare(b.sigla));
}
const asignaturasDirs = (vault) => (esBrain(vault) ? asignaturasBrain(vault) : asignaturasCarpeta(vault));
const dirAsignatura = (vault, sigla) => { const a = asignaturasDirs(vault).find(x => x.sigla === String(sigla).toLowerCase()); return a ? a.dir : null; };
const dirEntrada = (vault, sigla) => { const d = dirAsignatura(vault, sigla); return d ? path.join(d, '_entrada') : null; };
// Apuntes de una asignatura de una carpeta libre (texto y ficheros que se abren con otra aplicación)
function archivos(vault, sigla) {
  const a = asignaturasCarpeta(vault).find(x => x.sigla === sigla); if (!a) return [];
  const out = []; recorre(a.dir, 0, out, a.dir, a.raiz); return out;
}
// Lector con la misma forma que usa el dashboard (rutas relativas «<sigla>/apuntes/…», «<sigla>/entregas/…») para una carpeta libre
function carpetaIO(vault) {
  const A = asignaturasCarpeta(vault), cache = {};
  const F = (s) => cache[s] ||= archivos(vault, s);
  return {
    list: (rel) => {
      if (rel === '') return A.map(a => a.sigla);
      const [s, sub] = rel.split('/'), a = A.find(x => x.sigla === s); if (!a) return [];
      if (sub === 'apuntes') return F(s).filter(f => f.texto).map(f => f.rel);
      if (sub === 'entregas') { try { return fs.readdirSync(path.join(a.dir, 'entregas')).filter(n => /\.md$/i.test(n)); } catch { return []; } }
      return [];
    },
    read: (rel) => {
      const p = rel.split('/'), a = A.find(x => x.sigla === p[0]); if (!a) return '';
      if (p[1] === 'apuntes') { const f = F(p[0]).find(x => x.rel === p.slice(2).join('/')); return f ? leer(f.abs) : ''; }
      if (p[1] === 'entregas') return leer(path.join(a.dir, 'entregas', p.slice(2).join('/')));
      return '';
    },
  };
}
module.exports = { TEXTO, EXTERNO, esBrain, esDir, slug, asignaturasDirs, dirAsignatura, dirEntrada, archivos, carpetaIO };
