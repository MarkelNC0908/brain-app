const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
// Ajustes › Apariencia (1.0.19): temas, fondo con imágenes propias, cristal, letra, acento, animaciones, exportar/importar
const { arranca, sleep } = require('./harness.js');
(async () => {
  const sets = [], guardados = []; let fondos = [{ id: '0123456789abcdef.jpg', nombre: 'playa.jpg', mini: 'data:image/png;base64,AAAA' }];
  const brain = {
    ajustesGet: async () => ({ ok: true, avisoNotas: true, atajoRapido: false, tema: 'auto' }), ajustesSet: async (p) => { sets.push(p); return { ok: true }; },
    fondosLista: async () => fondos.slice(),
    fondosAnadir: async () => { fondos.push({ id: 'fedcba9876543210.png', nombre: 'nueva.png', mini: '' }); return { ok: true, anadidas: ['fedcba9876543210.png'], errores: [{ nombre: 'mal.txt', msg: 'Formato no admitido (solo JPG, PNG, WebP o GIF).' }] }; },
    fondosQuitar: async (id) => { fondos = fondos.filter(f => f.id !== id); return { ok: true }; },
    fondoDatos: async (id) => ({ ok: true, url: 'data:image/jpeg;base64,' + id.slice(0, 4) }),
    textoGuardar: async (d) => { guardados.push(d); return { ok: true }; }
  };
  const { w, errores } = await arranca({ brain });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
  const $ = (s) => w.document.querySelector(s), $$ = (s) => [...w.document.querySelectorAll(s)], body = w.document.body, root = w.document.documentElement;
  const clic = async (b) => { b.click(); await sleep(250); };
  t('sin tema guardado no cambia nada', ![...body.classList].some(c => c.startsWith('ap-')) && $('#fondo') && root.style.getPropertyValue('--font') === '');
  w.eval('showAjustes()'); await sleep(600);
  const sec = $('#aj-apar'), tx = () => sec.textContent;
  t('secciones nuevas', /Temas/.test(tx()) && /Fondo de pantalla/.test(tx()) && /Añadir imágenes/.test(tx()) && /Recuadros/.test(tx()) && /Animaciones/.test(tx()) && /español/.test(tx()));
  const [sz, th] = $$('#aj-apar select'); t('el tamaño de letra y el modo siguen primero', sz.options.length === 4 && th.options.length === 3);
  t('galería con la imagen guardada', $$('#aj-apar .ap-img').length === 1 && /data:image\/png/.test($('#aj-apar .ap-img').style.backgroundImage));
  t('sin controles duplicados', $$('#aj-apar .ap-preset').length === 4 && $$('#aj-apar .ap-inc').length === 7);

  await clic($$('#aj-apar .ap-preset')[1]); await sleep(300);   // Cristal aurora
  t('preset: clases', body.classList.contains('ap-fondo') && body.classList.contains('ap-cristal') && body.classList.contains('ap-radio') && body.classList.contains('ap-anim-suave'));
  t('preset: variables y fondo incluido', root.style.getPropertyValue('--acc') === '#5e5ce6' && root.style.getPropertyValue('--rc') === '16px' && /radial-gradient/.test($('#fondo i').style.backgroundImage));
  t('preset: pide el modo oscuro', sets.some(s => s.tema === 'oscuro'));
  t('preset: se guarda', JSON.parse(w.localStorage.getItem('brain-apariencia')).fondo === 'aurora');
  t('sin duplicados tras repintar', $$('#aj-apar .ap-preset').length === 4 && $$('#aj-apar h2').length === 1);

  await clic($('#aj-apar .ap-img')); await sleep(300);
  t('imagen propia de fondo, llenando la ventana', /data:image\/jpeg;base64,0123/.test($('#fondo i').style.backgroundImage) && body.classList.contains('ap-fondo'));
  t('miniatura marcada', $('#aj-apar .ap-img').classList.contains('on'));

  const add = $$('#aj-apar button').find(b => /Añadir imágenes/.test(b.textContent)); await clic(add); await sleep(400);
  t('añadir: usa la última imagen', JSON.parse(w.localStorage.getItem('brain-apariencia')).fondo === 'img:fedcba9876543210.png' && /fedc/.test($('#fondo i').style.backgroundImage));
  t('añadir: galería con dos', $$('#aj-apar .ap-img').length === 2);

  await clic($$('#aj-apar .ap-x')[1]); await sleep(400);
  t('quitar la imagen en uso vuelve a liso', JSON.parse(w.localStorage.getItem('brain-apariencia')).fondo === 'ninguno' && !body.classList.contains('ap-fondo') && $$('#aj-apar .ap-img').length === 1);

  const rg = $$('#aj-apar .ap-rango input'), velo = rg[1]; velo.value = '40'; velo.dispatchEvent(new w.Event('input')); await sleep(100);
  t('deslizador al momento', root.style.getPropertyValue('--velo') === '0.4' && /40 %/.test(velo.closest('label').textContent));
  const fsel = $$('#aj-apar select').find(s => s.getAttribute('aria-label') === 'Tipo de letra'); fsel.value = 'mono'; fsel.dispatchEvent(new w.Event('change')); await sleep(100);
  t('tipo de letra', /monospace/.test(root.style.getPropertyValue('--font')));
  await clic($$('#aj-apar .ap-color')[5]); t('acento', root.style.getPropertyValue('--acc') === '#1f8a4c');
  const an = $$('#aj-apar select').find(s => s.getAttribute('aria-label') === 'Animaciones'); an.value = 'viva'; an.dispatchEvent(new w.Event('change')); await sleep(100);
  t('animaciones', body.classList.contains('ap-anim-viva') && !body.classList.contains('ap-anim-suave'));

  await clic($$('#aj-apar button').find(b => b.textContent === 'Exportar tema'));
  const exp = guardados[0] && JSON.parse(guardados[0].texto);
  t('exportar', exp && exp.brainTema === 1 && exp.acento === '#1f8a4c' && guardados[0].extension === 'json');

  w.localStorage.setItem('brain-apariencia', JSON.stringify({ fondo: 'img:0123456789abcdef.jpg', cristal: true, acento: '#e5246b' }));
  w.eval('apTema = apNormaliza(apLee()); apAplica()'); await sleep(200);
  t('al abrir aplica el tema guardado', /0123/.test($('#fondo i').style.backgroundImage) && body.classList.contains('ap-cristal') && root.style.getPropertyValue('--acc') === '#e5246b');

  await clic($$('#aj-apar button').find(b => b.textContent === 'Restablecer')); await sleep(200);
  t('restablecer vuelve a clásico', ![...body.classList].some(c => c.startsWith('ap-')) && root.style.getPropertyValue('--rc') === '' && JSON.parse(w.localStorage.getItem('brain-apariencia')).fondo === 'ninguno');

  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(errores.length ? 1 : 0);
})();
