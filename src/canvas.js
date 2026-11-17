// Conector de Canvas (Instructure): API REST con TU sesión del navegador (solo lectura, peticiones GET).
const { NeedLogin, dmy, iso, coma } = require('./lms-comun');
const { siglaDeCurso } = require('./cursos');

async function pagina(api, url) {
  const r = await api.fetch(url, { headers: { Accept: 'application/json+canvas-string-ids, application/json' } });
  if (r.status === 401 || r.status === 403) { const e = new NeedLogin('login'); e.status = r.status; throw e; }
  if (!r.ok) { const e = new Error(`Canvas respondió ${r.status}`); e.status = r.status; throw e; }
  let t = await r.text(); if (!/^\s*(while\(1\);)?\s*[\[{]/.test(t)) throw new NeedLogin('login');   // una página HTML = pantalla de inicio de sesión
  t = t.replace(/^\s*while\(1\);/, ''); const next = ((r.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/) || [])[1] || null;
  return { data: JSON.parse(t), next };
}
async function lista(api, url) { const out = []; let u = url, n = 0; while (u && n++ < 20) { const p = await pagina(api, u); out.push(...(Array.isArray(p.data) ? p.data : [])); u = p.next; } return out; }

module.exports = {
  id: 'canvas', etiqueta: 'Canvas',
  configurado: (ctx) => !!ctx.campus,
  loginUrl: (ctx) => ctx.campus + '/login',
  async cursos(ctx, api) { return (await lista(api, '/api/v1/courses?enrollment_state=active&per_page=100')).filter(c => c.name).map(c => ({ courseId: String(c.id), nombre: c.name })); },
  async novedades(ctx, api) {
    const nombres = new Map((await this.cursos(ctx, api)).map(c => [c.courseId, c.nombre]));
    const act = (await pagina(api, '/api/v1/users/self/activity_stream?per_page=30')).data || [];
    return act.map(a => ({ key: `${a.id}|${a.updated_at}`, fecha: dmy(a.created_at), curso: nombres.get(String(a.course_id)) || '', texto: `${a.type === 'Message' ? 'Aviso' : a.type}: ${a.title || ''}`.trim(), href: a.html_url || '' }));
  },
  async plazos(ctx, api, cursos) {
    const out = [];
    for (const c of cursos) for (const a of await lista(api, `/api/v1/courses/${c.courseId}/assignments?per_page=100&include[]=submission`).catch(() => [])) {
      if (!a.due_at || new Date(a.due_at).getTime() < Date.now() - 864e5) continue; out.push({ sigla: c.sigla, titulo: a.name, fecha: iso(a.due_at) });
    }
    return out;
  },
  async ficheros(ctx, api, cursos, desde) {
    const out = [];
    for (const c of cursos) {
      let fs = []; try { fs = await lista(api, `/api/v1/courses/${c.courseId}/files?per_page=100&sort=created_at&order=desc`); } catch (e) { if (e instanceof NeedLogin && e.status === 401) throw e; continue; }   // la pestaña de archivos puede estar desactivada
      for (const f of fs) if (f.url && (!desde || (f.created_at || '') >= desde)) out.push({ id: `${c.courseId}/${f.id}`, courseId: c.courseId, contentId: String(f.id), nombre: f.display_name || f.filename, ruta: '', creado: f.created_at || '', url: f.url, sigla: c.sigla });
    }
    for (const c of cursos) {   // vídeos de Canvas Studio / grabaciones: media_objects con sus fuentes de descarga
      let mo = []; try { mo = await lista(api, `/api/v1/courses/${c.courseId}/media_objects?per_page=100&sort=created_at&order=desc`); } catch (e) { if (e instanceof NeedLogin && e.status === 401) throw e; continue; }
      for (const m of mo) {
        const src = (m.media_sources || []).filter(x => x.url).sort((a, b) => (+b.bitrate || 0) - (+a.bitrate || 0))[0]; if (!src || (desde && (m.created_at || '') < desde)) continue;
        const ext = /webm/.test(src.content_type || '') ? '.webm' : /audio|mp3/.test(src.content_type || '') ? '.mp3' : '.mp4';
        out.push({ id: `${c.courseId}/m${m.media_id}`, courseId: c.courseId, contentId: 'm' + m.media_id, nombre: `${m.user_entered_title || m.title || 'vídeo'}${ext}`, ruta: '', creado: m.created_at || '', url: src.url, sigla: c.sigla, video: true });
      }
    }
    return out;
  },
  async descargar(ctx, api, f, signal) {
    const r = await api.fetch(f.url, { signal });
    if (!r.ok || (r.headers.get('content-type') || '').includes('text/html')) throw new Error(`Canvas no entregó el fichero (HTTP ${r.status})`);
    return { resp: r, nombre: f.nombre };
  },
  async notas(ctx, api, curso) {
    const filas = [];
    for (const a of await lista(api, `/api/v1/courses/${curso.courseId}/assignments?per_page=100&include[]=submission`).catch(() => [])) {
      const s = a.submission || {}, graded = s.workflow_state === 'graded' && s.score != null && a.points_possible;
      const estado = graded ? 'Calificado' : s.submitted_at || s.workflow_state === 'submitted' ? 'Enviado' : 'Sin enviar';
      filas.push({ nombre: a.name, fecha: a.due_at ? dmy(a.due_at) : '', estado, nota: graded ? `${coma(s.score)}/${coma(a.points_possible)}` : 'Sin calificar', intentos: s.attempt ? `Se entregó ${s.attempt} intento` : '' });
    }
    return filas;
  },
};
