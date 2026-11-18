const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const { w, errores } = await arranca(); let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  // armaPlan: puro
  const arma = w.eval('armaPlan'); const nn = (k) => Array.from({ length: k }, (_, i) => ({ path: 'p' + i, title: 'T' + i, base: 'b' + i }));
  const p1 = arma({ fecha: '2026-11-23' }, nn(6), '2026-11-18'); t('5 días hasta el examen', p1.length === 5 && p1[0].fecha === '2026-11-18' && p1[4].fecha === '2026-11-22');
  t('todos los apuntes repartidos una vez', p1.flatMap(d => d.tareas).filter(x => x.tipo === 'leer').length === 6 && new Set(p1.flatMap(d => d.tareas).filter(x => x.tipo === 'leer').map(x => x.path)).size === 6);
  t('los 2 últimos días son de repaso y el último trae el simulacro', p1[3].tareas.every(x => x.tipo !== 'leer') && p1[4].tareas.some(x => x.tipo === 'simulacro') && p1[4].tareas.every(x => x.tipo !== 'leer'));
  t('examen mañana: 1 día con simulacro', (() => { const p = arma({ fecha: '2026-11-19' }, nn(3), '2026-11-18'); return p.length === 1 && p[0].tareas.some(x => x.tipo === 'simulacro'); })());
  t('examen hoy: sin días', arma({ fecha: '2026-11-18' }, nn(3), '2026-11-18').length === 0);
  t('sin apuntes: solo repaso', arma({ fecha: '2026-11-25' }, [], '2026-11-18').every(d => d.tareas.every(x => x.tipo !== 'leer')));
  // pantalla
  w.eval('showPlan()'); await sleep(300); const doc = tx('#doc'); console.log('PLAN:', doc.slice(0, 220));
  t('pantalla del plan', /Plan de examen y simulacro/.test(doc) && /Faltan \d+ días|Mañana|Es hoy/.test(doc) && /Apuntes incluidos/.test(doc));
  const cb = w.document.querySelector('.pl-t input'); if (cb) { cb.checked = true; cb.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(50); t('marcar tarea y persistir', /1\/\d+ tareas hechas/.test(tx('#doc')) && /brain-plan/.test(Object.keys(w.localStorage).join(','))); } else t('hay tareas', false);
  // simulacro
  const bs = [...w.document.querySelectorAll('.aj-sec button')].find(b => /Empezar simulacro/.test(b.textContent)); t('botón simulacro', !!bs && !bs.disabled);
  if (bs && !bs.disabled) { click(bs); await sleep(100); t('simulacro en marcha', /Simulacro · pregunta 1\//.test(tx('#doc')) && /\d+:\d\d/.test(tx('#sim-t')));
    const n = w.eval('simAct.qs.length'); for (let i = 0; i < n; i++) { click(w.document.querySelector('.qcard .opt')); await sleep(10); const nx = [...w.document.querySelectorAll('.acts2 button')].find(b => /Siguiente|Terminar/.test(b.textContent)); click(nx); await sleep(20); }
    t('resultado del simulacro', /correctas \(\d+ %\)/.test(tx('#doc')) && w.eval('simAct') === null); const h = JSON.parse(w.localStorage.getItem(w.eval('kPlan()'))); t('simulacro guardado', Object.values(h).some(e => e.sims && e.sims.length === 1)); }
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
