const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const guardados = []; let abierto = { ok: true, texto: '', nombre: 'x.json' }; const enlaces = [];
  const { w, errores } = await arranca({ enlaces: [{ nombre: 'BRS', url: 'https://campus.ejemplo.edu/brs' }], brain: { textoGuardar: async (d) => { guardados.push(d); return { ok: true, ruta: '/tmp/' + d.nombre }; }, textoAbrir: async () => abierto, enlacesGuardar: async (l) => { enlaces.push(l); return { ok: true, lista: l }; } } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  // datos de ejemplo
  w.eval("localStorage.setItem('brain-dudas', JSON.stringify([{ id: 'd1', texto: 'duda 1', resuelta: false }, { id: 'd2', texto: 'duda 2', resuelta: true }])); localStorage.setItem('brain-pomo', JSON.stringify([{ fecha: '2026-11-17', sigla: 'brs', min: 25 }])); localStorage.setItem('brain-plan', JSON.stringify({ a: { hechos: ['x'], excl: [], sims: [] } })); localStorage.setItem('brain-act-desc-tag', 'v9'); localStorage.setItem('brain-borrador-msg', 'secreto'); localStorage.setItem('brain-ocultar-notas', '1')");
  w.eval('showAjustes()'); await sleep(500); t('sección de copia', /Copia de seguridad de mis datos/.test(tx('#aj-copia')) && /No incluye claves ni mensajes a medias/.test(tx('#aj-copia')));
  click([...w.document.querySelectorAll('#aj-copia button')].find(b => /Exportar/.test(b.textContent))); await sleep(300);
  const copia = JSON.parse(guardados[0].texto); t('exporta formato, datos y enlaces', copia.formato === 'brain-datos' && copia.datos['brain-dudas'] && copia.datos['brain-pomo'] && copia.datos['brain-ocultar-notas'] === '1' && copia.enlaces.length === 1 && /^brain-datos-\d{4}-\d{2}-\d{2}\.json$/.test(guardados[0].nombre) && guardados[0].extension === 'json');
  t('no exporta lo privado ni lo propio del equipo', !('brain-borrador-msg' in copia.datos) && !Object.keys(copia.datos).some(k => /brain-act-/.test(k)));
  // importar en un «equipo nuevo»
  w.eval("localStorage.clear()"); abierto = { ok: true, texto: guardados[0].texto, nombre: 'c.json' };
  click([...w.document.querySelectorAll('#aj-copia button')].find(b => /Importar una copia/.test(b.textContent))); await sleep(300);
  t('resumen antes de importar', /2 dudas, 1 sesiones de estudio, 1 plan\(es\) de examen/.test(tx('#aj-copia')) && /SUSTITUYEN/.test(tx('#aj-copia')));
  click([...w.document.querySelectorAll('#aj-copia button')].find(b => /Importar y sustituir/.test(b.textContent))); await sleep(300);
  t('importa datos y enlaces', w.eval("JSON.parse(localStorage.getItem('brain-dudas')).length") === 2 && w.eval("localStorage.getItem('brain-ocultar-notas')") === '1' && enlaces.length === 1 && /Importados/.test(tx('#aj-copia')) && w.document.body.classList.contains('ocultar-notas'));
  abierto = { ok: true, texto: '{"hola":1}', nombre: 'x' }; click([...w.document.querySelectorAll('#aj-copia button')].find(b => /Importar una copia/.test(b.textContent))); await sleep(200); t('rechaza ficheros que no son copias', /No es una copia de datos de Brain/.test(tx('#aj-copia')));
  abierto = { ok: true, texto: 'no json', nombre: 'x' }; click([...w.document.querySelectorAll('#aj-copia button')].find(b => /Importar una copia/.test(b.textContent))); await sleep(200); t('rechaza JSON roto', /no es un JSON válido/.test(tx('#aj-copia')));
  abierto = { ok: true, texto: JSON.stringify({ formato: 'brain-datos', datos: { 'brain-dudas': '[]', 'otra-cosa': 'x', 'brain-borrador-msg': 'y', '../../etc': 'z' } }), nombre: 'm' }; t('filtra claves ajenas o prohibidas', JSON.stringify(Object.keys(w.eval('validaCopia')(abierto.texto).datos)) === '["brain-dudas"]');
  // perfil: las claves con el id del perfil se normalizan
  w.eval("PROFILE = { id: 'abc123', name: 'x' }; localStorage.setItem('brain-dudas-abc123', '[1]')"); t('quita el id del perfil al exportar', 'brain-dudas{perfil}' in w.eval('datosParaCopia()'));
  w.eval("PROFILE = { id: 'zzz999', name: 'otro' }"); await w.eval("aplicaCopia({ datos: { 'brain-dudas{perfil}': '[2]' }, enlaces: [] })"); t('y lo pone del perfil nuevo al importar', w.localStorage.getItem('brain-dudas-zzz999') === '[2]');
  // Anki
  w.eval("PROFILE = null"); w.eval('showStudy()'); await sleep(300); const ba = [...w.document.querySelectorAll('#doc button')].find(b => /Exportar a Anki/.test(b.textContent)); t('botón de Anki en Estudiar', !!ba); click(ba); await sleep(300);
  const anki = guardados[guardados.length - 1]; t('exporta TSV para Anki', anki.extension === 'txt' && /^#separator:tab\n#html:true\n#tags column:3\n/.test(anki.texto) && anki.texto.split('\n').filter(l => !l.startsWith('#') && l).every(l => l.split('\t').length === 3 && /^Brain::[A-Z]+$/.test(l.split('\t')[2])) && /¿Qué es «/.test(anki.texto));
  t('escapa HTML y tabuladores', w.eval("textoAnki([{ term: 'a<b>', def: 'x\\ty\\nz & w', sigla: 'HE', apunte: 'T' }])").split('\n')[3] === '¿Qué es «a&lt;b&gt;»?\tx y<br>z &amp; w<br><small>HE · T</small>\tBrain::HE');
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
