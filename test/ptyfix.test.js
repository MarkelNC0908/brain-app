const fs = require('fs'), os = require('os'), path = require('path'); const P = require('../src/ptyfix.js');
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
// node-pty simulado con el ayudante SIN permiso de ejecución, como en el zip de macOS
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-pty-'));
const h = path.join(base, 'prebuilds', 'darwin-arm64', 'spawn-helper'); fs.mkdirSync(path.dirname(h), { recursive: true }); fs.writeFileSync(h, 'x'); fs.chmodSync(h, 0o644);
const otro = path.join(base, 'prebuilds', 'darwin-x64', 'spawn-helper'); fs.mkdirSync(path.dirname(otro), { recursive: true }); fs.writeFileSync(otro, 'x'); fs.chmodSync(otro, 0o644);
if (process.platform !== 'win32') {
  const r = P.aseguraHelper({ base, plat: 'darwin', arch: 'arm64' });
  t('da permiso de ejecución al ayudante de su plataforma', (fs.statSync(h).mode & 0o111) === 0o111 && r.arreglados.length === 1 && !r.fallos.length);
  t('no toca el de otra arquitectura', (fs.statSync(otro).mode & 0o111) === 0);
  const r2 = P.aseguraHelper({ base, plat: 'darwin', arch: 'arm64' }); t('es idempotente (segunda vez no cambia nada)', r2.arreglados.length === 0);
}
t('en Windows no hace nada', P.aseguraHelper({ base, plat: 'win32', arch: 'x64' }).arreglados.length === 0);
t('sin ayudante no falla', P.aseguraHelper({ base: path.join(base, 'no-existe'), plat: 'darwin', arch: 'arm64' }).arreglados.length === 0);
t('apunta a app.asar.unpacked', P.carpetaPty(() => `/Applications/Brain.app/Contents/Resources/app.asar/node_modules/node-pty/lib/index.js`).includes('app.asar.unpacked'));
t('mensaje claro para posix_spawnp en macOS', /chmod \+x/.test(P.mensajeError(new Error('posix_spawnp failed.'), 'darwin')) && /posix_spawnp failed/.test(P.mensajeError(new Error('posix_spawnp failed.'), 'darwin')));
t('otros errores pasan tal cual', P.mensajeError(new Error('otra cosa')) === 'otra cosa');
fs.rmSync(base, { recursive: true, force: true }); console.log('ok', ok, 'ko', ko);
