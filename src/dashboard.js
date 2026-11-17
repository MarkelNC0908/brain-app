// Dashboard nativo: calcula estado de entregas y notas leyendo fichas y notas de entregas del Brain (solo lectura).
// Fuente de verdad: 02-Asignaturas/<sigla>/<sigla>.md (sección «Entregas y exámenes» y, en BRS, «Fechas») y entregas/*.md.
let fs = null, path = null;
try { fs = require('fs'); path = require('path'); } catch {}
let L = null; try { L = require('./layout'); } catch {}   // solo en el escritorio: sabe dónde están las asignaturas de cada carpeta
const RE_APUNTE = /\.(md|markdown|txt)$/i;   // en el WebView del móvil no hay Node: build() usa el lector `io` que se le pase

// Las asignaturas son las carpetas de 02-Asignaturas con su ficha <sigla>/<sigla>.md (cada usuario tiene las suyas)
const hayMd = (io, rel) => io.list(rel).some(f => RE_APUNTE.test(f) && !/^README\.md$/i.test(f));
const listaSiglas = (io) => io.list('').filter(n => /^[a-z0-9_-]{1,12}$/i.test(n) && (io.read(n + '/' + n + '.md') || hayMd(io, n + '/apuntes') || hayMd(io, n + '/entregas'))).map(n => n.toLowerCase());
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const clean = (s) => s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1').replace(/\*\*/g, '').replace(/`/g, '').trim();
const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

