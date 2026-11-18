// Perfiles locales: cada persona que use la app en este ordenador tiene el suyo, con su carpeta de Brain, su campus,
// su sesión de Blackboard, sus avisos y su progreso de juego. Nada de un perfil toca los datos de otro.
// El PIN opcional es una barrera de comodidad (evita que otra persona entre por error en tu perfil); NO cifra nada:
// quien tenga acceso a tu cuenta del sistema puede leer la carpeta del Brain igualmente.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const file = () => path.join(app.getPath('userData'), 'profiles.json');
let db = { profiles: [], last: null };

const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
const guardar = () => { try { fs.writeFileSync(file(), JSON.stringify(db, null, 1)); } catch {} };
const TIPOS = { blackboard: 'Blackboard', moodle: 'Moodle', canvas: 'Canvas', ical: 'Calendario iCal' };
const tipoDe = (p) => (TIPOS[p.lms] ? p.lms : 'blackboard');   // los perfiles anteriores a esta versión son de Blackboard
const vista = (p) => ({ id: p.id, name: p.name, vault: p.vault, campusUrl: p.campusUrl || '', dashboardUrl: p.dashboardUrl || '', hasPin: !!p.pin, lms: tipoDe(p), lmsNombre: TIPOS[tipoDe(p)], icalUrl: p.icalUrl || '', modo: tieneBrain(p.vault) ? 'brain' : 'carpeta' });
const esDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const tieneBrain = (p) => esDir(path.join(p, '02-Asignaturas'));

function cargar() {
  try { db = JSON.parse(fs.readFileSync(file(), 'utf8')); if (!Array.isArray(db.profiles)) db = { profiles: [], last: null }; return; } catch {}
  // Migración de la versión de un solo usuario: la carpeta que había en config.json pasa a ser el primer perfil.
  // El perfil «default» conserva la sesión de Blackboard y los ficheros de estado anteriores.
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'));
    if (cfg.vault && tieneBrain(cfg.vault)) { db.profiles.push({ id: 'default', name: 'Mi perfil', vault: cfg.vault, campusUrl: '', dashboardUrl: '', pin: null, created: new Date().toISOString() }); db.last = 'default'; guardar(); }
  } catch {}
}
const buscar = (id) => db.profiles.find(p => p.id === id);
// Rutas de datos del perfil. El «default» usa los nombres antiguos para no perder su sesión ni su estado.
function datos(p) {
  const u = app.getPath('userData'), legacy = p.id === 'default', suf = legacy ? '' : '-' + p.id;
  return { partition: legacy ? 'persist:blackboard' : 'persist:bb-' + p.id, bbState: path.join(u, `blackboard${suf}.json`), bbIngesta: path.join(u, `bb-ingesta${suf}.json`), avisos: path.join(u, `avisos${suf}.json`), mensajes: path.join(u, `mensajes${suf}.json`), notas: path.join(u, `notas${suf}.json`), ia: path.join(u, `ia${suf}.json`), enlaces: path.join(u, `enlaces${suf}.json`), act: path.join(u, `actualizar${suf}.json`), ajustes: path.join(u, `ajustes${suf}.json`) };
}
function limpiaCampus(u, conservarRuta) {
  const s = String(u || '').trim(); if (!s) return '';
  let x; try { x = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch { throw new Error('La URL del campus no es válida'); }
  if (x.protocol !== 'https:') throw new Error('La URL del campus debe empezar por https://');
  // Blackboard y Canvas cuelgan de la raíz (la app añade sola /ultra/stream, /api/v1/…); Moodle a veces vive en una subcarpeta (https://uni.es/moodle)
  return conservarRuta ? x.origin + x.pathname.replace(/\/+$/, '') : x.origin;
}
function limpiaIcal(u) {
  const s = String(u || '').trim(); if (!s) return '';
  const t = s.replace(/^webcal:/i, 'https:'); let x; try { x = new URL(t); } catch { throw new Error('La dirección del calendario no es válida'); }
  if (x.protocol !== 'https:') throw new Error('La dirección del calendario debe empezar por https:// o webcal://');
  return x.href;   // es secreta: se guarda solo en este perfil y no se escribe en ningún registro
}
function limpiaWeb(u) { const s = String(u || '').trim(); if (!s) return ''; let x; try { x = new URL(s); } catch { throw new Error('La URL del dashboard web no es válida'); } if (x.protocol !== 'https:') throw new Error('La URL del dashboard web debe ser https'); return x.href; }
function validar(d, idActual) {
  const name = String(d.name || '').trim().slice(0, 40); if (!name) throw new Error('El perfil necesita un nombre');
  if (!d.vault || !esDir(d.vault)) throw new Error('La carpeta del Brain no existe');
  const vault = path.resolve(d.vault);
  if (db.profiles.some(p => p.id !== idActual && path.resolve(p.vault) === vault)) throw new Error('Otro perfil ya usa esa carpeta');
  const lms = TIPOS[d.lms] ? d.lms : 'blackboard', icalUrl = lms === 'ical' ? limpiaIcal(d.icalUrl) : '';
  if (lms === 'ical' && !icalUrl) throw new Error('Indica la dirección de tu calendario iCal');
  return { name, vault, lms, icalUrl, campusUrl: lms === 'ical' ? '' : limpiaCampus(d.campusUrl, lms === 'moodle'), dashboardUrl: limpiaWeb(d.dashboardUrl) };
}
function pinNuevo(pin) { if (pin == null || pin === '') return null; if (!/^\d{4,12}$/.test(String(pin))) throw new Error('El PIN debe tener entre 4 y 12 números'); const salt = crypto.randomBytes(16).toString('hex'); return { salt, hash: hashPin(pin, salt) }; }
function pinOk(p, pin) {
  if (!p.pin) return true; if (!pin) return false;
  const a = Buffer.from(hashPin(pin, p.pin.salt), 'hex'), b = Buffer.from(p.pin.hash, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function crear(d) {
  const v = validar(d, null), p = { id: crypto.randomBytes(6).toString('hex'), ...v, pin: pinNuevo(d.pin), created: new Date().toISOString() };
  db.profiles.push(p); guardar(); return p;
}
// Edición: si el perfil tiene PIN hace falta el actual para guardar cualquier cambio. pin === undefined → no se toca; '' → se quita.
function editar(id, d, pinActual) {
  const p = buscar(id); if (!p) throw new Error('Perfil no encontrado');
  if (p.pin && !pinOk(p, pinActual)) throw new Error('PIN actual incorrecto');   // con PIN, cualquier cambio exige conocerlo
  Object.assign(p, validar(d, id)); if (d.pin !== undefined) p.pin = pinNuevo(d.pin);
  guardar(); return p;
}
function borrar(id, pin) {
  const p = buscar(id); if (!p) throw new Error('Perfil no encontrado');
  if (!pinOk(p, pin)) throw new Error('PIN incorrecto');
  db.profiles = db.profiles.filter(x => x.id !== id); if (db.last === id) db.last = null; guardar();
  for (const f of Object.values(datos(p))) if (f.endsWith('.json')) { try { fs.unlinkSync(f); } catch {} }   // solo estado de la app: la carpeta del Brain NUNCA se toca
  return p;
}
const lista = () => db.profiles.map(vista);
const marcarUltimo = (id) => { db.last = id; guardar(); };
module.exports = { TIPOS, tipoDe, cargar, lista, buscar, datos, crear, editar, borrar, pinOk, marcarUltimo, vista, tieneBrain, esDir, ultimo: () => db.last };
