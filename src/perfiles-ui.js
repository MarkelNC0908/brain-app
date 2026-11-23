// Interfaz de perfiles: pantalla «¿quién eres?», PIN, alta/edición con selector de carpeta y URL del campus, y alta de asignaturas.
let PROFILE = null;   // perfil activo: { id, name, vault, campusUrl, dashboardUrl, hasPin }
const COL_AV = ['#0a84ff', '#bf5af2', '#ff453a', '#ff9f0a', '#30b0c7', '#30d158'];
const inicial = (n) => ((n || '?').trim()[0] || '?').toUpperCase();

async function gate() {
  let st = await window.brain.profState();
  while (!st.current) st = await pantallaPerfiles(st);
  PROFILE = st.active; if (typeof cargaP === 'function') cargaP(PROFILE.id); pintaChip();
}
function pintaChip() {
  const w = document.getElementById('who'); w.hidden = false; w.textContent = `👤 ${PROFILE.name}`;
  w.onclick = (e) => { e.stopPropagation(); menuPerfil(w); };
}
function menuPerfil(anchor) {
  document.querySelectorAll('.pmenu').forEach(m => m.remove());
  const m = el('div', 'pmenu'), b1 = el('button', null, '⇄ Cambiar de perfil'), b2 = el('button', null, '✎ Editar perfil…');
  b1.onclick = () => window.brain.profLogout(); b2.onclick = () => { m.remove(); editarPerfil(); };
  m.append(b1, b2); anchor.after(m); setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
}

// ---------- pantalla de selección de perfil (obligatoria al abrir si hay varios o hay PIN) ----------
function pantallaPerfiles(st) {
  return new Promise((resolve) => {
    const o = el('div', 'profscreen'); document.body.append(o);
    const fin = (ns) => { o.remove(); resolve(ns); };
    const dibuja = (s) => {
      o.replaceChildren();
      if (!s.profiles.length) { o.append(el('h1', null, 'Crea tu perfil'), el('p', 'dsub', 'Un perfil guarda tu carpeta de Brain, tu campus y tu progreso; nada se mezcla con el de otras personas.')); o.append(formPerfil(null, s, fin, null)); return; }
      o.append(el('h1', null, '¿Quién va a estudiar?'));
      const cards = el('div', 'pcards'), msg = el('p', 'note', '');
      s.profiles.forEach((p, i) => {
        const c = el('div', 'pcard'), av = el('div', 'av', inicial(p.name)); av.style.setProperty('--c', COL_AV[i % COL_AV.length]);
        c.append(av, el('b', null, p.name), el('small', null, p.hasPin ? '🔒 protegido con PIN' : p.vault.split(/[\\/]/).pop()));
        c.onclick = () => entrar(p, msg); c.tabIndex = 0; c.setAttribute('role', 'button'); c.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrar(p, msg); } };
        // ✎ = editar este perfil sin entrar en él (añadir o cambiar el PIN, carpeta, campus, borrarlo)
        const ed = el('button', 'ed', '✎'); ed.title = 'Editar perfil o añadir PIN'; ed.onclick = (e) => { e.stopPropagation(); o.replaceChildren(el('h1', null, 'Editar perfil'), formPerfil(p, s, fin, () => dibuja(s))); };
        c.append(ed); cards.append(c);
      });
      const add = el('div', 'pcard'), plus = el('div', 'av', '+'); plus.style.setProperty('--c', 'var(--mut)'); add.append(plus, el('b', null, 'Nuevo perfil'), el('small', null, 'otra persona o Brain'));
      add.onclick = () => { o.replaceChildren(el('h1', null, 'Nuevo perfil'), formPerfil(null, s, fin, () => dibuja(s))); }; add.tabIndex = 0; add.setAttribute('role', 'button'); add.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add.onclick(); } };
      cards.append(add); o.append(cards, el('p', 'note', 'Pulsa ✎ en un perfil para editarlo o añadirle un PIN.'), msg);
      if (window.brain.logLeer && typeof abreRegistro === 'function') { const lg = el('button', 'ver-log', '📜 Ver registro'); lg.title = 'Lo que ha hecho la app y los errores, para pedir ayuda si algo no funciona'; lg.onclick = () => abreRegistro(); o.append(lg); }
    };
    const entrar = async (p, msg) => {
      let pin = ''; if (p.hasPin) { pin = await pedirPin(p.name); if (pin === null) return; }
      msg.textContent = 'Entrando…'; let r;
      try { r = await window.brain.profLogin(p.id, pin); } catch (e) { r = { ok: false, msg: 'No se pudo entrar: ' + ((e && e.message) || e) }; if (window.brain.logEvento) window.brain.logEvento('error', 'perfil', 'profLogin falló: ' + r.msg); }
      if (r && r.ok) fin(r); else msg.textContent = ((r && r.msg) || 'No se pudo entrar') + (typeof abreRegistro === 'function' ? ' · pulsa «Ver registro» para ver el detalle.' : '');
    };
    dibuja(st);
  });
}
function pedirPin(nombre) {
  return new Promise((res) => {
    const ov = el('div', 'ov arriba'), b = el('div', 'box'); ov.append(b);   // 'arriba': por encima de la pantalla de perfiles (si no, el clic en «Entrar» lo recibe lo que hay debajo)
    const i = el('input'); i.type = 'password'; i.placeholder = 'PIN'; i.inputMode = 'numeric'; i.autocomplete = 'off';
    const ok = el('button', 'pri', 'Entrar'), no = el('button', null, 'Cancelar'), row = el('div', 'row'); row.append(no, ok);
    b.append(el('h3', null, `PIN de ${nombre}`), i, row); document.body.append(ov); i.focus();
    const cierra = (v) => { ov.remove(); res(v); }; ok.onclick = () => cierra(i.value); no.onclick = () => cierra(null);
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); if (e.key === 'Escape') no.click(); });
  });
}

