const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const { w, errores } = await arranca(); let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  t('widget presente', !!w.document.querySelector('#pomo-pill')); click(w.document.querySelector('#pomo-pill')); await sleep(50); t('panel abierto con asignaturas', /Temporizador de estudio/.test(tx('#pomo')) && w.document.querySelectorAll('#pomo select option').length >= 2);
  w.document.querySelector('#pomo select').value = 'brs'; w.document.querySelector('#pomo select').dispatchEvent(new w.Event('change')); click([...w.document.querySelectorAll('#pomo button.pri')][0]); await sleep(50);
  t('en marcha', /2[45]:\d\d/.test(tx('#pomo-pill')) && /BRS/.test(tx('#pomo')) && w.eval('pomoS.fase') === 'foco');
  click([...w.document.querySelectorAll('#pomo button')].find(b => /Pausa/.test(b.textContent))); await sleep(30); t('pausa', w.eval('pomoS.pausa') === true && /⏸/.test(tx('#pomo-pill')));
  click([...w.document.querySelectorAll('#pomo button')].find(b => /Seguir/.test(b.textContent))); w.eval('pomoS.fin = Date.now() - 1'); w.eval('pomoTick()'); await sleep(30);
  t('termina y registra', w.eval('pomoS.fase') === 'fin' && w.eval('leePomo().length') === 1 && w.eval('leePomo()[0].sigla') === 'brs' && w.eval('leePomo()[0].min') === 25 && /Sesión de 25 min terminada/.test(tx('#pomo')));
  w.eval("(function(){ const l = leePomo(); l.push({ fecha: sumaDias(isoDe(new Date()), -1), sigla: 'inc', min: 50 }, { fecha: sumaDias(isoDe(new Date()), -2), sigla: 'brs', min: 25 }); guardaPomo(l); })()");
  w.eval('showStudy()'); await sleep(200); const e = tx('#doc'); console.log('ESTADÍSTICAS:', e.slice(e.indexOf('Tiempo de estudio'), e.indexOf('Tiempo de estudio') + 120)); t('estadísticas y racha', /Últimos 7 días: 1 h 40 min/.test(e) && /racha de 3 días/.test(e) && /INC/.test(e));
  w.eval('home()'); await sleep(200); t('Hoy toca muestra el tiempo', /Hoy llevas 25 min/.test(tx('#hoy')));
  click([...w.document.querySelectorAll('#pomo button')].find(b => /Descanso 5/.test(b.textContent))); await sleep(30); t('descanso', w.eval('pomoS.fase') === 'descanso' && /☕/.test(tx('#pomo-pill')));
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
