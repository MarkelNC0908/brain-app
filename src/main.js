// Proceso principal: lee el Brain del disco (solo lectura) y lo expone al renderer por IPC.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Notification, nativeTheme, session } = require('electron');
const fs = require('fs');
const dashboard = require('./dashboard');
const L = require('./layout');
const campusMod = require('./campus');
const asistenteMod = require('./asistente');   // chat con un modelo local de Ollama sobre los apuntes
const mensajesMod = require('./mensajes');   // mensajes privados de Blackboard (solo lectura)   // elige el conector según el campus del perfil
let cur = campusMod.para('blackboard');   // { avisos, ingesta } del perfil activo
const profiles = require('./profiles');
const cursosMod = require('./cursos');
const { execFile } = require('child_process');
const path = require('path');
// Compatibilidad: hasta la 1.0.2 la app se llamaba «Brain U-tad»; si existe esa carpeta de datos y aún no la nueva, se sigue usando (así no se pierden perfiles ni sesiones)
try { const base = app.getPath('appData'), viejo = path.join(base, 'Brain U-tad'), nuevo = path.join(base, 'Brain'); if (fs.existsSync(viejo) && !fs.existsSync(nuevo)) app.setPath('userData', viejo); } catch {}

// Modo prueba de arranque (npm run humo): usa una carpeta de datos temporal y un Brain de ejemplo, recorre las pantallas y sale con 0 si no hay errores
const HUMO = process.argv.includes('--humo');
if (HUMO && process.env.BRAIN_HUMO_DATOS) app.setPath('userData', process.env.BRAIN_HUMO_DATOS);

// Carpetas que NUNCA se leen (CLAUDE.md: 99-Privado fuera de la IA; _entrada sin procesar)
const EXCLUIDAS = new Set(['99-privado', '_entrada', '.git', '.obsidian', '.claude', 'node_modules', 'templates']);
const EXT = new Set(['.md', '.txt']);
const SUBS = ['_entrada', 'apuntes', 'entregas', 'recursos'];   // destinos permitidos al subir
const ASIG_DIR = () => path.join(vault, '02-Asignaturas');
const siglas = () => L.asignaturasDirs(vault).map(a => a.sigla);
const realPaths = new Map();   // ruta virtual de un apunte de carpeta libre → fichero real (para abrir PDF/Word con la aplicación del sistema)

let win, vault = null, watcher = null, profile = null, timers = [], pinFallos = 0;
let pty = null; try { pty = require('node-pty'); } catch (e) { console.error('node-pty no disponible', e.message); }
let term = null;

function parseFrontmatter(txt) {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: txt };
  const meta = {};
  for (const l of m[1].split(/\r?\n/)) {
    const kv = l.match(/^([\w-]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { meta, body: txt.slice(m[0].length) };
}

function walk(dir, rel, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || EXCLUIDAS.has(e.name.toLowerCase())) continue;
    const abs = path.join(dir, e.name), r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(abs, r, out);
    else if (EXT.has(path.extname(e.name).toLowerCase())) out.push({ abs, rel: r });
  }
}