// ---------- formulario de perfil (alta y edición) ----------
// perfil = null → alta · onCancel = null → no se puede cancelar (primer perfil) · fin(estado) se llama al terminar
function formPerfil(perfil, st, fin, onCancel) {
  const f = el('div', 'pform'); let carpeta = perfil ? perfil.vault : '', tiene = true;
  const campo = (etq, nodo) => { const l = el('label', null, etq); l.append(nodo); f.append(l); return nodo; };
  const inp = (ph, val, type) => { const i = el('input'); i.placeholder = ph || ''; i.value = val || ''; if (type) i.type = type; i.autocomplete = 'off'; return i; };
  const nombre = campo('Nombre', inp('Tu nombre', perfil && perfil.name));
  const fila = el('div', 'fila'), ruta = el('span', 'ruta', carpeta || 'Ninguna carpeta elegida'), btn = el('button', null, 'Elegir carpeta…'); fila.append(ruta, btn); campo('Carpeta de tu Brain', fila);
  const aviso = el('p', 'note', ''); f.append(aviso);
  const crearEst = el('input'); crearEst.type = 'checkbox'; const crearL = el('label', 'chk', 'Crear en ella la estructura de un Brain (02-Asignaturas/)'); crearL.prepend(crearEst); crearL.style.display = 'none'; f.append(crearL);
  btn.onclick = async () => { const r = await window.brain.profPickFolder(); if (!r) return; carpeta = r.path; tiene = r.tieneBrain; ruta.textContent = carpeta; crearEst.checked = false; crearL.style.display = tiene ? 'none' : '';
    aviso.textContent = tiene ? '' : 'No hace falta un Brain: se usará tal cual como carpeta de apuntes (cada subcarpeta es una asignatura; se leen .md y .txt y los PDF/Word se abren con su aplicación). Marca la casilla solo si prefieres crear la estructura de un Brain.'; };
  const tipo = campo('Tipo de campus virtual', el('select'));
  for (const [v, t] of [['blackboard', 'Blackboard'], ['moodle', 'Moodle'], ['canvas', 'Canvas'], ['ical', 'Otro campus: calendario iCal (cualquier universidad)']]) tipo.append(Object.assign(el('option', null, t), { value: v }));
  tipo.value = (perfil && perfil.lms) || 'blackboard'; Object.assign(tipo.style, { padding: '9px 11px', border: '0', borderRadius: '9px', background: 'var(--hover)', color: 'var(--fg)', font: 'inherit' });
  const campusL = el('label', null, ''), campus = inp('https://tu-campus.universidad.es', perfil && perfil.campusUrl), icalL = el('label', null, ''), ical = inp('https://… o webcal://… (calendario exportado de tu campus)', perfil && perfil.icalUrl);
  campusL.append(campus); icalL.append(ical); f.append(campusL, icalL);
  const AYUDA = { blackboard: ['URL de tu campus Blackboard (opcional)', 'https://tu-campus.blackboard.com'], moodle: ['URL de tu Moodle (opcional; si está en una subcarpeta, inclúyela)', 'https://campus.universidad.es/moodle'], canvas: ['URL de tu Canvas (opcional)', 'https://universidad.instructure.com'] };
  const ajusta = () => { const t = tipo.value; icalL.style.display = t === 'ical' ? '' : 'none'; campusL.style.display = t === 'ical' ? 'none' : '';
    if (t === 'ical') { icalL.firstChild && (icalL.childNodes[0].nodeType === 3 ? (icalL.childNodes[0].textContent = 'Dirección de tu calendario iCal (secreta: equivale a una contraseña de lectura)') : icalL.prepend(document.createTextNode('Dirección de tu calendario iCal (secreta: equivale a una contraseña de lectura)'))); }
    else { const [txt, ph] = AYUDA[t]; campus.placeholder = ph; campusL.childNodes[0].nodeType === 3 ? (campusL.childNodes[0].textContent = txt) : campusL.prepend(document.createTextNode(txt)); } };
  tipo.onchange = ajusta; ajusta();
  const web = campo('URL de tu dashboard web (opcional)', inp('https://…', perfil && perfil.dashboardUrl));
  const hayPin = !!(perfil && perfil.hasPin);
  const pinNuevo = campo(hayPin ? 'PIN nuevo (vacío = no cambiarlo)' : 'PIN para proteger el perfil (opcional, 4-12 números)', inp('', '', 'password')); pinNuevo.inputMode = 'numeric';
  let quitar = null, pinActual = null;
  if (hayPin) { quitar = el('input'); quitar.type = 'checkbox'; const l = el('label', 'chk', 'Quitar el PIN'); l.prepend(quitar); f.append(l); pinActual = campo('PIN actual (necesario para guardar cambios o borrar el perfil)', inp('', '', 'password')); pinActual.inputMode = 'numeric'; }
  const nota = el('p', 'note', 'El PIN solo evita que otra persona entre por error en tu perfil; no cifra tu Brain.'); f.append(nota);
  const msg = el('p', 'note err', ''); f.append(msg);
  const fila2 = el('div', 'row'); f.append(fila2);
  if (onCancel || perfil) { const c = el('button', null, 'Cancelar'); c.onclick = () => (onCancel ? onCancel() : fin(null)); fila2.append(c); }
  if (perfil) {
    const d = el('button', 'danger', 'Borrar perfil'); let seguro = false;
    d.onclick = async () => { if (!seguro) { seguro = true; d.textContent = '¿Seguro? Pulsa otra vez (tu carpeta del Brain NO se borra)'; return; } const r = await window.brain.profDelete(perfil.id, pinActual ? pinActual.value : ''); if (r.ok) location.reload(); else { msg.textContent = r.msg; seguro = false; d.textContent = 'Borrar perfil'; } };
    fila2.append(d);
  }
  const ok = el('button', 'pri', perfil ? 'Guardar' : 'Crear perfil'); fila2.append(ok);
  ok.onclick = async () => {
    msg.textContent = ''; ok.disabled = true;
    try {
      if (!carpeta) throw new Error('Elige la carpeta de tu Brain');
      if (!tiene && crearEst.checked) { const i = await window.brain.profInitBrain(carpeta); if (!i.ok) throw new Error(i.msg); }
      const datos = { name: nombre.value, vault: carpeta, lms: tipo.value, campusUrl: campus.value, icalUrl: ical.value, dashboardUrl: web.value };
      if (perfil) {
        if (quitar && quitar.checked) datos.pin = ''; else if (pinNuevo.value) datos.pin = pinNuevo.value;
        const r = await window.brain.profUpdate(perfil.id, datos, pinActual ? pinActual.value : ''); if (!r.ok) throw new Error(r.msg);
        location.reload(); return;
      }
      datos.pin = pinNuevo.value; const r = await window.brain.profCreate(datos); if (!r.ok) throw new Error(r.msg);
      const l = await window.brain.profLogin(r.id, pinNuevo.value); if (!l.ok) throw new Error(l.msg); fin(l);
    } catch (e) { msg.textContent = String(e.message || e); ok.disabled = false; }
  };
  return f;
}
function editarPerfil() {
  if (!PROFILE) return;
  const o = el('div', 'profscreen'); document.body.append(o);
  window.brain.profState().then((st) => { const p = st.profiles.find(x => x.id === PROFILE.id) || PROFILE; o.append(el('h1', null, 'Editar perfil'), formPerfil(p, st, () => o.remove(), null)); });
}
if (window.brain && window.brain.onEditProfile) window.brain.onEditProfile(() => editarPerfil());

