// Instalación de la versión descargada: extrae el .zip, comprueba que es la versión esperada y lanza un script aparte que, cuando la app se cierra,
// aparta la versión anterior, copia la nueva y (si se pide) la vuelve a abrir. Si algo falla, restaura la anterior. macOS está probado; Windows y Linux, no.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const run = (cmd, args, opts) => new Promise((res) => execFile(cmd, args, { timeout: 180000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, ...opts }, (err, out, errout) => res({ ok: !err, out: String(out || ''), err: String(errout || (err && err.message) || '') })));
const ZIP_RE = /^Brain-(macos-arm64|windows-x64|linux-x64)( \(\d+\))?\.zip$/;
const zipDeSistema = (plat, arch) => (plat === 'darwin' && arch === 'arm64' ? 'macos-arm64' : plat === 'win32' ? 'windows-x64' : plat === 'linux' ? 'linux-x64' : '');
// Carpeta de la aplicación instalada: el .app en macOS; la carpeta del ejecutable en Windows y Linux
function carpetaApp(plat, exe) {
  if (plat === 'darwin') { const i = String(exe).indexOf('.app/Contents/MacOS/'); return i > 0 ? String(exe).slice(0, i + 4) : ''; }
  return path.dirname(String(exe));
}
async function extraer(plat, zip, stage) {
  fs.mkdirSync(stage, { recursive: true });
  const r = plat === 'darwin' ? await run('/usr/bin/ditto', ['-x', '-k', zip, stage]) : plat === 'win32' ? await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force', zip, stage]) : await run('unzip', ['-q', '-o', zip, '-d', stage]);
  return r.ok ? { ok: true } : { ok: false, msg: 'No se pudo extraer el .zip' + (plat === 'linux' ? ' (¿está instalado «unzip»?)' : '') };
}
function localizaNueva(plat, stage) {
  const exe = plat === 'darwin' ? 'Brain.app' : plat === 'win32' ? 'Brain.exe' : 'Brain';
  for (const d of [stage, ...fs.readdirSync(stage).map(n => path.join(stage, n))]) {
    try { if (plat === 'darwin') { if (fs.existsSync(path.join(d, 'Brain.app', 'Contents', 'MacOS'))) return path.join(d, 'Brain.app'); } else if (fs.existsSync(path.join(d, exe)) && fs.statSync(d).isDirectory()) return d; } catch {}
  }
  return '';
}
async function versionApp(plat, dir) { if (plat !== 'darwin') return ''; const r = await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(dir, 'Contents', 'Info.plist')]); return r.ok ? r.out.trim() : ''; }
// Scripts que se ejecutan FUERA de la app (ella ya se habrá cerrado). Reciben los datos como argumentos, nunca incrustados en el texto.
const SCRIPT_MAC = `#!/bin/bash
# args: PID NUEVA DESTINO STAGE RELANZAR ABRIR REGISTRO
PID="$1"; NEW="$2"; DEST="$3"; STAGE="$4"; RELANZAR="$5"; ABRIR="\${6:-/usr/bin/open}"; LOG="$7"
log() { [ -n "$LOG" ] && echo "$(date '+%F %T') $*" >> "$LOG"; }
for i in $(seq 1 240); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
if kill -0 "$PID" 2>/dev/null; then log "la app no se cerró: no se instala"; exit 1; fi
BACKUP="\${DEST%.app}.anterior.app"
rm -rf "$BACKUP"
if ! mv "$DEST" "$BACKUP"; then log "no se pudo apartar la versión anterior"; [ "$RELANZAR" = "1" ] && "$ABRIR" "$DEST"; exit 1; fi
if ditto "$NEW" "$DEST" && [ -d "$DEST/Contents/MacOS" ]; then
  xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
  rm -rf "$BACKUP" "$STAGE"; log "versión nueva instalada"
else
  rm -rf "$DEST"; mv "$BACKUP" "$DEST"; log "fallo al copiar: restaurada la versión anterior"
fi
[ "$RELANZAR" = "1" ] && "$ABRIR" "$DEST"
exit 0
`;
const SCRIPT_LINUX = `#!/bin/bash
# args: PID NUEVA DESTINO STAGE RELANZAR ABRIR REGISTRO
PID="$1"; NEW="$2"; DEST="$3"; STAGE="$4"; RELANZAR="$5"; LOG="$7"
log() { [ -n "$LOG" ] && echo "$(date '+%F %T') $*" >> "$LOG"; }
for i in $(seq 1 240); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
if kill -0 "$PID" 2>/dev/null; then log "la app no se cerró: no se instala"; exit 1; fi
BACKUP="\${DEST}.anterior"
rm -rf "$BACKUP"
if ! mv "$DEST" "$BACKUP"; then log "no se pudo apartar la versión anterior"; exit 1; fi
if cp -a "$NEW" "$DEST" && [ -x "$DEST/Brain" ]; then
  rm -rf "$BACKUP" "$STAGE"; log "versión nueva instalada"
else
  rm -rf "$DEST"; mv "$BACKUP" "$DEST"; log "fallo al copiar: restaurada la versión anterior"
fi
if [ "$RELANZAR" = "1" ]; then nohup "$DEST/Brain" >/dev/null 2>&1 & fi
exit 0
`;
const SCRIPT_WIN = `@echo off
rem args: PID NUEVA DESTINO STAGE RELANZAR ABRIR REGISTRO
setlocal EnableDelayedExpansion
set "PID=%~1" & set "NEW=%~2" & set "DEST=%~3" & set "STAGE=%~4" & set "RELANZAR=%~5" & set "LOG=%~7"
set /a n=0
:espera
tasklist /FI "PID eq %PID%" 2>nul | find "%PID%" >nul
if not errorlevel 1 (
  set /a n+=1
  if !n! GEQ 120 ( if defined LOG echo la app no se cerró: no se instala >> "%LOG%" & exit /b 1 )
  timeout /t 1 /nobreak >nul
  goto espera
)
set "BACKUP=%DEST%.anterior"
if exist "%BACKUP%" rmdir /s /q "%BACKUP%"
move "%DEST%" "%BACKUP%" >nul
if errorlevel 1 ( if defined LOG echo no se pudo apartar la versión anterior >> "%LOG%" & goto relanza )
robocopy "%NEW%" "%DEST%" /E /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto restaura
if not exist "%DEST%\\Brain.exe" goto restaura
rmdir /s /q "%BACKUP%" & rmdir /s /q "%STAGE%"
if defined LOG echo versión nueva instalada >> "%LOG%"
goto relanza
:restaura
rmdir /s /q "%DEST%" 2>nul
move "%BACKUP%" "%DEST%" >nul
if defined LOG echo fallo al copiar: restaurada la versión anterior >> "%LOG%"
:relanza
if "%RELANZAR%"=="1" start "" "%DEST%\\Brain.exe"
exit /b 0
`;
const scriptDe = (plat) => (plat === 'darwin' ? { nombre: 'instalar.sh', texto: SCRIPT_MAC } : plat === 'win32' ? { nombre: 'instalar.cmd', texto: SCRIPT_WIN } : { nombre: 'instalar.sh', texto: SCRIPT_LINUX });
// zip: ruta del .zip descargado; esperada: versión que debe traer ('1.0.15'); exe: process.execPath. Devuelve { ok, stage, nueva, dest, script } o { ok:false, msg }
async function preparar({ plat, arch, zip, esperada, exe, empaquetada, temp }) {
  if (!empaquetada) return { ok: false, msg: 'Solo se puede instalar en la aplicación instalada (no en «npm start»).' };
  if (!zipDeSistema(plat, arch)) return { ok: false, msg: 'No hay versión descargable para este sistema.' };
  const nombre = path.basename(String(zip)), m = nombre.match(ZIP_RE); if (!m || m[1] !== zipDeSistema(plat, arch) || !fs.existsSync(zip)) return { ok: false, msg: 'El fichero descargado no es el de este sistema.' };
  const dest = carpetaApp(plat, exe); if (!dest || !fs.existsSync(dest)) return { ok: false, msg: 'No encuentro dónde está instalada la aplicación.' };
  try { fs.accessSync(path.dirname(dest), fs.constants.W_OK); } catch { return { ok: false, msg: `No tengo permiso para escribir en ${path.dirname(dest)}. Instálala a mano o muévela a una carpeta tuya.` }; }
  const stage = path.join(temp || os.tmpdir(), 'brain-upd-' + crypto.randomBytes(5).toString('hex')), ex = await extraer(plat, zip, stage);
  if (!ex.ok) { fs.rmSync(stage, { recursive: true, force: true }); return ex; }
  const nueva = localizaNueva(plat, stage); if (!nueva) { fs.rmSync(stage, { recursive: true, force: true }); return { ok: false, msg: 'El .zip no contiene la aplicación esperada.' }; }
  if (plat === 'darwin' && esperada) { const v = await versionApp(plat, nueva); if (v !== String(esperada).replace(/^v/i, '')) { fs.rmSync(stage, { recursive: true, force: true }); return { ok: false, msg: `La versión del .zip (${v || '?'}) no es la esperada (${esperada}).` }; } }
  const s = scriptDe(plat), script = path.join(stage, s.nombre); fs.writeFileSync(script, s.texto, { mode: 0o755 });
  return { ok: true, stage, nueva, dest, script };
}
// Lanza el script en segundo plano, independiente de la app (que debe cerrarse enseguida)
function lanzar({ plat, script, nueva, dest, stage, pid, relanzar, log, abrir }) {
  const args = [String(pid), nueva, dest, stage, relanzar ? '1' : '0', abrir || '', log || ''];
  const p = plat === 'win32' ? spawn('cmd.exe', ['/c', script, ...args], { detached: true, stdio: 'ignore', windowsHide: true }) : spawn('/bin/bash', [script, ...args], { detached: true, stdio: 'ignore' });
  p.unref(); return p.pid;
}
function limpiaRestos(temp) { try { for (const n of fs.readdirSync(temp || os.tmpdir())) { if (!/^brain-upd-[0-9a-f]{10}$/.test(n)) continue; const f = path.join(temp || os.tmpdir(), n); if (Date.now() - fs.statSync(f).mtimeMs > 24 * 3600 * 1000) fs.rmSync(f, { recursive: true, force: true }); } } catch {} }
module.exports = { carpetaApp, zipDeSistema, preparar, lanzar, limpiaRestos, scriptDe, ZIP_RE, _versionApp: versionApp, _localizaNueva: localizaNueva };
