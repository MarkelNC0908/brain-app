const fs=require('fs'),os=require('os'),path=require('path');
const A=require('../src/asistente.js');
let ok=0,ko=0;const t=(n,c)=>{c?ok++:(ko++,console.log('FALLA',n))};
const notes=[{path:'02-Asignaturas/pps/apuntes/a.md',base:'a',title:'PPS · Hardening',sigla:'PPS',body:'## Hardening de MySQL\n- PPS, Hardening: reducir superficie de ataque quitando servicios, cuentas y permisos innecesarios en el servidor.\n- Paso 0 snapshot de la VM y copia de mysqld.cnf antes de cambiar nada en el servidor.\n',externo:false}];
const kf=path.join(os.tmpdir(),'ia-test-'+Date.now()+'.json');A.init({keyFile:kf});
const enc=new Response('x').body?0:0;
// fetch falso de Google
let llamadas=[],cuerpo=null,cabecera=null,modo='ok',n503=0;
const sse=(partes)=>{const e=new TextEncoder();return {ok:true,status:200,body:(async function*(){for(const p of partes)yield e.encode('data: '+JSON.stringify(p)+'\r\n\r\n');})()};};
A._fetch(async(url,o={})=>{llamadas.push(url);cabecera=o.headers;
 if(url.includes('/models?pageSize=1')){const k=o.headers['x-goog-api-key'];return k==='K'.repeat(25)?{ok:true,status:200,json:async()=>({models:[]})}:{ok:false,status:400,json:async()=>({error:{message:'API key not valid'}})};}
 cuerpo=JSON.parse(o.body);
 if(modo==='503'&&n503++<2)return{ok:false,status:503,json:async()=>({error:{message:'high demand'}})};
 if(modo==='429')return{ok:false,status:429,json:async()=>({error:{message:'quota'}})};
 if(modo==='bloq')return sse([{promptFeedback:{blockReason:'SAFETY'}}]);
 return sse([{candidates:[{content:{parts:[{text:'El hardening '}]}}]},{candidates:[{content:{parts:[{text:'reduce la superficie [1].'}]},finishReason:'STOP'}]}]);
});
(async()=>{
 let e=await A.estado();t('estado sin clave',e.gemini&&e.gemini.clave===false&&Array.isArray(e.gemini.modelos));
 let r=await A.guardarClave('corta');t('formato',!r.ok);
 r=await A.guardarClave('X'.repeat(25));t('clave invalida',!r.ok&&/no acepta/.test(r.msg));
 r=await A.guardarClave('K'.repeat(25));t('clave valida',r.ok&&r.persistente===false);   // sin safeStorage fuera de Electron: solo memoria
 e=await A.estado();t('clave en memoria',e.gemini.clave===true);
 let tr='';const em=m=>tr+=m.txt;
 r=await A.preguntar({id:'1',pregunta:'¿qué es el hardening?',sigla:'',modelo:'gemini-flash-lite-latest',proveedor:'gemini',historial:[]},notes,em);
 t('respuesta',r.ok&&tr==='El hardening reduce la superficie [1].'&&r.fuentes.length>0);
 t('url y cabecera',/models\/gemini-flash-lite-latest:streamGenerateContent\?alt=sse$/.test(llamadas[llamadas.length-1])&&cabecera['x-goog-api-key']==='K'.repeat(25)&&!llamadas.some(u=>u.includes('key=')));
 t('prompt',cuerpo.systemInstruction.parts[0].text.includes('SOLO los fragmentos')&&/Fragmentos de mis apuntes/.test(cuerpo.contents[0].parts[0].text)&&cuerpo.contents[0].role==='user');
 t('historial model',(await A.preguntar({id:'2',pregunta:'hardening',sigla:'',proveedor:'gemini',historial:[{rol:'user',txt:'hola'},{rol:'assistant',txt:'qué tal'}]},notes,em),cuerpo.contents[1].role==='model'));
 modo='503';n503=0;llamadas=[];tr='';
 const t0=Date.now();r=await A.preguntar({id:'3',pregunta:'hardening',sigla:'',proveedor:'gemini',historial:[]},notes,em);
 t('reintenta 503',r.ok&&llamadas.filter(u=>u.includes('stream')).length===3&&Date.now()-t0>=5500&&/gemini-3.5-flash-lite:/.test(llamadas[2]));
 modo='429';r=await A.preguntar({id:'4',pregunta:'hardening',sigla:'',proveedor:'gemini',historial:[]},notes,em);
 t('429 mensaje',!r.ok&&/límite gratuito/.test(r.msg)&&llamadas.filter(u=>u.includes('gemini-3.5-flash-lite:')).length>=1);
 modo='bloq';r=await A.preguntar({id:'5',pregunta:'hardening',sigla:'',proveedor:'gemini',historial:[]},notes,em);
 t('bloqueo',!r.ok&&/SAFETY/.test(r.msg));
 modo='ok';t('modelo raro cae a defecto',(llamadas=[],await A.preguntar({id:'6',pregunta:'hardening',sigla:'',modelo:'x;rm',proveedor:'gemini',historial:[]},notes,em),/gemini-flash-lite-latest:/.test(llamadas[0])));
 A.quitarClave();e=await A.estado();t('quitar',e.gemini.clave===false);
 r=await A.preguntar({id:'7',pregunta:'hardening',sigla:'',proveedor:'gemini',historial:[]},notes,em);t('sin clave',!r.ok&&/Falta la clave/.test(r.msg));
 console.log('ok',ok,'ko',ko);process.exit(0);})();