function buildIndex() {
  realPaths.clear();
  const mk = (rel, raw, sigla, abs, externo) => {
    raw = String(raw).replace(/\r\n?/g, '\n');   // apuntes con saltos de línea de Windows (CRLF): se normalizan para que definiciones, tarjetas y búsqueda funcionen igual en todos los sistemas
    const { meta, body } = parseFrontmatter(raw), h1 = body.match(/^#\s+(.+)$/m), base = path.basename(rel, path.extname(rel));
    return { path: rel, base, ext: path.extname(rel).slice(1), title: meta.title || (h1 && h1[1]) || base, sigla: sigla.toUpperCase(), type: meta.type || '', updated: meta.updated || '', meta, body, externo: !!externo, borrador: /NO sale de las diapositivas del profesor/.test(body) };   // borrador = apunte escrito sin material de clase (marca fija en la nota)
  };
  if (!L.esBrain(vault)) {
    // Carpeta de apuntes libre: cada subcarpeta es una asignatura; las rutas «02-Asignaturas/<sigla>/apuntes/…» son virtuales
    const out = [];
    for (const a of L.asignaturasDirs(vault)) for (const f of L.archivos(vault, a.sigla)) {
      const rel = `02-Asignaturas/${a.sigla}/apuntes/${f.rel}`; realPaths.set(rel, f.abs);
      if (f.texto) { let raw = ''; try { if (fs.statSync(f.abs).size < 3 * 1024 * 1024) raw = fs.readFileSync(f.abs, 'utf8'); } catch {} out.push(mk(rel, raw, a.sigla, f.abs, false)); }
      else out.push({ path: rel, base: path.basename(f.rel, path.extname(f.rel)), ext: path.extname(f.rel).slice(1).toLowerCase(), title: path.basename(f.rel), sigla: a.sigla.toUpperCase(), type: '', updated: '', meta: {}, body: '', externo: true });
    }
    return out;
  }
  const files = [];
  walk(path.join(vault, '02-Asignaturas'), '02-Asignaturas', files);
  return files.filter(f => /^02-Asignaturas\/[^/]+\/apuntes\/.+\.md$/i.test(f.rel)).map(f => {
    const n = mk(f.rel, fs.readFileSync(f.abs, 'utf8'), '', f.abs, false);
    n.sigla = (n.meta.sigla || (f.rel.match(/^02-Asignaturas\/([^/]+)/) || [])[1] || '').toUpperCase(); return n;
  });
}

// Carpeta libre: los PDF, Word y PowerPoint aportan su texto (extraído en local y guardado en caché) a la búsqueda y a «Preguntar». Presupuesto de tiempo para no retrasar el arranque: lo que falte se hace en la siguiente carga.
const extraer = require('./extraer');
async function buildIndexAsync() {
  const idx = buildIndex();
  if (L.esBrain(vault)) return idx;   // en un Brain los originales están en _entrada: no se leen fuera de una ingesta
  const cache = path.join(app.getPath('userData'), 'textcache'), t0 = Date.now();
  for (const n of idx) {
    if (!n.externo || n.body || !/^(pdf|docx|pptx)$/i.test(n.ext || '') || Date.now() - t0 > 25000) continue;
    const abs = realPaths.get(n.path); if (!abs) continue;
    const txt = await extraer.extraerTexto(abs, cache); if (txt) { n.body = txt; n.extraido = true; }
  }
  return idx;
}

function watch() {
  if (watcher) watcher.close();
  let t;
  try {
    watcher = fs.watch(vault, { recursive: true }, (_e, name) => {
      if (!name || /(^|\/)(\.|99-Privado|_entrada)/i.test(name)) return;
      clearTimeout(t); t = setTimeout(() => win && win.webContents.send('vault:changed'), 400);
    });
  } catch {}
}

function setVault(p) { vault = p; watch(); }

ipcMain.handle('vault:index', async () => {
  if (!vault) return { ok: false };
  try { return { ok: true, root: vault, modo: L.esBrain(vault) ? 'brain' : 'carpeta', notes: await buildIndexAsync() }; } catch (e) { return { ok: false, error: String(e) }; }
});
ipcMain.handle('file:open', async (e, rel) => { const abs = realPaths.get(rel); if (!fromWin(e) || !abs) return { ok: false }; const err = await shell.openPath(abs); return err ? { ok: false, msg: err } : { ok: true }; });
ipcMain.handle('vault:pick', (e) => { if (fromWin(e) && win) win.webContents.send('ui:editprofile'); });   // «cambiar carpeta» ahora es editar el perfil
// Horario: solo lectura de 01-Curso/calendario*.md y 01-Curso/curso.md del Brain (nombres fijos, nada más)
ipcMain.handle('horario:data', (e) => {
  if (!fromWin(e) || !vault) return { ok: false, msg: 'Sin carpeta del Brain' };
  try {
    const dir = path.join(vault, '01-Curso'), calf = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^calendario[^/\\]*\.md$/i.test(f)).sort()[0] : null;
    if (!calf) return { ok: false, msg: 'No hay calendario en 01-Curso (calendario*.md)' };
    const cur = path.join(dir, 'curso.md');
    return { ok: true, fuente: '01-Curso/' + calf, cal: fs.readFileSync(path.join(dir, calf), 'utf8'), curso: fs.existsSync(cur) ? fs.readFileSync(cur, 'utf8') : '' };
  } catch (err) { return { ok: false, msg: String(err.message || err) }; }
});
ipcMain.handle('dash:move', (e, card, col, nota) => {
  if (!win || win.isDestroyed() || e.sender !== win.webContents || !vault) return { ok: false, msg: 'No permitido' };
  try { const d = new Date(), hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return dashboard.move(vault, card, col, nota || '', hoy); }
  catch (err) { return { ok: false, msg: String(err.message || err) }; }
});
// ---- Avisos: Blackboard (novedades) y entregas cercanas ----
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const abrirAvisos = () => { if (!win || win.isDestroyed()) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); win.webContents.send('ui:avisos'); };
const avisosFile = () => profiles.datos(profile).avisos;
function avisarEntregas() {
  if (!vault || !profile || !Notification.isSupported()) return;
  let hechos = []; try { hechos = JSON.parse(fs.readFileSync(avisosFile(), 'utf8')); } catch {}
  const set = new Set(hechos), hoy = hoyISO(); let nuevos = [];
  try {
    for (const i of dashboard.build(vault, hoy).items) {
      if (!(i.col === 'todo' || i.col === 'doing') || !i.fecha) continue;
      const dias = Math.round((new Date(i.fecha + 'T00:00') - new Date(hoy + 'T00:00')) / 864e5);
      if (dias < 0 || dias > 7) continue;
      const tramo = dias === 0 ? 'hoy' : dias === 1 ? '1' : dias <= 3 ? '3' : '7', key = `${i.sigla}|${i.fecha}|${i.titulo}|${tramo}`;   // un aviso por tramo: 7 días, 3, 1 y hoy
      if (set.has(key)) continue; set.add(key); nuevos.push({ i, dias });
    }
  } catch { return; }
  nuevos.slice(0, 4).forEach(({ i, dias }) => { const n = new Notification({ title: `${i.sigla} · ${i.titulo}`, body: dias === 0 ? `Vence HOY (${i.fecha})` : dias === 1 ? `Vence mañana (${i.fecha})` : `Vence en ${dias} días (${i.fecha})` }); n.on('click', abrirAvisos); n.show(); });
  if (nuevos.length > 4) { const n = new Notification({ title: 'Entregas cercanas', body: `${nuevos.length - 4} más en el dashboard` }); n.on('click', abrirAvisos); n.show(); }
  try { fs.writeFileSync(avisosFile(), JSON.stringify([...set].slice(-300))); } catch {}
}
const revisarBB = (silencioso) => cur.avisos.check({ onClick: abrirAvisos, silencioso }).then(r => { if (win && !win.isDestroyed()) win.webContents.send('bb:changed'); return r; });
const abrirMensajes = () => { if (!win || win.isDestroyed()) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); win.webContents.send('ui:mensajes'); };
const avisaMensajes = () => { if (win && !win.isDestroyed()) win.webContents.send('msg:changed'); };
// segundo plano: solo los contadores de no leídos (1 carga de página); la lista completa se lee al abrir «Mensajes»
const revisarMensajes = (silencioso) => mensajesMod.check({ soloResumen: true, silencioso, onClick: abrirMensajes }).then(r => { avisaMensajes(); return r; });
// Asistente (Ollama local): la pregunta se responde con trozos de los apuntes del perfil activo; el texto sale por 'ia:trozo' y nada va a internet
ipcMain.handle('ia:estado', (e) => (fromWin(e) ? asistenteMod.estado() : { ok: false }));
ipcMain.handle('ia:preguntar', async (e, d) => {
  if (!fromWin(e) || !vault || !d || typeof d !== 'object') return { ok: false, msg: 'No permitido' };
  const hist = (Array.isArray(d.historial) ? d.historial : []).slice(-6).map(m => ({ rol: m && m.rol === 'assistant' ? 'assistant' : 'user', txt: String((m && m.txt) || '').slice(0, 3000) }));
  let notas; try { notas = await buildIndexAsync(); } catch (err) { return { ok: false, msg: 'No se pudieron leer los apuntes' }; }
  return asistenteMod.preguntar({ id: String(d.id || '').slice(0, 40), pregunta: String(d.pregunta || ''), sigla: String(d.sigla || '').slice(0, 20), modelo: String(d.modelo || ''), proveedor: d.proveedor === 'gemini' ? 'gemini' : 'ollama', historial: hist }, notas, (m) => { if (win && !win.isDestroyed()) win.webContents.send('ia:trozo', m); });
});
ipcMain.handle('ia:clave', (e, k) => (fromWin(e) ? asistenteMod.guardarClave(k) : { ok: false, msg: 'No permitido' }));
ipcMain.handle('ia:clave-quitar', (e) => (fromWin(e) ? asistenteMod.quitarClave() : { ok: false }));
// Enlaces del campus (Ajustes): lista de {nombre, url} por perfil, en la carpeta de datos de la app; solo https y se abren en el navegador del sistema
const enlacesFile = () => (profile ? profiles.datos(profile).enlaces : null);
function leerEnlaces() { try { const l = JSON.parse(fs.readFileSync(enlacesFile(), 'utf8')); return Array.isArray(l) ? l.filter(x => x && typeof x.url === 'string') : []; } catch { return []; } }
ipcMain.handle('enl:lista', (e) => (fromWin(e) && profile ? { ok: true, campus: /^https:\/\//i.test(profile.campusUrl || '') ? profile.campusUrl : '', lista: leerEnlaces() } : { ok: false }));
ipcMain.handle('enl:guardar', (e, lista) => {
  if (!fromWin(e) || !profile || !Array.isArray(lista)) return { ok: false, msg: 'No permitido' };
  const out = [];
  for (const x of lista.slice(0, 60)) {
    let u; try { u = new URL(String((x && x.url) || '').trim()); } catch { return { ok: false, msg: 'Hay un enlace que no es una dirección válida' }; }
    if (u.protocol !== 'https:') return { ok: false, msg: 'Solo se admiten enlaces https://' };
    out.push({ nombre: String((x && x.nombre) || '').trim().slice(0, 80) || u.hostname, url: u.href.slice(0, 600) });
  }
  try { fs.writeFileSync(enlacesFile(), JSON.stringify(out, null, 1)); } catch (err) { return { ok: false, msg: 'No se pudo guardar: ' + String(err.message || err) }; }
  return { ok: true, lista: out };
});
ipcMain.handle('ia:tarea', (e, d) => (fromWin(e) && d && typeof d === 'object' ? asistenteMod.tarea({ tipo: String(d.tipo || ''), texto: String(d.texto || ''), proveedor: d.proveedor === 'gemini' ? 'gemini' : 'ollama', modelo: String(d.modelo || '') }) : { ok: false, msg: 'No permitido' }));
// Exportar a calendario (.ics): entregas y exámenes pendientes de los próximos meses, con aviso el día anterior. Solo escribe el archivo que eliges.
const icsTxt = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function construyeIcs(items, hoy) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Brain//Entregas//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Brain · entregas y exámenes'], stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  let n = 0;
  for (const i of items) {
    if (!i.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(i.fecha) || i.fecha < hoy || (i.col !== 'todo' && i.col !== 'doing' && i.col !== 'sent') || i.tipo === 'calendario' || i.tipo === 'tarea' || (i.titulo || '').length > 90) continue;
    const d = i.fecha.replace(/-/g, ''), h = /^\d{1,2}:\d{2}$/.test(i.hora || '') ? i.hora.padStart(5, '0').replace(':', '') + '00' : '';
    const fin = (() => { const x = new Date(i.fecha + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10).replace(/-/g, ''); })();
    L.push('BEGIN:VEVENT', `UID:brain-${require('crypto').createHash('sha1').update(i.sigla + '|' + i.fecha + '|' + i.titulo).digest('hex').slice(0, 16)}@brain`, `DTSTAMP:${stamp}`,
      h ? `DTSTART:${d}T${h}` : `DTSTART;VALUE=DATE:${d}`, h ? `DTEND:${d}T${String(Math.min(23, parseInt(h.slice(0, 2), 10) + 1)).padStart(2, '0')}${h.slice(2)}` : `DTEND;VALUE=DATE:${fin}`,
      `SUMMARY:${icsTxt(`[${i.sigla}] ${i.titulo}`)}`, `DESCRIPTION:${icsTxt(`${i.tipo ? i.tipo + ' · ' : ''}estado: ${i.col === 'sent' ? 'entregado, pendiente de nota' : i.col === 'doing' ? 'en curso' : 'por hacer'}`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Mañana: ' + icsTxt(i.titulo), 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT'); n++;
  }
  L.push('END:VCALENDAR'); return { texto: L.join('\r\n') + '\r\n', n };
}
ipcMain.handle('ics:exportar', async (e) => {
  if (!fromWin(e) || !vault) return { ok: false, msg: 'No permitido' };
  try {
    const d = new Date(), hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, r = dashboard.build(vault, hoy), { texto, n } = construyeIcs(r.items || [], hoy);
    if (!n) return { ok: false, msg: 'No hay entregas ni exámenes pendientes con fecha para exportar.' };
    const sel = await dialog.showSaveDialog(win, { title: 'Guardar calendario', defaultPath: path.join(app.getPath('documents'), 'Brain-entregas.ics'), filters: [{ name: 'Calendario (.ics)', extensions: ['ics'] }] });
    if (sel.canceled || !sel.filePath) return { ok: false, cancelado: true };
    fs.writeFileSync(sel.filePath, texto, 'utf8'); return { ok: true, ruta: sel.filePath, n };
  } catch (err) { return { ok: false, msg: String(err.message || err) }; }
});
// Guardar una respuesta/resumen de la IA como apunte nuevo (la app pide confirmación antes; ver guardar-apunte.js)
ipcMain.handle('nota:guardar', (e, d) => {
  if (!fromWin(e) || !vault || !d || typeof d !== 'object') return { ok: false, msg: 'No permitido' };
  const asig = L.asignaturasDirs(vault).find(a => a.sigla === String(d.sigla || '').toLowerCase()); if (!asig) return { ok: false, msg: 'Elige una asignatura.' };
  const hoy = new Date(), iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  const r = require('./guardar-apunte').guardarApunte({ vault, esBrain: L.esBrain(vault), asig, d: { titulo: d.titulo, cuerpo: d.cuerpo, fuentes: d.fuentes, origen: d.origen }, hoy: iso });
  if (r.ok && win && !win.isDestroyed()) win.webContents.send('vault:changed');
  return r.ok ? { ok: true, ruta: r.ruta } : r;
});
// Diagnóstico: registro local de errores (userData/brain.log) e informe que el usuario puede copiar. No se envía nada.
const diag = require('./diagnostico'), logFile = () => path.join(app.getPath('userData'), 'brain.log');
const logError = (tag, e) => diag.logLinea(logFile(), 'error', tag, (e && e.stack) || e);
process.on('uncaughtException', (e) => logError('main', e));
process.on('unhandledRejection', (e) => logError('promesa', e));
let erroresVentana = 0;
ipcMain.on('log:error', (e, msg) => { if (fromWin(e) && erroresVentana++ < 60) diag.logLinea(logFile(), 'error', 'ventana', String(msg || '').slice(0, 1500)); });
ipcMain.handle('diag:informe', async (e) => {
  if (!fromWin(e)) return { ok: false };
  let campus = ''; try { campus = profile && profile.campusUrl ? new URL(profile.campusUrl).hostname : ''; } catch {}
  const ia = await asistenteMod.estado().catch(() => null), nt = (cur.ingesta.notasEstado && cur.ingesta.notasEstado()) || {}, bbs = (cur.avisos.state && cur.avisos.state()) || {}, ms = (mensajesMod.state && mensajesMod.state()) || {};
  const info = { version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, plataforma: process.platform, arquitectura: process.arch, so: os_release(), idioma: app.getLocale(),
    perfil: { tipo: profile ? profiles.tipoDe(profile) : '', modo: vault ? (L.esBrain(vault) ? 'Brain' : 'carpeta libre') : '—', campus, pin: !!(profile && profiles.vista && profiles.vista(profile).hasPin) },
    estados: { 'Avisos': bbs.status || '—', 'Mensajes': ms.status || '—', 'Notas de Blackboard': nt.status ? `${nt.status}${nt.leido ? ' · leído ' + nt.leido : ''}` : '—' },
    ia: { 'Gemini (clave guardada)': ia && ia.gemini && ia.gemini.clave ? 'sí' : 'no', 'Ollama': ia && ia.ollama && ia.ollama.ok ? 'en marcha' : 'no detectado' } };
  return { ok: true, texto: diag.construyeInforme(info, diag.ultimasLineas(logFile(), 40)) };
});
ipcMain.handle('diag:carpeta', (e) => { if (fromWin(e)) shell.showItemInFolder(fs.existsSync(logFile()) ? logFile() : app.getPath('userData')); });
const os_release = () => { try { return require('os').release(); } catch { return ''; } };
// Actualizaciones: buscar/descargar la versión nueva desde los Releases de GitHub con un token de solo lectura (cifrado con el llavero; nunca llega a la ventana)
const actualizarMod = require('./actualizar');
const actFile = () => (profile ? profiles.datos(profile).act : null);
let actToken = '';   // si no hay llavero: solo en memoria
const actLee = async () => { let j = {}; try { j = JSON.parse(fs.readFileSync(actFile(), 'utf8')); } catch {} let token = actToken; if (!token && j.token) { try { const { safeStorage } = require('electron'); if (await safeStorage.isAsyncEncryptionAvailable()) token = (await safeStorage.decryptStringAsync(Buffer.from(j.token, 'base64'))).result; } catch {} } return { repo: j.repo || actualizarMod.REPO_DEFECTO, token, propio: !!j.repo }; };
// Ajustes del perfil que necesita el proceso principal (p. ej. avisar de notas nuevas). Solo claves conocidas.
const AJUSTES_OK = { avisoNotas: 'boolean', atajoRapido: 'boolean' };
const TEMAS = { auto: 'system', claro: 'light', oscuro: 'dark' };
const leeAjustes = () => { let j = {}; try { j = JSON.parse(fs.readFileSync(profiles.datos(profile).ajustes, 'utf8')); } catch {} return { avisoNotas: j.avisoNotas !== false, atajoRapido: j.atajoRapido === true, tema: TEMAS[j.tema] ? j.tema : 'auto' }; };
const aplicaTema = () => { try { nativeTheme.themeSource = profile ? TEMAS[leeAjustes().tema] : 'system'; } catch {} };   // el tema elegido cambia también el color de la ventana y la preferencia del sistema que ve la página   // avisoNotas: activado salvo que se apague
ipcMain.handle('ajustes:get', (e) => (fromWin(e) && profile ? { ok: true, ...leeAjustes() } : { ok: false }));
ipcMain.handle('ajustes:set', (e, patch) => {
  if (!fromWin(e) || !profile || !patch || typeof patch !== 'object') return { ok: false }; const a = leeAjustes();
  for (const [k, t] of Object.entries(AJUSTES_OK)) if (typeof patch[k] === t) a[k] = patch[k];
  if (TEMAS[patch.tema]) a.tema = patch.tema;
  try { fs.writeFileSync(profiles.datos(profile).ajustes, JSON.stringify(a)); } catch (err) { return { ok: false, msg: String(err.message || err) }; }
  aplicaTema(); return { ok: true, ...a, atajoOk: aplicaAtajo() };
});
// Aviso de notas nuevas: relee las notas de Blackboard cada 3 h (y a los 2 min de abrir) y avisa de las que son nuevas o han cambiado
async function revisarNotas() {
  if (!vault || !profile || !cur.ingesta.notasLeer || !leeAjustes().avisoNotas) return;
  const r = await cur.ingesta.notasLeer(vault).catch(() => null); if (!r || !r.ok || !r.cambios || !r.cambios.length) return;
  try { if (Notification.isSupported()) { const n = new Notification({ title: r.cambios.length > 1 ? `${r.cambios.length} notas nuevas en Blackboard` : 'Nota nueva en Blackboard', body: r.cambios.slice(0, 3).map(c => `${String(c.sigla).toUpperCase()}: ${c.nombre} → ${c.notaTexto}${c.antes ? ' (antes ' + c.antes + ')' : ''}`).join('\n') }); n.on('click', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); win.webContents.send('ui:notas'); } }); n.show(); } } catch {}
  if (win && !win.isDestroyed()) win.webContents.send('notas:cambio');
}
// Captura rápida (atajo global opcional): ventana pequeña para apuntar una duda o un apunte suelto sin abrir la app entera
const rapidaMod = require('./rapida'), { globalShortcut } = require('electron');
let rapidaWin = null; const ATAJO = 'CommandOrControl+Alt+N';
const dudasInboxFile = () => path.join(app.getPath('userData'), 'dudas-inbox' + (profile && profile.id !== 'default' ? '-' + profile.id : '') + '.json');
function abreRapida() {
  if (!profile || !vault) return; if (rapidaWin && !rapidaWin.isDestroyed()) { rapidaWin.show(); rapidaWin.focus(); return; }
  rapidaWin = new BrowserWindow({ width: 520, height: 300, title: 'Captura rápida', alwaysOnTop: true, autoHideMenuBar: true, minimizable: false, maximizable: false, webPreferences: { preload: path.join(__dirname, 'rapida-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  rapidaWin.loadFile(path.join(__dirname, 'rapida.html')); rapidaWin.on('closed', () => { rapidaWin = null; });
}
function aplicaAtajo() {
  try { globalShortcut.unregister(ATAJO); } catch {}
  if (!profile) return false; let ok = false; try { if (leeAjustes().atajoRapido) ok = globalShortcut.register(ATAJO, abreRapida); } catch {} return ok;
}
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch {} });
const deRapida = (e) => rapidaWin && !rapidaWin.isDestroyed() && e.sender === rapidaWin.webContents;
ipcMain.handle('rapida:asignaturas', (e) => (deRapida(e) && vault ? L.asignaturasDirs(vault).map(a => ({ sigla: a.sigla, nombre: a.nombre })) : []));
ipcMain.handle('rapida:guardar', (e, d) => {
  if (!deRapida(e) || !vault || !d) return { ok: false, msg: 'No permitido' }; const texto = String(d.texto || '').trim().slice(0, 8000); if (texto.length < 3) return { ok: false, msg: 'Escribe algo.' };
  const sigla = String(d.sigla || '').toLowerCase(), asig = sigla ? L.asignaturasDirs(vault).find(a => a.sigla === sigla) : null;
  if (d.tipo === 'duda') { const hoy = new Date(); rapidaMod.anadeDuda(dudasInboxFile(), { texto: texto.slice(0, 300), sigla: asig ? asig.sigla : '', fecha: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}` }); if (win && !win.isDestroyed()) win.webContents.send('dudas:inbox'); return { ok: true }; }
  if (!asig) return { ok: false, msg: 'Elige una asignatura para el apunte rápido.' };
  const r = rapidaMod.guardaCaptura({ vault, esBrain: L.esBrain(vault), asig, texto }); if (r.ok && win && !win.isDestroyed()) win.webContents.send('vault:changed'); return r;
});
ipcMain.on('rapida:cerrar', (e) => { if (deRapida(e)) rapidaWin.close(); });
ipcMain.handle('rapida:abrir', (e) => { if (fromWin(e)) abreRapida(); });
ipcMain.handle('dudas:inbox', (e) => (fromWin(e) && profile ? { ok: true, dudas: rapidaMod.sacaDudas(dudasInboxFile()) } : { ok: false, dudas: [] }));
ipcMain.handle('act:estado', async (e) => { if (!fromWin(e) || !profile) return { ok: false }; const c = await actLee(); return { ok: true, repo: c.repo, token: !!c.token, propio: c.propio, version: app.getVersion(), plataforma: process.platform, empaquetada: app.isPackaged, puedeInstalar: !!instalarMod.zipDeSistema(process.platform, process.arch) }; });
ipcMain.handle('act:guardar', async (e, d) => {
  if (!fromWin(e) || !profile || !d) return { ok: false, msg: 'No permitido' };
  const repo = String(d.repo || '').trim() || actualizarMod.REPO_DEFECTO, prev = await actLee(), token = String(d.token || '').trim() || prev.token;   // el token es opcional (solo para repositorios privados)
  if (!actualizarMod.REPO_RE.test(repo)) return { ok: false, msg: 'Escribe el repositorio como usuario/repositorio.' };
  const r = await actualizarMod.buscar({ repo, token, version: app.getVersion(), plataforma: process.platform, arch: process.arch }); if (!r.ok) return r;   // se comprueba con GitHub antes de guardar
  let cifrado = ''; if (token) { try { const { safeStorage } = require('electron'); if (await safeStorage.isAsyncEncryptionAvailable()) cifrado = (await safeStorage.encryptStringAsync(token)).toString('base64'); } catch {} }
  try { fs.writeFileSync(actFile(), JSON.stringify({ repo, ...(cifrado ? { token: cifrado } : {}) }), { mode: 0o600 }); } catch {} actToken = cifrado ? '' : token;
  return { ok: true, persistente: !!cifrado, ...r };
});
ipcMain.handle('act:quitar', async (e) => { if (fromWin(e) && profile) { actToken = ''; try { const c = await actLee(); if (c.propio) fs.writeFileSync(actFile(), JSON.stringify({ repo: c.repo }), { mode: 0o600 }); else fs.rmSync(actFile(), { force: true }); } catch {} } return { ok: true }; });   // quita solo el token; el repositorio elegido se conserva
ipcMain.handle('act:buscar', async (e) => { if (!fromWin(e) || !profile) return { ok: false, msg: 'No permitido' }; const c = await actLee(); return actualizarMod.buscar({ repo: c.repo, token: c.token, version: app.getVersion(), plataforma: process.platform, arch: process.arch }); });
let actCtl = null;
ipcMain.handle('act:descargar', async (e, asset) => {
  if (!fromWin(e) || !profile || actCtl) return { ok: false, msg: actCtl ? 'Ya hay una descarga en curso.' : 'No permitido' };
  const c = await actLee();
  actCtl = new AbortController(); let ult = 0;
  try { return await actualizarMod.descargar({ repo: c.repo, token: c.token, asset: asset && { id: asset.id, name: asset.name, size: asset.size, digest: asset.digest }, carpeta: app.getPath('downloads'), signal: actCtl.signal, onProgreso: (h, t) => { if (win && !win.isDestroyed() && Date.now() - ult > 250) { ult = Date.now(); win.webContents.send('act:progreso', { hecho: h, total: t }); } } }); }
  finally { actCtl = null; }
});
// Instalar la versión descargada (ver instalar.js): ahora (cierra la app, sustituye y reabre) o al cerrar la app. Solo acepta el .zip de este sistema dentro de Descargas.
const instalarMod = require('./instalar');
let pendiente = null, instalacionLanzada = false;
const logInst = () => path.join(app.getPath('userData'), 'brain-update.log');
const zipPropio = (ruta) => { try { const r = path.resolve(String(ruta || '')), d = path.resolve(app.getPath('downloads')); return r.startsWith(d + path.sep) && instalarMod.ZIP_RE.test(path.basename(r)) ? r : ''; } catch { return ''; } };
const preparaInstalacion = (ruta, esperada) => instalarMod.preparar({ plat: process.platform, arch: process.arch, zip: ruta, esperada: String(esperada || ''), exe: process.execPath, empaquetada: app.isPackaged, temp: app.getPath('temp') });
const quitaPendiente = () => { if (pendiente) { try { fs.rmSync(pendiente.stage, { recursive: true, force: true }); } catch {} pendiente = null; } };
ipcMain.handle('act:instalar', async (e, ruta, esperada) => {
  if (!fromWin(e) || instalacionLanzada) return { ok: false, msg: 'No permitido' }; const zip = zipPropio(ruta); if (!zip) return { ok: false, msg: 'El fichero no está en Descargas o no es el de este sistema.' };
  quitaPendiente(); const p = await preparaInstalacion(zip, esperada); if (!p.ok) return p;
  instalarMod.lanzar({ plat: process.platform, script: p.script, nueva: p.nueva, dest: p.dest, stage: p.stage, pid: process.pid, relanzar: true, log: logInst() }); instalacionLanzada = true;
  setTimeout(() => app.quit(), 500); return { ok: true };
});
ipcMain.handle('act:instalar-al-cerrar', async (e, on, ruta, esperada) => {
  if (!fromWin(e)) return { ok: false }; quitaPendiente(); if (!on) return { ok: true, on: false };
  const zip = zipPropio(ruta); if (!zip) return { ok: false, msg: 'El fichero no está en Descargas o no es el de este sistema.' }; const p = await preparaInstalacion(zip, esperada); if (!p.ok) return p; pendiente = p; return { ok: true, on: true };
});
app.on('before-quit', () => { if (pendiente && !instalacionLanzada) { instalacionLanzada = true; try { instalarMod.lanzar({ plat: process.platform, script: pendiente.script, nueva: pendiente.nueva, dest: pendiente.dest, stage: pendiente.stage, pid: process.pid, relanzar: false, log: logInst() }); } catch (err) { logError('instalar', err); } } });
app.whenReady().then(() => instalarMod.limpiaRestos(app.getPath('temp')));
ipcMain.handle('act:cancelar', (e) => { if (fromWin(e) && actCtl) actCtl.abort(); });
ipcMain.handle('act:mostrar', (e, ruta) => { if (fromWin(e) && typeof ruta === 'string' && path.resolve(ruta).startsWith(path.resolve(app.getPath('downloads')))) shell.showItemInFolder(ruta); });
// Guardar/abrir un fichero de texto elegido por el usuario (exportar a Anki, copia de seguridad de los datos de la app). Solo extensiones de texto y hasta 8 MB.
const EXT_TEXTO = { json: 'JSON', txt: 'Texto', csv: 'CSV', tsv: 'TSV', ics: 'Calendario' };
ipcMain.handle('texto:guardar', async (e, d) => {
  if (!fromWin(e) || !d || typeof d.texto !== 'string' || d.texto.length > 8 * 1024 * 1024) return { ok: false, msg: 'No permitido' };
  const ext = String(d.extension || 'txt').toLowerCase(); if (!EXT_TEXTO[ext]) return { ok: false, msg: 'Tipo de fichero no permitido' };
  const nombre = String(d.nombre || 'brain.' + ext).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
  try {
    const sel = await dialog.showSaveDialog(win, { title: String(d.titulo || 'Guardar').slice(0, 80), defaultPath: path.join(app.getPath('documents'), nombre), filters: [{ name: EXT_TEXTO[ext], extensions: [ext] }] });
    if (sel.canceled || !sel.filePath) return { ok: false, cancelado: true };
    fs.writeFileSync(sel.filePath, d.texto, 'utf8'); return { ok: true, ruta: sel.filePath };
  } catch (err) { return { ok: false, msg: String(err.message || err) }; }
});
ipcMain.handle('texto:abrir', async (e, d) => {
  if (!fromWin(e)) return { ok: false, msg: 'No permitido' }; const ext = String((d && d.extension) || 'json').toLowerCase(); if (!EXT_TEXTO[ext]) return { ok: false, msg: 'Tipo de fichero no permitido' };
  try {
    const sel = await dialog.showOpenDialog(win, { title: String((d && d.titulo) || 'Abrir').slice(0, 80), properties: ['openFile'], filters: [{ name: EXT_TEXTO[ext], extensions: [ext] }] });
    if (sel.canceled || !sel.filePaths[0]) return { ok: false, cancelado: true };
    const st = fs.statSync(sel.filePaths[0]); if (st.size > 8 * 1024 * 1024) return { ok: false, msg: 'El fichero es demasiado grande.' };
    return { ok: true, texto: fs.readFileSync(sel.filePaths[0], 'utf8'), nombre: path.basename(sel.filePaths[0]) };
  } catch (err) { return { ok: false, msg: String(err.message || err) }; }
});
ipcMain.handle('ia:cancelar', (e, id) => { if (fromWin(e)) asistenteMod.cancelar(String(id || '')); });
// Notas del curso leídas de Blackboard (solo lectura); sin Blackboard la pantalla usa las del Brain
ipcMain.handle('notas:state', () => (cur.ingesta.notasEstado ? cur.ingesta.notasEstado() : { status: 'no-aplica' }));
ipcMain.handle('notas:leer', (e) => (fromWin(e) && vault && cur.ingesta.notasLeer ? cur.ingesta.notasLeer(vault) : { ok: false, msg: 'Las notas de Blackboard solo están disponibles con un campus Blackboard' }));
ipcMain.handle('msg:state', () => mensajesMod.state());
ipcMain.handle('msg:check', (e) => (fromWin(e) ? mensajesMod.check({ silencioso: true, onCambio: avisaMensajes }).then(r => { avisaMensajes(); return r; }) : null));   // lectura completa, la pide la pantalla
ipcMain.handle('msg:hilo', (e, courseId, convId, total, forzar) => (fromWin(e) ? mensajesMod.hilo(String(courseId), String(convId), Number(total) || 1, !!forzar).then(r => { avisaMensajes(); return r; }) : { ok: false, msg: 'No permitido' }));
ipcMain.handle('msg:dest', (e, courseId, q) => (fromWin(e) ? mensajesMod.destinatarios(String(courseId), String(q || '')) : { ok: false, msg: 'No permitido' }));
ipcMain.handle('msg:red-cerrar', (e) => { if (fromWin(e)) mensajesMod.redaccionCerrar(); });
ipcMain.handle('msg:enviar', async (e, d) => {   // solo desde la ventana de la app, con lo que el usuario ha confirmado en pantalla
  if (!fromWin(e)) return { ok: false, enviado: false, msg: 'No permitido' };
  const r = await mensajesMod.enviar(d && typeof d === 'object' ? { courseId: String(d.courseId), destinatarios: d.destinatarios, texto: d.texto, copia: !!d.copia } : null);
  if (r.enviado === true || r.enviado === 'desconocido') mensajesMod.check({ silencioso: true, onCambio: avisaMensajes }).then(avisaMensajes);   // se vuelve a leer la lista para ver el mensaje nuevo
  return r;
});
ipcMain.handle('msg:login', (e) => { if (fromWin(e)) mensajesMod.abrir(() => { mensajesMod.check({ silencioso: true, onCambio: avisaMensajes }).then(avisaMensajes); }); });
ipcMain.handle('bbi:scan', (e) => (fromWin(e) && vault ? cur.ingesta.escanear(vault, hoyISO()) : { ok: false, msg: 'No permitido' }));
ipcMain.handle('bbi:apply', (e, f, c, d) => (fromWin(e) && vault ? cur.ingesta.aplicar(vault, hoyISO(), Array.isArray(f) ? f : [], Array.isArray(c) ? c : [], Array.isArray(d) ? d : []) : { ok: false, msg: 'No permitido' }));
ipcMain.handle('bbi:cancel', (e) => { if (fromWin(e)) cur.ingesta.cancelar(); });
ipcMain.handle('bb:state', () => cur.avisos.state());
ipcMain.handle('bb:check', (e) => (fromWin(e) ? revisarBB(true) : null));   // revisión manual: sin notificación del sistema, el resultado se ve en pantalla
// Un único inicio de sesión (desde Ajustes) vale para Avisos, Mensajes, Notas e Ingestar novedades: comparten la sesión del perfil. Al cerrar la ventana se revisa todo y se avisa a la pantalla.
ipcMain.handle('bb:login', (e) => { if (fromWin(e)) cur.avisos.abrir(() => { revisarBB(true); mensajesMod.check({ silencioso: true, onCambio: avisaMensajes }).then(avisaMensajes).catch(() => {}); if (win && !win.isDestroyed()) win.webContents.send('ui:sesion'); }); });
ipcMain.handle('bb:seen', (e) => (fromWin(e) ? cur.avisos.marcarVistas() : null));

