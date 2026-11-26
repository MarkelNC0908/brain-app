// ---------- Personalización por asignatura y modo concentración ----------
// Color e icono de cada asignatura (los elige el usuario en Ajustes › Apariencia; se guardan por perfil en este equipo, brain-asig{-perfil}).
// Modo concentración: oculta el menú y las barras y deja solo el apunte, más ancho y espaciado (Cmd/Ctrl+. o desde el menú; Esc sale).

const ASIG_K = () => 'brain-asig' + (typeof sufPerfil === 'function' ? sufPerfil() : '');
const asigLee = () => { try { const o = JSON.parse(localStorage.getItem(ASIG_K()) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
let asigEst = {}, asigColorOrig = {};
function asigIcono(s) { const i = asigEst[s] && asigEst[s].i; return i && typeof ICONOS !== 'undefined' && ICONOS[i] ? i : ''; }
// Pone los colores elegidos encima de los del Brain (se guardan los originales para «Restablecer»)
function asigAplica() {
  asigEst = asigLee(); if (typeof COLOR === 'undefined') return;
  for (const s of Object.keys(COLOR)) { if (!(s in asigColorOrig)) asigColorOrig[s] = COLOR[s]; const c = asigEst[s] && asigEst[s].c; COLOR[s] = c && /^#[0-9a-f]{6}$/i.test(c) ? c : asigColorOrig[s]; }
}
function asigGuarda(s, cambios) {
  const o = asigLee(); o[s] = Object.assign({}, o[s], cambios); for (const k of Object.keys(o[s])) if (o[s][k] === '' || o[s][k] == null) delete o[s][k]; if (!Object.keys(o[s]).length) delete o[s];
  try { localStorage.setItem(ASIG_K(), JSON.stringify(o)); } catch {}
  asigAplica(); asigRepinta();
}
function asigRepinta() {
  if (typeof buildTree === 'function') buildTree();
  if (typeof latPintaAsig === 'function') latPintaAsig();
  if (typeof view !== 'undefined' && view === 'notes' && typeof current !== 'undefined' && !current && typeof hist !== 'undefined' && hist[hp] === '@home' && typeof home === 'function') home();
}
// Pone el icono de la asignatura en las cabeceras del árbol y en las tarjetas de Inicio (en lugar del punto de color)
function asigDecora() {
  document.querySelectorAll('[data-s]').forEach(n => {
    const s = n.dataset.s, ic = asigIcono(s), dot = n.querySelector(':scope > i, :scope > b > i'); if (!dot) return;
    const hay = dot.querySelector('svg'); if (!ic) { if (hay) { hay.remove(); dot.classList.remove('con-ico'); } return; }
    if (hay && hay.dataset.n === ic) return; if (hay) hay.remove();
    const svg = icono(ic, 14); svg.dataset.n = ic; dot.classList.add('con-ico'); dot.append(svg);
  });
}
// Ajustes › Apariencia › Asignaturas
function asigPintaAjustes(w) {
  w.append(el('h3', 'ap-h', 'Asignaturas'), el('p', 'dsub', 'Color e icono de cada asignatura: se usan en el menú, en Inicio, en el Dashboard, en el Horario y en Notas. Solo en este perfil.'));
  const siglas = typeof NOMBRES !== 'undefined' ? Object.keys(NOMBRES) : [];
  if (!siglas.length) { w.append(el('p', 'dsub', 'Aún no hay asignaturas.')); return; }
  const tabla = el('div', 'asig-cfg'); w.append(tabla);
  for (const s of siglas) {
    const f = el('div', 'asig-cfg-f'), muestra = el('span', 'asig-m'); muestra.style.setProperty('--c', COLOR[s]); const ic = asigIcono(s); if (ic) muestra.append(icono(ic, 16)); else muestra.textContent = s.toUpperCase().slice(0, 3);
    const nom = el('span', 'asig-n', NOMBRES[s]);
    const col = el('input'); col.type = 'color'; col.value = /^#[0-9a-f]{6}$/i.test(COLOR[s]) ? COLOR[s] : '#888888'; col.setAttribute('aria-label', 'Color de ' + NOMBRES[s]); col.onchange = () => { asigGuarda(s, { c: col.value }); if (typeof pintaApariencia === 'function') pintaApariencia(); };
    const sel = el('select'); sel.setAttribute('aria-label', 'Icono de ' + NOMBRES[s]); sel.append(Object.assign(el('option', null, 'Sin icono (punto)'), { value: '' }));
    for (const [id, n] of ICONOS_ASIG) sel.append(Object.assign(el('option', null, n), { value: id }));
    sel.value = ic; sel.onchange = () => { asigGuarda(s, { i: sel.value }); if (typeof pintaApariencia === 'function') pintaApariencia(); };
    const rs = el('button', 'lat-cfg-b'); rs.type = 'button'; rs.append(icono('cerrar', 14)); rs.title = 'Volver al color y sin icono'; rs.setAttribute('aria-label', 'Restablecer ' + NOMBRES[s]); rs.disabled = !asigLee()[s];
    rs.onclick = () => { asigGuarda(s, { c: '', i: '' }); if (typeof pintaApariencia === 'function') pintaApariencia(); };
    f.append(muestra, nom, col, sel, rs); tabla.append(f);
  }
}

// ---------- Modo concentración ----------
function focoAlterna(on) {
  const b = document.body; on = on === undefined ? !b.classList.contains('foco') : !!on; b.classList.toggle('foco', on);
  let x = $('#foco-salir');
  if (on && !x) { x = el('button', null, 'Salir del modo concentración (Esc)'); x.id = 'foco-salir'; x.type = 'button'; x.prepend(icono('cerrar', 14)); x.onclick = () => focoAlterna(false); b.append(x); }
  if (!on && x) x.remove();
}

(function persInicia() {
  if (typeof document === 'undefined') return;
  // tras cargar las asignaturas del Brain (y al cambiar de perfil) se aplican los colores elegidos
  if (typeof cargaAsignaturas === 'function') { const orig = cargaAsignaturas; cargaAsignaturas = async function () { await orig.apply(this, arguments); asigColorOrig = {}; asigAplica(); }; }
  if (typeof COLOR !== 'undefined' && Object.keys(COLOR).length) { asigAplica(); asigRepinta(); }
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === '.') { e.preventDefault(); focoAlterna(); }
    else if (e.key === 'Escape' && document.body.classList.contains('foco') && !document.querySelector('.pal')) focoAlterna(false);
  });
})();