function front(txt) {
  const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/); const o = {};
  if (m) for (const l of m[1].split(/\r?\n/)) { const kv = l.match(/^([\w-]+):\s*(.*?)\s*(?:#.*)?$/); if (kv) o[kv[1]] = kv[2].replace(/^["']|["']$/g, ''); }
  return o;
}
function section(txt, heading) {
  const i = txt.search(new RegExp('^## ' + heading, 'mi')); if (i < 0) return [];
  const rest = txt.slice(i).split(/\r?\n/).slice(1); const out = [];
  for (const l of rest) { if (/^## /.test(l)) break; if (l.startsWith('- ')) out.push(l); }
  return out;
}
const num = (s) => parseFloat(s.replace(',', '.'));
function grade(s) {
  const m = s && s.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/);
  return m ? { nota: num(m[1]), max: num(m[2]), texto: `${m[1]}/${m[2]}` } : null;
}
function keys(sigla, date, title) {
  const t = norm(title), k = [`${sigla}|${date}|${t.replace(/\s*\(.*$/, '').slice(0, 14)}`];
  const p = t.match(/practica\s*(\d+)/); if (p) k.push(`${sigla}|${date}|p${p[1]}${/defensa/.test(t) ? 'd' : ''}`);
  return k;
}
function estadoDeTexto(r) {
  const l = norm(r);
  const g = grade(r.match(/calificad[oa]\s+(?:como\s+)?[^;.—]*/i) ? r.slice(r.search(/calificad[oa]/i)) : '');
  if (g) return { col: 'done', g };
  if (/calificad[oa] como completa|completa\b/.test(l) && !/incompleta/.test(l)) return { col: 'done', g: null };
  if (/pendiente de entregar|sin entregar|por entregar|pendiente de entrega/.test(l)) return { col: 'todo', g: null };
  if (/entregad|completad/.test(l)) return { col: 'sent', g: null };
  return { col: 'todo', g: null };
}

// ---- Lectura flexible: no hace falta seguir el formato de un Brain concreto ----
// Fechas ISO (2026-11-22, con hora opcional) o dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa
function extraeFecha(l) {
  const ok = (y, m, d) => +m >= 1 && +m <= 12 && +d >= 1 && +d <= 31;
  let m = l.match(/(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}:\d{2}))?/);
  if (m && ok(m[1], m[2], m[3])) return { iso: `${m[1]}-${m[2]}-${m[3]}`, hora: m[4] || '', resto: l.replace(m[0], ' '), pos: m.index };
  m = l.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b(?:\s+(\d{1,2}:\d{2}))?/);
  if (m && ok(m[3], m[2], m[1])) return { iso: `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`, hora: m[4] || '', resto: l.replace(m[0], ' '), pos: m.index };
  return null;
}
// «- [ ] Entregar práctica 2 (2026-11-22)», «- 22/11/2026: Examen», «- BRS, 2026-11-22: Entrega…» → {titulo, fecha, hora, col, g}
function lineaGenerica(l) {
  const cb = l.match(/^\s*-\s*\[( |x|X)\]\s*/); let t = cb ? l.slice(cb[0].length) : l.replace(/^\s*-\s*/, '');
  if (!cb && !/^\s*-\s/.test(l)) return null;
  t = clean(t.replace(/\s*\[(verificado|pendiente|supuesto)\]\s*$/i, '')).replace(/^[A-Z]{2,6},\s*/, '');
  const f = extraeFecha(t); if (!f) return null;
  // Descarta frases descriptivas («…publicado a 2026-10-19: ninguna», listas con varias fechas): la fecha debe encabezar la línea, cerrarla o ir entre paréntesis
  if ((t.match(/\d{4}-\d{2}-\d{2}|\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4}\b/g) || []).length > 1) return null;
  if (!(f.pos <= 25 || t.length - f.pos < 28 || /\([^)]*\d[^)]*\)\s*$/.test(t))) return null;
  let titulo = f.resto.split(/\s+[—→]\s+/)[0].split(';')[0].replace(/\(\s*\)/g, '').replace(/^[\s:,\-–—·()\[\]]+|[\s:,\-–—·()\[\]]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  if ((titulo.match(/\(/g) || []).length > (titulo.match(/\)/g) || []).length) titulo += ')';
  if (titulo.length < 3 || /^(ninguna|ninguno|sin\b|no hay|publicad[oa]s?\b|contenido\b|sesiones\b)/i.test(titulo) || /ninguna publicada/i.test(titulo)) return null; titulo = titulo.slice(0, 120);
  const e = cb ? { col: cb[1] === ' ' ? 'todo' : 'sent', g: null } : estadoDeTexto(f.resto);
  return { titulo, fecha: f.iso, hora: f.hora, col: e.col, g: e.g };
}
// Líneas de viñeta de todas las secciones cuyo encabezado (##/###) encaje con la expresión
function seccionesRe(txt, re) {
  const out = []; let dentro = false;
  for (const l of txt.split(/\r?\n/)) { const h = l.match(/^#{2,3}\s+(.*)$/); if (h) { dentro = re.test(h[1]); continue; } if (dentro && /^\s*-\s/.test(l)) out.push(l); }
  return out;
}
const RE_ENTREGAS = /^(Entregas|Ex[aá]menes|Pruebas|Tareas|Trabajos|Pr[aá]cticas)/i, RE_CALENDARIO = /^(Fechas|Calendario|Plazos)/i;

// io = { read(rel) → texto|'' , list(rel) → [nombres] } con rutas relativas a 02-Asignaturas (p. ej. 'brs/brs.md'); por defecto lee del disco
const fsIO = (vault) => (L && !L.esBrain(vault) ? L.carpetaIO(vault) : ({ read: (rel) => read(path.join(vault, '02-Asignaturas', rel)), list: (rel) => { try { return fs.readdirSync(path.join(vault, '02-Asignaturas', rel)); } catch { return []; } } }));
function build(vault, hoy, io) {
  io = io || fsIO(vault);
  const items = []; const seen = new Set(); const updates = []; const errores = [];
  const add = (it) => { const ks = keys(it.sigla, it.fecha || '', it.titulo); if (ks.some(k => seen.has(k))) return false; ks.forEach(k => seen.add(k)); items.push(it); return true; };

  const SIG = listaSiglas(io), libre = !!(L && vault && !L.esBrain(vault));   // carpeta libre: sin fichas ni entregas, las fechas están en los propios apuntes
  for (const s of SIG) {
    const S = s.toUpperCase();
    // 1) Notas de entregas (estructuradas)
    const files = io.list(s + '/entregas').filter(f => f.endsWith('.md') && f !== 'README.md');
    for (const f of files) {
      const t = io.read(s + '/entregas/' + f), fm = front(t);
      if (fm.updated) updates.push(fm.updated);
      if (fm.type !== 'entrega') continue;
      const titulo = clean((fm.title || f).replace(/^[A-Z]+\s*·\s*(Entrega\s*·\s*)?/, ''));
      const st = (fm.status || '').toLowerCase(), g = grade(fm.grade);
      const col = /calific|corregid/.test(st) ? 'done' : /entregad/.test(st) ? 'sent' : /curso/.test(st) ? 'doing' : /pendiente|todo|por-hacer/.test(st) ? 'todo' : (g ? 'done' : 'todo');
      const gg = col === 'done' ? g : null;   // una nota guardada no cuenta si la tarjeta se movió fuera de Corregido
      add({ sigla: S, titulo, fecha: fm.due || null, tipo: fm.kind || '', col, nota: gg ? gg.nota : null, max: gg ? gg.max : null, notaTexto: gg ? gg.texto : '', fuente: `${s}/entregas/${f}` });
    }
    // 2) Líneas de la ficha: formato del Brain de referencia primero y, si no encaja, lectura flexible
    const ficha = io.read(s + '/' + s + '.md'); const ffm = front(ficha); if (ffm.updated) updates.push(ffm.updated);
    const re = /^-\s*([A-Z]+),\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?(?:\s*\([^)]*\))?\s*[:,]\s*(.+)$/;
    const poner = (titulo, fecha, hora, col, g, pts, tipo) => add({ sigla: S, titulo, fecha, hora: hora || '', tipo: tipo || '', col, nota: g ? g.nota : null, max: g ? g.max : null, notaTexto: g ? g.texto : '', puntos: pts || null, fuente: `${s}/${s}.md` });
    for (const l of seccionesRe(ficha, RE_ENTREGAS)) {
      const m = l.match(re);
      if (m) {
        let rest = clean(m[4].replace(/\s*\[(verificado|pendiente|supuesto)\]\s*$/i, ''));
        const head = rest.split(/\s+[—→]\s+/)[0].split(';')[0].replace(/\s*\((?:publicad|visto)[^)]*\)?/i, '').trim();
        const { col, g } = estadoDeTexto(rest);
        const pts = (head.match(/\((\d+)\s*(?:pts?|puntos)\b/i) || [])[1];
        const titulo = head.replace(/\s*\((\d+)\s*(?:pts?|puntos)[^)]*\)/i, '').trim();
        const plural = /completados|entregados/.test(norm(rest)) && /,| y /.test(titulo);
        for (const n of (plural ? titulo.split(/,\s*|\s+y\s+/).filter(Boolean) : [titulo])) poner(n, m[2], m[3], col, g, pts ? +pts : null);
      } else { const g2 = lineaGenerica(l); if (g2) poner(g2.titulo, g2.fecha, g2.hora, g2.col, g2.g); }
    }
    // Calendario de la ficha (Fechas, Calendario, Plazos): solo lo que aún no ha pasado
    for (const l of seccionesRe(ficha, RE_CALENDARIO)) { const g2 = lineaGenerica(l); if (g2 && g2.fecha >= hoy) poner(g2.titulo, g2.fecha, g2.hora, 'todo', null, null, 'calendario'); }
    // 3) Tareas con casilla y fecha dentro de los apuntes: «- [ ] Repasar tema 3 (2026-12-01)»
    for (const f of io.list(s + '/apuntes').filter(f => RE_APUNTE.test(f) && !/^README\.md$/i.test(f))) {
      for (const l of io.read(s + '/apuntes/' + f).split(/\r?\n/)) { if (!libre && !/^\s*-\s*\[( |x|X)\]/.test(l)) continue; const g2 = lineaGenerica(l); if (g2 && (libre || g2.fecha)) add({ sigla: S, titulo: g2.titulo, fecha: g2.fecha, hora: g2.hora, tipo: 'tarea', col: g2.col, nota: null, max: null, notaTexto: '', fuente: `${s}/apuntes/${f}` }); }
    }
  }
  // 4) Resumen del contenido de cada asignatura (siempre disponible, haya o no entregas)
  const contenido = SIG.map(s => {
    const S = s.toUpperCase(), fichaTxt = io.read(s + '/' + s + '.md'); let n = 0, palabras = 0, ver = 0, sup = 0, pen = 0, act = '';
    for (const f of io.list(s + '/apuntes').filter(f => RE_APUNTE.test(f) && !/^README\.md$/i.test(f))) {
      const t = io.read(s + '/apuntes/' + f); n++; palabras += (t.match(/\S+/g) || []).length;
      ver += (t.match(/\[verificado\]/gi) || []).length; sup += (t.match(/\[supuesto\]/gi) || []).length; pen += (t.match(/\[pendiente\]/gi) || []).length;
      const u = front(t).updated; if (u && u > act) act = u;
    }
    const tit = (front(fichaTxt).title || '').trim();
    return { sigla: S, nombre: tit || S, apuntes: n, palabras, verificados: ver, supuestos: sup, pendientes: pen, actualizado: act || null, ficha: !!fichaTxt };
  });
  items.sort((a, b) => (a.fecha || '9999') < (b.fecha || '9999') ? -1 : 1);
  items.forEach((it, i) => { it.id = i + 1; it.vencida = it.col === 'todo' && it.fecha && it.fecha < hoy; });

  const asig = SIG.map(s => {
    const S = s.toUpperCase(), a = items.filter(i => i.sigla === S);
    const notas = a.filter(i => i.nota != null && i.max).map(i => i.nota / i.max * 10);
    const prox = a.filter(i => i.col === 'todo' && i.fecha && i.fecha >= hoy)[0];
    const ct = contenido.find(c => c.sigla === S) || {};
    return { sigla: S, nombre: ct.nombre || S, apuntes: ct.apuntes || 0, actualizado: ct.actualizado || null, total: a.length, entregadas: a.filter(i => i.col === 'sent' || i.col === 'done').length, corregidas: a.filter(i => i.col === 'done').length,
      pendientes: a.filter(i => i.col === 'todo' || i.col === 'doing').length, vencidas: a.filter(i => i.vencida).length,
      notaMedia: notas.length ? +(notas.reduce((x, y) => x + y, 0) / notas.length).toFixed(2) : null, nNotas: notas.length, proxima: prox ? { titulo: prox.titulo, fecha: prox.fecha } : null };
  });
  const ult = updates.filter(Boolean).sort().pop() || null;
  contenido.forEach(c => { if (c.actualizado) updates.push(c.actualizado); });
  const ult2 = updates.filter(Boolean).sort().pop() || null;
  return { items, asig, contenido, ultimaActualizacion: ult2, hoy, generado: new Date().toISOString(), errores };
}

