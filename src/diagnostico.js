// Registro local de errores e informe para pegar al pedir ayuda. Nada se envía: el informe solo se copia al portapapeles cuando el usuario lo pide.
// Se quitan las claves y tokens y la ruta personal; no incluye el contenido de mensajes, notas ni apuntes.
const fs = require('fs');
const os = require('os');
const MAX_LOG = 300 * 1024;
function limpiaSecretos(s) {
  let t = String(s == null ? '' : s);
  t = t.replace(/AIza[\w-]{20,}/g, '[clave]').replace(/AQ\.[\w-]{20,}/g, '[clave]').replace(/\b(?:github_pat_|ghp_|gho_|ghs_)[\w]{20,}/g, '[token]').replace(/(x-goog-api-key|authorization|bearer)["':= ]+[\w.\-]{12,}/gi, '$1: [oculto]').replace(/(api[_-]?key|token|password|contraseña|pin)["':= ]+[^\s,;"']{4,}/gi, '$1: [oculto]');
  const home = os.homedir(); if (home && home.length > 3) t = t.split(home).join('~');
  return t;
}
function abreLog(file) { return { file }; }
function logLinea(file, nivel, tag, msg) {
  try {
    try { if (fs.statSync(file).size > MAX_LOG) fs.renameSync(file, file + '.1'); } catch {}
    fs.appendFileSync(file, `${new Date().toISOString()} [${nivel}] ${tag}: ${limpiaSecretos(String(msg).slice(0, 2000)).replace(/\r?\n/g, ' ⏎ ')}\n`);
  } catch {}
}
function ultimasLineas(file, n) { try { return fs.readFileSync(file, 'utf8').trim().split('\n').slice(-n); } catch { return []; } }
// info: { version, electron, chrome, node, plataforma, arquitectura, so, idioma, perfil:{tipo, modo, campus, pin}, estados:{…}, ia:{…} }
function construyeInforme(info, lineasLog) {
  const o = [`Informe de Brain · ${new Date().toISOString()}`, '', `Versión: ${info.version}`, `Sistema: ${info.plataforma} ${info.arquitectura} (${info.so}) · idioma ${info.idioma}`, `Electron ${info.electron} · Chrome ${info.chrome} · Node ${info.node}`, ''];
  const p = info.perfil || {}; o.push(`Perfil: campus ${p.tipo || '—'}${p.campus ? ' (' + p.campus + ')' : ''} · carpeta ${p.modo || '—'} · PIN ${p.pin ? 'sí' : 'no'}`);
  for (const [k, v] of Object.entries(info.estados || {})) o.push(`${k}: ${v}`);
  for (const [k, v] of Object.entries(info.ia || {})) o.push(`IA · ${k}: ${v}`);
  o.push('', 'Últimos errores registrados:', ...(lineasLog && lineasLog.length ? lineasLog : ['(ninguno)']));
  return limpiaSecretos(o.join('\n'));
}
module.exports = { limpiaSecretos, logLinea, ultimasLineas, construyeInforme, abreLog };
