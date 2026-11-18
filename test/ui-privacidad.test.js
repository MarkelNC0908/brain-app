const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const { w, errores, llamadas } = await arranca({ brain: { profLogout: async () => { llamadas.push(['profLogout']); } } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  // ocultar notas
  w.eval('showNotas()'); await sleep(400); const b = w.document.querySelector('.oc-btn'); t('botón ocultar en Notas', !!b && /Ocultar notas/.test(b.textContent)); click(b); t('notas difuminadas', w.document.body.classList.contains('ocultar-notas') && /Mostrar notas/.test(b.textContent) && w.localStorage.getItem('brain-ocultar-notas') === '1');
  click(w.document.querySelector('.oc-btn')); t('se vuelven a mostrar', !w.document.body.classList.contains('ocultar-notas'));
  // ajustes
  w.eval('showAjustes()'); await sleep(400); t('sección privacidad', /Privacidad/.test(tx('#aj-priv')) && /Tu perfil no tiene PIN/.test(tx('#aj-priv')));
  const sel = w.document.querySelector('#aj-priv select'); sel.value = '5'; sel.dispatchEvent(new w.Event('change')); t('guarda minutos', w.localStorage.getItem('brain-bloqueo-min') === '5');
  // inactividad sin PIN: overlay
  w.eval('ultimaActividad = Date.now() - 4 * 60000; compruebaBloqueo(Date.now())'); t('a los 4 min no bloquea', !w.document.querySelector('#lock'));
  w.eval('ultimaActividad = Date.now() - 6 * 60000; compruebaBloqueo(Date.now())'); t('a los 6 min bloquea', !!w.document.querySelector('#lock') && /Bloqueada por inactividad/.test(tx('#lock')));
  click(w.document.querySelector('#lock button')); t('continuar desbloquea', !w.document.querySelector('#lock'));
  // temporizador en marcha: no bloquea
  w.eval("pomoInicia('brs', 25); ultimaActividad = Date.now() - 60 * 60000; compruebaBloqueo(Date.now())"); t('con pomodoro en marcha no bloquea', !w.document.querySelector('#lock'));
  // con PIN: cierra el perfil
  w.eval("pomoS.fase = null; PROFILE = { id: 'p1', name: 'x', hasPin: true }; ultimaActividad = Date.now() - 60 * 60000; compruebaBloqueo(Date.now())"); t('con PIN vuelve a perfiles', llamadas.some(l => l[0] === 'profLogout') && !w.document.querySelector('#lock'));
  w.localStorage.setItem('brain-bloqueo-min', '0'); w.eval("PROFILE = null; ultimaActividad = 0; compruebaBloqueo(Date.now())"); t('0 = nunca', !w.document.querySelector('#lock'));
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
