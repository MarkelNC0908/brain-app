// ---------- Menú lateral: se despliega o se pliega en una columna de iconos (botón de la barra o Cmd/Ctrl+B) ----------
// Arriba lleva accesos con icono a cada pantalla (y la barra superior deja de repetirlos); los menos usados van en «Más».
// Plegado solo quedan los iconos y las asignaturas como insignias. Qué accesos se ven y en qué orden se elige en Ajustes › Apariencia.
// El estado y la configuración se recuerdan en este equipo (localStorage: brain-lateral, brain-lateral-menu).

const LAT_K = 'brain-lateral', LAT_MENU_K = 'brain-lateral-menu';
// id → [icono, texto, pantalla(s) en `view`, acción, botón de la barra que la hace]
const LAT_ITEMS = {
  inicio: ['inicio', 'Inicio', ['notes'], () => $('#hbtn').click(), 'hbtn'],
  estudiar: ['estudiar', 'Estudiar', ['study'], () => $('#sbtn').click(), 'sbtn'],
  simulacros: ['simulacros', 'Simulacros', ['simulacros'], () => typeof showSimulacros === 'function' && showSimulacros()],
  plan: ['plan', 'Plan de examen', ['plan'], () => typeof showPlan === 'function' && showPlan()],
  dudas: ['dudas', 'Dudas', ['dudas'], () => typeof showDudas === 'function' && showDudas()],
  dashboard: ['dashboard', 'Dashboard', ['dash'], () => $('#dbtn').click(), 'dbtn'],
  horario: ['horario', 'Horario', ['horario'], () => $('#hobtn').click(), 'hobtn'],
  notas: ['notas', 'Notas', ['notas'], () => $('#ntbtn').click(), 'ntbtn'],
  preguntar: ['preguntar', 'Preguntar', ['preguntar'], () => $('#rbtn').click(), 'rbtn'],
  mensajes: ['mensajes', 'Mensajes', ['mensajes'], () => $('#msgbtn').click(), 'msgbtn'],
  avisos: ['avisos', 'Avisos', ['avisos'], () => $('#nbtn').click(), 'nbtn'],
  concentracion: ['foco', 'Modo concentración', [], () => typeof focoAlterna === 'function' && focoAlterna()],
  terminal: ['terminal', 'Terminal', [], () => $('#tbtn').click(), 'tbtn'],
  ajustes: ['ajustes', 'Ajustes', ['ajustes'], () => $('#setbtn').click(), 'setbtn']
};
const LAT_DEF = { orden: ['inicio', 'estudiar', 'simulacros', 'dashboard', 'horario', 'notas', 'mensajes', 'avisos', 'plan', 'dudas', 'preguntar', 'concentracion', 'terminal', 'ajustes'], mas: ['plan', 'dudas', 'preguntar', 'concentracion', 'terminal'] };
let latMasAbierto = false;
const latPlegado = () => document.body.classList.contains('lat-plegado');
function latLee() { try { return localStorage.getItem(LAT_K) === 'plegado'; } catch { return false; } }
// Configuración del menú: orden de los accesos y cuáles van dentro de «Más» (lo desconocido se ignora; lo nuevo se añade al final)
function latMenu() {
  let o = null; try { o = JSON.parse(localStorage.getItem(LAT_MENU_K) || 'null'); } catch {}
  const orden = (o && Array.isArray(o.orden) ? o.orden : LAT_DEF.orden).filter(id => LAT_ITEMS[id]);
  for (const id of Object.keys(LAT_ITEMS)) if (!orden.includes(id)) orden.push(id);
  const mas = (o && Array.isArray(o.mas) ? o.mas : LAT_DEF.mas).filter(id => LAT_ITEMS[id] && id !== 'ajustes');   // Ajustes siempre a la vista
  return { orden: [...new Set(orden)], mas };
}
function latGuardaMenu(m) { try { localStorage.setItem(LAT_MENU_K, JSON.stringify({ orden: m.orden, mas: m.mas })); } catch {} latPintaNav(); }

