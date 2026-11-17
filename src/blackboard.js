// Avisos de Blackboard: revisa «Actividad» (<campus>/ultra/stream) con TU sesión y avisa de lo nuevo.
// La sesión vive en una partición propia de cada perfil de la app, como un navegador: la app nunca ve ni guarda tu contraseña.
// Lo detectado se guarda en la carpeta de datos de la app, FUERA del Brain y de Git.
const { BrowserWindow, session, Notification, app } = require('electron');
const fs = require('fs');
const path = require('path');

const { siglaDeCurso } = require('./cursos');
// Contexto del perfil activo: { campus (origen https), partition (sesión propia del perfil), stateFile, asignaturas() }
let cfg = null;
const enCampus = (u) => !!cfg && !!cfg.campus && String(u).startsWith(cfg.campus + '/ultra/');
const urlStream = () => cfg.campus + '/ultra/stream';

const estadoInicial = () => ({ seen: [], novedades: [], lastCheck: null, status: 'nunca', msg: 'Sin revisar todavía', baseline: false });
let st = estadoInicial();
const save = () => { try { if (cfg) fs.writeFileSync(cfg.stateFile, JSON.stringify(st)); } catch {} };
let running = null, loginWin = null;
// Cambia de perfil: estado, sesión y campus nuevos; el anterior no se mezcla con el nuevo
function init(ctx) {
  cfg = ctx; st = estadoInicial(); running = null;
  try { st = { ...st, ...JSON.parse(fs.readFileSync(ctx.stateFile, 'utf8')) }; } catch {}
  if (!ctx.campus) { st.status = 'sin-campus'; st.msg = 'Añade la URL de tu campus en el perfil para recibir avisos de Blackboard'; }
  if (loginWin && !loginWin.isDestroyed()) loginWin.destroy();
}

// Se ejecuta DENTRO de la página de Blackboard: lee los elementos de primer nivel del flujo de actividades
const EXTRAER = `(() => {
  const lis = [...document.querySelectorAll('li.stream-item-container')].filter(e => !e.parentElement.closest('li.stream-item-container'));
  return lis.map(e => { const l = e.innerText.split('\\n').map(s => s.trim()).filter(Boolean); const a = e.querySelector('a[href]'); return { lines: l, href: a ? a.href : '' }; });
})()`;

function normaliza(raw) {
  const out = [];
  for (const r of raw) {
    const l = r.lines || []; if (l.length < 3) continue;
    const fecha = l[0], absoluta = /\d{4}/.test(fecha);   // las fechas relativas («17 horas») cambian solas: no entran en la clave
    const s0 = siglaDeCurso(l[1] || '', cfg ? cfg.asignaturas() : []), sigla = s0 ? s0.toUpperCase() : ((l[1] || '').replace(/\([^)]*\)/g, '').trim().slice(0, 14) || '·');
    const texto = l.slice(2).filter(x => !/^Ver mi calificaci[oó]n$/i.test(x)).join(' · ');
    if (/¿C[oó]mo me est[aá] yendo\?|es un genio/i.test(texto)) continue;   // mensajes de ánimo, no son novedades
    out.push({ key: `${sigla}|${texto}|${absoluta ? fecha : ''}`, fecha, sigla, curso: l[1], texto, href: r.href });
  }
  return out;
}

async function leer(win) {
  await win.loadURL(urlStream()).catch(() => {});
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    const u = win.webContents.getURL();
    if (!enCampus(u)) { if (Date.now() - t0 > 8000) return { login: true }; }
    else { try { const n = await win.webContents.executeJavaScript(`document.querySelectorAll('li.stream-item-container').length`); if (n > 0) break; } catch {} }
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!enCampus(win.webContents.getURL())) return { login: true };
  const raw = await win.webContents.executeJavaScript(EXTRAER);
  return { items: normaliza(raw) };
}

function notificar(titulo, cuerpo, onClick) {
  try { if (!Notification.isSupported()) return; const n = new Notification({ title: titulo, body: cuerpo, silent: false }); if (onClick) n.on('click', onClick); n.show(); } catch {}
}

async function check({ onClick, silencioso } = {}) {
  if (!cfg || !cfg.campus) return state();
  if (running) return running;
  running = (async () => {
    const win = new BrowserWindow({ show: false, webPreferences: { partition: cfg.partition, contextIsolation: true, sandbox: true, nodeIntegration: false } });
    try {
      const r = await leer(win);
      st.lastCheck = new Date().toISOString();
      if (r.login) { st.status = 'login'; st.msg = 'Inicia sesión en Blackboard para recibir avisos'; return state(); }
      if (!r.items.length) { st.status = 'vacio'; st.msg = 'Blackboard no devolvió actividad (¿cambió la página?)'; return state(); }
      const vistas = new Set(st.seen), nuevas = r.items.filter(i => !vistas.has(i.key));
      if (!st.baseline) { st.baseline = true; st.msg = `Blackboard enlazado: ${r.items.length} elementos como punto de partida`; }   // primera revisión: sin avisos
      else if (nuevas.length) {
        st.novedades = [...nuevas.map(i => ({ ...i, detectado: st.lastCheck, visto: false })), ...st.novedades].slice(0, 40);
        st.msg = `${nuevas.length} novedad(es) nueva(s) en Blackboard`;
        if (!silencioso) notificar(`Blackboard: ${nuevas.length} novedad${nuevas.length > 1 ? 'es' : ''}`, nuevas.slice(0, 3).map(i => `${i.sigla} · ${i.texto}`).join('\n'), onClick);
      } else st.msg = 'Sin novedades en Blackboard';
      st.seen = [...new Set([...r.items.map(i => i.key), ...st.seen])].slice(0, 400);
      st.status = 'ok';
      return state();
    } catch (e) { st.status = 'error'; st.msg = 'Error al revisar Blackboard: ' + String(e.message || e).slice(0, 120); return state(); }
    finally { save(); if (!win.isDestroyed()) win.destroy(); }
  })().finally(() => { running = null; });
  return running;
}

function state() { return { status: st.status, msg: st.msg, lastCheck: st.lastCheck, novedades: st.novedades, sinVer: st.novedades.filter(n => !n.visto).length }; }
function marcarVistas() { st.novedades.forEach(n => { n.visto = true; }); save(); return state(); }

// Ventana visible para iniciar sesión (SSO incluido). Al cerrarla se vuelve a revisar.
function abrir(onClosed) {
  if (!cfg || !cfg.campus) return;
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return; }
  loginWin = new BrowserWindow({ width: 1100, height: 800, title: 'Blackboard', webPreferences: { partition: cfg.partition, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  loginWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) loginWin.loadURL(url); return { action: 'deny' }; });
  loginWin.loadURL(urlStream());
  loginWin.on('closed', () => { loginWin = null; if (onClosed) onClosed(); });
}
module.exports = { init, check, state, marcarVistas, abrir, _normaliza: normaliza };
