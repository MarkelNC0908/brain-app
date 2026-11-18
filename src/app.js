// Renderer: apuntes de las asignaturas, búsqueda, wikilinks, LED de sincronización, subida y publicación.
const $ = (s) => document.querySelector(s);
document.body.dataset.os = (window.brain && window.brain.platform) || 'darwin';   // el CSS ajusta la barra superior según el sistema
const tree = $('#tree'), doc = $('#doc'), q = $('#q');
let statusIniciado = false;
let view = 'notes', dash = null, gitInfo = null, bb = null, modoVault = 'brain';
let notes = [], byPath = new Map(), byBase = new Map(), root = '', hist = [], hp = -1, current = null;

// Nombres y colores de las asignaturas: se rellenan con las del Brain de cada perfil (cargaAsignaturas)
const NOMBRES = {}, COLOR = {};
const NOMBRES_DEF = { afi: 'AFI · Forense', brs: 'BRS · Bastionado', he: 'HE · Hacking Ético', inc: 'INC · Incidentes', nc: 'NC · Normativas', pps: 'PPS · Producción Segura' };
const COLOR_DEF = { afi: '#bf5af2', brs: '#0a84ff', he: '#ff453a', inc: '#ff9f0a', nc: '#30b0c7', pps: '#30d158' };
const PALETA = ['#0a84ff', '#bf5af2', '#ff453a', '#ff9f0a', '#30b0c7', '#30d158', '#ff375f', '#64d2ff', '#ac8e68', '#8e8e93'];
async function cargaAsignaturas() {
  let subs = []; try { subs = await window.brain.subjects(); } catch {}
  if (!Array.isArray(subs)) subs = [];
  for (const k of Object.keys(NOMBRES)) delete NOMBRES[k]; for (const k of Object.keys(COLOR)) delete COLOR[k];
  subs.forEach((a, i) => { NOMBRES[a.sigla] = NOMBRES_DEF[a.sigla] || (a.libre ? a.nombre : `${a.sigla.toUpperCase()} · ${a.nombre}`); COLOR[a.sigla] = COLOR_DEF[a.sigla] || PALETA[i % PALETA.length]; });
}
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const short = (n) => n.title.replace(/^[A-Z]+ · /, '');
const sigOf = (n) => n.path.split('/')[1];

async function load() {
  await cargaAsignaturas();
  const r = await window.brain.index();
  if (!r.ok) {
    tree.replaceChildren(); doc.replaceChildren();
    const d = el('div', 'empty'); d.append(el('h2', null, 'No encuentro tus apuntes'), el('p', null, r.error || 'Elige la carpeta de tus apuntes.'));
    const b = el('button', null, 'Elegir carpeta…'); b.onclick = () => window.brain.pick(); d.append(b); doc.append(d); return;
  }
  root = r.root; notes = r.notes; modoVault = r.modo || 'brain'; $('#pushbtn').style.display = modoVault === 'carpeta' ? 'none' : '';   // publicar apuntes solo existe con estructura de Brain
  byPath = new Map(notes.map(n => [n.path, n]));
  byBase = new Map(); for (const n of notes) { const k = norm(n.base); if (!byBase.has(k)) byBase.set(k, n); }
  for (const n of notes) n.hay = norm(n.title + '\n' + n.body);
  q.value ? search(q.value) : buildTree();
  loadDash(); loadBB(); loadMsgs(); if (!statusIniciado) { statusIniciado = true; refreshStatus(); }   // primer chequeo del LED aunque no haya llegado ningún evento de sincronización
  if (view === 'dash' || view === 'study' || view === 'avisos' || view === 'horario' || view === 'mensajes' || view === 'notas' || view === 'preguntar' || view === 'ajustes' || view === 'plan' || view === 'dudas') {} else if (current && byPath.has(current)) show(current); else if (!current) home();
}

function buildTree() {
  tree.replaceChildren();
  const by = {};
  for (const n of [...notes].sort((a, b) => a.path.localeCompare(b.path, 'es', { numeric: true }))) (by[sigOf(n)] ||= []).push(n);
  for (const s of Object.keys(by).sort()) {
    const g = el('div', 'grp'); g.style.setProperty('--c', COLOR[s] || '');
    g.append(el('i'), document.createTextNode(NOMBRES[s] || s.toUpperCase()), el('span', null, by[s].filter(n => !n.borrador).length));
    const box = el('div'); g.onclick = () => { box.hidden = !box.hidden; };
    tree.append(g, box);
    const item = (n) => { const it = el('a', 'it', short(n) + (n.externo ? ' ↗' : '')); it.dataset.p = n.path; it.title = n.title; it.onclick = () => go(n.path); return it; };
    // primero lo que sale del material del profesor (PDF, PPTX…), por tema; los borradores sin material de clase van plegados al final
    for (const n of by[s].filter(n => !n.borrador)) box.append(item(n));
    const bor = by[s].filter(n => n.borrador);
    if (bor.length) {
      const sub = el('div', 'sub', `Borradores sin material de clase (${bor.length})`), cj = el('div'); cj.hidden = !(current && bor.some(n => n.path === current));
      sub.onclick = (e) => { e.stopPropagation(); cj.hidden = !cj.hidden; sub.classList.toggle('open', !cj.hidden); }; sub.classList.toggle('open', !cj.hidden);
      sub.title = 'Apuntes escritos a partir del temario, no de lo que sube el profesor. Contrástalos con el material de clase.';
      for (const n of bor) cj.append(item(n)); box.append(sub, cj);
    }
  }
  markOn();
}
const markOn = () => document.querySelectorAll('.it[data-p]').forEach(i => i.classList.toggle('on', i.dataset.p === current));

function go(p, destino) {
  const nn = byPath.get(p); if (nn && nn.externo) { window.brain.openFile(p); return; }   // PDF, Word… se abren con su aplicación
  hist = hist.slice(0, hp + 1); hist.push(p); hp = hist.length - 1; show(p); if (destino && typeof resaltaDestino === 'function') resaltaDestino(destino); }
function goSubject(s) { hist = hist.slice(0, hp + 1); hist.push('@' + s); hp = hist.length - 1; subject(s); }
function nav(d) { const i = hp + d; if (i < 0 || i >= hist.length) return; hp = i; const h = hist[hp]; h === '@study' ? showStudy(false) : h === '@dash' ? showDash(false) : h === '@avisos' ? showAvisos(false) : h === '@mensajes' ? showMensajes(false) : h === '@horario' ? showHorario(false) : h === '@preguntar' ? showPreguntar(false) : h === '@notas' ? showNotas(false) : h === '@ajustes' ? showAjustes(false) : h === '@plan' ? showPlan(false) : h === '@dudas' ? showDudas(false) : h === '@home' ? home() : h[0] === '@' ? subject(h.slice(1)) : show(h); }
const btns = () => { $('#back').disabled = hp <= 0; $('#fwd').disabled = hp >= hist.length - 1; };

function resolve(target) {
  const t = target.split('#')[0].trim().replace(/\\/g, '/'); if (!t) return null;
  if (byPath.has(t)) return byPath.get(t); if (byPath.has(t + '.md')) return byPath.get(t + '.md');
  return byBase.get(norm(t.split('/').pop().replace(/\.(md|txt)$/i, ''))) || null;
}
function render(body) {
  // [[destino|alias]] → enlace interno (o gris si no es un apunte); la salida se sanea con DOMPurify
  const md = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => {
    const n = resolve(t), label = (a || t).replace(/[\[\]]/g, '');
    return n ? `[${label}](#n/${encodeURIComponent(n.path)})` : `[${label}](#roto)`;
  });
  return DOMPurify.sanitize(marked.parse(md, { gfm: true }));
}

