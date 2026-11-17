// Conector de Moodle: usa TU sesión (la misma que la del navegador) y el servicio AJAX que usa la propia web de Moodle,
// por lo que no hace falta ningún token ni instalar nada. Sin credenciales: la sesión se inicia en una ventana de la app.
const { NeedLogin, entidades, quitaTags, dmy, iso, coma } = require('./lms-comun');
const { siglaDeCurso } = require('./cursos');
const unix = (ms) => Math.floor(ms / 1000);

async function sesskey(ctx, api) {
  if (ctx._sk && Date.now() - ctx._skAt < 5 * 60e3) return ctx._sk;
  const r = await api.fetch('/my/'), html = await r.text();
  if (/\/login\/(index\.php)?(\?|$)/.test(r.url) || !/"sesskey":"/.test(html)) throw new NeedLogin('login');
  ctx._sk = html.match(/"sesskey":"([A-Za-z0-9]+)"/)[1]; ctx._skAt = Date.now(); return ctx._sk;
}
async function ajax(ctx, api, metodo, args) {
  const sk = await sesskey(ctx, api);
  const r = await api.fetch(`/lib/ajax/service.php?sesskey=${sk}&info=${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ index: 0, methodname: metodo, args }]) });
  if (!r.ok) throw new Error(`Moodle respondió ${r.status}`);
  const j = await r.json(), x = Array.isArray(j) ? j[0] : j;
  if (!x || x.error) throw new Error((x && x.exception && x.exception.message) || 'Moodle devolvió un error');
  return x.data;
}
const limpiaNombre = (n) => String(n || '').replace(/\s+(is due|vence|está en fecha de entrega|cierra|closes|opens|abre|está previsto)\.?$/i, '').trim();
async function eventos(ctx, api, desdeMs) {
  const d = await ajax(ctx, api, 'core_calendar_get_action_events_by_timesort', { timesortfrom: unix(desdeMs), limitnum: 100, limittononsuspendedevents: true });
  return (d && d.events) || [];
}

module.exports = {
  id: 'moodle', etiqueta: 'Moodle',
  configurado: (ctx) => !!ctx.campus,
  loginUrl: (ctx) => ctx.campus + '/login/index.php',
  async cursos(ctx, api) {
    const d = await ajax(ctx, api, 'core_course_get_enrolled_courses_by_timeline_classification', { offset: 0, limit: 0, classification: 'all', sort: 'fullname', customfieldname: '', customfieldvalue: '' });
    return ((d && d.courses) || []).map(c => ({ courseId: String(c.id), nombre: c.fullname || c.shortname }));
  },
  async novedades(ctx, api) {
    const ev = await eventos(ctx, api, Date.now() - 14 * 864e5);
    return ev.map(e => ({ key: `${e.id}|${e.timesort}`, fecha: dmy(e.timesort * 1000), curso: (e.course && e.course.fullname) || '', texto: `${limpiaNombre(e.activityname || e.name)} · vence ${dmy(e.timesort * 1000)}`, href: e.url || '' }));
  },
  async plazos(ctx, api, _cursos, asig) {
    const ev = await eventos(ctx, api, Date.now());
    return ev.filter(e => e.timesort * 1000 >= Date.now() - 864e5).map(e => ({ sigla: siglaDeCurso((e.course && e.course.fullname) || '', asig), titulo: limpiaNombre(e.activityname || e.name), fecha: iso(e.timesort * 1000) })).filter(p => p.sigla && p.titulo);
  },
  async ficheros(ctx, api, cursos) {
    const out = [];
    for (const c of cursos) {
      const r = await api.fetch(`/course/view.php?id=${c.courseId}`); if (!r.ok) continue; const html = await r.text(); const vistos = new Set();
      for (const m of html.matchAll(/<a[^>]+href="([^"]*\/mod\/resource\/view\.php\?id=(\d+))[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
        if (vistos.has(m[2])) continue; vistos.add(m[2]); const nombre = quitaTags(m[3]); if (!nombre) continue;
        out.push({ id: `${c.courseId}/${m[2]}`, courseId: c.courseId, contentId: m[2], nombre, ruta: '', creado: '', sigla: c.sigla });
      }
    }
    for (const c of cursos) {   // enlaces a vídeos (mod/url) y grabaciones: no se pueden bajar, se anotan como enlace
      const r = await api.fetch(`/course/view.php?id=${c.courseId}`); if (!r.ok) continue; const html = await r.text(); const vistos = new Set();
      for (const m of html.matchAll(/<a[^>]+href="([^"]*\/mod\/(?:url|kalvidres|panopto|hvp)\/view\.php\?id=(\d+))[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)) {
        if (vistos.has(m[2])) continue; vistos.add(m[2]); const nombre = quitaTags(m[3]);
        if (nombre && /v[ií]deo|youtube|vimeo|panopto|echo|kaltura|grabaci|clase grabada|recording/i.test(nombre + ' ' + m[1])) out.push({ id: `${c.courseId}/u${m[2]}`, tipo: 'enlace', video: true, courseId: c.courseId, contentId: m[2], nombre, url: entidades(m[1]), curso: c.nombre, ruta: '', creado: '', sigla: c.sigla });
      }
    }
    return out;   // Moodle no expone la fecha de subida en la página: el filtro es «lo que aún no has descargado»
  },
  async descargar(ctx, api, f, signal) {
    let r = await api.fetch(`/mod/resource/view.php?id=${f.contentId}`, { signal });
    if ((r.headers.get('content-type') || '').includes('text/html')) {   // a veces Moodle enseña una página con el enlace al fichero
      const m = (await r.text()).match(/href="([^"]*pluginfile\.php[^"]*)"/); if (!m) throw new Error('Moodle no ofreció el fichero');
      r = await api.fetch(entidades(m[1]), { signal });
    }
    if (!r.ok || (r.headers.get('content-type') || '').includes('text/html')) throw new Error(`Moodle no entregó el fichero (HTTP ${r.status})`);
    const cd = r.headers.get('content-disposition') || '', fn = (cd.match(/filename\*=UTF-8''([^;]+)/i) || [])[1], fn2 = (cd.match(/filename="?([^";]+)"?/i) || [])[1];
    const nombre = fn ? decodeURIComponent(fn) : fn2 || decodeURIComponent((r.url || '').split('?')[0].split('/').pop() || f.nombre);
    // Si la cabecera trae caracteres corruptos (\uFFFD), se usa el nombre del enlace con la extensión del fichero real
    const ext = ((r.url || '').split('?')[0].match(/\.[A-Za-z0-9]{2,5}$/) || [])[0] || '';
    return { resp: r, nombre: /\uFFFD|ï¿½/.test(nombre) ? (f.nombre + (/\.[A-Za-z0-9]{2,5}$/.test(f.nombre) ? '' : ext)) : nombre };
  },
  // Informe de calificador del usuario: una fila por elemento calificado
  async notas(ctx, api, curso) {
    const r = await api.fetch(`/grade/report/user/index.php?id=${curso.courseId}`); if (!r.ok) return []; const html = await r.text(); const filas = [];
    for (const tr of html.split(/<tr\b/i).slice(1)) {
      const n = tr.match(/class="[^"]*column-itemname[^"]*"[^>]*>([\s\S]*?)<\/t[hd]>/i), g = tr.match(/class="[^"]*column-grade[^"]*"[^>]*>([\s\S]*?)<\/td>/i), rg = tr.match(/class="[^"]*column-range[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
      if (!n || !g) continue; const nombre = quitaTags(n[1]), nota = parseFloat(quitaTags(g[1]).replace(',', '.')), max = rg ? parseFloat((quitaTags(rg[1]).split(/[–—-]/).pop() || '').replace(',', '.')) : NaN;
      if (!nombre || /^total del curso|^course total/i.test(nombre) || isNaN(nota) || isNaN(max)) continue;
      filas.push({ nombre, fecha: '', estado: 'Calificado', nota: `${coma(nota)}/${coma(max)}` });
    }
    return filas;
  },
};
