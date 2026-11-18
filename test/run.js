// Ejecuta todas las pruebas (node test/run.js · npm test). Cada fichero *.test.js imprime una línea «ok N ko M».
// Las que necesitan un Brain lo buscan en BRAIN_DIR o en ../brain y se omiten si no existe. No llaman a ningún servicio real: Ollama y Google van simulados.
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const ficheros = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
let ok = 0, ko = 0, fallos = [];
for (const f of ficheros) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 180000, cwd: path.resolve(__dirname, '..') });
  const out = (r.stdout || '') + (r.stderr || ''), m = out.match(/ok (\d+) ko (\d+)/);
  if (!m || r.status !== 0 || +m[2] > 0) { fallos.push(f); console.log(`✗ ${f}\n${out.split('\n').filter(l => /FALLA|Error|error/.test(l)).slice(0, 6).join('\n')}`); }
  else console.log(`✓ ${f}  (${m[1]} comprobaciones${/omitido/.test(out) ? ', omitido' : ''})`);
  if (m) { ok += +m[1]; ko += +m[2]; }
}
console.log(`\n${ok} comprobaciones correctas, ${ko} fallidas, ${fallos.length} fichero(s) con problemas`);
process.exit(fallos.length ? 1 : 0);
