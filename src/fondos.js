// Fondos de pantalla del usuario: copias de sus imágenes en la carpeta de datos de la app (userData/fondos), fuera del Brain y de Git.
// Cada imagen se guarda con un nombre aleatorio (16 hex + extensión); el nombre original solo se recuerda para enseñarlo (nombres.json).
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
const EXTS = Object.keys(MIME), MAX = 25 * 1024 * 1024, MAX_FONDOS = 60;
const ID = /^[a-f0-9]{16}\.(jpg|jpeg|png|webp|gif)$/;   // lo único que se acepta como id: impide salir de la carpeta (../, rutas absolutas)

const idValido = (id) => typeof id === 'string' && ID.test(id);
const leeNombres = (dir) => { try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'nombres.json'), 'utf8')); return j && typeof j === 'object' ? j : {}; } catch { return {}; } };
const guardaNombres = (dir, n) => { try { fs.writeFileSync(path.join(dir, 'nombres.json'), JSON.stringify(n)); } catch {} };

// Comprueba la cabecera del fichero: que sea de verdad una imagen del tipo que dice su extensión
function esImagen(buf, ext) {
  if (!buf || buf.length < 12) return false;
  if (ext === 'jpg' || ext === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === 'png') return buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === 'gif') return buf.slice(0, 4).toString('latin1') === 'GIF8';
  if (ext === 'webp') return buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  return false;
}

// Lista de fondos guardados, los más recientes al final (el orden en que se añadieron)
function lista(dir) {
  let fs0; try { fs0 = fs.readdirSync(dir).filter(idValido); } catch { return []; }
  const n = leeNombres(dir), t = (f) => { try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch { return 0; } };
  return fs0.map(id => ({ id, nombre: typeof n[id] === 'string' ? n[id] : id, t: t(id) })).sort((a, b) => a.t - b.t).map(({ id, nombre }) => ({ id, nombre }));
}

// Copia las imágenes elegidas. Devuelve los ids nuevos y, por fichero rechazado, el motivo.
function anadir(dir, rutas) {
  const anadidas = [], errores = [];
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { return { ok: false, anadidas, errores: [{ nombre: '', msg: 'No se pudo crear la carpeta de fondos: ' + e.message }] }; }
  const nombres = leeNombres(dir); let total = lista(dir).length;
  for (const r of Array.isArray(rutas) ? rutas : []) {
    const nombre = path.basename(String(r)), ext = path.extname(nombre).slice(1).toLowerCase();
    if (!EXTS.includes(ext)) { errores.push({ nombre, msg: 'Formato no admitido (solo JPG, PNG, WebP o GIF).' }); continue; }
    if (total >= MAX_FONDOS) { errores.push({ nombre, msg: `Ya hay ${MAX_FONDOS} fondos: quita alguno antes de añadir más.` }); continue; }
    let st; try { st = fs.statSync(r); } catch { errores.push({ nombre, msg: 'No se pudo leer el fichero.' }); continue; }
    if (!st.isFile()) { errores.push({ nombre, msg: 'No es un fichero.' }); continue; }
    if (st.size > MAX) { errores.push({ nombre, msg: 'Pesa más de 25 MB.' }); continue; }
    let buf; try { buf = fs.readFileSync(r); } catch { errores.push({ nombre, msg: 'No se pudo leer el fichero.' }); continue; }
    if (!esImagen(buf, ext)) { errores.push({ nombre, msg: 'El contenido no es una imagen válida.' }); continue; }
    const id = crypto.randomBytes(8).toString('hex') + '.' + ext;
    try { fs.writeFileSync(path.join(dir, id), buf); } catch (e) { errores.push({ nombre, msg: 'No se pudo guardar: ' + e.message }); continue; }
    nombres[id] = nombre.slice(0, 120); anadidas.push(id); total++;
  }
  guardaNombres(dir, nombres);
  return { ok: true, anadidas, errores };
}

function quitar(dir, id) {
  if (!idValido(id)) return { ok: false, msg: 'Fondo no válido.' };
  try { fs.unlinkSync(path.join(dir, id)); } catch (e) { if (e.code !== 'ENOENT') return { ok: false, msg: e.message }; }
  const n = leeNombres(dir); delete n[id]; guardaNombres(dir, n); return { ok: true };
}

// La imagen como data: URL (la página solo admite imágenes propias o data:, por su política de seguridad)
function datos(dir, id) {
  if (!idValido(id)) return { ok: false, msg: 'Fondo no válido.' };
  try { const buf = fs.readFileSync(path.join(dir, id)); return { ok: true, url: `data:${MIME[id.split('.').pop()]};base64,${buf.toString('base64')}` }; }
  catch { return { ok: false, msg: 'Ese fondo ya no está.' }; }
}

module.exports = { lista, anadir, quitar, datos, idValido, esImagen, MAX, MAX_FONDOS, EXTS };
