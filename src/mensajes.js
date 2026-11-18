// Mensajes privados de Blackboard Ultra (solo lectura): lista de conversaciones de cada asignatura, como en «Mensajes» del campus.
// Se lee con TU sesión en una ventana oculta (la misma partición del perfil que usa Avisos) y se recogen las respuestas que la
// propia página de Blackboard ya pide (/learn/api/v1/messages/summary y /learn/api/v1/courses/<curso>/conversations).
// No se llama a la API por cuenta propia (Blackboard responde 404 a esas llamadas internas desde fuera) y no se ven ni guardan tokens.
// No se responde, no se borra y no se marca nada como leído. Los mensajes se guardan SOLO en la carpeta de datos de la app,
// fuera del Brain y de Git.
const { BrowserWindow, Notification } = require('electron');
const fs = require('fs');
const { siglaDeCurso } = require('./cursos');
const { DRIVER } = require('./bbcompose');

let cfg = null, st = vacio(), running = null, loginWin = null;
function vacio() { return { status: 'nunca', msg: 'Sin revisar todavía', lastCheck: null, cursos: [] }; }
const save = () => { try { if (cfg && cfg.stateFile) fs.writeFileSync(cfg.stateFile, JSON.stringify(st)); } catch {} };
const enCampus = (u) => !!cfg && !!cfg.campus && String(u).startsWith(cfg.campus + '/ultra/');
const sinLeerTotal = () => st.cursos.reduce((n, c) => n + (c.sinLeer || 0), 0);
function state() { return { status: st.status, msg: st.msg, lastCheck: st.lastCheck, cursos: st.cursos, sinLeer: sinLeerTotal(), campus: cfg ? cfg.campus : '' }; }

function init(ctx) {
  cfg = ctx; st = vacio(); running = null;
  if (loginWin && !loginWin.isDestroyed()) loginWin.destroy();
  if (!ctx.activo) { st.status = 'no-aplica'; st.msg = 'Los mensajes privados solo están disponibles con un campus Blackboard'; return; }
  try { st = { ...st, ...JSON.parse(fs.readFileSync(ctx.stateFile, 'utf8')) }; } catch {}
  if (st.fmt !== 2) { st.hilos = {}; st.lastCheck = null; st.fmt = 2; save(); }   // v1.0.10 guardaba «GIVEN_NAME» como nombre: se descarta y se vuelve a leer
  if (!ctx.campus) { st.status = 'sin-campus'; st.msg = 'Añade la URL de tu campus en el perfil para ver tus mensajes'; }
}

// ---- Texto y nombres ----
const limpia = (s) => String(s || '').replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);   // en pantalla se pinta como texto plano, nunca como HTML
// OJO: en Blackboard `preferredDisplayName` NO es el nombre, es la preferencia de visualización (valores como «GIVEN_NAME»): se usan nombre y apellidos
const nombre = (s) => {
  if (!s) return '';
  const n = [s.givenName, s.familyName].filter(Boolean).join(' ').trim(); if (n) return n;
  const p = String(s.preferredDisplayName || '').trim(); if (p && !/^[A-Z][A-Z_]*$/.test(p)) return p;   // solo si parece un nombre y no un código de preferencia
  return s.userName || '';
};
const siglaDe = (curso) => { const s = siglaDeCurso(curso || '', cfg.asignaturas ? cfg.asignaturas() : []); return s ? s.toUpperCase() : (String(curso || '').replace(/\([^)]*\)/g, '').trim().slice(0, 14) || '·'); };

