const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const { w, errores } = await arranca(); let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  w.eval('showNotas()'); await sleep(500); click(w.document.querySelector('.nt-btn')); await sleep(100);
  const campos = () => [...w.document.querySelectorAll('.nt-calc input')], res = () => (w.document.querySelector('.nt-res') || {}).textContent || '';
  const obj = campos().pop(); obj.focus(); obj.value = ''; obj.dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(50);
  t('borrar no cierra y usa 5 por defecto', !!w.document.querySelector('.nt-calc') && /Para llegar a 5/.test(res()) && campos().pop().value === '');
  w.eval('loadDash()'); await sleep(400); t('con el foco en el campo no se redibuja', document_activo(w) && campos().pop() === obj);
  obj.value = '7'; obj.dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(50); t('escribir 7', /Para llegar a 7/.test(res()));
  w.eval('leeNotasBB()'); await sleep(400); t('sigue abierto tras releer notas', !!w.document.querySelector('.nt-calc') && campos().pop() === obj);
  obj.blur(); await sleep(100); t('al salir del campo se redibuja y el panel sigue abierto', !!w.document.querySelector('.nt-calc') && campos().pop().value === '7' && campos().pop() !== obj);
  w.eval('loadDash()'); await sleep(400); t('panel abierto tras refresco', !!w.document.querySelector('.nt-calc'));
  click(w.document.querySelector('.nt-btn')); await sleep(50); t('se cierra con el botón', !w.document.querySelector('.nt-calc')); w.eval('loadDash()'); await sleep(300); t('cerrado se queda cerrado', !w.document.querySelector('.nt-calc'));
  console.log('errores', errores.length, 'ok', ok, 'ko', ko); process.exit(0);
  function document_activo(w) { return w.document.activeElement === obj; }
})();
