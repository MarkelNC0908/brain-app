const Module=require('module'),fs=require('fs'),os=require('os'),path=require('path');
const orig=Module._load;Module._load=function(r,...a){if(r==='electron')return{session:{},BrowserWindow:function(){},app:{}};return orig.call(this,r,...a)};
const B=require('../src/bbingest.js');
let ok=0,ko=0;const t=(n,c)=>{c?ok++:(ko++,console.log('FALLA',n))};
const f=path.join(os.tmpdir(),'notas-test.json');try{fs.unlinkSync(f)}catch{}
t('sin init',B.notasEstado().status==='no-aplica');
B.init({campus:'https://x.example',partition:'p',ingestaFile:path.join(os.tmpdir(),'i.json'),notasFile:f});
t('nunca',B.notasEstado().status==='nunca');
const txt='Libro\nNombre del elemento\nResultados\nTest UD-4 Bastionado Físico\nCalificado\n22/10/26\n8,5/10\nPráctica 2\nEnviado\n22/11/26\nSin calificar\nActividad UD7\nSin enviar\nSin calificar\n';
const filas=B._parseNotas(txt).map(B._filaNota);console.log(JSON.stringify(filas));
t('3 filas',filas.length===3);
t('nota 8,5',filas[0].nota===8.5&&filas[0].max===10&&filas[0].fecha==='2026-10-22'&&filas[0].notaTexto==='8,5/10');
t('sin calificar',filas[1].nota===null&&filas[1].sinCalificar&&filas[1].estado==='Enviado');
fs.writeFileSync(f,JSON.stringify({leido:'2026-11-18T10:00:00Z',cursos:[{sigla:'brs',nombre:'BRS',filas}]}));
B.init({campus:'https://x.example',partition:'p',ingestaFile:'/tmp/i.json',notasFile:f});
const e=B.notasEstado();t('lee guardado',e.status==='ok'&&e.cursos[0].filas.length===3);
// aviso de nota nueva
const prev = [{ sigla: 'brs', filas: [{ nombre: 'Test 1', nota: 7, max: 10, notaTexto: '7/10' }, { nombre: 'Práctica 2', nota: null, max: null }, { nombre: 'Test 2', nota: 5, max: 10, notaTexto: '5/10' }] }];
const nuevo = [{ sigla: 'brs', filas: [{ nombre: 'Test 1', nota: 7, max: 10, notaTexto: '7/10' }, { nombre: 'Práctica 2', nota: 9, max: 10, notaTexto: '9/10' }, { nombre: 'Test 2', nota: 6, max: 10, notaTexto: '6/10' }, { nombre: 'Test 3', nota: 8, max: 10, notaTexto: '8/10' }] }, { sigla: 'inc', filas: [{ nombre: 'Juego 1', nota: 10, max: 10, notaTexto: '10/10' }] }];
const cb = B._cambiosNotas(prev, nuevo); t('avisa de la nota que salió (null → valor)', cb.some(c => c.nombre === 'Práctica 2' && c.tipo === 'nueva' && c.notaTexto === '9/10'));
t('avisa de la que cambió, con la anterior', cb.some(c => c.nombre === 'Test 2' && c.tipo === 'cambiada' && c.antes === '5/10')); t('avisa de un elemento nuevo con nota', cb.some(c => c.nombre === 'Test 3' && c.tipo === 'nueva'));
t('no avisa de lo que no cambió ni de cursos que no estaban (punto de partida)', !cb.some(c => c.nombre === 'Test 1') && !cb.some(c => c.sigla === 'inc') && cb.length === 3); t('sin lectura anterior no hay avisos', B._cambiosNotas(null, nuevo).length === 0);
console.log('ok',ok,'ko',ko);
// limpieza con filas reales
const L=B._limpiaFilas([{nombre:'Quiz introductorio',estado:'Calificado',fecha:'2026-09-11',nota:null},{nombre:'La calificación está completa.'},{nombre:'Asistencia',estado:'Continuo',nota:100},{nombre:'Test UD-2',estado:'Calificado',nota:7.5},{nombre:'Página'},{nombre:'1'},{nombre:'Página 1 de 1'},{nombre:'de 1'}]);
console.log(JSON.stringify(L.map(x=>x.nombre+(x.completa?'+C':''))));
console.log(L.length===2&&L[0].completa&&L[1].nombre==='Test UD-2'?'limpieza OK':'limpieza FALLA');
