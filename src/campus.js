// Campus virtuales: elige el conector según el tipo de campus del perfil (Blackboard, Moodle, Canvas o calendario iCal)
// y le da la misma interfaz de «avisos» e «ingesta» que usa la app.
const { session, BrowserWindow, Notification } = require('electron');
const fs = require('fs');
const { asignaturas, siglaDeCurso } = require('./cursos');
const M = require('./matcher');
const dashboard = require('./dashboard');
const { NeedLogin } = require('./lms-comun');
const L = require('./layout');
const R = require('./diagnostico');

const TIPOS = { blackboard: 'Blackboard', moodle: 'Moodle', canvas: 'Canvas', ical: 'Calendario iCal' };
const VENTANA_DIAS = 45;

function crear(ad) {
  // ---------------- AVISOS (novedades) ----------------
  let cfg = null, st = vacio(), running = null, loginWin = null;
  function vacio() { return { seen: [], novedades: [], lastCheck: null, status: 'nunca', msg: 'Sin revisar todavía', baseline: false }; }
  const save = () => { try { if (cfg) fs.writeFileSync(cfg.stateFile, JSON.stringify(st)); } catch {} };
  const api = (c) => ({ campus: c.campus, fetch: (u, o) => { const url = /^https?:/i.test(u) ? u : c.campus + u; return c.partition ? session.fromPartition(c.partition).fetch(url, { credentials: 'include', redirect: 'follow', ...o }) : fetch(url, o); } });
  const state = () => ({ status: st.status, msg: st.msg, lastCheck: st.lastCheck, novedades: st.novedades, sinVer: st.novedades.filter(n => !n.visto).length });
  const notificar = (t, b, click) => { try { if (!Notification.isSupported()) return; const n = new Notification({ title: t, body: b }); if (click) n.on('click', click); n.show(); } catch {} };

  const avisos = {
    init(ctx) {
      cfg = ctx; st = vacio(); running = null; try { st = { ...st, ...JSON.parse(fs.readFileSync(ctx.stateFile, 'utf8')) }; } catch {}
      if (!ad.configurado(ctx)) { st.status = 'sin-campus'; st.msg = ad.sinSesion ? 'Añade la dirección de tu calendario iCal en el perfil' : 'Añade la URL de tu campus en el perfil para recibir avisos'; }
      if (loginWin && !loginWin.isDestroyed()) loginWin.destroy();
    },
    async check({ onClick, silencioso } = {}) {
      if (!cfg || !ad.configurado(cfg)) return state();
      if (running) return running;
      running = (async () => {
        try {
          const items = (await ad.novedades(cfg, api(cfg))).map(i => ({ ...i, sigla: (siglaDeCurso(i.curso || '', cfg.asignaturas()) || '').toUpperCase() || (i.curso || '·').slice(0, 14) }));
          st.lastCheck = new Date().toISOString();
          const vistas = new Set(st.seen), nuevas = items.filter(i => !vistas.has(i.key));
          if (!st.baseline) { st.baseline = true; st.msg = `${ad.etiqueta} enlazado: ${items.length} elementos como punto de partida`; }   // primera revisión: sin avisos
          else if (nuevas.length) {
            st.novedades = [...nuevas.map(i => ({ ...i, detectado: st.lastCheck, visto: false })), ...st.novedades].slice(0, 40);
            st.msg = `${nuevas.length} novedad(es) nueva(s) en ${ad.etiqueta}`;
            if (!silencioso) notificar(`${ad.etiqueta}: ${nuevas.length} novedad${nuevas.length > 1 ? 'es' : ''}`, nuevas.slice(0, 3).map(i => `${i.sigla} · ${i.texto}`).join('\n'), onClick);
          } else st.msg = `Sin novedades en ${ad.etiqueta}`;
          st.seen = [...new Set([...items.map(i => i.key), ...st.seen])].slice(0, 400); st.status = 'ok';
        } catch (e) {
          st.lastCheck = new Date().toISOString();
          if (e instanceof NeedLogin) { st.status = 'login'; st.msg = `Inicia sesión en ${ad.etiqueta} para recibir avisos`; }
          else { st.status = 'error'; st.msg = `Error al revisar ${ad.etiqueta}: ${String(e.message || e).slice(0, 120)}`; }
        } finally { save(); }
        return state();
      })().finally(() => { running = null; });
      return running;
    },
    state,
    marcarVistas() { st.novedades.forEach(n => { n.visto = true; }); save(); return state(); },
    abrir(onClosed) {   // devuelve { ok, msg } para que la pantalla diga por qué no se abre
      if (!cfg) { R.aviso('sesion', 'Iniciar sesión pulsado sin perfil activo'); return { ok: false, msg: 'No hay ningún perfil activo' }; }
      if (!ad.loginUrl) { R.aviso('sesion', `${ad.etiqueta} no usa inicio de sesión`); return { ok: false, msg: `${ad.etiqueta} no necesita iniciar sesión` }; }
      if (!ad.configurado(cfg)) { R.aviso('sesion', `Iniciar sesión pulsado sin URL de ${ad.etiqueta} en el perfil`); return { ok: false, msg: `Falta la URL de ${ad.etiqueta} en tu perfil (✎ Editar perfil)` }; }
      if (loginWin && !loginWin.isDestroyed()) { R.info('sesion', 'la ventana de inicio de sesión ya estaba abierta: se trae al frente'); if (loginWin.isMinimized()) loginWin.restore(); loginWin.show(); loginWin.focus(); return { ok: true, yaAbierta: true }; }
      loginWin = new BrowserWindow({ width: 1100, height: 800, title: ad.etiqueta, webPreferences: { partition: cfg.partition, contextIsolation: true, sandbox: true, nodeIntegration: false } });
      R.vigilaVentana(loginWin, 'sesion');
      loginWin.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) R.carga(loginWin, url, 'sesion'); else R.aviso('sesion', `ventana emergente bloqueada (no es https): ${R.limpiaUrl(url)}`); return { action: 'deny' }; });
      R.carga(loginWin, ad.loginUrl(cfg), 'sesion'); loginWin.on('closed', () => { loginWin = null; if (onClosed) onClosed(); });
      return { ok: true };
    },
  };

  // ---------------- INGESTA (ficheros, notas y plazos) ----------------
  let ctx = null, hechos = new Set(), ultimo = null, abortar = null, onProg = null;
  const saveH = () => { try { if (ctx) fs.writeFileSync(ctx.ingestaFile, JSON.stringify({ hechos: [...hechos].slice(-1500) })); } catch {} };
  const ingesta = {
    init(c) { ctx = c; hechos = new Set(); ultimo = null; try { hechos = new Set(JSON.parse(fs.readFileSync(c.ingestaFile, 'utf8')).hechos || []); } catch {} },
    async escanear(vault, hoy) {
      ultimo = null;
      if (!ctx || !ad.configurado(ctx)) return { ok: false, msg: ad.sinSesion ? 'Añade la dirección de tu calendario iCal en el perfil' : 'Añade la URL de tu campus en el perfil' };
      const a = api(ctx), asig = asignaturas(vault);
      try {
        let cursos = [], ficheros = [], cambios = [], avisosTxt = [];
        if (ad.cursos) cursos = (await ad.cursos(ctx, a)).map(c => ({ ...c, sigla: siglaDeCurso(c.nombre, asig) })).filter(c => c.sigla);
        if (ad.ficheros) {
          const desde = new Date(Date.now() - VENTANA_DIAS * 864e5).toISOString(), propias = {};
          for (const f of await ad.ficheros(ctx, a, cursos, desde)) {
            if (hechos.has(f.id)) continue;
            const cache = propias[f.sigla] ||= { brain: M.textoBrain(vault, f.sigla), entrada: (() => { try { return fs.readdirSync(L.dirEntrada(vault, f.sigla)).map(M.norm); } catch { return []; } })() };
            const n = M.norm(f.nombre); ficheros.push({ ...f, video: f.video || M.esVideo(f.nombre), enEntrada: cache.entrada.includes(n), ingestado: cache.brain.includes(n) || (!!f.url && f.tipo === 'enlace' && cache.brain.includes(M.norm(f.url))) });
          }
          ficheros.sort((x, y) => (x.creado < y.creado ? 1 : -1));
        }
        if (ad.notas) for (const c of cursos) { try { cambios.push(...M.cambios(vault, hoy, await ad.notas(ctx, a, c), c.sigla)); } catch (e) { if (e instanceof NeedLogin) throw e; avisosTxt.push(`${c.sigla.toUpperCase()}: ${e.message}`); } }
        if (ad.plazos) {   // plazos que el campus anuncia y el Brain aún no tiene: se proponen como entregas «Por hacer»
          const items = dashboard.build(vault, hoy).items;
          for (const p of await ad.plazos(ctx, a, cursos, asig)) {
            if (!p.sigla || !p.fecha || p.fecha < hoy) continue; const S = p.sigla.toUpperCase();
            const fila = { nombre: p.titulo, fecha: p.fecha.split('-').reverse().join('/') };
            if (M.casar(fila, items.filter(i => i.sigla === S)) || cambios.some(c => c.sigla === p.sigla && M.jaccard(c.titulo, p.titulo) >= 0.6)) continue;
            cambios.push({ tipo: 'crear', sigla: p.sigla, titulo: p.titulo, col: 'todo', nota: '', card: { sigla: S, titulo: p.titulo, fecha: p.fecha, fuente: 'campus' }, bb: p.titulo, plazo: true });
          }
        }
        cambios.forEach((x, i) => { x.id = 'c' + i; });
        ultimo = { ficheros, cambios }; return { ok: true, ficheros, cambios, avisos: avisosTxt };
      } catch (e) { return e instanceof NeedLogin ? { ok: false, login: true } : { ok: false, msg: String(e.message || e) }; }
    },
    cancelar() { if (abortar) abortar.abort(); },
    setProgreso(cb) { onProg = cb; },
    async aplicar(vault, hoy, idsF, idsC, descartar) {
      if (!ultimo) return { ok: false, msg: 'Primero hay que escanear' };
      const res = { descargados: [], errores: [], cambios: [], descartados: 0, enlaces: 0 }, a = api(ctx);
      abortar = new AbortController();
      const sel = ultimo.ficheros.filter(f => idsF.includes(f.id)), bajar = sel.filter(f => f.tipo !== 'enlace'); let k = 0;
      for (const f of bajar) {
        k++;
        try {
          const d = await ad.descargar(ctx, a, f, abortar.signal);   // { resp, nombre }: se guarda por trozos, con progreso y cancelación
          res.descargados.push(await M.guardarStream(vault, f.sigla, d.nombre || f.nombre, d.resp, { signal: abortar.signal, onProgress: (h, t) => onProg && onProg({ nombre: f.nombre, hecho: h, total: t, idx: k, n: bajar.length }) })); hechos.add(f.id);
        } catch (e) { if (e instanceof NeedLogin) return { ok: false, login: true }; res.errores.push(`${f.nombre}: ${abortar.signal.aborted ? 'cancelada' : e.message}`); if (abortar.signal.aborted) break; }
      }
      const porAsig = {}; for (const f of sel.filter(f => f.tipo === 'enlace')) (porAsig[f.sigla] ||= []).push(f);
      for (const [sg, lst] of Object.entries(porAsig)) { try { res.enlaces += M.guardarEnlaces(vault, sg, lst).n; lst.forEach(f => hechos.add(f.id)); } catch (e) { res.errores.push(`enlaces de ${sg}: ${e.message}`); } }
      abortar = null;
      for (const c of ultimo.cambios.filter(c => idsC.includes(c.id))) {
        try { dashboard.move(vault, c.card, c.col, c.nota, hoy, c.tipo === 'crear' ? { creada: true } : undefined); res.cambios.push(`${c.sigla.toUpperCase()} · ${c.titulo}`); } catch (e) { res.errores.push(`${c.titulo}: ${e.message}`); }
      }
      for (const f of ultimo.ficheros.filter(f => descartar.includes(f.id))) { hechos.add(f.id); res.descartados++; }
      saveH(); res.ok = true; return res;
    },
  };
  return { avisos, ingesta };
}

// Blackboard conserva sus módulos específicos (lectura de «Actividad» y del libro de calificaciones); el resto usa conectores
const cache = {};
function para(tipo) {
  if (tipo === 'moodle' || tipo === 'canvas' || tipo === 'ical') return cache[tipo] ||= crear(require('./' + tipo));
  return cache.blackboard ||= { avisos: require('./blackboard'), ingesta: require('./bbingest') };
}
module.exports = { para, TIPOS, crear };
