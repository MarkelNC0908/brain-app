// Ingesta desde Blackboard con TU sesión (partición propia de cada perfil): detecta ficheros nuevos, los descarga a
// 02-Asignaturas/<sigla>/_entrada/ (sin sobrescribir) y calcula cambios de notas/estados para el Brain.
// Solo lectura sobre Blackboard. Todo lo que escribe en el Brain lo escribe tras confirmación del usuario en el modal.
const { session, BrowserWindow, app } = require('electron');
const fs = require('fs');
const path = require('path');
const dashboard = require('./dashboard');

const { asignaturas, siglaDeCurso } = require('./cursos');
const L = require('./layout');
const { norm, textoBrain, seguro, guardarFichero, guardarStream, guardarEnlaces, esVideo, HOSTS_VIDEO, isoFecha, casar, cambios } = require('./matcher');
// Contexto del perfil activo: { campus, partition, ingestaFile }
let CTX = null;
const VENTANA_DIAS = 45;   // se muestran ficheros creados en los últimos 45 días que no estén ya descargados ni ingestados
class NeedLogin extends Error {}
let hechos = new Set();
const saveState = () => { try { if (CTX) fs.writeFileSync(CTX.ingestaFile, JSON.stringify({ hechos: [...hechos].slice(-1500) })); } catch {} };
function init(ctx) { CTX = ctx; hechos = new Set(); ultimo = null; try { hechos = new Set(JSON.parse(fs.readFileSync(ctx.ingestaFile, 'utf8')).hechos || []); } catch {} }
let ultimo = null;   // resultado del último escaneo: el renderer solo puede aplicar lo que está aquí (por id)

