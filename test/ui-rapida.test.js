// Ventana de captura rápida (rapida.html + rapida-ui.js) en jsdom con un puente simulado
const { JSDOM } = require('jsdom'), fs = require('fs'), path = require('path');
const SRC = path.resolve(__dirname, '../src'), sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const guardados = []; let cerrada = 0, respuesta = { ok: true, ruta: '02-Asignaturas/pps/_entrada/captura.md' };
  const html = fs.readFileSync(path.join(SRC, 'rapida.html'), 'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace(/<link[^>]*>/, '').replace('<script src="rapida-ui.js"></script>', '<script>' + fs.readFileSync(path.join(SRC, 'rapida-ui.js'), 'utf8') + '</script>');
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(w) { w.rapida = { asignaturas: async () => [{ sigla: 'pps', nombre: 'PPS · Producción' }, { sigla: 'he', nombre: 'HE · Hacking' }], guardar: async (d) => { guardados.push(d); return respuesta; }, cerrar: () => { cerrada++; } }; } });
  const w = dom.window, d = w.document; await sleep(200); const q = (s) => d.querySelector(s), click = (e) => e.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  t('asignaturas cargadas', d.querySelectorAll('#s option').length === 3 && q('input[name=k]:checked').value === 'duda');
  click(q('#g')); t('vacío no guarda', guardados.length === 0 && /Escribe algo/.test(q('#m').textContent));
  q('#t').value = '¿Por qué CVSS 4.0 cambia la métrica?'; click(q('#g')); await sleep(50); t('duda sin asignatura', guardados.length === 1 && guardados[0].tipo === 'duda' && guardados[0].sigla === '' && /CVSS/.test(guardados[0].texto) && /Guardado/.test(q('#m').textContent));
  await sleep(700); t('se cierra tras guardar', cerrada === 1);
  q('#t').value = 'Anotación de clase'; d.querySelector('input[value=apunte]').checked = true; q('#g').disabled = false; click(q('#g')); await sleep(50); t('apunte rápido pide asignatura', guardados.length === 1 && /Elige una asignatura/.test(q('#m').textContent));
  q('#s').value = 'pps'; click(q('#g')); await sleep(50); t('apunte rápido con asignatura', guardados.length === 2 && guardados[1].tipo === 'apunte' && guardados[1].sigla === 'pps' && /_entrada/.test(q('#m').textContent));
  q('#t').value = 'x y z'; q('#g').disabled = false; respuesta = { ok: false, msg: 'No se pudo guardar: disco lleno' }; q('#t').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })); await sleep(50); t('Cmd+Intro guarda y muestra el error', guardados.length === 3 && /disco lleno/.test(q('#m').textContent) && !q('#g').disabled);
  const antes = cerrada; d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); t('Esc cierra', cerrada === antes + 1);
  console.log('ok', ok, 'ko', ko); process.exit(0);
})();