// ---------- alta de asignatura ----------
function dialogoAsignatura() {
  return new Promise((res) => {
    const ov = el('div', 'ov'), b = el('div', 'box'); ov.append(b);
    const s = el('input'), n = el('input'), msg = el('p', 'note err', ''), row = el('div', 'row'), ok = el('button', 'pri', 'Crear'), no = el('button', null, 'Cancelar');
    const libre = typeof PROFILE !== 'undefined' && PROFILE && PROFILE.modo === 'carpeta';   // en una carpeta libre solo hace falta el nombre (se crea la subcarpeta)
    s.placeholder = 'Sigla (p. ej. BD)'; n.placeholder = 'Nombre (p. ej. Bases de Datos)'; s.autocomplete = n.autocomplete = 'off'; if (libre) s.style.display = 'none';
    row.append(no, ok); b.append(el('h3', null, 'Nueva asignatura'), el('p', 'note', libre ? 'Crea una subcarpeta con ese nombre dentro de tu carpeta de apuntes.' : 'Crea 02-Asignaturas/<sigla>/ con su ficha y las carpetas apuntes, entregas y recursos.'), s, n, msg, row); document.body.append(ov); (libre ? n : s).focus();
    no.onclick = () => { ov.remove(); res(false); };
    ok.onclick = async () => { const r = await window.brain.subjAdd(s.value, n.value); if (r.ok) { ov.remove(); res(true); } else msg.textContent = r.msg; };
  });
}

