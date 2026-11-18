// Modo juego: convierte las viñetas «- SIGLA, Término: definición» de los apuntes en tests y flashcards.
// Todo se calcula en vivo desde los apuntes; el progreso (XP, rachas, dominio) se guarda solo en esta app (localStorage), no en el Brain.
let KEY_ST = 'brain-study-v1';
const nuevoP = () => ({ xp: 0, best: 0, tests: 0, perfect: 0, cards: {}, badges: [] });
let P = nuevoP();
// El progreso es de cada perfil: el perfil «default» (el de antes de existir los perfiles) conserva su clave original
function cargaP(id) { KEY_ST = 'brain-study-v1' + (id && id !== 'default' ? '-' + id : ''); try { P = { ...nuevoP(), ...JSON.parse(localStorage.getItem(KEY_ST) || '{}') }; } catch { P = nuevoP(); } }
cargaP('default');
const saveP = () => { try { localStorage.setItem(KEY_ST, JSON.stringify(P)); } catch {} };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const limpia = (t) => t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1').replace(/\*\*|`/g, '').replace(/\s*\[(verificado|pendiente|supuesto)\]/gi, '').trim();
const corta = (t, n = 150) => { if (t.length <= n) return t; const c = t.slice(0, n), k = Math.max(c.lastIndexOf('; '), c.lastIndexOf('. '), c.lastIndexOf(', ')); return (k > 60 ? c.slice(0, k) : c.slice(0, n - 1)) + '…'; };
const nivel = (xp) => Math.floor(xp / 200) + 1;
const BADGES = { first: ['🎯', 'Primer test'], r5: ['🔥', 'Racha de 5'], r10: ['⚡', 'Racha de 10'], perf: ['🏆', 'Test perfecto'], flash: ['🃏', '20 flashcards dominadas'] };
let cardsCache = null, S = null;