// ---- Perfiles: inicio de sesión local, alta/edición/baja y selector de carpeta ----
function activar(p) {
  desactivar(); profile = p; profiles.marcarUltimo(p.id);
  const d = profiles.datos(p), asig = () => cursosMod.asignaturas(p.vault);
  cur = campusMod.para(profiles.tipoDe(p));
  cur.avisos.init({ campus: p.campusUrl, icalUrl: p.icalUrl || '', partition: d.partition, stateFile: d.bbState, asignaturas: asig });
  cur.ingesta.init({ campus: p.campusUrl, icalUrl: p.icalUrl || '', partition: d.partition, ingestaFile: d.bbIngesta, notasFile: d.notas });
  asistenteMod.init({ keyFile: d.ia });   // la clave de Gemini es de cada perfil
  mensajesMod.init({ activo: profiles.tipoDe(p) === 'blackboard', campus: p.campusUrl, partition: d.partition, stateFile: d.mensajes, asignaturas: asig });
  cur.ingesta.setProgreso(prog => { if (win && !win.isDestroyed()) win.webContents.send('bbi:progress', prog); });   // progreso de descargas grandes (vídeos)
  setVault(p.vault);
  timers.push(setTimeout(() => { avisarEntregas(); revisarBB(false); }, 20000), setTimeout(() => revisarMensajes(true), 60000), setTimeout(revisarNotas, 120000), setInterval(revisarNotas, 3 * 60 * 60 * 1000), setInterval(avisarEntregas, 60 * 60 * 1000), setInterval(() => revisarBB(false), 30 * 60 * 1000), setInterval(() => revisarMensajes(false), 30 * 60 * 1000));
  lanzaSync();
  aplicaAtajo(); aplicaTema();
}
// git pull del perfil recién activado; si la ventana aún no ha cargado se llama desde did-finish-load
function lanzaSync() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('sync:start'); sync().then(r => { if (win && !win.isDestroyed()) { win.webContents.send('sync:done', r); if (r.changed) win.webContents.send('vault:changed'); } });
}
function desactivar() {
  timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = [];
  if (term) { try { term.kill(); } catch {} term = null; }
  if (watcher) { try { watcher.close(); } catch {} watcher = null; }
  profile = null; vault = null;
  if (typeof aplicaAtajo === 'function') { aplicaAtajo(); aplicaTema(); }   // sin perfil activo no hay atajo global ni tema propio
  if (typeof rapidaWin !== 'undefined' && rapidaWin && !rapidaWin.isDestroyed()) rapidaWin.close();
}
const estadoPerfiles = () => ({ profiles: profiles.lista(), current: profile ? profile.id : null, last: profiles.ultimo(), active: profile ? profiles.vista(profile) : null });
const ok = (extra) => ({ ok: true, ...extra }), ko = (e) => ({ ok: false, msg: String(e && e.message || e) });
ipcMain.handle('prof:state', (e) => (fromWin(e) ? estadoPerfiles() : null));
ipcMain.handle('prof:login', async (e, id, pin) => {
  if (!fromWin(e)) return ko('No permitido');
  const p = profiles.buscar(id); if (!p) return ko('Perfil no encontrado');
  if (pinFallos >= 5) { await sleep(Math.min(30000, 2000 * (pinFallos - 4))); }   // freno suave contra probar PIN uno tras otro
  if (!profiles.pinOk(p, pin)) { pinFallos++; return ko('PIN incorrecto'); }
  if (!profiles.esDir(p.vault)) return ko('La carpeta del Brain de este perfil ya no existe: edítala para elegir otra');
  pinFallos = 0; activar(p); return ok(estadoPerfiles());
});
ipcMain.handle('prof:create', (e, d) => { if (!fromWin(e)) return ko('No permitido'); try { const p = profiles.crear(d || {}); return ok({ id: p.id }); } catch (err) { return ko(err); } });
ipcMain.handle('prof:update', (e, id, d, pinActual) => {
  if (!fromWin(e)) return ko('No permitido');
  try { const p = profiles.editar(id, d || {}, pinActual); if (profile && profile.id === id) activar(p); return ok(estadoPerfiles()); } catch (err) { return ko(err); }
});
ipcMain.handle('prof:delete', (e, id, pin) => {
  if (!fromWin(e)) return ko('No permitido');
  try { const p = profiles.borrar(id, pin); try { session.fromPartition(profiles.datos(p).partition).clearStorageData(); } catch {} if (profile && profile.id === id) desactivar(); return ok(estadoPerfiles()); } catch (err) { return ko(err); }
});
ipcMain.handle('prof:logout', (e) => { if (!fromWin(e)) return; desactivar(); win.webContents.reload(); });
ipcMain.handle('prof:pickFolder', async (e) => {
  if (!fromWin(e)) return null;
  const r = await dialog.showOpenDialog(win, { title: 'Elige la carpeta de tu Brain', properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : { path: r.filePaths[0], tieneBrain: profiles.tieneBrain(r.filePaths[0]) };
});
// Carpeta nueva o sin estructura: se crea 02-Asignaturas/ (lo único que la app necesita). Solo si la carpeta existe; nunca borra nada.
ipcMain.handle('prof:initBrain', (e, p) => { if (!fromWin(e)) return ko('No permitido'); try { if (!profiles.esDir(p)) throw new Error('La carpeta no existe'); fs.mkdirSync(path.join(p, '02-Asignaturas'), { recursive: true }); return ok(); } catch (err) { return ko(err); } });
ipcMain.handle('subjects', (e) => (fromWin(e) && vault ? cursosMod.asignaturas(vault).map(a => ({ ...a, libre: !L.esBrain(vault) })) : []));
ipcMain.handle('subj:add', (e, sigla, nombre) => {
  if (!fromWin(e) || !vault) return ko('No permitido');
  try {
    if (!L.esBrain(vault)) {   // carpeta libre: una asignatura es una subcarpeta
      const nom = String(nombre || sigla || '').trim().replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').slice(0, 60); if (!nom || /^\.+$/.test(nom)) throw new Error('Indica el nombre de la asignatura');
      const d = path.join(vault, nom); if (fs.existsSync(d)) throw new Error('Esa carpeta ya existe'); fs.mkdirSync(d); return ok();
    }
    const s = String(sigla || '').trim().toLowerCase(), n = String(nombre || '').trim().slice(0, 80);
    if (!/^[a-z0-9_-]{1,12}$/.test(s)) throw new Error('La sigla debe tener entre 1 y 12 letras, números, - o _');
    if (!n) throw new Error('Indica el nombre de la asignatura');
    const dir = path.join(vault, '02-Asignaturas', s); if (fs.existsSync(path.join(dir, s + '.md'))) throw new Error('Esa asignatura ya existe');
    for (const d of ['apuntes', 'entregas', 'recursos']) fs.mkdirSync(path.join(dir, d), { recursive: true });
    const hoy = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(path.join(dir, s + '.md'), `---\ntype: asignatura\nsigla: "${s.toUpperCase()}"\ntitle: "${n.replace(/"/g, "'")}"\ncurso:\nstatus: pendiente\nupdated: ${hoy}\n---\n## Evaluación\n- ${s.toUpperCase()}, criterios y pesos de evaluación: [pendiente]\n\n## Entregas y exámenes\n- ${s.toUpperCase()}, entregas programadas: [pendiente]\n\n## Registro de cambios\n- ${hoy} ficha creada desde la app\n`);
    return ok();
  } catch (err) { return ko(err); }
});

ipcMain.handle('dash:add', (e, d) => {
  if (!win || win.isDestroyed() || e.sender !== win.webContents || !vault) return { ok: false, msg: 'No permitido' };
  try { return { ok: true, ...dashboard.addEntrega(vault, d || {}, hoyISO()) }; } catch (err) { return { ok: false, msg: String(err.message || err) }; }
});
// Dashboard nativo: se recalcula en cada petición a partir de los ficheros del Brain (solo lectura)
ipcMain.handle('dash:data', () => {
  if (!vault) return { error: 'Sin carpeta del Brain' };
  try {
    const d = new Date(), hoy = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, r = dashboard.build(vault, hoy);
    if (!r.ultimaActualizacion && !L.esBrain(vault)) {   // carpeta libre: sin campo «updated», vale la fecha de modificación de los apuntes
      let max = 0; for (const a of L.asignaturasDirs(vault)) for (const f of L.archivos(vault, a.sigla)) { try { max = Math.max(max, fs.statSync(f.abs).mtimeMs); } catch {} }
      if (max) r.ultimaActualizacion = new Date(max).toISOString().slice(0, 10);
    }
    return r;
  }
  catch (e) { return { error: String(e.message || e) }; }
});

// ---- Sincronización con GitHub (git pull --ff-only con reintentos; el DNS puede no estar listo al abrir) ----
const IS_MAC = process.platform === 'darwin', IS_WIN = process.platform === 'win32';
// Ruta de git: en macOS el del sistema; en Windows, si no está en el PATH (una app abierta desde el Explorador no siempre lo ve), se prueban las instalaciones habituales
// (Git for Windows, instalación por usuario y el git que incluye GitHub Desktop); si no, `git` a secas
function buscaGit(plat = process.platform, env = process.env, existe = fs.existsSync, lista = (d) => { try { return fs.readdirSync(d); } catch { return []; } }) {
  if (plat === 'darwin') return '/usr/bin/git';
  if (plat !== 'win32') return 'git';
  const pf = env.ProgramFiles || 'C:\\Program Files', pf86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', la = env.LOCALAPPDATA || '';
  const c = [path.join(pf, 'Git', 'cmd', 'git.exe'), path.join(pf86, 'Git', 'cmd', 'git.exe'), la && path.join(la, 'Programs', 'Git', 'cmd', 'git.exe')];
  if (la) for (const a of lista(path.join(la, 'GitHubDesktop')).filter(n => /^app-/.test(n)).sort().reverse()) c.push(path.join(la, 'GitHubDesktop', a, 'resources', 'app', 'git', 'cmd', 'git.exe'));
  for (const ruta of c) if (ruta && existe(ruta)) return ruta;
  return 'git';
}
const GIT = buscaGit();
const git = (args, timeout = 60000) => new Promise(res => execFile(GIT, args, { cwd: vault, timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
  (err, so, se) => res({ err, out: ((so || '') + (se || '')).trim() })));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Conectar el móvil (Ajustes): repositorio y rama del Brain para mostrarlos como QR. Solo eso: nunca credenciales ni tokens.
const enlaceMod = require('./enlace');
ipcMain.handle('movil:enlace', async (e) => {
  if (!fromWin(e)) return { ok: false };
  if (!vault) return { ok: false, msg: 'Abre primero tu Brain.' };
  const r = await git(['remote', 'get-url', 'origin'], 15000);
  if (r.err) return { ok: false, msg: 'Esta carpeta no tiene un repositorio remoto (origin): sube tu Brain a GitHub para poder abrirlo en el móvil.' };
  const repo = enlaceMod.repoDeRemoto(r.out.split('\n')[0]);
  if (!repo) return { ok: false, msg: 'El repositorio de esta carpeta no está en GitHub; el móvil solo lee repositorios de GitHub.' };
  const b = await git(['rev-parse', '--abbrev-ref', 'HEAD'], 15000), rama = !b.err && b.out && b.out !== 'HEAD' ? b.out.split('\n')[0] : 'main';
  try { return { ok: true, repo, branch: rama, enlace: enlaceMod.construyeEnlace({ repo, branch: rama }) }; } catch (x) { return { ok: false, msg: String(x.message || x) }; }
});
let syncing = null;
async function sync() {
  if (!vault) return { ok: false, msg: 'Sin carpeta del Brain' };
  if (!fs.existsSync(path.join(vault, '.git'))) return { ok: true, msg: 'Carpeta local: no usa GitHub' };
  if (syncing) return syncing;
  syncing = (async () => {
    const before = (await git(['rev-parse', 'HEAD'])).out;
    let r;
    for (let i = 0; i < 4; i++) {
      r = await git(['pull', '--ff-only']);
      if (!r.err) break;
      if (!/resolve host|unable to access|Could not read|timed out/i.test(r.out)) break;  // solo reintenta fallos de red
      await sleep(5000);
    }
    if (r.err && /not possible to fast-forward|diverging branches|divergent branches|need to specify how to reconcile/i.test(r.out)) {
      const c = (await git(['rev-list', '--left-right', '--count', 'HEAD...@{u}'])).out.split(/\s+/).map(Number);   // [commits solo en local, commits solo en GitHub]
      const det = c.length === 2 && c.every(Number.isFinite) ? ` (${c[0]} commit(s) tuyos sin subir y ${c[1]} nuevo(s) en GitHub)` : '';
      return { ok: false, conflicto: true, msg: 'Tu copia local y GitHub han cambiado a la vez' + det + ': la app no mezcla por su cuenta para no perder notas. Publica tus apuntes (se reajustan sobre lo de GitHub) o resuélvelo en una terminal con «git pull --rebase».' };
    }
    if (r.err && /would be overwritten|overwritten by merge|unmerged|unresolved conflict|CONFLICT/i.test(r.out)) {
      const f = (r.out.match(/^\s+(\S.*)$/gm) || []).map(x => x.trim()).slice(0, 3).join(', ');
      return { ok: false, conflicto: true, msg: 'Hay cambios sin guardar en tu copia que chocan con los de GitHub' + (f ? ' (' + f + ')' : '') + ': guárdalos con «Publicar apuntes» o descártalos antes de sincronizar. No se ha tocado nada.' };
    }
    if (r.err) {   // si git ni siquiera arranca o se agota el tiempo, `out` viene vacío: se explica con el error del proceso
      const motivo = r.out.split('\n').slice(-2).join(' ').slice(0, 200) ||
        (r.err.killed ? 'git no respondió en 60 s (¿sin conexión o esperando credenciales?)' : r.err.code === 'ENOENT' ? (IS_WIN ? 'no se encuentra git; instala «Git for Windows» (git-scm.com) y vuelve a abrir la app' : IS_MAC ? 'no se encuentra git; ejecuta «xcode-select --install»' : 'no se encuentra git; instálalo con el gestor de paquetes') : String(r.err.message || r.err.code || 'error desconocido').slice(0, 200));
      return { ok: false, msg: 'No se pudo sincronizar: ' + motivo };
    }
    const after = (await git(['rev-parse', 'HEAD'])).out;
    if (before === after) return { ok: true, msg: 'Al día con GitHub' };
    const n = (await git(['rev-list', '--count', `${before}..${after}`])).out;
    return { ok: true, changed: true, msg: `Descargados ${n} commit(s) nuevos de GitHub` };
  })().finally(() => { syncing = null; });
  return syncing;
}
ipcMain.handle('git:sync', async () => {
  const r = await sync(); if (r.changed) win.webContents.send('vault:changed');
  if (r.conflicto && win && !win.isDestroyed()) dialog.showMessageBox(win, { type: 'warning', title: 'Conflicto con GitHub', message: 'No se pudo sincronizar: hay un conflicto', detail: r.msg, buttons: ['Entendido'] });   // solo al pulsar sincronizar a mano
  return r;
});

// ---- Terminal integrada (shell de login en la carpeta del Brain; desde ella se puede lanzar `claude`) ----
// Solo acepta mensajes de la ventana principal. Es un shell real con tus permisos: equivale a abrir Terminal.app.
const fromWin = (e) => win && !win.isDestroyed() && e.sender === win.webContents;
ipcMain.handle('term:start', (e, cols, rows) => {
  if (!fromWin(e)) return { ok: false };
  if (term) return { ok: true, reused: true };
  if (!pty) return { ok: false, msg: 'node-pty no está disponible en esta compilación' };
  const home = app.getPath('home');
  try {
    const arreglo = require('./ptyfix').aseguraHelper();   // en los zips de macOS el ayudante venía sin permiso de ejecución
    if (arreglo.arreglados.length) console.log('terminal: permiso de ejecución dado a', arreglo.arreglados.join(', '));
    arreglo.fallos.forEach(f => console.error('terminal: no se pudo dar permiso a', f.ruta, f.msg));
    term = pty.spawn(IS_WIN ? 'powershell.exe' : (process.env.SHELL || (IS_MAC ? '/bin/zsh' : '/bin/bash')), IS_WIN ? [] : ['-l', '-i'], {
      name: 'xterm-256color', cols: Math.max(20, cols | 0), rows: Math.max(5, rows | 0), cwd: vault || home,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', PATH: IS_WIN ? (process.env.PATH || '') : `${home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}` },
    });
  } catch (err) { return { ok: false, msg: require('./ptyfix').mensajeError(err) }; }
  term.onData(d => { if (win && !win.isDestroyed()) win.webContents.send('term:data', d); });
  term.onExit(() => { term = null; if (win && !win.isDestroyed()) win.webContents.send('term:exit'); });
  return { ok: true, cwd: vault || home };
});
ipcMain.on('term:write', (e, d) => { if (fromWin(e) && term && typeof d === 'string') term.write(d); });
ipcMain.on('term:resize', (e, c, r) => { if (fromWin(e) && term && c > 0 && r > 0) try { term.resize(c | 0, r | 0); } catch {} });
ipcMain.handle('term:kill', (e) => { if (fromWin(e) && term) { term.kill(); term = null; } });
app.on('before-quit', () => { if (term) try { term.kill(); } catch {} });

// ---- Estado respecto a GitHub (alimenta el LED) ----
// ok = igual que origin · behind = hay commits nuevos en GitHub · ahead = hay cosas sin subir · err = sin conexión
async function estado() {
  if (!vault) return { state: 'err', msg: 'Sin carpeta del Brain' };
  if (!fs.existsSync(path.join(vault, '.git'))) return { state: 'nogit', msg: 'Carpeta local (sin GitHub)', pend: 0, at: Date.now() };
  const f = await git(['fetch', '--quiet'], 20000);
  if (f.err) return { state: 'err', msg: 'Sin conexión con GitHub' };
  const c = await git(['rev-list', '--left-right', '--count', 'HEAD...@{u}']);
  if (c.err) return { state: 'err', msg: 'La rama no tiene upstream' };
  const [ahead, behind] = c.out.split(/\s+/).map(Number);
  let pend = 0; try { pend = (await cambiosApuntes()).length; } catch {}
  return { state: behind ? 'behind' : (ahead || pend) ? 'ahead' : 'ok', ahead, behind, pend, at: Date.now() };
}
ipcMain.handle('git:status', estado);

// ---- Publicar apuntes: commit + push SOLO de 02-Asignaturas/*/apuntes/**/*.md ----
const PATHSPEC = ':(glob)02-Asignaturas/*/apuntes/**/*.md';
const SOSPECHA = /-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S{6,}/i;
async function cambiosApuntes() {
  const files = [];
  // execFile directo: git() hace trim() y comería el espacio inicial del estado ' M'
  const raw = (await new Promise((res, rej) => execFile(GIT, ['-c', 'core.quotePath=false', 'status', '--porcelain', '-z', '-uall', '--', PATHSPEC], { cwd: vault }, (e, so) => e ? rej(new Error(String(e.message))) : res(so || '')))).split('\0').filter(Boolean);
  for (let i = 0; i < raw.length; i++) {
    const st = raw[i].slice(0, 2).trim(), f = raw[i].slice(3);
    if (/^[RC]/.test(st)) i++;               // entrada extra con el nombre antiguo
    let warn = false;
    try { warn = SOSPECHA.test(fs.readFileSync(path.join(vault, f), 'utf8')); } catch {}
    files.push({ path: f, status: st === '??' ? 'nuevo' : st === 'D' ? 'borrado' : 'modificado', warn });
  }
  return files;
}
ipcMain.handle('push:preview', async () => { if (!L.esBrain(vault)) return { ok: false, msg: 'Publicar apuntes solo está disponible en carpetas con estructura de Brain' }; try { return { ok: true, files: await cambiosApuntes() }; } catch (e) { return { ok: false, msg: String(e.message || e) }; } });
const NET = /resolve host|unable to access|Could not read|timed out|Connection/i;
async function conReintentos(args) { let r; for (let i = 0; i < 4; i++) { r = await git(args); if (!r.err || !NET.test(r.out)) break; await sleep(5000); } return r; }
ipcMain.handle('push:do', async (_e, message) => {
  if (!L.esBrain(vault)) return { ok: false, msg: 'Publicar apuntes solo está disponible en carpetas con estructura de Brain' };
  try {
    const files = await cambiosApuntes();
    if (!files.length) return { ok: true, msg: 'No hay apuntes nuevos que publicar' };
    const msg = (String(message || '').trim() || `apuntes: ${files.length} nota(s) actualizada(s) desde Brain`).slice(0, 200);
    let r = await git(['add', '-A', '--', PATHSPEC]); if (r.err) return { ok: false, msg: 'git add: ' + r.out };
    r = await git(['commit', '-m', msg, '--', PATHSPEC]); if (r.err) return { ok: false, msg: 'git commit: ' + r.out.slice(0, 200) };
    r = await conReintentos(['push']);
    if (r.err && /rejected|non-fast-forward|fetch first/i.test(r.out)) {      // remoto con commits nuevos: rebase de la rama y reintento (nunca force)
      const rb = await conReintentos(['pull', '--rebase', '--autostash']);
      if (rb.err) { await git(['rebase', '--abort']); return { ok: false, msg: 'Commit hecho en local, pero el remoto ha cambiado y el rebase falló (abortado, nada perdido): ' + rb.out.slice(-160) }; }
      r = await conReintentos(['push']);
    }
    if (r.err) return { ok: false, msg: 'Commit hecho en local, pero el push falló: ' + r.out.slice(-200) };
    const h = (await git(['rev-parse', '--short', 'HEAD'])).out;
    win.webContents.send('vault:changed');
    return { ok: true, msg: `Publicados ${files.length} apunte(s) en GitHub (${h})` };
  } catch (e) { return { ok: false, msg: String(e.message || e) }; }
});

// ---- Subida de archivos a una asignatura (copia, nunca sobrescribe) ----
ipcMain.handle('upload:info', () => ({ siglas: siglas(), subs: SUBS }));
ipcMain.handle('upload:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Elige archivos para subir', properties: ['openFile', 'multiSelections'] });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('upload:copy', (_e, sigla, sub, paths) => {
  if (!vault || !siglas().includes(sigla) || !SUBS.includes(sub)) return { ok: false, msg: 'Destino no válido' };
  const base = L.dirAsignatura(vault, sigla); if (!base) return { ok: false, msg: 'Destino no válido' };
  const destDir = L.esBrain(vault) || sub !== 'apuntes' ? path.join(base, sub) : base;   // en una carpeta libre los apuntes van a la propia carpeta de la asignatura
  fs.mkdirSync(destDir, { recursive: true });
  const hechos = [], fallos = [];
  for (const src of paths) {
    try {
      if (!fs.statSync(src).isFile()) throw new Error('no es un fichero');
      const ext = path.extname(src), base = path.basename(src, ext);
      let name = base + ext, i = 1;
      for (;;) {   // COPYFILE_EXCL: jamás pisa un fichero existente; si existe, añade -2, -3…
        try { fs.copyFileSync(src, path.join(destDir, name), fs.constants.COPYFILE_EXCL); break; }
        catch (e) { if (e.code !== 'EEXIST') throw e; name = `${base}-${++i}${ext}`; }
      }
      hechos.push(`${sigla}/${sub}/${name}`);
    } catch (e) { fallos.push(`${path.basename(src)}: ${e.message}`); }
  }
  win.webContents.send('vault:changed');
  return { ok: !fallos.length, hechos, fallos };
});
ipcMain.handle('open:external', (_e, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 820, minHeight: 520, title: 'Brain',
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 14 }, vibrancy: 'sidebar', visualEffectState: 'followWindow', backgroundColor: '#00000000' }
      : { backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1b1e' : '#ffffff', autoHideMenuBar: true }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:\/\//i.test(url)) shell.openExternal(url); } });
}

app.whenReady().then(() => {
  profiles.cargar();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(IS_MAC ? [{ role: 'appMenu' }] : [{ role: 'fileMenu' }]),
    { label: 'Brain', submenu: [
      { label: 'Cambiar de perfil…', click: () => { desactivar(); win.webContents.reload(); } },
      { label: 'Editar perfil…', click: () => win.webContents.send('ui:editprofile') },
      { label: 'Sincronizar con GitHub', accelerator: 'CmdOrCtrl+Shift+S', click: () => win.webContents.send('sync:request') },
      { label: 'Publicar apuntes en GitHub…', accelerator: 'CmdOrCtrl+Shift+P', click: () => win.webContents.send('push:request') },
      { label: 'Mostrar u ocultar terminal', accelerator: 'CmdOrCtrl+J', click: () => win.webContents.send('ui:term') },
      { label: 'Recargar índice', accelerator: 'CmdOrCtrl+R', click: () => win.webContents.send('vault:changed') },
      { label: 'Buscar…', accelerator: 'CmdOrCtrl+K', click: () => win.webContents.send('ui:search') },
    ] },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]));
  // Un único perfil sin PIN entra solo (antes de abrir la ventana, para que la interfaz ya lo encuentre activo);
  // con varios perfiles, o con PIN, la persona elige quién es y, si hace falta, pone su PIN
  let l = profiles.lista(), auto = l.length === 1 && !l[0].hasPin && profiles.esDir(l[0].vault) ? profiles.buscar(l[0].id) : null;
  if (HUMO && process.env.BRAIN_HUMO_BRAIN) { const p = profiles.crear({ name: 'Humo', vault: process.env.BRAIN_HUMO_BRAIN, campusUrl: '' }); auto = profiles.buscar(p.id); }
  if (auto) activar(auto);
  createWindow();
  if (auto && !HUMO) win.webContents.once('did-finish-load', lanzaSync);
  if (HUMO) prueba_humo();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
// ---- prueba de arranque: carga la interfaz real, recorre las pantallas y comprueba que no hay errores de la ventana ni del proceso ----
function prueba_humo() {
  const errores = [], fin = (ok, msg) => { console.log((ok ? 'HUMO_OK ' : 'HUMO_FALLO ') + msg); app.exit(ok ? 0 : 1); };
  setTimeout(() => fin(false, 'tiempo agotado (60 s)'), 60000);
  win.webContents.on('console-message', (_e, nivel, msg, linea, fuente) => { if (nivel >= 3) errores.push(`${String(fuente).split('/').pop()}:${linea} ${msg}`.slice(0, 200)); });
  win.webContents.on('render-process-gone', (_e, d) => fin(false, 'se cayó la ventana: ' + d.reason));
  process.on('uncaughtException', (e) => errores.push('proceso: ' + (e && e.message)));
  win.webContents.once('did-finish-load', async () => {
    try {
      const js = (c) => win.webContents.executeJavaScript(c), esp = (ms) => new Promise(r => setTimeout(r, ms)); await esp(2500);
      const r = { apuntes: await js('notes.length'), arbol: await js("document.querySelectorAll('#tree .it').length"), pantallas: {} };
      for (const [n, f] of [['inicio', 'home()'], ['notas', 'showNotas()'], ['preguntar', 'showPreguntar()'], ['ajustes', 'showAjustes()'], ['plan', 'showPlan()'], ['dudas', 'showDudas()'], ['estudiar', 'showStudy()'], ['horario', 'showHorario()'], ['avisos', 'showAvisos()'], ['dashboard', 'showDash()'], ['mensajes', 'showMensajes()']]) { await js(f); await esp(500); r.pantallas[n] = await js("document.querySelector('#doc').textContent.length"); }
      await js("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))"); await esp(200); r.paleta = await js("!!document.querySelector('.pal')");
      const vacias = Object.entries(r.pantallas).filter(([, n]) => !n).map(([k]) => k);
      if (!r.apuntes || !r.arbol) return fin(false, 'no cargó los apuntes: ' + JSON.stringify(r));
      if (vacias.length) return fin(false, 'pantallas vacías: ' + vacias.join(', '));
      if (!r.paleta) return fin(false, 'la paleta no se abre');
      if (errores.length) return fin(false, 'errores: ' + errores.slice(0, 5).join(' || '));
      fin(true, JSON.stringify(r));
    } catch (e) { fin(false, 'excepción: ' + (e && e.message)); }
  });
}
