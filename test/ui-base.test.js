const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain en ' + __V + ')'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const { w, errores, llamadas } = await arranca(); let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
  const doc = () => w.document.querySelector('#doc').textContent.replace(/\s+/g, ' ');
  t('carga sin errores', errores.length === 0); if (errores.length) console.log(errores.slice(0, 5));
  t('home', /Apuntes/.test(doc()) && /apunte\(s\)/.test(doc()));
  w.eval('showNotas()'); await sleep(500); const n = doc(); console.log('NOTAS:', n.slice(0, 260)); t('notas BB', /Blackboard/.test(n) && /Práctica 1/.test(n) && /9\/10/.test(n)); t('notas PPS vacía', /PPS/.test(n) && /no muestra elementos/.test(n));
  w.eval('showPreguntar()'); await sleep(300); const inp = w.document.querySelector('#rs-q'); inp.value = '¿qué es el hardening?'; w.eval('1'); inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' })); await sleep(200); const p = doc(); console.log('PREGUNTAR:', p.slice(0, 200)); t('preguntar respuesta directa', /Respuesta directa/.test(p) && /Hardening/i.test(p));
  w.eval('showAjustes()'); await sleep(500); const a = doc(); console.log('AJUSTES:', a.slice(0, 300)); t('ajustes secciones', /Sesión del campus/.test(a) && /Enlaces del campus/.test(a) && /IA opcional/.test(a) && /Sesión iniciada/.test(a));
  console.log('errores finales:', errores.length, errores.slice(0, 3)); console.log('ok', ok, 'ko', ko); process.exit(0);
})();