// ---- Captura de las respuestas de la página (protocolo de depuración de la ventana oculta) ----
function observar(win) {
  const dbg = win.webContents.debugger, vistas = new Map(), hechas = [];
  try { dbg.attach('1.3'); } catch {}
  dbg.sendCommand('Network.enable').catch(() => {});
  dbg.on('message', async (_e, method, p) => {
    try {
      if (method === 'Network.responseReceived') {
        const u = p.response.url;
        if (u.startsWith(cfg.campus + '/learn/api/v1/') && /\/(messages\/summary|conversations(\/[^/?]+\/(messages|participants))?)(\?|$)/.test(u)) vistas.set(p.requestId, { url: u, status: p.response.status });
      } else if (method === 'Network.loadingFinished' && vistas.has(p.requestId)) {
        const r = vistas.get(p.requestId); vistas.delete(p.requestId);
        const b = await dbg.sendCommand('Network.getResponseBody', { requestId: p.requestId });
        r.body = b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body; hechas.push(r);
      }
    } catch {}
  });
  return {
    async esperar(pred, ms, alEsperar) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const r = hechas.find(x => x.status === 200 && pred(x.url)); if (r) return r;
        if (alEsperar && alEsperar(Date.now() - t0)) return null;
        await new Promise(res => setTimeout(res, 300));
      }
      return null;
    },
    soltar() { try { dbg.detach(); } catch {} },
  };
}

