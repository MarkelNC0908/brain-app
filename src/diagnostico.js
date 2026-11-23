// Registro local de errores e informe para pegar al pedir ayuda. Nada se envía: el informe solo se copia al portapapeles cuando el usuario lo pide.
// Se quitan las claves y tokens y la ruta personal; no incluye el contenido de mensajes, notas ni apuntes.
const fs = require('fs');
const os = require('os');
const MAX_LOG = 300 * 1024;
function limpiaSecretos(s) {
  let t = String(s == null ? '' : s);
  t = t.replace(/AIza[\w-]{20,}/g, '[clave]').replace(/AQ\.[\w-]{20,}/g, '[clave]').replace(/\b(?:github_pat_|ghp_|gho_|ghs_)[\w]{20,}/g, '[token]').replace(/(x-goog-api-key|authorization|bearer)["':= ]+[\w.\-]{12,}/gi, '$1: [oculto]').replace(/(api[_-]?key|token|password|contraseña|pin)["':= ]+[^\s,;"']{4,}/gi, '$1: [oculto]');
  t = t.replace(/(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, '$1?…');   // fuera parámetros y fragmentos de las URL: en el inicio de sesión (SSO, SAML, OAuth) llevan códigos y tokens
  const home = os.homedir(); if (home && home.length > 3) t = t.split(home).join('~');
  return t;
}
// URL para el registro: solo origen y ruta (sin parámetros, que en los inicios de sesión llevan tokens)
function limpiaUrl(u) { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.origin + x.pathname : x.protocol; } catch { return '(URL no válida)'; } }
function abreLog(file) { return { file }; }
function logLinea(file, nivel, tag, msg) {
  try {
    try { if (fs.statSync(file).size > MAX_LOG) fs.renameSync(file, file + '.1'); } catch {}
    fs.appendFileSync(file, `${new Date().toISOString()} [${nivel}] ${tag}: ${limpiaSecretos(String(msg).slice(0, 2000)).replace(/\r?\n/g, ' ⏎ ')}\n`);
  } catch {}
}
function ultimasLineas(file, n) { try { return fs.readFileSync(file, 'utf8').trim().split('\n').filter(l => /\[error\]/.test(l)).slice(-n); } catch { return []; } }   // solo errores (el informe)

// ---- Registro de la app (pantalla «Registro» de Ajustes): errores, avisos y pasos importantes como el inicio de sesión ----
let regFile = null;   // función que da la ruta (se fija en main.js; la carpeta de datos puede cambiar al arrancar)
function fijaRegistro(f) { regFile = typeof f === 'function' ? f : () => f; }
const escribe = (nivel, tag, msg) => { if (regFile) logLinea(regFile(), nivel, tag, msg); };
const info = (tag, msg) => escribe('info', tag, msg), aviso = (tag, msg) => escribe('aviso', tag, msg), error = (tag, e) => escribe('error', tag, (e && e.stack) || e);
// Lee las últimas n líneas (también las del fichero rotado) como { fecha, nivel, tag, msg }
function leeRegistro(file, n = 400) {
  let txt = ''; for (const f of [file + '.1', file]) { try { txt += fs.readFileSync(f, 'utf8'); } catch {} }
  return txt.split('\n').filter(Boolean).slice(-n).map(l => { const m = l.match(/^(\S+) \[(\w+)\] ([^:]+): (.*)$/); return m ? { fecha: m[1], nivel: m[2], tag: m[3], msg: m[4] } : { fecha: '', nivel: 'info', tag: '', msg: l }; });
}
function borraRegistro(file) { for (const f of [file, file + '.1']) { try { fs.rmSync(f, { force: true }); } catch {} } }
// Sigue una ventana de inicio de sesión: a qué páginas va (sin parámetros), si falla la carga, el certificado o la ventana se cuelga
function vigilaVentana(win, tag) {
  const wc = win.webContents;
  wc.on('did-navigate', (_e, url, code) => info(tag, `página ${limpiaUrl(url)}${code ? ' (HTTP ' + code + ')' : ''}`));
  wc.on('did-fail-load', (_e, code, desc, url, principal) => { if (principal && code !== -3) error(tag, `no carga ${limpiaUrl(url)}: ${desc} (${code})`); });   // -3 = cancelada por una redirección, normal
  wc.on('certificate-error', (_e, url, err) => error(tag, `certificado rechazado en ${limpiaUrl(url)}: ${err}`));
  wc.on('render-process-gone', (_e, d) => error(tag, `la página se cerró sola (${d && d.reason})`));
  wc.on('unresponsive', () => aviso(tag, 'la ventana no responde'));
  win.on('closed', () => info(tag, 'ventana cerrada'));
}
// Carga una URL en la ventana y apunta el fallo (loadURL rechaza la promesa si no carga)
function carga(win, url, tag) { info(tag, `abre ${limpiaUrl(url)}`); return win.loadURL(url).catch(e => { if (!/ERR_ABORTED/.test(String(e && e.message))) error(tag, `no se pudo abrir ${limpiaUrl(url)}: ${e && e.message}`); }); }
// info: { version, electron, chrome, node, plataforma, arquitectura, so, idioma, perfil:{tipo, modo, campus, pin}, estados:{…}, ia:{…} }
function construyeInforme(info, lineasLog) {
  const o = [`Informe de Brain · ${new Date().toISOString()}`, '', `Versión: ${info.version}`, `Sistema: ${info.plataforma} ${info.arquitectura} (${info.so}) · idioma ${info.idioma}`, `Electron ${info.electron} · Chrome ${info.chrome} · Node ${info.node}`, ''];
  const p = info.perfil || {}; o.push(`Perfil: campus ${p.tipo || '—'}${p.campus ? ' (' + p.campus + ')' : ''} · carpeta ${p.modo || '—'} · PIN ${p.pin ? 'sí' : 'no'}`);
  for (const [k, v] of Object.entries(info.estados || {})) o.push(`${k}: ${v}`);
  for (const [k, v] of Object.entries(info.ia || {})) o.push(`IA · ${k}: ${v}`);
  o.push('', 'Últimos errores registrados:', ...(lineasLog && lineasLog.length ? lineasLog : ['(ninguno)']));
  return limpiaSecretos(o.join('\n'));
}
module.exports = { limpiaSecretos, limpiaUrl, logLinea, ultimasLineas, construyeInforme, abreLog, fijaRegistro, info, aviso, error, leeRegistro, borraRegistro, vigilaVentana, carga };
