// Lógica común a todos los campus: cruce de lo que dice el campus con el Brain y guardado seguro de ficheros descargados.
const fs = require('fs');
const path = require('path');
const dashboard = require('./dashboard');
const L = require('./layout');
const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Texto de fichas y notas de la asignatura (para saber si un fichero ya se ingestó)
function textoBrain(vault, s) {
  const base = L.dirAsignatura(vault, s); if (!base) return '';
  let t = ''; const leer = (p) => { try { t += '\n' + fs.readFileSync(p, 'utf8'); } catch {} };
  if (L.esBrain(vault)) { leer(path.join(base, s + '.md')); for (const d of ['recursos', 'apuntes', 'entregas']) { try { for (const f of fs.readdirSync(path.join(base, d))) if (f.endsWith('.md')) leer(path.join(base, d, f)); } catch {} } }
  else for (const f of L.archivos(vault, s)) { if (f.texto) leer(f.abs); t += '\n' + f.rel; }   // carpeta libre: contenido y nombres de los apuntes
  return norm(t);
}
const seguro = (n) => path.basename(String(n)).replace(/[\/\\:*?"<>|!$`\x00-\x1f]/g, '_').slice(0, 150) || 'fichero';
// Guarda un fichero en 02-Asignaturas/<sigla>/_entrada/ sin sobrescribir nunca (si existe, añade -2, -3…). Devuelve la ruta relativa al Brain.
function guardarFichero(vault, sigla, nombre, buf) {
  const dir = L.dirEntrada(vault, sigla); if (!dir) throw new Error('Asignatura no válida'); fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(seguro(nombre)), base = path.basename(seguro(nombre), ext); let name = base + ext, i = 1;
  for (;;) { try { fs.writeFileSync(path.join(dir, name), buf, { flag: 'wx' }); break; } catch (e) { if (e.code !== 'EEXIST') throw e; name = `${base}-${++i}${ext}`; } }
  return path.relative(vault, path.join(dir, name)).split(path.sep).join('/');
}
// ---- vídeos y descargas grandes ----
const VIDEO = /\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|wmv|flv|ogv|3gp)$/i;
const esVideo = (nombre, mime) => VIDEO.test(String(nombre || '')) || /^video\//i.test(String(mime || ''));
const HOSTS_VIDEO = /youtu\.?be|vimeo|panopto|echo360|kaltura|bbcollab|collaborate|stream\.microsoft|sharepoint\.com.*\/video|loom\.com|mediasite|ensemble|yuja|vídeo|video|grabaci|recording|clase grabada/i;
const LIMITE = 8 * 1024 * 1024 * 1024;   // 8 GB por fichero
const fmtTam = (b) => !b ? '' : b >= 1073741824 ? (b / 1073741824).toFixed(1).replace('.', ',') + ' GB' : (Math.round(b / 1048576) || 1) + ' MB';
// Guarda una respuesta HTTP en 02-Asignaturas/<sigla>/_entrada/ por trozos (un vídeo no cabe en memoria), con progreso y cancelación.
// Nunca sobrescribe, comprueba el espacio libre y no deja ficheros a medias si se corta o se cancela.
async function guardarStream(vault, sigla, nombre, resp, opt = {}) {
  const dir = L.dirEntrada(vault, sigla); if (!dir) throw new Error('Asignatura no válida'); fs.mkdirSync(dir, { recursive: true });
  const total = +(resp.headers.get('content-length') || 0);
  if (total > LIMITE) throw new Error('Fichero de más de 8 GB: descárgalo a mano');
  try { const st = fs.statfsSync(dir); if (total && total > st.bavail * st.bsize - 200 * 1024 * 1024) throw new Error('No hay espacio suficiente en el disco para este fichero'); } catch (e) { if (/espacio/.test(e.message)) throw e; }
  const ext = path.extname(seguro(nombre)), base = path.basename(seguro(nombre), ext); let i = 1, fd, name;
  for (;;) { name = i === 1 ? base + ext : `${base}-${i}${ext}`; try { fd = fs.openSync(path.join(dir, name), 'wx'); break; } catch (e) { if (e.code !== 'EEXIST') throw e; i++; } }   // wx: jamás sobrescribe
  const abs = path.join(dir, name); let hecho = 0, t = 0;
  try {
    for await (const chunk of resp.body) {
      if (opt.signal && opt.signal.aborted) throw new Error('Descarga cancelada');
      fs.writeSync(fd, chunk); hecho += chunk.length; if (hecho > LIMITE) throw new Error('Fichero de más de 8 GB');
      if (opt.onProgress && Date.now() - t > 150) { t = Date.now(); opt.onProgress(hecho, total); }
    }
    fs.closeSync(fd); fd = null; if (opt.onProgress) opt.onProgress(hecho, total || hecho);
  } catch (e) { try { if (fd != null) fs.closeSync(fd); } catch {} try { fs.unlinkSync(abs); } catch {} throw e; }
  return path.relative(vault, abs).split(path.sep).join('/');
}
// Enlaces a vídeos que no se pueden bajar automáticamente (YouTube, Panopto, Collaborate…): se anotan en <asignatura>/recursos/videos-del-campus.md
function guardarEnlaces(vault, sigla, enlaces) {
  const base = L.dirAsignatura(vault, sigla); if (!base) throw new Error('Asignatura no válida');
  const dir = path.join(base, 'recursos'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'videos-del-campus.md'); let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch {}
  if (!txt) txt = '---\ntype: recurso\ntitle: "Vídeos del campus"\n---\n# Vídeos del campus\nEnlaces a vídeos que el campus no permite descargar de forma automática.\n\n';
  let n = 0; for (const e of enlaces) { if (!e.url || txt.includes(e.url)) continue; txt += `- [${String(e.nombre).replace(/[\[\]]/g, '')}](${e.url}) · ${e.curso || ''}${e.creado ? ' · ' + String(e.creado).slice(0, 10) : ''}\n`; n++; }
  if (n) fs.writeFileSync(f, txt); return { n, ruta: path.relative(vault, f).split(path.sep).join('/') };
}
// ---- cruce de entregas y notas del campus con las del Brain ----
const isoFecha = (s) => { const m = (s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (!m) return ''; const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
const toks = (s) => norm(s).replace(/ud[\s-]*(\d)/g, 'ud$1').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length > 1);
const clave = (s) => { const m = norm(s).match(/(test|actividad|practica|juego|quiz|tarea|entrega|defensa|examen)\s*(?:ud[\s-]*)?(\d+[a-z]?)/); return m ? m[1] + m[2] : ''; };
function jaccard(a, b) { const A = new Set(toks(a)), B = new Set(toks(b)); let n = 0; A.forEach(t => B.has(t) && n++); return n / ((A.size + B.size - n) || 1); }
const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);
const num = (t) => { const m = (t || '').match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/); return m ? [parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.'))] : null; };

function casar(row, items) {
  const iso = isoFecha(row.fecha); let mejor = null, ms = 0;
  for (const it of items) {
    let sc = jaccard(row.nombre, it.titulo);
    const kr = clave(row.nombre), ki = clave(it.titulo);
    if (kr && ki && kr !== ki) continue;   // «Test UD-6» y «Test UD-5·6» son entregas distintas aunque se parezcan
    if (kr && kr === ki && (!iso || !it.fecha || dias(iso, it.fecha) <= 14)) sc = Math.max(sc, 0.9);
    if (sc > ms) { ms = sc; mejor = it; }
  }
  return ms >= 0.6 ? mejor : null;
}
function cambios(vault, hoy, filas, sigla) {
  const items = dashboard.build(vault, hoy).items.filter(i => i.sigla === sigla.toUpperCase()), out = [];
  for (const r of filas) {
    if (/^asistencia$/i.test(r.nombre)) continue;
    const etq = r.letra ? `${r.nombre} (nota ${r.letra})` : r.nombre;   // campus con notas en letras (Canvas «letter_grade»): la letra se ve en el panel
    const graded = /calificado/i.test(r.estado || '') && r.nota && !/sin calificar/i.test(r.nota);
    const col = graded ? 'done' : (/enviado|entregado/i.test(r.estado || '') || /^Se entreg/i.test(r.intentos || '')) ? 'sent' : null;
    if (!col) continue;
    const it = casar(r, items);
    if (it) {
      if (it.col === col) { const a = num(r.nota), b = it.nota != null ? [it.nota, it.max] : null; if (col !== 'done' || (a && b && a[0] === b[0] && a[1] === b[1])) continue; }
      else if (it.col === 'done' && col === 'sent') continue;   // nunca se degrada una entrega ya corregida
      out.push({ tipo: 'actualizar', sigla, titulo: it.titulo, col, nota: graded ? r.nota : '', antes: it.col, card: { sigla: it.sigla, titulo: it.titulo, fecha: it.fecha, fuente: it.fuente }, bb: etq });
    } else out.push({ tipo: 'crear', sigla, titulo: r.nombre, col, nota: graded ? r.nota : '', card: { sigla: sigla.toUpperCase(), titulo: r.nombre, fecha: isoFecha(r.fecha), fuente: 'bb' }, bb: etq });
  }
  return out;
}

module.exports = { esVideo, HOSTS_VIDEO, fmtTam, guardarStream, guardarEnlaces, norm, textoBrain, seguro, guardarFichero, isoFecha, casar, cambios, num, jaccard, clave };
