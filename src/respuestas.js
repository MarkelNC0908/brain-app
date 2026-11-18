// Buscador de respuestas dentro de los apuntes: sin IA, sin internet y sin instalar nada. Solo enseña lo que ya está escrito en ellos.
//  · definiciones(): para «¿qué es X?» busca la definición exacta («- SIGLA, término: definición» o «- **término**: definición»).
//  · busca(): trozos de apuntes por apartados, puntuados por palabras (BM25 simplificado: lo raro pesa más, el título/apartado cuenta extra).
//  · extracto(): las líneas del trozo que más encajan con la pregunta, para ver la respuesta sin abrir el apunte.
// Es el mismo código en escritorio (renderer y proceso principal) y en el móvil. Va en su propio ámbito para no chocar con los nombres de app.js.
const RESP = (() => {
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const STOP = new Set('que como cual cuales cuando donde quien para por con sin los las del una uno unos unas este esta esto estos estas ese esa eso son ser hay mas muy pero sobre entre desde hasta tambien puede pueden hacer segun tiene tienen cada todo todos toda todas dime explica explicame defineme definicion'.split(' '));
  const stem = (t) => (t.length > 5 ? t.slice(0, 5) : t);
  const toks = (s) => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length > 2 && !STOP.has(t)).map(stem);
  const limpia = (t) => String(t).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1').replace(/\*\*|__|`/g, '').replace(/\s*\[(verificado|pendiente|supuesto)\]/gi, '').trim();
  const etiqueta = (l) => ((String(l).match(/\[(verificado|supuesto|pendiente)\]\s*$/i) || [])[1] || '').toLowerCase();
  const tituloDe = (n) => String(n.title || n.base || '').replace(/^[A-Z]+ · /, '');

  // Trozos de unos 1500 caracteres que respetan los apartados de cada apunte
  function trocea(notes, sigla) {
    const out = [], S = String(sigla || '').toUpperCase();
    for (const n of notes) {
      if (!n || n.externo || !n.body || (S && String(n.sigla).toUpperCase() !== S)) continue;
      let cab = '', buf = '';
      const cierra = () => { const t = buf.trim(); if (t.length > 40) out.push({ path: n.path, titulo: tituloDe(n), sigla: String(n.sigla).toUpperCase(), cab, texto: t, borrador: !!n.borrador }); buf = ''; };
      for (const l of n.body.split('\n')) {
        const h = l.match(/^#{1,4}\s+(.*)$/);
        if (h) { cierra(); cab = h[1].replace(/[*`]/g, '').trim(); continue; }
        if (buf.length > 1500 && l.trim() === '') cierra(); else buf += l + '\n';
        if (buf.length > 2400) cierra();
      }
      cierra();
    }
    return out;
  }
  // Puntuación tipo BM25 simplificada
  function busca(chunks, consulta, k = 6, maxChars = 8000) {
    const q = [...new Set(toks(consulta))]; if (!q.length || !chunks.length) return [];
    const docs = chunks.map(c => { const t = toks(c.texto), tf = new Map(); t.forEach(x => tf.set(x, (tf.get(x) || 0) + 1)); return { c, tf, cab: new Set(toks(c.titulo + ' ' + c.cab)) }; });
    const df = new Map(); for (const d of docs) for (const x of new Set([...d.tf.keys(), ...d.cab])) df.set(x, (df.get(x) || 0) + 1);
    const N = docs.length, sc = docs.map(d => { let s = 0; for (const x of q) { const idf = Math.log(1 + (N - (df.get(x) || 0) + 0.5) / ((df.get(x) || 0) + 0.5)), tf = d.tf.get(x) || 0; if (tf) s += idf * tf / (tf + 1.5); if (d.cab.has(x)) s += idf * 1.5; } return { c: d.c, s }; });
    const out = []; let total = 0;
    for (const x of sc.filter(x => x.s > 0).sort((a, b) => b.s - a.s)) { if (out.length >= k || total + x.c.texto.length > maxChars) continue; out.push(Object.assign({}, x.c, { puntos: x.s })); total += x.c.texto.length; }
    return out;
  }
  // Definiciones exactas: el término de la definición debe estar (casi) entero en la pregunta
  function definiciones(notes, sigla, consulta, k = 3) {
    const Q = new Set(toks(consulta)), S = String(sigla || '').toUpperCase(), out = [];
    if (!Q.size) return out;
    for (const n of notes) {
      if (!n || n.externo || !n.body || (S && String(n.sigla).toUpperCase() !== S)) continue;
      let skip = false;
      for (const l of n.body.split('\n')) {
        if (/^#{1,4}\s/.test(l)) { skip = /^#{1,4}\s*(Dudas|Fuentes|Relaci[oó]n con la evaluaci)/i.test(l); continue; }
        if (skip) continue;
        let m = l.match(/^-\s*[A-Z]{2,4},\s*([^:]{2,90}):\s*(.{20,})$/);
        if (!m) { const g = l.match(/^\s*(?:[-*+]\s+)?(?:\*\*|__)([^*_:\n]{2,60}?)(?:\*\*|__)\s*[:—–]\s*(.{20,})$/) || l.match(/^\s*[-*+]\s+([^:*_\n]{2,60}):\s+(.{20,})$/); if (g && g[1].trim().split(/\s+/).length <= 6) m = g; }
        if (!m) continue;
        const term = limpia(m[1]), def = limpia(m[2]), T = [...new Set(toks(term))]; if (!T.length || term.includes('[')) continue;
        const hit = T.filter(t => Q.has(t)).length, cob = hit / T.length;
        if (!(cob === 1 || (T.length >= 3 && cob >= 0.67))) continue;
        out.push({ term, def, sigla: String(n.sigla).toUpperCase(), titulo: tituloDe(n), path: n.path, tag: etiqueta(l), borrador: !!n.borrador, puntos: T.length * 2 + cob + (T.length === Q.size ? 3 : 0) });
      }
    }
    const vistos = new Set();
    return out.sort((a, b) => b.puntos - a.puntos).filter(d => { const key = norm(d.term) + '|' + norm(d.def).slice(0, 40); if (vistos.has(key)) return false; vistos.add(key); return true; }).slice(0, k);
  }
  // Extracto de un trozo: las líneas que más palabras de la pregunta contienen (en su orden), con «…» entre saltos
  function extracto(texto, consulta, max = 650) {
    const Q = new Set(toks(consulta)), ls = String(texto).split('\n').map(l => l.trim()).filter(Boolean);
    const sc = ls.map(l => toks(l).filter(t => Q.has(t)).length);
    const orden = sc.map((s, i) => [s, i]).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    const idx = new Set(); let tam = 0;
    for (const [, i] of orden) { const t = ls[i].length + 1; if (tam + t > max && idx.size) break; idx.add(i); tam += t; }
    if (!idx.size) { let t = ''; for (const l of ls) { if (t.length + l.length > max) break; t += l + '\n'; idx.add(ls.indexOf(l)); } }
    const sel = [...idx].sort((a, b) => a - b); let prev = -2;
    return sel.map(i => { const pre = i - prev > 1 && prev !== -2 ? '…\n' : ''; prev = i; return pre + limpia(ls[i]).replace(/^[-*+]\s*(?:[A-Z]{2,4},\s*)?/, '• '); }).join('\n').slice(0, max + 40);
  }
  // Trozos de texto con las palabras de la pregunta marcadas: [{t, m}]
  function resalta(texto, consulta) {
    const Q = new Set(toks(consulta)), out = [];
    for (const p of String(texto).split(/(\p{L}[\p{L}\p{N}]*)/u)) { if (!p) continue; const m = /^\p{L}/u.test(p) && Q.has(stem(norm(p).replace(/[^a-z0-9]/g, ''))) && norm(p).length > 2; out.push({ t: p, m: !!m }); }
    return out;
  }
  // Todo junto: { defs, frags } (frags con su extracto ya calculado)
  function responde(notes, sigla, consulta) {
    const q = String(consulta || '').trim().slice(0, 500); if (!toks(q).length) return { defs: [], frags: [] };
    const defs = definiciones(notes, sigla, q), frags = busca(trocea(notes, sigla), q, 5, 20000).map(f => Object.assign(f, { extracto: extracto(f.texto, q) }));
    return { defs, frags };
  }
  return { toks, trocea, busca, definiciones, extracto, resalta, responde };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RESP;
