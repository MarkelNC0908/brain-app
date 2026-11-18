const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain en ' + __V + ')'); process.exit(0); }
const http=require('http'),fs=require('fs'),path=require('path');
const A=require('../src/asistente.js');
const V=(__V + '/02-Asignaturas');
const notes=[];
for(const s of fs.readdirSync(V)){const d=path.join(V,s,'apuntes');if(!fs.existsSync(d))continue;for(const f of fs.readdirSync(d)){if(!/\.md$/.test(f))continue;const raw=fs.readFileSync(path.join(d,f),'utf8');const body=raw.replace(/^---[\s\S]*?---\n/,'');const h=body.match(/^#\s+(.+)$/m);notes.push({path:`02-Asignaturas/${s}/apuntes/${f}`,base:f,title:h?h[1]:f,sigla:s.toUpperCase(),body,externo:false,borrador:/NO sale de las diapositivas del profesor/.test(body)});}}
let ok=0,ko=0;const t=(n,c)=>{c?ok++:(ko++,console.log('FALLA',n))};
console.log('apuntes',notes.length);
const ch=A._trocea(notes,'');t('trozos',ch.length>8);console.log('trozos',ch.length,'media',Math.round(ch.reduce((a,c)=>a+c.texto.length,0)/ch.length));
t('filtra sigla',A._trocea(notes,'inc').every(c=>c.sigla==='INC'));
for(const q of ['¿Qué es una inyección SQL ciega?','qué es el hardening con fail2ban','cómo se adquiere una evidencia digital','qué hay en el SSDLC','receta de tortilla de patatas']){const r=A._busca(ch,q);console.log(q,'=>',r.slice(0,3).map(x=>x.sigla+':'+x.titulo+'›'+x.cab).join(' | ')||'(nada)');}
t('tortilla sin contexto',A._busca(ch,'receta de tortilla de patatas').length===0);
t('ctx<=8000',A._busca(ch,'seguridad').reduce((a,c)=>a+c.texto.length,0)<=8000);
// servidor falso
let ultimo=null;
const srv=http.createServer((req,res)=>{
 if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'qwen2.5:7b'},{name:'nomic-embed-text:latest'}]}));return;}
 let b='';req.on('data',x=>b+=x);req.on('end',()=>{ultimo=JSON.parse(b);
  if(ultimo.model==='falta:1b'){res.statusCode=404;res.end(JSON.stringify({error:"model 'falta:1b' not found"}));return;}
  res.write(JSON.stringify({message:{content:'Es una '}})+'\n');
  setTimeout(()=>{res.write(JSON.stringify({message:{content:'técnica [1].'}})+'\n{"done":true}\n');
   if(ultimo.model==='lento:1b'){return;} res.end();},50);});
});
srv.on('error',()=>{console.log('ok 0 ko 0 (omitido: el puerto 11434 está en uso, ¿hay un Ollama real en marcha?)');process.exit(0)});
srv.listen(11434,'127.0.0.1',async()=>{
 const e=await A.estado();t('estado ok',e.ok&&e.modelos.length===1&&e.modelos[0]==='qwen2.5:7b');
 let trozos='';const em=m=>trozos+=m.txt;
 let r=await A.preguntar({id:'1',pregunta:'¿Qué es una inyección SQL ciega?',sigla:'he',modelo:'qwen2.5:7b',historial:[]},notes,em);
 t('respuesta',r.ok&&trozos==='Es una técnica [1].'&&r.fuentes.length>0);
 t('prompt',ultimo.messages[0].role==='system'&&/Fragmentos de mis apuntes/.test(ultimo.messages[1].content)&&ultimo.stream===true&&ultimo.options.num_ctx===8192);
 t('solo HE',r.fuentes.every(f=>f.sigla==='HE'));
 trozos='';r=await A.preguntar({id:'2',pregunta:'receta de tortilla',sigla:'',modelo:'x',historial:[]},notes,em);
 t('sin contexto no llama',r.ok&&r.sinContexto&&/No está en tus apuntes/.test(trozos));
 r=await A.preguntar({id:'3',pregunta:'¿Qué es una inyección SQL ciega?',sigla:'he',modelo:'falta:1b',historial:[]},notes,em);
 t('modelo ausente',!r.ok&&/ollama pull falta:1b/.test(r.msg));
 t('modelo raro cae a defecto',(await A.preguntar({id:'4',pregunta:'inyección SQL ciega',sigla:'he',modelo:'a b;rm',historial:[]},notes,em),ultimo.model==='qwen2.5:7b'));
 // cancelar
 const p=A.preguntar({id:'5',pregunta:'inyección SQL ciega',sigla:'he',modelo:'lento:1b',historial:[]},notes,em);setTimeout(()=>A.cancelar('5'),200);
 r=await p;t('cancelar',r.ok&&r.cancelado);
 srv.close();
 r=await A.estado();t('sin ollama',!r.ok&&r.motivo==='sin-ollama');
 r=await A.preguntar({id:'6',pregunta:'inyección SQL ciega',sigla:'he',modelo:'qwen2.5:7b',historial:[]},notes,em);t('ollama parado',!r.ok&&/Ollama no responde/.test(r.msg));
 console.log('ok',ok,'ko',ko);process.exit(0);
});