// ---------- alta de entrega (para quien aún no tiene ninguna en su Brain) ----------
function dialogoEntrega() {
  return new Promise((res) => {
    const ov = el('div', 'ov'), b = el('div', 'box'); ov.append(b);
    const sig = el('select'), tit = el('input'), fec = el('input'), est = el('select'), nota = el('input'), msg = el('p', 'note err', '');
    for (const k of Object.keys(NOMBRES)) sig.append(Object.assign(el('option', null, NOMBRES[k]), { value: k }));
    for (const [v, t] of [['todo', 'Por hacer'], ['doing', 'En curso'], ['sent', 'Entregado'], ['done', 'Corregido']]) est.append(Object.assign(el('option', null, t), { value: v }));
    tit.placeholder = 'Título (p. ej. Práctica 1)'; fec.type = 'date'; nota.placeholder = 'Nota si está corregida (p. ej. 8,5/10)'; tit.autocomplete = nota.autocomplete = 'off';
    const row = el('div', 'row'), ok = el('button', 'pri', 'Añadir'), no = el('button', null, 'Cancelar'); row.append(no, ok);
    b.append(el('h3', null, 'Nueva entrega'), sig, tit, fec, est, nota, msg, row); document.body.append(ov); tit.focus();
    for (const x of [sig, est]) Object.assign(x.style, { width: '100%', padding: '9px', border: '0', borderRadius: '8px', background: 'var(--hover)', color: 'var(--fg)', font: 'inherit', marginTop: '6px' });
    no.onclick = () => { ov.remove(); res(false); };
    ok.onclick = async () => { const r = await window.brain.dashAdd({ sigla: sig.value, titulo: tit.value, fecha: fec.value, col: est.value, nota: est.value === 'done' ? nota.value.trim() : '' }); if (r.ok) { ov.remove(); res(true); } else msg.textContent = r.msg; };
  });
}
