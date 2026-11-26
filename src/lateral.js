// ---------- Menú lateral: se despliega o se pliega en una columna de iconos (botón ☰ de la barra o Cmd/Ctrl+B) ----------
// Arriba lleva accesos con icono a cada pantalla; plegado solo quedan los iconos y las asignaturas como insignias de color.
// El estado se recuerda en este equipo (localStorage, brain-lateral).

const LAT_K = 'brain-lateral';
// [icono, texto, pantalla(s) en `view`, acción]. La acción pulsa el botón de la barra si existe (así respeta lo que ya hace cada uno)
const LAT_ITEMS = [
  ['⌂', 'Inicio', ['notes'], () => $('#hbtn').click(), 'hbtn'],
  ['🎮', 'Estudiar', ['study'], () => $('#sbtn').click(), 'sbtn'],
  ['🗒', 'Plan de examen', ['plan'], () => typeof showPlan === 'function' && showPlan()],
  ['❓', 'Dudas', ['dudas'], () => typeof showDudas === 'function' && showDudas()],
  ['◧', 'Dashboard', ['dash'], () => $('#dbtn').click(), 'dbtn'],
  ['🗓', 'Horario', ['horario'], () => $('#hobtn').click(), 'hobtn'],
  ['📊', 'Notas', ['notas'], () => $('#ntbtn').click(), 'ntbtn'],
  ['🔎', 'Preguntar', ['preguntar'], () => $('#rbtn').click(), 'rbtn'],
  ['💬', 'Mensajes', ['mensajes'], () => $('#msgbtn').click(), 'msgbtn'],
  ['🔔', 'Avisos', ['avisos'], () => $('#nbtn').click(), 'nbtn'],
  ['⌨', 'Terminal', [], () => $('#tbtn').click(), 'tbtn'],
  ['⚙', 'Ajustes', ['ajustes'], () => $('#setbtn').click(), 'setbtn']
];
const latPlegado = () => document.body.classList.contains('lat-plegado');
function latLee() { try { return localStorage.getItem(LAT_K) === 'plegado'; } catch { return false; } }

function latPliega(plegar) {
  const b = document.body; plegar = plegar === undefined ? !latPlegado() : !!plegar;
  b.classList.toggle('lat-plegado', plegar);
  try { localStorage.setItem(LAT_K, plegar ? 'plegado' : 'abierto'); } catch {}
  const t = $('#sidebtn'); if (t) { t.setAttribute('aria-expanded', String(!plegar)); t.title = (plegar ? 'Desplegar' : 'Plegar') + ' el menú lateral (Cmd/Ctrl+B)'; }
}

// Accesos con icono: un botón real por pantalla, con su texto (visible desplegado; como título y etiqueta plegado)
function latPintaNav() {
  let n = $('#snav'); if (!n) { n = document.createElement('nav'); n.id = 'snav'; n.setAttribute('aria-label', 'Pantallas'); const q0 = $('#q'); q0.parentNode.insertBefore(n, q0.nextSibling); }
  n.replaceChildren();
  for (const [ic, txt, vistas, fn, id] of LAT_ITEMS) {
    const orig = id && document.getElementById(id); if (id && (!orig || orig.hidden || orig.style.display === 'none')) continue;   // p. ej. Mensajes o Terminal no están en el móvil
    const b = el('button', 'snav-it'); b.type = 'button'; b.dataset.v = vistas.join(' '); b.title = txt; b.setAttribute('aria-label', txt);
    const i = el('span', 'snav-ic', ic); i.setAttribute('aria-hidden', 'true'); const badge = el('b', 'snav-n'); badge.hidden = true;
    b.append(i, el('span', 'snav-t', txt), badge); b.onclick = () => { fn(); latMarca(); }; if (id) b.dataset.de = id; n.append(b);
  }
  latPintaAsig(); latMarca(); latCuentas();
}

// Plegado: las asignaturas como insignias de color con su sigla; al pulsar, se abre la asignatura
function latPintaAsig() {
  let a = $('#sasig'); if (!a) { a = document.createElement('div'); a.id = 'sasig'; a.setAttribute('aria-label', 'Asignaturas'); const t = $('#tree'); t.parentNode.insertBefore(a, t); }
  a.replaceChildren();
  const siglas = [...new Set((typeof notes !== 'undefined' ? notes : []).map(x => (typeof sigOf === 'function' ? sigOf(x) : '')).filter(Boolean))].sort();
  for (const s of siglas) {
    const b = el('button', 'sasig-it', s.toUpperCase().slice(0, 4)); b.type = 'button'; b.style.setProperty('--c', (typeof COLOR !== 'undefined' && COLOR[s]) || 'var(--mut)');
    const nom = (typeof NOMBRES !== 'undefined' && NOMBRES[s]) || s.toUpperCase(); b.title = nom; b.setAttribute('aria-label', 'Abrir ' + nom);
    b.onclick = () => { if (typeof goSubject === 'function') goSubject(s); latMarca(); }; a.append(b);
  }
}

// Resalta la pantalla en la que se está
function latMarca() {
  const v = typeof view !== 'undefined' ? view : '', enInicio = v === 'notes' && typeof current !== 'undefined' && !current && typeof hist !== 'undefined' && hist[hp] === '@home';
  document.querySelectorAll('#snav .snav-it').forEach(b => { const vs = b.dataset.v.split(' '); const on = vs.includes(v) && (v !== 'notes' || enInicio); b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}

// Copia el número de no vistos de la campana y de Mensajes (el <b> que ya pintan esos botones)
function latCuentas() {
  document.querySelectorAll('#snav .snav-it[data-de]').forEach(b => { const o = document.getElementById(b.dataset.de), c = o && o.querySelector('b'), x = b.querySelector('.snav-n'); const t = c ? c.textContent.trim() : ''; x.textContent = t; x.hidden = !t; });
}

(function latInicia() {
  if (typeof document === 'undefined' || !$('#side') || !$('#bar')) return;
  const t = document.createElement('button'); t.id = 'sidebtn'; t.type = 'button'; t.textContent = '☰'; t.setAttribute('aria-controls', 'side');
  t.onclick = () => latPliega(); $('#bar').prepend(t);
  latPliega(latLee()); latPintaNav();
  document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'b' && !/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '') && !(e.target && e.target.isContentEditable)) { e.preventDefault(); latPliega(); } });
  // al cambiar de pantalla, de apuntes o de contadores: se actualizan el resaltado, las asignaturas y los números
  const pend = new Set(), tarde = (f) => { if (pend.has(f)) return; pend.add(f); requestAnimationFrame(() => { pend.delete(f); f(); }); };   // una vez por fotograma y por tarea
  const asig = () => { latPintaAsig(); latMarca(); };
  new MutationObserver(() => tarde(latMarca)).observe($('#doc'), { childList: true });
  new MutationObserver(() => tarde(asig)).observe($('#tree'), { childList: true });
  new MutationObserver(() => tarde(latCuentas)).observe($('#bar'), { childList: true, subtree: true, characterData: true });
})();