function show(p) {
  const n = byPath.get(p); if (!n) return home();
  view = 'notes';
  current = p; $('#crumb').textContent = `${NOMBRES[sigOf(n)] || sigOf(n)}  ›  ${short(n)}`; btns(); markOn(); doc.replaceChildren();
  const m = el('div', 'meta');
  if (n.meta.status) m.append(el('span', 'tag', n.meta.status));
  if (n.updated) m.append(el('span', 'tag', 'act. ' + n.updated));
  const c = (r) => (n.body.match(r) || []).length, v = c(/\[verificado\]/g), su = c(/\[supuesto\]/g), pe = c(/\[pendiente\]/gi);
  if (v) m.append(el('span', 'tag ok', `${v} verificado`)); if (su) m.append(el('span', 'tag', `${su} supuesto`)); if (pe) m.append(el('span', 'tag pe', `${pe} pendiente`));
  doc.append(m);
  if (typeof apunteAcciones === 'function') apunteAcciones(n);   // resumen y test con IA (opcional, escritorio)
  const body = el('div'); body.innerHTML = render(n.body); doc.append(...body.childNodes);
  const re = new RegExp('\\[\\[(?:[^\\]|]*/)?' + n.base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\.md)?(?:[#|][^\\]]*)?\\]\\]', 'i');
  const bl = notes.filter(o => o.path !== p && re.test(o.body));
  if (bl.length) { const b = el('div', 'back'); b.append(el('b', null, `Enlazada desde ${bl.length}`)); for (const o of bl) { const a = el('a', 'it', short(o)); a.onclick = () => go(o.path); b.append(a); } doc.append(b); }
  doc.scrollTop = 0;
}
doc.addEventListener('click', (e) => {
  const a = e.target.closest('a'); if (!a || a.classList.contains('it')) return; e.preventDefault();
  const h = a.getAttribute('href') || '';
  if (h.startsWith('#n/')) go(decodeURIComponent(h.slice(3))); else if (/^https?:\/\//i.test(h)) window.brain.external(h);
});

function subject(s) {
  view = 'notes'; current = null; $('#crumb').textContent = NOMBRES[s] || s; btns(); markOn(); doc.replaceChildren();
  doc.append(el('h1', null, NOMBRES[s] || s.toUpperCase()));
  const list = el('div', 'list');
  for (const n of notes.filter(n => sigOf(n) === s)) {
    const a = el('a', 'it'); a.append(el('b', null, short(n)));
    const tl = (n.body.match(/\*\*TL;DR\*\*:\s*(.+)/) || [])[1]; if (tl) a.append(el('small', null, tl.slice(0, 160) + (tl.length > 160 ? '…' : '')));
    a.onclick = () => go(n.path); list.append(a);
  }
  doc.append(list);
}
function home() {
  view = 'notes'; current = null; if (hist[hp] !== '@home') { hist = hist.slice(0, hp + 1); hist.push('@home'); hp = hist.length - 1; }
  $('#crumb').textContent = ''; btns(); markOn(); doc.replaceChildren();
  doc.append(el('h1', null, 'Apuntes'), el('p', 'lead', `${notes.length} apuntes de ${Object.keys(NOMBRES).length} asignaturas`));
  if (typeof hoyToca === 'function') hoyToca();
  const grid = el('div', 'home');
  for (const s of Object.keys(NOMBRES)) {
    const k = notes.filter(n => sigOf(n) === s).length;
    const c = el('div', 'card'); c.style.setProperty('--c', COLOR[s]); const b = el('b'); b.append(el('i'), document.createTextNode(NOMBRES[s])); c.append(b, el('span', null, k ? `${k} apunte(s)` : 'sin apuntes'));
    c.onclick = () => goSubject(s); grid.append(c);
  }
  if (typeof dialogoAsignatura === 'function') { const add = el('div', 'card'); add.append(el('b', null, '＋ Añadir asignatura'), el('span', null, 'Crea su ficha y carpetas en tu Brain')); add.onclick = () => dialogoAsignatura().then(ok => ok && load()); grid.append(add); }
  doc.append(grid);
  if (!Object.keys(NOMBRES).length) doc.append(el('p', 'dsub', modoVault === 'carpeta' ? 'Esta carpeta aún no tiene apuntes (.md, .txt, PDF…). Crea una subcarpeta por asignatura o pulsa «＋ Añadir asignatura».' : 'Tu Brain aún no tiene asignaturas: añade la primera con «＋ Añadir asignatura».'));
}

function search(text) {
  const terms = norm(text).split(/\s+/).filter(Boolean); if (!terms.length) return buildTree();
  const out = notes.filter(n => terms.every(t => n.hay.includes(t))).map(n => ({ n, s: terms.reduce((a, t) => a + (norm(n.title).includes(t) ? 5 : 0), 0) })).sort((a, b) => b.s - a.s);
  tree.replaceChildren(el('div', 'grp', `${out.length} resultado(s)`));
  for (const { n } of out.slice(0, 80)) {
    const it = el('a', 'it res'); it.dataset.p = n.path; it.append(el('div', null, short(n)));
    const i = norm(n.body).indexOf(terms[0]); if (i >= 0) it.append(el('span', 'snip', '…' + n.body.slice(Math.max(0, i - 30), i + 90).replace(/\s+/g, ' ') + '…'));
    it.onclick = () => go(n.path); tree.append(it);
  }
  markOn();
}
q.addEventListener('input', () => search(q.value));
q.addEventListener('keydown', (e) => { if (e.key === 'Escape') { q.value = ''; buildTree(); q.blur(); } });
$('#hbtn').onclick = () => { if (q.value) { q.value = ''; buildTree(); } home(); };   // Inicio: pantalla principal con las asignaturas
$('#back').onclick = () => nav(-1); $('#fwd').onclick = () => nav(1);
window.brain.onChanged(() => { load(); refreshStatus(); });
window.brain.onSearch(() => { if (typeof paleta === 'function') paleta(); else { q.focus(); q.select(); } });   // Cmd/Ctrl+K (atajo del menú): paleta de búsqueda global

// ---- LED de sincronización con GitHub ----
// verde = idéntico a GitHub · ámbar = hay novedades en GitHub o apuntes sin subir · rojo = sin conexión · parpadeo = comprobando
const led = $('#led'), syncEl = $('#sync'), badge = $('#badge');
const setLed = (cls, text, full) => { led.className = cls; syncEl.textContent = text; syncEl.title = full || text; };
const ledErr = (r) => r.conflicto ? setLed('err', 'Conflicto con GitHub', r.msg) : setLed('err', r.msg);
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'ahora' : `hace ${m} min`; };
let busy = false;
async function refreshStatus() {
  if (busy) return; busy = true; setLed('busy', 'Comprobando…');
  try {
    const s = await window.brain.status();
    gitInfo = s; if (view === 'dash') drawDash();
    badge.hidden = !s.pend; badge.textContent = s.pend || '';
    if (s.state === 'ok') setLed('ok', `Al día con GitHub · ${ago(s.at)}`);
    else if (s.state === 'behind') setLed('behind', `${s.behind} novedad(es) en GitHub · pulsa ↻`);
    else if (s.state === 'nogit') setLed('', s.msg);
    else if (s.state === 'ahead') setLed('ahead', s.pend ? `${s.pend} apunte(s) sin publicar` : `${s.ahead} commit(s) sin subir`);
    else setLed('err', s.msg);
  } catch (e) { setLed('err', 'Error al comprobar'); } finally { busy = false; }
}
async function doSync() {
  setLed('busy', 'Sincronizando…'); busy = true; const r = await window.brain.sync(); busy = false;
  if (!r.ok) ledErr(r); else await refreshStatus();
}
window.brain.onSyncStart(() => { busy = true; setLed('busy', 'Sincronizando…'); });
window.brain.onSyncDone((r) => { busy = false; r.ok ? refreshStatus() : ledErr(r); });
window.brain.onSyncRequest(doSync); $('#syncbtn').onclick = doSync;
setInterval(refreshStatus, 90000); window.addEventListener('focus', () => refreshStatus());

// ---- Subida de archivos ----
const modal = $('#modal'), mList = $('#m-list'), mMsg = $('#m-msg'), mGo = $('#m-go'); let queue = [];
const paintQueue = () => { mList.replaceChildren(...queue.map(p => el('li', null, p.split('/').pop()))); mGo.disabled = !queue.length; };
const addPaths = (ps) => { for (const p of ps) if (p && !queue.includes(p)) queue.push(p); paintQueue(); };
async function openUpload() {
  const info = await window.brain.uploadInfo(), sig = $('#m-sigla'), sub = $('#m-sub');
  sig.replaceChildren(...info.siglas.map(s => Object.assign(el('option', null, NOMBRES[s] || s), { value: s })));
  sub.replaceChildren(...info.subs.map(s => Object.assign(el('option', null, s === '_entrada' ? '_entrada (sin procesar)' : s), { value: s })));
  const cur = current && current.split('/')[1]; if (cur && info.siglas.includes(cur)) sig.value = cur;
  queue = []; paintQueue(); mMsg.textContent = ''; modal.hidden = false;
}
$('#upbtn').onclick = openUpload; $('#m-cancel').onclick = () => { modal.hidden = true; };
$('#m-pick').onclick = async () => addPaths(await window.brain.pickFiles());
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addPaths([...e.dataTransfer.files].map(f => window.brain.pathOf(f))));
window.addEventListener('dragover', e => e.preventDefault()); window.addEventListener('drop', e => e.preventDefault());
mGo.onclick = async () => {
  mGo.disabled = true; const r = await window.brain.copyFiles($('#m-sigla').value, $('#m-sub').value, queue);
  mMsg.textContent = (r.hechos.length ? `Subidos ${r.hechos.length}: ${r.hechos.join(', ')}` : '') + (r.fallos.length ? ' · Fallos: ' + r.fallos.join('; ') : '');
  queue = []; paintQueue();
};

// ---- Publicar apuntes (commit + push solo de apuntes/*.md) ----
const pm = $('#pmodal'), pList = $('#p-list'), pGo = $('#p-go'), pRes = $('#p-res');
async function openPush() {
  pm.hidden = false; pRes.style.color = ''; pRes.textContent = 'Buscando cambios…'; pList.replaceChildren(); pGo.disabled = true; $('#p-msg').value = '';
  const r = await window.brain.pushPreview();
  if (!r.ok) { pRes.textContent = 'Error: ' + r.msg; return; }
  if (!r.files.length) { pRes.textContent = 'No hay apuntes nuevos ni modificados.'; return; }
  pList.replaceChildren(...r.files.map(f => el('li', f.warn ? 'w' : null, `${f.status} · ${f.path.replace('02-Asignaturas/', '')}${f.warn ? '  ⚠ parece contener una clave o contraseña' : ''}`)));
  pRes.textContent = r.files.some(f => f.warn) ? 'Posibles credenciales: no publiques datos sensibles.' : ''; pGo.disabled = false;
}
pGo.onclick = async () => {
  pGo.disabled = true; pRes.textContent = 'Publicando…'; const r = await window.brain.pushDo($('#p-msg').value);
  pRes.textContent = r.msg; pRes.style.color = r.ok ? '' : '#ff453a'; refreshStatus();
};
$('#pushbtn').onclick = openPush; $('#p-cancel').onclick = () => { pm.hidden = true; };
window.brain.onPushRequest(openPush);

// ---- Dashboard nativo (calculado desde las fichas y entregas del Brain) ----
const campusNombre = () => (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.lmsNombre) || 'Blackboard';   // Blackboard, Moodle, Canvas o Calendario iCal según el perfil
const esIcal = () => typeof PROFILE !== 'undefined' && PROFILE && PROFILE.lms === 'ical';
const dashUrl = () => (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.dashboardUrl) || '';   // versión web opcional de cada perfil
const STALE_DAYS = 7;   // si el Brain no se actualiza en más de 7 días, el LED pasa a ámbar (umbral elegido por mí, ajustable)
const COLS = [['todo', 'Por hacer'], ['doing', 'En curso'], ['sent', 'Entregado'], ['done', 'Corregido']];
let dashFilter = 'ALL', dashMsg = null;
const fdate = (d) => d ? new Date(d + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'sin fecha';
async function loadDash() { try { dash = await window.brain.dashData(); } catch (e) { dash = { error: String(e) }; } updateBell(); if (view === 'dash') drawDash(); else if (view === 'avisos') drawAvisos(); else if (view === 'horario') drawHorario(); else if (view === 'notas') drawNotas(); }
async function loadBB() { try { bb = await window.brain.bbState(); } catch { bb = null; } updateBell(); if (view === 'dash') drawDash(); else if (view === 'avisos') drawAvisos(); else if (view === 'ajustes') pintaSesion(); if (typeof hoyToca === 'function') hoyToca(true); }
const diasHasta = (f) => Math.round((new Date(f + 'T00:00') - new Date(dash.hoy + 'T00:00')) / 864e5);
const cercanas = () => dash && dash.items ? dash.items.filter(i => (i.col === 'todo' || i.col === 'doing') && i.fecha && diasHasta(i.fecha) >= 0 && diasHasta(i.fecha) <= 7) : [];
// Avisos «sin ver»: una entrega cercana avisa una vez por tramo (7 días, 3, 1 y hoy), igual que la notificación del sistema; al abrir Avisos se marca como vista y la campana se apaga
const tramoDe = (d) => d === 0 ? 'hoy' : d === 1 ? '1' : d <= 3 ? '3' : '7';
const kAviso = (i) => `${i.sigla}|${i.fecha}|${i.titulo}|${tramoDe(diasHasta(i.fecha))}`;
const kVistos = () => 'brain-avisos-vistos' + ((typeof PROFILE !== 'undefined' && PROFILE && PROFILE.id && PROFILE.id !== 'default') ? '-' + PROFILE.id : '');
const vistosAv = () => { try { return new Set(JSON.parse(localStorage.getItem(kVistos()) || '[]')); } catch { return new Set(); } };
const guardaVistos = (set) => { try { localStorage.setItem(kVistos(), JSON.stringify([...set].slice(-300))); } catch {} };
const sinVerCercanas = () => { const v = vistosAv(); return cercanas().filter(i => !v.has(kAviso(i))); };
let avNuevos = new Set(), bbNuevos = new Set(), bbMarcando = false;   // lo que era nuevo al abrir Avisos (se resalta mientras estés en esa pantalla)
function updateBell() { const n = sinVerCercanas().length + (bb ? bb.sinVer : 0); $('#nbtn').replaceChildren(document.createTextNode('🔔')); if (n) $('#nbtn').append(el('b', null, String(n))); }
function showAvisos(push = true) {
  view = 'avisos'; current = null; avNuevos = new Set(); bbNuevos = new Set(); bbMarcando = false;
  if (push && hist[hp] !== '@avisos') { hist = hist.slice(0, hp + 1); hist.push('@avisos'); hp = hist.length - 1; }
  $('#crumb').textContent = 'Avisos'; btns(); markOn(); drawAvisos(); loadDash(); loadBB();
}
function showDash(push = true) {
  view = 'dash'; current = null;
  if (push && hist[hp] !== '@dash') { hist = hist.slice(0, hp + 1); hist.push('@dash'); hp = hist.length - 1; }
  $('#crumb').textContent = 'Dashboard del curso'; btns(); markOn(); drawDash(); loadDash();
}
// LED del dashboard: verde = calculado con el Brain actual, Brain al día con GitHub y actualizado hace ≤ 7 días;
// ámbar = hay novedades en GitHub sin descargar, no se puede comprobar GitHub o el Brain lleva más de 7 días sin actualizarse; rojo = sin datos.
function dashLed() {
  if (!dash) return { cls: 'busy', text: 'Calculando…' };
  if (dash.error || !dash.items) return { cls: 'err', text: 'No se pudieron leer los datos del Brain' };   // sin entregas no es un error: el dashboard muestra el resumen del contenido
  const dias = dash.ultimaActualizacion ? Math.floor((new Date(dash.hoy) - new Date(dash.ultimaActualizacion)) / 864e5) : null;
  const base = dash.ultimaActualizacion ? `Brain actualizado el ${dash.ultimaActualizacion} (${dias === 0 ? 'hoy' : 'hace ' + dias + ' d'})` : 'Sin fecha de actualización en el Brain';
  const m = [];
  if (dias != null && dias > STALE_DAYS) m.push(`${dias} días sin actualizar el Brain`);
  if (!gitInfo) return { cls: 'busy', text: base + ' · comprobando GitHub…' };
  if (gitInfo.state === 'nogit') { /* carpeta local: no hay nada que comparar con GitHub */ }
  else if (gitInfo.state === 'behind') m.push(`${gitInfo.behind} novedad(es) en GitHub sin descargar`);
  else if (gitInfo.state === 'err') m.push('no se puede comprobar GitHub');
  return m.length ? { cls: 'warn', text: 'Revisar: ' + m.join(' · ') } : { cls: 'ok', text: 'Al día · ' + base + (gitInfo.state === 'nogit' ? '' : ' · GitHub sincronizado') };
}
function drawAvisos() {
  const keep = doc.scrollTop; doc.replaceChildren(); $('#crumb').textContent = 'Avisos';
  const head = el('div', 'dh'); head.append(el('h1', null, 'Avisos')); doc.append(head);
  const box = el('div', 'av');
  if (!dash) box.append(el('div', 'dsub', 'Calculando entregas…'));
  const prox = cercanas(), vistos = vistosAv();
  for (const i of prox) if (!vistos.has(kAviso(i))) avNuevos.add(kAviso(i));
  if (dash) box.append(el('div', 'dsub', prox.length ? 'Entregas en los próximos 7 días' : 'Sin entregas en los próximos 7 días'));
  for (const i of prox) { const d = diasHasta(i.fecha), r = el('div', 'avrow' + (d <= 3 ? ' hot' : '') + (avNuevos.has(kAviso(i)) ? ' nw' : '')); r.append(el('span', 'd', d === 0 ? 'HOY' : d === 1 ? 'mañana' : `en ${d} días`), el('span', null, `${i.sigla} · ${i.titulo}`)); box.append(r); }
  const h = el('div', 'bbhead'), cls = !bb ? 'busy' : bb.status === 'ok' ? 'ok' : bb.status === 'login' || bb.status === 'nunca' || bb.status === 'sin-campus' ? 'warn' : 'err';
  h.append(el('i', 'led ' + cls), el('b', null, campusNombre()), document.createTextNode(bb ? `${bb.msg}${bb.lastCheck ? ' · revisado ' + new Date(bb.lastCheck).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : ''}` : 'Cargando…'));
  const b1 = el('button', null, 'Revisar ahora'); b1.onclick = async () => { b1.disabled = true; b1.textContent = 'Revisando…'; await window.brain.bbCheck(); loadBB(); };
  const sinCampus = bb && bb.status === 'sin-campus';
  const b2 = el('button', null, sinCampus ? (esIcal() ? 'Añadir dirección del calendario' : 'Añadir URL del campus') : bb && bb.status === 'ok' ? 'Abrir ' + campusNombre() : 'Iniciar sesión (⚙ Ajustes)'); b2.onclick = () => (sinCampus && typeof editarPerfil === 'function' ? editarPerfil() : bb && bb.status === 'ok' ? window.brain.bbLogin() : showAjustes());
  const b4 = el('button', null, '⬇ Ingestar novedades…'); b4.onclick = abrirIngesta;
  h.append(b1); if (!esIcal() || sinCampus) h.append(b2); h.append(b4);
  box.append(h);
  for (const n of ((bb && bb.novedades) || []).slice(0, 8)) if (!n.visto) bbNuevos.add(n.fecha + '|' + n.texto);
  for (const n of ((bb && bb.novedades) || []).slice(0, 8)) {
    const r = el('div', 'avrow ' + (bbNuevos.has(n.fecha + '|' + n.texto) ? 'nw' : 'old')); r.append(el('span', 'd', n.fecha.replace(/ de 20\d\d/, '').replace(' de ', ' ')), el('span', null, `${n.sigla} · ${n.texto}`)); r.onclick = () => n.href && window.brain.external(n.href); box.append(r);
  }
  doc.append(box); if (ing) doc.append(ingPanel()); doc.scrollTop = keep;
  // al verlos se dan por vistos: la campana se apaga hasta que haya algo nuevo (sin recargar la pantalla, para no perder el resaltado)
  if (prox.length) { for (const i of prox) vistos.add(kAviso(i)); guardaVistos(vistos); }
  if (bb && bb.sinVer && !bbMarcando) { bbMarcando = true; window.brain.bbSeen().then(r => { bb = r; updateBell(); }); }
  updateBell();
}
function drawDash() {
  const keep = doc.scrollTop; doc.replaceChildren(); $('#crumb').textContent = 'Dashboard del curso';
  const led = dashLed(), head = el('div', 'dh'); head.append(el('h1', null, 'Dashboard del curso'));
  const pill = el('span', 'dled'); pill.append(Object.assign(el('i', 'led ' + led.cls)), document.createTextNode(led.text)); head.append(pill); doc.append(head);
  if (!dash || dash.error || !dash.items) { doc.append(el('p', 'dsub', dash && dash.error ? dash.error : 'Calculando desde el Brain…')); return; }
  const it = dash.items, hoy = dash.hoy;
  if (dashMsg) doc.append(el('div', 'dmsg' + (dashMsg.err ? ' err' : ''), dashMsg.text));
  doc.append(el('p', 'dsub', 'Calculado en esta app a partir de las fichas, entregas y apuntes de tu Brain'));
  // KPIs
  const ent = it.filter(i => i.col === 'sent' || i.col === 'done').length, cor = it.filter(i => i.col === 'done').length;
  const notas = it.filter(i => i.nota != null && i.max).map(i => i.nota / i.max * 10);
  const prox = it.filter(i => i.col === 'todo' && i.fecha && i.fecha >= hoy)[0];
  const k = el('div', 'kpis');
  const kp = it.length ? [[it.length, 'actividades'], [Math.round(ent / it.length * 100) + ' %', `entregadas (${ent})`], [cor, 'corregidas'],
      [notas.length ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(2).replace('.', ',') : '—', `nota media (${notas.length} notas)`],
      [prox ? fdate(prox.fecha) : '—', prox ? `próxima: ${prox.sigla} · ${prox.titulo.slice(0, 28)}` : 'próxima entrega']]
    : [[dash.asig.length, 'asignaturas'], [(dash.contenido || []).reduce((a, c) => a + c.apuntes, 0), 'apuntes'],
       [typeof buildCards === 'function' ? buildCards().length : '—', 'tarjetas de estudio'], [(dash.contenido || []).reduce((a, c) => a + c.pendientes, 0), 'puntos [pendiente] en tus apuntes']];
  for (const [v, l] of kp) { const c = el('div', 'kpi'); c.append(el('b', null, String(v)), el('span', null, l)); k.append(c); }
  doc.append(k);
  if (!it.length) {
    const vacio = el('div', 'av'); vacio.append(el('h4', null, 'Aún no hay entregas en tu Brain'));
    vacio.append(el('div', 'dsub', 'El dashboard se alimenta de lo que haya: notas en entregas/ (con due, status y grade), líneas con fecha en «Entregas», «Fechas» o «Calendario» de la ficha, y tareas «- [ ] … (AAAA-MM-DD)» en tus apuntes. Mientras tanto muestra el resumen de tu contenido.'));
    if (typeof dialogoEntrega === 'function') { const bt = el('button', 'chip on', '＋ Añadir entrega'); bt.onclick = () => dialogoEntrega().then(ok => ok && loadDash()); vacio.append(bt); }
    doc.append(vacio);
  }
  // Por asignatura
  doc.append(el('div', 'dsec', 'Por asignatura'));
  const t = el('table', 'dtab'), hd = el('tr'); for (const h of ['Asignatura', 'Apuntes', 'Entregadas', 'Corregidas', 'Nota media', 'Próxima']) hd.append(el('th', null, h)); t.append(hd);
  for (const a of dash.asig) {
    const tr = el('tr'), c0 = el('td'), sg = el('span', 'sg'); sg.style.setProperty('--c', COLOR[a.sigla.toLowerCase()]); sg.append(el('i'), document.createTextNode(a.sigla)); c0.append(sg);
    const c1 = el('td'), b = el('span', 'bar'), bi = el('i'); bi.style.width = (a.total ? a.entregadas / a.total * 100 : 0) + '%'; b.style.setProperty('--c', COLOR[a.sigla.toLowerCase()]); b.append(bi);
    c1.append(b, document.createTextNode(a.total ? `${a.entregadas}/${a.total}` : '—'));
    tr.append(c0, el('td', null, String(a.apuntes || 0)), c1, el('td', null, a.total ? String(a.corregidas) : '—'), el('td', null, a.notaMedia != null ? String(a.notaMedia).replace('.', ',') : '—'),
      el('td', null, a.proxima ? `${fdate(a.proxima.fecha)} · ${a.proxima.titulo.slice(0, 34)}` : (a.vencidas ? `${a.vencidas} vencida(s)` : '—')));
    t.append(tr);
  }
  doc.append(t);
  // Tablero
  doc.append(el('div', 'dsec', 'Tablero de entregas'));
  const chips = el('div', 'chips');
  for (const s of ['ALL', ...dash.asig.filter(a => a.total).map(a => a.sigla)]) { const c = el('button', 'chip' + (dashFilter === s ? ' on' : ''), s === 'ALL' ? 'Todas' : s); c.onclick = () => { dashFilter = s; drawDash(); }; chips.append(c); }
  if (it.length && typeof dialogoEntrega === 'function') { const bt = el('button', 'chip', '＋ Añadir entrega'); bt.onclick = () => dialogoEntrega().then(ok => ok && loadDash()); chips.append(bt); }
  doc.append(chips);
  const board = el('div', 'board');
  for (const [col, name] of COLS) {
    const list = it.filter(i => i.col === col && (dashFilter === 'ALL' || i.sigla === dashFilter)), cm = el('div', 'colm');
    cm.append(el('h4', null, `${name} · ${list.length}`));
    for (const i of (col === 'done' || col === 'sent' ? [...list].reverse() : list)) {
      const c = el('div', 'kc'); c.style.setProperty('--c', COLOR[i.sigla.toLowerCase()] || 'var(--mut)');
      c.append(document.createTextNode(`${i.sigla} · ${i.titulo}`));
      const sm = el('small', i.vencida ? 'v' : null, `${fdate(i.fecha)}${i.hora ? ' ' + i.hora : ''}${i.notaTexto ? ' · nota ' + i.notaTexto : ''}${i.vencida ? ' · vencida' : ''}`); c.append(sm); c.title = i.fuente; c.draggable = true;
      c.ondragstart = (e) => { e.dataTransfer.setData('application/x-brain-card', JSON.stringify({ sigla: i.sigla, titulo: i.titulo, fecha: i.fecha, fuente: i.fuente, col: i.col })); e.dataTransfer.effectAllowed = 'move'; c.classList.add('drag'); };
      c.ondragend = () => c.classList.remove('drag');
      cm.append(c);
    }
    cm.ondragover = (e) => { if (e.dataTransfer.types.includes('application/x-brain-card')) { e.preventDefault(); cm.classList.add('over'); } };
    cm.ondragleave = (e) => { if (!cm.contains(e.relatedTarget)) cm.classList.remove('over'); };
    cm.ondrop = (e) => {
      cm.classList.remove('over'); const raw = e.dataTransfer.getData('application/x-brain-card'); if (!raw) return; e.preventDefault();
      try { const card = JSON.parse(raw); if (card.col !== col) moveCard(card, col); } catch {}
    };
    board.append(cm);
  }
  doc.append(board);
  const f = el('div', 'dfoot'); f.append(document.createTextNode(`Calculado ${new Date(dash.generado).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}. Nota media = media simple de las notas con puntuación x/10. Las prácticas futuras de BRS salen del calendario de su ficha. Arrastra una tarjeta a otra columna para cambiar su estado: se guarda en el Brain (nota de entregas y ficha). `));
  if (dashUrl()) { const a = el('a', null, 'Versión web ↗'); a.onclick = () => window.brain.external(dashUrl()); f.append(a); }
  doc.append(f);
  doc.scrollTop = keep;
}
// Mover una tarjeta: escribe en el Brain (nota de entregas + ficha) y recalcula
async function doMove(card, col, nota) {
  const r = await window.brain.dashMove(card, col, nota);
  const name = COLS.find(c => c[0] === col)[1];
  dashMsg = r.ok ? { text: `«${card.titulo}» movida a ${name}${r.created ? ' · nota de entrega creada' : ''} · guardado en ${r.nota}` } : { err: true, text: 'No se pudo mover: ' + r.msg };
  await loadDash(); refreshStatus();
}
const gm = $('#gmodal'); let pendingMove = null;
function moveCard(card, col) {
  if (col !== 'done') return doMove(card, col, '');
  pendingMove = { card, col }; $('#g-t').textContent = `${card.sigla} · ${card.titulo}`; $('#g-nota').value = ''; gm.hidden = false; $('#g-nota').focus();
}
$('#g-cancel').onclick = () => { gm.hidden = true; pendingMove = null; };
$('#g-go').onclick = () => { const m = pendingMove; gm.hidden = true; pendingMove = null; if (m) doMove(m.card, m.col, $('#g-nota').value.trim()); };
$('#g-nota').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#g-go').click(); if (e.key === 'Escape') $('#g-cancel').click(); });
$('#dbtn').onclick = () => { dashMsg = null; showDash(); };
$('#hobtn').onclick = () => showHorario();
$('#msgbtn').onclick = () => showMensajes();
$('#rbtn').onclick = () => showPreguntar();
$('#ntbtn').onclick = () => showNotas();
$('#setbtn').onclick = () => showAjustes();
if (window.brain.onIaTrozo) window.brain.onIaTrozo(iaTrozo);
window.brain.onMensajesChanged(loadMsgs); window.brain.onMensajes(() => showMensajes());
// ---- Horario: semana por días y franjas, leído de 01-Curso/calendario*.md (celdas «AAAA-MM-DD SIGLA») y de las franjas «Bloque 1: 17:30 – 20:00» de 01-Curso/curso.md. Solo lectura ----
// <parse-horario>
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sumaDias = (iso, n) => { const d = new Date(iso + 'T00:00'); d.setDate(d.getDate() + n); return isoDe(d); };
const lunesDe = (iso) => { const d = new Date(iso + 'T00:00'); return sumaDias(iso, -((d.getDay() + 6) % 7)); };
function parseHorario(cal, curso) {
  const franjas = [];
  for (const m of String(curso || '').matchAll(/Bloque\s*(\d)\s*:\s*(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/g)) franjas[+m[1] - 1] = m[2] + '–' + m[3];
  const dias = {};
  for (const l of String(cal || '').split(/\r?\n/)) {
    if (!/^\s*\|/.test(l)) continue;
    for (const c of l.split('|')) {
      const m = c.trim().match(/^(\d{4}-\d{2}-\d{2})\s*(.*)$/); if (!m) continue;
      const txt = m[2].replace(/\*+/g, '').trim();
      if (!txt) { dias[m[1]] = { festivo: 'Sin clase' }; continue; }
      if (/festivo/i.test(txt)) { dias[m[1]] = { festivo: txt }; continue; }
      // «X / Y» = bloque 1 / bloque 2; «—» = ese bloque sin clase; «(ON)» = sesión online; lo que sigue a la sigla es la nota (p. ej. la profesora)
      const bloques = txt.split(/\s+\/\s+/).map(b => {
        const on = /\(ON\)/i.test(b), s = b.replace(/\(ON\)/ig, '').trim(), w = s.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ0-9]{2,})\s*(.*)$/);
        return w ? { sigla: w[1].toUpperCase(), extra: w[2].trim(), on } : null;
      });
      dias[m[1]] = { bloques };
    }
  }
  return { franjas, dias };
}
// </parse-horario>
let hor = null, horSem = null;   // hor = { ok, dias, franjas, fuente } | { ok: false, msg }; horSem = lunes de la semana que se ve
async function cargaHorario() {
  let r; try { r = await window.brain.horarioData(); } catch (e) { r = { ok: false, msg: String(e) }; }
  if (r && r.ok && r.cal) { try { hor = { ok: true, ...parseHorario(r.cal, r.curso), fuente: r.fuente }; } catch (e) { hor = { ok: false, msg: 'No se pudo leer el calendario: ' + e.message }; } }
  else hor = { ok: false, msg: (r && r.msg) || 'Sin calendario' };
  if (view === 'horario') drawHorario();
  if (typeof hoyToca === 'function') hoyToca(true);
}
function showHorario(push = true) {
  view = 'horario'; current = null;
  if (push && hist[hp] !== '@horario') { hist = hist.slice(0, hp + 1); hist.push('@horario'); hp = hist.length - 1; }
  $('#crumb').textContent = 'Horario'; btns(); markOn(); drawHorario(); cargaHorario(); loadDash();
}
function drawHorario() {
  const keep = doc.scrollTop; doc.replaceChildren(); $('#crumb').textContent = 'Horario';
  const head = el('div', 'dh'); head.append(el('h1', null, 'Horario')); doc.append(head);
  if (!hor) { doc.append(el('p', 'dsub', 'Leyendo el calendario…')); return; }
  if (!hor.ok) {
    doc.append(el('p', 'dsub', hor.msg));
    doc.append(el('p', 'dsub', 'El horario se lee de 01-Curso/calendario*.md (tabla con celdas «AAAA-MM-DD SIGLA») y de 01-Curso/curso.md (franjas «Bloque 1: 17:30 – 20:00»).')); return;
  }
  const fechas = Object.keys(hor.dias).sort(), hoy = (dash && dash.hoy) || isoDe(new Date());
  if (!fechas.length) { doc.append(el('p', 'dsub', 'El calendario no tiene ninguna fecha con el formato AAAA-MM-DD.')); return; }
  const min = lunesDe(fechas[0]), max = lunesDe(fechas[fechas.length - 1]);
  if (!horSem) horSem = lunesDe(hoy < fechas[0] ? fechas[0] : hoy > fechas[fechas.length - 1] ? fechas[fechas.length - 1] : hoy);
  horSem = horSem < min ? min : horSem > max ? max : horSem;
  const fmt = (iso, o) => new Date(iso + 'T00:00').toLocaleDateString('es-ES', o), nav = el('div', 'hnav');
  const ant = el('button', null, '‹ Anterior'), sig = el('button', null, 'Siguiente ›'), hb = el('button', null, 'Hoy');
  ant.disabled = horSem <= min; sig.disabled = horSem >= max;
  ant.onclick = () => { horSem = sumaDias(horSem, -7); drawHorario(); }; sig.onclick = () => { horSem = sumaDias(horSem, 7); drawHorario(); }; hb.onclick = () => { horSem = null; drawHorario(); };
  const fin = sumaDias(horSem, 4);
  nav.append(ant, el('b', null, `Semana del ${fmt(horSem, { day: 'numeric' })} al ${fmt(fin, { day: 'numeric', month: 'long', year: 'numeric' })}`), sig, hb); doc.append(nav);
  const nB = Math.max(hor.franjas.length, ...Object.values(hor.dias).map(d => (d.bloques || []).length), 1), grid = el('div', 'hgrid');
  const pend = dash && dash.items ? dash.items.filter(i => (i.col === 'todo' || i.col === 'doing') && i.fecha) : [];
  for (let k = 0; k < 5; k++) {
    const iso = sumaDias(horSem, k), info = hor.dias[iso], card = el('div', 'hday' + (iso === hoy ? ' hoy' : '') + (!info || info.festivo ? ' off' : ''));
    const dh = el('div', 'hdh'); dh.append(el('b', null, fmt(iso, { weekday: 'long' })), el('span', null, fmt(iso, { day: 'numeric', month: 'short' }))); card.append(dh);
    if (!info) card.append(el('div', 'hnone', 'Fuera del calendario'));
    else if (info.festivo) card.append(el('div', 'hnone', info.festivo));
    else for (let b = 0; b < nB; b++) {
      const bl = info.bloques.length === 1 ? info.bloques[0] : info.bloques[b], row = el('div', 'hbl'); row.append(el('small', null, hor.franjas[b] || `Bloque ${b + 1}`));
      if (!bl) row.append(el('div', 'hnone', 'Sin clase'));
      else { const c = el('div', 'hcls'); c.style.setProperty('--c', COLOR[bl.sigla.toLowerCase()] || 'var(--acc)'); c.title = NOMBRES[bl.sigla.toLowerCase()] || bl.sigla; c.append(el('b', null, bl.sigla)); if (bl.extra) c.append(document.createTextNode(' ' + bl.extra)); if (bl.on) c.append(el('span', 't', 'online')); row.append(c); }
      card.append(row);
    }
    for (const i of pend.filter(x => x.fecha === iso)) card.append(el('div', 'hent', `📌 ${i.sigla} · ${i.titulo}`));
    grid.append(card);
  }
  doc.append(grid, el('p', 'dsub', `Fuente: ${hor.fuente} (solo lectura). 📌 = entregas pendientes de esa semana, del dashboard.`)); doc.scrollTop = keep;
}
// ---- Mensajes privados de Blackboard (solo escritorio): una sección por asignatura con sus conversaciones, como «Mensajes» del campus. Solo lectura ----
let msgs = null, msgLeyendo = false, msgHilo = null;   // msgHilo = conversación abierta ({ courseId, convId, titulo, cargando, error, data })
const fechaMsg = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); };
function updateMsgBtn() { const b = $('#msgbtn'); if (!b) return; b.replaceChildren(document.createTextNode('💬 Mensajes')); if (msgs && msgs.sinLeer) b.append(el('b', null, String(msgs.sinLeer))); }
async function loadMsgs() {
  try { msgs = await window.brain.mensajesState(); } catch { msgs = null; }
  if (msgs && (msgs.ok === false || !msgs.status)) msgs = null;   // en el móvil no hay mensajes: el botón va oculto
  updateMsgBtn(); if (view === 'mensajes') redibujaMsgsFondo();
}
async function refrescaMsgs() {
  if (msgLeyendo) return; msgLeyendo = true; redibujaMsgsFondo();
  try { const r = await window.brain.mensajesCheck(); if (r && r.status) msgs = r; } catch {}
  msgLeyendo = false; updateMsgBtn(); if (view === 'mensajes') redibujaMsgsFondo();
}
function showMensajes(push = true) {
  view = 'mensajes'; current = null; msgHilo = null;   // un mensaje a medias NO se descarta al salir y volver (ni al pulsar la notificación): se cierra con «Cancelar» o «Volver a Mensajes»
  if (push && hist[hp] !== '@mensajes') { hist = hist.slice(0, hp + 1); hist.push('@mensajes'); hp = hist.length - 1; }
  $('#crumb').textContent = 'Mensajes'; btns(); markOn(); drawMensajes();
  loadMsgs().then(() => { if (msgs && !['no-aplica', 'sin-campus', 'login'].includes(msgs.status) && (!msgs.lastCheck || Date.now() - new Date(msgs.lastCheck) > 5 * 60000)) refrescaMsgs(); });   // al abrir: lo guardado al instante y, si tiene más de 5 min, se vuelve a leer
}
function drawMensajes() {
  if (msgNuevo && msgs) return drawNuevo();
  if (msgHilo && msgs) return drawHilo();
  const keep = doc.scrollTop; doc.replaceChildren(); $('#crumb').textContent = 'Mensajes';
  const head = el('div', 'dh'); head.append(el('h1', null, 'Mensajes')); doc.append(head);
  if (!msgs) { doc.append(el('p', 'dsub', 'Los mensajes de Blackboard solo están en la app de escritorio.')); return; }
  if (typeof bannerBorrador === 'function') { const bb2 = bannerBorrador(); if (bb2) doc.append(bb2); }
  const box = el('div', 'av'), h = el('div', 'bbhead'), st = msgs.status;
  const cls = msgLeyendo ? 'busy' : st === 'ok' ? 'ok' : ['login', 'nunca', 'sin-campus', 'no-aplica'].includes(st) ? 'warn' : 'err';
  const hora = msgs.lastCheck ? ' · revisado ' + new Date(msgs.lastCheck).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
  h.append(el('i', 'led ' + cls), el('b', null, 'Blackboard'), document.createTextNode(msgLeyendo ? (msgs.msg || 'Leyendo…') : msgs.msg + hora));
  if (!['no-aplica', 'sin-campus'].includes(st)) {
    const bAct = el('button', null, msgLeyendo ? 'Leyendo…' : 'Actualizar'); bAct.disabled = msgLeyendo; bAct.onclick = refrescaMsgs; h.append(bAct);
    if (cursosMsg().length && st !== 'login') { const bn = el('button', 'pri', '✉ Nuevo mensaje'); bn.onclick = () => abrirNuevo(); h.append(bn); }
    if (st === 'login' || st === 'nunca') { const bL = el('button', null, 'Iniciar sesión (⚙ Ajustes)'); bL.onclick = () => showAjustes(); h.append(bL); }
  }
  box.append(h); doc.append(box);
  const cursos = [...(msgs.cursos || [])], ult = (c) => (c.conversaciones[0] && c.conversaciones[0].actualizada) || '';
  const con = cursos.filter(c => c.conversaciones.length).sort((a, b) => ult(b).localeCompare(ult(a))), sin = cursos.filter(c => !c.conversaciones.length);
  for (const c of con) {
    const sec = el('div', 'msg-cur'), hd = el('div', 'msg-h'); hd.style.setProperty('--c', COLOR[c.sigla.toLowerCase()] || 'var(--acc)');
    hd.append(el('i'), el('b', null, NOMBRES[c.sigla.toLowerCase()] || (c.nombre || '').replace(/\s*\([^)]*\)\s*$/, '') || c.sigla), el('span', 'msg-n', `${c.conversaciones.length} conversación(es)`));
    if (c.sinLeer) hd.append(el('span', 'msg-un', `${c.sinLeer} sin leer`));
    const bnu = el('button', null, '✉ Nuevo mensaje'); bnu.onclick = () => abrirNuevo(c.courseId); hd.append(bnu);
    const ab = el('button', null, 'Abrir en Blackboard ↗'); ab.onclick = () => window.brain.external(`${msgs.campus}/ultra/courses/${c.courseId}/messages`); hd.append(ab); sec.append(hd);
    for (const v of c.conversaciones) {
      const r = el('div', 'msg-row' + (v.leido ? '' : ' nw')), top = el('div', 'msg-top');
      top.append(el('b', null, v.remitente || '(sin remitente)'), el('span', null, fechaMsg(v.fecha)), el('span', 't', v.aTodos ? 'Para: todos los miembros del curso' : 'Mensaje directo'));
      if (v.total > 1) top.append(el('span', 't', `${v.total} mensajes en la conversación`));
      r.append(top, el('div', 'msg-txt', v.texto || '(sin texto)')); r.title = v.leido ? 'Ver la conversación completa' : 'Ver la conversación completa (Blackboard la marcará como leída, igual que si la abres allí)'; r.onclick = () => abrirHilo(c, v); sec.append(r);
    }
    if (c.hayMas) sec.append(el('div', 'dsub', 'Hay más conversaciones en Blackboard que no se han descargado.'));
    if (c.sinRespuesta) sec.append(el('div', 'dsub', 'Blackboard no respondió en la última lectura: se muestra lo guardado.'));
    doc.append(sec);
  }
  if (!con.length && !msgLeyendo && cursos.length) doc.append(el('p', 'dsub', 'No hay conversaciones guardadas todavía. Pulsa «Actualizar».'));
  if (sin.length) doc.append(el('p', 'dsub', 'Sin mensajes: ' + sin.map(c => c.sigla).join(', ')));
  doc.append(el('p', 'dsub', 'Se muestra el último mensaje de cada conversación, como en la lista de Blackboard; pulsa una para ver el historial completo. Solo lectura: no se responde ni se borra nada; al abrir una conversación sin leer, Blackboard la marca como leída, igual que si la abres en el campus. Los mensajes se guardan solo en tu equipo (carpeta de datos de la app), fuera del Brain y de Git.'));
  doc.scrollTop = keep;
}
async function abrirHilo(c, v, forzar) {
  const nom = NOMBRES[c.sigla.toLowerCase()] || (c.nombre || '').replace(/\s*\([^)]*\)\s*$/, '') || c.sigla;
  msgHilo = { courseId: c.courseId, convId: v.id, titulo: `${nom} · ${v.remitente || 'conversación'}`, cargando: true }; drawMensajes();
  let r; try { r = await window.brain.mensajesHilo(c.courseId, v.id, v.total, !!forzar); } catch (e) { r = { ok: false, msg: String(e.message || e) }; }
  if (!msgHilo || msgHilo.convId !== v.id) return;   // mientras tanto saliste de la conversación
  msgHilo = r && r.ok ? { ...msgHilo, cargando: false, data: r } : { ...msgHilo, cargando: false, error: (r && r.msg) || 'No se pudo abrir la conversación', login: !!(r && r.login) };
  loadMsgs();   // los contadores de no leídos cambian al abrirla
}
function drawHilo() {
  const keep = doc.scrollTop, H = msgHilo; doc.replaceChildren(); $('#crumb').textContent = 'Mensajes';
  const head = el('div', 'dh'); head.append(el('h1', null, 'Conversación')); doc.append(head);
  const bar = el('div', 'bbhead'), back = el('button', null, '‹ Volver a Mensajes'); back.onclick = () => { msgHilo = null; drawMensajes(); };
  const ab = el('button', null, 'Abrir en Blackboard ↗'); ab.onclick = () => window.brain.external(`${msgs.campus}/ultra/courses/${H.courseId}/messages/edit/${H.convId}?courseId=${H.courseId}&offset=0&count=3`);
  bar.append(back, el('b', null, H.titulo), ab); doc.append(bar);
  if (H.cargando) { doc.append(el('p', 'dsub', 'Abriendo la conversación en Blackboard… puede tardar unos segundos.')); return; }
  if (H.error) {
    doc.append(el('p', 'dsub', H.error)); const b = el('button', null, H.login ? 'Iniciar sesión (⚙ Ajustes)' : 'Reintentar');
    b.onclick = () => (H.login ? showAjustes() : abrirHilo({ courseId: H.courseId, sigla: '', nombre: H.titulo.split(' · ')[0] }, { id: H.convId, remitente: H.titulo.split(' · ').slice(1).join(' · ') }, true)); doc.append(b); return;
  }
  const d = H.data;
  if (d.participantes && d.participantes.length) doc.append(el('p', 'dsub', 'Personas en la conversación: ' + d.participantes.join(', ')));
  for (const m of d.mensajes) {
    const bub = el('div', 'msg-bub' + (m.leido ? '' : ' nw')), top = el('div', 'msg-top');
    top.append(el('b', null, m.remitente || '(sin remitente)'), el('span', null, fechaMsg(m.fecha))); bub.append(top, el('div', 'msg-full', m.texto || '(sin texto)')); doc.append(bub);
  }
  if (d.hayMas) doc.append(el('p', 'dsub', 'Hay más mensajes en Blackboard que no se han descargado.'));
  const f = el('div', 'bbhead'), ref = el('button', null, 'Volver a leer'); ref.onclick = () => abrirHilo({ courseId: H.courseId, sigla: '', nombre: H.titulo.split(' · ')[0] }, { id: H.convId, remitente: H.titulo.split(' · ').slice(1).join(' · ') }, true);
  f.append(document.createTextNode(`${d.mensajes.length} mensaje(s) · ${d.deCache ? 'guardado en tu equipo' + (d.leidoEn ? ' el ' + fechaMsg(d.leidoEn) : '') : 'leído ahora de Blackboard'}`), ref); doc.append(f);
  doc.scrollTop = keep;
}
// ---- Mensaje nuevo: asignatura, destinatarios, texto → pantalla de confirmación → envío por la redacción de Blackboard (ver mensajes.js) ----
// Los refrescos de fondo (revisión cada 30 min, relectura, nueva sesión) no redibujan el formulario «Nuevo mensaje» mientras lo estás editando: se perdía el foco, la búsqueda de destinatarios y lo que ibas escribiendo
const redibujaMsgsFondo = () => { if (msgNuevo && msgNuevo.fase === 'editar') return; drawMensajes(); };
let msgNuevo = null;   // { courseId, dest: [{ id, nombre, rol }], texto, copia, fase: 'editar' | 'confirmar' | 'enviando' | 'hecho', res }
const cursosMsg = () => (msgs && msgs.cursos ? msgs.cursos.filter(c => c.habilitado !== false) : []);
const nombreCursoMsg = (c) => NOMBRES[c.sigla.toLowerCase()] || (c.nombre || '').replace(/\s*\([^)]*\)\s*$/, '') || c.sigla;
function abrirNuevo(courseId) {
  const cs = cursosMsg(); if (!cs.length) return;
  msgHilo = null; msgNuevo = { courseId: (courseId && cs.some(c => c.courseId === courseId)) ? courseId : cs[0].courseId, dest: [], texto: '', copia: false, fase: 'editar' }; drawMensajes();
}
function cierraNuevo() { msgNuevo = null; if (typeof borraBorrador === 'function') borraBorrador(); try { window.brain.mensajesCerrarRedaccion(); } catch {} drawMensajes(); }
function drawNuevo() {
  const keep = doc.scrollTop, N = msgNuevo; doc.replaceChildren(); $('#crumb').textContent = 'Mensajes';
  const head = el('div', 'dh'); head.append(el('h1', null, 'Nuevo mensaje')); doc.append(head);
  const cur = cursosMsg().find(c => c.courseId === N.courseId) || cursosMsg()[0];
  const bar = el('div', 'bbhead'), back = el('button', null, '‹ Volver a Mensajes'); back.onclick = cierraNuevo; bar.append(back, el('b', null, nombreCursoMsg(cur))); doc.append(bar);
  const box = el('div', 'msg-new');
  if (N.fase === 'enviando') { box.append(el('p', null, 'Enviando el mensaje por Blackboard… puede tardar unos segundos. No cierres la app.')); doc.append(box); return; }
  if (N.fase === 'hecho') {
    const r = N.res || {}, ok = r.ok && r.enviado === true, dudoso = r.enviado === 'desconocido';
    box.append(el('p', 'msg-res-t ' + (ok ? 'ok' : 'ko'), ok ? '✓ Mensaje enviado' : dudoso ? '⚠ No se pudo confirmar el envío' : 'No se ha enviado'), ok ? el('span') : el('p', null, r.msg || ''));
    if (dudoso) box.append(el('p', 'msg-warn', 'Comprueba en Blackboard (Mensajes de la asignatura) si el mensaje salió antes de volver a enviarlo, para no mandarlo dos veces.'));
    const row = el('div', 'row');
    if (ok) { const b = el('button', 'pri', 'Volver a Mensajes'); b.onclick = cierraNuevo; row.append(b); }
    else {
      const b1 = el('button', 'pri', 'Volver al mensaje'); b1.onclick = () => { N.fase = 'editar'; drawMensajes(); }; row.append(b1);
      if (r.login) { const bl = el('button', null, 'Iniciar sesión (⚙ Ajustes)'); bl.onclick = () => showAjustes(); row.append(bl); }
      const bc = el('button', null, 'Descartar'); bc.onclick = cierraNuevo; row.append(bc);
    }
    box.append(row); doc.append(box); return;
  }
  if (N.fase === 'confirmar') {
    box.append(el('p', 'msg-res-t', `Vas a enviar este mensaje a ${N.dest.length} persona(s) en ${nombreCursoMsg(cur)}`));
    const ul = el('div', 'msg-chips'); for (const d of N.dest) ul.append(el('span', 'msg-chip', d.nombre + (d.rol ? ' · ' + d.rol : ''))); box.append(ul);
    box.append(el('div', 'msg-quote', N.texto), el('p', 'dsub', N.copia ? 'Se enviará también una copia por correo a los destinatarios.' : 'Sin copia por correo.'));
    box.append(el('p', 'msg-warn', 'Se enviará de verdad desde tu cuenta de Blackboard y no se puede deshacer.'));
    const row = el('div', 'row'), b1 = el('button', null, '‹ Volver a editar'), b2 = el('button', 'pri', 'Enviar ahora');
    b1.onclick = () => { N.fase = 'editar'; drawMensajes(); };
    b2.onclick = async () => {
      b2.disabled = b1.disabled = true; N.fase = 'enviando'; drawMensajes();
      let r; try { r = await window.brain.mensajesEnviar({ courseId: N.courseId, destinatarios: N.dest.map(d => ({ id: d.id, nombre: d.nombre })), texto: N.texto, copia: N.copia }); } catch (e) { r = { ok: false, enviado: 'desconocido', msg: 'Error: ' + String(e.message || e) + '. Comprueba en Blackboard antes de volver a enviarlo.' }; }
      if (!msgNuevo) return; N.fase = 'hecho'; N.res = r || { ok: false, enviado: false, msg: 'Sin respuesta' }; if (r && r.ok && r.enviado !== false && typeof borraBorrador === 'function') borraBorrador();   // enviado (o no confirmado): el borrador ya no debe reaparecer; si no se envió, se conserva
      drawMensajes();
    };
    row.append(b1, b2); box.append(row); doc.append(box); return;
  }
  // fase 'editar'
  const sel = el('select'); for (const c of cursosMsg()) { const o = el('option', null, nombreCursoMsg(c)); o.value = c.courseId; if (c.courseId === N.courseId) o.selected = true; sel.append(o); }
  sel.onchange = () => { N.courseId = sel.value; N.dest = []; try { window.brain.mensajesCerrarRedaccion(); } catch {} drawMensajes(); };
  box.append(el('label', 'msg-lbl', 'Asignatura'), sel, el('label', 'msg-lbl', 'Para'));
  const chips = el('div', 'msg-chips'), res = el('div', 'msg-resl'), q = el('input'), estado = el('div', 'dsub');
  const pintaChips = () => { chips.replaceChildren(); if (!N.dest.length) chips.append(el('span', 'dsub', 'Nadie todavía: busca por nombre o apellidos.')); for (const d of N.dest) { const c = el('span', 'msg-chip', d.nombre + (d.rol ? ' · ' + d.rol : '')), x = el('button', null, '✕'); x.title = 'Quitar'; x.onclick = () => { N.dest = N.dest.filter(y => y.id !== d.id); pintaChips(); pintaBoton(); pintaRes(N.ultimos || []); }; c.append(x); chips.append(c); } };
  const pintaRes = (lista) => { N.ultimos = lista; res.replaceChildren(); for (const p of lista) { const ya = N.dest.some(d => d.id === p.id), r = el('div', 'msg-r' + (ya ? ' ya' : '')); r.append(el('b', null, p.nombre), el('span', null, [p.rol, p.usuario].filter(Boolean).join(' · ') + (ya ? ' · añadido' : ''))); if (!ya) r.onclick = () => { N.dest.push({ id: p.id, nombre: p.nombre, rol: p.rol }); pintaChips(); pintaBoton(); pintaRes(lista); }; res.append(r); } };
  let t = null, serie = 0;
  q.placeholder = 'Buscar por nombre o apellidos (mínimo 2 letras)…'; q.autocomplete = 'off'; q.value = N.busqueda || ''; q.addEventListener('input', () => { N.busqueda = q.value; });   // la búsqueda se conserva al volver a editar
  q.oninput = () => {
    clearTimeout(t); const v = q.value.trim(); if (v.length < 2) { estado.textContent = ''; pintaRes([]); return; }
    t = setTimeout(async () => {
      const mi = ++serie; estado.textContent = 'Buscando en Blackboard… la primera vez tarda unos segundos.';
      let r; try { r = await window.brain.mensajesDestinatarios(N.courseId, v); } catch (e) { r = { ok: false, msg: String(e.message || e) }; }
      if (mi !== serie || !msgNuevo || msgNuevo !== N) return;   // llegó tarde: hay otra búsqueda más reciente
      estado.textContent = r.ok ? (r.resultados.length ? '' : 'Sin resultados.') : (r.msg || 'No se pudo buscar'); pintaRes(r.ok ? r.resultados : []);
    }, 600);
  };
  box.append(chips, q, estado, res);
  box.append(el('label', 'msg-lbl', 'Mensaje'));
  const ta = el('textarea', 'msg-ta'); ta.rows = 8; ta.maxLength = 5000; ta.placeholder = 'Escribe el mensaje…'; ta.value = N.texto;
  const cont = el('div', 'dsub'), pintaCont = () => { cont.textContent = `${ta.value.length} / 5000`; };
  ta.oninput = () => { N.texto = ta.value; pintaCont(); pintaBoton(); };
  const cb = el('input'); cb.type = 'checkbox'; cb.checked = N.copia; cb.onchange = () => { N.copia = cb.checked; };
  const lab = el('label', 'msg-chk'); lab.append(cb, document.createTextNode(' Enviar también una copia por correo electrónico a los destinatarios'));
  if (typeof borradorIA === 'function') box.append(borradorIA(ta, N, () => { pintaCont(); pintaBoton(); }));   // borrador con IA (opcional): rellena el texto, nunca envía
  box.append(ta, cont, lab);
  const row = el('div', 'row'), bc = el('button', null, 'Cancelar'), br = el('button', 'pri', 'Revisar y enviar');
  bc.onclick = cierraNuevo; br.onclick = () => { N.texto = ta.value.trim(); N.copia = cb.checked; N.fase = 'confirmar'; drawMensajes(); };
  const pintaBoton = () => { br.disabled = !(N.dest.length && ta.value.trim()); };
  row.append(bc, br); box.append(row); doc.append(box); pintaChips(); pintaRes(N.ultimos || []); pintaCont(); pintaBoton(); doc.scrollTop = keep;
}
// ---- Ingesta de lo nuevo del campus (Blackboard, Moodle, Canvas o calendario iCal): ficheros → _entrada, notas/estados → Brain, redacción → Claude ----
// Panel dentro de Avisos (debajo de las novedades). El estado vive en `ing`, así sobrevive a los redibujados de la pantalla.
const fmtTam = (b) => !b ? '' : b >= 1073741824 ? (b / 1073741824).toFixed(1).replace('.', ',') + ' GB' : (Math.round(b / 1048576) || 1) + ' MB';
const VID = /\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|wmv)$/i;
const NM = { todo: 'Por hacer', doing: 'En curso', sent: 'Entregado', done: 'Corregido' };
let ing = null;   // null = cerrado · { fase: 'leyendo'|'lista'|'aplicando'|'hecho'|'error', msg, r, sel:Set('f:id'|'c:id'), bajados, prog }
window.brain.onBBIProgress && window.brain.onBBIProgress((p) => {   // progreso de la descarga en curso (se pinta directo, sin redibujar)
  if (!ing) return; ing.prog = p; pintaProg();
});
function pintaProg() {
  const t = document.getElementById('i-progt'), b = document.getElementById('i-progb'); if (!t || !b || !ing || !ing.prog) return;
  const p = ing.prog, pct = p.total ? Math.min(100, Math.round(p.hecho / p.total * 100)) : null;
  t.textContent = `Descargando ${p.idx}/${p.n}: ${p.nombre} — ${pct != null ? pct + ' % · ' : ''}${fmtTam(p.hecho)}${p.total ? ' de ' + fmtTam(p.total) : ''}`;
  b.style.width = (pct != null ? pct : 100) + '%';
}
async function abrirIngesta() {
  if (ing && (ing.fase === 'leyendo' || ing.fase === 'aplicando')) return;
  ing = { fase: 'leyendo', msg: `Leyendo ${campusNombre()} (cursos, ficheros, calificaciones y plazos)… puede tardar un minuto.`, sel: new Set(), bajados: [] };
  drawAvisos(); scrollIng();
  const r = await window.brain.bbiScan(); if (!ing) return; ing.r = r;
  if (!r.ok) { ing.fase = 'error'; ing.msg = r.login ? `Hace falta iniciar sesión en ${campusNombre()} (⚙ Ajustes → Sesión del campus).` : `No se pudo leer ${campusNombre()}: ` + r.msg; }
  else {
    ing.fase = 'lista';
    for (const f of r.ficheros) {   // marcado por defecto: lo que aún no tienes; los vídeos grandes o de tamaño desconocido no se marcan solos
      const enl = f.tipo === 'enlace', marcada = enl ? !f.ingestado : !f.enEntrada && !f.ingestado && !(f.video && (!f.size || f.size > 100 * 1048576));
      if (marcada) ing.sel.add('f:' + f.id);
    }
    for (const c of r.cambios) ing.sel.add('c:' + c.id);
  }
  if (view === 'avisos') { drawAvisos(); scrollIng(); }
}
const scrollIng = () => { const p = document.getElementById('ing'); if (p) p.scrollIntoView({ block: 'nearest' }); };
function ingPanel() {
  const P = el('div', 'ing'); P.id = 'ing';
  const top = el('div', 'bbhead'); top.append(el('b', null, 'Novedades del campus'));
  const cerrar = el('button', null, 'Cerrar'); cerrar.onclick = () => { if (ing && ing.fase === 'aplicando') return; ing = null; drawAvisos(); };
  top.append(cerrar); P.append(top);
  P.append(el('p', 'note', ing.msg || ''));
  const r = ing.r;
  if (ing.fase === 'lista' && r) {
    const arch = r.ficheros.filter(f => f.tipo !== 'enlace'), enl = r.ficheros.filter(f => f.tipo === 'enlace');
    const cuenta = el('span', 'note'), ir = el('button', 'pri', 'Aplicar selección');
    const act = () => { const n = ing.sel.size; cuenta.textContent = `${n} marcada(s)`; ir.disabled = !n; };
    const body = el('div', 'ibody');
    const fila = (kind, id, titulo, sub, tag, extra) => {
      const k = kind + ':' + id, row = el('label', 'irow'), cb = el('input'); cb.type = 'checkbox'; cb.checked = ing.sel.has(k);
      cb.onchange = () => { cb.checked ? ing.sel.add(k) : ing.sel.delete(k); act(); };
      const d = el('div'); d.append(document.createTextNode(titulo)); if (tag) d.append(el('span', 't', tag)); d.append(el('small', null, sub)); if (extra) d.append(extra);
      row.append(cb, d); body.append(row);
    };
    body.append(el('div', 'ih', 'Ficheros nuevos → _entrada de cada asignatura'));
    if (!arch.length) body.append(el('div', 'dsub', 'Nada nuevo en los últimos 45 días (o ya descargado).'));
    for (const f of arch) fila('f', f.id, `${f.video ? '🎬 ' : ''}${f.sigla.toUpperCase()} · ${f.nombre}`, `${f.ruta || 'raíz del curso'}${f.creado ? ' · creado ' + f.creado.slice(0, 10) : ''}${f.size ? ' · ' + fmtTam(f.size) : ''}`, f.ingestado ? 'ya aparece en tus apuntes' : f.enEntrada ? 'ya en _entrada' : f.video && !ing.sel.has('f:' + f.id) ? 'vídeo: márcalo para bajarlo' : '');
    if (enl.length) {
      body.append(el('div', 'ih', 'Vídeos del campus que no se pueden bajar → se guardan como enlace en recursos/'));
      for (const f of enl) { const a = el('a', null, 'Abrir ↗'); a.onclick = (e) => { e.preventDefault(); e.stopPropagation(); window.brain.external(f.url); }; a.style.cssText = 'color:var(--acc);cursor:pointer;font-size:12px'; fila('f', f.id, `🔗 ${f.sigla.toUpperCase()} · ${f.nombre}`, `${(f.url || '').slice(0, 90)}${f.creado ? ' · ' + f.creado.slice(0, 10) : ''}`, f.ingestado ? 'ya anotado' : '', a); }
    }
    body.append(el('div', 'ih', 'Notas, estados y plazos → entregas del Brain'));
    if (!r.cambios.length) body.append(el('div', 'dsub', `Las notas, estados y plazos de ${campusNombre()} coinciden con tus datos.`));
    for (const c of r.cambios) fila('c', c.id, `${c.sigla.toUpperCase()} · ${c.titulo} → ${NM[c.col]}${c.nota ? ' ' + c.nota : ''}`, c.tipo === 'crear' ? (c.plazo ? 'Plazo del campus que aún no tienes: se creará su entrega' : 'No existe: se creará su nota de entrega') : `Ahora: ${NM[c.antes] || c.antes}${c.bb !== c.titulo ? ` · en el campus: «${c.bb}»` : ''}`, c.tipo === 'crear' ? 'nueva' : '');
    const todo = (on) => { body.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = on; }); ing.sel = new Set(on ? [...ing.r.ficheros.map(f => 'f:' + f.id), ...ing.r.cambios.map(c => 'c:' + c.id)] : []); act(); };
    const bar = el('div', 'row'), b1 = el('button', null, 'Marcar todo'), b2 = el('button', null, 'Desmarcar todo');
    b1.onclick = () => todo(true); b2.onclick = () => todo(false);
    ir.onclick = aplicaIngesta; bar.append(b1, b2, cuenta, ir); act();
    P.append(bar, body);
  } else if (ing.fase === 'aplicando') {
    const pr = el('div'); pr.id = 'i-prog'; const t = el('div', 'note'); t.id = 'i-progt'; const x = el('div', 'xpbar'); x.style.width = '100%'; const b = el('i'); b.id = 'i-progb'; b.style.width = '0'; x.append(b); pr.append(t, x); P.append(pr);
    const st = el('button', null, 'Cancelar descarga'); st.onclick = () => { window.brain.bbiCancel(); st.disabled = true; t.textContent = 'Cancelando…'; }; P.append(st); pintaProg();
  } else if (ing.fase === 'hecho') {
    for (const d of ing.bajados) P.append(el('div', 'avrow', d));
    if (ing.bajados.filter(p => !VID.test(p)).length) { const c = el('button', 'pri', '▶ Pedir a Claude que ingeste los ficheros'); c.onclick = pideClaude; P.append(c); }
  }
  return P;
}
async function aplicaIngesta() {
  const ff = [...ing.sel].filter(k => k[0] === 'f').map(k => k.slice(2)), cc = [...ing.sel].filter(k => k[0] === 'c').map(k => k.slice(2));
  ing.fase = 'aplicando'; ing.msg = 'Aplicando…'; ing.prog = null; drawAvisos();
  const r = await window.brain.bbiApply(ff, cc, []); if (!ing) return;
  if (!r.ok) { ing.fase = 'error'; ing.msg = r.login ? `La sesión de ${campusNombre()} caducó: inicia sesión de nuevo.` : 'Error: ' + (r.msg || ''); }
  else {
    ing.fase = 'hecho'; ing.bajados = r.descargados;
    ing.msg = `Descargados ${r.descargados.length} fichero(s)${r.enlaces ? ` · ${r.enlaces} enlace(s) anotado(s) en recursos/videos-del-campus.md` : ''} · ${r.cambios.length} cambio(s) aplicado(s)${r.errores.length ? ' · Avisos: ' + r.errores.join('; ') : ''}`;
    loadDash();
  }
  if (view === 'avisos') drawAvisos();
}
async function pideClaude() {
  const bajados = ing ? ing.bajados : []; await toggleTerm(true); if (!started) return;
  const lista = bajados.filter(p => !VID.test(p)).map(p => p.replace(/^02-Asignaturas\//, '')).join(', ');
  window.brain.termWrite('claude "Ingesta los ficheros nuevos que acabo de descargar del campus en la carpeta _entrada de cada asignatura: ' + lista + '. Sigue las reglas del CLAUDE.md: un apunte por tema en apuntes con la plantilla tema, una ficha de recurso en recursos, actualiza la ficha de la asignatura y añade la entrada en 04-IA/registro.md. No leas 99-Privado. Marca como supuesto lo que no salga del documento."\r');
}
$('#nbtn').onclick = () => showAvisos();
window.brain.onBBChanged(loadBB);
window.brain.onSesion(() => { loadBB(); if (ntLogin) { ntLogin = false; if (view === 'notas') leeNotasBB(); } if (view === 'mensajes') refrescaMsgs(); }); window.brain.onAvisos(() => showAvisos());

// ---- Terminal integrada (xterm.js + node-pty) ----
const tPanel = $('#term'), tBody = $('#tbody'); let xt = null, fit = null, started = false;
const tTheme = () => matchMedia('(prefers-color-scheme: light)').matches
  ? { background: '#fbfbfc', foreground: '#1c1c1e', cursor: '#0a84ff', selectionBackground: '#0a84ff33' }
  : { background: '#17171a', foreground: '#ececee', cursor: '#6aa9ff', selectionBackground: '#6aa9ff44' };
function refit() { if (!xt || tPanel.hidden) return; try { fit.fit(); window.brain.termResize(xt.cols, xt.rows); } catch {} }
async function startShell() {
  if (!xt) {
    xt = new Terminal({ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, cursorBlink: true, scrollback: 5000, theme: tTheme(), allowProposedApi: false });
    fit = new FitAddon.FitAddon(); xt.loadAddon(fit); xt.open(tBody);
    xt.onData(d => window.brain.termWrite(d));
    window.brain.onTermData(d => xt.write(d));
    window.brain.onTermExit(() => { started = false; xt.write('\r\n\x1b[90m[shell terminado — pulsa ↺ para reiniciar]\x1b[0m\r\n'); });
    new ResizeObserver(refit).observe(tBody);
    matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { xt.options.theme = tTheme(); tPanel.style.background = tTheme().background; });
  }
  fit.fit();
  const r = await window.brain.termStart(xt.cols, xt.rows);
  if (!r.ok) { xt.write('\x1b[31mNo se pudo abrir el shell: ' + (r.msg || 'error') + '\x1b[0m\r\n'); return; }
  started = true; $('#tcwd').textContent = r.cwd || '';
  if (r.reused) refit();
}
async function toggleTerm(force) {
  const show = force != null ? force : tPanel.hidden;
  tPanel.hidden = !show; tPanel.style.background = tTheme().background;
  if (show) { await startShell(); xt.focus(); }
}
$('#tbtn').onclick = () => toggleTerm(); $('#tclose').onclick = () => toggleTerm(false);
$('#trestart').onclick = async () => { await window.brain.termKill(); started = false; xt && xt.reset(); await startShell(); xt.focus(); };
$('#tclaude').onclick = async () => { await toggleTerm(true); if (started) window.brain.termWrite('claude\r'); };
// Pide a Claude (en la terminal) que actualice el dashboard con lo nuevo del Brain y atienda la petición sync/request
$('#tsync').onclick = async () => {
  if (!dashUrl()) return;
  await toggleTerm(true); if (!started) return;
  window.brain.termWrite('claude "Sincroniza el dashboard del curso (' + dashUrl() + ') con lo nuevo del Brain: lee las colecciones sync/request y sync/status del dashboard, actualiza sus datos desde el Brain siguiendo las reglas del CLAUDE.md, y al terminar escribe sync/status con la hora actual en formato ISO (campo at)."\r');
};
window.brain.onTermToggle(() => toggleTerm());
// Redimensionar arrastrando el borde superior
$('#tgrip').addEventListener('mousedown', (e) => {
  e.preventDefault(); const y0 = e.clientY, h0 = tPanel.offsetHeight;
  const mv = (ev) => { tPanel.style.height = Math.min(window.innerHeight - 150, Math.max(120, h0 + (y0 - ev.clientY))) + 'px'; };
  const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); refit(); };
  addEventListener('mousemove', mv); addEventListener('mouseup', up);
});

