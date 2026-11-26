// Mejoras de la 1.0.14 (se carga después de app.js y comparte su ámbito): «Hoy toca» en Inicio, acciones con IA sobre un apunte (resumen y test),
// borrador de mensajes con IA, notas (gráfico y «qué nota necesito»), paleta de búsqueda Cmd/Ctrl+K y exportar a calendario.
// Todo lo que usa IA es opcional (Gemini con tu clave u Ollama local) y solo existe en escritorio; el resto funciona también en el móvil.
const esEscritorio = () => /^(darwin|win32|linux)$/.test(String((window.brain && window.brain.platform) || '').toLowerCase());
let iaEstT = 0;
async function iaCargaEstado(force) {
  if (!window.brain.iaEstado || !esEscritorio()) return iaEst;
  if (!force && iaEst && iaEst.gemini && Date.now() - iaEstT < 60000) return iaEst;
  try { iaEst = await window.brain.iaEstado(); iaEstT = Date.now(); } catch {}
  return iaEst;
}
// Proveedor y modelo elegidos en Preguntar (o el primero disponible)
function iaElige() {
  const provs = iaProveedores(); if (!provs.length) return null;
  const prov = provs.some(p => p[0] === lsGet(IA_PROV)) ? lsGet(IA_PROV) : provs[0][0], k = IA_MODELO + '-' + prov;
  const def = prov === 'gemini' ? iaEst.gemini.defecto : iaEst.ollama.defecto;
  return { prov, modelo: lsGet(k) || def, nombre: prov === 'gemini' ? 'Gemini (Google)' : 'Ollama (local)' };
}
const iaAviso = (p) => (p.prov === 'gemini' ? 'Se envía el texto de este apunte a Google.' : 'Se procesa en tu equipo.');

// ---------- «Hoy toca» (Inicio): clases de hoy, entregas próximas y repaso pendiente ----------
function hoyToca(redibuja) {
  if (view !== 'notes' || current || hist[hp] !== '@home') return;
  let box = $('#hoy'); if (!box) { box = el('div', 'hoy'); box.id = 'hoy'; const lead = doc.querySelector('.lead'); if (lead) lead.after(box); else doc.append(box); }
  if (!redibuja && !hor && typeof cargaHorario === 'function') cargaHorario().then(() => hoyToca(true));
  box.replaceChildren(); const hoy = isoDe(new Date());
  box.append(el('h3', null, '📌 Hoy toca'));
  // clases de hoy
  const d = hor && hor.ok && hor.dias ? hor.dias[hoy] : null, fil = el('div', 'hoy-f');
  if (d && d.bloques) { d.bloques.forEach((b, i) => { if (!b) return; const s = (b.sigla || '').toLowerCase(), c = el('span', 'hoy-c'); c.style.setProperty('--c', COLOR[s] || 'var(--acc)'); c.textContent = `${(hor.franjas && hor.franjas[i]) || 'Bloque ' + (i + 1)} · ${b.sigla}${b.on ? ' (online)' : ''}`; c.onclick = () => NOMBRES[s] && goSubject(s); fil.append(c); }); }
  else if (d && d.festivo) fil.append(el('span', 'dsub', 'Hoy: ' + d.festivo));
  else if (hor && hor.ok) fil.append(el('span', 'dsub', 'Hoy no hay clase en el horario.'));
  if (fil.childNodes.length) box.append(fil);
  // entregas y exámenes de los próximos 7 días
  const prox = (dash && dash.items ? dash.items : []).filter(i => (i.col === 'todo' || i.col === 'doing') && i.fecha && i.tipo !== 'calendario' && i.tipo !== 'tarea' && diasHasta(i.fecha) >= 0 && diasHasta(i.fecha) <= 7).sort((a, b) => a.fecha < b.fecha ? -1 : 1).slice(0, 5);
  for (const i of prox) { const n = diasHasta(i.fecha), r = el('div', 'hoy-e' + (n <= 2 ? ' hot' : '')); r.append(el('span', 'd', n === 0 ? 'HOY' : n === 1 ? 'mañana' : `en ${n} d`), el('span', null, `${i.sigla} · ${i.titulo}`)); r.onclick = () => showAvisos(); box.append(r); }
  if (dash && dash.items && !prox.length) box.append(el('div', 'dsub', 'Sin entregas ni exámenes en los próximos 7 días.'));
  if (typeof actNueva !== 'undefined' && actNueva) { const r = el('div', 'hoy-e'); const ya = lsGet('brain-act-desc-tag') === actNueva.tag && lsGet('brain-act-desc-ruta'); r.append(el('span', 'd', '⬇'), el('span', null, ya ? `Brain ${actNueva.tag} ya está descargada: ⚙ Ajustes → Actualizaciones para instalarla.` : `Hay una versión nueva de Brain (${actNueva.tag}): ⚙ Ajustes → Actualizaciones`)); r.onclick = () => showAjustes(); box.append(r); }
  const nd = typeof dudasPendientes === 'function' ? dudasPendientes() : 0; if (nd) { const r = el('div', 'hoy-e'); r.append(el('span', 'd', '❓'), el('span', null, `${nd} duda${nd > 1 ? 's' : ''} sin resolver`)); r.onclick = () => showDudas(); box.append(r); }
  const exp = typeof planExamenes === 'function' ? planExamenes().find(x => diasHasta(x.fecha) <= 14) : null; if (exp) { const r = el('div', 'hoy-e'); r.append(el('span', 'd', '📅'), el('span', null, `Plan para ${exp.sigla} · ${exp.titulo.slice(0, 40)} (en ${diasHasta(exp.fecha)} d)`)); r.onclick = () => showPlan(); box.append(r); }
  const mh = typeof leePomo === 'function' ? leePomo().filter(z => z.fecha === hoy).reduce((a, z) => a + z.min, 0) : 0; if (mh) box.append(el('div', 'dsub', `⏱ Hoy llevas ${mh} min de estudio.`));
  // repaso espaciado pendiente
  if (typeof repasoPendientes === 'function') { const n = repasoPendientes(); if (n) { const b = el('button', 'pri', `📆 Repaso de hoy (${n} tarjetas)`); b.onclick = () => repasoHoy(); box.append(b); } }
}

// ---------- Acciones con IA sobre un apunte: resumir y test ----------
function apunteAcciones(n) {
  if (n.externo || !n.body) return;
  const w = el('div', 'ap-acc'); w.id = 'ap-acc'; const m = doc.querySelector('.meta'); if (m) m.after(w); else doc.prepend(w);
  const pinta = () => {
    if (current !== n.path || view !== 'notes') return; w.replaceChildren();
    const bd = el('button', null, '❓ Anotar duda'); bd.onclick = () => { if (w.querySelector('.duda-f')) return; const f = el('div', 'duda-f'), i = el('input'), ok = el('button', 'pri', 'Guardar'); i.type = 'text'; i.placeholder = 'Qué no entiendes de este apunte…'; i.maxLength = 300; ok.onclick = () => { if (i.value.trim().length < 3) return; anotaDuda(i.value.trim(), n); f.remove(); bd.textContent = '✓ Duda anotada (' + dudasPendientes() + ' pendientes)'; }; i.onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); ok.click(); } }; f.append(i, ok); w.append(f); i.focus(); }; w.append(bd);
    const p = iaElige();
    if (!p) { if (iaEst && iaEst.gemini) { const a = el('a', 'ia-s', '✨ Resumir este apunte o hacer un test con IA: configura Gemini en Ajustes'); a.onclick = () => showAjustes(); w.append(a); } return; }
    const b1 = el('button', null, '📝 Resumir con IA'), b2 = el('button', null, '🧪 Test con IA'), out = el('div', 'ap-out'); out.id = 'ap-out';
    const corre = async (tipo, b) => {
      b1.disabled = b2.disabled = true; const t0 = b.textContent; b.textContent = 'Pensando…'; out.replaceChildren(el('p', 'dsub', `${p.nombre}: ${iaAviso(p)}`));
      let r; try { r = await window.brain.iaTarea({ tipo, texto: `${n.title}\n\n${n.body}`, proveedor: p.prov, modelo: p.modelo }); } catch (e) { r = { ok: false, msg: String(e.message || e) }; }
      b1.disabled = b2.disabled = false; b.textContent = t0; if (current !== n.path) return; out.replaceChildren();
      if (!r || !r.ok) { out.append(el('div', 'ia-b a err', (r && r.msg) || 'No se pudo')); return; }
      if (tipo === 'resumen') { const bu = el('div', 'ia-b a'), c = el('div', 'ia-t md'); c.innerHTML = iaMd(r.texto); bu.append(c, el('div', 'ia-f', `Resumen generado por ${p.nombre}: contrasta lo importante con el apunte.`), botonGuardarApunte({ titulo: 'Resumen · ' + short(n), cuerpo: r.texto, fuentes: [n.path], sigla: sigOf(n), origen: p.prov === 'gemini' ? 'Gemini' : 'Ollama' })); out.append(bu); }
      else testIA(out, r.preguntas, p);
    };
    b1.onclick = () => corre('resumen', b1); b2.onclick = () => corre('test', b2); w.append(b1, b2, out);
  };
  pinta(); iaCargaEstado().then(pinta);
}
// Test de opción múltiple generado por la IA (se resuelve en pantalla; no guarda progreso)
function testIA(cont, qs, p) {
  let i = 0, ok = 0;
  const pinta = () => {
    cont.replaceChildren();
    if (i >= qs.length) { const r = el('div', 'qcard'); r.append(el('div', 'qs', `${ok}/${qs.length} correctas`), el('p', 'dsub', `Test generado por ${p.nombre} a partir del apunte: puede tener errores, contrasta lo que falles con el apunte.`)); const b = el('button', 'pri', 'Cerrar'); b.onclick = () => cont.replaceChildren(); r.append(b); cont.append(r); return; }
    const q = qs[i], card = el('div', 'qcard'); card.append(el('div', 'dsub', `Pregunta ${i + 1}/${qs.length} · generada por IA`), el('div', 'qs', q.pregunta));
    const lst = el('div', 'opts'); let hecho = false;
    q.opciones.forEach((o, k) => { const bt = el('button', 'opt', `${k + 1}. ${o}`); bt.onclick = () => {
      if (hecho) return; hecho = true; if (k === q.correcta) ok++; [...lst.children].forEach((x, j) => { x.disabled = true; if (j === q.correcta) x.classList.add('good'); }); if (k !== q.correcta) bt.classList.add('bad');
      if (q.explicacion) card.append(el('p', 'dsub', q.explicacion)); const nx = el('button', 'pri', i + 1 < qs.length ? 'Siguiente' : 'Ver resultado'); nx.onclick = () => { i++; pinta(); }; card.append(nx);
    }; lst.append(bt); });
    card.append(lst); cont.append(card);
  };
  pinta();
}

// ---------- Borrador de mensaje con IA (nunca se envía solo: rellena el cuadro de texto y lo revisas tú) ----------
function borradorIA(ta, N, refresca) {
  const w = el('div', 'msg-ia'); if (!esEscritorio()) return w;
  const pinta = () => {
    w.replaceChildren(); const p = iaElige();
    if (!p) { if (iaEst && iaEst.gemini) { const a = el('a', 'ia-s', '✨ ¿Quieres un borrador hecho con IA? Configura Gemini en Ajustes'); a.onclick = () => showAjustes(); w.append(a); } return; }
    const inp = el('input'); inp.type = 'text'; inp.placeholder = 'Qué quieres decir (ej.: pedir una prórroga de la práctica 2 por enfermedad)'; inp.maxLength = 300; inp.value = N.idea || ''; inp.oninput = () => { N.idea = inp.value; };
    const b = el('button', null, '✨ Borrador con IA'), av = el('span', 'dsub', `${p.nombre}: se envía solo esta frase, no tus apuntes.`);
    b.onclick = async () => {
      const idea = inp.value.trim(); if (idea.length < 5) { av.textContent = 'Escribe qué quieres decir.'; return; }
      b.disabled = true; b.textContent = 'Pensando…'; let r; try { r = await window.brain.iaTarea({ tipo: 'mensaje', texto: idea, proveedor: p.prov, modelo: p.modelo }); } catch (e) { r = { ok: false, msg: String(e.message || e) }; }
      b.disabled = false; b.textContent = '✨ Borrador con IA';
      if (r && r.ok) { ta.value = r.texto.slice(0, 5000); N.texto = ta.value; refresca(); av.textContent = 'Borrador puesto en el mensaje: revísalo y cámbialo antes de enviar.'; } else av.textContent = (r && r.msg) || 'No se pudo generar el borrador';
    };
    w.append(inp, b, av);
  };
  pinta(); iaCargaEstado().then(pinta); return w;
}

