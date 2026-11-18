const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const ms = { status: 'ok', msg: 'ok', lastCheck: new Date().toISOString(), sinLeer: 0, cursos: [{ courseId: 'c1', sigla: 'BRS', nombre: 'Bastionado', habilitado: true, conversaciones: [] }, { courseId: 'c2', sigla: 'HE', nombre: 'Hacking', habilitado: true, conversaciones: [] }] };
  const { w, errores } = await arranca({ brain: { mensajesState: async () => ms, mensajesCheck: async () => ms, mensajesCerrarRedaccion: async () => {} } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  w.eval('showMensajes()'); await sleep(300); t('sin borrador no hay banner', !w.document.querySelector('.borr'));
  w.eval("abrirNuevo('c2')"); await sleep(100); const ta = w.document.querySelector('.msg-ta'); ta.value = 'Hola, tengo una duda sobre el examen'; ta.dispatchEvent(new w.Event('input', { bubbles: true })); w.eval("msgNuevo.dest = [{ id: 'u1', nombre: 'Ana' }]; msgNuevo.idea = 'pedir tutoría'");
  w.eval('guardaBorradorAhora()'); const guardado = JSON.parse(w.localStorage.getItem(w.eval('kBorr()'))); t('se guarda en disco', guardado.courseId === 'c2' && /duda sobre el examen/.test(guardado.texto) && guardado.dest.length === 1 && guardado.idea === 'pedir tutoría');
  // «cierre de la app»: se pierde el estado en memoria
  w.eval('msgNuevo = null; showNotas()'); await sleep(200); w.eval('showMensajes()'); await sleep(300); t('banner de borrador', /Tienes un mensaje sin enviar/.test(tx('.borr')) && /Hacking/.test(tx('.borr')) && /36 caracteres/.test(tx('.borr')));
  click([...w.document.querySelectorAll('.borr button')].find(b => /Continuar/.test(b.textContent))); await sleep(200);
  t('continuar restaura todo', w.document.querySelector('.msg-ta').value === 'Hola, tengo una duda sobre el examen' && w.eval('msgNuevo.courseId') === 'c2' && w.eval('msgNuevo.dest.length') === 1 && w.eval('msgNuevo.idea') === 'pedir tutoría');
  w.eval('cierraNuevo()'); await sleep(100); t('cancelar borra el borrador', w.localStorage.getItem(w.eval('kBorr()')) === null && !w.document.querySelector('.borr'));
  w.eval("abrirNuevo('c1')"); await sleep(100); w.eval("msgNuevo.texto = 'otro'; guardaBorradorAhora(); msgNuevo = null; showNotas()"); await sleep(100); w.eval('showMensajes()'); await sleep(200);
  click([...w.document.querySelectorAll('.borr button')].find(b => /Descartar/.test(b.textContent))); await sleep(50); t('descartar desde el banner', !w.document.querySelector('.borr') && w.localStorage.getItem(w.eval('kBorr()')) === null);
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