function latPliega(plegar) {
  const b = document.body; plegar = plegar === undefined ? !latPlegado() : !!plegar;
  b.classList.toggle('lat-plegado', plegar);
  try { localStorage.setItem(LAT_K, plegar ? 'plegado' : 'abierto'); } catch {}
  const t = $('#sidebtn'); if (t) { t.setAttribute('aria-expanded', String(!plegar)); t.title = (plegar ? 'Desplegar' : 'Plegar') + ' el menú lateral (Cmd/Ctrl+B)'; t.setAttribute('aria-label', t.title); }
}

function latBoton(id) {
  const [ic, txt, vistas, fn, de] = LAT_ITEMS[id];
  const orig = de && document.getElementById(de); if (de && (!orig || orig.hidden || orig.style.display === 'none')) return null;   // p. ej. Mensajes o Terminal no están en el móvil
  const b = el('button', 'snav-it'); b.type = 'button'; b.dataset.id = id; b.dataset.v = vistas.join(' '); b.title = txt; b.setAttribute('aria-label', txt);
  const badge = el('b', 'snav-n'); badge.hidden = true;
  b.append(icono(ic, 18), el('span', 'snav-t', txt), badge); b.onclick = () => { fn(); latMarca(); }; if (de) b.dataset.de = de; return b;
}
// Accesos con icono: un botón real por pantalla, con su texto (visible desplegado; como título y etiqueta plegado)
function latPintaNav() {
  let n = $('#snav'); if (!n) { n = document.createElement('nav'); n.id = 'snav'; n.setAttribute('aria-label', 'Pantallas'); const q0 = $('#q'); q0.parentNode.insertBefore(n, q0.nextSibling); }
  n.replaceChildren(); const m = latMenu(), mas = [];
  for (const id of m.orden) { const b = latBoton(id); if (!b) continue; if (m.mas.includes(id)) mas.push(b); else n.append(b); }
  if (mas.length) {
    const t = el('button', 'snav-it snav-mas'); t.type = 'button'; t.setAttribute('aria-expanded', String(latMasAbierto)); t.title = 'Más pantallas'; t.setAttribute('aria-label', 'Más pantallas');
    t.append(icono('mas', 18), el('span', 'snav-t', 'Más'), icono(latMasAbierto ? 'arriba' : 'abajo', 14));
    const box = el('div', 'snav-masbox'); box.hidden = !latMasAbierto; box.append(...mas);
    t.onclick = () => { latMasAbierto = !latMasAbierto; latPintaNav(); }; n.append(t, box);
  }
  latPintaAsig(); latMarca(); latCuentas();
}

// Plegado: las asignaturas como insignias con su icono (o su sigla) y su color; al pulsar, se abre la asignatura
function latPintaAsig() {
  let a = $('#sasig'); if (!a) { a = document.createElement('div'); a.id = 'sasig'; a.setAttribute('aria-label', 'Asignaturas'); const t = $('#tree'); t.parentNode.insertBefore(a, t); }
  a.replaceChildren();
  const siglas = [...new Set((typeof notes !== 'undefined' ? notes : []).map(x => (typeof sigOf === 'function' ? sigOf(x) : '')).filter(Boolean))].sort();
  for (const s of siglas) {
    const ic = typeof asigIcono === 'function' ? asigIcono(s) : '', b = el('button', 'sasig-it' + (ic ? ' con-ico' : ''), ic ? null : s.toUpperCase().slice(0, 4)); b.type = 'button';
    if (ic) b.append(icono(ic, 18));
    b.style.setProperty('--c', (typeof COLOR !== 'undefined' && COLOR[s]) || 'var(--mut)');
    const nom = (typeof NOMBRES !== 'undefined' && NOMBRES[s]) || s.toUpperCase(); b.title = nom; b.setAttribute('aria-label', 'Abrir ' + nom);
    b.onclick = () => { if (typeof goSubject === 'function') goSubject(s); latMarca(); }; a.append(b);
  }
}

