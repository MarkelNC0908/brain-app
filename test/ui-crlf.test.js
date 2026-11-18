// Apuntes con saltos de línea de Windows (CRLF): las definiciones, las tarjetas, la búsqueda y el plan deben funcionar igual que con LF
const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const R = require('../src/respuestas.js'), { arranca, sleep } = require('./harness.js');
(async () => {
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
  const { w, errores, notes } = await arranca(); const sinCambios = notes.map(n => ({ ...n }));
  const crlf = notes.map(n => ({ ...n, body: n.body.replace(/\r?\n/g, '\r\n') }));
  t('definiciones con CRLF = con LF', R.definiciones(crlf, '', '¿qué es el hardening?').length === R.definiciones(sinCambios, '', '¿qué es el hardening?').length && R.definiciones(crlf, '', '¿qué es el hardening?').length > 0);
  t('trocea y busca con CRLF', R.busca(R.trocea(crlf, ''), 'fail2ban bloquea ip').length > 0 && R.responde(crlf, '', 'cadena de custodia').defs.length > 0);
  const ex = R.extracto('- uno dos tres cuatro\r\n- cinco seis siete\r\n- ocho nueve', 'cinco seis', 200); t('extracto sin retornos de carro', !/\r/.test(ex) && /cinco/.test(ex));
  // tarjetas del modo juego (study.js) con CRLF
  const n0 = w.eval('buildCards().length'); w.eval("notes.forEach(n => { n.body = n.body.replace(/\\r?\\n/g, '\\r\\n'); }); cardsCache = null"); const n1 = w.eval('buildCards().length'); t('tarjetas con CRLF = con LF', n0 >= 6 && n1 === n0);
  console.log('errores', errores.length, 'ok', ok, 'ko', ko); process.exit(0);
})();