function buildCards() {
  if (cardsCache && cardsCache.n === notes.length) return cardsCache.list;
  const list = [];
  for (const n of notes) {
    let skip = false;
    for (const l of n.body.split('\n')) {
      if (/^#{1,4}\s/.test(l)) { skip = /^#{1,4}\s*(Dudas|Fuentes|Relaci[oó]n con la evaluaci)/i.test(l); continue; }
      if (skip) continue;
      // Formato del Brain («- SIGLA, término: definición») o apuntes corrientes («- **término**: definición», «- Término: definición», «**Término**: definición»)
      let m = l.match(/^-\s*[A-Z]{2,4},\s*([^:]{2,90}):\s*(.{20,})$/);
      if (!m) { const g = l.match(/^\s*(?:[-*+]\s+)?(?:\*\*|__)([^*_:\n]{2,60}?)(?:\*\*|__)\s*[:—–]\s*(.{20,})$/) || l.match(/^\s*[-*+]\s+([^:*_\n]{2,60}):\s+(.{20,})$/); if (g && g[1].trim().split(/\s+/).length <= 6) m = g; }
      if (!m) continue;
      const term = limpia(m[1]), def = limpia(m[2]); if (!term || term.includes('[') || def.length < 20) continue;
      if (/^\d/.test(term) || /^(Ejemplo|Caso|Diapositiva|Fragmento|Lab|Inicio|Estructura|Orden de lectura|Flujo|Fuente|Dato)\b/i.test(term) || /^[`¿(]/.test(m[2].trim())) continue;   // ruido: no es un concepto con definición
      const tag = (l.match(/\[(verificado|supuesto|pendiente)\]\s*$/i) || [])[1];
      list.push({ id: n.path + '|' + term, sigla: sigOf(n).toUpperCase(), path: n.path, apunte: short(n), term, def: corta(def), tag: tag ? tag.toLowerCase() : '' });
    }
  }
  cardsCache = { n: notes.length, list }; return list;
}
const box = (c) => (P.cards[c.id] || {}).b || 0;
// Repaso espaciado: tras cada respuesta la tarjeta vuelve a tocar en 1, 3, 7 o 14 días según su caja (si la fallas, mañana)
const DIAS_REPASO = [0, 1, 3, 7, 14];
const programa = (o) => { o.next = Date.now() + DIAS_REPASO[Math.min(4, o.b || 0)] * 864e5; };
const tocaHoy = (c) => { const o = P.cards[c.id]; return !!(o && o.next && o.next <= Date.now()); };
function repasoPendientes() { try { return buildCards().filter(tocaHoy).length; } catch { return 0; } }
function repasoHoy() {
  if (view !== 'study') showStudy();
  const todas = buildCards(), due = todas.filter(tocaHoy); if (!due.length) { menu(); doc.append(el('div', 'dmsg', 'No tienes tarjetas pendientes de repaso hoy.')); return; }
  const pool = due.length >= 4 ? due : [...due, ...elige(todas.filter(c => !due.includes(c)), 4 - due.length)];
  empezar('flash', pool);
}
const dominada = (c) => box(c) >= 3;
function elige(pool, n) {   // prioriza lo no dominado: 70 % de las preguntas salen de tarjetas con caja < 3
  const dif = shuffle(pool.filter(c => !dominada(c))), ok = shuffle(pool.filter(dominada)), nDif = Math.min(dif.length, Math.ceil(n * 0.7));
  return shuffle([...dif.slice(0, nDif), ...ok.slice(0, n - nDif), ...dif.slice(nDif)]).slice(0, n);
}
function pregunta(c, todas) {
  const tipo = Math.random() < 0.5 ? 'def' : 'term';   // def: elige la definición de un término · term: elige el término de una definición
  const otros = shuffle(todas.filter(o => o.sigla === c.sigla && o.id !== c.id && o.term !== c.term));
  const vistos = new Set([(tipo === 'def' ? c.def : c.term).slice(0, 25)]), dis = [];
  for (const o of otros) { const t = tipo === 'def' ? o.def : o.term; if (vistos.has(t.slice(0, 25))) continue; vistos.add(t.slice(0, 25)); dis.push(t); if (dis.length === 3) break; }
  if (dis.length < 3) return null;
  const ok = tipo === 'def' ? c.def : c.term;
  return { c, tipo, q: tipo === 'def' ? `¿Qué es «${c.term}»?` : `¿A qué concepto corresponde?\n«${c.def}»`, ok, opts: shuffle([ok, ...dis]) };
}

// ---------- pantallas ----------
function showStudy(push = true) {
  view = 'study'; current = null; S = null;
  if (push && hist[hp] !== '@study') { hist = hist.slice(0, hp + 1); hist.push('@study'); hp = hist.length - 1; }
  $('#crumb').textContent = 'Modo juego'; btns(); markOn(); menu();
}
function cabecera() {
  const h = el('div', 'dh'); h.append(el('h1', null, 'Modo juego'));
  const nv = nivel(P.xp), pct = (P.xp % 200) / 2, st = el('div', 'stat');
  st.append(el('b', null, `Nivel ${nv}`), el('div', 'xpbar'), el('span', null, `${P.xp} XP · mejor racha ${P.best}`));
  st.querySelector('.xpbar').append(Object.assign(el('i'), { style: `width:${pct}%` })); h.append(st); doc.append(h);
}
function menu() {
  doc.replaceChildren(); cabecera();
  const todas = buildCards();
  doc.append(el('p', 'dsub', `${todas.length} tarjetas generadas de ${new Set(todas.map(c => c.path)).size} apuntes. Las marcadas «supuesto» vienen de borradores sin material de clase: contrástalas.`));
  // dominio por asignatura
  const g = el('div', 'mast');
  for (const s of Object.keys(NOMBRES)) {
    const cs = todas.filter(c => c.sigla.toLowerCase() === s), d = cs.filter(dominada).length, r = el('div', 'mrow');
    r.style.setProperty('--c', COLOR[s]); const b = el('span', 'bar'); b.append(Object.assign(el('i'), { style: `width:${cs.length ? d / cs.length * 100 : 0}%` }));
    r.append(el('b', null, s.toUpperCase()), b, el('span', null, `${d}/${cs.length} dominadas`)); g.append(r);
  }
  doc.append(el('div', 'dsec', 'Dominio por asignatura'), g);
  if (typeof estadisticasEstudio === 'function') estadisticasEstudio(doc);
  // selección
  doc.append(el('div', 'dsec', 'Elige qué estudiar'));
  const f = el('div', 'sel'), selS = el('select'), selA = el('select');
  selS.append(Object.assign(el('option', null, 'Todas las asignaturas'), { value: '' }), ...Object.keys(NOMBRES).map(s => Object.assign(el('option', null, NOMBRES[s]), { value: s.toUpperCase() })));
  const llenaA = () => { const v = selS.value, aps = [...new Map(todas.filter(c => !v || c.sigla === v).map(c => [c.path, c.apunte])).entries()]; selA.replaceChildren(Object.assign(el('option', null, 'Todos los apuntes'), { value: '' }), ...aps.map(([p, t]) => Object.assign(el('option', null, t), { value: p }))); };
  selS.onchange = llenaA; llenaA(); f.append(selS, selA); doc.append(f);
  const pool = () => todas.filter(c => (!selS.value || c.sigla === selS.value) && (!selA.value || c.path === selA.value));
  const acc = el('div', 'acts2');
  const b = (txt, fn, cls) => { const x = el('button', cls || '', txt); x.onclick = fn; acc.append(x); return x; };
  b('🎮 Test rápido (10)', () => empezar('test', pool()), 'pri');
  b('🃏 Flashcards', () => empezar('flash', pool()));
  { const nd = pool().filter(tocaHoy).length; b(`📆 Repaso de hoy (${nd})`, () => repasoHoy(), nd ? 'pri' : ''); }
  if (typeof showPlan === 'function') b('📅 Plan de examen y simulacro', () => showPlan());
  if (typeof exportaAnki === 'function' && typeof esEscritorio === 'function' && esEscritorio()) { const ba = b('📤 Exportar a Anki', async () => { const r = await exportaAnki(pool()); ba.textContent = r && r.ok ? '✓ Guardado' : r && r.cancelado ? '📤 Exportar a Anki' : '⚠ ' + ((r && r.msg) || 'No se pudo'); }); ba.title = 'Guarda las tarjetas de la selección en un archivo para importarlas en Anki'; }
  b('🔁 Repasar mis fallos', () => empezar('test', pool().filter(c => box(c) === 1)));
  const par = todas.filter(c => c.sigla === 'INC' && /clase[234]-/.test(c.path));
  if (par.length && typeof PROFILE !== 'undefined' && PROFILE && PROFILE.id === 'default') b(`📝 Parcial INC (23 nov): Clases 2-4 · ${par.length}`, () => empezar('test', par));
  doc.append(acc);
  // insignias
  doc.append(el('div', 'dsec', 'Insignias'));
  const bd = el('div', 'badges');
  for (const [k, [e, t]] of Object.entries(BADGES)) { const x = el('span', 'badge' + (P.badges.includes(k) ? ' on' : ''), `${e} ${t}`); bd.append(x); }
  doc.append(bd);
}
function empezar(modo, pool) {
  const todas = buildCards();
  if (pool.length < 4) { menu(); doc.append(el('div', 'dmsg err', 'Hace falta una selección con al menos 4 tarjetas (con pocas definiciones no se pueden montar opciones).')); return; }
  if (modo === 'test') {
    const qs = elige(pool, 10).map(c => pregunta(c, todas)).filter(Boolean);
    if (!qs.length) { menu(); doc.append(el('div', 'dmsg err', 'No hay suficientes tarjetas de la misma asignatura para montar opciones.')); return; }
    S = { modo, qs, i: 0, ok: 0, streak: 0, best: 0, xp: 0, fails: [] }; pintaPregunta();
  } else { S = { modo, qs: elige(pool, 20), i: 0, ok: 0, xp: 0, fails: [], flip: false }; pintaFlash(); }
}
function barra() { const t = el('div', 'dsub', ''); t.textContent = `${S.modo === 'test' ? 'Pregunta' : 'Tarjeta'} ${S.i + 1}/${S.qs.length} · racha ${S.streak || 0} · +${S.xp} XP`; return t; }
function pintaPregunta() {
  const q = S.qs[S.i]; doc.replaceChildren(); cabecera(); doc.append(barra());
  const card = el('div', 'qcard'); card.append(el('div', 'qs', q.q), q.c.tag === 'supuesto' ? el('span', 'tag pe', 'supuesto — contrastar') : el('span', 'tag', q.c.apunte));
  const lst = el('div', 'opts'); S.t0 = Date.now(); S.done = false;
  q.opts.forEach((o, k) => { const bt = el('button', 'opt', `${k + 1}. ${o}`); bt.onclick = () => responde(bt, o, lst, q); lst.append(bt); });
  card.append(lst); doc.append(card);
}
function responde(bt, o, lst, q) {
  if (S.done) return; S.done = true; const ok = o === q.ok, ms = Date.now() - S.t0, id = q.c.id, c = P.cards[id] || { b: 0, s: 0 };
  c.s++; c.b = ok ? Math.min(4, (c.b || 0) + 1) : 1; programa(c); P.cards[id] = c;
  if (ok) { S.ok++; S.streak++; S.best = Math.max(S.best, S.streak); P.best = Math.max(P.best, S.streak); const g = 10 + (S.streak >= 3 ? 5 : 0) + (ms < 8000 ? 5 : 0); S.xp += g; P.xp += g; }
  else { S.streak = 0; S.fails.push(q); }
  [...lst.children].forEach(x => { x.disabled = true; if (x.textContent.slice(3) === q.ok) x.classList.add('good'); });
  if (!ok) bt.classList.add('bad');
  const nx = el('button', 'pri', S.i + 1 < S.qs.length ? 'Siguiente ↵' : 'Ver resultado ↵'); nx.onclick = () => { S.i++; S.i < S.qs.length ? pintaPregunta() : fin(); }; nx.id = 'nx'; const wrap = el('div', 'acts2'); wrap.append(nx); doc.append(wrap); saveP();
  doc.querySelector('.dsub').textContent = `Pregunta ${S.i + 1}/${S.qs.length} · racha ${S.streak} · +${S.xp} XP${ok ? ' ✓' : ' ✗'}`;
}
function pintaFlash() {
  const c = S.qs[S.i]; doc.replaceChildren(); cabecera(); doc.append(barra());
  const card = el('div', 'qcard flip'); card.append(el('div', 'qs', S.flip ? c.def : c.term), c.tag === 'supuesto' ? el('span', 'tag pe', 'supuesto — contrastar') : el('span', 'tag', c.apunte));
  card.onclick = () => { S.flip = !S.flip; pintaFlash(); }; doc.append(card);
  doc.append(el('p', 'dsub', S.flip ? '¿Te la sabías?' : 'Pulsa la tarjeta (o espacio) para ver la definición'));
  if (S.flip) {
    const r = el('div', 'acts2'); const si = el('button', 'pri', '✓ La sabía'), no = el('button', null, '↺ Repasar');
    const sig = (ok) => { const o = P.cards[c.id] || { b: 0, s: 0 }; o.s++; o.b = ok ? Math.min(4, (o.b || 0) + 1) : 1; programa(o); P.cards[c.id] = o; if (ok) { S.ok++; S.xp += 5; P.xp += 5; } else S.fails.push({ c }); saveP(); S.flip = false; S.i++; S.i < S.qs.length ? pintaFlash() : fin(); };
    si.onclick = () => sig(true); no.onclick = () => sig(false); r.append(si, no); doc.append(r);
  }
}
function fin() {
  const n = S.qs.length, gana = [];
  if (S.modo === 'test') { P.tests++; if (S.ok === n) P.perfect++; }
  const da = (k) => { if (!P.badges.includes(k)) { P.badges.push(k); gana.push(k); } };
  if (P.tests >= 1) da('first'); if (P.best >= 5) da('r5'); if (P.best >= 10) da('r10'); if (P.perfect >= 1) da('perf');
  if (Object.values(P.cards).filter(c => c.b >= 3).length >= 20) da('flash');
  saveP(); doc.replaceChildren(); cabecera();
  const r = el('div', 'qcard'); r.append(el('div', 'qs', `${S.ok}/${n} correctas · +${S.xp} XP`), el('p', 'dsub', S.modo === 'test' ? `Mejor racha de la partida: ${S.best}` : 'Flashcards completadas'));
  if (gana.length) r.append(el('p', null, '¡Insignia nueva! ' + gana.map(k => BADGES[k].join(' ')).join(' · ')));
  doc.append(r);
  if (S.fails.length) {
    doc.append(el('div', 'dsec', 'Para repasar'));
    for (const f of S.fails) { const c = f.c, row = el('div', 'avrow'); row.append(el('span', 'd', c.sigla), el('span', null, `${c.term}: ${c.def}`)); doc.append(row); }
  }
  const a = el('div', 'acts2'); const o = el('button', 'pri', 'Otra partida'), m = el('button', null, 'Menú');
  o.onclick = () => menu(); m.onclick = () => menu(); a.append(o, m); doc.append(a); S = null;
}
// Atajos de teclado: 1-4 responder · Enter siguiente · espacio girar tarjeta
document.addEventListener('keydown', (e) => {
  if (view !== 'study' || !S || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (S.modo === 'test') {
    const opts = [...doc.querySelectorAll('.opt')];
    if (/^[1-4]$/.test(e.key) && !S.done && opts[+e.key - 1]) opts[+e.key - 1].click();
    else if (e.key === 'Enter' && S.done) { const nx = $('#nx'); if (nx) nx.click(); }
  } else if (e.key === ' ') { e.preventDefault(); const c = doc.querySelector('.qcard'); if (c) c.click(); }
});
$('#sbtn').onclick = () => showStudy();
