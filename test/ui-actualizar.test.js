const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  let configurado = false; const guardado = [], desc = [], inst = [], alcerrar = []; const estado = { ok: true, repo: 'usuario/repo', token: false, propio: false, version: '1.0.13', plataforma: 'darwin', empaquetada: true, puedeInstalar: true }; let respInst = { ok: true };
  const rel = { ok: true, tag: 'v1.0.15', titulo: 'Brain 1.0.15', notas: 'Novedades de prueba', nueva: true, actual: '1.0.13', asset: { id: 7, name: 'Brain-macos-arm64.zip', size: 140 * 1048576, digest: 'sha256:abc' } };
  const { w, errores } = await arranca({ brain: {
    actEstado: async () => ({ ...estado }), actInstalar: async (r, v) => { inst.push([r, v]); return respInst; }, actInstalarAlCerrar: async (on, r, v) => { alcerrar.push([on, r, v]); return { ok: true, on }; },
    actGuardar: async (d) => { guardado.push(d); if (!/^[\w.-]+\/[\w.-]+$/.test(d.repo)) return { ok: false, msg: 'Escribe el repositorio como usuario/repositorio.' }; return { ok: true, persistente: true, ...rel }; },
    actBuscar: async () => rel, actDescargar: async (a) => { desc.push(a); return { ok: true, ruta: '/Users/x/Downloads/Brain-macos-arm64.zip', sha256: 'ab'.repeat(32), verificado: true }; }, actQuitar: async () => { configurado = false; return { ok: true }; }, actMostrar: async () => {} } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  w.eval('showAjustes()'); await sleep(500);
  t('repositorio público: sin pedir token', /Versión instalada: 1\.0\.13/.test(tx('#aj-act')) && /no hace falta ninguna cuenta ni token/.test(tx('#aj-act')) && w.document.querySelectorAll('#aj-act input[type=password]').length === 0 && /usuario\/repo/.test(tx('#aj-act')));
  click([...w.document.querySelectorAll('#aj-act button')].find(b => /Buscar actualización/.test(b.textContent))); await sleep(200);
  t('muestra la versión nueva', /Hay una versión nueva: v1\.0\.15/.test(tx('#aj-act')) && /Descargar Brain-macos-arm64\.zip \(140 MB\)/.test(tx('#aj-act')));
  click([...w.document.querySelectorAll('#aj-act button')].find(b => /Descargar/.test(b.textContent))); await sleep(200);
  t('descarga y muestra ruta y hash', desc.length === 1 && desc[0].id === 7 && /Descargado en \/Users\/x\/Downloads/.test(tx('#aj-act')) && /coincide con el de GitHub/.test(tx('#aj-act')) && /no están firmadas/.test(tx('#aj-act')));
  // opciones: repositorio y token opcional
  click([...w.document.querySelectorAll('#aj-act button')].find(b => /Repositorio y token/.test(b.textContent))); await sleep(100); const [repo, tok] = w.document.querySelectorAll('#aj-act .rs-g input');
  t('opciones con token opcional', !!repo && !!tok && repo.value === 'usuario/repo' && /opcional/.test(tok.placeholder) && /solo hace falta si ese repositorio es privado/.test(tx('#aj-act'))); repo.value = 'mal formato'; tok.value = 'github_pat_FAKE000000000000000000000000'; click([...w.document.querySelectorAll('#aj-act button')].find(b => /Guardar y comprobar/.test(b.textContent))); await sleep(150);
  t('error de formato visible y el token no queda en pantalla', /usuario\/repositorio/.test(tx('#aj-act')) && !/github_pat_FAKE/.test(tx('#doc')) && guardado.length === 1 && guardado[0].repo === 'mal formato');
  // comprobación diaria: solo si se activa la casilla
  w.localStorage.removeItem('brain-act-desc-tag'); w.localStorage.removeItem('brain-act-desc-ruta');   // la descarga manual de antes ya dejó guardada la versión: se olvida para probar el aviso
  w.localStorage.removeItem('brain-act-ultima'); w.eval('actNueva = null'); await w.eval('actComprobacionDiaria()'); await sleep(100); w.eval('home()'); await sleep(200); t('sin la casilla no consulta solo', !/Hay una versión nueva de Brain/.test(tx('#hoy')));
  w.localStorage.setItem('brain-act-auto', '1'); w.localStorage.removeItem('brain-act-ultima'); await w.eval('actComprobacionDiaria()'); await sleep(100); w.eval('home()'); await sleep(200); t('con la casilla avisa en Hoy toca', /Hay una versión nueva de Brain \(v1\.0\.15\)/.test(tx('#hoy')));
  // descarga automática: opcional, una vez por versión
  w.localStorage.setItem('brain-act-desc', '1'); w.localStorage.removeItem('brain-act-ultima'); w.localStorage.removeItem('brain-act-desc-tag'); desc.length = 0; w.eval('actNueva = null; actDescarga = null'); await w.eval('actComprobacionDiaria()'); await sleep(150); w.eval('home()'); await sleep(200);
  t('descarga sola el fichero de este sistema', desc.length === 1 && desc[0].name === 'Brain-macos-arm64.zip' && w.localStorage.getItem('brain-act-desc-tag') === 'v1.0.15' && /ya está descargada: ⚙ Ajustes/.test(tx('#hoy')));
  w.localStorage.removeItem('brain-act-ultima'); await w.eval('actComprobacionDiaria()'); await sleep(150); t('no repite la descarga de la misma versión', desc.length === 1);
  w.localStorage.setItem('brain-act-desc', '0'); w.localStorage.removeItem('brain-act-desc-tag'); w.localStorage.removeItem('brain-act-ultima'); await w.eval('actComprobacionDiaria()'); await sleep(150); t('con la casilla apagada no descarga', desc.length === 1);
  w.eval('showAjustes()'); await sleep(400); t('casilla de descarga automática en Ajustes', /descargar sola la versión nueva para este sistema/.test(tx('#aj-act')));
  // instalar sola (macOS: probado; otros sistemas: experimental)
  w.eval('actEst = null'); w.localStorage.setItem('brain-act-desc-tag', 'v1.0.15'); w.localStorage.setItem('brain-act-desc-ruta', '/Users/x/Downloads/Brain-macos-arm64.zip'); w.eval('showAjustes()'); await sleep(500);
  const bi = () => [...w.document.querySelectorAll('#aj-act button')].find(b => /Instalar y reiniciar/.test(b.textContent));
  t('bloque de versión descargada con instalar', /v1\.0\.15 descargada/.test(tx('#aj-act')) && !!bi() && /Instalarla sola la próxima vez que cierre/.test(tx('#aj-act')) && !/experimental/.test(tx('#aj-act')));
  click(bi()); await sleep(50); t('pide confirmación explicando la copia de seguridad', /se cerrará, se sustituirá por la v1\.0\.15/.test(tx('#aj-act')) && /se restaura sola/.test(tx('#aj-act')));
  respInst = { ok: false, msg: 'No tengo permiso para escribir en /Applications.' }; click([...w.document.querySelectorAll('#aj-act button')].find(b => /Instalar ahora/.test(b.textContent))); await sleep(100);
  t('muestra el error y no se cierra', inst.length === 1 && inst[0][0] === '/Users/x/Downloads/Brain-macos-arm64.zip' && inst[0][1] === 'v1.0.15' && /No tengo permiso/.test(tx('#aj-act')));
  respInst = { ok: true }; click([...w.document.querySelectorAll('#aj-act button')].find(b => /Instalar ahora/.test(b.textContent))); await sleep(100); t('instala', inst.length === 2 && /Instalando… la app se cerrará/.test(tx('#aj-act')));
  const cbx = [...w.document.querySelectorAll('#aj-act label')].find(l => /Instalarla sola/.test(l.textContent)).querySelector('input'); cbx.checked = true; cbx.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(50);
  t('instalar al cerrar', alcerrar.length === 1 && alcerrar[0][0] === true && alcerrar[0][2] === 'v1.0.15' && w.localStorage.getItem('brain-act-alcerrar') === 'v1.0.15');
  // se vuelve a preparar al abrir la app
  alcerrar.length = 0; await w.eval('rearmaInstalacion()'); t('rearma al abrir', alcerrar.length === 1 && alcerrar[0][0] === true);
  estado.empaquetada = false; w.eval('actEst = null'); w.eval('showAjustes()'); await sleep(500); t('en desarrollo no ofrece instalar', !bi() && /aplicación instalada/.test(tx('#aj-act')));
  estado.empaquetada = true; estado.plataforma = 'win32'; w.eval('actEst = null'); w.eval('showAjustes()'); await sleep(500); t('Windows: aviso de experimental', /experimental/.test(tx('#aj-act')) && !!bi());
  estado.puedeInstalar = false; w.eval('actEst = null'); w.eval('showAjustes()'); await sleep(500); t('sin instalación automática: descarga manual', !bi() && /solo hay descarga manual/.test(tx('#aj-act')));
  estado.puedeInstalar = true; estado.plataforma = 'darwin'; estado.version = '1.0.15'; w.eval('actEst = null'); w.eval('showAjustes()'); await sleep(500); t('si ya está instalada, se olvida', !/descargada/.test(tx('#aj-act').replace(/Hay una versión nueva/g, '')) || w.localStorage.getItem('brain-act-desc-tag') === '');
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
