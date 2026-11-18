const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain en ' + __V + ')'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const iaEst = { ok: false, ollama: { ok: false, modelos: [], defecto: 'qwen2.5:7b' }, gemini: { clave: true, cifrada: true, modelos: ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite'], defecto: 'gemini-flash-lite-latest' } };
  const tareas = [];
  const { w, errores, llamadas, notes } = await arranca({ iaEst, brain: { iaTarea: async (d) => { tareas.push(d); if (d.tipo === 'test') return { ok: true, tipo: 'test', preguntas: [{ pregunta: '¿Qué es X?', opciones: ['a', 'b', 'c', 'd'], correcta: 1, explicacion: 'porque sí' }, { pregunta: 'Segunda', opciones: ['a', 'b', 'c'], correcta: 0, explicacion: '' }] }; if (d.tipo === 'resumen') return { ok: true, tipo: 'resumen', texto: '- Punto uno\n- Punto dos' }; return { ok: true, tipo: 'mensaje', texto: 'Hola profe, ¿puedo entregar un día tarde? Gracias.' }; }, icsExportar: async () => ({ ok: true, ruta: '/tmp/x.ics', n: 5 }) } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const tx = (sel) => (w.document.querySelector(sel) || { textContent: '' }).textContent;
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  t('carga sin errores', errores.length === 0); if (errores.length) console.log(errores.slice(0, 4));
  // 1 Hoy toca
  t('hoy toca', /Hoy toca/.test(tx('#hoy'))); console.log('HOY:', tx('#hoy').slice(0, 160));
  // 2 acciones en apunte
  const n = notes.find(x => /he\//.test(x.path)) || notes[0]; w.eval(`show(${JSON.stringify(n.path)})`); await sleep(300);
  const bs = [...w.document.querySelectorAll('#ap-acc button')], bR = bs.find(b => /Resumir/.test(b.textContent)), bT = bs.find(b => /Test con IA/.test(b.textContent)); t('botones IA y duda en apunte', bs.length === 3 && !!bR && !!bT && bs.some(b => /Anotar duda/.test(b.textContent)));
  click(bR); await sleep(200); t('resumen mostrado', /Punto uno/.test(tx('#ap-out')) && /Resumen generado por Gemini/.test(tx('#ap-out')) && tareas[0].tipo === 'resumen' && tareas[0].proveedor === 'gemini' && /Hola|\w/.test(tareas[0].texto));
  click([...w.document.querySelectorAll('#ap-acc button')].find(b => /Test con IA/.test(b.textContent))); await sleep(200); t('test mostrado', /Pregunta 1\/2/.test(tx('#ap-out')) && /¿Qué es X\?/.test(tx('#ap-out')));
  click(w.document.querySelectorAll('#ap-out .opt')[1]); await sleep(50); t('feedback correcto', w.document.querySelectorAll('#ap-out .opt.good').length === 1 && /porque sí/.test(tx('#ap-out')));
  click([...w.document.querySelectorAll('#ap-out button.pri')].pop()); click(w.document.querySelectorAll('#ap-out .opt')[0]); click([...w.document.querySelectorAll('#ap-out button.pri')].pop()); await sleep(50); t('resultado test', /2\/2 correctas/.test(tx('#ap-out')));
  // 3 Notas: gráfico y nota necesaria
  w.eval('showNotas()'); await sleep(500); t('svg gráfico BRS', !!w.document.querySelector('.nt-svg polyline') && w.document.querySelectorAll('.nt-svg circle').length === 2);
  const bn = [...w.document.querySelectorAll('.nt-btn')]; t('botón nota necesaria', bn.length >= 1); click(bn[0]); await sleep(100); const calc = tx('.nt-calc'); console.log('CALC:', calc.slice(0, 260)); t('cálculo 1,75', /media de 1,75 en los 2 elementos pendientes/.test(calc) && /Nota actual.*8,25/.test(calc));
  // 4 Paleta
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); await sleep(100); t('paleta abre', !!w.document.querySelector('.pal'));
  const inp = w.document.querySelector('.pal input'); inp.value = 'hardening'; inp.dispatchEvent(new w.Event('input')); await sleep(100); const pal = tx('.pal-l'); console.log('PALETA:', pal.slice(0, 160)); t('paleta resultados', /Preguntar a mis apuntes/.test(pal) && /Apunte|Definición/.test(pal));
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(300); t('paleta enter → Preguntar', !w.document.querySelector('.pal') && /Respuesta directa|Lo que dicen/.test(tx('#rs-out')) && w.document.querySelector('#rs-q').value === 'hardening');
  // 5 Seguimiento con IA
  const redactar = [...w.document.querySelectorAll('#rs-ia button')].find(b => /Redactar/.test(b.textContent)); t('botón redactar', !!redactar); click(redactar); await sleep(300);
  t('respuesta IA', /Respuesta \[1\]/.test(tx('#rs-ia'))); const seg = w.document.querySelector('#ia-seg'); t('campo seguimiento', !!seg);
  seg.value = 'explícamelo más simple'; seg.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(300);
  const ult = llamadas.filter(l => l[0] === 'iaPreguntar').pop()[1]; t('seguimiento con historial', ult.pregunta === 'explícamelo más simple' && ult.historial.length === 2 && ult.proveedor === 'gemini'); t('pregunta previa visible', /Respuesta \[1\]/.test(tx('#rs-ia')) && /explícamelo/.test(tx('#rs-ia')));
  // 6 Ajustes: calendario
  w.eval('showAjustes()'); await sleep(400); t('ajustes calendario', /Exportar entregas y exámenes/.test(tx('#aj-cal')));
  click(w.document.querySelector('#aj-cal button')); await sleep(200); t('export ics ok', /5 eventos/.test(tx('#aj-cal')));
  // 7 Borrador de mensaje
  const ta = w.document.createElement('textarea'), N = { texto: '' }; let refr = 0; const cont = w.eval('borradorIA')(ta, N, () => refr++); w.document.body.append(cont); await sleep(200);
  const inp2 = cont.querySelector('input'), b2 = cont.querySelector('button'); t('borrador UI', !!inp2 && !!b2); inp2.value = 'pedir un día más para la práctica 2'; click(b2); await sleep(200);
  t('borrador rellena', /puedo entregar un día tarde/.test(ta.value) && N.texto === ta.value && refr === 1 && tareas.pop().tipo === 'mensaje');
  // 8 Repaso espaciado
  w.eval("(function(){ const c = buildCards().slice(0,6); c.forEach(x => { P.cards[x.id] = { b: 1, s: 1, next: Date.now() - 1000 }; }); })()"); t('pendientes', w.eval('repasoPendientes()') === 6);
  w.eval('showStudy()'); await sleep(200); t('botón repaso', /Repaso de hoy \(\d+\)/.test(tx('#doc')));
  w.eval('repasoHoy()'); await sleep(200); t('repaso arranca flashcards', /Tarjeta 1\/\d+/.test(tx('#doc')));
  w.eval("programa(P.cards[buildCards()[0].id] = { b: 2 })"); t('programa 3 días', Math.abs(w.eval('P.cards[buildCards()[0].id].next') - w.eval('Date.now()') - 3 * 864e5) < 5000);
  console.log('errores finales:', errores.length, errores.slice(0, 4)); console.log('ok', ok, 'ko', ko); process.exit(0);
})();