// ---------- Notas del curso: por asignatura y, dentro de cada una, exámenes/tests y trabajos/prácticas ----------
// Fuente principal: el libro de calificaciones de Blackboard (lo lee el proceso principal con la sesión del perfil, solo lectura).
// Sin Blackboard (otro campus, carpeta libre, móvil) se usan las notas anotadas en el Brain a través del dashboard. La media es simple, sin ponderar.
let ntAbiertos = new Set(), ntRedibujar = false;   // paneles «Qué nota necesito» abiertos y si hay un redibujado aplazado (no se redibuja mientras escribes en uno)
let ntSigla = '', ntSolo = false, ntBB = null, ntLeyendo = false, ntMsg = '', ntLogin = false;
const ntEsExamen = (i) => i.tipo === 'examen' || i.tipo === 'test' || /\b(examen|parcial|test|prueba|quiz)\b/i.test(i.titulo);
const ntEstado = (i) => i.estadoTxt || (i.col === 'done' ? (i.nota != null ? 'Calificado' : 'Corregido (sin nota anotada)') : i.col === 'sent' ? 'Entregado · pendiente de nota' : i.col === 'doing' ? 'En curso' : (i.vencida ? 'Vencido sin entregar' : 'Por hacer'));
const ntFmt = (x) => String(+x.toFixed(2)).replace('.', ',');
const ntCls = (p) => (p < 0.5 ? 'bad' : p < 0.7 ? 'mid' : 'ok');
const ntHayBB = () => !!(ntBB && ntBB.cursos && ntBB.cursos.length);
function showNotas(push = true) {
  view = 'notas'; current = null;
  if (push && hist[hp] !== '@notas') { hist = hist.slice(0, hp + 1); hist.push('@notas'); hp = hist.length - 1; }
  $('#crumb').textContent = 'Notas'; btns(); markOn(); drawNotas(); loadDash();
  if (!window.brain.notasState) return;
  window.brain.notasState().then(r => {
    if (!r || !r.status) return; ntBB = r; if (view === 'notas') drawNotas();
    if (['ok', 'nunca'].includes(r.status) && !ntLogin && (!r.leido || Date.now() - new Date(r.leido) > 30 * 60000)) leeNotasBB();   // al abrir: lo guardado al instante y, si tiene más de 30 min, se vuelve a leer
  }).catch(() => {});
}
async function leeNotasBB() {
  if (ntLeyendo || !window.brain.notasLeer) return; ntLeyendo = true; ntMsg = ''; ntLogin = false; if (view === 'notas') drawNotas();
  try { const r = await window.brain.notasLeer(); if (r && r.ok) ntBB = r; else if (r && r.login) { ntLogin = true; ntMsg = 'Inicia sesión en Blackboard para leer tus notas'; } else ntMsg = (r && r.msg) || 'No se pudieron leer las notas'; } catch (e) { ntMsg = String(e.message || e); }
  ntLeyendo = false; if (view === 'notas') drawNotas();
}
// Filas con la misma forma sea cual sea la fuente
function ntItems() {
  if (ntHayBB()) {
    const out = [], uc = ntBB.ultimosCambios, nuevas = new Set(uc && uc.lista && Date.now() - new Date(uc.fecha) < 7 * 864e5 ? uc.lista.map(x => x.sigla + '|' + x.nombre) : []);   // 🆕: nota nueva o cambiada en la última lectura con cambios (hasta 7 días)
    for (const c of ntBB.cursos) for (const f of c.filas) {
      const ok = f.nota != null && f.max, est = f.estado || (f.sinCalificar ? 'Sin calificar' : '');
      out.push({ sigla: String(c.sigla).toUpperCase(), titulo: f.nombre, fecha: f.fecha || '', tipo: '', peso: '', nota: ok ? f.nota : null, max: ok ? f.max : null, notaTexto: ok ? f.notaTexto : '', nuevo: nuevas.has(c.sigla + '|' + f.nombre), completa: !!f.completa && !ok, estadoTxt: f.completa && !ok ? 'Calificado (completo, sin nota numérica)' : est, col: ok || f.completa ? 'done' : /Enviado|Entregado|Necesita calificaci/i.test(est) ? 'sent' : /En curso|Borrador/i.test(est) ? 'doing' : 'todo' });
    }
    return out;
  }
  return dash && dash.items ? dash.items.filter(i => i.tipo !== 'calendario' && i.tipo !== 'tarea' && i.titulo && i.titulo.length <= 90) : [];   // Brain: solo entregas y exámenes (fuera avisos del calendario, tareas de apuntes y líneas largas que no son una entrega)
}
function drawNotas() {
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.nt-calc')) { ntRedibujar = true; return; }   // estás escribiendo en un panel: no se redibuja hasta que salgas
  const keep = doc.scrollTop; doc.replaceChildren(); $('#crumb').textContent = 'Notas';
  const head = el('div', 'dh'); head.append(el('h1', null, 'Notas del curso')); if (typeof botonOcultarNotas === 'function') head.append(botonOcultarNotas()); doc.append(head);
  const bb = ntBB && ['ok', 'nunca'].includes(ntBB.status), hayBB = ntHayBB();
  if (bb) {   // barra de estado de Blackboard
    const bar = el('div', 'ia-bar'), cls = ntLeyendo ? 'busy' : ntLogin ? 'warn' : ntMsg ? 'err' : hayBB ? 'ok' : 'warn';
    const hora = ntBB.leido ? 'leído ' + new Date(ntBB.leido).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'sin leer todavía';
    bar.append(el('i', 'led ' + cls), el('b', null, 'Blackboard'), el('span', 'ia-mut', ntLeyendo ? 'Leyendo tus notas…' : (ntMsg || hora)));
    if (ntLogin) { const l = el('button', 'pri', 'Iniciar sesión (⚙ Ajustes)'); l.onclick = () => showAjustes(); const r = el('button', null, 'Reintentar'); r.onclick = () => { ntLogin = false; leeNotasBB(); }; bar.append(l, r); }
    else { const r = el('button', null, '↻ Actualizar'); r.disabled = ntLeyendo; r.onclick = leeNotasBB; bar.append(r); }
    doc.append(bar);
  }
  const items = ntItems();
  if (!items.length) {
    if (!hayBB && !dash) { doc.append(el('p', 'dsub', 'Calculando…')); return; }
    doc.append(el('p', 'dsub', bb ? (ntLeyendo ? 'Un momento: se están leyendo las notas de cada asignatura.' : 'Todavía no hay notas leídas de Blackboard. Pulsa «Actualizar» (si te pide sesión, inicia sesión en Blackboard).') : 'Aún no hay entregas ni exámenes en tu Brain. Cuando haya notas de entregas, aparecerán aquí.')); return;
  }
  const sig = Object.keys(NOMBRES).filter(k => items.some(i => i.sigla.toLowerCase() === k) || (hayBB && ntBB.cursos.some(c => String(c.sigla).toLowerCase() === k))), cal = items.filter(i => i.nota != null && i.max);
  doc.append(el('p', 'dsub', `${cal.length} notas de ${items.length} entregas y exámenes. ` + (hayBB ? 'Datos tal como los muestra Blackboard (solo lectura). ' : 'Datos del Brain' + (dash && dash.ultimaActualizacion ? ' actualizado el ' + dash.ultimaActualizacion : '') + ': no se han leído de Blackboard. ') + 'La media es simple (sin ponderar por peso).'));
  const chips = el('div', 'chips'), chip = (txt, on, fn) => { const b = el('button', 'chip' + (on ? ' on' : ''), txt); b.onclick = fn; chips.append(b); };
  chip('Todas', !ntSigla, () => { ntSigla = ''; drawNotas(); });
  for (const k of sig) { const g = items.filter(i => i.sigla.toLowerCase() === k && i.nota != null && i.max), m = g.length ? g.reduce((a, i) => a + i.nota / i.max * 10, 0) / g.length : null; chip(`${k.toUpperCase()}${m != null ? ' · ' + ntFmt(m) : ''}`, ntSigla === k, () => { ntSigla = k; drawNotas(); }); }
  chip(ntSolo ? '✔ Solo calificadas' : 'Solo calificadas', ntSolo, () => { ntSolo = !ntSolo; drawNotas(); });
  doc.append(chips);
  for (const k of sig.filter(k => !ntSigla || k === ntSigla)) {
    const todos = items.filter(i => i.sigla.toLowerCase() === k), cs = todos.filter(i => i.nota != null && i.max), media = (arr) => (arr.length ? arr.reduce((a, i) => a + i.nota / i.max * 10, 0) / arr.length : null);
    const sec = el('div', 'nt-sec'); sec.style.setProperty('--c', COLOR[k] || 'var(--acc)');
    const h = el('div', 'nt-h'), mt = media(cs); h.append(el('i'), el('b', null, NOMBRES[k] || k.toUpperCase()), el('span', 'nt-n', `${cs.length} calificadas de ${todos.length}`));
    if (mt != null) h.append(el('span', 'nt-avg ' + ntCls(mt / 10), 'Media ' + ntFmt(mt))); sec.append(h);
    if (typeof notasExtras === 'function' && todos.length) notasExtras(sec, k, todos, h);
    if (!todos.length) sec.append(el('p', 'nt-vacio', 'Blackboard no muestra elementos calificables en esta asignatura (todavía no hay nada publicado o evaluable).'));
    for (const [tit, esEx] of [['Exámenes y tests', true], ['Trabajos y prácticas', false]]) {
      let g = todos.filter(i => ntEsExamen(i) === esEx); if (ntSolo) g = g.filter(i => i.nota != null && i.max); if (!g.length) continue;
      const m2 = media(g.filter(i => i.nota != null && i.max)), gh = el('div', 'nt-g'); gh.append(el('span', null, tit), el('span', 'nt-n', `${g.length}`)); if (m2 != null) gh.append(el('span', 'nt-n', '· media ' + ntFmt(m2))); sec.append(gh);
      for (const i of g.sort((a, b) => (a.fecha || '9999') < (b.fecha || '9999') ? -1 : 1)) {
        const r = el('div', 'nt-row' + (i.nota == null ? ' sin' : '')), t = el('div', 'nt-t'); t.append(el('b', null, i.titulo)); if (i.nuevo) t.firstChild.append(el('span', 'nt-nuevo', ' 🆕 nueva'));
        const sub = [i.fecha || 'sin fecha', ntEstado(i)]; if (i.peso) sub.push(i.peso); t.append(el('span', 'nt-s', sub.join(' · '))); r.append(t);
        const nn = el('div', 'nt-nota'); if (i.nota != null && i.max) { const p = i.nota / i.max, bar = el('span', 'nt-bar'); nn.classList.add(ntCls(p)); bar.append(Object.assign(el('i'), { style: `width:${Math.min(100, p * 100)}%` })); nn.append(el('b', null, i.notaTexto), bar); } else if (i.completa) nn.append(el('b', 'nt-comp', '✓ Completo')); else nn.append(el('span', 'nt-nd', '—'));
        r.append(nn); sec.append(r);
      }
    }
    doc.append(sec);
  }
  doc.scrollTop = keep;
}

