const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const ms = { status: 'ok', msg: 'ok', lastCheck: new Date().toISOString(), sinLeer: 0, cursos: [{ courseId: 'c1', sigla: 'BRS', nombre: 'Bastionado de redes', habilitado: true, conversaciones: [] }] };
  const { w, errores } = await arranca({ brain: { mensajesState: async () => ms, mensajesCheck: async () => ms, mensajesDestinatarios: async () => ({ ok: true, resultados: [] }), mensajesCerrarRedaccion: async () => {} } });
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
  w.eval('showMensajes()'); await sleep(400); w.eval("abrirNuevo('c1')"); await sleep(100);
  const ta = () => w.document.querySelector('.msg-ta'), q = () => w.document.querySelector('.msg-new input[type=text], .msg-new input:not([type=checkbox])');
  t('formulario abierto', !!ta());
  ta().focus(); ta().value = 'Hola profe, quería preguntar'; ta().dispatchEvent(new w.Event('input', { bubbles: true }));
  const a = ta(); const sq = [...w.document.querySelectorAll('.msg-new input')].find(i => /Buscar por nombre/.test(i.placeholder)); sq.value = 'garc'; sq.dispatchEvent(new w.Event('input', { bubbles: true })); ta().focus();
  // refresco periódico de fondo (cada 30 min la app revisa los mensajes y avisa)
  await w.__cb.onMensajesChanged(); await sleep(300); w.eval("refrescaMsgs()"); await sleep(300);
  t('mismo formulario (no redibujado) con el foco en el texto', ta() === a && w.document.activeElement === a && a.value === 'Hola profe, quería preguntar');
  const sq2 = [...w.document.querySelectorAll('.msg-new input')].find(i => /Buscar por nombre/.test(i.placeholder)); t('búsqueda de destinatario conservada', sq2.value === 'garc');
  // volver a editar desde la confirmación conserva todo
  w.eval("msgNuevo.dest = [{ id: 'u1', nombre: 'Ana García' }]; msgNuevo.fase = 'confirmar'; drawMensajes()"); await sleep(100); t('confirmar muestra el texto', /Hola profe/.test(w.document.querySelector('#doc').textContent));
  [...w.document.querySelectorAll('.msg-new button')].find(b => /Volver a editar/.test(b.textContent)).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await sleep(100);
  const sq3 = [...w.document.querySelectorAll('.msg-new input')].find(i => /Buscar por nombre/.test(i.placeholder)); t('volver a editar: texto y búsqueda', w.document.querySelector('.msg-ta').value === 'Hola profe, quería preguntar' && sq3.value === 'garc');
  // salir a otra pantalla y volver a Mensajes (o pulsar la notificación) no descarta el borrador
  w.eval("msgNuevo.fase = 'editar'; drawMensajes()"); await sleep(50); w.eval('showNotas()'); await sleep(300); w.eval('showMensajes()'); await sleep(300);
  t('borrador conservado al volver a Mensajes', !!w.document.querySelector('.msg-ta') && w.document.querySelector('.msg-ta').value === 'Hola profe, quería preguntar'); await w.__cb.onMensajes(); await sleep(200);
  t('y al pulsar la notificación', w.document.querySelector('.msg-ta') && w.document.querySelector('.msg-ta').value === 'Hola profe, quería preguntar');
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