async function api(p) {
  const r = await session.fromPartition(CTX.partition).fetch(CTX.campus + p, { credentials: 'include' });
  const ct = r.headers.get('content-type') || '';
  if (r.status === 401 || r.status === 403 || !ct.includes('json')) throw new NeedLogin('Sesión de Blackboard no válida');
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${p.slice(0, 80)}`);
  return r.json();
}
async function paginas(p) { const out = []; let next = p; while (next && out.length < 3000) { const d = await api(next); out.push(...(d.results || [])); next = d.paging && d.paging.nextPage; } return out; }

async function cursos() {
  const rs = await paginas('/learn/api/public/v1/users/me/courses?limit=50&expand=course&fields=courseId,course.name');
  const asig = asignaturas(CTX.vault);
  return rs.map(r => { const n = (r.course && r.course.name) || '', sg = siglaDeCurso(n, asig); return sg ? { courseId: r.courseId, sigla: sg, nombre: n } : null; }).filter(Boolean);
}

// ---- ficheros nuevos ----
async function ficheros(vault, cs, desde) {
  const out = [];
  for (const c of cs) {
    const brain = textoBrain(vault, c.sigla); let entrada = [];
    try { entrada = fs.readdirSync(L.dirEntrada(vault, c.sigla)).map(norm); } catch {}
    const pila = [{ id: null, ruta: '' }];
    while (pila.length) {
      const { id, ruta } = pila.pop();
      const items = await paginas(`/learn/api/public/v1/courses/${c.courseId}/contents${id ? `/${id}/children` : ''}?limit=100&fields=id,title,created,hasChildren,contentHandler`);
      for (const it of items) {
        const h = (it.contentHandler || {}).id || '';
        if (it.hasChildren || h === 'resource/x-bb-folder') { pila.push({ id: it.id, ruta: (ruta ? ruta + '/' : '') + it.title }); continue; }
        if (/externallink|blti-link/.test(h)) {   // enlaces y herramientas externas: solo interesan los que llevan a vídeos (YouTube, Panopto, Collaborate…)
          const url = (it.contentHandler || {}).url || '', key = `${c.courseId}/${it.id}/enlace`;
          if (it.created && it.created >= desde && !hechos.has(key) && (HOSTS_VIDEO.test(url) || HOSTS_VIDEO.test(it.title || '') || /blti/.test(h) && HOSTS_VIDEO.test(url + ' ' + (it.title || ''))))
            out.push({ id: key, tipo: 'enlace', video: true, sigla: c.sigla, courseId: c.courseId, nombre: it.title || 'Vídeo', url: url || `${CTX.campus}/ultra/courses/${c.courseId}/outline`, curso: c.nombre, ruta, creado: it.created, enEntrada: false, ingestado: !!url && brain.includes(norm(url)) });
          continue;
        }
        if (!it.created || it.created < desde || /courselink/.test(h)) continue;
        let atts = []; try { atts = (await api(`/learn/api/public/v1/courses/${c.courseId}/contents/${it.id}/attachments`)).results || []; } catch (e) { if (e instanceof NeedLogin) throw e; }
        for (const a of atts) {
          const key = `${c.courseId}/${it.id}/${a.id}`; if (hechos.has(key)) continue;
          const n = norm(a.fileName || it.title), enEntrada = entrada.includes(n), ingestado = brain.includes(n);
          const nombre = a.fileName || it.title, video = esVideo(nombre, a.mimeType); let size = 0;
          if (video) { try { const hd = await session.fromPartition(CTX.partition).fetch(`${CTX.campus}/learn/api/public/v1/courses/${c.courseId}/contents/${it.id}/attachments/${a.id}/download`, { method: 'HEAD', credentials: 'include', signal: AbortSignal.timeout(6000) }); size = +(hd.headers.get('content-length') || 0); } catch {} }   // tamaño (si el servidor lo da)
          out.push({ id: key, sigla: c.sigla, courseId: c.courseId, contentId: it.id, attId: a.id, nombre, ruta, creado: it.created, mime: a.mimeType || '', video, size, enEntrada, ingestado });
        }
      }
    }
  }
  return out.sort((a, b) => a.creado < b.creado ? 1 : -1);
}
let abortar = null, onProg = null;
async function descargar(vault, f, idx, n) {
  const r = await session.fromPartition(CTX.partition).fetch(`${CTX.campus}/learn/api/public/v1/courses/${f.courseId}/contents/${f.contentId}/attachments/${f.attId}/download`, { credentials: 'include', signal: abortar && abortar.signal });
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || ct.includes('text/html')) throw new Error(`El campus no entregó el fichero (HTTP ${r.status})`);
  return guardarStream(vault, f.sigla, f.nombre, r, { signal: abortar && abortar.signal, onProgress: (h, t) => onProg && onProg({ nombre: f.nombre, hecho: h, total: t, idx, n }) });
}

// ---- notas y estados (página «Libro de calificaciones» de cada curso) ----
function parseNotas(texto) {
  const toks = texto.split(/[\n\t]+/).map(s => s.trim()).filter(Boolean), i0 = toks.findIndex(t => /^Resultados$/i.test(t));
  const fecha = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, nota = /^(\d+(?:[.,]\d+)?\/\d+(?:[.,]\d+)?|Sin calificar)$/i, intento = /^Se entreg/i;
  const estado = /^(Calificado|Enviado|Sin enviar|Entregado|Pendiente|Completado|Vencido|Borrador|En curso|Necesita calificaci[oó]n|Exento|Continuo)$/i;
  const rows = []; let cur = null;
  for (const tk of toks.slice(i0 + 1)) {
    if (/^Vista$/i.test(tk)) continue;
    if (!cur) { cur = { nombre: tk }; continue; }
    if (intento.test(tk)) cur.intentos = tk;
    else if (fecha.test(tk)) cur.fecha = tk;
    else if (nota.test(tk)) { cur.nota = tk; rows.push(cur); cur = null; }
    else if (estado.test(tk)) { if (cur.estado) { rows.push(cur); cur = { nombre: tk }; } else cur.estado = tk; }
    else { rows.push(cur); cur = { nombre: tk }; }   // un texto desconocido es una fila nueva (la anterior no traía nota)
  }
  if (cur && (cur.estado || cur.fecha)) rows.push(cur);
  return rows;
}
async function leerNotas(c) {
  const win = new BrowserWindow({ show: false, webPreferences: { partition: CTX.partition, contextIsolation: true, sandbox: true, nodeIntegration: false } });
  try {
    await win.loadURL(`${CTX.campus}/ultra/courses/${c.courseId}/grades`).catch(() => {});
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      if (!win.webContents.getURL().startsWith(CTX.campus + '/ultra/') && Date.now() - t0 > 6000) throw new NeedLogin('login');
      try { const t = await win.webContents.executeJavaScript(`document.body.innerText`); if (/Nombre del elemento/.test(t) && /Resultados/.test(t)) return t; } catch {}
      await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error(`La página de notas de ${c.sigla.toUpperCase()} no cargó`);
  } finally { if (!win.isDestroyed()) win.destroy(); }
}

async function escanear(vault, hoy) {
  ultimo = null;
  if (!CTX || !CTX.campus) return { ok: false, msg: 'Añade la URL de tu campus en el perfil' };
  CTX.vault = vault;
  try {
    const cs = await cursos(), desde = new Date(Date.now() - VENTANA_DIAS * 864e5).toISOString();
    const fs_ = await ficheros(vault, cs, desde), cam = [], avisos = [];
    for (const c of cs) {
      try { const filas = parseNotas(await leerNotas(c)); cam.push(...cambios(vault, hoy, filas, c.sigla)); }
      catch (e) { if (e instanceof NeedLogin) throw e; avisos.push(e.message); }
    }
    cam.forEach((x, i) => { x.id = 'c' + i; });
    ultimo = { ficheros: fs_, cambios: cam }; return { ok: true, ficheros: fs_, cambios: cam, avisos };
  } catch (e) { return e instanceof NeedLogin ? { ok: false, login: true } : { ok: false, msg: String(e.message || e) }; }
}
async function aplicar(vault, hoy, idsFicheros, idsCambios, descartar) {
  if (!ultimo) return { ok: false, msg: 'Primero hay que escanear' };
  const res = { descargados: [], errores: [], cambios: [], descartados: 0, enlaces: 0 };
  abortar = new AbortController();
  const sel = ultimo.ficheros.filter(f => idsFicheros.includes(f.id)), bajar = sel.filter(f => f.tipo !== 'enlace');
  let k = 0;
  for (const f of bajar) {
    k++;
    try { res.descargados.push(await descargar(vault, f, k, bajar.length)); hechos.add(f.id); }
    catch (e) { if (e instanceof NeedLogin) return { ok: false, login: true }; res.errores.push(`${f.nombre}: ${abortar.signal.aborted ? 'cancelada' : e.message}`); if (abortar.signal.aborted) break; }
  }
  const porAsig = {}; for (const f of sel.filter(f => f.tipo === 'enlace')) (porAsig[f.sigla] ||= []).push(f);
  for (const [sg, lst] of Object.entries(porAsig)) { try { res.enlaces += guardarEnlaces(vault, sg, lst).n; lst.forEach(f => hechos.add(f.id)); } catch (e) { res.errores.push(`enlaces de ${sg}: ${e.message}`); } }
  for (const c of ultimo.cambios.filter(c => idsCambios.includes(c.id))) {
    try { dashboard.move(vault, c.card, c.col, c.nota, hoy); res.cambios.push(`${c.sigla.toUpperCase()} · ${c.titulo}`); } catch (e) { res.errores.push(`${c.titulo}: ${e.message}`); }
  }
  for (const f of ultimo.ficheros.filter(f => descartar.includes(f.id))) { hechos.add(f.id); res.descartados++; }
  abortar = null; saveState(); res.ok = true; return res;
}
const cancelar = () => { if (abortar) abortar.abort(); };
const setProgreso = (cb) => { onProg = cb; };
module.exports = { init, escanear, aplicar, cancelar, setProgreso, _parseNotas: parseNotas, _casar: casar, _isoFecha: isoFecha, _cambios: cambios };
