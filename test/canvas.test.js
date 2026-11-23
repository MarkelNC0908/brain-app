// Conector de Canvas con un campus simulado con la forma del de la UOC (aula.uoc.edu, revisado el 2026-11-23):
// notas en letras, lista de archivos cerrada (403), enunciados en páginas de módulos y anuncios con adjuntos. Datos inventados.
const C = require('../src/canvas.js'), M = require('../src/matcher.js');
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
const hace = (d) => new Date(Date.now() - d * 864e5).toISOString();
const R = {
  '/api/v1/courses?enrollment_state=active&per_page=100': [{ id: 101, name: '76.511 - Diseño gráfico - Aula 1' }, { id: 102, name: 'Comunidad de estudiantes 2023' }],
  '/api/v1/users/self/activity_stream?per_page=30': [{ id: 9, type: 'Announcement', announcement_id: 501, title: 'Bienvenida', created_at: hace(2), updated_at: hace(2), course_id: 101, html_url: 'https://aula.x/courses/101/discussion_topics/501' }, { id: 10, type: 'Submission', title: 'PEC1', created_at: hace(1), updated_at: hace(1), course_id: 101 }],
  '/api/v1/courses/101/discussion_topics?only_announcements=true&per_page=50': [
    { id: 501, title: 'Bienvenida', posted_at: hace(2), message: '<p>Hola</p>', html_url: 'https://aula.x/a/501', attachments: [] },
    { id: 502, title: 'Calendario de PEC', posted_at: hace(10), message: '<p>Ver <a href="/courses/101/files/7001">calendario</a></p>', html_url: 'https://aula.x/a/502', attachments: [{ id: 7002, display_name: 'calendario.pdf', url: 'https://aula.x/files/7002/download', 'content-type': 'application/pdf' }] },
    { id: 503, title: 'Antiguo', posted_at: hace(200), message: '<p>viejo</p>', attachments: [] }],
  '/api/v1/courses/101/files?per_page=100&sort=created_at&order=desc': 403,
  '/api/v1/courses/101/modules?include[]=items&per_page=50': [{ name: 'Reto 1', items: [{ type: 'Page', url: 'https://aula.x/api/v1/courses/101/pages/enunciado-reto-1' }, { type: 'Discussion' }, { type: 'File', content_id: 7003 }, { type: 'Assignment' }] }],
  'https://aula.x/api/v1/courses/101/pages/enunciado-reto-1': { page_id: 31, url: 'enunciado-reto-1', title: 'Enunciado: Reto 1', body: '<p>Haz <a href="https://aula.x/courses/101/files/7001/download">la plantilla</a></p>', updated_at: hace(30), html_url: 'https://aula.x/courses/101/pages/enunciado-reto-1' },
  '/api/v1/courses/101/files/7001': { id: 7001, display_name: 'plantilla.pdf', url: 'https://aula.x/files/7001/download', created_at: hace(60) },
  '/api/v1/courses/101/files/7003': { id: 7003, display_name: 'guia.pdf', url: 'https://aula.x/files/7003/download', created_at: hace(90) },
  '/api/v1/courses/101/assignments?per_page=100': [{ id: 41, name: 'PEC1', description: '<p>Entrega un cartel en PDF con las pautas del reto.</p>', due_at: hace(-5), points_possible: 25, html_url: 'https://aula.x/courses/101/assignments/41' }, { id: 42, name: 'Sin texto', description: '' }],
  '/api/v1/courses/101/assignments?per_page=100&include[]=submission': [
    { id: 41, name: 'PEC1', grading_type: 'letter_grade', points_possible: 25, due_at: hace(20), submission: { workflow_state: 'graded', score: 21, grade: 'B', attempt: 1 } },
    { id: 43, name: 'PEC2', grading_type: 'letter_grade', points_possible: 35, due_at: hace(3), submission: { workflow_state: 'submitted', submitted_at: hace(4), score: null, grade: null, attempt: 1 } },
    { id: 44, name: 'PEC3', grading_type: 'letter_grade', points_possible: 40, due_at: hace(-20), submission: { workflow_state: 'unsubmitted' } },
    { id: 45, name: 'Práctica puntos', grading_type: 'points', points_possible: 10, submission: { workflow_state: 'graded', score: 8.5, grade: '8.5' } }],
};
const peticiones = [];
const api = { campus: 'https://aula.x', fetch: async (u) => { peticiones.push(u); const k = u.startsWith('https://aula.x/api/v1/courses/101/pages') ? u : u.replace('https://aula.x', ''); const v = R[k];
  if (v === undefined) return new Response('{"errors":[{"message":"not found"}]}', { status: 404, headers: { 'content-type': 'application/json' } });
  if (typeof v === 'number') return new Response('{"status":"unauthorized"}', { status: v, headers: { 'content-type': 'application/json' } });
  return new Response('while(1);' + JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } }); } };
