// Guarda una respuesta o un resumen hecho con IA como apunte NUEVO (nunca sobrescribe ni toca lo que ya existe) y siempre marcado como borrador y [supuesto]:
// no sale del material del profesor. En un Brain va a 02-Asignaturas/<sigla>/apuntes/ con la cabecera de las notas del Brain; en una carpeta libre, a la carpeta de la asignatura.
const fs = require('fs');
const path = require('path');
const slug = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'apunte';
// vault: carpeta raíz; esBrain; asig: { sigla, dir }; d: { titulo, cuerpo, fuentes:[ruta…], origen }; hoy: 'AAAA-MM-DD'
function guardarApunte({ vault, esBrain, asig, d, hoy }) {
  const titulo = String(d.titulo || '').replace(/[\r\n"]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100), cuerpo = String(d.cuerpo || '').trim().slice(0, 20000);
  if (titulo.length < 3 || cuerpo.length < 20) return { ok: false, msg: 'Falta el título o el texto.' };
  const dir = esBrain ? path.join(asig.dir, 'apuntes') : asig.dir, raiz = path.resolve(vault);
  if (!path.resolve(dir).startsWith(raiz + path.sep) && path.resolve(dir) !== raiz) return { ok: false, msg: 'Ruta no válida.' };
  const origen = String(d.origen || 'IA').replace(/[\r\n"]+/g, ' ').slice(0, 60);
  const bases = (Array.isArray(d.fuentes) ? d.fuentes : []).slice(0, 12).map(p => path.basename(String(p), path.extname(String(p)))).filter(Boolean);
  const fuentes = bases.length ? '\n\n## Fuentes\n' + [...new Set(bases)].map(b => `- [[${b}]]`).join('\n') : '';
  const aviso = `> NO sale de las diapositivas del profesor: texto generado por IA (${origen}) a partir de tus apuntes. Contrástalo con el material de clase. [supuesto]`;
  const S = asig.sigla.toUpperCase();
  const texto = esBrain
    ? `---\ntype: tema\nsigla: "${S}"\ntitle: "${S} · apunte · ${titulo}"\nstatus: borrador\nsources:\n  - "Generado por IA (${origen}) desde la app Brain, ${hoy}"\nupdated: ${hoy}\n---\n${aviso}\n\n${cuerpo}${fuentes}\n`
    : `# ${titulo}\n\n${aviso}\n\n${cuerpo}${fuentes}\n`;
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 1; i < 100; i++) {   // nunca se sobrescribe: si existe, -2, -3…
    const f = path.join(dir, `ia-${slug(titulo)}${i > 1 ? '-' + i : ''}.md`);
    try { fs.writeFileSync(f, texto, { flag: 'wx' }); return { ok: true, abs: f, ruta: path.relative(raiz, f).split(path.sep).join('/') }; } catch (e) { if (e.code !== 'EEXIST') return { ok: false, msg: 'No se pudo guardar: ' + e.message }; }
  }
  return { ok: false, msg: 'Ya hay demasiados apuntes con ese título.' };
}
module.exports = { guardarApunte, _slug: slug };
