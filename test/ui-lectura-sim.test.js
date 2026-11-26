const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
// 1.0.20: apuntes (chips, índice, código), visor de PDF por «diap. N», Inicio con tarjetas, simulacros, calendario y copia con fondos
const { arranca, sleep } = require('./harness.js');
(async () => {
  const pdfPedidos = [], guardados = [];
  const FICHAS = [
    { path: '02-Asignaturas/brs/recursos/ud8-pres.md', base: 'ud8-pres', title: 'BRS · Recurso · UD8', sigla: 'BRS', meta: { type: 'recurso', location: '02-Asignaturas/brs/_entrada/UD08 - Moviles.pdf (original; fuera de Git)' }, body: 'Apunte → [[08-moviles]]' },
    { path: '02-Asignaturas/brs/recursos/test-ud8.md', base: 'test-ud8', title: 'BRS · Test · UD8 Móviles', sigla: 'BRS', meta: { type: 'test', preguntas_por_intento: '2', minutos: '1' }, body: '## diap. 16 · ¿Quién hizo Pegasus?\n- [x] NSO Group\n- [ ] Cl0p\n> NSO.\n\n## diap. 7 · ¿Wifi falsa?\n- [x] Suplantación de red\n- [ ] Spyware\n\n## diap. 6 · Relaciona\n- A => 1\n- B => 2' }
  ];
  const { w, errores } = await arranca({ brain: {
    pdfRuta: async (rel) => { pdfPedidos.push(rel); return rel.endsWith('.pdf') ? { ok: true, url: 'file:///tmp/' + encodeURIComponent(rel.split('/').pop()) } : { ok: false }; },
    pdfTexto: async () => ({ ok: true, paginas: ['portada', 'texto de la página dos', 'Pegasus de NSO Group en la tres'] }),
    recursosLista: async () => FICHAS, icsAnadir: async () => ({ ok: true, n: 2 }), textoGuardar: async (d) => { guardados.push(d); return { ok: true, ruta: '/tmp/x.json' }; },
    fondosLista: async () => [{ id: '0123456789abcdef.png', nombre: 'f.png' }], fondoDatos: async () => ({ ok: true, url: 'data:image/png;base64,QUJD' }), enlacesLista: async () => ({ ok: true, lista: [] })
  } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
  const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)];
  // apunte y ficha de recurso de prueba
  const cuerpo = '# BRS · Tema 8 · Móviles\n\n## Uno\n- BRS, riesgo A (diap. 6) [verificado]\n- BRS, dato B [pendiente]\n- BRS, idea C [supuesto] y [TEST diap. 16]\n\n## Dos\nVer diap. 5, 7 y 13.\n\n```bash\nsudo ufw enable # activa\necho "hola" --force\n```\n\n## Tres\ntexto\n\n### Sub\nmás';
  w.eval(`(() => { const a = { path: '02-Asignaturas/brs/apuntes/08-moviles.md', base: '08-moviles', ext: 'md', title: 'BRS · Tema 8 · Móviles', sigla: 'BRS', type: 'tema', updated: '', meta: {}, body: ${JSON.stringify(cuerpo)}, externo: false, borrador: false, hay: 'moviles' };
    for (const n of [a]) { notes.push(n); byPath.set(n.path, n); byBase.set(n.base, n); } })()`);
  w.eval("go('02-Asignaturas/brs/apuntes/08-moviles.md')"); await sleep(500);
  t('chips de estado', $$('#doc .chip-ok').length === 1 && $$('#doc .chip-pe').length === 1 && $$('#doc .chip-su').length === 1 && $$('#doc .chip-test').length === 1);
  t('índice del apunte', $('#doc .toc') && $$('#doc .toc li').length === 4 && $('#doc h2').id.startsWith('h-'));
  t('código coloreado y sin HTML del apunte', $$('#doc pre .hl-k').some(s => s.textContent === 'sudo') && $$('#doc pre .hl-c').length >= 1 && $$('#doc pre .hl-s').length >= 1 && $('#doc pre code').textContent.includes('echo "hola" --force'));
  t('botón copiar', !!$('#doc pre .pre-copia'));
  t('diap. N son enlaces', $$('#doc .diap-a').map(a => a.textContent).join(',') === '6,16,5,7,13' && /diap\. 5, 7 y 13/.test($$('#doc p').map(p => p.textContent).join(' ')));
  t('botón del PDF del profesor', !!$('#doc .pdf-b'));
  $$('#doc .diap-a')[0].click(); await sleep(200);
  t('abre el visor en la página', pdfPedidos[0] === '02-Asignaturas/brs/_entrada/UD08 - Moviles.pdf' && $('#pdfp iframe') && /#page=6$/.test($('#pdfp iframe').src) && w.document.body.classList.contains('con-pdf'));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(50);
  t('Esc cierra el visor', !$('#pdfp') && !w.document.body.classList.contains('con-pdf'));
  t('recuerda el último apunte', JSON.parse(w.localStorage.getItem('brain-ultimo')).path === '02-Asignaturas/brs/apuntes/08-moviles.md');
  // Inicio
  w.eval('home()'); await sleep(400);
  const tj = $$('#ini-t .ini-c').map(c => c.textContent);
  t('tarjeta de seguir leyendo', tj.some(x => /Sigue donde lo dejaste/.test(x) && /Móviles/.test(x)));
  t('tarjeta de racha', tj.some(x => /Racha de estudio/.test(x) && /1 día/.test(x)));
  t('tarjeta de próxima entrega', tj.some(x => /Próxima (entrega|examen)/.test(x)));
  // simulacros
  w.eval('showSimulacros()'); await sleep(400);
  t('el banco no entra en los apuntes', !w.eval("byPath.has('02-Asignaturas/brs/recursos/test-ud8.md')"));
  t('lista de bancos', /Test · UD8|UD8 Móviles/.test($('#doc').textContent) && /3 preguntas · 2 por intento/.test($('#doc').textContent));
  $$('#doc .sim-b button').find(b => b.textContent === 'Todas').click(); await sleep(100);
  t('intento con todas', $$('#doc .sim-q').length === 3);
  const qs = $$('#doc .sim-q');
  for (const q of qs) { const r = [...q.querySelectorAll('.sim-op')].find(l => /NSO Group|Spyware/.test(l.textContent)); if (r) { r.querySelector('input').checked = true; r.querySelector('input').dispatchEvent(new w.Event('change')); } const s = q.querySelectorAll('select'); if (s.length) { s[0].value = '1'; s[0].dispatchEvent(new w.Event('change')); } }
  const ent = $$('#doc .sim-pie button').find(b => b.textContent === 'Entregar'); ent.click(); await sleep(50);
  t('nota tras entregar', /\/ 10/.test($('#doc .sim-res').textContent) && $$('#doc .sim-pt').length === 3);
  const st = JSON.parse(w.localStorage.getItem('brain-sim'));
  t('guarda el intento y los fallos', st.bancos['02-Asignaturas/brs/recursos/test-ud8.md'].intentos.length === 1 && Object.keys(st.fallos).length === 2);
  t('nota: 1 + 0 + 0,5 de 3', st.bancos['02-Asignaturas/brs/recursos/test-ud8.md'].intentos[0].nota === 5);
  t('repetir solo los fallos', !!$$('#doc .sim-pie button').find(b => /Repetir solo los fallos \(2\)/.test(b.textContent)));
  w.eval('showSimulacros()'); await sleep(100);
  $$('#doc .sim-b button').find(b => b.textContent === 'Modo examen').click(); await sleep(150);
  t('modo examen con reloj y 2 preguntas', $('#sim-reloj') && $$('#doc .sim-q').length === 2 && /Modo examen/.test($('#doc').textContent));
  // calendario y copia
  w.eval('showAjustes()'); await sleep(600);
  const cal = $$('#aj-cal button').find(b => /Añadir lo nuevo/.test(b.textContent)); cal.click(); await sleep(100);
  t('añadir al calendario', /2 evento/.test($('#aj-cal').textContent));
  w.localStorage.setItem('brain-copia-fondos', '1'); await w.eval('exportaCopia()');
  const copia = JSON.parse(guardados[0].texto); t('la copia lleva tema y fondos', copia.fondos && copia.fondos[0].id === '0123456789abcdef.png' && copia.fondos[0].b64 === 'QUJD' && 'brain-sim' in copia.datos);
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(errores.length ? 1 : 0);
})();
