// «Ingestar novedades» propone como entregas «Por hacer» las tareas del libro de calificaciones que siguen sin entregar y que el Brain aún no tiene.
// Usa una copia temporal del Brain de ejemplo (test/fixtures/brain-demo); no toca ningún campus real.
const Module = require('module'), fs = require('fs'), os = require('os'), path = require('path');
const orig = Module._load; Module._load = function (r, ...a) { if (r === 'electron') return { session: {}, BrowserWindow: function () {}, app: {} }; return orig.call(this, r, ...a); };
const B = require('../src/bbingest.js'), M = require('../src/matcher.js'), dashboard = require('../src/dashboard.js');
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };

const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-pend-'));
fs.cpSync(path.join(__dirname, 'fixtures', 'brain-demo'), vault, { recursive: true });
const hoy = '2026-11-23';

// Texto tal como sale en el libro de BRS: «Práctica 3» sin abrir con «Intentos posibles ilimitados» y su plazo (el lector anterior lo partía en tres filas)
const txt = 'Libro\nNombre del elemento\nResultados\n' +
  'Test UD-4 Bastionado Físico\nCalificado\n22/10/26\n8,5/10\n' +
  'Práctica 2\nEnviado\n22/11/26\nSin calificar\n' +
  'Práctica 3\nIntentos posibles ilimitados\n27/12/2026\nSin abrir\nSin calificar\n' +
  'Tarea 1 - Perfil de la organización\nNo se entregó ningún intento\n02/10/2026\nSin calificar\n' +
  'Actividad UD-9\nNo enviado\n10/12/2026\nSin calificar\n' +
  'Test UD-8 entregado\nCompletado\n20/11/2026\nSin calificar\n' +
  'Total\nSin calificar\n' +
  'Asistencia\nContinuo\n100/100\n' +
  'Página 1 de 1\n';
const filas = B._parseNotas(txt);
const p3 = filas.find(f => f.nombre === 'Práctica 3');
t('Práctica 3 es una sola fila con su plazo y su estado', p3 && p3.fecha === '27/12/2026' && p3.estado === 'Sin abrir' && /Intentos posibles/.test(p3.intentos || ''));
t('«Intentos posibles» y «Sin abrir» ya no son filas', !filas.some(f => /^(Intentos posibles|Sin abrir)/i.test(f.nombre)));

const cam = M.cambios(vault, hoy, filas, 'brs'), por = (n) => cam.find(c => c.titulo === n);
console.log(JSON.stringify(cam.map(c => [c.titulo, c.tipo, c.col, c.vencida ? 'vencida' : ''])));
t('Práctica 3 se propone en «Por hacer» con su plazo', por('Práctica 3') && por('Práctica 3').tipo === 'crear' && por('Práctica 3').col === 'todo' && por('Práctica 3').card.fecha === '2026-12-27' && !por('Práctica 3').vencida);
t('la tarea sin entregar con el plazo pasado se propone marcada como vencida', por('Tarea 1 - Perfil de la organización') && por('Tarea 1 - Perfil de la organización').vencida === true);
t('«No enviado» es pendiente, no entregado', por('Actividad UD-9') && por('Actividad UD-9').col === 'todo');
t('«Completado» (enviado, sin corregir) no se propone como pendiente', !por('Test UD-8 entregado'));
t('las columnas Total y Asistencia no son entregas', !por('Total') && !por('Asistencia'));
t('la Práctica 2 que ya está en el Brain no se duplica', !cam.some(c => c.tipo === 'crear' && /Práctica 2/.test(c.titulo)));

// Si el Brain ya tiene la entrega (en cualquier columna) no se propone otra vez
const res = dashboard.move(vault, por('Práctica 3').card, 'todo', '', hoy, { creada: true });
t('al aplicar se crea su nota de entregas/ con status pendiente', res.created && /status: pendiente/.test(fs.readFileSync(path.join(vault, res.nota), 'utf8')) && /due: 2026-12-27/.test(fs.readFileSync(path.join(vault, res.nota), 'utf8')));
t('y aparece en el dashboard en «Por hacer»', dashboard.build(vault, hoy).items.some(i => i.sigla === 'BRS' && i.titulo === 'Práctica 3' && i.col === 'todo'));
t('en la siguiente ingesta ya no se vuelve a proponer', !M.cambios(vault, hoy, filas, 'brs').some(c => c.titulo === 'Práctica 3'));

// Datos guardados por el lector anterior (pantalla Notas): las tres filas partidas se juntan
const L = B._limpiaFilas([{ nombre: 'Práctica 3', estado: '', fecha: '', nota: null }, { nombre: 'Intentos posibles ilimitados', estado: '', fecha: '2026-12-27', nota: null }, { nombre: 'Sin abrir', estado: '', fecha: '', nota: null, sinCalificar: true }]);
t('limpieza: Práctica 3 queda como una fila con plazo y «Sin abrir»', L.length === 1 && L[0].fecha === '2026-12-27' && L[0].estado === 'Sin abrir' && L[0].sinCalificar);

fs.rmSync(vault, { recursive: true, force: true });
console.log('ok', ok, 'ko', ko);
