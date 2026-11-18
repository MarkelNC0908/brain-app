// Proceso principal: lee el Brain del disco (solo lectura) y lo expone al renderer por IPC.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Notification, nativeTheme, session } = require('electron');
const fs = require('fs');
const dashboard = require('./dashboard');
const L = require('./layout');
const campusMod = require('./campus');
const mensajesMod = require('./mensajes');   // mensajes privados de Blackboard (solo lectura)   // elige el conector según el campus del perfil
let cur = campusMod.para('blackboard');   // { avisos, ingesta } del perfil activo
const profiles = require('./profiles');
const cursosMod = require('./cursos');
const { execFile } = require('child_process');
const path = require('path');
// Compatibilidad: hasta la 1.0.2 la app se llamaba «Brain U-tad»; si existe esa carpeta de datos y aún no la nueva, se sigue usando (así no se pierden perfiles ni sesiones)
try { const base = app.getPath('appData'), viejo = path.join(base, 'Brain U-tad'), nuevo = path.join(base, 'Brain'); if (fs.existsSync(viejo) && !fs.existsSync(nuevo)) app.setPath('userData', viejo); } catch {}

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

ipcMain.handle('vault:index', () => {
  if (!vault) return { ok: false };
  try { return { ok: true, root: vault, modo: L.esBrain(vault) ? 'brain' : 'carpeta', notes: buildIndex() }; } catch (e) { return { ok: false, error: String(e) }; }
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
ipcMain.handle('msg:state', () => mensajesMod.state());
ipcMain.handle('msg:check', (e) => (fromWin(e) ? mensajesMod.check({ silencioso: true, onCambio: avisaMensajes }).then(r => { avisaMensajes(); return r; }) : null));   // lectura completa, la pide la pantalla
ipcMain.handle('msg:hilo', (e, courseId, convId, total, forzar) => (fromWin(e) ? mensajesMod.hilo(String(courseId), String(convId), Number(total) || 1, !!forzar).then(r => { avisaMensajes(); return r; }) : { ok: false, msg: 'No permitido' }));
ipcMain.handle('msg:login', (e) => { if (fromWin(e)) mensajesMod.abrir(() => { mensajesMod.check({ silencioso: true, onCambio: avisaMensajes }).then(avisaMensajes); }); });
ipcMain.handle('bbi:scan', (e) => (fromWin(e) && vault ? cur.ingesta.escanear(vault, hoyISO()) : { ok: false, msg: 'No permitido' }));
ipcMain.handle('bbi:apply', (e, f, c, d) => (fromWin(e) && vault ? cur.ingesta.aplicar(vault, hoyISO(), Array.isArray(f) ? f : [], Array.isArray(c) ? c : [], Array.isArray(d) ? d : []) : { ok: false, msg: 'No permitido' }));
ipcMain.handle('bbi:cancel', (e) => { if (fromWin(e)) cur.ingesta.cancelar(); });
ipcMain.handle('bb:state', () => cur.avisos.state());
ipcMain.handle('bb:check', (e) => (fromWin(e) ? revisarBB(true) : null));   // revisión manual: sin notificación del sistema, el resultado se ve en pantalla
ipcMain.handle('bb:login', (e) => { if (fromWin(e)) cur.avisos.abrir(() => revisarBB(true)); });
ipcMain.handle('bb:seen', (e) => (fromWin(e) ? cur.avisos.marcarVistas() : null));

// ---- Perfiles: inicio de sesión local, alta/edición/baja y selector de carpeta ----
function activar(p) {
  desactivar(); profile = p; profiles.marcarUltimo(p.id);
  const d = profiles.datos(p), asig = () => cursosMod.asignaturas(p.vault);
  cur = campusMod.para(profiles.tipoDe(p));
  cur.avisos.init({ campus: p.campusUrl, icalUrl: p.icalUrl || '', partition: d.partition, stateFile: d.bbState, asignaturas: asig });
  cur.ingesta.init({ campus: p.campusUrl, icalUrl: p.icalUrl || '', partition: d.partition, ingestaFile: d.bbIngesta });
  mensajesMod.init({ activo: profiles.tipoDe(p) === 'blackboard', campus: p.campusUrl, partition: d.partition, stateFile: d.mensajes, asignaturas: asig });
  cur.ingesta.setProgreso(prog => { if (win && !win.isDestroyed()) win.webContents.send('bbi:progress', prog); });   // progreso de descargas grandes (vídeos)
  setVault(p.vault);
  timers.push(setTimeout(() => { avisarEntregas(); revisarBB(false); }, 20000), setTimeout(() => revisarMensajes(true), 60000), setInterval(avisarEntregas, 60 * 60 * 1000), setInterval(() => revisarBB(false), 30 * 60 * 1000), setInterval(() => revisarMensajes(false), 30 * 60 * 1000));
  lanzaSync();
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
    term = pty.spawn(IS_WIN ? 'powershell.exe' : (process.env.SHELL || (IS_MAC ? '/bin/zsh' : '/bin/bash')), IS_WIN ? [] : ['-l', '-i'], {
      name: 'xterm-256color', cols: Math.max(20, cols | 0), rows: Math.max(5, rows | 0), cwd: vault || home,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', PATH: IS_WIN ? (process.env.PATH || '') : `${home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ''}` },
    });
  } catch (err) { return { ok: false, msg: String(err.message || err) }; }
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
  const l = profiles.lista(), auto = l.length === 1 && !l[0].hasPin && profiles.esDir(l[0].vault) ? profiles.buscar(l[0].id) : null;
  if (auto) activar(auto);
  createWindow();
  if (auto) win.webContents.once('did-finish-load', lanzaSync);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