async function leer({ soloResumen, alCurso }) {
  const win = new BrowserWindow({ show: false, webPreferences: { partition: cfg.partition, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const ob = observar(win);
  try {
    const sinSesion = (ms) => ms > 8000 && !enCampus(win.webContents.getURL());   // Blackboard nos mandó a iniciar sesión
    win.loadURL(cfg.campus + '/ultra/messages').catch(() => {});
    const sum = await ob.esperar((u) => /\/messages\/summary\?/.test(u), 30000, sinSesion);
    if (!sum) return !enCampus(win.webContents.getURL()) ? { login: true } : { vacio: true };
    const filas = (JSON.parse(sum.body).results || []).filter(c => c && c.courseId);
    const cursos = filas.map(c => ({ courseId: c.courseId, nombre: c.courseName || '', sigla: siglaDe(c.courseName), sinLeer: c.numUnreadMessages || 0, habilitado: c.isCourseMessagesEnabled !== false, conversaciones: [], hayMas: false, leido: false }));
    if (soloResumen) return { cursos };
    let i = 0;
    for (const c of cursos) {
      i++;
      if (alCurso) alCurso(`Leyendo mensajes ${i}/${cursos.length}: ${c.sigla}…`, null);
      if (!c.habilitado) { c.leido = true; continue; }
      win.loadURL(`${cfg.campus}/ultra/courses/${c.courseId}/messages`).catch(() => {});
      const re = new RegExp('/learn/api/v1/courses/' + c.courseId.replace(/[^\w]/g, '.') + '/conversations(\\?|$)');
      const conv = await ob.esperar((u) => re.test(u), 15000);
      if (!conv) continue;   // sin respuesta: se deja sin leer y se avisa en pantalla
      const j = JSON.parse(conv.body);
      c.hayMas = !!(j.paging && j.paging.nextPage);
      c.conversaciones = (j.results || []).map(v => {
        const m = (v.messages || [])[0] || {};
        return {
          id: v.id, creada: v.createdDate || '', actualizada: v.updatedDate || m.postDate || '', total: v.totalCount || 1, sinLeer: v.unreadCount || 0,
          aTodos: !!v.includesAllMembers, remitente: nombre(m.sender), fecha: m.postDate || v.updatedDate || '', leido: m.isRead !== false && !(v.unreadCount > 0),
          texto: limpia(m.body && (m.body.rawText || m.body.displayText)),
        };
      }).sort((a, b) => String(b.actualizada).localeCompare(String(a.actualizada)));
      c.leido = true;
      if (alCurso) alCurso(null, c);
    }
    return { cursos };
  } finally { ob.soltar(); if (!win.isDestroyed()) win.destroy(); }
}

// ---- Historial completo de una conversación ----
// Blackboard abre la conversación en /ultra/courses/<curso>/messages/edit/<conversación> y la página pide
// /learn/api/v1/courses/<curso>/conversations/<conversación>/messages (los mensajes) y .../participants (las personas).
// OJO: abrir una conversación sin leer hace que Blackboard la marque como leída, igual que si la abres en el campus.
const ID = /^_\d+_\d+$/;
async function leerHilo(courseId, convId) {
  const win = new BrowserWindow({ show: false, webPreferences: { partition: cfg.partition, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  const ob = observar(win);
  try {
    const sinSesion = (ms) => ms > 8000 && !enCampus(win.webContents.getURL());
    win.loadURL(`${cfg.campus}/ultra/courses/${courseId}/messages/edit/${convId}?courseId=${courseId}&offset=0&count=3`).catch(() => {});
    const base = `/learn/api/v1/courses/${courseId}/conversations/${convId}`;
    const msg = await ob.esperar((u) => u.includes(base + '/messages'), 25000, sinSesion);
    if (!msg) return !enCampus(win.webContents.getURL()) ? { login: true } : { vacio: true };
    const par = await ob.esperar((u) => u.includes(base + '/participants'), 4000);   // llega a la vez; si no llega, se muestra sin personas
    const j = JSON.parse(msg.body), p = par ? JSON.parse(par.body) : { results: [] };
    const mensajes = (j.results || []).map(m => ({ id: m.id, fecha: m.postDate || '', remitente: nombre(m.sender), remitenteId: m.senderId || '', leido: m.isRead !== false, texto: limpia(m.body && (m.body.rawText || m.body.displayText)) }))
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    return { mensajes, participantes: (p.results || []).map(nombre).filter(Boolean), hayMas: !!(j.paging && j.paging.nextPage) };
  } finally { ob.soltar(); if (!win.isDestroyed()) win.destroy(); }
}
const hilosLeyendo = new Map();
// hilo(curso, conversación, total): lo guardado si la conversación no ha cambiado (mismo nº de mensajes); si no, se lee de Blackboard
async function hilo(courseId, convId, total, forzar) {
  if (!cfg || !cfg.activo || !cfg.campus) return { ok: false, msg: 'Mensajes no disponibles en este perfil' };
  if (!ID.test(String(courseId)) || !ID.test(String(convId))) return { ok: false, msg: 'Conversación no válida' };
  st.hilos = st.hilos || {};
  const g = st.hilos[convId];
  if (!forzar && g && g.mensajes && g.mensajes.length >= (total || 1)) return { ok: true, ...g, deCache: true };   // lo guardado vale mientras la conversación no tenga más mensajes
  const k = courseId + '/' + convId; if (hilosLeyendo.has(k)) return hilosLeyendo.get(k);
  const pr = (async () => {
    try {
      const r = await leerHilo(courseId, convId);
      if (r.login) return { ok: false, login: true, msg: 'Inicia sesión en Blackboard para abrir la conversación' };
      if (r.vacio) return { ok: false, msg: 'Blackboard no devolvió la conversación (¿cambió la página?)' };
      const h = { mensajes: r.mensajes, participantes: r.participantes, hayMas: r.hayMas, total: r.mensajes.length, leidoEn: new Date().toISOString() };
      st.hilos[convId] = h;
      const claves = Object.keys(st.hilos); if (claves.length > 80) for (const c of claves.slice(0, claves.length - 80)) delete st.hilos[c];   // solo se guardan los 80 últimos
      for (const c of st.cursos) if (c.courseId === courseId) for (const v of c.conversaciones) if (v.id === convId) { c.sinLeer = Math.max(0, (c.sinLeer || 0) - (v.sinLeer || 0)); v.sinLeer = 0; v.leido = true; }   // Blackboard la marca leída al abrirla
      save();
      return { ok: true, ...h };
    } catch (e) { return { ok: false, msg: 'Error al abrir la conversación: ' + String(e.message || e).slice(0, 120) }; }
  })().finally(() => hilosLeyendo.delete(k));
  hilosLeyendo.set(k, pr); return pr;
}

// ---- Mensajes nuevos: se maneja la pantalla «Nuevo mensaje» de Blackboard en una ventana oculta, como lo haría una persona ----
// Nada se envía por una API propia: se rellena el formulario real y se pulsa su botón «Enviar» SOLO después de comprobar que los
// destinatarios y el texto que muestra Blackboard son exactamente los que ha confirmado el usuario. Si algo no cuadra, se aborta.
const norm = (t) => String(t || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const js = (win, code) => win.webContents.executeJavaScript(code, true);
const MAX_TEXTO = 5000, MAX_DEST = 30;
function ventanaOculta() { return new BrowserWindow({ show: false, webPreferences: { partition: cfg.partition, contextIsolation: true, sandbox: true, nodeIntegration: false } }); }

// Abre la redacción del curso y espera a que el formulario esté listo. A veces Blackboard manda primero a «Actividad»: se reintenta.
async function abrirRedaccion(win, courseId) {
  const url = `${cfg.campus}/ultra/courses/${courseId}/messages/create?courseId=${courseId}&allowReplies=0`;
  let intentos = 0; win.loadURL(url).catch(() => {});
  const t0 = Date.now(); let ultimaCarga = t0;
  while (Date.now() - t0 < 40000) {
    const u = win.webContents.getURL();
    if (!enCampus(u)) { if (Date.now() - t0 > 8000) return { login: true }; }
    else if (/\/messages\/create/.test(u)) { try { await js(win, DRIVER); if (await js(win, 'window.__bbc.listo()')) return { ok: true }; } catch {} }
    else if (intentos < 2 && Date.now() - ultimaCarga > 3500) { intentos++; ultimaCarga = Date.now(); win.loadURL(url).catch(() => {}); }
    await dormir(600);
  }
  return { vacio: true };
}

// Sesión de redacción abierta mientras el usuario busca destinatarios (se cierra al salir del formulario o a los 4 minutos sin uso)
let red = null;
function redaccionCerrar() { if (red) { clearTimeout(red.timer); try { if (!red.win.isDestroyed()) red.win.destroy(); } catch {} red = null; } }
async function redaccionAbrir(courseId) {
  if (red && red.courseId === courseId && !red.win.isDestroyed()) { clearTimeout(red.timer); red.timer = setTimeout(redaccionCerrar, 4 * 60000); return { ok: true }; }
  redaccionCerrar();
  const win = ventanaOculta(), r = await abrirRedaccion(win, courseId);
  if (!r.ok) { if (!win.isDestroyed()) win.destroy(); return r; }
  red = { win, courseId, timer: setTimeout(redaccionCerrar, 4 * 60000) }; return { ok: true };
}
let buscando = Promise.resolve();
async function destinatarios(courseId, consulta) {
  if (!cfg || !cfg.activo || !cfg.campus) return { ok: false, msg: 'Mensajes no disponibles en este perfil' };
  const q = String(consulta || '').trim().slice(0, 60);
  if (!ID.test(String(courseId))) return { ok: false, msg: 'Asignatura no válida' };
  if (q.length < 2) return { ok: true, resultados: [] };
  const turno = buscando.then(async () => {   // de una en una: la redacción solo tiene un cuadro de búsqueda
    const o = await redaccionAbrir(courseId);
    if (o.login) return { ok: false, login: true, msg: 'Inicia sesión en Blackboard' };
    if (!o.ok) return { ok: false, msg: 'Blackboard no abrió la redacción de mensajes (¿cambió la página?)' };
    try { const lista = await js(red.win, `window.__bbc.buscar(${JSON.stringify(q)})`); return { ok: true, resultados: (lista || []).map(x => ({ id: String(x.id), nombre: x.nombre, usuario: x.usuario, rol: x.rol })).filter(x => ID.test(x.id) && x.nombre) }; }
    catch (e) { redaccionCerrar(); return { ok: false, msg: 'Error al buscar: ' + String(e.message || e).slice(0, 100) }; }
  });
  buscando = turno.catch(() => {}); return turno;
}

// Escribe el texto con eventos de teclado reales (el editor de Blackboard no acepta bien execCommand): una línea = un párrafo
async function teclear(win, texto) {
  const dbg = win.webContents.debugger; try { dbg.attach('1.3'); } catch {}
  await dbg.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  const enter = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  const lineas = String(texto).replace(/\r/g, '').split('\n');
  for (let k = 0; k < lineas.length; k++) {
    if (k) { await dbg.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', ...enter, text: '\r' }); await dbg.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', ...enter }); }
    if (lineas[k]) await dbg.sendCommand('Input.insertText', { text: lineas[k] });
    await dormir(60);
  }
}
let enviando = false;
// enviar({ courseId, destinatarios: [{ id, nombre }], texto, copia }) → { ok, enviado: true|false|'desconocido', msg }
async function enviar(d) {
  if (!cfg || !cfg.activo || !cfg.campus) return { ok: false, enviado: false, msg: 'Mensajes no disponibles en este perfil' };
  const texto = String((d && d.texto) || '').replace(/\r/g, '').trim(), dest = Array.isArray(d && d.destinatarios) ? d.destinatarios : [];
  if (!d || !ID.test(String(d.courseId))) return { ok: false, enviado: false, msg: 'Asignatura no válida' };
  if (!dest.length || dest.length > MAX_DEST || !dest.every(x => x && ID.test(String(x.id)) && typeof x.nombre === 'string' && x.nombre.trim() && x.nombre.length < 120)) return { ok: false, enviado: false, msg: `Elige entre 1 y ${MAX_DEST} destinatarios` };
  if (new Set(dest.map(x => x.id)).size !== dest.length) return { ok: false, enviado: false, msg: 'Hay destinatarios repetidos' };
  if (!texto) return { ok: false, enviado: false, msg: 'El mensaje está vacío' };
  if (texto.length > MAX_TEXTO) return { ok: false, enviado: false, msg: `El mensaje supera los ${MAX_TEXTO} caracteres` };
  if (enviando) return { ok: false, enviado: false, msg: 'Ya hay un envío en curso' };
  enviando = true; redaccionCerrar();
  const win = ventanaOculta(); let pulsado = false;
  try {
    const o = await abrirRedaccion(win, d.courseId);
    if (o.login) return { ok: false, enviado: false, login: true, msg: 'Inicia sesión en Blackboard y vuelve a intentarlo' };
    if (!o.ok) return { ok: false, enviado: false, msg: 'Blackboard no abrió la redacción de mensajes (¿cambió la página?)' };
    for (const x of dest) {
      const r = await js(win, `window.__bbc.elegir(${JSON.stringify(String(x.id))}, ${JSON.stringify(x.nombre)})`);
      if (!r || !r.ok) return { ok: false, enviado: false, msg: `No se pudo añadir a ${x.nombre} como destinatario${r && r.msg ? ' (' + r.msg + ')' : ''}. No se ha enviado nada.` };
    }
    if (!(await js(win, `window.__bbc.copia(${!!d.copia})`))) return { ok: false, enviado: false, msg: 'No se pudo ajustar la copia por correo. No se ha enviado nada.' };
    if (!(await js(win, 'window.__bbc.foco()'))) return { ok: false, enviado: false, msg: 'No se pudo escribir en el editor de Blackboard. No se ha enviado nada.' };
    await teclear(win, texto); await dormir(700);
    // COMPROBACIÓN FINAL: lo que muestra Blackboard debe ser exactamente lo confirmado por el usuario
    const e = await js(win, 'window.__bbc.estado()');
    const esperados = dest.map(x => norm(x.nombre)).sort().join('|'), vistos = (e.chips || []).map(norm).sort().join('|');
    if (esperados !== vistos) return { ok: false, enviado: false, msg: 'Los destinatarios que muestra Blackboard no coinciden con los elegidos. No se ha enviado nada.' };
    if (norm(e.texto) !== norm(texto)) return { ok: false, enviado: false, msg: 'El texto que muestra Blackboard no coincide con el escrito. No se ha enviado nada.' };
    if (!!e.copia !== !!d.copia) return { ok: false, enviado: false, msg: 'La opción de copia por correo no coincide. No se ha enviado nada.' };
    if (!e.enviarActivo) return { ok: false, enviado: false, msg: 'Blackboard no activa el botón Enviar. No se ha enviado nada.' };
    pulsado = true;   // a partir de aquí ya puede haberse enviado
    const env = await js(win, 'window.__bbc.enviar()');
    if (!env || !env.ok) { pulsado = false; return { ok: false, enviado: false, msg: (env && env.msg) || 'No se pudo pulsar Enviar. No se ha enviado nada.' }; }
    const t0 = Date.now();
    while (Date.now() - t0 < (cfg.esperaEnvioMs || 20000)) { if (!/\/messages\/create/.test(win.webContents.getURL())) return { ok: true, enviado: true, msg: 'Mensaje enviado' }; await dormir(500); }
    return { ok: false, enviado: 'desconocido', msg: 'Se pulsó Enviar pero Blackboard no confirmó el envío. Compruébalo en Blackboard antes de volver a enviarlo.' };
  } catch (err) {
    return pulsado ? { ok: false, enviado: 'desconocido', msg: 'Error durante el envío: ' + String(err.message || err).slice(0, 100) + '. Compruébalo en Blackboard antes de volver a enviarlo.' }
      : { ok: false, enviado: false, msg: 'Error preparando el mensaje: ' + String(err.message || err).slice(0, 100) + '. No se ha enviado nada.' };
  } finally { enviando = false; try { win.webContents.debugger.detach(); } catch {} if (!win.isDestroyed()) win.destroy(); }
}

function notificar(titulo, cuerpo, onClick) {
  try { if (!Notification.isSupported()) return; const n = new Notification({ title: titulo, body: cuerpo }); if (onClick) n.on('click', onClick); n.show(); } catch {}
}

// check({ soloResumen }): soloResumen = solo los contadores de no leídos (1 carga; para el segundo plano); si no, también la lista de cada asignatura
async function check({ soloResumen, silencioso, onClick, onCambio } = {}) {
  if (!cfg || !cfg.activo || !cfg.campus) return state();
  if (running) return running;
  running = (async () => {
    const antes = new Map(st.cursos.map(c => [c.courseId, c]));
    try {
      const r = await leer({
        soloResumen,
        alCurso: (msg, curso) => {   // progreso: se enseña lo que ya se ha leído
          if (msg) st.msg = msg;
          if (curso) { const k = st.cursos.findIndex(x => x.courseId === curso.courseId); if (k >= 0) st.cursos[k] = curso; else st.cursos.push(curso); }
          if (onCambio) onCambio();
        },
      });
      st.lastCheck = new Date().toISOString();
      if (r.login) { st.status = 'login'; st.msg = 'Inicia sesión en Blackboard para ver tus mensajes'; return state(); }
      if (r.vacio) { st.status = 'vacio'; st.msg = 'Blackboard no devolvió el resumen de mensajes (¿cambió la página?)'; return state(); }
      const primera = antes.size === 0, subio = [];
      st.cursos = r.cursos.map(c => {
        const a = antes.get(c.courseId);
        if (a && (soloResumen || !c.leido)) return { ...a, sinLeer: c.sinLeer, nombre: c.nombre, sigla: c.sigla, sinRespuesta: !soloResumen && c.habilitado };   // se conserva la lista ya leída (segundo plano, o asignatura que no respondió)
        return c;
      });
      for (const c of st.cursos) { const a = antes.get(c.courseId); if (!primera && a && c.sinLeer > (a.sinLeer || 0)) subio.push(`${c.sigla}: ${c.sinLeer}`); }
      const sin = sinLeerTotal();
      st.status = 'ok'; st.msg = sin ? `${sin} mensaje(s) sin leer en Blackboard` : 'Sin mensajes sin leer';
      if (subio.length && !silencioso) notificar('Blackboard: mensajes nuevos', subio.join('\n'), onClick);
      return state();
    } catch (e) { st.status = 'error'; st.msg = 'Error al leer los mensajes: ' + String(e.message || e).slice(0, 120); return state(); }
    finally { save(); }
  })().finally(() => { running = null; });
  return running;
}

// Ventana visible para iniciar sesión (la misma que Avisos); al cerrarla se vuelve a leer
function abrir(onClosed) {
  if (!cfg || !cfg.campus) return;
  if (loginWin && !loginWin.isDestroyed()) { loginWin.focus(); return; }
  loginWin = new BrowserWindow({ width: 1100, height: 800, title: 'Blackboard', webPreferences: { partition: cfg.partition, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  loginWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) loginWin.loadURL(url); return { action: 'deny' }; });
  loginWin.loadURL(cfg.campus + '/ultra/messages');
  loginWin.on('closed', () => { loginWin = null; if (onClosed) onClosed(); });
}
module.exports = { init, check, state, abrir, hilo, destinatarios, redaccionCerrar, enviar, _limpia: limpia, _nombre: nombre };
