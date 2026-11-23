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
// registro de la app: URL sin parámetros (los inicios de sesión SSO llevan tokens en ellos), lectura con niveles y vaciado
t('URL del registro sin parámetros ni fragmento', D.limpiaUrl('https://login.microsoftonline.com/abc/saml2?SAMLRequest=SECRETO#x') === 'https://login.microsoftonline.com/abc/saml2' && D.limpiaUrl('no es url') === '(URL no válida)');
t('limpiaSecretos quita los parámetros de cualquier URL', !/SECRETO|code=/.test(D.limpiaSecretos('fallo en https://campus.ejemplo.edu/cb?code=SECRETO&state=1 y más')) && /campus\.ejemplo\.edu\/cb\?…/.test(D.limpiaSecretos('fallo en https://campus.ejemplo.edu/cb?code=SECRETO')));
const g = path.join(path.dirname(f), 'app.log'); D.fijaRegistro(() => g);
D.info('sesion', 'pulsado Iniciar sesión'); D.aviso('sesion', 'Iniciar sesión pulsado sin URL del campus'); D.error('perfil', new Error('Boom'));
const r = D.leeRegistro(g); t('registro con info, aviso y error', r.length === 3 && r[0].nivel === 'info' && r[0].tag === 'sesion' && /pulsado/.test(r[0].msg) && r[1].nivel === 'aviso' && r[2].nivel === 'error' && /Boom/.test(r[2].msg));
t('el informe solo lleva los errores', D.ultimasLineas(g, 10).length === 1 && /Boom/.test(D.ultimasLineas(g, 10)[0]));
fs.writeFileSync(g + '.1', '2026-11-01T00:00:00.000Z [info] app: antiguo\n'); t('lee también el fichero rotado, primero lo antiguo', D.leeRegistro(g)[0].msg === 'antiguo' && D.leeRegistro(g).length === 4);
D.borraRegistro(g); t('vaciar borra el registro y el rotado', !fs.existsSync(g) && !fs.existsSync(g + '.1') && D.leeRegistro(g).length === 0);
// vigila una ventana de inicio de sesión simulada
const EE = require('events'), wc = new EE(), vw = new EE(); vw.webContents = wc; let rechaza = null; vw.loadURL = () => new Promise((_ok, ko) => { rechaza = ko; });
D.vigilaVentana(vw, 'sesion'); D.carga(vw, 'https://campus.ejemplo.edu/ultra/stream?t=SECRETO', 'sesion');
wc.emit('did-navigate', {}, 'https://sso.ejemplo.edu/login?SAMLRequest=SECRETO', 200); wc.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'https://x.edu/', true); wc.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://campus.ejemplo.edu/ultra/stream', true);
wc.emit('certificate-error', {}, 'https://campus.ejemplo.edu/', 'net::ERR_CERT_AUTHORITY_INVALID'); vw.emit('closed'); rechaza(new Error('ERR_NAME_NOT_RESOLVED (-105) loading'));
setTimeout(() => {
  const v = D.leeRegistro(g), txt = v.map(x => x.msg).join('\n');
  t('apunta a qué páginas va, sin parámetros', /abre https:\/\/campus\.ejemplo\.edu\/ultra\/stream$/m.test(txt) && /página https:\/\/sso\.ejemplo\.edu\/login \(HTTP 200\)/.test(txt) && !/SECRETO/.test(txt));
  t('apunta los fallos de carga y de certificado, no las redirecciones', v.filter(x => x.nivel === 'error').length === 3 && /ERR_NAME_NOT_RESOLVED \(-105\)/.test(txt) && /certificado rechazado/.test(txt) && !/ERR_ABORTED/.test(txt) && /ventana cerrada/.test(txt));
  fs.rmSync(path.dirname(f), { recursive: true, force: true }); console.log('ok', ok, 'ko', ko);
}, 30);
