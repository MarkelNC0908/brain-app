const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const enviados = [], copiado = [];
  const { w, errores } = await arranca({ brain: { logError: (m) => enviados.push(m), diagInforme: async () => ({ ok: true, texto: 'Informe de Brain\nVersión: 1.0.14' }), diagCarpeta: async () => {} } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (x) => { copiado.push(x); } }, configurable: true });
  w.eval('showAjustes()'); await sleep(400); t('sección diagnóstico', /Diagnóstico/.test(tx('#aj-diag')) && /no se envía a ningún sitio/.test(tx('#aj-diag')));
  click([...w.document.querySelectorAll('#aj-diag button')].find(b => /Copiar informe/.test(b.textContent))); await sleep(100);
  t('copia el informe y lo muestra', copiado.length === 1 && /Versión: 1\.0\.14/.test(copiado[0]) && /Informe copiado/.test(tx('#aj-diag')) && /Versión: 1\.0\.14/.test(tx('.diag-pre')));
  w.dispatchEvent(new w.ErrorEvent('error', { message: 'Boom de prueba', filename: 'http://x/app.js', lineno: 7, colno: 3 })); t('los errores de la ventana van al registro', enviados.some(m => /Boom de prueba @ app\.js:7:3/.test(m)));
  console.log('errores', errores.length, 'ok', ok, 'ko', ko); process.exit(0);
})();
