// ---------- Simulacros de test (bancos de preguntas guardados en el Brain) ----------
// Un banco es un apunte .md con `type: test` en la cabecera (normalmente en recursos/). Cada pregunta es un apartado «## »:
//   ## diap. 16 · ¿Quién desarrolló Pegasus?          ← «diap. N · » es opcional
//   - [x] NSO Group                                    ← opción correcta
//   - [ ] Citizen Lab                                  ← opciones incorrectas
//   > Explicación que se ve al corregir (opcional)
// Preguntas de relacionar: líneas «- izquierda => derecha». Cabecera opcional: preguntas_por_intento (24 por defecto) y minutos (modo examen).
// Intentos, notas y fallos se guardan en este equipo por perfil (brain-sim{-perfil}); el banco no se modifica.
// Repaso de fallos: cada pregunta fallada entra en una caja; si la aciertas al repasar sube de caja y vuelve más tarde (1, 3, 7 y 14 días).

const SIM_K = 'brain-sim', SIM_CAJAS = [0, 1, 3, 7, 14];

function simParsea(body) {
  const qs = []; const trozos = ('\n' + String(body || '').replace(/\r\n?/g, '\n')).split(/\n## /).slice(1);
  for (const tz of trozos) {
    const lineas = tz.split('\n'), cab = lineas[0].trim(), m = cab.match(/^diap(?:ositiva)?s?\.?\s*([\d][\d\s,y-]*?)\s*[·:-]\s*(.+)$/i);
    const diap = m ? m[1].trim() : '', enun = (m ? m[2] : cab).trim(); if (!enun) continue;
    const ok = [], mal = [], pares = [], expl = []; let mas = [];
    for (const l of lineas.slice(1)) {
      let x;
      if ((x = l.match(/^\s*[-*]\s*\[(x|X| )\]\s+(.+)$/))) (x[1].trim() ? ok : mal).push(x[2].trim());
      else if ((x = l.match(/^\s*[-*]\s+(.+?)\s*=>\s*(.+)$/))) pares.push([x[1].trim(), x[2].trim()]);
      else if ((x = l.match(/^\s*>\s?(.*)$/))) expl.push(x[1]);
      else if (l.trim() && !ok.length && !mal.length && !pares.length) mas.push(l.trim());   // enunciado en varias líneas
    }
    const texto = [enun, ...mas].join('\n'), e = expl.join(' ').trim();
    if (pares.length >= 2) qs.push({ tipo: 'rel', diap, q: texto, pares, expl: e });
    else if (ok.length === 1 && mal.length >= 1) qs.push({ tipo: 'opc', diap, q: texto, ok: ok[0], mal, expl: e });
  }
  return qs;
}
const simHash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
const simId = (banco, q) => simHash(banco + '|' + q.q);
// Elige las preguntas de un intento: reparte entre las diapositivas (al menos una de cada una mientras quepan) y baraja
function simElige(qs, n, azar = Math.random) {
  const bar = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (n >= qs.length) return bar(qs);
  const por = {}; for (const q of bar(qs)) (por[q.diap || '·'] ||= []).push(q);
  const out = [], grupos = Object.values(por); let i = 0;
  while (out.length < n) { const g = grupos[i % grupos.length]; if (g.length) out.push(g.shift()); i++; if (grupos.every(x => !x.length)) break; }
  return bar(out);
}
// Repaso espaciado de fallos
function simFallo(st, id, banco, hoy) { st.fallos[id] = { banco, caja: 0, prox: hoy }; }
function simAcierto(st, id, hoy, sumaD) { const f = st.fallos[id]; if (!f) return; f.caja++; if (f.caja >= SIM_CAJAS.length) { delete st.fallos[id]; return; } f.prox = sumaD(hoy, SIM_CAJAS[f.caja]); }
const simPendientes = (st, hoy) => Object.entries(st.fallos || {}).filter(([, f]) => f.prox <= hoy);

if (typeof module !== 'undefined' && module.exports) module.exports = { simParsea, simElige, simFallo, simAcierto, simPendientes, simId, SIM_CAJAS };

// ---------- En la página ----------
// Fichas de recursos/: se piden al proceso principal y se guardan 20 s (el banco y la ficha del PDF viven ahí, no en el índice de apuntes)
let RECURSOS = [], recursosT = 0;
async function recursosCarga(forzar) {
  if (!forzar && Date.now() - recursosT < 20000) return RECURSOS;
  if (window.brain && window.brain.recursosLista) { try { const l = await window.brain.recursosLista(); if (Array.isArray(l)) RECURSOS = l; } catch {} }
  recursosT = Date.now(); return RECURSOS;
}
const simK = () => SIM_K + (typeof sufPerfil === 'function' ? sufPerfil() : '');
function simLee() { try { const o = JSON.parse(localStorage.getItem(simK()) || '{}'); return { bancos: o.bancos || {}, fallos: o.fallos || {} }; } catch { return { bancos: {}, fallos: {} }; } }
function simGuarda(st) { try { localStorage.setItem(simK(), JSON.stringify(st)); } catch {} }
const simBancos = () => [...(typeof notes !== 'undefined' ? notes : []).filter(n => !n.externo), ...RECURSOS].filter(n => n.meta && String(n.meta.type || '').toLowerCase() === 'test').map(n => ({ n, qs: simParsea(n.body) })).filter(b => b.qs.length);
const simSuma = (f, d) => (typeof sumaDias === 'function' ? sumaDias(f, d) : (() => { const x = new Date(f + 'T00:00'); x.setDate(x.getDate() + d); return isoDe(x); })());
let SIMA = null;   // intento en curso: { banco, titulo, items, modo: 'practica'|'examen'|'repaso', fin, t, enviado }

function showSimulacros(push = true) {
  if (SIMA && SIMA.t) clearInterval(SIMA.t); SIMA = null;
  view = 'simulacros'; current = null; if (push && hist[hp] !== '@simulacros') { hist = hist.slice(0, hp + 1); hist.push('@simulacros'); hp = hist.length - 1; }
  $('#crumb').textContent = 'Simulacros'; btns(); markOn(); simLista(); recursosCarga(true).then(() => { if (view === 'simulacros' && !SIMA) simLista(); });
}
function simLista() {
  if (view !== 'simulacros') return; doc.replaceChildren(); const st = simLee(), hoy = isoDe(new Date()), bancos = simBancos();
  doc.append(el('h1', null, 'Simulacros de test'), el('p', 'lead', 'Tests con las diapositivas que entran en cada examen, en el formato de Blackboard. Los bancos de preguntas son apuntes de tu Brain con «type: test».'));
  const pend = simPendientes(st, hoy).filter(([, f]) => bancos.some(b => b.n.path === f.banco));
  if (pend.length) { const r = el('div', 'sim-rep'); r.append(icono('estudiar', 18), el('span', null, `Tienes ${pend.length} pregunta${pend.length > 1 ? 's' : ''} falladas para repasar hoy.`)); const b = el('button', 'pri', 'Repasar fallos'); b.onclick = () => simEmpieza(null, 'repaso'); r.append(b); doc.append(r); }
  if (!bancos.length) { doc.append(el('p', 'dsub', 'Aún no hay ningún banco de preguntas. Pide a Claude que te prepare el test de una unidad («márcala como test y haz el repaso»): lo guarda en recursos/ y aparece aquí.')); return; }
  const por = {}; for (const b of bancos) (por[sigOf(b.n)] ||= []).push(b);
  for (const s of Object.keys(por).sort()) {
    const sec = el('div', 'nt-sec'); sec.style.setProperty('--c', COLOR[s] || 'var(--acc)'); const h = el('div', 'nt-h'); h.append(el('i'), el('b', null, NOMBRES[s] || s.toUpperCase())); sec.append(h);
    for (const b of por[s]) {
      const info = st.bancos[b.n.path] || { intentos: [] }, ult = info.intentos.slice(-5), nPor = Math.min(b.qs.length, parseInt(b.n.meta.preguntas_por_intento, 10) || 24);
      const fila = el('div', 'sim-b'), tx = el('div', 'sim-bt'); tx.append(el('b', null, short(b.n)), el('span', 'dsub', `${b.qs.length} preguntas · ${nPor} por intento` + (b.qs.some(q => q.diap) ? ` · diapositivas ${[...new Set(b.qs.map(q => q.diap).filter(Boolean))].join(', ')}` : '')));
      if (ult.length) tx.append(el('span', 'dsub', 'Últimas notas: ' + ult.map(x => `${String(x.nota).replace('.', ',')}${x.modo === 'examen' ? ' ⏱' : ''}`).join(' · ')));
      const ac = el('div', 'acts2'), p = el('button', 'pri', 'Empezar'); p.onclick = () => simEmpieza(b, 'practica');
      const e = el('button', null, 'Modo examen'); e.title = 'Cronometrado y sin ver nada hasta entregar'; e.onclick = () => simEmpieza(b, 'examen');
      const t = el('button', null, 'Todas'); t.title = 'Todas las preguntas del banco'; t.onclick = () => simEmpieza(b, 'todas');
      ac.append(p, e, t); if (byPath.has(b.n.path)) { const v = el('button', null, 'Ver el banco'); v.onclick = () => go(b.n.path); ac.append(v); } fila.append(tx, ac); sec.append(fila);
    }
    doc.append(sec);
  }
}
function simEmpieza(b, modo) {
  const st = simLee(), hoy = isoDe(new Date()); let items = [];
  if (modo === 'repaso') {
    const bancos = simBancos(); for (const [id, f] of simPendientes(st, hoy)) { const bb = bancos.find(x => x.n.path === f.banco); const q = bb && bb.qs.find(q => simId(bb.n.path, q) === id); if (q) items.push({ q, banco: bb.n.path }); }
    items = simElige(items.map(x => Object.assign({}, x.q, { _b: x.banco })), 30).map(q => ({ q, banco: q._b }));
    if (!items.length) { simLista(); return; }
  } else {
    const n = modo === 'todas' ? b.qs.length : Math.min(b.qs.length, parseInt(b.n.meta.preguntas_por_intento, 10) || 24);
    items = simElige(b.qs, n).map(q => ({ q, banco: b.n.path }));
  }
  const bar = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (const it of items) { it.ops = it.q.tipo === 'opc' ? bar([it.q.ok, ...it.q.mal]) : bar(it.q.pares.map(p => p[1])); it.resp = it.q.tipo === 'opc' ? null : {}; }
  const min = modo === 'examen' ? (parseInt(b && b.n.meta.minutos, 10) || Math.max(5, Math.round(items.length * 0.75))) : 0;
  SIMA = { banco: b ? b.n.path : null, titulo: modo === 'repaso' ? 'Repaso de fallos' : short(b.n), items, modo, fin: min ? Date.now() + min * 60000 : 0, t: null, enviado: false };
  if (SIMA.fin) SIMA.t = setInterval(() => { if (!SIMA || view !== 'simulacros') return; const r = Math.max(0, Math.ceil((SIMA.fin - Date.now()) / 1000)), c = $('#sim-reloj'); if (c) { c.textContent = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`; c.classList.toggle('hot', r <= 60); } if (!r && !SIMA.enviado) simCorrige(true); }, 500);
  if (typeof marcaDiaEstudio === 'function') marcaDiaEstudio();
  simPinta();
}
function simPinta() {
  const S = SIMA; if (!S || view !== 'simulacros') return; doc.replaceChildren();
  const top = el('div', 'sim-top'); top.append(el('h1', null, S.titulo));
  if (S.fin && !S.enviado) { const r = el('span', 'sim-reloj'); r.id = 'sim-reloj'; r.textContent = '…'; top.append(r); }
  doc.append(top, el('p', 'dsub', S.modo === 'examen' ? `Modo examen: ${S.items.length} preguntas, cronometrado. No verás nada hasta entregar; al acabarse el tiempo se entrega solo.` : `${S.items.length} preguntas · cada una vale lo mismo · las respuestas se ven al entregar.`));
  S.items.forEach((it, i) => {
    const q = it.q, c = el('section', 'sim-q'); c.id = 'simq' + i; const h = el('div', 'sim-qh'); h.append(el('span', 'sim-num', String(i + 1)), el('span', 'sim-tipo', q.tipo === 'opc' ? 'Opción múltiple' : 'Relacionar')); c.append(h, el('div', 'sim-enun', q.q));
    if (q.tipo === 'opc') {
      const g = el('div', 'sim-ops'); g.setAttribute('role', 'radiogroup');
      it.ops.forEach((o, k) => { const l = el('label', 'sim-op'), r = el('input'); r.type = 'radio'; r.name = 'simq' + i; r.checked = it.resp === o; r.disabled = S.enviado; r.onchange = () => { it.resp = o; simCuenta(); }; l.append(r, el('span', null, `${'ABCDEFGH'[k]}. ${o}`)); if (S.enviado) { if (o === q.ok) l.classList.add('ok'); else if (it.resp === o) l.classList.add('mal'); } g.append(l); });
      c.append(g);
    } else {
      const g = el('div', 'sim-rel');
      q.pares.forEach(([izq, der], k) => { const f = el('div', 'sim-relf'), s = el('select'); s.setAttribute('aria-label', izq); s.append(Object.assign(el('option', null, 'Elige…'), { value: '' })); for (const o of it.ops) s.append(Object.assign(el('option', null, o), { value: o }));
        s.value = it.resp[k] || ''; s.disabled = S.enviado; s.onchange = () => { it.resp[k] = s.value; simCuenta(); }; f.append(el('b', null, String(k + 1)), el('span', null, izq), s);
        if (S.enviado) { f.classList.add(it.resp[k] === der ? 'ok' : 'mal'); if (it.resp[k] !== der) f.append(el('span', 'sim-fix', 'Correcta: ' + der)); } g.append(f); });
      c.append(g);
    }
    if (S.enviado) { const p = it.punt, pill = el('span', 'sim-pt ' + (p === 1 ? 'ok' : p === 0 ? 'mal' : 'medio'), `${String(Math.round(p * 100) / 100).replace('.', ',')} / 1`); h.append(pill); const fb = el('div', 'sim-fb'); fb.append(el('span', null, q.expl || 'Sin explicación en el banco.')); if (q.diap) fb.append(el('span', 'dsub', ` · Diapositiva ${q.diap}`)); c.append(fb); }
    doc.append(c);
  });
  const pie = el('div', 'acts2 sim-pie');
  if (!S.enviado) { const e = el('button', 'pri', 'Entregar'); e.onclick = () => { const sin = S.items.filter(simSinResp).length; if (sin && !simConfirma(e, sin)) return; simCorrige(false); }; pie.append(e, Object.assign(el('span', 'dsub'), { id: 'sim-cuenta' })); }
  else { const v = el('button', 'pri', 'Volver a Simulacros'); v.onclick = () => showSimulacros(false); pie.append(v); const fall = S.items.filter(it => it.punt < 1); if (fall.length) { const r = el('button', null, `Repetir solo los fallos (${fall.length})`); r.onclick = () => { SIMA = Object.assign({}, S, { items: fall.map(it => Object.assign({}, it, { resp: it.q.tipo === 'opc' ? null : {}, punt: undefined })), enviado: false, fin: 0, modo: 'practica', titulo: S.titulo + ' · fallos' }); simPinta(); }; pie.append(r); } }
  doc.append(pie); simCuenta();
}
const simSinResp = (it) => (it.q.tipo === 'opc' ? !it.resp : !Object.values(it.resp).some(Boolean));
function simConfirma(b, sin) { if (b.dataset.conf) return true; b.dataset.conf = '1'; b.textContent = `Quedan ${sin} sin responder · pulsa otra vez para entregar`; return false; }
function simCuenta() { const c = $('#sim-cuenta'); if (c && SIMA) c.textContent = `${SIMA.items.filter(it => !simSinResp(it)).length} de ${SIMA.items.length} respondidas`; }
function simCorrige(porTiempo) {
  const S = SIMA; if (!S || S.enviado) return; S.enviado = true; if (S.t) clearInterval(S.t);
  const st = simLee(), hoy = isoDe(new Date()); let total = 0;
  for (const it of S.items) {
    const q = it.q; it.punt = q.tipo === 'opc' ? (it.resp === q.ok ? 1 : 0) : q.pares.filter(([, d], k) => it.resp[k] === d).length / q.pares.length; total += it.punt;
    const id = simId(it.banco, q); if (it.punt < 1) simFallo(st, id, it.banco, simSuma(hoy, 1)); else if (S.modo === 'repaso' || st.fallos[id]) simAcierto(st, id, hoy, simSuma);
  }
  const nota = Math.round(total / S.items.length * 1000) / 100;
  if (S.banco && S.modo !== 'repaso') { const b = st.bancos[S.banco] || (st.bancos[S.banco] = { intentos: [] }); b.intentos.push({ f: hoy, nota, n: S.items.length, modo: S.modo }); b.intentos = b.intentos.slice(-30); }
  simGuarda(st); simPinta();
  const r = el('div', 'sim-res ' + (nota >= 5 ? 'ok' : 'mal')); r.append(el('b', null, `${String(nota).replace('.', ',')} / 10`), el('span', null, `${String(Math.round(total * 100) / 100).replace('.', ',')} de ${S.items.length} puntos${porTiempo ? ' · entregado al acabarse el tiempo' : ''}. Lo fallado entra en «Repasar fallos».`));
  const top = doc.querySelector('.sim-top'); if (top) top.after(r); doc.scrollTop = 0;
}
