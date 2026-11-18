const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
// Ajustes → Conectar el móvil: el QR lleva solo repositorio y rama (nunca un token)
const { arranca, sleep } = require('./harness.js');
const E = require('../src/enlace.js');
(async () => {
  const copiado = []; let respuesta = { ok: true, repo: 'ana/Brain', branch: 'main', enlace: E.construyeEnlace({ repo: 'ana/Brain', branch: 'main' }) };
  const { w, errores } = await arranca({ brain: { movilEnlace: async () => respuesta } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  const boton = (re) => [...w.document.querySelectorAll('#aj-movil button')].find(b => re.test(b.textContent));
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (x) => { copiado.push(x); } }, configurable: true });
  w.eval('showAjustes()'); await sleep(300);
  t('sección en Ajustes, QR oculto al principio', /Conectar el móvil/.test(tx('#aj-movil')) && /no ningún token/.test(tx('#aj-movil')) && !w.document.querySelector('.qr-movil'));
  click(boton(/Mostrar el QR/)); await sleep(300);
  const img = w.document.querySelector('.qr-movil');
  t('muestra el QR como imagen', !!img && /^data:image\/gif;base64,/.test(img.src) && img.src.length > 500);
  t('muestra repositorio y rama', /Repositorio ana\/Brain · rama main/.test(tx('#aj-movil')) && /brain:\/\/conectar\?repo=ana%2FBrain&branch=main/.test(tx('#aj-movil')));
  click(boton(/Copiar enlace/)); await sleep(50);
  t('copia el enlace, sin token', copiado.length === 1 && copiado[0] === 'brain://conectar?repo=ana%2FBrain&branch=main' && !/token|ghp_|gho_/.test(copiado[0]));
  click(boton(/Ocultar el QR/)); await sleep(100); t('se puede ocultar', !w.document.querySelector('.qr-movil'));
  respuesta = { ok: false, msg: 'Esta carpeta no tiene un repositorio remoto (origin)' };
  click(boton(/Mostrar el QR/)); await sleep(300);
  t('error claro si el Brain no está en GitHub', /no tiene un repositorio remoto/.test(tx('#aj-movil')) && !w.document.querySelector('.qr-movil'));
  console.log('errores', errores.length, 'ok', ok, 'ko', ko); process.exit(0);
})();
