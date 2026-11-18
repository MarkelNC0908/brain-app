const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const ms = { status: 'ok', msg: 'ok', lastCheck: new Date().toISOString(), sinLeer: 0, cursos: [{ courseId: 'c9', sigla: 'HE', nombre: 'Hacking ético', habilitado: true, conversaciones: [] }] };
  const { w, errores, notes, llamadas } = await arranca({ brain: { mensajesState: async () => ms, mensajesCheck: async () => ms } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  const n = notes.find(x => /^02-Asignaturas\/he\//.test(x.path) && x.body.length > 300); w.eval(`show(${JSON.stringify(n.path)})`); await sleep(300);
  const bd = [...w.document.querySelectorAll('#ap-acc button')].find(b => /Anotar duda/.test(b.textContent)); t('botón anotar duda (sin IA también)', !!bd); click(bd);
  const inp = w.document.querySelector('.duda-f input'); inp.value = '¿Qué diferencia hay entre XSS reflejado y almacenado?'; click(w.document.querySelector('.duda-f button')); await sleep(50);
  t('duda guardada', /1 pendientes/.test(tx('#ap-acc')) && w.eval('leeDudas().length') === 1 && w.eval('leeDudas()[0].sigla') === 'he');
  w.eval('showDudas()'); await sleep(300); t('pantalla dudas', /XSS reflejado/.test(tx('#doc')) && /HACKING|HE/i.test(tx('#doc')));
  const btn = (re) => [...w.document.querySelectorAll('.duda-a button')].find(b => re.test(b.textContent)); t('acciones', !!btn(/Buscar/) && !!btn(/IA/) && !!btn(/Al profesor/) && !!btn(/Resuelta/));
  click(btn(/Al profesor/)); await sleep(300); t('abre mensaje al profe con la idea', !!w.document.querySelector('.msg-ta') && w.eval('msgNuevo.idea') === '¿Qué diferencia hay entre XSS reflejado y almacenado?' && w.eval('msgNuevo.courseId') === 'c9');
  w.eval('showDudas()'); await sleep(200); click(btn(/Buscar/)); await sleep(200); t('buscar lleva a Preguntar con la duda', w.document.querySelector('#rs-q').value.includes('XSS reflejado') && /Lo que dicen|Respuesta directa|No está/.test(tx('#rs-out')));
  w.eval('showDudas()'); await sleep(200); click(btn(/Resuelta/)); await sleep(50); t('resuelta desaparece', /No quedan dudas/.test(tx('#doc')) && w.eval('dudasPendientes()') === 0);
  w.eval('home()'); await sleep(200); w.eval("anotaDuda('otra', null)"); w.eval('home()'); await sleep(200); t('Hoy toca avisa de dudas', /1 duda sin resolver/.test(tx('#hoy')));
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
