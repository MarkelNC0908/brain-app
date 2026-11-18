const A=require('../src/asistente.js');
let ok=0,ko=0;const t=(n,c)=>{c?ok++:(ko++,console.log('FALLA',n))};
const T=A._leeTest;
t('json valido',T('{"preguntas":[{"pregunta":"¿Qué es X?","opciones":["a","b","c","d"],"correcta":2,"explicacion":"porque"}]}').length===1);
t('con fences',T('```json\n[{"pregunta":"p","opciones":["a","b","c"],"correcta":"1"}]\n```')[0].correcta===1);
t('correcta fuera',T('{"preguntas":[{"pregunta":"p","opciones":["a","b","c","d"],"correcta":7}]}')===null);
t('basura',T('hola')===null&&T('{"x":1}')===null);
t('descarta malas y deja buenas',T('{"preguntas":[{"pregunta":"","opciones":["a","b","c"],"correcta":0},{"pregunta":"ok","opciones":["a","b"],"correcta":0},{"pregunta":"ok","opciones":["a","b","c"],"correcta":0}]}').length===1);
let usado=null;A._fetch(async(u,o)=>{usado={u,b:JSON.parse(o.body)};
 if(u.includes('11434'))return{ok:true,status:200,json:async()=>({message:{content:'{"preguntas":[{"pregunta":"q","opciones":["a","b","c","d"],"correcta":1}]}'}})};
 return{ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'Hola profe, ¿podría revisar mi práctica? Gracias.'}]}}]})};});
A.init({keyFile:null});
(async()=>{
 let r=await A.tarea({tipo:'test',texto:'x'.repeat(200),proveedor:'ollama'});t('test ollama',r.ok&&r.preguntas.length===1&&usado.b.format==='json'&&usado.b.stream===false);
 r=await A.tarea({tipo:'resumen',texto:'x'.repeat(200),proveedor:'ollama'});t('resumen usa texto',r.ok===false||r.texto!==undefined);
 r=await A.tarea({tipo:'mensaje',texto:'pedir prórroga de la práctica 2',proveedor:'gemini'});t('gemini sin clave',!r.ok&&/Falta la clave/.test(r.msg));
 r=await A.tarea({tipo:'nada',texto:'x'});t('tipo invalido',!r.ok);
 r=await A.tarea({tipo:'resumen',texto:'corto',proveedor:'ollama'});t('muy corto',!r.ok&&/corto/.test(r.msg));
 // gemini con clave en memoria
 A._fetch(async(u,o)=>{usado={u,b:o.body?JSON.parse(o.body):null,h:o.headers};if(u.includes('pageSize'))return{ok:true,status:200,json:async()=>({})};return{ok:true,status:200,json:async()=>({candidates:[{content:{parts:[{text:'Borrador del mensaje'}]}}]})};});
 await A.guardarClave('K'.repeat(25));
 r=await A.tarea({tipo:'mensaje',texto:'pedir prórroga de la práctica 2',proveedor:'gemini'});t('gemini mensaje',r.ok&&r.texto==='Borrador del mensaje'&&/generateContent$/.test(usado.u)&&usado.h['x-goog-api-key']==='K'.repeat(25)&&!usado.b.generationConfig.responseMimeType);
 r=await A.tarea({tipo:'test',texto:'x'.repeat(200),proveedor:'gemini'});t('gemini test pide JSON',usado.b.generationConfig.responseMimeType==='application/json');
 console.log('ok',ok,'ko',ko);process.exit(0)})();
