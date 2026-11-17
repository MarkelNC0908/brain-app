// Conector universal por calendario iCal (.ics): sirve para CUALQUIER campus virtual (Moodle, Canvas, Blackboard, Brightspace, Sakai…)
// que permita exportar o suscribirse a su calendario. Solo plazos y novedades; no hace falta iniciar sesión.
// La dirección del calendario es secreta (equivale a una contraseña de lectura): se guarda solo en tu perfil y nunca se registra.
const { siglaDeCurso } = require('./cursos');
const { dmy, iso } = require('./lms-comun');

const desescapa = (s) => String(s || '').replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim();
function fechaIcs(v) {   // 20261122T235900Z · 20261122T235900 · 20261122
  const m = String(v || '').match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?/); if (!m) return null;
  return m[4] ? (m[7] ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(+m[1], +m[2] - 1, +m[3]);
}
function parseIcs(txt) {
  const lineas = txt.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/), out = []; let ev = null;
  for (const l of lineas) {
    if (/^BEGIN:(VEVENT|VTODO)/i.test(l)) { ev = {}; continue; }
    if (/^END:(VEVENT|VTODO)/i.test(l)) { if (ev && ev.fecha) out.push(ev); ev = null; continue; }
    if (!ev) continue; const i = l.indexOf(':'); if (i < 0) continue; const k = l.slice(0, i).split(';')[0].toUpperCase(), v = l.slice(i + 1);
    if (k === 'UID') ev.uid = v; else if (k === 'SUMMARY') ev.titulo = desescapa(v); else if (k === 'URL') ev.href = v.trim();
    else if (k === 'CATEGORIES') ev.curso = desescapa(v); else if (k === 'DESCRIPTION') ev.desc = desescapa(v);
    else if ((k === 'DTSTART' || k === 'DUE') && !ev.fecha) ev.fecha = fechaIcs(v);
  }
  return out;
}
const limpia = (t) => String(t || '').replace(/^\[[^\]]*\]\s*/, '').replace(/\s+(is due|vence|está en fecha de entrega|cierra|closes|opens|abre)\.?$/i, '').trim();
const cursoDe = (e) => e.curso || ((e.titulo || '').match(/^\[([^\]]+)\]/) || [])[1] || '';
async function leer(ctx) {
  const u = String(ctx.icalUrl || '').replace(/^webcal:/i, 'https:'); if (!/^https:\/\//i.test(u) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(u)) throw new Error('La dirección del calendario debe empezar por https:// o webcal://');   // http solo en la propia máquina (pruebas)
  const r = await fetch(u, { redirect: 'follow' }); if (!r.ok) throw new Error(`El calendario respondió ${r.status}`);
  const t = await r.text(); if (!/BEGIN:VCALENDAR/i.test(t)) throw new Error('La dirección no devuelve un calendario iCal válido');
  return parseIcs(t);
}

module.exports = {
  id: 'ical', etiqueta: 'Calendario iCal', sinSesion: true,
  configurado: (ctx) => !!ctx.icalUrl,
  async novedades(ctx) {
    return (await leer(ctx)).filter(e => e.fecha.getTime() >= Date.now() - 14 * 864e5).map(e => ({ key: `${e.uid || e.titulo}|${e.fecha.getTime()}`, fecha: dmy(e.fecha), curso: cursoDe(e), texto: `${limpia(e.titulo)} · ${dmy(e.fecha)}`, href: e.href || '' }));
  },
  async plazos(ctx, _api, _cursos, asig) {
    return (await leer(ctx)).filter(e => e.fecha.getTime() >= Date.now() - 864e5).map(e => ({ sigla: siglaDeCurso(cursoDe(e), asig) || siglaDeCurso(e.titulo, asig), titulo: limpia(e.titulo), fecha: iso(e.fecha) })).filter(p => p.sigla && p.titulo);
  },
  _parseIcs: parseIcs,
};
