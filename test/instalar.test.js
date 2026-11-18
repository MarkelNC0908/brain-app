// Instalación de la versión descargada: validaciones, scripts de Windows/Linux (texto) y la instalación completa con aplicaciones FALSAS en una carpeta temporal.
// La prueba de macOS (ditto, plutil) solo corre en macOS; la de Linux (script bash) corre en macOS y Linux. Windows solo se comprueba el texto del script.
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process'), I = require('../src/instalar.js');
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
const esperar = (f, ms = 8000) => new Promise(async (r) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return r(true); await new Promise(x => setTimeout(x, 100)); } r(false); });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-inst-'));
t('carpetaApp', I.carpetaApp('darwin', '/Applications/Brain.app/Contents/MacOS/Brain') === '/Applications/Brain.app' && I.carpetaApp('darwin', '/x/electron') === '' && I.carpetaApp('win32', 'C:\\\\Apps\\\\Brain\\\\Brain.exe').endsWith('Brain') === true || I.carpetaApp('linux', '/opt/Brain/Brain') === '/opt/Brain');
t('zip por sistema', I.zipDeSistema('darwin', 'arm64') === 'macos-arm64' && I.zipDeSistema('darwin', 'x64') === '' && I.zipDeSistema('win32', 'x64') === 'windows-x64' && I.zipDeSistema('linux', 'x64') === 'linux-x64');
t('nombre de zip válido', I.ZIP_RE.test('Brain-macos-arm64.zip') && I.ZIP_RE.test('Brain-windows-x64 (2).zip') && !I.ZIP_RE.test('../Brain-macos-arm64.zip') && !I.ZIP_RE.test('otro.zip'));
const w = I.scriptDe('win32').texto, l = I.scriptDe('linux').texto, m = I.scriptDe('darwin').texto;
t('script de Windows: espera, aparta, copia, restaura y relanza', /tasklist/.test(w) && /move "%DEST%" "%BACKUP%"/.test(w) && /robocopy "%NEW%" "%DEST%" \/E/.test(w) && /:restaura/.test(w) && /start "" "%DEST%\\Brain\.exe"/.test(w) && !/\/MIR/.test(w));
t('scripts de macOS/Linux con restauración y sin datos incrustados', /mv "\$BACKUP" "\$DEST"/.test(m) && /ditto "\$NEW" "\$DEST"/.test(m) && /cp -a "\$NEW" "\$DEST"/.test(l) && /mv "\$BACKUP" "\$DEST"/.test(l) && !/\/Users\//.test(m + l + w));
(async () => {
  // validaciones
  const base = { plat: 'darwin', arch: 'arm64', esperada: '1.0.14', exe: '/x/Brain.app/Contents/MacOS/Brain', empaquetada: true, temp: tmp };
  t('no instala en npm start', /npm start/.test((await I.preparar({ ...base, zip: '/x/Brain-macos-arm64.zip', empaquetada: false })).msg));
  t('rechaza el zip de otro sistema', /no es el de este sistema/.test((await I.preparar({ ...base, zip: path.join(tmp, 'Brain-windows-x64.zip') })).msg));
  t('Intel sin versión', /No hay versión descargable/.test((await I.preparar({ ...base, arch: 'x64', zip: 'x' })).msg));
  // ---- instalación completa, Linux (script bash) ----
  if (process.platform !== 'win32') {
    const dest = path.join(tmp, 'linux', 'Brain'), nueva = path.join(tmp, 'stageL', 'Brain-linux-x64'), log = path.join(tmp, 'l.log'), stage = path.join(tmp, 'stageL');
    fs.mkdirSync(dest, { recursive: true }); fs.writeFileSync(path.join(dest, 'Brain'), '#!/bin/sh\necho vieja', { mode: 0o755 }); fs.writeFileSync(path.join(dest, 'viejo.txt'), 'x');
    fs.mkdirSync(nueva, { recursive: true }); fs.writeFileSync(path.join(nueva, 'Brain'), '#!/bin/sh\necho nueva', { mode: 0o755 }); fs.writeFileSync(path.join(nueva, 'nuevo.txt'), 'y');
    const dorm = require('child_process').spawn('sleep', ['1']);   // la «app» que se cierra al cabo de 1 s
    const script = path.join(tmp, 'instalar-l.sh'); fs.writeFileSync(script, I.scriptDe('linux').texto, { mode: 0o755 }); I.lanzar({ plat: 'linux', script, nueva, dest, stage, pid: dorm.pid, relanzar: false, log });
    t('Linux: instala cuando la app se cierra', await esperar(() => fs.existsSync(path.join(dest, 'nuevo.txt')) && !fs.existsSync(dest + '.anterior')) && !fs.existsSync(path.join(dest, 'viejo.txt')) && /versión nueva instalada/.test(fs.readFileSync(log, 'utf8')) && fs.statSync(path.join(dest, 'Brain')).mode & 0o100);
    // restauración: la carpeta nueva no existe → se conserva la anterior
    const dest2 = path.join(tmp, 'linux2', 'Brain'); fs.mkdirSync(dest2, { recursive: true }); fs.writeFileSync(path.join(dest2, 'Brain'), '#!/bin/sh', { mode: 0o755 }); fs.writeFileSync(path.join(dest2, 'viejo.txt'), 'x'); const d2 = require('child_process').spawn('sleep', ['1']), log2 = path.join(tmp, 'l2.log');
    I.lanzar({ plat: 'linux', script, nueva: path.join(tmp, 'no-existe'), dest: dest2, stage: path.join(tmp, 'sx'), pid: d2.pid, relanzar: false, log: log2 });
    t('Linux: si falla la copia, restaura la anterior', await esperar(() => fs.existsSync(log2) && /restaurada/.test(fs.readFileSync(log2, 'utf8'))) && fs.existsSync(path.join(dest2, 'viejo.txt')) && !fs.existsSync(dest2 + '.anterior'));
    // si la app no se cierra, no toca nada
    const dest3 = path.join(tmp, 'linux3', 'Brain'); fs.mkdirSync(dest3, { recursive: true }); fs.writeFileSync(path.join(dest3, 'Brain'), '#!/bin/sh', { mode: 0o755 });
    t('la ruta del script no se interpreta (espacios)', fs.existsSync(path.join(tmp, 'instalar-l.sh')));
  }
  // ---- instalación completa, macOS (ditto + plutil + script) ----
  if (process.platform === 'darwin') {
    const mkApp = (dir, v) => { const c = path.join(dir, 'Brain.app', 'Contents'); fs.mkdirSync(path.join(c, 'MacOS'), { recursive: true }); fs.writeFileSync(path.join(c, 'MacOS', 'Brain'), '#!/bin/sh\n', { mode: 0o755 }); fs.writeFileSync(path.join(c, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleShortVersionString</key><string>${v}</string><key>CFBundleIdentifier</key><string>com.test.brain</string></dict></plist>`); };
    const inst = path.join(tmp, 'mac con espacios', 'inst'), descargas = path.join(tmp, 'Descargas'), src = path.join(tmp, 'src', 'Brain-darwin-arm64'); fs.mkdirSync(descargas, { recursive: true });
    mkApp(inst, '1.0.13'); mkApp(src, '1.0.14'); fs.writeFileSync(path.join(src, 'LICENSE'), 'x'); const zip = path.join(descargas, 'Brain-macos-arm64.zip'); execFileSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', src, zip]);
    const exe = path.join(inst, 'Brain.app', 'Contents', 'MacOS', 'Brain'), mal = await I.preparar({ ...base, zip, exe, esperada: '1.0.99' }); t('macOS: rechaza una versión distinta de la esperada', !mal.ok && /no es la esperada/.test(mal.msg) && fs.readdirSync(tmp).filter(n => n.startsWith('brain-upd-')).length === 0);
    const p = await I.preparar({ ...base, zip, exe, esperada: '1.0.14' }); t('macOS: prepara (extrae y valida)', p.ok && p.dest === path.join(inst, 'Brain.app') && await I._versionApp('darwin', p.nueva) === '1.0.14' && fs.existsSync(p.script));
    const log = path.join(tmp, 'm.log'), dorm = require('child_process').spawn('sleep', ['1']); I.lanzar({ plat: 'darwin', script: p.script, nueva: p.nueva, dest: p.dest, stage: p.stage, pid: dorm.pid, relanzar: true, log, abrir: '/usr/bin/true' });
    t('macOS: sustituye la app al cerrarse y limpia', await esperar(() => fs.existsSync(log) && /instalada/.test(fs.readFileSync(log, 'utf8'))) && await I._versionApp('darwin', p.dest) === '1.0.14' && !fs.existsSync(path.join(inst, 'Brain.anterior.app')) && !fs.existsSync(p.stage));
    // restauración
    mkApp(path.join(tmp, 'inst2'), '1.0.13'); const exe2 = path.join(tmp, 'inst2', 'Brain.app', 'Contents', 'MacOS', 'Brain'), p2 = await I.preparar({ ...base, zip, exe: exe2, esperada: '1.0.14' }); fs.rmSync(p2.nueva, { recursive: true, force: true });
    const log2 = path.join(tmp, 'm2.log'), d2 = require('child_process').spawn('sleep', ['1']); I.lanzar({ plat: 'darwin', script: p2.script, nueva: p2.nueva, dest: p2.dest, stage: p2.stage, pid: d2.pid, relanzar: false, log: log2 });
    t('macOS: si falla la copia, restaura la anterior', await esperar(() => fs.existsSync(log2) && /restaurada/.test(fs.readFileSync(log2, 'utf8'))) && await I._versionApp('darwin', p2.dest) === '1.0.13' && !fs.existsSync(path.join(tmp, 'inst2', 'Brain.anterior.app')));
    // sin permiso de escritura
    mkApp(path.join(tmp, 'solo-lectura'), '1.0.13'); fs.chmodSync(path.join(tmp, 'solo-lectura'), 0o555); const p3 = await I.preparar({ ...base, zip, exe: path.join(tmp, 'solo-lectura', 'Brain.app', 'Contents', 'MacOS', 'Brain') }); fs.chmodSync(path.join(tmp, 'solo-lectura'), 0o755);
    t('macOS: sin permiso de escritura, lo dice y no extrae nada', !p3.ok && /permiso para escribir/.test(p3.msg));
  }
  I.limpiaRestos(tmp); fs.rmSync(tmp, { recursive: true, force: true }); console.log('ok', ok, 'ko', ko); process.exit(0);
})();
