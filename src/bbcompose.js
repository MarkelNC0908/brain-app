// Conductor de la pantalla «Nuevo mensaje» de Blackboard Ultra (/ultra/courses/<curso>/messages/create).
// Se inyecta en la página (ventana de la app con la sesión del perfil) y maneja el formulario como lo haría una persona:
// busca destinatarios, los elige por su data-participant-id (no por el nombre), escribe el texto y lee el estado. Nada se envía
// hasta llamar a enviar(), que solo existe aquí para que la app lo llame DESPUÉS de comprobar destinatarios y texto.
// Estructura observada en el campus (2026-11-18): input#participant-search-input («Para:»), sugerencias li[role=menuitem][data-participant-id]
// (img, bdi = nombre, un div = usuario, span = rol), cada elegido es un <span>nombre</span> + button[aria-label «Eliminar participante…»],
// editor div#message-reply[contenteditable], casilla #send-email («copia por correo») y botón «Enviar» (deshabilitado hasta que haya destinatario y texto).
const DRIVER = String.raw`(() => {
  if (window.__bbc) return 'ya';
  const esp = (ms) => new Promise(r => setTimeout(r, ms));
  const esperar = async (f, ms = 8000, paso = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = f(); if (v) return v; await esp(paso); } return null; };
  const txt = (e) => (e ? e.textContent.trim() : '');
  const entrada = () => document.querySelector('#participant-search-input');
  const editor = () => document.querySelector('#message-reply');
  const opciones = () => [...document.querySelectorAll('li[role=menuitem][data-participant-id]')];
  const leer = (o) => { const c = o.children[1]; return { id: o.getAttribute('data-participant-id'), nombre: txt(o.querySelector('bdi')), usuario: txt(c && c.children[1]), rol: txt(c && c.querySelector('span')) }; };
  const chips = () => [...document.querySelectorAll('button[aria-label^="Eliminar participante"]')].map(b => txt(b.previousElementSibling));
  const botonEnviar = () => [...document.querySelectorAll('button')].find(b => txt(b) === 'Enviar');
  const listo = () => !!(entrada() && editor() && botonEnviar());
  const escribir = (q) => { const i = entrada(); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, q); i.dispatchEvent(new Event('input', { bubbles: true })); };
  // sugerencias para una búsqueda: se espera a que la lista deje de cambiar para no leer la de la búsqueda anterior
  const buscar = async (q) => {
    escribir(q); await esp(900);
    let prev = '', iguales = 0; const t0 = Date.now();
    while (Date.now() - t0 < 7000 && iguales < 2) { const k = opciones().map(o => o.getAttribute('data-participant-id')).join(','); iguales = k === prev ? iguales + 1 : 0; prev = k; await esp(350); }
    return opciones().map(leer);
  };
  const elegir = async (id, q) => {
    const antes = chips().length; await buscar(q);
    const o = opciones().find(x => x.getAttribute('data-participant-id') === id);
    if (!o) return { ok: false, msg: 'no aparece entre las sugerencias', chips: chips() };
    o.click(); const ok = await esperar(() => chips().length === antes + 1, 4000);
    return { ok: !!ok, chips: chips() };
  };
  const estado = () => { const e = editor(), b = botonEnviar(), cb = document.querySelector('#send-email'); return { chips: chips(), texto: e ? e.innerText.replace(/ /g, ' ').trim() : '', enviarActivo: !!(b && !b.disabled && b.getAttribute('aria-disabled') !== 'true'), copia: !!(cb && cb.checked), ruta: location.pathname }; };
  // el editor de Blackboard solo acepta bien la entrada real de teclado (execCommand falla tras la primera línea): la app escribe con eventos reales
  const foco = () => { const e = editor(); if (!e) return false; e.focus(); return document.activeElement === e; };
  const copia = async (v) => { const cb = document.querySelector('#send-email'); if (cb && cb.checked !== !!v) { cb.click(); await esp(300); } return !!(cb && cb.checked === !!v); };
  const enviar = () => { const b = botonEnviar(); if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return { ok: false, msg: 'El botón Enviar no está activo' }; b.click(); return { ok: true }; };
  window.__bbc = { listo, buscar, elegir, estado, foco, copia, enviar, chips };
  return 'instalado';
})()`;
module.exports = { DRIVER };
