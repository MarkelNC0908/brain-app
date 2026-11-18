// Lógica de la ventana de captura rápida
(async () => {
  const $ = (s) => document.querySelector(s), t = $('#t'), s = $('#s'), m = $('#m'), g = $('#g');
  let asig = []; try { asig = await window.rapida.asignaturas(); } catch {}
  s.append(Object.assign(document.createElement('option'), { value: '', textContent: 'Sin asignatura' })); for (const a of asig) s.append(Object.assign(document.createElement('option'), { value: a.sigla, textContent: a.nombre }));
  const tipo = () => (document.querySelector('input[name=k]:checked') || {}).value || 'duda';
  const guarda = async () => {
    const x = t.value.trim(); if (x.length < 3) { m.textContent = 'Escribe algo.'; return; }
    if (tipo() === 'apunte' && !s.value) { m.textContent = 'Elige una asignatura para el apunte rápido.'; return; }
    g.disabled = true; const r = await window.rapida.guardar({ tipo: tipo(), texto: x, sigla: s.value });
    if (r && r.ok) { m.textContent = '✓ Guardado' + (r.ruta ? ' en ' + r.ruta : ''); t.value = ''; setTimeout(() => window.rapida.cerrar(), 600); } else { g.disabled = false; m.textContent = (r && r.msg) || 'No se pudo guardar'; }
  };
  g.onclick = guarda; t.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); guarda(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.rapida.cerrar(); });
  t.focus();
})();
