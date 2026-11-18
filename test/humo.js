// Prueba de arranque con Electron de verdad: abre la app con una carpeta de datos temporal y el Brain de ejemplo, recorre las pantallas y comprueba que no hay errores.
// Uso: npm run humo   (en Linux sin pantalla: xvfb-run -a npm run humo)
const { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
let electron; try { electron = require('electron'); } catch (e) { console.log('Electron no está instalado (¿npm ci --ignore-scripts?): prueba omitida'); process.exit(0); }
if (typeof electron !== 'string') { console.log('Electron no disponible: prueba omitida'); process.exit(0); }
const datos = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-humo-')), raiz = path.resolve(__dirname, '..');
const env = { ...process.env, BRAIN_HUMO_DATOS: datos, BRAIN_HUMO_BRAIN: process.env.BRAIN_DIR || path.join(__dirname, 'fixtures', 'brain-demo') }; delete env.ELECTRON_RUN_AS_NODE;
// BRAIN_HUMO_APP=ruta/al/ejecutable prueba la app EMPAQUETADA (por ejemplo dist/Brain-darwin-arm64/Brain.app/Contents/MacOS/Brain) en lugar del código fuente
const p = process.env.BRAIN_HUMO_APP ? spawn(process.env.BRAIN_HUMO_APP, ['--humo'], { env, stdio: ['ignore', 'pipe', 'pipe'] }) : spawn(electron, [raiz, '--humo', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { out += d; });
const t = setTimeout(() => { p.kill('SIGKILL'); }, 90000);
p.on('exit', (code) => { clearTimeout(t); fs.rmSync(datos, { recursive: true, force: true }); const l = out.split('\n').find(x => /^HUMO_(OK|FALLO)/.test(x)) || ''; console.log(l || ('sin resultado: ' + out.slice(-400))); process.exit(code === 0 && /^HUMO_OK/.test(l) ? 0 : 1); });
