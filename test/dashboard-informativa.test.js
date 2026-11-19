// Las líneas que cuentan algo que pasó («el usuario descargó material…») no son entregas; las entregas reales siguen saliendo
const D = require('../src/dashboard.js');
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
const ficha = `---\ntitle: NC\n---\n## Entregas y evaluación
- NC, 2026-10-02 23:59: Tarea 1 Perfil de la organización para TFC (10 pts) — entregada, pendiente de corregir [verificado]
- NC, 2026-11-16: el usuario descargó material de las Sesiones 3, 4, 5, 6 y 8 (diapositivas y plantillas) [pendiente]
- NC, 2026-11-17: se ingestaron las Sesiones 3 y 4 [verificado]
- NC, 2026-11-23: parcial de las Sesiones 2 y 3, según el usuario [pendiente]
- 2026-11-20: El alumno revisó el temario [supuesto]
- 2026-11-30: Entrega del trabajo final [pendiente]
`;
const files = { 'nc/nc.md': ficha };
const io = { read: (r) => files[r] || '', list: (r) => (r === '' ? ['nc'] : r === 'nc' ? ['nc.md'] : []) };
const it = D.build('', '2026-11-19', io).items.map(i => i.titulo);
t('entrega con formato del Brain', it.some(x => /^Tarea 1 Perfil/.test(x)));
t('«según el usuario» al final sí es una entrega', it.some(x => /^parcial de las Sesiones 2 y 3/.test(x)));
t('entrega en formato libre', it.some(x => /Entrega del trabajo final/.test(x)));
t('«el usuario descargó…» no es una entrega', !it.some(x => /descarg/.test(x)));
t('«se ingestaron…» no es una entrega', !it.some(x => /ingest/.test(x)));
t('«El alumno revisó…» (formato libre) no es una entrega', !it.some(x => /alumno/i.test(x)));
t('quedan exactamente las tres entregas', it.length === 3);
console.log('ok', ok, 'ko', ko);
