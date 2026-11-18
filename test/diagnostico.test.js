const fs = require('fs'), os = require('os'), path = require('path'); const D = require('../src/diagnostico.js');
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
const home = os.homedir();
// claves FALSAS, solo con la forma de las de verdad
const s = D.limpiaSecretos(`clave AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE12 y AQ.FAKEFAKEFAKEFAKEFAKEFAKEFAKE12 ghp_FAKEFAKEFAKEFAKEFAKEFAKE1234 en ${home}/Desktop x-goog-api-key: FAKEKEY12345678 pin: 1234 password=secreto123`);
t('quita clave de Google', !/AIza|AQ\.FAKE/.test(s)); t('quita token de GitHub', !/ghp_/.test(s)); t('quita la ruta personal', !s.includes(home) && /~\/Desktop/.test(s)); t('quita cabeceras, pin y contraseñas', !/FAKEKEY12345678|secreto123|pin: 1234/.test(s));
const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'brain-diag-')), 'brain.log');
D.logLinea(f, 'error', 'main', 'Fallo con AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE12\ny salto de línea'); D.logLinea(f, 'error', 'ventana', 'otro');
const l = D.ultimasLineas(f, 5); t('registro con una línea por error y sin claves', l.length === 2 && !/AIza/.test(l[0]) && /⏎/.test(l[0]) && /\[error\] main:/.test(l[0]));
fs.writeFileSync(f, 'x'.repeat(310 * 1024)); D.logLinea(f, 'error', 'main', 'nuevo'); t('rota el registro al pasar de 300 KB', fs.existsSync(f + '.1') && fs.statSync(f).size < 1000);
const inf = D.construyeInforme({ version: '1.0.14', electron: '45', chrome: '1', node: '24', plataforma: 'darwin', arquitectura: 'arm64', so: '27', idioma: 'es', perfil: { tipo: 'blackboard', modo: 'Brain', campus: 'campus.ejemplo.edu', pin: false }, estados: { Avisos: 'ok' }, ia: { Ollama: 'no detectado' } }, ['2026-11-18 [error] main: algo']);
t('informe con versión, sistema, perfil y errores', /Versión: 1\.0\.14/.test(inf) && /darwin arm64/.test(inf) && /campus blackboard \(campus\.ejemplo\.edu\)/.test(inf) && /Avisos: ok/.test(inf) && /algo/.test(inf) && !/https?:\/\//.test(inf));
fs.rmSync(path.dirname(f), { recursive: true, force: true }); console.log('ok', ok, 'ko', ko);
