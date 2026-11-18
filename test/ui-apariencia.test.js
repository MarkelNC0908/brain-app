const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const sets = []; let tema = 'auto';
  const { w, errores } = await arranca({ brain: { ajustesGet: async () => ({ ok: true, avisoNotas: true, atajoRapido: false, tema }), ajustesSet: async (p) => { sets.push(p); if (p.tema) tema = p.tema; return { ok: true }; } } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  w.eval('showAjustes()'); await sleep(500); t('sección apariencia', /Tamaño de letra/.test(tx('#aj-apar')) && /Tema/.test(tx('#aj-apar')) && /español/.test(tx('#aj-apar')));
  const [sz, th] = w.document.querySelectorAll('#aj-apar select'); t('opciones', sz.options.length === 4 && th.options.length === 3 && sz.value === '1' && th.value === 'auto');
  sz.value = '1.15'; sz.dispatchEvent(new w.Event('change')); t('aplica el zoom y lo recuerda', w.document.documentElement.style.zoom === '1.15' && w.localStorage.getItem('brain-zoom') === '1.15');
  sz.value = '1'; sz.dispatchEvent(new w.Event('change')); t('normal quita el zoom', w.document.documentElement.style.zoom === '');
  th.value = 'oscuro'; th.dispatchEvent(new w.Event('change')); t('el tema se guarda en el proceso principal', sets.length === 1 && sets[0].tema === 'oscuro');
  w.localStorage.setItem('brain-zoom', '1.3'); w.eval('aplicaZoom()'); t('zoom guardado se aplica al abrir', w.document.documentElement.style.zoom === '1.3');
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
