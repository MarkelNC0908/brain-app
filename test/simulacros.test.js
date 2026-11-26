// Simulacros (src/simulacros.js): lectura del banco en Markdown, reparto de preguntas y repaso espaciado de fallos
const S = require('../src/simulacros.js');
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
const banco = `**TL;DR**: banco de prueba

## diap. 16 · ¿Quién desarrolló Pegasus?
- [x] NSO Group
- [ ] Citizen Lab
- [ ] Cl0p
> Pegasus es de NSO Group.

## diap. 7 · Relaciona cada riesgo con su descripción.
- Wifi no asegurada => Red pública sin seguridad
- Suplantación de red => Punto de acceso falso
> Diapositiva 7.

## Pregunta sin diapositiva
en dos líneas
- [ ] Mal
- [x] Bien

## diap. 6 · Sin respuesta correcta (no cuenta)
- [ ] A
- [ ] B

## diap. 6 · Dos correctas (no cuenta)
- [x] A
- [x] B
`;
const qs = S.simParsea(banco);
t('lee 3 preguntas válidas', qs.length === 3);
t('opción múltiple', qs[0].tipo === 'opc' && qs[0].diap === '16' && qs[0].ok === 'NSO Group' && qs[0].mal.length === 2 && qs[0].expl === 'Pegasus es de NSO Group.');
t('relacionar', qs[1].tipo === 'rel' && qs[1].pares.length === 2 && qs[1].pares[1][1] === 'Punto de acceso falso');
t('sin diapositiva y enunciado en dos líneas', qs[2].diap === '' && qs[2].q === 'Pregunta sin diapositiva\nen dos líneas' && qs[2].ok === 'Bien');
t('saltos de línea de Windows', S.simParsea(banco.replace(/\n/g, '\r\n')).length === 3);
// reparto: 30 preguntas de 3 diapositivas, 6 por intento → salen las tres diapositivas
const muchas = []; for (const d of ['6', '7', '16']) for (let i = 0; i < 10; i++) muchas.push({ tipo: 'opc', diap: d, q: d + '-' + i, ok: 'a', mal: ['b'] });
let semilla = 7; const azar = () => ((semilla = (semilla * 16807) % 2147483647) / 2147483647);
const el = S.simElige(muchas, 6, azar);
t('elige el número pedido sin repetir', el.length === 6 && new Set(el.map(q => q.q)).size === 6);
t('reparte entre diapositivas', new Set(el.map(q => q.diap)).size === 3);
t('si se piden más de las que hay, todas', S.simElige(qs, 99).length === 3);
// repaso espaciado
const suma = (f, d) => { const x = new Date(f + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const st = { bancos: {}, fallos: {} }, id = S.simId('b.md', qs[0]);
S.simFallo(st, id, 'b.md', '2026-11-27');
t('el fallo entra para mañana', S.simPendientes(st, '2026-11-26').length === 0 && S.simPendientes(st, '2026-11-27').length === 1);
S.simAcierto(st, id, '2026-11-27', suma); t('acierto: vuelve en 1 día', st.fallos[id].caja === 1 && st.fallos[id].prox === '2026-11-28');
S.simAcierto(st, id, '2026-11-28', suma); t('luego en 3', st.fallos[id].prox === '2026-12-01');
S.simAcierto(st, id, '2026-12-01', suma); S.simAcierto(st, id, '2026-12-08', suma); S.simAcierto(st, id, '2026-12-22', suma);
t('tras la última caja sale del repaso', !st.fallos[id]);
t('id estable por banco y enunciado', S.simId('b.md', qs[0]) === S.simId('b.md', { q: qs[0].q }) && S.simId('c.md', qs[0]) !== id);
console.log('ok', ok, 'ko', ko);
