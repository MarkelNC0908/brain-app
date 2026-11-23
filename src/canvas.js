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
const uno = async (api, url) => (await pagina(api, url)).data;
// Nombre del curso para casarlo con la carpeta: sin el código delante ni el grupo detrás (UOC: «76.511 - Diseño gráfico - Aula 1» → «Diseño gráfico»)
const nombreCurso = (c) => String(c.name || '').replace(/^\s*\d+(?:\.\d+)*\s*[-–]\s*/, '').replace(/\s*[-–]\s*(aula|grupo|group|section|secci[oó]n)\s*\w+\s*$/i, '').trim() || c.name;
const TIPOS_STREAM = { Announcement: 'Anuncio', DiscussionTopic: 'Debate', Submission: 'Entrega', Conversation: 'Mensaje', Message: 'Aviso', AssessmentRequest: 'Revisión', WebConference: 'Videoconferencia', Collaboration: 'Colaboración' };
// Ids de ficheros del curso enlazados desde un HTML (páginas, enunciados, anuncios): /courses/<id>/files/<id> o /files/<id>
const idsFicheros = (html) => [...String(html || '').matchAll(/\/files\/(\d+)/g)].map(m => m[1]);
// Documento HTML autónomo con el contenido de una página del campus (se guarda en _entrada/ para ingerirlo como un fichero más)
const docHtml = (titulo, curso, url, cuerpo, fecha) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title></head><body><h1>${esc(titulo)}</h1><p><small>${esc(curso)}${fecha ? ' · ' + esc(fecha) : ''} · <a href="${esc(url)}">original en el campus</a></small></p>\n${cuerpo || ''}\n</body></html>\n`;
const esc = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const seguroNombre = (t) => String(t || 'pagina').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'pagina';
const MAX_PAGINAS = 80;
// Ejecuta fn sobre cada elemento con «n» peticiones a la vez (en un aula de la UOC, de 22 s a pocos segundos por curso); conserva el orden
async function enParalelo(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }   // por curso, para no hacer cientos de peticiones en un aula muy grande

module.exports = {
  _nombreCurso: nombreCurso, _idsFicheros: idsFicheros,
  id: 'canvas', etiqueta: 'Canvas',
  configurado: (ctx) => !!ctx.campus,
  loginUrl: (ctx) => ctx.campus + '/login',
  async cursos(ctx, api) { return (await lista(api, '/api/v1/courses?enrollment_state=active&per_page=100')).filter(c => c.name).map(c => ({ courseId: String(c.id), nombre: nombreCurso(c), completo: c.name })); },
  // Novedades: el flujo de actividad y, además, los anuncios de cada curso (el flujo solo trae los últimos y a veces los omite)
  async novedades(ctx, api) {
    const cursos = await this.cursos(ctx, api), nombres = new Map(cursos.map(c => [c.courseId, c.nombre]));
    const act = (await pagina(api, '/api/v1/users/self/activity_stream?per_page=30')).data || [];
    const out = act.map(a => ({ key: a.type === 'Announcement' && a.announcement_id ? `ann|${a.announcement_id}` : `${a.id}|${a.updated_at}`, fecha: dmy(a.created_at), curso: nombres.get(String(a.course_id)) || '', texto: `${TIPOS_STREAM[a.type] || a.type}: ${a.title || ''}`.trim(), href: a.html_url || '' }));
    const vistas = new Set(out.map(o => o.key)), desde = Date.now() - 45 * 864e5;
    for (const c of cursos) {
      let an = []; try { an = await lista(api, `/api/v1/courses/${c.courseId}/discussion_topics?only_announcements=true&per_page=50`); } catch (e) { if (e instanceof NeedLogin && e.status === 401) throw e; continue; }
      for (const t of an) { const k = `ann|${t.id}`, f = t.posted_at || t.created_at; if (vistas.has(k) || (f && new Date(f).getTime() < desde)) continue; vistas.add(k); out.push({ key: k, fecha: dmy(f), curso: c.nombre, texto: `Anuncio: ${t.title || ''}`.trim(), href: t.html_url || '' }); }
    }
    return out;
  },
  async plazos(ctx, api, cursos) {
    const out = [];
    for (const c of cursos) for (const a of await lista(api, `/api/v1/courses/${c.courseId}/assignments?per_page=100&include[]=submission`).catch(() => [])) {
      if (!a.due_at || new Date(a.due_at).getTime() < Date.now() - 864e5) continue; out.push({ sigla: c.sigla, titulo: a.name, fecha: iso(a.due_at) });
    }
    return out;
  },
  // Material: la lista de ficheros del curso y, si está cerrada (UOC: 403), los ficheros enlazados desde módulos, páginas, enunciados y anuncios;
  // además, las páginas de los módulos (enunciados y guías), los enunciados de las actividades y los anuncios, guardados como .html
  async ficheros(ctx, api, cursos, desde) {
    const out = [];
    const login401 = (e) => { if (e instanceof NeedLogin && e.status === 401) throw e; };
    for (const c of cursos) {
      const vistos = new Set(), html = [];   // html: [{ origen, cuerpo }] de donde sacar ficheros enlazados
      const addFich = (f, origen) => { if (!f || !f.url || vistos.has(String(f.id))) return; vistos.add(String(f.id)); out.push({ id: `${c.courseId}/${f.id}`, courseId: c.courseId, contentId: String(f.id), nombre: f.display_name || f.filename || `fichero-${f.id}`, ruta: origen || '', creado: f.created_at || f.updated_at || '', url: f.url, sigla: c.sigla }); };
      let lst = null; try { lst = await lista(api, `/api/v1/courses/${c.courseId}/files?per_page=100&sort=created_at&order=desc`); } catch (e) { login401(e); }   // la pestaña de archivos puede estar desactivada
      if (lst) for (const f of lst) if (!desde || (f.created_at || '') >= desde) addFich(f, 'Archivos');
      // módulos: páginas (enunciados, guías), ficheros sueltos y actividades
      let mods = []; try { mods = await lista(api, `/api/v1/courses/${c.courseId}/modules?include[]=items&per_page=50`); } catch (e) { login401(e); }
      const items = mods.flatMap(m => (m.items || []).map(it => ({ m, it })));
      for (const { m, it } of items) if (it.type === 'File' && it.content_id) html.push({ origen: m.name, ids: [String(it.content_id)] });
      const pags = items.filter(x => x.it.type === 'Page' && x.it.url).slice(0, MAX_PAGINAS);
      const leidas = await enParalelo(pags, 6, async (x) => { try { return await uno(api, x.it.url); } catch (e) { login401(e); return null; } });
      for (const [k, { m }] of pags.entries()) {
        const pg = leidas[k]; if (!pg || pg.locked_for_user) continue;
        html.push({ origen: `${m.name} › ${pg.title}`, cuerpo: pg.body });
        out.push({ id: `${c.courseId}/p:${pg.page_id || pg.url}:${pg.updated_at || ''}`, courseId: c.courseId, contentId: 'p' + (pg.page_id || pg.url), nombre: `${seguroNombre(pg.title)}.html`, ruta: m.name, creado: pg.updated_at || pg.created_at || '', sigla: c.sigla, tipo: 'pagina',
            html: docHtml(pg.title, c.nombre, pg.html_url || '', pg.body, pg.updated_at ? dmy(pg.updated_at) : '') });
      }
      // enunciados de las actividades (descripción de la tarea)
      let asg = []; try { asg = await lista(api, `/api/v1/courses/${c.courseId}/assignments?per_page=100`); } catch (e) { login401(e); }
      for (const a of asg) {
        if (!a.description || a.description.replace(/<[^>]+>/g, '').trim().length < 20) continue;
        html.push({ origen: `Actividad › ${a.name}`, cuerpo: a.description });
        out.push({ id: `${c.courseId}/a:${a.id}:${a.updated_at || ''}`, courseId: c.courseId, contentId: 'a' + a.id, nombre: `Enunciado - ${seguroNombre(a.name)}.html`, ruta: 'Actividades', creado: a.updated_at || a.created_at || '', sigla: c.sigla, tipo: 'pagina',
          html: docHtml(`Enunciado · ${a.name}`, c.nombre, a.html_url || '', `${a.due_at ? `<p><b>Fecha límite:</b> ${esc(dmy(a.due_at))}</p>` : ''}${a.points_possible ? `<p><b>Puntos:</b> ${esc(coma(a.points_possible))}</p>` : ''}${a.description}`, a.updated_at ? dmy(a.updated_at) : '') });
      }
      // anuncios recientes: su texto y sus adjuntos
      let an = []; try { an = await lista(api, `/api/v1/courses/${c.courseId}/discussion_topics?only_announcements=true&per_page=50`); } catch (e) { login401(e); }
      for (const t of an) {
        const f = t.posted_at || t.created_at || ''; if (desde && f && f < desde) continue;
        for (const at of t.attachments || []) addFich({ ...at, created_at: at.created_at || f }, `Anuncio › ${t.title}`);
        html.push({ origen: `Anuncio › ${t.title}`, cuerpo: t.message });
        out.push({ id: `${c.courseId}/n:${t.id}`, courseId: c.courseId, contentId: 'n' + t.id, nombre: `Anuncio ${iso(f)} - ${seguroNombre(t.title)}.html`, ruta: 'Anuncios', creado: f, sigla: c.sigla, tipo: 'pagina',
          html: docHtml(t.title, c.nombre, t.html_url || '', t.message, f ? dmy(f) : '') });
      }
      // ficheros enlazados: aunque la lista esté cerrada, cada uno se puede pedir por su id
      const pend = []; for (const h of html) for (const id of h.ids || idsFicheros(h.cuerpo)) if (!vistos.has(id) && !pend.some(p => p.id === id)) pend.push({ id, origen: h.origen });
      const meta = await enParalelo(pend, 6, async (p) => { try { return await uno(api, `/api/v1/courses/${c.courseId}/files/${p.id}`); } catch (e) { login401(e); return null; } });
      pend.forEach((p, k) => addFich(meta[k], p.origen));
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
    if (f.tipo === 'pagina') return { resp: new Response(f.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': String(Buffer.byteLength(f.html)) } }), nombre: f.nombre };   // ya leída al escanear
    const r = await api.fetch(f.url, { signal });
    if (!r.ok || (r.headers.get('content-type') || '').includes('text/html')) throw new Error(`Canvas no entregó el fichero (HTTP ${r.status})`);
    return { resp: r, nombre: f.nombre };
  },
  async notas(ctx, api, curso) {
    const filas = [];
    for (const a of await lista(api, `/api/v1/courses/${curso.courseId}/assignments?per_page=100&include[]=submission`).catch(() => [])) {
      // Las notas pueden ser puntos o letras (UOC: grading_type «letter_grade», nota «B», «C+»… y la puntuación aparte); la tarjeta guarda puntos/máximo y la letra va en el texto
      const s = a.submission || {}, letra = a.grading_type && a.grading_type !== 'points' && s.grade != null && !/^\d+([.,]\d+)?$/.test(String(s.grade)) ? String(s.grade) : '';
      const graded = s.workflow_state === 'graded' && s.score != null && a.points_possible > 0;
      const estado = s.excused ? 'Exento' : graded ? 'Calificado' : s.submitted_at || s.workflow_state === 'submitted' || s.workflow_state === 'pending_review' || (s.workflow_state === 'graded' && letra) ? 'Enviado' : 'Sin enviar';
      filas.push({ nombre: a.name, fecha: a.due_at ? dmy(a.due_at) : '', estado, nota: graded ? `${coma(s.score)}/${coma(a.points_possible)}` : 'Sin calificar', letra, intentos: s.attempt ? `Se entregó ${s.attempt} intento` : '' });
    }
    return filas;
  },
};
