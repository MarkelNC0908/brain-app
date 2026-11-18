const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const iaEst = { ok: false, ollama: { ok: false, modelos: [], defecto: 'q' }, gemini: { clave: true, cifrada: true, modelos: ['gemini-flash-lite-latest'], defecto: 'gemini-flash-lite-latest' } }, guardados = [];
  const { w, errores, notes } = await arranca({ iaEst, brain: { notaGuardar: async (d) => { guardados.push(d); return { ok: true, ruta: '02-Asignaturas/pps/apuntes/ia-x.md' }; }, iaTarea: async () => ({ ok: true, tipo: 'resumen', texto: '- punto uno\n- punto dos' }) } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  w.eval("preguntaRapida('hardening')"); await sleep(300); click([...w.document.querySelectorAll('#rs-ia button')].find(b => /Redactar/.test(b.textContent))); await sleep(300);
  const bg = [...w.document.querySelectorAll('#rs-ia .gd > button')]; t('botón guardar tras la respuesta', bg.length === 1); click(bg[0]);
  t('aviso de que es un apunte nuevo y supuesto', /apunte NUEVO/.test(tx('.gd-f')) && /\[supuesto\]/.test(tx('.gd-f')));
  click([...w.document.querySelectorAll('.gd-f button')].find(b => /Crear apunte/.test(b.textContent))); await sleep(100);
  t('envía sigla, título, cuerpo y origen', guardados.length === 1 && /Respuesta \[1\]/.test(guardados[0].cuerpo) && /## Pregunta/.test(guardados[0].cuerpo) && guardados[0].origen === 'Gemini' && guardados[0].sigla && /Guardado en 02-Asignaturas/.test(tx('.gd-f')));
  const n = notes.find(x => /^02-Asignaturas\/he\//.test(x.path) && x.body.length > 300); w.eval(`show(${JSON.stringify(n.path)})`); await sleep(300);
  click([...w.document.querySelectorAll('#ap-acc button')].find(b => /Resumir/.test(b.textContent))); await sleep(200); const b2 = w.document.querySelector('#ap-out .gd > button'); t('guardar el resumen', !!b2); click(b2);
  t('título propuesto del resumen', w.document.querySelector('.gd-f input').value.startsWith('Resumen · ') && w.document.querySelector('.gd-f select').value === 'he');
  click([...w.document.querySelectorAll('.gd-f button')].find(b => /Cancelar/.test(b.textContent))); await sleep(50); t('cancelar vuelve al botón', !w.document.querySelector('.gd-f') && !w.document.querySelector('.gd > button').hidden);
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