(async () => {
  t('nombre del curso sin código ni aula', C._nombreCurso({ name: '76.511 - Diseño gráfico - Aula 1' }) === 'Diseño gráfico' && C._nombreCurso({ name: 'Bases de datos' }) === 'Bases de datos');
  const cursos = await C.cursos({}, api); t('cursos con nombre limpio', cursos[0].nombre === 'Diseño gráfico' && cursos[0].completo === '76.511 - Diseño gráfico - Aula 1');
  const nov = await C.novedades({}, api);
  t('novedades: anuncios en español y sin duplicar el del flujo', nov.filter(n => n.key === 'ann|501').length === 1 && /^Anuncio: Bienvenida/.test(nov.find(n => n.key === 'ann|501').texto) && /^Entrega: PEC1/.test(nov.find(n => /Entrega/.test(n.texto)).texto));
  t('novedades: anuncio de un curso que no estaba en el flujo', nov.some(n => n.key === 'ann|502' && n.curso === 'Diseño gráfico') && !nov.some(n => n.key === 'ann|503'));
  const fs = await C.ficheros({}, api, [{ courseId: '101', sigla: 'dg' }], hace(45));
  const nom = fs.map(f => f.nombre);
  t('con la lista de archivos cerrada (403) saca los ficheros enlazados', nom.includes('plantilla.pdf') && nom.includes('guia.pdf') && nom.includes('calendario.pdf'));
  t('cada fichero una vez aunque se enlace desde varios sitios', nom.filter(n => n === 'plantilla.pdf').length === 1);
  t('página del módulo como .html con su origen', fs.some(f => f.tipo === 'pagina' && f.nombre === 'Enunciado Reto 1.html' && f.ruta === 'Reto 1' && /<h1>Enunciado: Reto 1<\/h1>/.test(f.html) && /original en el campus/.test(f.html)));
  t('enunciado de la actividad con fecha y puntos', fs.some(f => f.nombre === 'Enunciado - PEC1.html' && /Fecha límite/.test(f.html) && /Puntos:<\/b> 25/.test(f.html)) && !fs.some(f => /Sin texto/.test(f.nombre)));
  t('anuncios recientes como .html, no los antiguos', fs.some(f => /^Anuncio \d{4}-\d\d-\d\d - Calendario de PEC\.html$/.test(f.nombre)) && !fs.some(f => /Antiguo/.test(f.nombre)));
  const pg = fs.find(f => f.tipo === 'pagina'), d = await C.descargar({}, api, pg); t('descargar una página no pide nada al campus', d.nombre === pg.nombre && (await d.resp.text()) === pg.html && +d.resp.headers.get('content-length') > 0);
  const notas = await C.notas({}, api, { courseId: '101' });
  t('nota en letras: puntos para la tarjeta y la letra aparte', notas[0].estado === 'Calificado' && notas[0].nota === '21/25' && notas[0].letra === 'B');
  t('entregada sin nota y pendiente', notas[1].estado === 'Enviado' && notas[1].nota === 'Sin calificar' && notas[2].estado === 'Sin enviar');
  t('nota en puntos sin letra', notas[3].nota === '8,5/10' && notas[3].letra === '');
  t('ids de ficheros en un HTML', C._idsFicheros('<a href="/courses/1/files/22/download">x</a><img src="https://a/files/33/preview">').join() === '22,33');
  console.log('peticiones', peticiones.length, 'ok', ok, 'ko', ko);
})();