// Resalta la pantalla en la que se está
function latMarca() {
  const v = typeof view !== 'undefined' ? view : '', enInicio = v === 'notes' && typeof current !== 'undefined' && !current && typeof hist !== 'undefined' && hist[hp] === '@home';
  document.querySelectorAll('#snav .snav-it[data-v]').forEach(b => { const vs = b.dataset.v.split(' '); const on = vs.includes(v) && (v !== 'notes' || enInicio); b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}

// Copia el número de no vistos de la campana y de Mensajes (el <b> que ya pintan esos botones)
function latCuentas() {
  document.querySelectorAll('#snav .snav-it[data-de]').forEach(b => { const o = document.getElementById(b.dataset.de), c = o && o.querySelector('b'), x = b.querySelector('.snav-n'); const t = c ? c.textContent.trim() : ''; x.textContent = t; x.hidden = !t; });
}

// Ajustes › Apariencia › Menú lateral: qué accesos están a la vista, cuáles en «Más» y en qué orden
function latPintaAjustes(w) {
  w.append(el('h3', 'ap-h', 'Menú lateral'), el('p', 'dsub', 'Elige qué accesos se ven siempre y cuáles van dentro de «Más», y cámbialos de orden.'));
  const m = latMenu(), lista = el('div', 'lat-cfg'); w.append(lista);
  m.orden.forEach((id, i) => {
    const [ic, txt] = LAT_ITEMS[id], f = el('div', 'lat-cfg-f'); f.append(icono(ic, 16), el('span', 'lat-cfg-t', txt));
    const sel = el('select'); sel.setAttribute('aria-label', 'Dónde va ' + txt); for (const [v, t] of [['vista', 'A la vista'], ['mas', 'En «Más»']]) sel.append(Object.assign(el('option', null, t), { value: v }));
    sel.value = m.mas.includes(id) ? 'mas' : 'vista'; sel.disabled = id === 'ajustes'; sel.onchange = () => { const mm = latMenu(); mm.mas = mm.mas.filter(x => x !== id); if (sel.value === 'mas') mm.mas.push(id); latGuardaMenu(mm); };
    const up = el('button', 'lat-cfg-b'); up.type = 'button'; up.append(icono('arriba', 14)); up.setAttribute('aria-label', 'Subir ' + txt); up.disabled = i === 0;
    const dn = el('button', 'lat-cfg-b'); dn.type = 'button'; dn.append(icono('abajo', 14)); dn.setAttribute('aria-label', 'Bajar ' + txt); dn.disabled = i === m.orden.length - 1;
    const mueve = (d) => { const mm = latMenu(), j = mm.orden.indexOf(id), k = j + d; if (k < 0 || k >= mm.orden.length) return; [mm.orden[j], mm.orden[k]] = [mm.orden[k], mm.orden[j]]; latGuardaMenu(mm); if (typeof pintaApariencia === 'function') pintaApariencia(); };
    up.onclick = () => mueve(-1); dn.onclick = () => mueve(1);
    f.append(sel, up, dn); lista.append(f);
  });
  const r = el('div', 'ap-fila'), b = el('button', null, 'Menú por defecto'); b.type = 'button'; b.onclick = () => { try { localStorage.removeItem(LAT_MENU_K); } catch {} latPintaNav(); if (typeof pintaApariencia === 'function') pintaApariencia(); }; r.append(b); w.append(r);
}

(function latInicia() {
  if (typeof document === 'undefined' || !$('#side') || !$('#bar')) return;
  const t = document.createElement('button'); t.id = 'sidebtn'; t.type = 'button'; t.append(icono('menu', 18)); t.setAttribute('aria-controls', 'side');
  t.onclick = () => latPliega(); $('#bar').prepend(t);
  document.body.classList.add('lat-on');   // con el menú lateral, la barra de arriba deja de repetir los mismos botones (siguen en la página: el menú los pulsa)
  latPliega(latLee()); latPintaNav();
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'b' && !/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '') && !(e.target && e.target.isContentEditable)) { e.preventDefault(); latPliega(); } });
  // al cambiar de pantalla, de apuntes o de contadores: se actualizan el resaltado, las asignaturas y los números
  const pend = new Set(), tarde = (f) => { if (pend.has(f)) return; pend.add(f); requestAnimationFrame(() => { pend.delete(f); f(); }); };   // una vez por fotograma y por tarea
  const asig = () => { latPintaAsig(); latMarca(); if (typeof asigDecora === 'function') asigDecora(); };
  const pagina = () => { latMarca(); if (typeof asigDecora === 'function') asigDecora(); };
  new MutationObserver(() => tarde(pagina)).observe($('#doc'), { childList: true });
  new MutationObserver(() => tarde(asig)).observe($('#tree'), { childList: true });
  new MutationObserver(() => tarde(latCuentas)).observe($('#bar'), { childList: true, subtree: true, characterData: true });
})();
