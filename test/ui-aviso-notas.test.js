const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const sets = []; let aviso = true;
  const hoy = new Date(2026, 10, 18, 12).toISOString(), notasBB = { status: 'ok', leido: hoy, ultimosCambios: { fecha: hoy, lista: [{ sigla: 'brs', nombre: 'Práctica 1', nota: 9, max: 10, notaTexto: '9/10', tipo: 'nueva' }] }, cursos: [{ sigla: 'brs', nombre: 'BRS', filas: [{ nombre: 'Test UD-2', estado: 'Calificado', fecha: '2026-09-24', nota: 7.5, max: 10, notaTexto: '7,5/10' }, { nombre: 'Práctica 1', estado: 'Calificado', fecha: '2026-10-11', nota: 9, max: 10, notaTexto: '9/10' }] }] };
  const { w, errores } = await arranca({ notasBB, brain: { ajustesGet: async () => ({ ok: true, avisoNotas: aviso, atajoRapido: false }), ajustesSet: async (p) => { sets.push(p); if ('avisoNotas' in p) aviso = p.avisoNotas; return { ok: true }; } } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  w.eval('showNotas()'); await sleep(500); const filas = [...w.document.querySelectorAll('.nt-row')]; const f1 = filas.find(r => /Práctica 1/.test(r.textContent)), f2 = filas.find(r => /Test UD-2/.test(r.textContent));
  t('🆕 en la nota que cambió', /🆕 nueva/.test(f1.textContent) && !/🆕/.test(f2.textContent));
  w.eval("ntBB.ultimosCambios.fecha = new Date(Date.now() - 9 * 864e5).toISOString(); drawNotas()"); await sleep(100); t('pasados 7 días ya no sale', !/🆕/.test(tx('#doc')));
  w.eval('showAjustes()'); await sleep(500); t('sección de avisos con la casilla activada por defecto', /Avisarme cuando salga una nota nueva/.test(tx('#aj-avisos')) && w.document.querySelector('#aj-avisos input').checked === true);
  const cb = w.document.querySelector('#aj-avisos input'); cb.checked = false; cb.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(50); t('apagarla se guarda', sets.length === 1 && sets[0].avisoNotas === false);
  // evento del proceso principal: relectura con cambios mientras estás en Notas
  w.eval('showNotas()'); await sleep(300); await w.__cb.onNotasCambio(); await sleep(200); t('el aviso del sistema refresca la pantalla', !!w.document.querySelector('.nt-row')); await w.__cb.onNotasUi(); await sleep(200); t('pulsar la notificación abre Notas', /Notas del curso/.test(tx('#doc')));
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
