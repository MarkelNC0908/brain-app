const __V = process.env.BRAIN_DIR || require('path').resolve(__dirname, 'fixtures/brain-demo');
if (!require('fs').existsSync(__V + '/02-Asignaturas')) { console.log('ok 0 ko 0 (omitido: no hay Brain en ' + __V + ')'); process.exit(0); }
const fs=require('fs'),path=require('path');const R=require('../src/respuestas.js');
const V=(__V + '/02-Asignaturas');const notes=[];
for(const s of fs.readdirSync(V)){const d=path.join(V,s,'apuntes');if(!fs.existsSync(d))continue;for(const f of fs.readdirSync(d)){if(!/\.md$/.test(f))continue;const raw=fs.readFileSync(path.join(d,f),'utf8');const body=raw.replace(/^---[\s\S]*?---\n/,'');const h=body.match(/^#\s+(.+)$/m);notes.push({path:`02-Asignaturas/${s}/apuntes/${f}`,base:f,title:h?h[1]:f,sigla:s.toUpperCase(),body,externo:false,borrador:/NO sale de las diapositivas del profesor/.test(body)});}}
let ok=0,ko=0;const t=(n,c)=>{c?ok++:(ko++,console.log('FALLA',n))};
for(const q of ['¿Qué es el hardening?','qué es una inyección SQL ciega','cadena de custodia','qué es fail2ban','qué es el SSDLC','receta de tortilla de patatas','¿Qué es XSS?','umbral de asistencia']){
 const r=R.responde(notes,'',q);console.log('\n##',q,'| defs',r.defs.length,'frags',r.frags.length);
 r.defs.slice(0,2).forEach(d=>console.log('  DEF',d.sigla,d.term,'=>',d.def.slice(0,90)));
 r.frags.slice(0,2).forEach(f=>console.log('  FRG',f.sigla,f.titulo,'›',f.cab,'|',f.extracto.replace(/\n/g,' ⏎ ').slice(0,110)));}
t('tortilla vacía',R.responde(notes,'','receta de tortilla de patatas').frags.length===0);
t('def hardening',R.responde(notes,'','¿qué es el hardening?').defs.length>0);
t('filtra sigla',R.responde(notes,'inc','hardening').frags.every(f=>f.sigla==='INC'));
const rs=R.resalta('La inyección SQL ciega usa tiempo','inyección ciega');t('resalta',rs.filter(x=>x.m).map(x=>x.t).join(',')==='inyección,ciega');
t('resalta reconstruye',rs.map(x=>x.t).join('')==='La inyección SQL ciega usa tiempo');
t('vacío',R.responde(notes,'','¿qué es?').frags.length===0);
console.log('ok',ok,'ko',ko);