// ---------- Preguntar a mis apuntes: busca la respuesta ENTRE los apuntes (RESP, respuestas.js). Sin IA, sin internet y sin instalar nada ----------
// Opcional: si hay un Ollama local en marcha (solo escritorio) aparece «Redactar con IA local»; si no, ni se menciona.
const IA_MODELO = 'brain-ia-modelo', IA_PROV = 'brain-ia-prov';
let rsQ = '', rsSigla = '', rsRes = null, rsIA = null, rsPrev = [], iaEst = null, iaId = '', iaCfgMsg = '', iaCfgAbierto = false;   // iaEst = { ollama:{ok,modelos,defecto}, gemini:{clave,cifrada,modelos,defecto} }
const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const iaOllama = () => !!(iaEst && iaEst.ollama && iaEst.ollama.ok), iaGemini = () => !!(iaEst && iaEst.gemini && iaEst.gemini.clave);
const iaProveedores = () => [...(iaGemini() ? [['gemini', 'Gemini (nube de Google)']] : []), ...(iaOllama() ? [['ollama', 'Ollama (local)']] : [])];
const iaMd = (t) => DOMPurify.sanitize(marked.parse(t, { gfm: true }), { FORBID_TAGS: ['a', 'img', 'style', 'form', 'input', 'button'], FORBID_ATTR: ['style', 'href', 'src'] });   // lo que escribe un modelo no es de fiar: sin enlaces ni imágenes
function iaTrozo(m) { if (!m || m.id !== iaId || !rsIA) return; rsIA.txt += m.txt; if (view === 'preguntar') pintaIA(); }
function showPreguntar(push = true) {
  view = 'preguntar'; current = null;
  if (push && hist[hp] !== '@preguntar') { hist = hist.slice(0, hp + 1); hist.push('@preguntar'); hp = hist.length - 1; }
  $('#crumb').textContent = 'Preguntar'; btns(); markOn(); drawPreguntar();
  if (window.brain.iaEstado) window.brain.iaEstado().then(r => { iaEst = r; if (view === 'preguntar') pintaIA(); }).catch(() => {});
}
function rsMarca(texto, q) { const s = el('span'); for (const p of RESP.resalta(texto, q)) { if (p.m) s.append(el('mark', null, p.t)); else s.append(document.createTextNode(p.t)); } return s; }
function drawPreguntar() {
  doc.replaceChildren(); $('#crumb').textContent = 'Preguntar';
  const head = el('div', 'dh'); head.append(el('h1', null, 'Preguntar a mis apuntes')); doc.append(head);
  doc.append(el('p', 'dsub', 'Escribe tu duda y te enseño qué dicen tus apuntes. Busca solo entre ellos (sin internet ni IA), así que no se inventa nada.'));
  const f = el('div', 'rs-form'), inp = el('input'), sel = el('select'), bt = el('button', 'pri', 'Buscar');
  inp.type = 'text'; inp.id = 'rs-q'; inp.placeholder = 'Ej.: ¿qué es la inyección SQL? · adquisición de evidencias · Fail2Ban'; inp.value = rsQ; inp.autocomplete = 'off';
  sel.append(Object.assign(el('option', null, 'Todas las asignaturas'), { value: '' }), ...Object.keys(NOMBRES).map(k => Object.assign(el('option', null, NOMBRES[k]), { value: k }))); sel.value = rsSigla; sel.onchange = () => { rsSigla = sel.value; if (inp.value.trim()) busca(); };
  const busca = () => { rsQ = inp.value.trim(); rsRes = rsQ ? RESP.responde(notes, rsSigla, rsQ) : null; rsIA = null; rsPrev = []; pintaRes(); pintaIA(); };
  bt.onclick = busca; inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); busca(); } };
  f.append(inp, sel, bt); doc.append(f);
  const out = el('div', 'rs-out'); out.id = 'rs-out'; const ia = el('div', 'rs-ia'); ia.id = 'rs-ia'; doc.append(ia, out);   // la IA arriba; los resultados del buscador debajo
  pintaRes(); pintaIA(); if (!rsRes) inp.focus();
}
function rsEnlace(x, txt, destino) { const a = el('a', 'ia-s', txt); a.title = x.path + (destino && destino.cab ? ' › ' + destino.cab : ''); a.onclick = () => go(x.path, destino); return a; }   // destino {cab, frase}: abre el apunte en ese apartado y resalta la frase
function pintaRes() {
  const out = $('#rs-out'); if (!out) return; out.replaceChildren();
  if (!rsRes) { out.append(el('p', 'dsub', notes.length ? `Busco entre ${notes.filter(n => !n.externo).length} apuntes. Con las palabras clave de tu duda suele bastar.` : 'Aún no hay apuntes cargados.')); return; }
  const { defs, frags } = rsRes;
  if (!defs.length && !frags.length) { const e = el('div', 'rs-vacio'); e.append(el('b', null, 'No está en tus apuntes.'), el('p', null, 'Ningún apunte habla de eso' + (rsSigla ? ' en esta asignatura' : '') + '. Prueba con otras palabras (el término tal como sale en clase) o con «Todas las asignaturas».')); out.append(e); return; }
  if (defs.length) {
    out.append(el('div', 'dsec', 'Respuesta directa'));
    for (const d of defs) {
      const c = el('div', 'rs-card def'), t = el('div', 'rs-t'); t.append(el('b', null, d.term)); if (d.tag) t.append(el('span', 'rs-tag ' + d.tag, d.tag)); if (d.borrador) t.append(el('span', 'rs-tag borr', 'borrador sin material de clase'));
      const p = el('div', 'rs-x'); p.append(rsMarca(d.def, rsQ)); const o = el('div', 'rs-o'); o.append(rsEnlace(d, `${d.sigla} · ${d.titulo}`, { frase: d.term + ':' }));
      c.append(t, p, o); out.append(c);
    }
  }
  if (frags.length) {
    out.append(el('div', 'dsec', defs.length ? 'Más en tus apuntes' : 'Lo que dicen tus apuntes'));
    for (const fr of frags) {
      const c = el('div', 'rs-card'), t = el('div', 'rs-t'); t.append(rsEnlace(fr, `${fr.sigla} · ${fr.titulo}${fr.cab ? ' › ' + fr.cab : ''}`, { cab: fr.cab, frase: (String(fr.extracto || '').split('\n').map(l => l.replace(/^[•…\s]+/, '').trim()).find(l => l.length > 12) || '') })); if (fr.borrador) t.append(el('span', 'rs-tag borr', 'borrador sin material de clase'));
      const p = el('div', 'rs-x pre'); p.append(rsMarca(fr.extracto, rsQ)); c.append(t, p); out.append(c);
    }
  }
}
function pintaIA() {
  const w = $('#rs-ia'); if (!w) return; w.replaceChildren();
  const provs = iaProveedores();
  if (!rsRes || !window.brain.iaPreguntar || !rsRes.frags.length || !iaEst || !iaEst.gemini) return;   // sin resultados (o en el móvil): nada que ofrecer
  if (!provs.length) {   // sin IA configurada: una línea discreta para activarla
    const inv = el('div', 'rs-inv'); inv.append(el('span', null, '✨ ¿Quieres la respuesta redactada por una IA? '));
    const a = el('a', 'ia-s', 'Configura Gemini (gratis) en Ajustes'); a.onclick = () => showAjustes(); inv.append(a); w.append(inv); return;
  }
  const prov = provs.some(p => p[0] === lsGet(IA_PROV)) ? lsGet(IA_PROV) : provs[0][0];
  const bar = el('div', 'rs-iabar'), selP = el('select'), selM = el('select');
  provs.forEach(([v, t]) => selP.append(Object.assign(el('option', null, t), { value: v }))); selP.value = prov; selP.id = 'ia-prov';
  const modelos = prov === 'gemini' ? iaEst.gemini.modelos : (iaEst.ollama.modelos.length ? iaEst.ollama.modelos : [iaEst.ollama.defecto]), kM = IA_MODELO + '-' + prov, defM = prov === 'gemini' ? iaEst.gemini.defecto : iaEst.ollama.defecto;
  modelos.forEach(n => selM.append(Object.assign(el('option', null, n), { value: n }))); selM.value = modelos.includes(lsGet(kM)) ? lsGet(kM) : (modelos.includes(defM) ? defM : modelos[0]); selM.id = 'ia-modelo';
  selM.onchange = () => lsSet(kM, selM.value); selP.onchange = () => { lsSet(IA_PROV, selP.value); pintaIA(); };
  const b = el('button', null, rsIA && rsIA.busy ? '⏹ Detener' : '✨ Redactar la respuesta con IA'); b.onclick = () => (rsIA && rsIA.busy ? window.brain.iaCancelar(iaId) : iaRedacta());
  bar.append(b, selP, selM, el('span', 'ia-mut', prov === 'gemini' ? 'Envía fragmentos de tus apuntes a Google' : 'En tu equipo · sin internet')); w.append(bar);
  const burbuja = (x, ultima) => {
    const bu = el('div', 'ia-b a' + (x.err ? ' err' : '')), c = el('div', 'ia-t' + (x.busy || x.err ? '' : ' md'));
    if (x.q && !ultima) bu.append(el('div', 'ia-q', '❓ ' + x.q));
    if (x.err || x.busy) c.textContent = x.txt || (x.busy ? 'Pensando con tus apuntes…' : ''); else c.innerHTML = iaMd(x.txt); bu.append(c);
    if (!x.busy && !x.err) bu.append(el('div', 'ia-f', `Redactado por ${x.prov === 'gemini' ? 'Gemini (Google)' : 'un modelo local'} a partir de los fragmentos de apuntes: contrasta lo importante con el apunte.`));
    if (!x.busy && !x.err && x.txt && typeof botonGuardarApunte === 'function') bu.append(botonGuardarApunte({ titulo: (x.q || rsQ).slice(0, 80), cuerpo: `## Pregunta\n${x.q || rsQ}\n\n## Respuesta\n${x.txt}`, fuentes: (x.fuentes || []).map(f => f.path), sigla: rsSigla || ((x.fuentes && x.fuentes[0] && x.fuentes[0].sigla) || '').toLowerCase(), origen: x.prov === 'gemini' ? 'Gemini' : 'Ollama' }));
    return bu;
  };
  for (const p of rsPrev) w.append(burbuja(p, false));
  if (rsIA) {
    w.append(burbuja(rsIA, !rsIA.q || !rsPrev.length));
    if (!rsIA.busy && !rsIA.err) {   // pregunta de seguimiento: repregunta con el contexto de lo anterior
      const sg = el('div', 'ia-seg'), inp = el('input'), go1 = el('button', null, 'Preguntar'); inp.type = 'text'; inp.placeholder = 'Pregunta de seguimiento (ej.: explícamelo más simple, ¿y el siguiente paso?)'; inp.id = 'ia-seg'; inp.maxLength = 300;
      const envia = () => { const q = inp.value.trim(); if (q) iaRedacta(q, true); }; go1.onclick = envia; inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); envia(); } };
      sg.append(inp, go1); w.append(sg);
    }
  }
}
// ---------- Ajustes (botón ⚙ junto a la casita): enlaces del campus e IA opcional ----------
function showAjustes(push = true) {
  view = 'ajustes'; current = null;
  if (push && hist[hp] !== '@ajustes') { hist = hist.slice(0, hp + 1); hist.push('@ajustes'); hp = hist.length - 1; }
  enlaces = null; $('#crumb').textContent = 'Ajustes'; btns(); markOn(); drawAjustes(); loadBB();
  if (window.brain.iaEstado) window.brain.iaEstado().then(r => { iaEst = r; if (view === 'ajustes') pintaCfg(); }).catch(() => {});
  if (window.brain.enlacesLista) window.brain.enlacesLista().then(r => { if (r && r.ok) { enlaces = r; if (view === 'ajustes') pintaEnlaces(); } }).catch(() => {});
}
let enlaces = null, enlMsg = '';   // enlaces = { campus, lista:[{nombre,url}] }
function drawAjustes() {
  doc.replaceChildren(); $('#crumb').textContent = 'Ajustes';
  const head = el('div', 'dh'); head.append(el('h1', null, 'Ajustes')); doc.append(head);
  const s0 = el('div', 'aj-sec'); s0.id = 'aj-ses'; const a = el('div', 'aj-sec'); a.id = 'aj-enl'; const c0 = el('div', 'aj-sec'); c0.id = 'aj-cal'; const pv = el('div', 'aj-sec'); pv.id = 'aj-priv'; const av = el('div', 'aj-sec'); av.id = 'aj-avisos'; const ap = el('div', 'aj-sec'); ap.id = 'aj-apar'; const cp = el('div', 'aj-sec'); cp.id = 'aj-copia'; const dg = el('div', 'aj-sec'); dg.id = 'aj-diag'; const up = el('div', 'aj-sec'); up.id = 'aj-act'; const b = el('div', 'aj-sec'); b.id = 'rs-cfg'; doc.append(s0, a, c0, av, ap, pv, cp, up, dg, b);
  pintaSesion(); pintaEnlaces(); if (typeof pintaCalendario === 'function') pintaCalendario(); if (typeof pintaAvisosAjustes === 'function') pintaAvisosAjustes(); if (typeof pintaPrivacidad === 'function') pintaPrivacidad(); if (typeof pintaApariencia === 'function') pintaApariencia(); if (typeof pintaCopia === 'function') pintaCopia(); if (typeof pintaDiagnostico === 'function') pintaDiagnostico(); if (typeof pintaActualizar === 'function') pintaActualizar(); pintaCfg();
}
// Sesión del campus: se inicia aquí una vez y vale para Avisos, Mensajes, Notas e Ingestar novedades (misma sesión del perfil)
function pintaSesion() {
  const w = $('#aj-ses'); if (!w) return; w.replaceChildren(); w.append(el('h2', null, '🔐 Sesión del campus (' + campusNombre() + ')'));
  if (!window.brain.bbLogin || (window.brain.platform || '').toLowerCase().includes('android')) { w.append(el('p', 'dsub', 'El inicio de sesión del campus solo está en la app de escritorio.')); return; }
  const st = bb && bb.status, cls = !bb ? 'busy' : st === 'ok' || st === 'vacio' ? 'ok' : st === 'login' || st === 'nunca' || st === 'sin-campus' ? 'warn' : 'err';
  const txt = !bb ? 'Comprobando…' : st === 'ok' || st === 'vacio' ? 'Sesión iniciada' : st === 'login' ? 'Sin sesión iniciada' : st === 'nunca' ? 'Sin comprobar todavía' : st === 'sin-campus' ? 'Falta la URL del campus en tu perfil' : (bb.msg || 'Sin estado');
  const f = el('div', 'aj-ses'); f.append(el('i', 'led ' + cls), el('b', null, txt), bb && bb.lastCheck ? el('span', 'nt-n', 'comprobada ' + new Date(bb.lastCheck).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })) : document.createTextNode('')); w.append(f);
  w.append(el('p', 'dsub', 'Inicia sesión aquí una sola vez: vale para Avisos, Mensajes, Notas e «Ingestar novedades». No hace falta volver a hacerlo en cada apartado.'));
  const row = el('div', 'aj-add');
  if (st === 'sin-campus' && typeof editarPerfil === 'function') { const b = el('button', 'pri', 'Añadir la URL del campus'); b.onclick = () => editarPerfil(); row.append(b); }
  else {
    const ok = st === 'ok' || st === 'vacio', b = el('button', ok ? '' : 'pri', ok ? 'Abrir ' + campusNombre() : 'Iniciar sesión'); b.onclick = () => window.brain.bbLogin();
    const c = el('button', null, 'Comprobar sesión'); c.onclick = async () => { c.disabled = true; c.textContent = 'Comprobando…'; try { await window.brain.bbCheck(); } catch {} await loadBB(); };
    row.append(b, c);
  }
  w.append(row);
}
function pintaEnlaces() {
  const w = $('#aj-enl'); if (!w) return; w.replaceChildren(); w.append(el('h2', null, '🎓 Enlaces del campus virtual'));
  if (!window.brain.enlacesGuardar || !enlaces) { w.append(el('p', 'dsub', enlaces === null && window.brain.enlacesLista ? 'Cargando…' : 'Los enlaces solo están en la app de escritorio.')); return; }
  w.append(el('p', 'dsub', 'Guarda aquí los enlaces de Blackboard o del campus que más usas (una asignatura, las notas, un aula virtual…). Se abren en tu navegador. Se guardan solo en este equipo.'));
  const fila = (nombre, url, quitar) => {
    const r = el('div', 'aj-fila'), t = el('div', 'aj-t'); t.append(el('b', null, nombre), el('span', null, url)); r.append(t);
    const ab = el('button', null, 'Abrir'); ab.onclick = () => window.brain.external(url); r.append(ab);
    if (quitar) { const q = el('button', 'aj-q', '✕'); q.title = 'Quitar el enlace'; q.onclick = async () => { const r2 = await window.brain.enlacesGuardar(enlaces.lista.filter(x => x !== quitar)); if (r2 && r2.ok) { enlaces.lista = r2.lista; enlMsg = ''; } else enlMsg = (r2 && r2.msg) || 'No se pudo quitar'; pintaEnlaces(); }; r.append(q); }
    return r;
  };
  if (enlaces.campus) w.append(fila('Campus virtual', enlaces.campus, null));
  for (const x of enlaces.lista) w.append(fila(x.nombre, x.url, x));
  if (!enlaces.campus && !enlaces.lista.length) w.append(el('p', 'dsub', 'Aún no has guardado ningún enlace.'));
  const f = el('div', 'aj-add'), n = el('input'), u = el('input'), bt = el('button', 'pri', 'Añadir'), av = el('p', 'msg-warn', enlMsg);
  n.type = 'text'; n.placeholder = 'Nombre (ej.: BRS · Blackboard)'; n.maxLength = 80; u.type = 'text'; u.placeholder = 'https://…'; u.spellcheck = false;
  const anade = async () => {
    const url = u.value.trim(); if (!url) return; bt.disabled = true;
    const r = await window.brain.enlacesGuardar([...enlaces.lista, { nombre: n.value.trim(), url }]);
    if (r && r.ok) { enlaces.lista = r.lista; enlMsg = ''; } else enlMsg = (r && r.msg) || 'No se pudo guardar el enlace';
    pintaEnlaces();
  };
  bt.onclick = anade; u.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); anade(); } };
  f.append(n, u, bt); w.append(f, av);
}
// IA opcional: Gemini en la nube (clave del propio usuario) y estado de Ollama. Solo escritorio.
function pintaCfg() {
  const w = $('#rs-cfg'); if (!w) return; w.replaceChildren(); w.append(el('h2', null, '✨ IA opcional (redactar respuestas)'));
  if (!window.brain.iaGuardarClave) { w.append(el('p', 'dsub', 'La IA opcional solo está en la app de escritorio.')); return; }
  if (!iaEst || !iaEst.gemini) { w.append(el('p', 'dsub', 'Comprobando…')); return; }
  const g = el('div', 'rs-g'); g.append(el('b', null, 'Gemini (Google), gratis con tu propia clave'));
  if (iaGemini()) {
    g.append(el('p', 'dsub', iaEst.gemini.cifrada ? 'Clave guardada y cifrada en este equipo (llavero del sistema).' : 'Clave en memoria: este sistema no tiene llavero, así que habrá que volver a ponerla al cerrar la app.'));
    const q = el('button', null, 'Quitar la clave'); q.onclick = async () => { await window.brain.iaQuitarClave(); iaCfgMsg = ''; rsIA = null; iaEst = await window.brain.iaEstado(); pintaCfg(); }; g.append(q);
  } else {
    g.append(el('p', 'dsub', 'Crea una clave gratis en Google AI Studio y pégala aquí. Se comprueba con Google y se guarda solo en este equipo.'));
    const link = el('a', 'ia-s', 'Abrir Google AI Studio ↗'); link.onclick = () => window.brain.external('https://aistudio.google.com/apikey'); g.append(link);
    const inp = el('input'); inp.type = 'password'; inp.placeholder = 'Clave de Gemini'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.id = 'ia-clave';
    const chk = el('label', 'msg-chk'), cb = el('input'); cb.type = 'checkbox'; chk.append(cb, document.createTextNode(' Entiendo que, al redactar una respuesta, los fragmentos de mis apuntes que usa se envían a Google y que en el plan gratuito pueden usarlos para mejorar sus productos.'));
    let aviso; const ok = el('button', 'pri', 'Guardar clave'); ok.onclick = async () => {
      if (!cb.checked) { aviso.textContent = 'Marca la casilla para continuar.'; return; }
      if (!inp.value.trim()) return; ok.disabled = true; ok.textContent = 'Comprobando…';
      const r = await window.brain.iaGuardarClave(inp.value.trim()); inp.value = '';
      if (r && r.ok) { iaCfgMsg = ''; iaEst = await window.brain.iaEstado(); lsSet(IA_PROV, 'gemini'); } else iaCfgMsg = (r && r.msg) || 'No se pudo guardar la clave';
      pintaCfg();
    };
    aviso = el('p', 'msg-warn', iaCfgMsg); g.append(inp, chk, ok, aviso);
  }
  w.append(g, el('p', 'dsub', 'Ollama (local, sin internet): ' + (iaOllama() ? 'en marcha.' : 'no detectado. Si lo instalas y lo abres, aparecerá como opción.')), el('p', 'dsub', 'Con la clave guardada, en 🔎 Preguntar aparece «✨ Redactar la respuesta con IA».'));
}
async function iaRedacta(q, seguimiento) {
  if (rsIA && rsIA.busy) return; const prov = ($('#ia-prov') || {}).value || iaProveedores()[0][0], modelo = ($('#ia-modelo') || {}).value || '';
  if (seguimiento && rsIA && rsIA.txt && !rsIA.err) rsPrev.push({ q: rsIA.q || rsQ, txt: rsIA.txt, prov: rsIA.prov });
  const pregunta = seguimiento ? q : rsQ, hist = rsPrev.flatMap(p => [{ rol: 'user', txt: p.q }, { rol: 'assistant', txt: p.txt }]);
  iaId = 'q' + Date.now(); const mio = rsIA = { txt: '', busy: true, prov, q: seguimiento ? q : '' }; pintaIA();
  let r; try { r = await window.brain.iaPreguntar({ id: iaId, pregunta, sigla: rsSigla, modelo, proveedor: prov, historial: hist }); } catch (e) { r = { ok: false, msg: String(e.message || e) }; }
  mio.busy = false; if (r && r.ok) mio.fuentes = r.fuentes || []; if (!r || !r.ok) { mio.err = true; mio.txt = (r && r.msg) || 'No se pudo responder'; } else if (r.cancelado) mio.txt += (mio.txt ? '\n\n' : '') + '_(detenido)_';
  if (view === 'preguntar' && rsIA === mio) pintaIA();
}
// 'load' = ya se han ejecutado todos los scripts (study.js, profiles.js…); si hay perfiles, primero se pide quién eres
window.addEventListener('load', () => (typeof gate === 'function' ? gate() : Promise.resolve()).then(load));
