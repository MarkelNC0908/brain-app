const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
// Registro en Ajustes: lista, filtros, copiar y vaciar; y el botón «Iniciar sesión» dice por qué no se abre la ventana
const { arranca, sleep } = require('./harness.js');
(async () => {
  const copiado = [], eventos = []; let borrado = 0, loginRes = { ok: false, msg: 'Falta la URL del campus en tu perfil (✎ Editar perfil)' };
  let lineas = [
    { fecha: '2026-11-18T11:00:00.000Z', nivel: 'info', tag: 'app', msg: 'arranca Brain 1.0.17 · win32 x64' },
    { fecha: '2026-11-18T11:01:00.000Z', nivel: 'info', tag: 'sesion', msg: 'pulsado Iniciar sesión · campus blackboard campus.ejemplo.edu' },
    { fecha: '2026-11-18T11:01:01.000Z', nivel: 'aviso', tag: 'sesion', msg: 'ventana emergente bloqueada (no es https): http://x' },
    { fecha: '2026-11-18T11:01:02.000Z', nivel: 'error', tag: 'sesion', msg: 'no carga https://campus.ejemplo.edu/ultra/stream: ERR_NAME_NOT_RESOLVED (-105)' },
  ];
  const { w, errores } = await arranca({ brain: {
    logLeer: async () => ({ ok: true, lineas, ruta: '~/AppData/Roaming/Brain/brain.log' }), logBorrar: async () => { borrado++; lineas = []; return { ok: true }; },
    logEvento: (...a) => eventos.push(a), diagCarpeta: async () => {}, bbState: async () => ({ status: 'login', msg: 'Inicia sesión', lastCheck: null, novedades: [], sinVer: 0 }), bbLogin: async () => loginRes,
  } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent, boton = (s, re) => [...w.document.querySelectorAll(s + ' button')].find(b => re.test(b.textContent));
  Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async (x) => { copiado.push(x); } }, configurable: true });
  w.eval('showAjustes()'); await sleep(400);
  t('sección Registro en Ajustes', /Registro/.test(tx('#aj-log')) && /sin contraseñas, tokens/.test(tx('#aj-log')));
  const filas = () => [...w.document.querySelectorAll('#aj-log .log-l')];
  t('muestra todas las líneas, lo más reciente arriba', filas().length === 4 && /ERR_NAME_NOT_RESOLVED/.test(filas()[0].textContent) && /arranca Brain/.test(filas()[3].textContent));
  t('resumen con líneas, errores y ruta', /4 línea\(s\) · 1 error\(es\) · ~\/AppData/.test(tx('#aj-log')));
  t('niveles con su clase', filas()[0].classList.contains('error') && filas()[1].classList.contains('aviso'));
  const sel = w.document.querySelector('#aj-log select'); sel.value = 'error'; sel.dispatchEvent(new w.Event('change')); t('filtro solo errores', filas().length === 1);
  sel.value = 'aviso'; sel.dispatchEvent(new w.Event('change')); t('filtro avisos y errores', filas().length === 2);
  click(boton('#aj-log', /^Copiar$/)); await sleep(50); t('copia lo filtrado en texto plano', copiado.length === 1 && copiado[0].split('\n').length === 2 && /\[error\] sesion: no carga/.test(copiado[0]) && /Copiadas 2/.test(tx('#aj-log')));
  // botón «Iniciar sesión»: si no se abre, se ve el motivo
  click(boton('#aj-ses', /^Iniciar sesión$/)); await sleep(50); t('Iniciar sesión dice por qué no se abre', /Falta la URL del campus/.test(tx('#aj-ses')) && /Registro/.test(tx('#aj-ses')));
  loginRes = { ok: true }; click(boton('#aj-ses', /^Iniciar sesión$/)); await sleep(50); t('Iniciar sesión correcto lo indica', /Inicia sesión en la ventana nueva/.test(tx('#aj-ses')));
  w.brain.bbLogin = async () => { throw new Error('IPC roto'); };
  click(boton('#aj-ses', /^Iniciar sesión$/)); await sleep(50); t('si la llamada falla se ve y se apunta', /IPC roto/.test(tx('#aj-ses')) && eventos.some(e => e[0] === 'error' && /IPC roto/.test(e[2])));
  // vaciar con confirmación
  const bv = boton('#aj-log', /^Vaciar$/); click(bv); await sleep(20); t('vaciar pide confirmación', borrado === 0 && /Seguro/.test(bv.textContent));
  click(bv); await sleep(80); t('vaciar borra y lo indica', borrado === 1 && /El registro está vacío/.test(tx('#aj-log')));
  // ventana desde la pantalla de perfiles
  lineas = [{ fecha: '2026-11-18T11:00:00.000Z', nivel: 'error', tag: 'perfil', msg: 'No se pudo abrir el perfil' }];
  w.eval('abreRegistro()'); await sleep(80); t('abreRegistro abre el registro encima', /No se pudo abrir el perfil/.test(tx('.log-box')));
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' })); t('Escape la cierra', !w.document.querySelector('.log-box'));
  console.log('errores', errores.length, 'ok', ok, 'ko', ko); process.exit(errores.length ? 1 : 0);
})();
