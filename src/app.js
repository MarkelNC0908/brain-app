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
  loadDash(); loadBB(); if (!statusIniciado) { statusIniciado = true; refreshStatus(); }   // primer chequeo del LED aunque no haya llegado ningún evento de sincronización
  if (view === 'dash' || view === 'study' || view === 'avisos' || view === 'horario') {} else if (current && byPath.has(current)) show(current); else if (!current) home();
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

function go(p) {
  const nn = byPath.get(p); if (nn && nn.externo) { window.brain.openFile(p); return; }   // PDF, Word… se abren con su aplicación
  hist = hist.slice(0, hp + 1); hist.push(p); hp = hist.length - 1; show(p); }
function goSubject(s) { hist = hist.slice(0, hp + 1); hist.push('@' + s); hp = hist.length - 1; subject(s); }
function nav(d) { const i = hp + d; if (i < 0 || i >= hist.length) return; hp = i; const h = hist[hp]; h === '@study' ? showStudy(false) : h === '@dash' ? showDash(false) : h === '@avisos' ? showAvisos(false) : h === '@horario' ? showHorario(false) : h === '@home' ? home() : h[0] === '@' ? subject(h.slice(1)) : show(h); }
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
window.brain.onSearch(() => { q.focus(); q.select(); });

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
async function loadDash() { try { dash = await window.brain.dashData(); } catch (e) { dash = { error: String(e) }; } updateBell(); if (view === 'dash') drawDash(); else if (view === 'avisos') drawAvisos(); else if (view === 'horario') drawHorario(); }
async function loadBB() { try { bb = await window.brain.bbState(); } catch { bb = null; } updateBell(); if (view === 'dash') drawDash(); else if (view === 'avisos') drawAvisos(); }
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
  const b2 = el('button', null, sinCampus ? (esIcal() ? 'Añadir dirección del calendario' : 'Añadir URL del campus') : bb && bb.status === 'ok' ? 'Abrir ' + campusNombre() : 'Iniciar sesión en ' + campusNombre()); b2.onclick = () => (sinCampus && typeof editarPerfil === 'function' ? editarPerfil() : window.brain.bbLogin());
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
  if (!r.ok) { ing.fase = 'error'; ing.msg = r.login ? `Hace falta iniciar sesión en ${campusNombre()} (botón «Iniciar sesión en ${campusNombre()}»).` : `No se pudo leer ${campusNombre()}: ` + r.msg; }
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
window.brain.onBBChanged(loadBB); window.brain.onAvisos(() => showAvisos());

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
// 'load' = ya se han ejecutado todos los scripts (study.js, profiles.js…); si hay perfiles, primero se pide quién eres
window.addEventListener('load', () => (typeof gate === 'function' ? gate() : Promise.resolve()).then(load));