// ---------- Notas: gráfico de evolución y «qué nota necesito» ----------
function ntGrafico(items) {
  const pts = items.filter(i => i.nota != null && i.max && i.fecha).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)).map(i => ({ y: i.nota / i.max * 10, t: `${i.titulo}: ${i.notaTexto}` }));
  if (pts.length < 2) return null;
  const NS = 'http://www.w3.org/2000/svg', W = 170, H = 44, svg = document.createElementNS(NS, 'svg'), X = (k) => 6 + k * (W - 12) / (pts.length - 1), Y = (v) => H - 4 - v / 10 * (H - 8);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'nt-svg'); svg.setAttribute('width', W); svg.setAttribute('height', H);
  const lin = (x1, y1, x2, y2, cls) => { const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2); l.setAttribute('class', cls); return l; };
  svg.append(lin(0, Y(5), W, Y(5), 'nt-g5'));   // línea del aprobado (5)
  const pl = document.createElementNS(NS, 'polyline'); pl.setAttribute('points', pts.map((p, k) => `${X(k).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')); pl.setAttribute('class', 'nt-line'); svg.append(pl);
  pts.forEach((p, k) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', X(k).toFixed(1)); c.setAttribute('cy', Y(p.y).toFixed(1)); c.setAttribute('r', 2.6); c.setAttribute('class', 'nt-pt ' + ntCls(p.y / 10)); const t = document.createElementNS(NS, 'title'); t.textContent = p.t; c.append(t); svg.append(c); });
  return svg;
}
const kPesos = () => 'brain-pesos' + ((typeof PROFILE !== 'undefined' && PROFILE && PROFILE.id && PROFILE.id !== 'default') ? '-' + PROFILE.id : '');
const leePesos = () => { try { return JSON.parse(localStorage.getItem(kPesos()) || '{}'); } catch { return {}; } };
const guardaPesos = (o) => { try { localStorage.setItem(kPesos(), JSON.stringify(o)); } catch {} };
// Nota final estimada y nota necesaria en lo que queda. Modelo simple: dos grupos con su peso (exámenes/tests y trabajos/prácticas); cada elemento pesa lo mismo dentro de su grupo
function ntCalcula(todos, w, obj) {
  const g = { ex: { s: 0, ok: 0, pend: 0, n: 0 }, tr: { s: 0, ok: 0, pend: 0, n: 0 } };
  for (const i of todos) { if (i.completa) continue; const G = g[ntEsExamen(i) ? 'ex' : 'tr']; G.n++; if (i.nota != null && i.max) { G.ok++; G.s += i.nota / i.max * 10; } else G.pend++; }
  const W = { ex: Math.max(0, +w.ex || 0), tr: Math.max(0, +w.tr || 0) }, act = ['ex', 'tr'].filter(k => g[k].n && W[k]), tot = act.reduce((a, k) => a + W[k], 0); if (!tot) return null;
  const okk = act.filter(k => g[k].ok), den = okk.reduce((a, k) => a + W[k], 0), actual = den ? okk.reduce((a, k) => a + W[k] * g[k].s / g[k].ok, 0) / den : null;
  const A = act.reduce((a, k) => a + W[k] * g[k].pend / g[k].n, 0) / tot, B = act.reduce((a, k) => a + W[k] * g[k].s / g[k].n, 0) / tot, pend = act.reduce((a, k) => a + g[k].pend, 0);
  if (!pend || !A) return { actual, pend: 0, final: B };
  const x = (obj - B) / A; return { actual, pend, x, maxPosible: B + A * 10 };
}
function ntPesosPanel(k, todos) {
  const P = leePesos(), w = P[k] || { ex: 50, tr: 50, obj: 5 }, box = el('div', 'nt-calc'), tit = el('div', 'nt-g'); tit.append(el('span', null, '⚖ Qué nota necesito'));
  const f = el('div', 'nt-pesos'), mk = (lbl, key, max) => { const l = el('label', null, lbl), i = el('input'); i.type = 'number'; i.min = 0; i.max = max; i.step = key === 'obj' ? '0.5' : '5'; i.oninput = () => { w[key] = i.value === '' ? undefined : +i.value; P[k] = w; guardaPesos(P); res(); }; i.value = w[key] === undefined ? '' : w[key]; l.append(i); return l; };   // vacío = valor por defecto (mientras borras para escribir otro)
  f.append(mk('Peso exámenes y tests (%)', 'ex', 100), mk('Peso trabajos y prácticas (%)', 'tr', 100), mk('Quiero sacar (nota final)', 'obj', 10));
  const out = el('div', 'nt-res'), res = () => {
    out.replaceChildren(); const DEF = { ex: 50, tr: 50, obj: 5 }, v = (x) => (w[x] === undefined || Number.isNaN(w[x]) ? DEF[x] : w[x]), we = { ex: v('ex'), tr: v('tr') }, obj = v('obj') || 5, r = ntCalcula(todos, we, obj); if (!r) { out.append(el('p', 'dsub', 'Pon el peso de al menos un grupo que tenga elementos.')); return; }
    if (r.actual != null) out.append(el('p', null, `Nota actual (solo lo calificado, ponderada): ${ntFmt(r.actual)}`));
    if (!r.pend) out.append(el('p', null, `No quedan elementos pendientes: nota final estimada ${ntFmt(r.final)}`));
    else if (r.x <= 0) out.append(el('p', 'nt-okt', `Ya llegas a ${ntFmt(obj)} aunque saques 0 en lo que queda (${r.pend} pendientes).`));
    else if (r.x > 10) out.append(el('p', 'msg-warn', `Ni con un 10 en los ${r.pend} elementos pendientes llegas a ${ntFmt(obj)}: el máximo posible es ${ntFmt(r.maxPosible)}.`));
    else out.append(el('p', null, `Para llegar a ${ntFmt(obj)} necesitas una media de ${ntFmt(r.x)} en los ${r.pend} elementos pendientes.`));
    out.append(el('p', 'dsub', 'Estimación: supone que cada elemento pesa lo mismo dentro de su grupo y los pesos que pongas aquí (se guardan solo en este equipo). Comprueba el reparto real en la guía de la asignatura.'));
  };
  box.append(tit, f, out); res(); return box;
}
function notasExtras(sec, k, todos, h) {
  const gr = ntGrafico(todos); if (gr) h.append(gr);
  const b = el('button', 'nt-btn', '⚖ Qué nota necesito'); let abierto = null;
  const abre = () => { abierto = ntPesosPanel(k, todos); ntAbiertos.add(k); sec.insertBefore(abierto, b.nextSibling);
    abierto.addEventListener('focusout', () => setTimeout(() => { if (ntRedibujar && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.nt-calc'))) { ntRedibujar = false; if (view === 'notas') drawNotas(); } }, 0)); };
  b.onclick = () => { if (abierto) { abierto.remove(); abierto = null; ntAbiertos.delete(k); return; } abre(); };
  sec.append(b); if (ntAbiertos.has(k)) abre();   // el panel sigue abierto aunque la pantalla se redibuje (refrescos de datos, nueva lectura de Blackboard)
}

// ---------- Paleta de búsqueda global (Cmd/Ctrl+K) ----------
let palAbierta = null;
const PANTALLAS = [['Inicio', () => home()], ['Captura rápida', () => window.brain.rapidaAbrir && window.brain.rapidaAbrir()], ['Plan de examen y simulacro', () => showPlan()], ['Dudas', () => showDudas()], ['Dashboard', () => showDash()], ['Estudiar (modo juego)', () => showStudy()], ['Horario', () => showHorario()], ['Notas', () => showNotas()], ['Preguntar a mis apuntes', () => showPreguntar()], ['Mensajes', () => showMensajes()], ['Avisos', () => showAvisos()], ['Ajustes', () => showAjustes()]];
function preguntaRapida(q) { rsQ = q; rsSigla = ''; rsRes = RESP.responde(notes, '', q); rsIA = null; rsPrev = []; showPreguntar(); }
let paletaT = -1e9;
function paleta() {
  const ahora = performance.now(); if (ahora - paletaT < 250) return; paletaT = ahora;   // en Electron el atajo llega por el menú y puede llegar también como tecla: solo cuenta una vez
  if (palAbierta) { palAbierta.remove(); palAbierta = null; return; }
  const ov = el('div', 'pal'), box = el('div', 'pal-box'), inp = el('input'), lst = el('div', 'pal-l'); inp.type = 'text'; inp.placeholder = 'Busca apuntes, definiciones, notas, enlaces o pantallas…'; inp.autocomplete = 'off'; inp.spellcheck = false;
  box.append(inp, lst); ov.append(box); document.body.append(ov); palAbierta = ov; inp.focus();
  let items = [], sel = 0;
  const cierra = () => { ov.remove(); palAbierta = null; };
  const pinta = () => { lst.replaceChildren(); items.forEach((it, i) => { const r = el('div', 'pal-i' + (i === sel ? ' on' : '')); r.append(el('span', 'pal-k', it.k), el('span', 'pal-t', it.t)); if (it.s) r.append(el('span', 'pal-s', it.s)); r.onmousedown = (e) => { e.preventDefault(); it.f(); cierra(); }; lst.append(r); }); const on = lst.querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' }); };
  const busca = () => {
    const v = inp.value.trim(), nv = norm(v); items = []; sel = 0;
    if (!v) { PANTALLAS.forEach(([t, f]) => items.push({ k: 'Ir a', t, f })); pinta(); return; }
    items.push({ k: '🔎', t: `Preguntar a mis apuntes: «${v}»`, f: () => preguntaRapida(v) });
    try { for (const d of RESP.definiciones(notes, '', v, 3)) items.push({ k: 'Definición', t: d.term, s: `${d.sigla} · ${d.def.slice(0, 70)}…`, f: () => preguntaRapida(d.term) }); } catch {}
    const ts = nv.split(/\s+/).filter(Boolean);
    for (const n of notes.filter(n => ts.every(t => n.hay.includes(t))).map(n => ({ n, s: ts.reduce((a, t) => a + (norm(n.title).includes(t) ? 5 : 0), 0) })).sort((a, b) => b.s - a.s).slice(0, 7)) items.push({ k: 'Apunte', t: short(n.n), s: NOMBRES[sigOf(n.n)] || sigOf(n.n), f: () => go(n.n.path) });
    try { for (const i of ntItems().filter(i => norm(i.titulo).includes(nv)).slice(0, 4)) items.push({ k: 'Nota', t: i.titulo, s: `${i.sigla}${i.notaTexto ? ' · ' + i.notaTexto : ''}`, f: () => showNotas() }); } catch {}
    if (enlaces && enlaces.lista) for (const e of enlaces.lista.filter(e => norm(e.nombre + ' ' + e.url).includes(nv)).slice(0, 3)) items.push({ k: 'Enlace', t: e.nombre, s: e.url, f: () => window.brain.external(e.url) });
    for (const [t, f] of PANTALLAS.filter(([t]) => norm(t).includes(nv)).slice(0, 3)) items.push({ k: 'Ir a', t, f });
    pinta();
  };
  inp.oninput = busca;
  inp.onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cierra(); } else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); pinta(); } else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); pinta(); }
    else if (e.key === 'Enter' && !e.isComposing && items[sel]) { e.preventDefault(); const f = items[sel].f; cierra(); f(); }
  };
  ov.onmousedown = (e) => { if (e.target === ov) cierra(); };
  if (window.brain.enlacesLista && esEscritorio() && !enlaces) window.brain.enlacesLista().then(r => { if (r && r.ok) { enlaces = r; if (palAbierta) busca(); } }).catch(() => {});
  busca();
}
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'k') { e.preventDefault(); paleta(); } });

// ---------- Exportar entregas y exámenes a un calendario (.ics) — sección de Ajustes ----------
function pintaCalendario() {
  const w = $('#aj-cal'); if (!w) return; w.replaceChildren(); w.append(el('h2', null, '📅 Calendario'));
  if (!esEscritorio()) { w.append(el('p', 'dsub', 'Exportar al calendario solo está en la app de escritorio.')); return; }
  w.append(el('p', 'dsub', 'Crea un archivo .ics con tus entregas y exámenes pendientes (con aviso el día anterior). Ábrelo con Calendario de Apple, Google Calendar u Outlook para tener los recordatorios fuera de la app.'));
  const row = el('div', 'aj-add'), b = el('button', 'pri', 'Exportar entregas y exámenes (.ics)'), av = el('p', 'dsub', ''); b.onclick = async () => {
    b.disabled = true; let r; try { r = await window.brain.icsExportar(); } catch (e) { r = { ok: false, msg: String(e.message || e) }; } b.disabled = false;
    av.textContent = r && r.ok ? `Guardado: ${r.ruta} (${r.n} eventos).` : r && r.cancelado ? '' : (r && r.msg) || 'No se pudo exportar';
  }; row.append(b); w.append(row, av);
}
iaCargaEstado();


// ---------- 1 · Plan hasta el examen y simulacro ----------
// Reparte los apuntes de la asignatura por los días que quedan hasta el examen (dejando los últimos para repasar) y permite hacer un simulacro cronometrado con las tarjetas de esa asignatura.
const kPlan = () => 'brain-plan' + ((typeof PROFILE !== 'undefined' && PROFILE && PROFILE.id && PROFILE.id !== 'default') ? '-' + PROFILE.id : '');
const leePlan = () => { try { return JSON.parse(localStorage.getItem(kPlan()) || '{}'); } catch { return {}; } };
const guardaPlan = (o) => { try { localStorage.setItem(kPlan(), JSON.stringify(o)); } catch {} };
const examKey = (x) => `${x.sigla}|${x.fecha}|${x.titulo}`.slice(0, 160);
function planExamenes() {
  const hoy = isoDe(new Date());
  return (dash && dash.items ? dash.items : []).filter(i => i.fecha && i.fecha >= hoy && (i.col === 'todo' || i.col === 'doing') && i.tipo !== 'calendario' && i.tipo !== 'tarea' && i.titulo.length <= 90 && ntEsExamen(i)).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}
// dias: lista de fechas desde hoy hasta el día antes del examen. Devuelve [{fecha, tareas:[{id,tipo,txt,path?}]}]
function armaPlan(exam, apuntes, hoy) {
  const dias = []; for (let d = hoy; d < exam.fecha && dias.length < 30; d = sumaDias(d, 1)) dias.push(d);
  if (!dias.length) return [];   // el examen es hoy
  const repaso = dias.length >= 5 ? 2 : dias.length >= 2 ? 1 : 0, estudio = dias.slice(0, dias.length - repaso), out = dias.map(f => ({ fecha: f, tareas: [] }));
  const por = estudio.length ? Math.ceil(apuntes.length / estudio.length) : 0;
  apuntes.forEach((n, i) => { const k = estudio.length ? Math.min(estudio.length - 1, Math.floor(i / (por || 1))) : out.length - 1; out[k].tareas.push({ id: `${out[k].fecha}|leer|${n.path}`, tipo: 'leer', txt: 'Leer: ' + short(n), path: n.path }); });
  out.forEach((d, i) => { if (i < out.length - repaso || repaso === 0) d.tareas.push({ id: `${d.fecha}|tarjetas`, tipo: 'tarjetas', txt: 'Repasar tarjetas (10 min)' }); });
  out.slice(out.length - repaso).forEach((d, j, arr) => { d.tareas.push({ id: `${d.fecha}|repaso`, tipo: 'tarjetas', txt: 'Repaso general de tarjetas y de tus fallos' }); if (j === arr.length - 1) d.tareas.push({ id: `${d.fecha}|simulacro`, tipo: 'simulacro', txt: 'Hacer el simulacro y repasar lo que falles' }); });
  if (!out.some(d => d.tareas.some(t => t.tipo === 'simulacro'))) out[out.length - 1].tareas.push({ id: `${out[out.length - 1].fecha}|simulacro`, tipo: 'simulacro', txt: 'Hacer el simulacro y repasar lo que falles' });
  return out;
}
let planSel = '', simAct = null;
function showPlan(push = true) {
  view = 'plan'; current = null; if (simAct) { clearInterval(simAct.t); simAct = null; }
  if (push && hist[hp] !== '@plan') { hist = hist.slice(0, hp + 1); hist.push('@plan'); hp = hist.length - 1; }
  $('#crumb').textContent = 'Plan de examen'; btns(); markOn(); drawPlan(); if (!dash) loadDash();
}
function drawPlan() {
  if (view !== 'plan') return; doc.replaceChildren(); const hoy = isoDe(new Date());
  const head = el('div', 'dh'); head.append(el('h1', null, 'Plan de examen y simulacro')); doc.append(head);
  if (!dash) { doc.append(el('p', 'dsub', 'Calculando…')); return; }
  const exs = planExamenes(); if (!exs.length) { doc.append(el('p', 'dsub', 'No hay exámenes ni tests pendientes con fecha en tu Brain. Cuando haya uno (por ejemplo «parcial» con su fecha en una entrega), podrás montar aquí su plan.')); return; }
  const ex = exs.find(x => examKey(x) === planSel) || exs[0]; planSel = examKey(ex);
  const sel = el('select'); exs.forEach(x => { const o = el('option', null, `${x.fecha} · ${x.sigla} · ${x.titulo.slice(0, 50)}`); o.value = examKey(x); sel.append(o); }); sel.value = planSel; sel.onchange = () => { planSel = sel.value; drawPlan(); };
  const n = diasHasta(ex.fecha), top = el('div', 'pl-top'); top.append(sel, el('span', 'pl-cd' + (n <= 3 ? ' hot' : ''), n === 0 ? '¡Es hoy!' : n === 1 ? 'Mañana' : `Faltan ${n} días`)); doc.append(top);
  const S = ex.sigla.toLowerCase(), disp = notes.filter(x => sigOf(x) === S && !x.externo && x.body && x.body.length > 200), st = leePlan(), est = st[planSel] || (st[planSel] = { hechos: [], excl: [], sims: [] });
  const sel2 = disp.filter(x => !x.borrador && !est.excl.includes(x.path)).concat(disp.filter(x => x.borrador && est.excl.includes('+' + x.path)));   // los borradores sin material de clase no entran salvo que los actives
  // apuntes incluidos
  const det = el('details', 'pl-det'), sm = el('summary', null, `Apuntes incluidos (${sel2.length} de ${disp.length})`); det.append(sm);
  for (const x of disp) { const l = el('label', 'msg-chk'), cb = el('input'); cb.type = 'checkbox'; const inc = x.borrador ? est.excl.includes('+' + x.path) : !est.excl.includes(x.path); cb.checked = inc;
    cb.onchange = () => { const k = x.borrador ? '+' + x.path : x.path; est.excl = est.excl.filter(y => y !== k); if (x.borrador ? cb.checked : !cb.checked) est.excl.push(k); guardaPlan(st); drawPlan(); }; l.append(cb, document.createTextNode(' ' + short(x) + (x.borrador ? ' (borrador sin material de clase)' : ''))); det.append(l); }
  doc.append(det);
  const plan = armaPlan(ex, sel2, hoy); const total = plan.reduce((a, d) => a + d.tareas.length, 0), hechas = plan.reduce((a, d) => a + d.tareas.filter(t => est.hechos.includes(t.id)).length, 0);
  const pg = el('div', 'pl-pg'); pg.append(Object.assign(el('i'), { style: `width:${total ? hechas / total * 100 : 0}%` })); doc.append(el('div', 'dsub', `${hechas}/${total} tareas hechas`), pg);
  if (!plan.length) doc.append(el('p', 'dsub', 'El examen es hoy: no hay días para planificar. Haz el simulacro y repasa tus fallos.'));
  for (const d of plan) {
    const f = el('div', 'pl-dia' + (d.fecha === hoy ? ' hoy' : '')); f.append(el('b', null, new Date(d.fecha + 'T00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' }) + (d.fecha === hoy ? ' · hoy' : '')));
    for (const t of d.tareas) {
      const r = el('label', 'pl-t'), cb = el('input'); cb.type = 'checkbox'; cb.checked = est.hechos.includes(t.id); cb.onchange = () => { est.hechos = est.hechos.filter(y => y !== t.id); if (cb.checked) est.hechos.push(t.id); guardaPlan(st); drawPlan(); };
      const tx = el('span', cb.checked ? 'pl-ok' : '', t.txt); if (t.path) { tx.classList.add('ia-s'); tx.onclick = (e) => { e.preventDefault(); go(t.path); }; } else if (t.tipo === 'tarjetas') { tx.classList.add('ia-s'); tx.onclick = (e) => { e.preventDefault(); showStudy(); }; } else if (t.tipo === 'simulacro') { tx.classList.add('ia-s'); tx.onclick = (e) => { e.preventDefault(); simulacro(ex.sigla, planSel); }; }
      r.append(cb, tx); f.append(r);
    }
    doc.append(f);
  }
  doc.append(el('div', 'pl-dia ex', ''), (() => { const r = el('div', 'pl-dia'); r.append(el('b', null, `🎯 ${ex.fecha}: ${ex.titulo}`)); return r; })());
  // simulacro
  const sim = el('div', 'aj-sec'); sim.append(el('h2', null, '📝 Simulacro de examen'));
  const pool = typeof buildCards === 'function' ? buildCards().filter(c => c.sigla === ex.sigla.toUpperCase()) : [];
  sim.append(el('p', 'dsub', pool.length >= 4 ? `Test cronometrado con preguntas de las ${pool.length} tarjetas de ${ex.sigla} (definiciones de tus apuntes). Sin ayudas ni respuestas hasta el final.` : `Hacen falta al menos 4 tarjetas de ${ex.sigla} (definiciones «- ${ex.sigla}, término: definición» en los apuntes) y ahora hay ${pool.length}.`));
  if (est.sims.length) sim.append(el('p', 'dsub', 'Simulacros anteriores: ' + est.sims.slice(-5).map(x => `${x.fecha.slice(5)} ${x.ok}/${x.n}`).join(' · ')));
  const b = el('button', 'pri', 'Empezar simulacro'); b.disabled = pool.length < 4; b.onclick = () => simulacro(ex.sigla, planSel); sim.append(b); doc.append(sim);
}
function simulacro(sigla, clave) {
  if (typeof buildCards !== 'function') return; const todas = buildCards(), pool = todas.filter(c => c.sigla === sigla.toUpperCase());
  const qs = elige(pool, Math.min(20, pool.length)).map(c => pregunta(c, todas)).filter(Boolean); if (qs.length < 3) { drawPlan(); doc.append(el('div', 'dmsg err', 'No hay suficientes tarjetas para montar el simulacro.')); return; }
  const seg = Math.max(300, qs.length * 45); simAct = { qs, resp: new Array(qs.length).fill(null), i: 0, fin: Date.now() + seg * 1000, sigla, clave, t: null };
  simAct.t = setInterval(() => { if (!simAct || view !== 'plan') { clearInterval(simAct && simAct.t); return; } const r = Math.max(0, Math.ceil((simAct.fin - Date.now()) / 1000)), c = $('#sim-t'); if (c) c.textContent = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; if (!r) terminaSim(); }, 500);
  pintaSim();
}
function pintaSim() {
  const S = simAct; if (!S) return; doc.replaceChildren(); const q = S.qs[S.i];
  const top = el('div', 'pl-top'); top.append(el('b', null, `Simulacro · pregunta ${S.i + 1}/${S.qs.length}`), Object.assign(el('span', 'pl-cd'), { id: 'sim-t', textContent: '…' })); doc.append(top);
  const card = el('div', 'qcard'); card.append(el('div', 'qs', q.q)); const lst = el('div', 'opts');
  q.opts.forEach((o, k) => { const bt = el('button', 'opt' + (S.resp[S.i] === o ? ' sel' : ''), `${k + 1}. ${o}`); bt.onclick = () => { S.resp[S.i] = o; pintaSim(); }; lst.append(bt); }); card.append(lst); doc.append(card);
  const nav = el('div', 'acts2'), prev = el('button', null, '‹ Anterior'), nx = el('button', 'pri', S.i + 1 < S.qs.length ? 'Siguiente ›' : 'Terminar'); prev.disabled = S.i === 0; prev.onclick = () => { S.i--; pintaSim(); }; nx.onclick = () => (S.i + 1 < S.qs.length ? (S.i++, pintaSim()) : terminaSim());
  const fin = el('button', null, 'Entregar ya'); fin.onclick = terminaSim; nav.append(prev, nx, fin); doc.append(nav, el('p', 'dsub', `Contestadas: ${S.resp.filter(Boolean).length}/${S.qs.length}`));
  const r = Math.max(0, Math.ceil((S.fin - Date.now()) / 1000)), c = $('#sim-t'); if (c) c.textContent = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
}
function terminaSim() {
  const S = simAct; if (!S) return; clearInterval(S.t); simAct = null; const ok = S.qs.filter((q, i) => S.resp[i] === q.ok).length;
  const st = leePlan(), est = st[S.clave] || (st[S.clave] = { hechos: [], excl: [], sims: [] }); est.sims.push({ fecha: isoDe(new Date()), ok, n: S.qs.length }); est.sims = est.sims.slice(-20); guardaPlan(st);
  if (view !== 'plan') return; doc.replaceChildren(); const pc = Math.round(ok / S.qs.length * 100);
  const r = el('div', 'qcard'); r.append(el('div', 'qs', `${ok}/${S.qs.length} correctas (${pc} %)`), el('p', 'dsub', pc >= 50 ? 'Aprobado en el simulacro.' : 'Por debajo del 50 %: repasa lo que has fallado.')); doc.append(r);
  const mal = S.qs.map((q, i) => ({ q, r: S.resp[i] })).filter(x => x.r !== x.q.ok);
  if (mal.length) { doc.append(el('div', 'dsec', 'Para repasar')); for (const x of mal) { const row = el('div', 'avrow'); row.append(el('span', 'd', x.r ? '✗' : '—'), el('span', null, `${x.q.q.replace(/\n/g, ' ')} → ${x.q.ok}`)); doc.append(row); } }
  const a = el('div', 'acts2'), b = el('button', 'pri', 'Volver al plan'); b.onclick = () => drawPlan(); const o = el('button', null, 'Otro simulacro'); o.onclick = () => simulacro(S.sigla, S.clave); a.append(b, o); doc.append(a);
}


// ---------- 2 · Dudas: las anotas leyendo, y luego las buscas, se las preguntas a la IA o las conviertes en un mensaje al profesor ----------
const kDudas = () => 'brain-dudas' + ((typeof PROFILE !== 'undefined' && PROFILE && PROFILE.id && PROFILE.id !== 'default') ? '-' + PROFILE.id : '');
const leeDudas = () => { try { const l = JSON.parse(localStorage.getItem(kDudas()) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } };
const guardaDudas = (l) => { try { localStorage.setItem(kDudas(), JSON.stringify(l.slice(-200))); } catch {} };
const dudasPendientes = () => leeDudas().filter(d => !d.resuelta).length;
function anotaDuda(texto, n) { const l = leeDudas(); l.push({ id: 'd' + Date.now() + Math.random().toString(36).slice(2, 5), texto: String(texto).slice(0, 300), path: n ? n.path : '', sigla: n ? sigOf(n) : '', titulo: n ? short(n) : '', fecha: isoDe(new Date()), resuelta: false }); guardaDudas(l); }
let dudasVerResueltas = false;
function showDudas(push = true) {
  view = 'dudas'; current = null;
  if (push && hist[hp] !== '@dudas') { hist = hist.slice(0, hp + 1); hist.push('@dudas'); hp = hist.length - 1; }
  $('#crumb').textContent = 'Dudas'; btns(); markOn(); drawDudas(); if (esEscritorio() && window.brain.mensajesState) loadMsgs();
}
function drawDudas() {
  if (view !== 'dudas') return; doc.replaceChildren(); const head = el('div', 'dh'); head.append(el('h1', null, '❓ Dudas')); doc.append(head);
  const todas = leeDudas(), lista = todas.filter(d => dudasVerResueltas || !d.resuelta);
  doc.append(el('p', 'dsub', 'Anota dudas desde un apunte (botón «❓ Anotar duda») o aquí. Después puedes buscar la respuesta en tus apuntes, preguntársela a la IA o convertirla en un mensaje al profesor. Se guardan solo en este equipo.'));
  const f = el('div', 'rs-form'), inp = el('input'), sel = el('select'), add = el('button', 'pri', 'Añadir duda'); inp.type = 'text'; inp.placeholder = 'Escribe una duda…'; inp.maxLength = 300;
  sel.append(Object.assign(el('option', null, 'Sin asignatura'), { value: '' }), ...Object.keys(NOMBRES).map(k => Object.assign(el('option', null, NOMBRES[k]), { value: k })));
  const guarda = () => { if (inp.value.trim().length < 3) return; const l = leeDudas(); l.push({ id: 'd' + Date.now(), texto: inp.value.trim(), path: '', sigla: sel.value, titulo: '', fecha: isoDe(new Date()), resuelta: false }); guardaDudas(l); drawDudas(); };
  add.onclick = guarda; inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); guarda(); } }; f.append(inp, sel, add); doc.append(f);
  const tg = el('label', 'msg-chk'), cb = el('input'); cb.type = 'checkbox'; cb.checked = dudasVerResueltas; cb.onchange = () => { dudasVerResueltas = cb.checked; drawDudas(); }; tg.append(cb, document.createTextNode(` Ver también las resueltas (${todas.filter(d => d.resuelta).length})`)); doc.append(tg);
  if (!lista.length) { doc.append(el('p', 'dsub', todas.length ? 'No quedan dudas pendientes. 🎉' : 'Aún no has anotado ninguna duda.')); return; }
  const grupos = {}; for (const d of lista) (grupos[d.sigla || ''] ||= []).push(d);
  for (const [s, ds] of Object.entries(grupos)) {
    const sec = el('div', 'aj-sec'); sec.append(el('h2', null, s ? (NOMBRES[s] || s.toUpperCase()) : 'Sin asignatura'));
    for (const d of ds) {
      const r = el('div', 'duda' + (d.resuelta ? ' ok' : '')), t = el('div', 'duda-t'); t.append(el('b', null, d.texto)); const sub = el('span', 'nt-s', d.fecha + (d.titulo ? ' · ' : '')); if (d.titulo) { const a = el('a', 'ia-s', d.titulo); a.onclick = () => notes.some(n => n.path === d.path) && go(d.path); sub.append(a); } t.append(sub); r.append(t);
      const ac = el('div', 'duda-a'), b = (txt, fn, cls) => { const x = el('button', cls || '', txt); x.onclick = fn; ac.append(x); return x; };
      if (!d.resuelta) {
        b('🔎 Buscar', () => preguntaRapida(d.texto));
        b('✨ IA', async () => { await iaCargaEstado(); if (!iaElige()) { showAjustes(); return; } preguntaRapida(d.texto); setTimeout(() => { const x = [...doc.querySelectorAll('#rs-ia button')].find(y => /Redactar/.test(y.textContent)); if (x) x.click(); }, 60); });
        const c = esEscritorio() && typeof cursosMsg === 'function' ? cursosMsg().find(c => c.sigla.toLowerCase() === (d.sigla || '').toLowerCase()) : null;
        if (c) b('✉ Al profesor', () => { showMensajes(); abrirNuevo(c.courseId); if (msgNuevo) { msgNuevo.idea = d.texto; drawMensajes(); } });
      }
      b(d.resuelta ? '↺ Reabrir' : '✓ Resuelta', () => { const l = leeDudas(), x = l.find(y => y.id === d.id); if (x) { x.resuelta = !x.resuelta; guardaDudas(l); } drawDudas(); });
      b('🗑', () => { guardaDudas(leeDudas().filter(y => y.id !== d.id)); drawDudas(); }, 'aj-q'); r.append(ac); sec.append(r);
    }
    doc.append(sec);
  }
}


// ---------- 4 · Guardar una respuesta o un resumen de la IA como apunte nuevo (con confirmación) ----------
function botonGuardarApunte(o) {
  const w = el('div', 'gd'); if (!esEscritorio() || !window.brain.notaGuardar) return w;
  const b = el('button', null, '💾 Guardar como apunte'); w.append(b);
  b.onclick = () => {
    b.hidden = true; const f = el('div', 'gd-f'), sel = el('select'), ti = el('input'), ok = el('button', 'pri', 'Crear apunte'), no = el('button', null, 'Cancelar'), av = el('p', 'msg-warn', '');
    Object.keys(NOMBRES).forEach(k => sel.append(Object.assign(el('option', null, NOMBRES[k]), { value: k }))); sel.value = Object.keys(NOMBRES).includes(o.sigla) ? o.sigla : Object.keys(NOMBRES)[0] || '';
    ti.type = 'text'; ti.value = o.titulo; ti.maxLength = 100; ti.placeholder = 'Título del apunte';
    f.append(el('p', 'dsub', 'Se creará un apunte NUEVO (no se toca ningún apunte existente), marcado como borrador y «[supuesto]» porque no sale del material del profesor. Podrás editarlo después.'), sel, ti, el('div', 'acts2'), av);
    f.querySelector('.acts2').append(ok, no);
    no.onclick = () => { f.remove(); b.hidden = false; };
    ok.onclick = async () => {
      ok.disabled = true; let r; try { r = await window.brain.notaGuardar({ sigla: sel.value, titulo: ti.value, cuerpo: o.cuerpo, fuentes: o.fuentes, origen: o.origen }); } catch (e) { r = { ok: false, msg: String(e.message || e) }; }
      if (r && r.ok) { f.replaceChildren(el('p', null, `✓ Guardado en ${r.ruta}`)); } else { ok.disabled = false; av.textContent = (r && r.msg) || 'No se pudo guardar'; }
    };
    w.append(f); ti.focus();
  };
  return w;
}


// ---------- 5 · Temporizador de estudio (pomodoro) por asignatura, con registro de horas y racha ----------
const kPomo = () => 'brain-pomo' + ((typeof PROFILE !== 'undefined' && PROFILE && PROFILE.id && PROFILE.id !== 'default') ? '-' + PROFILE.id : '');
const leePomo = () => { try { const l = JSON.parse(localStorage.getItem(kPomo()) || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } };
const guardaPomo = (l) => { try { localStorage.setItem(kPomo(), JSON.stringify(l.slice(-600))); } catch {} };
let pomoS = { fase: null, sigla: '', min: 25, fin: 0, resto: 0, pausa: false, msg: '' };   // fase: null | 'foco' | 'descanso' | 'fin'
const pomoFmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const pomoResto = () => (pomoS.pausa ? pomoS.resto : Math.max(0, Math.ceil((pomoS.fin - Date.now()) / 1000)));
function pomoInicia(sigla, min, fase) { pomoS = { fase: fase || 'foco', sigla: sigla || '', min, fin: Date.now() + min * 60000, resto: 0, pausa: false, msg: '' }; pintaPomo(); }
function pomoTick() {
  if (!pomoS.fase || pomoS.fase === 'fin' || pomoS.pausa) { actualizaPill(); return; }
  if (pomoResto() > 0) { actualizaPill(); return; }
  if (pomoS.fase === 'foco') { const l = leePomo(); l.push({ fecha: isoDe(new Date()), sigla: pomoS.sigla, min: pomoS.min }); guardaPomo(l); pomoS.msg = `✓ Sesión de ${pomoS.min} min terminada${pomoS.sigla ? ' · ' + pomoS.sigla.toUpperCase() : ''}`; pomoS.fase = 'fin'; pomoAviso('Sesión de estudio terminada', 'Toca descansar 5 minutos.'); }
  else { pomoS.msg = 'Descanso terminado'; pomoS.fase = 'fin'; pomoAviso('Descanso terminado', 'Cuando quieras, otra sesión.'); }
  pintaPomo(); if (view === 'study') { try { menu(); } catch {} } if (view === 'notes' && !current) hoyToca(true);
}
function pomoAviso(t, c) { try { if (typeof Notification !== 'undefined') { const n = () => new Notification(t, { body: c, silent: false }); if (Notification.permission === 'granted') n(); else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => p === 'granted' && n()); } } catch {} }
function actualizaPill() { const p = $('#pomo-pill'); if (!p) return; p.textContent = pomoS.fase === 'foco' || pomoS.fase === 'descanso' ? `${pomoS.fase === 'foco' ? '⏱' : '☕'} ${pomoFmt(pomoResto())}${pomoS.pausa ? ' ⏸' : ''}` : pomoS.fase === 'fin' ? '✓' : '⏱'; p.classList.toggle('run', pomoS.fase === 'foco' || pomoS.fase === 'descanso'); }
let pomoAbierto = false;
function pintaPomo() {
  let w = $('#pomo'); if (!w) { w = el('div', 'pomo'); w.id = 'pomo'; document.body.append(w); }
  w.replaceChildren(); const pill = el('button', 'pomo-pill'); pill.id = 'pomo-pill'; pill.title = 'Temporizador de estudio'; pill.onclick = () => { pomoAbierto = !pomoAbierto; pintaPomo(); }; w.append(pill);
  if (pomoAbierto) {
    const p = el('div', 'pomo-p'); p.append(el('b', null, 'Temporizador de estudio'));
    const sel = el('select'); sel.append(Object.assign(el('option', null, 'Sin asignatura'), { value: '' }), ...Object.keys(NOMBRES).map(k => Object.assign(el('option', null, NOMBRES[k]), { value: k }))); sel.value = pomoS.sigla; sel.onchange = () => { pomoS.sigla = sel.value; };
    if (!pomoS.fase || pomoS.fase === 'fin') {
      if (pomoS.msg) p.append(el('div', 'dsub', pomoS.msg)); p.append(sel); const f = el('div', 'acts2');
      for (const m of [25, 50]) { const b = el('button', 'pri', `▶ ${m} min`); b.onclick = () => pomoInicia(sel.value, m); f.append(b); } const d = el('button', null, '☕ Descanso 5'); d.onclick = () => pomoInicia('', 5, 'descanso'); f.append(d); p.append(f);
    } else {
      p.append(el('div', 'pomo-t', pomoFmt(pomoResto())), el('div', 'dsub', (pomoS.fase === 'foco' ? 'Concentrado' : 'Descanso') + (pomoS.sigla ? ' · ' + pomoS.sigla.toUpperCase() : ''))); const f = el('div', 'acts2');
      const b1 = el('button', null, pomoS.pausa ? '▶ Seguir' : '⏸ Pausa'); b1.onclick = () => { if (pomoS.pausa) { pomoS.fin = Date.now() + pomoS.resto * 1000; pomoS.pausa = false; } else { pomoS.resto = pomoResto(); pomoS.pausa = true; } pintaPomo(); };
      const b2 = el('button', null, '■ Parar'); b2.onclick = () => { pomoS = { fase: null, sigla: pomoS.sigla, min: 25, fin: 0, resto: 0, pausa: false, msg: '' }; pintaPomo(); }; f.append(b1, b2); p.append(f);
    }
    const hoy = isoDe(new Date()), mh = leePomo().filter(x => x.fecha === hoy).reduce((a, x) => a + x.min, 0); p.append(el('div', 'dsub', `Hoy: ${mh} min estudiados`)); w.append(p);
  }
  actualizaPill();
}
// Estadísticas de la última semana por asignatura y racha de días seguidos (se pintan en el menú de Estudiar)
function estadisticasEstudio(cont) {
  const l = leePomo(); if (!l.length) { cont.append(el('div', 'dsec', 'Tiempo de estudio'), el('p', 'dsub', 'Aún no has registrado sesiones: usa el temporizador ⏱ (abajo a la derecha).')); return; }
  const hoy = isoDe(new Date()), desde = sumaDias(hoy, -6), sem = l.filter(x => x.fecha >= desde), porS = {}; for (const x of sem) porS[x.sigla || ''] = (porS[x.sigla || ''] || 0) + x.min;
  const dias = new Set(l.map(x => x.fecha)); let racha = 0; for (let d = dias.has(hoy) ? hoy : sumaDias(hoy, -1); dias.has(d); d = sumaDias(d, -1)) racha++;
  const tot = sem.reduce((a, x) => a + x.min, 0), max = Math.max(...Object.values(porS), 1);
  cont.append(el('div', 'dsec', 'Tiempo de estudio'), el('p', 'dsub', `Últimos 7 días: ${Math.floor(tot / 60)} h ${tot % 60} min · racha de ${racha} día${racha === 1 ? '' : 's'}`));
  const g = el('div', 'mast'); for (const [s, m] of Object.entries(porS).sort((a, b) => b[1] - a[1])) { const r = el('div', 'mrow'); r.style.setProperty('--c', COLOR[s] || 'var(--acc)'); const b = el('span', 'bar'); b.append(Object.assign(el('i'), { style: `width:${m / max * 100}%` })); r.append(el('b', null, (s || 'otras').toUpperCase()), b, el('span', null, `${m} min`)); g.append(r); } cont.append(g);
}
window.addEventListener('load', () => { pintaPomo(); setInterval(pomoTick, 1000); });


// ---------- 6 · El mensaje a medias sobrevive al cierre de la app (se guarda cada pocos segundos en este equipo) ----------
const kBorr = () => 'brain-borrador-msg' + ((typeof PROFILE !== 'undefined' && PROFILE && PROFILE.id && PROFILE.id !== 'default') ? '-' + PROFILE.id : '');
const leeBorrador = () => { try { return JSON.parse(localStorage.getItem(kBorr()) || 'null'); } catch { return null; } };
function guardaBorradorAhora() {
  const N = typeof msgNuevo !== 'undefined' ? msgNuevo : null; if (!N || N.fase !== 'editar') return;
  if (!(N.texto || (N.dest && N.dest.length) || N.idea)) return;
  try { localStorage.setItem(kBorr(), JSON.stringify({ courseId: N.courseId, dest: (N.dest || []).slice(0, 20), texto: String(N.texto || '').slice(0, 5000), copia: !!N.copia, idea: String(N.idea || '').slice(0, 300), guardado: new Date().toISOString() })); } catch {}
}
function borraBorrador() { try { localStorage.removeItem(kBorr()); } catch {} }
function bannerBorrador() {
  const b = leeBorrador(); if (!b || typeof msgNuevo === 'undefined' || msgNuevo || !esEscritorio()) return null;
  const cs = typeof cursosMsg === 'function' ? cursosMsg() : []; if (!cs.length) return null;
  const c = cs.find(x => x.courseId === b.courseId) || cs[0], w = el('div', 'borr'); w.append(el('span', null, `📝 Tienes un mensaje sin enviar (${nombreCursoMsg(c)} · ${(b.texto || '').length} caracteres${b.dest && b.dest.length ? ' · ' + b.dest.length + ' destinatario(s)' : ''}).`));
  const ok = el('button', 'pri', 'Continuar'), no = el('button', null, 'Descartar');
  ok.onclick = () => { msgHilo = null; msgNuevo = { courseId: c.courseId, dest: b.dest || [], texto: b.texto || '', copia: !!b.copia, idea: b.idea || '', fase: 'editar' }; drawMensajes(); };
  no.onclick = () => { borraBorrador(); w.remove(); }; w.append(ok, no); return w;
}
setInterval(guardaBorradorAhora, 3000);


// ---------- 7 · Privacidad: ocultar las notas en pantalla y bloqueo por inactividad ----------
const OCULTAR = 'brain-ocultar-notas', BLOQUEO = 'brain-bloqueo-min';
const notasOcultas = () => lsGet(OCULTAR) === '1';
const aplicaOcultar = () => document.body.classList.toggle('ocultar-notas', notasOcultas());
function botonOcultarNotas() {
  const b = el('button', 'oc-btn', notasOcultas() ? '👁 Mostrar notas' : '🙈 Ocultar notas'); b.title = 'Difumina las notas en pantalla (útil si alguien mira)';
  b.onclick = () => { lsSet(OCULTAR, notasOcultas() ? '0' : '1'); aplicaOcultar(); b.textContent = notasOcultas() ? '👁 Mostrar notas' : '🙈 Ocultar notas'; }; return b;
}
let ultimaActividad = Date.now();
const minBloqueo = () => parseInt(lsGet(BLOQUEO) || '0', 10) || 0;
function bloqueaAhora() {
  if ($('#lock')) return;
  if (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.hasPin && window.brain.profLogout) { window.brain.profLogout(); return; }   // con PIN: vuelve a la pantalla de perfiles, que lo pide
  const o = el('div', 'lock'); o.id = 'lock'; const c = el('div', 'lock-c'); c.append(el('h2', null, '🔒 Bloqueada por inactividad'), el('p', 'dsub', 'Pulsa para volver. (Pon un PIN a tu perfil para que además lo pida.)'));
  const b = el('button', 'pri', 'Continuar'); b.onclick = () => { o.remove(); ultimaActividad = Date.now(); }; c.append(b); o.append(c); document.body.append(o); b.focus();
}
// ahora: marca de tiempo actual (se pasa explícitamente para poder probarlo)
function compruebaBloqueo(ahora) {
  const m = minBloqueo(); if (!m || $('#lock')) return;
  if (typeof pomoS !== 'undefined' && (pomoS.fase === 'foco' || pomoS.fase === 'descanso') && !pomoS.pausa) return;   // con el temporizador en marcha se está estudiando: no se bloquea
  if (ahora - ultimaActividad >= m * 60000) bloqueaAhora();
}
['mousemove', 'keydown', 'mousedown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { ultimaActividad = Date.now(); }, { passive: true }));
setInterval(() => compruebaBloqueo(Date.now()), 15000);
window.addEventListener('load', aplicaOcultar);
function pintaPrivacidad() {
  const w = $('#aj-priv'); if (!w) return; w.replaceChildren(); w.append(el('h2', null, '🔒 Privacidad'));
  const f = el('div', 'aj-add'), sel = el('select'); for (const [v, t] of [['0', 'Nunca'], ['5', 'a los 5 minutos'], ['15', 'a los 15 minutos'], ['30', 'a los 30 minutos']]) sel.append(Object.assign(el('option', null, t), { value: v })); sel.value = String(minBloqueo());
  sel.onchange = () => { lsSet(BLOQUEO, sel.value); ultimaActividad = Date.now(); };
  f.append(el('span', null, 'Bloquear la app sin actividad:'), sel); w.append(f);
  w.append(el('p', 'dsub', (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.hasPin) ? 'Tu perfil tiene PIN: al bloquear, la app vuelve a la pantalla de perfiles y lo pide. (Con el temporizador de estudio en marcha no se bloquea.)' : 'Tu perfil no tiene PIN: el bloqueo solo tapa la pantalla. Pon un PIN en «Editar perfil» para que lo pida de verdad.'));
  const l = el('label', 'msg-chk'), cb = el('input'); cb.type = 'checkbox'; cb.checked = notasOcultas(); cb.onchange = () => { lsSet(OCULTAR, cb.checked ? '1' : '0'); aplicaOcultar(); }; l.append(cb, document.createTextNode(' Ocultar (difuminar) mis notas en pantalla')); w.append(l);
}


// ---------- 8 · Diagnóstico: registro de errores y informe para pedir ayuda (nada se envía; lo copias tú) ----------
let erroresEnviados = 0;
const logVentana = (m) => { try { if (esEscritorio() && window.brain.logError && erroresEnviados++ < 40) window.brain.logError(String(m).slice(0, 1500)); } catch {} };
window.addEventListener('error', (ev) => logVentana(`${ev.message} @ ${String(ev.filename || '').split('/').pop()}:${ev.lineno}:${ev.colno}`));
window.addEventListener('unhandledrejection', (ev) => logVentana('promesa rechazada: ' + ((ev.reason && (ev.reason.stack || ev.reason.message)) || ev.reason)));
function pintaDiagnostico() {
  const w = $('#aj-diag'); if (!w) return; w.replaceChildren(); w.append(el('h2', null, '🩺 Diagnóstico'));
  if (!esEscritorio() || !window.brain.diagInforme) { w.append(el('p', 'dsub', 'El diagnóstico solo está en la app de escritorio.')); return; }
  w.append(el('p', 'dsub', 'Si algo falla, copia el informe y pégalo donde pidas ayuda. Lleva la versión, el sistema y los últimos errores; no lleva claves, mensajes, notas ni apuntes, y no se envía a ningún sitio.'));
  const row = el('div', 'aj-add'), b = el('button', 'pri', 'Copiar informe'), c = el('button', null, 'Abrir carpeta del registro'), av = el('p', 'dsub', ''), det = el('details', 'pl-det'), pre = el('pre', 'diag-pre');
  det.append(el('summary', null, 'Ver lo que se copia'), pre);
  b.onclick = async () => {
    b.disabled = true; let r; try { r = await window.brain.diagInforme(); } catch (e) { r = { ok: false }; } b.disabled = false;
    if (!r || !r.ok) { av.textContent = 'No se pudo generar el informe.'; return; }
    pre.textContent = r.texto; det.open = true;
    try { await navigator.clipboard.writeText(r.texto); av.textContent = '✓ Informe copiado al portapapeles.'; } catch { av.textContent = 'No se pudo copiar solo: selecciona el texto de abajo y cópialo.'; }
  };
  c.onclick = () => window.brain.diagCarpeta(); row.append(b, c); w.append(row, av, det);
}


// ---------- 8b · Registro: qué ha hecho la app (arranque, inicio de sesión, ventanas del campus) y sus errores. Solo en este equipo ----------
const NIVEL_TXT = { info: 'info', aviso: 'aviso', error: 'error' };
const lineaTxt = (l) => `${l.fecha} [${l.nivel}] ${l.tag}: ${l.msg}`;
const horaLog = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
let logFiltro = 'todo';
// Pinta el registro dentro de «w» (la sección de Ajustes o la ventana que se abre desde la pantalla de perfiles)
function pintaRegistro(w) {
  if (!w) return; w.replaceChildren(); w.append(el('h2', null, '📜 Registro'));
  if (!esEscritorio() || !window.brain.logLeer) { w.append(el('p', 'dsub', 'El registro solo está en la app de escritorio.')); return; }
  w.append(el('p', 'dsub', 'Lo que hace la app (arranque, entrar en el perfil, inicio de sesión del campus y las páginas por las que pasa) y los errores. Se guarda solo en este equipo, sin contraseñas, tokens ni parámetros de las direcciones. Si algo no funciona, cópialo y pásaselo a quien te ayude.'));
  const row = el('div', 'aj-add'), sel = el('select'), act = el('button', null, '↻ Actualizar'), cop = el('button', 'pri', 'Copiar'), car = el('button', null, 'Abrir carpeta'), bor = el('button', null, 'Vaciar'), av = el('p', 'dsub', ''), lista = el('div', 'log-lista');
  for (const [v, t] of [['todo', 'Todo'], ['aviso', 'Avisos y errores'], ['error', 'Solo errores']]) sel.append(Object.assign(el('option', null, t), { value: v }));
  sel.value = logFiltro; row.append(sel, act, cop, car, bor); w.append(row, av, lista);
  let lineas = [], seguro = false;
  const filtradas = () => lineas.filter(l => logFiltro === 'todo' || (logFiltro === 'aviso' ? l.nivel !== 'info' : l.nivel === 'error'));
  const dibuja = () => {
    lista.replaceChildren(); const fs = filtradas().slice(-300).reverse();   // lo más reciente arriba
    if (!fs.length) { lista.append(el('p', 'dsub', lineas.length ? 'No hay líneas con este filtro.' : 'El registro está vacío.')); return; }
    for (const l of fs) { const r = el('div', 'log-l ' + (NIVEL_TXT[l.nivel] || 'info')); r.append(el('span', 'log-h', horaLog(l.fecha)), el('span', 'log-n', NIVEL_TXT[l.nivel] || l.nivel), el('span', 'log-t', l.tag), el('span', 'log-m', l.msg)); lista.append(r); }
  };
  const carga = async () => {
    act.disabled = true; let r; try { r = await window.brain.logLeer(); } catch { r = null; } act.disabled = false;
    if (!r || !r.ok) { av.textContent = 'No se pudo leer el registro.'; return; }
    lineas = r.lineas || []; const e = lineas.filter(l => l.nivel === 'error').length;
    av.textContent = `${lineas.length} línea(s) · ${e} error(es) · ${r.ruta}`; dibuja();
  };
  sel.onchange = () => { logFiltro = sel.value; dibuja(); };
  act.onclick = carga;
  cop.onclick = async () => {
    const txt = filtradas().map(lineaTxt).join('\n'); if (!txt) { av.textContent = 'No hay nada que copiar.'; return; }
    try { await navigator.clipboard.writeText(txt); av.textContent = `✓ Copiadas ${filtradas().length} línea(s) al portapapeles.`; } catch { av.textContent = 'No se pudo copiar solo: abre la carpeta y adjunta el fichero brain.log.'; }
  };
  car.onclick = () => window.brain.diagCarpeta && window.brain.diagCarpeta();
  bor.onclick = async () => { if (!seguro) { seguro = true; bor.textContent = '¿Seguro? Pulsa otra vez'; return; } seguro = false; bor.textContent = 'Vaciar'; await window.brain.logBorrar(); carga(); };
  carga();
}
// Desde la pantalla de perfiles (antes de entrar en la app): el mismo registro en una ventana encima
function abreRegistro() {
  const ov = el('div', 'ov arriba'), b = el('div', 'box log-box'), cerrar = el('button', null, 'Cerrar'), cont = el('div');
  b.append(cont, cerrar); ov.append(b); document.body.append(ov); pintaRegistro(cont);
  const fuera = () => { ov.remove(); document.removeEventListener('keydown', esc); }, esc = (e) => { if (e.key === 'Escape') fuera(); };
  cerrar.onclick = fuera; ov.onclick = (e) => { if (e.target === ov) fuera(); }; document.addEventListener('keydown', esc);
}

// ---------- 10 · Actualizaciones: buscar y descargar la versión nueva desde los Releases públicos de GitHub (token opcional para repositorios privados) ----------
let actEst = null, actRes = null, actMsg = '', actProg = null, actDescarga = null, actNueva = null;
const fmtMB = (b) => (b / 1048576).toFixed(b > 1048576 * 10 ? 0 : 1) + ' MB';
if (window.brain.onActProgreso) window.brain.onActProgreso((p) => { actProg = p; const b = $('#act-prog'); if (b) { b.value = p.total ? p.hecho / p.total * 100 : 0; const t = $('#act-prog-t'); if (t) t.textContent = `${fmtMB(p.hecho)} de ${fmtMB(p.total)}`; } });
let actForm = false;
async function pintaActualizar() {
  const w = $('#aj-act'); if (!w) return; w.replaceChildren(); w.append(el('h2', null, '⬇ Actualizaciones'));
  if (!esEscritorio() || !window.brain.actEstado) { w.append(el('p', 'dsub', 'Las actualizaciones solo están en la app de escritorio.')); return; }
  if (!actEst) { try { actEst = await window.brain.actEstado(); } catch { actEst = null; } if (view !== 'ajustes') return; }
  if (!actEst || !actEst.ok) { w.append(el('p', 'dsub', 'No disponible.')); return; }
  w.append(el('p', 'dsub', `Versión instalada: ${actEst.version}. Busca una versión nueva en los Releases de ${actEst.repo} y descarga el .zip de tu sistema (no se instala solo: lo abres tú). El repositorio es público: no hace falta ninguna cuenta ni token.`));
  const fila = el('div', 'aj-add'), b = el('button', 'pri', 'Buscar actualización'), c = el('button', null, actForm ? 'Ocultar opciones' : 'Repositorio y token…'), av = el('p', actMsg ? 'msg-warn' : 'dsub', actMsg || '');
  b.onclick = async () => { b.disabled = true; b.textContent = 'Buscando…'; const r = await window.brain.actBuscar(); actMsg = r && r.ok ? '' : (r && r.msg) || 'No se pudo comprobar'; actRes = r && r.ok ? r : null; actNueva = actRes && actRes.nueva ? actRes : null; pintaActualizar(); };
  c.onclick = () => { actForm = !actForm; pintaActualizar(); }; fila.append(b, c); w.append(fila, av);
  const auto = el('label', 'msg-chk'), cb = el('input'); cb.type = 'checkbox'; cb.checked = lsGet('brain-act-auto') === '1'; cb.onchange = () => lsSet('brain-act-auto', cb.checked ? '1' : '0'); auto.append(cb, document.createTextNode(' Comprobar sola una vez al día al abrir la app (hace una consulta a GitHub)')); w.append(auto);
  const dsc = el('label', 'msg-chk'), cd = el('input'); cd.type = 'checkbox'; cd.checked = lsGet('brain-act-desc') === '1'; cd.onchange = () => { lsSet('brain-act-desc', cd.checked ? '1' : '0'); if (cd.checked && !cb.checked) { cb.checked = true; lsSet('brain-act-auto', '1'); } }; dsc.append(cd, document.createTextNode(' …y descargar sola la versión nueva para este sistema (130–190 MB; queda en Descargas y no se instala sola)')); w.append(dsc);
  if (actForm) {
    const f = el('div', 'rs-g'), repo = el('input'), tok = el('input'), ok = el('button', 'pri', 'Guardar y comprobar'), av2 = el('p', 'dsub', 'Cambia el repositorio solo si usas una copia propia. El token es opcional y solo hace falta si ese repositorio es privado (Fine-grained token con «Contents: Read-only»); se guarda cifrado en este equipo.');
    repo.type = 'text'; repo.value = actEst.repo; repo.spellcheck = false; repo.placeholder = 'usuario/repositorio'; tok.type = 'password'; tok.placeholder = actEst.token ? 'Token guardado (déjalo vacío para conservarlo)' : 'Token de GitHub (opcional)'; tok.autocomplete = 'off'; tok.spellcheck = false;
    ok.onclick = async () => { ok.disabled = true; ok.textContent = 'Comprobando…'; const r = await window.brain.actGuardar({ repo: repo.value, token: tok.value }); tok.value = ''; if (r && r.ok) { actEst = await window.brain.actEstado(); actRes = r; actMsg = ''; actForm = false; actNueva = r.nueva ? r : null; } else actMsg = (r && r.msg) || 'No se pudo guardar'; pintaActualizar(); };
    f.append(repo, tok, ok); if (actEst.token) { const q = el('button', null, 'Quitar el token'); q.onclick = async () => { await window.brain.actQuitar(); actEst = await window.brain.actEstado(); pintaActualizar(); }; f.append(q); } f.append(av2); w.append(f);
  }
  if (actRes) {
    const cc = el('div', 'act-r'); cc.append(el('b', null, actRes.nueva ? `🎉 Hay una versión nueva: ${actRes.tag}` : `✓ Estás al día (${actRes.tag})`));
    if (actRes.nueva) {
      if (actRes.notas) cc.append(el('pre', 'diag-pre', actRes.notas));
      if (actRes.asset) {
        const d = el('button', 'pri', actDescarga && !actDescarga.ok && !actDescarga.err ? 'Descargando…' : `Descargar ${actRes.asset.name} (${fmtMB(actRes.asset.size)})`); d.disabled = !!(actDescarga && !actDescarga.ok && !actDescarga.err);
        d.onclick = async () => { actDescarga = {}; actProg = null; pintaActualizar(); const r = await window.brain.actDescargar(actRes.asset); actDescarga = r && r.ok ? { ok: true, r } : { err: (r && r.msg) || 'No se pudo descargar' }; if (r && r.ok) { lsSet('brain-act-desc-tag', actRes.tag); lsSet('brain-act-desc-ruta', r.ruta); } pintaActualizar(); };
        cc.append(d);
        if (actDescarga && !actDescarga.ok && !actDescarga.err) { const pr = el('progress'); pr.id = 'act-prog'; pr.max = 100; pr.value = 0; const tt = el('span', 'dsub', ''); tt.id = 'act-prog-t'; const cn = el('button', null, 'Cancelar'); cn.onclick = () => window.brain.actCancelar(); cc.append(pr, tt, cn); }
        if (actDescarga && actDescarga.err) cc.append(el('p', 'msg-warn', actDescarga.err));
        if (actDescarga && actDescarga.ok) { const r = actDescarga.r; cc.append(el('p', null, `✓ Descargado en ${r.ruta}`), el('p', 'dsub', `sha256 ${r.sha256.slice(0, 16)}…${r.verificado ? ' (coincide con el de GitHub)' : ' (GitHub no dio hash para comparar)'}. Cierra la app, descomprime el .zip y sustituye la aplicación; las apps no están firmadas y el sistema avisará la primera vez.`)); }
      } else cc.append(el('p', 'dsub', 'Esta versión no trae un fichero para tu sistema.'));
    }
    w.append(cc);
  }
  const dl = actDescargada(); if (dl) w.append(bloqueInstalar(dl));
}
// Aviso discreto (en «Hoy toca») si la última comprobación encontró una versión nueva; la comprobación automática es opcional (casilla en Ajustes) y como mucho una vez al día
async function actComprobacionDiaria() {
  if (!esEscritorio() || !window.brain.actEstado) return; const k = 'brain-act-ultima', hoy = isoDe(new Date()); if (lsGet(k) === hoy) return;
  try {
    if (lsGet('brain-act-auto') !== '1') return; const e = await window.brain.actEstado(); if (!e || !e.ok) return; lsSet(k, hoy);
    const r = await window.brain.actBuscar(); if (!r || !r.ok || !r.nueva) return; actNueva = r; actRes = r;
    if (lsGet('brain-act-desc') === '1' && r.asset && lsGet('brain-act-desc-tag') !== r.tag) {   // descarga sola la versión de este sistema (una vez por versión)
      actDescarga = {}; const d = await window.brain.actDescargar(r.asset);
      if (d && d.ok) { lsSet('brain-act-desc-tag', r.tag); lsSet('brain-act-desc-ruta', d.ruta); actDescarga = { ok: true, r: d }; pomoAviso('Brain ' + r.tag + ' descargada', 'Está en tu carpeta Descargas: ábrela cuando quieras actualizar.'); } else actDescarga = { err: (d && d.msg) || 'No se pudo descargar' };
    }
    if (view === 'notes' && !current) hoyToca(true); else if (view === 'ajustes') pintaActualizar();
  } catch {}
}
const cmpVer = (a, b) => { const x = String(a).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0), y = String(b).replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; };
// Versión ya descargada y más nueva que la instalada (si ya se instaló, se olvida)
function actDescargada() {
  const tag = lsGet('brain-act-desc-tag'), ruta = lsGet('brain-act-desc-ruta'); if (!tag || !ruta || !actEst) return null;
  if (cmpVer(tag, actEst.version) <= 0) { lsSet('brain-act-desc-tag', ''); lsSet('brain-act-desc-ruta', ''); lsSet('brain-act-alcerrar', ''); return null; }
  return { tag, ruta };
}
function bloqueInstalar(dl) {
  const w = el('div', 'act-r'); w.append(el('b', null, `⬇ ${dl.tag} descargada`), el('p', 'dsub', `Está en ${dl.ruta}.`));
  const exp = actEst.plataforma !== 'darwin' ? ' (en este sistema es experimental: aún no se ha probado, pero se conserva la versión anterior y se restaura si falla)' : '';
  if (!actEst.puedeInstalar) { w.append(el('p', 'dsub', 'Para este sistema solo hay descarga manual: descomprime el .zip y sustituye la aplicación.')); }
  else if (!actEst.empaquetada) { w.append(el('p', 'dsub', 'Para instalarla sola hay que abrir la aplicación instalada (ahora es una ejecución de desarrollo).')); }
  else {
    const fila = el('div', 'aj-add'), b = el('button', 'pri', 'Instalar y reiniciar'), av = el('p', 'msg-warn', '');
    b.onclick = () => {
      b.hidden = true; const c = el('div', 'gd-f'), si = el('button', 'pri', 'Instalar ahora'), no = el('button', null, 'Cancelar'), ro = el('div', 'acts2');
      c.append(el('p', 'dsub', `Brain se cerrará, se sustituirá por la ${dl.tag} y se volverá a abrir. Se conserva la versión anterior (como «…anterior») hasta comprobar que la nueva se copió bien; si falla, se restaura sola.${exp}`)); ro.append(si, no); c.append(ro, av); w.append(c);
      no.onclick = () => { c.remove(); b.hidden = false; };
      si.onclick = async () => { si.disabled = true; si.textContent = 'Preparando…'; const r = await window.brain.actInstalar(dl.ruta, dl.tag); if (r && r.ok) c.replaceChildren(el('p', null, 'Instalando… la app se cerrará y se abrirá sola en unos segundos.')); else { si.disabled = false; si.textContent = 'Instalar ahora'; av.textContent = (r && r.msg) || 'No se pudo instalar'; } };
    };
    fila.append(b); const al = el('label', 'msg-chk'), cb = el('input'); cb.type = 'checkbox'; cb.checked = lsGet('brain-act-alcerrar') === dl.tag;
    cb.onchange = async () => { const r = await window.brain.actInstalarAlCerrar(cb.checked, dl.ruta, dl.tag); if (r && r.ok) lsSet('brain-act-alcerrar', cb.checked ? dl.tag : ''); else { cb.checked = false; av.textContent = (r && r.msg) || 'No se pudo preparar la instalación'; } };
    al.append(cb, document.createTextNode(' Instalarla sola la próxima vez que cierre la app (no la reabre)' + exp)); w.append(fila, al, av);
  }
  const m = el('button', 'aj-q', 'Mostrar el .zip en la carpeta'); m.onclick = () => window.brain.actMostrar(dl.ruta); w.append(m); return w;
}
// Si «instalar al cerrar» estaba activado, se vuelve a preparar al abrir la app (la preparación vive en memoria)
async function rearmaInstalacion() { try { const tag = lsGet('brain-act-alcerrar'), ruta = lsGet('brain-act-desc-ruta'); if (!tag || !ruta || !esEscritorio() || !window.brain.actInstalarAlCerrar) return; actEst = actEst || await window.brain.actEstado(); if (!actDescargada()) return; await window.brain.actInstalarAlCerrar(true, ruta, tag); } catch {} }
window.addEventListener('load', () => { setTimeout(actComprobacionDiaria, 20000); setTimeout(rearmaInstalacion, 8000); });


// ---------- 2 · Aviso de nota nueva (el proceso principal relee las notas de Blackboard cada 3 h y avisa de las nuevas o cambiadas) ----------
if (window.brain.onNotasUi) window.brain.onNotasUi(() => showNotas());
if (window.brain.onNotasCambio) window.brain.onNotasCambio(() => { if (window.brain.notasState) window.brain.notasState().then(r => { if (r && r.status) { ntBB = r; if (view === 'notas') drawNotas(); } }).catch(() => {}); });
async function pintaAvisosAjustes() {
  const w = $('#aj-avisos'); if (!w) return; w.replaceChildren(); w.append(el('h2', null, '🔔 Avisos'));
  if (!esEscritorio() || !window.brain.ajustesGet) { w.append(el('p', 'dsub', 'Los avisos de notas nuevas solo están en la app de escritorio.')); return; }
  let a; try { a = await window.brain.ajustesGet(); } catch { a = null; } if (view !== 'ajustes') return; if (!a || !a.ok) { w.append(el('p', 'dsub', 'No disponible.')); return; }
  const l = el('label', 'msg-chk'), cb = el('input'); cb.type = 'checkbox'; cb.checked = a.avisoNotas; cb.onchange = () => window.brain.ajustesSet({ avisoNotas: cb.checked });
  l.append(cb, document.createTextNode(' Avisarme cuando salga una nota nueva (o cambie) en Blackboard. La app relee tus notas cada 3 horas con tu sesión del campus; la primera lectura no avisa.')); w.append(l);
  w.append(el('p', 'dsub', 'El aviso sale como notificación del sistema y muestra la nota; si no quieres que se vea con la pantalla bloqueada, desactívalo.'));
  const l2 = el('label', 'msg-chk'), c2 = el('input'), av2 = el('p', 'dsub', ''); c2.type = 'checkbox'; c2.checked = !!a.atajoRapido; const tecla = /mac/i.test(navigator.platform || '') || window.brain.platform === 'darwin' ? '⌘⌥N' : 'Ctrl+Alt+N';
  c2.onchange = async () => { const r = await window.brain.ajustesSet({ atajoRapido: c2.checked }); av2.textContent = c2.checked ? (r && r.atajoOk ? `✓ Atajo ${tecla} activo: abre la captura rápida desde cualquier programa.` : `No se pudo registrar el atajo ${tecla} (otro programa lo usa).`) : ''; };
  l2.append(c2, document.createTextNode(` Captura rápida con atajo global ${tecla}: una ventanita para apuntar una duda o un apunte suelto sin abrir Brain (los apuntes van a la carpeta de entrada de la asignatura).`)); const b2 = el('button', 'aj-q', '⚡ Abrir la captura rápida ahora'); b2.onclick = () => window.brain.rapidaAbrir(); w.append(l2, av2, b2);
}


// ---------- 3 · Copia de seguridad de los datos de la app (dudas, plan, pomodoros, pesos, progreso del modo juego, enlaces…) ----------
// Viven en el almacenamiento de la ventana y en un fichero del perfil: no están en tu Brain ni en Git. Exportar/importar un .json evita perderlos al cambiar de equipo.
const sufPerfil = () => (typeof PROFILE !== 'undefined' && PROFILE && PROFILE.id && PROFILE.id !== 'default' ? '-' + PROFILE.id : '');
const EXCLUIR_COPIA = /^brain-(act-|borrador-msg|pomo-estado)/;   // lo propio de este equipo o privado (borradores de mensajes)
function datosParaCopia() {
  const datos = {}, suf = sufPerfil();
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/^brain-[\w.-]+$/.test(k) || EXCLUIR_COPIA.test(k)) continue; const v = localStorage.getItem(k); if (v == null || v.length > 2e6) continue; datos[suf && k.endsWith(suf) ? k.slice(0, -suf.length) + '{perfil}' : k] = v; } } catch {}
  return datos;
}
function resumenCopia(datos) {
  const c = (re) => Object.keys(datos).filter(k => re.test(k)).length, parse = (k) => { try { return JSON.parse(datos[k]); } catch { return null; } };
  const dudas = parse('brain-dudas{perfil}') || parse('brain-dudas'), pomo = parse('brain-pomo{perfil}') || parse('brain-pomo');
  return `${Array.isArray(dudas) ? dudas.length : 0} dudas, ${Array.isArray(pomo) ? pomo.length : 0} sesiones de estudio, ${c(/^brain-plan/)} plan(es) de examen, ${c(/^brain-study/)} progreso del modo juego, ${c(/^brain-pesos/)} pesos de notas y ${Object.keys(datos).length} ajustes/datos en total`;
}
async function exportaCopia() {
  const enl = esEscritorio() && window.brain.enlacesLista ? await window.brain.enlacesLista().catch(() => null) : null;
  const copia = { formato: 'brain-datos', version: 1, fecha: new Date().toISOString(), datos: datosParaCopia(), enlaces: enl && enl.ok ? enl.lista : [] };
  return window.brain.textoGuardar({ nombre: `brain-datos-${isoDe(new Date())}.json`, texto: JSON.stringify(copia, null, 1), extension: 'json', titulo: 'Guardar copia de mis datos' });
}
function validaCopia(txt) {
  let j; try { j = JSON.parse(txt); } catch { return { ok: false, msg: 'El fichero no es un JSON válido.' }; }
  if (!j || j.formato !== 'brain-datos' || !j.datos || typeof j.datos !== 'object') return { ok: false, msg: 'No es una copia de datos de Brain.' };
  const datos = {}; for (const [k, v] of Object.entries(j.datos)) { if (!/^brain-[\w.-]+(\{perfil\})?$/.test(k) || EXCLUIR_COPIA.test(k) || typeof v !== 'string' || v.length > 2e6) continue; datos[k] = v; }
  return { ok: true, datos, enlaces: Array.isArray(j.enlaces) ? j.enlaces.filter(x => x && typeof x.url === 'string').slice(0, 60) : [], fecha: j.fecha };
}
async function aplicaCopia(c) {
  const suf = sufPerfil(); let n = 0; for (const [k, v] of Object.entries(c.datos)) { try { localStorage.setItem(k.replace('{perfil}', suf), v); n++; } catch {} }
  if (c.enlaces.length && esEscritorio() && window.brain.enlacesGuardar) await window.brain.enlacesGuardar(c.enlaces).catch(() => {});
  if (typeof cargaP === 'function') cargaP((typeof PROFILE !== 'undefined' && PROFILE && PROFILE.id) || 'default'); aplicaOcultar(); return n;
}
function pintaCopia() {
  const w = $('#aj-copia'); if (!w) return; w.replaceChildren(); w.append(el('h2', null, '💾 Copia de seguridad de mis datos'));
  if (!esEscritorio() || !window.brain.textoGuardar) { w.append(el('p', 'dsub', 'La copia de seguridad solo está en la app de escritorio.')); return; }
  w.append(el('p', 'dsub', 'Guarda en un fichero tus dudas, planes de examen, sesiones de estudio, pesos de notas, progreso del modo juego y enlaces del campus, para no perderlos al cambiar de equipo o borrar los datos de la app. No incluye claves ni mensajes a medias.'));
  const f = el('div', 'aj-add'), ex = el('button', 'pri', 'Exportar mis datos…'), im = el('button', null, 'Importar una copia…'), av = el('p', 'dsub', ''), caja = el('div');
  ex.onclick = async () => { const r = await exportaCopia(); av.textContent = r && r.ok ? `✓ Guardada en ${r.ruta}` : r && r.cancelado ? '' : (r && r.msg) || 'No se pudo guardar'; };
  im.onclick = async () => {
    caja.replaceChildren(); const r = await window.brain.textoAbrir({ extension: 'json', titulo: 'Importar copia de mis datos' }); if (!r || !r.ok) { av.textContent = r && r.cancelado ? '' : (r && r.msg) || 'No se pudo abrir'; return; }
    const c = validaCopia(r.texto); if (!c.ok) { av.textContent = c.msg; return; }
    const cf = el('div', 'gd-f'), si = el('button', 'pri', 'Importar y sustituir'), no = el('button', null, 'Cancelar'), ro = el('div', 'acts2');
    cf.append(el('p', 'dsub', `Copia del ${(c.fecha || '').slice(0, 10) || '—'}: ${resumenCopia(c.datos)}. Al importar se SUSTITUYEN los datos de ese tipo que tengas ahora en este equipo.`)); ro.append(si, no); cf.append(ro); caja.append(cf);
    no.onclick = () => caja.replaceChildren(); si.onclick = async () => { const n = await aplicaCopia(c); caja.replaceChildren(); av.textContent = `✓ Importados ${n} datos${c.enlaces.length ? ' y ' + c.enlaces.length + ' enlaces' : ''}.`; };
  };
  f.append(ex, im); w.append(f, av, caja);
}

// ---------- 4 · Exportar tarjetas a Anki (texto separado por tabuladores; se importa con Archivo → Importar) ----------
const ankiHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
function textoAnki(cards) {
  const L = ['#separator:tab', '#html:true', '#tags column:3'];
  for (const c of cards) L.push([`¿Qué es «${ankiHtml(c.term)}»?`, `${ankiHtml(c.def)}<br><small>${ankiHtml(c.sigla)} · ${ankiHtml(c.apunte)}</small>`, `Brain::${c.sigla}`].join('\t'));
  return L.join('\n') + '\n';
}
async function exportaAnki(cards) {
  if (!cards.length) return { ok: false, msg: 'No hay tarjetas en la selección.' };
  return window.brain.textoGuardar({ nombre: `brain-anki-${isoDe(new Date())}.txt`, texto: textoAnki(cards), extension: 'txt', titulo: 'Exportar tarjetas a Anki' });
}


// ---------- 5 · Captura rápida (atajo global opcional): las dudas apuntadas desde la ventanita entran en la lista de Dudas ----------
async function recogeDudasRapidas() {
  if (!esEscritorio() || !window.brain.dudasInbox) return; let r; try { r = await window.brain.dudasInbox(); } catch { return; } if (!r || !r.ok || !r.dudas.length) return;
  const l = leeDudas(); for (const d of r.dudas) l.push({ id: 'd' + Date.now() + Math.random().toString(36).slice(2, 6), texto: String(d.texto).slice(0, 300), path: '', sigla: d.sigla || '', titulo: '', fecha: d.fecha || isoDe(new Date()), resuelta: false });
  guardaDudas(l); if (view === 'dudas') drawDudas(); else if (view === 'notes' && !current) hoyToca(true);
}
if (window.brain.onDudasInbox) window.brain.onDudasInbox(recogeDudasRapidas);
window.addEventListener('load', () => setTimeout(recogeDudasRapidas, 1500));


// ---------- 6 · Abrir un apunte en el apartado exacto y resaltar la frase (desde Preguntar, la paleta o las dudas) ----------
// Texto normalizado (sin tildes, en minúsculas) con el mapa a las posiciones del original, para poder buscar sin perder el sitio exacto
function normMapa(s) { let out = '', mapa = []; for (let i = 0; i < s.length; i++) { const n = s[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); for (const c of n) { if (/[a-z0-9]/.test(c)) { out += c; mapa.push(i); } else if (out && out[out.length - 1] !== ' ') { out += ' '; mapa.push(i); } } } return { out, mapa }; }   // solo letras y números, espacios colapsados
function resaltaDestino(d) {
  const raiz = doc; let alcanzado = false; const nz = (x) => normMapa(String(x)).out.trim();
  if (d.cab) { const h = [...raiz.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(x => nz(x.textContent) === nz(d.cab)) || [...raiz.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(x => nz(x.textContent).includes(nz(d.cab))); if (h) { if (h.scrollIntoView) h.scrollIntoView({ block: 'start' }); h.classList.add('flash'); setTimeout(() => h.classList.remove('flash'), 5000); alcanzado = true; } }
  const frase = String(d.frase || '').replace(/^[-*•\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 70), buscada = normMapa(frase).out.trim().slice(0, 40).trim();
  if (buscada.length >= 6) {
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const nm = normMapa(n.nodeValue), ini = nm.out.indexOf(buscada); if (ini < 0) continue;
      const a = nm.mapa[ini], b = nm.mapa[Math.min(nm.mapa.length - 1, ini + buscada.length - 1)] + 1;
      try { const r = document.createRange(); r.setStart(n, a); r.setEnd(n, Math.max(b, a + 1)); const m = document.createElement('mark'); m.className = 'flash-m'; r.surroundContents(m); if (m.scrollIntoView && !alcanzado) m.scrollIntoView({ block: 'center' }); setTimeout(() => { if (m.parentNode) m.replaceWith(...m.childNodes); }, 6000); alcanzado = true; } catch {}
      break;
    }
  }
  return alcanzado;
}


// ---------- 9 · Apariencia: tamaño de letra (zoom de la interfaz), tema claro/oscuro/automático y, desde la 1.0.19, el resto en apariencia.js ----------
const ZOOMS = [['0.9', 'Pequeño'], ['1', 'Normal'], ['1.15', 'Grande'], ['1.3', 'Muy grande']], KZOOM = 'brain-zoom';
function aplicaZoom() { const z = parseFloat(lsGet(KZOOM)) || 1; document.documentElement.style.zoom = z === 1 ? '' : String(z); }
aplicaZoom();
async function pintaApariencia() {
  const w = $('#aj-apar'); if (!w) return; w.replaceChildren(); w.append(el('h2', null, '🎨 Apariencia'));
  const tk = w.dataset.tk = String(Math.random());   // si se vuelve a pintar mientras esperamos, esta pasada se abandona (evita controles duplicados)
  const f = el('div', 'aj-add'), sz = el('select'); for (const [v, t] of ZOOMS) sz.append(Object.assign(el('option', null, t), { value: v })); sz.value = ZOOMS.some(([v]) => v === (lsGet(KZOOM) || '1')) ? (lsGet(KZOOM) || '1') : '1'; sz.onchange = () => { lsSet(KZOOM, sz.value); aplicaZoom(); };
  f.append(el('span', null, 'Tamaño de letra:'), sz); w.append(f);
  if (esEscritorio() && window.brain.ajustesGet) {
    let a; try { a = await window.brain.ajustesGet(); } catch { a = null; } if (view !== 'ajustes' || w.dataset.tk !== tk) return;
    if (a && a.ok) { const g = el('div', 'aj-add'), th = el('select'); for (const [v, t] of [['auto', 'Automático (como el sistema)'], ['claro', 'Claro'], ['oscuro', 'Oscuro']]) th.append(Object.assign(el('option', null, t), { value: v })); th.value = a.tema || 'auto'; th.onchange = () => window.brain.ajustesSet({ tema: th.value }); g.append(el('span', null, 'Tema:'), th); w.append(g); }
  }
  if (typeof apPintaControles === 'function') { await apPintaControles(w, tk); if (w.dataset.tk !== tk) return; }   // temas, fondo de pantalla, cristal, letra, acento y animaciones (apariencia.js)
  w.append(el('p', 'dsub', 'El idioma de la app es el español: la traducción a otros idiomas no está hecha.'));
}

// ---------- 11 · Conectar el móvil: QR con el repositorio y la rama del Brain (sin token: en el móvil se inicia sesión con GitHub) ----------
let movilQR = false;
async function pintaMovil() {
  const w = $('#aj-movil'); if (!w) return; w.replaceChildren(); w.append(el('h2', null, '📱 Conectar el móvil'));
  if (!esEscritorio() || !window.brain.movilEnlace) { w.append(el('p', 'dsub', 'Disponible en la app de escritorio.')); return; }
  w.append(el('p', 'dsub', 'En la app del móvil: ⚙ → «Escanear QR del escritorio». El QR solo lleva el repositorio y la rama de tu Brain, no ningún token: después el móvil te pide iniciar sesión con GitHub.'));
  const b = el('button', 'pri', movilQR ? 'Ocultar el QR' : 'Mostrar el QR'); b.onclick = () => { movilQR = !movilQR; pintaMovil(); }; const f = el('div', 'aj-add'); f.append(b); w.append(f);
  if (!movilQR) return;
  let r; try { r = await window.brain.movilEnlace(); } catch { r = null; } if (view !== 'ajustes') return;
  if (!r || !r.ok) { w.append(el('p', 'msg-warn', (r && r.msg) || 'No se pudo preparar el enlace.')); return; }
  if (typeof qrcode !== 'function') { w.append(el('p', 'msg-warn', 'Falta la librería del QR en esta compilación.')); return; }
  const q = qrcode(0, 'M'); q.addData(r.enlace); q.make();
  const img = el('img'); img.src = q.createDataURL(6, 4); img.alt = 'QR para conectar el móvil'; img.className = 'qr-movil';
  w.append(img, el('p', 'dsub', `Repositorio ${r.repo} · rama ${r.branch}`));
  const c = el('button', null, 'Copiar enlace'); c.onclick = async () => { try { await navigator.clipboard.writeText(r.enlace); c.textContent = '✓ Copiado'; } catch { c.textContent = 'No se pudo copiar'; } };
  const g = el('div', 'aj-add'); g.append(c, el('code', null, r.enlace)); w.append(g);
}
