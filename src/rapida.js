// Captura rápida: una idea o un apunte suelto que se guarda sin abrir la app entera. Los apuntes rápidos van a la carpeta de entrada de la asignatura (_entrada en un Brain),
// donde se ingestan después; nunca se sobrescribe nada. (Las dudas no pasan por aquí: las guarda la ventana principal.)
const fs = require('fs');
const path = require('path');
// asig: { sigla, dir }; devuelve { ok, ruta, abs } o { ok:false, msg }
function guardaCaptura({ vault, esBrain, asig, texto, ahora }) {
  const t = String(texto || '').trim().slice(0, 8000); if (t.length < 3) return { ok: false, msg: 'Escribe algo.' };
  const d = ahora || new Date(), p2 = (n) => String(n).padStart(2, '0'), fecha = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, hora = `${p2(d.getHours())}${p2(d.getMinutes())}`;
  const dir = esBrain ? path.join(asig.dir, '_entrada') : asig.dir, raiz = path.resolve(vault);
  if (!path.resolve(dir).startsWith(raiz + path.sep)) return { ok: false, msg: 'Ruta no válida.' };
  fs.mkdirSync(dir, { recursive: true });
  const cuerpo = `# Captura rápida · ${asig.sigla.toUpperCase()} · ${fecha} ${hora.slice(0, 2)}:${hora.slice(2)}\n\n${t}\n`;
  for (let i = 1; i < 100; i++) {
    const f = path.join(dir, `captura-${fecha}-${hora}${i > 1 ? '-' + i : ''}.md`);
    try { fs.writeFileSync(f, cuerpo, { flag: 'wx' }); return { ok: true, abs: f, ruta: path.relative(raiz, f).split(path.sep).join('/') }; } catch (e) { if (e.code !== 'EEXIST') return { ok: false, msg: 'No se pudo guardar: ' + e.message }; }
  }
  return { ok: false, msg: 'Demasiadas capturas en el mismo minuto.' };
}
// Dudas recogidas por la captura rápida mientras la ventana principal no las ha recibido (fichero JSON del perfil)
function anadeDuda(file, d) { let l = []; try { l = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {} if (!Array.isArray(l)) l = []; l.push(d); fs.writeFileSync(file, JSON.stringify(l.slice(-100))); }
function sacaDudas(file) { let l = []; try { l = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {} try { fs.rmSync(file, { force: true }); } catch {} return Array.isArray(l) ? l.filter(x => x && typeof x.texto === 'string') : []; }
module.exports = { guardaCaptura, anadeDuda, sacaDudas };