// ---- Escritura: mover una tarjeta de columna y reflejarlo en el Brain ----
const STATUS = { todo: 'pendiente', doing: 'en-curso', sent: 'entregada', done: 'corregida' };
const COLNAME = { todo: 'Por hacer', doing: 'En curso', sent: 'Entregado', done: 'Corregido' };
function setFront(txt, kv) {
  return txt.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (m, body) => {
    let b = body;
    for (const [k, v] of Object.entries(kv)) { const re = new RegExp('^' + k + ':.*$', 'm'); b = re.test(b) ? b.replace(re, `${k}: ${v}`.trimEnd()) : b + `\n${`${k}: ${v}`.trimEnd()}`; }
    return `---\n${b}\n---`;
  });
}
const slug = (t) => norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
function move(vault, card, col, nota, hoy, opts) {
  const s = String(card && card.sigla || '').toLowerCase();
  const base = L ? L.dirAsignatura(vault, s) : null;
  if (!/^[a-z0-9_-]{1,12}$/.test(s) || !base) throw new Error('Asignatura no válida');
  if (!STATUS[col]) throw new Error('Columna no válida');
  if (nota && !/^\d+(?:[.,]\d+)?\/\d+(?:[.,]\d+)?$/.test(nota)) throw new Error('La nota debe tener formato 8,5/10');
  const titulo = String(card.titulo || '').slice(0, 160), fecha = /^\d{4}-\d{2}-\d{2}$/.test(card.fecha || '') ? card.fecha : '';
  if (!titulo) throw new Error('Tarjeta sin título');
  let notePath, created = false;
  const m = String(card.fuente || '').match(new RegExp('^' + s + '/entregas/([\\w.-]+\\.md)$'));
  if (m) {
    notePath = path.join(base, 'entregas', m[1]);
    if (!fs.existsSync(notePath)) throw new Error('No existe la nota de la entrega');
  } else {
    // Tarjeta que solo existe como línea de la ficha: se crea su nota de entrega con la plantilla del Brain
    notePath = path.join(base, 'entregas', `${fecha || 'sin-fecha'}-${slug(titulo)}.md`);
    if (fs.existsSync(notePath)) throw new Error('Ya existe una nota con ese nombre');
    fs.mkdirSync(path.dirname(notePath), { recursive: true });
    const kind = /defensa/i.test(titulo) ? 'defensa' : /test|quiz/i.test(titulo) ? 'test' : /examen|parcial/i.test(titulo) ? 'examen' : /pr[aá]ctica/i.test(titulo) ? 'practica' : 'actividad';
    fs.writeFileSync(notePath, `---\ntype: entrega\nsigla: "${s.toUpperCase()}"\ntitle: "${s.toUpperCase()} · Entrega · ${titulo.replace(/"/g, "'")}"\nkind: ${kind}\ndue: ${fecha}\nweight:\nstatus: pendiente\ngrade:\nupdated: ${hoy}\n---\n## Enunciado (resumen; el original queda en _entrada/ o en el campus)\n- ${s.toUpperCase()}, nota creada desde la app Brain el ${hoy} al mover la tarjeta; el detalle está en [[${s}]] [supuesto]\n`);
    created = true;
  }
  const kv = { status: STATUS[col], updated: hoy }; if (col === 'done' && nota) kv.grade = nota;
  fs.writeFileSync(notePath, setFront(fs.readFileSync(notePath, 'utf8'), kv));
  // Ficha: registro de cambios y marca de estado actual en su línea (para que no se contradigan)
  const fp = path.join(base, s + '.md'); let ficha = read(fp);
  if (ficha) {
    const nn = path.basename(notePath, '.md'), tag = `«${titulo.slice(0, 40)}»`;
    const marca = ` → estado de ${tag}: ${COLNAME[col]}${col === 'done' && nota ? ' ' + nota : ''} (cambiado desde la app, ${hoy}; nota [[${nn}]])`;
    const lines = ficha.split(/\r?\n/); let inSec = false, tocada = false; const t14 = norm(titulo).replace(/\s*\(.*$/, '').slice(0, 14);
    for (let i = 0; i < lines.length && !tocada; i++) {
      if (/^## /.test(lines[i])) inSec = /^## Entregas y ex[aá]menes/i.test(lines[i]);
      else if (inSec && lines[i].startsWith('- ') && norm(lines[i]).includes(t14) && (!fecha || lines[i].includes(fecha))) {
        const tg = lines[i].match(/\s*\[(verificado|pendiente|supuesto)\]\s*$/i); const cuerpo = tg ? lines[i].slice(0, tg.index) : lines[i];
        const prev = new RegExp('\\s*→ estado de ' + tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[^→\\[]*?\\(cambiado desde la app[^)]*\\)');
        lines[i] = cuerpo.replace(prev, '') + marca + (tg ? ' ' + tg[0].trim() : ''); tocada = true;
      }
    }
    ficha = lines.join('\n');
    const regLinea = `- ${hoy} ${tag} ${opts && opts.creada ? 'añadida en' : 'movida a'} ${COLNAME[col]} desde la app Brain${col === 'done' && nota ? ' (nota ' + nota + ')' : ''}\n`;
    ficha = /^## Registro de cambios\r?\n/m.test(ficha) ? ficha.replace(/^## Registro de cambios\r?\n/m, (h) => h + regLinea) : ficha.replace(/\s*$/, '\n\n## Registro de cambios\n' + regLinea);   // si la ficha aún no tiene la sección, se crea
    fs.writeFileSync(fp, ficha); 
  }
  return { ok: true, nota: path.relative(vault, notePath), created };
}
// Añadir una entrega desde cero (para quien aún no tiene ninguna en su Brain): crea su nota en entregas/ y lo anota en la ficha
function addEntrega(vault, d, hoy) {
  const titulo = String(d && d.titulo || '').trim(); if (titulo.length < 2) throw new Error('Escribe el título de la entrega');
  const fecha = String(d.fecha || '').trim(); if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('La fecha debe tener formato AAAA-MM-DD');
  return move(vault, { sigla: d.sigla, titulo, fecha, fuente: 'nueva' }, d.col || 'todo', d.nota || '', hoy, { creada: true });
}
if (typeof module !== 'undefined' && module.exports) module.exports = { build, move, addEntrega }; else window.DashboardCore = { build };
