const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
// Menú lateral plegable (lateral.js): botón ☰, Cmd/Ctrl+B, accesos con icono, insignias de asignatura y estado recordado
const { arranca, sleep } = require('./harness.js');
(async () => {
  const { w, errores } = await arranca();
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
  const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)], body = w.document.body;
  const tg = $('#sidebtn');
  t('botón en la barra, el primero', tg && $('#bar').firstElementChild === tg && tg.getAttribute('aria-expanded') === 'true');
  const its = $$('#snav .snav-it'), txt = its.map(b => b.getAttribute('aria-label'));
  t('accesos con icono', its.length >= 10 && ['Inicio', 'Estudiar', 'Dashboard', 'Horario', 'Notas', 'Preguntar', 'Avisos', 'Ajustes'].every(x => txt.includes(x)) && its.every(b => b.querySelector('.snav-ic').textContent.trim()));
  t('desplegado por defecto', !body.classList.contains('lat-plegado'));
  await sleep(100); tg.click(); await sleep(100);
  t('plegar con el botón', body.classList.contains('lat-plegado') && w.localStorage.getItem('brain-lateral') === 'plegado' && tg.getAttribute('aria-expanded') === 'false');
  t('insignias de asignatura', $$('#sasig .sasig-it').length === 6 && $$('#sasig .sasig-it').some(b => b.textContent === 'BRS'));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true })); await sleep(50);
  t('Cmd+B despliega', !body.classList.contains('lat-plegado') && w.localStorage.getItem('brain-lateral') === 'abierto');
  $('#q').focus(); $('#q').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })); await sleep(50);
  t('Ctrl+B escribiendo en el buscador no pliega', !body.classList.contains('lat-plegado'));
  its.find(b => b.getAttribute('aria-label') === 'Dashboard').click(); await sleep(500);
  t('acceso abre la pantalla y se marca', w.eval('view') === 'dash' && $('#snav .snav-it.on') && $('#snav .snav-it.on').getAttribute('aria-label') === 'Dashboard');
  its.find(b => b.getAttribute('aria-label') === 'Horario').click(); await sleep(500);
  t('cambia el resaltado', w.eval('view') === 'horario' && $$('#snav .snav-it.on').length === 1 && $('#snav .snav-it.on').getAttribute('aria-label') === 'Horario');
  its.find(b => b.getAttribute('aria-label') === 'Inicio').click(); await sleep(500);
  t('inicio marcado', $('#snav .snav-it.on') && $('#snav .snav-it.on').getAttribute('aria-label') === 'Inicio');
  tg.click(); await sleep(150); $$('#sasig .sasig-it').find(b => b.textContent === 'HE').click(); await sleep(400);
  t('insignia abre la asignatura', /Hacking|HE/.test($('#crumb').textContent) && !$('#snav .snav-it.on'));
  const nb = $('#nbtn'); nb.append(w.document.createElement('b')); nb.querySelector('b').textContent = '3'; await sleep(100);
  const av = $$('#snav .snav-it').find(b => b.getAttribute('aria-label') === 'Avisos').querySelector('.snav-n');
  t('copia el contador de avisos', !av.hidden && av.textContent === '3');
  w.localStorage.setItem('brain-lateral', 'plegado'); body.classList.remove('lat-plegado'); w.eval('latPliega(latLee())');
  t('recuerda el estado al abrir', body.classList.contains('lat-plegado'));
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(errores.length ? 1 : 0);
})();
