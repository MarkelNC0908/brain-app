const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain)'); process.exit(0); }
const { arranca, sleep } = require('./harness.js');
(async () => {
  const { w, errores, notes } = await arranca(); let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); }; const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })), tx = (s) => (w.document.querySelector(s) || { textContent: '' }).textContent;
  let vistos = 0; w.HTMLElement.prototype.scrollIntoView = function () { vistos++; };
  // un apunte con apartados y una frase conocida
  let n = null, cab = '', frase = ''; for (const x of notes) { if (x.externo) continue; const m = x.body.match(/^##\s+(.+)\n+([^\n#][^\n]{30,})/m); if (m) { n = x; cab = m[1].replace(/[*`]/g, '').trim(); frase = m[2].replace(/\[\[|\]\]|\*\*|`|\[(verificado|supuesto|pendiente)\]/g, '').trim().slice(0, 40); break; } }
  t('hay un apunte de prueba', !!n); if (!n) process.exit(0);
  w.eval(`go(${JSON.stringify(n.path)}, ${JSON.stringify({ cab, frase })})`); await sleep(100);
  t('resalta el apartado', [...w.document.querySelectorAll('#doc h1,#doc h2,#doc h3,#doc h4')].some(h => h.classList.contains('flash') && h.textContent.replace(/[*`]/g, '').includes(cab.slice(0, 15))) && vistos >= 1);
  console.log('FRASE:', JSON.stringify(frase), '→ marcada:', JSON.stringify(tx('mark.flash-m').slice(0, 60)));
  t('resalta la frase exacta', !!w.document.querySelector('mark.flash-m') && frase.replace(/^[-*\s]+/, '').toLowerCase().startsWith(tx('mark.flash-m').toLowerCase().slice(0, 15)));
  // con tildes y mayúsculas distintas
  const r = w.eval("(function(){ show(" + JSON.stringify(n.path) + "); return resaltaDestino({ frase: " + JSON.stringify(frase.toUpperCase()) + " }); })()"); t('ignora mayúsculas y tildes', r === true && !!w.document.querySelector('mark.flash-m'));
  t('destino que no existe no rompe', w.eval("show(" + JSON.stringify(n.path) + "); resaltaDestino({ cab: 'apartado inexistente zzz', frase: 'frase que no sale en ningun sitio' })") === false);
  // desde Preguntar: el enlace de un fragmento lleva al apartado
  w.eval("preguntaRapida(" + JSON.stringify(frase.split(' ').slice(0, 4).join(' ')) + ")"); await sleep(300); const enl = w.document.querySelector('#rs-out .rs-card .ia-s'); t('enlaces de Preguntar con destino', !!enl && /›|·/.test(enl.textContent)); if (enl) { click(enl); await sleep(150); t('al pulsarlo abre el apunte con resaltado', !!w.document.querySelector('#doc mark.flash-m, #doc .flash')); }
  console.log('errores', errores.length, errores.slice(0, 2), 'ok', ok, 'ko', ko); process.exit(0);
})();
