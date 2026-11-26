// ---------- Apariencia personalizable: temas, fondo de pantalla con imágenes propias, cristal, letra, acento y animaciones ----------
// La parte pura (valores, normalizar y variables CSS) se exporta para las pruebas; el resto solo corre en la página.
// El tema se guarda en este equipo (localStorage, clave brain-apariencia). Las imágenes las guarda el proceso principal en userData/fondos (fondos.js).

const AP_K = 'brain-apariencia';
// Fondos incluidos: degradados CSS (no son ficheros). [nombre, valor de background]
const AP_FONDOS = {
  ninguno: ['Liso', ''],
  aurora: ['Aurora', 'radial-gradient(at 18% 22%, #3a6fd8 0, transparent 52%), radial-gradient(at 82% 28%, #a64fd1 0, transparent 50%), radial-gradient(at 50% 92%, #1aa89a 0, transparent 55%), linear-gradient(#0d1022, #0d1022)'],
  atardecer: ['Atardecer', 'linear-gradient(135deg, #ff9a5a 0%, #ff5e7e 45%, #6a3fd1 100%)'],
  oceano: ['Océano', 'linear-gradient(160deg, #0f3057 0%, #00587a 50%, #008891 100%)'],
  bosque: ['Bosque', 'linear-gradient(150deg, #1d3b2a 0%, #3f6f4a 55%, #c9b77d 100%)'],
  grafito: ['Grafito', 'radial-gradient(circle at 30% 20%, #3b3b46 0, #121216 70%)'],
  papel: ['Papel', 'linear-gradient(180deg, #f6f1e7 0%, #e8e0cf 100%)']
};
// Tipos de letra del sistema (la página no carga fuentes de internet). '' = la de siempre
const AP_FUENTES = {
  sistema: ['Sistema', ''],
  redondeada: ['Redondeada', 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif'],
  humanista: ['Humanista', '"Avenir Next", Avenir, "Segoe UI", Ubuntu, "Helvetica Neue", sans-serif'],
  serif: ['Con serifa', 'ui-serif, "New York", Georgia, "Times New Roman", serif'],
  mono: ['Monoespaciada', 'ui-monospace, "SF Mono", Menlo, Consolas, monospace']
};
// Acentos que se leen bien con texto blanco encima
const AP_ACENTOS = [['#0a84ff', 'Azul'], ['#5e5ce6', 'Índigo'], ['#af52de', 'Violeta'], ['#e5246b', 'Rosa'], ['#d9480f', 'Naranja'], ['#1f8a4c', 'Verde'], ['#0f766e', 'Turquesa'], ['#c2410c', 'Teja']];
const AP_ANIMS = { sin: 'Sin animaciones', suave: 'Suaves', viva: 'Vivas' };
// radio null = las esquinas de siempre (cada recuadro con la suya)
const AP_DEF = { fondo: 'ninguno', acento: '#0a84ff', fuente: 'sistema', cristal: false, opac: 60, blur: 18, borde: false, radio: null, anim: 'sin', velo: 0, fblur: 0 };
const AP_PRESETS = {
  clasico: ['Clásico', Object.assign({}, AP_DEF)],
  cristal: ['Cristal aurora', { fondo: 'aurora', acento: '#5e5ce6', fuente: 'sistema', cristal: true, opac: 45, blur: 22, borde: true, radio: 16, anim: 'suave', velo: 0, fblur: 0, tema: 'oscuro' }],
  noche: ['Noche', { fondo: 'grafito', acento: '#af52de', fuente: 'redondeada', cristal: true, opac: 65, blur: 12, borde: true, radio: 12, anim: 'viva', velo: 0, fblur: 0, tema: 'oscuro' }],
  papel: ['Papel', { fondo: 'papel', acento: '#c2410c', fuente: 'serif', cristal: false, opac: 60, blur: 18, borde: false, radio: 6, anim: 'sin', velo: 0, fblur: 0, tema: 'claro' }]
};
const AP_IMG = /^img:[a-f0-9]{16}\.(jpg|jpeg|png|webp|gif)$/;

const apNum = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, Math.round(n))) : d; };
// Deja solo valores conocidos y dentro de rango (lo que venga de localStorage o de un tema importado)
function apNormaliza(o) {
  o = o && typeof o === 'object' ? o : {}; const d = AP_DEF;
  return {
    fondo: typeof o.fondo === 'string' && (AP_FONDOS[o.fondo] || AP_IMG.test(o.fondo)) ? o.fondo : d.fondo,
    acento: typeof o.acento === 'string' && /^#[0-9a-f]{6}$/i.test(o.acento) ? o.acento.toLowerCase() : d.acento,
    fuente: AP_FUENTES[o.fuente] ? o.fuente : d.fuente,
    cristal: o.cristal === true,
    opac: apNum(o.opac, 10, 95, d.opac),
    blur: apNum(o.blur, 0, 40, d.blur),
    borde: o.borde === true,
    radio: o.radio === null || o.radio === undefined ? null : apNum(o.radio, 0, 28, null),
    anim: AP_ANIMS[o.anim] ? o.anim : d.anim,
    velo: apNum(o.velo, 0, 80, d.velo),
    fblur: apNum(o.fblur, 0, 30, d.fblur)
  };
}
// Variables CSS (en :root) y clases (en body) que aplican un tema. '' = quitar la variable
function apVars(t) {
  t = apNormaliza(t);
  const vars = {
    '--acc': t.acento, '--sel': t.acento + '33', '--font': AP_FUENTES[t.fuente][1],
    '--glass-a': String(t.opac / 100), '--glass-blur': t.blur + 'px', '--glass-edge': t.borde ? 'rgba(255,255,255,.3)' : '',
    '--rc': t.radio === null ? '' : t.radio + 'px', '--velo': String(t.velo / 100), '--fblur': t.fblur + 'px'
  };
  const clases = [];
  if (t.fondo !== 'ninguno') clases.push('ap-fondo');
  if (t.cristal) clases.push('ap-cristal');
  if (t.radio !== null) clases.push('ap-radio');
  if (t.fblur > 0) clases.push('ap-fblur');
  if (t.anim !== 'sin') clases.push('ap-anim-' + t.anim);
  return { vars, clases };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { AP_DEF, AP_PRESETS, AP_FONDOS, AP_FUENTES, AP_ACENTOS, AP_ANIMS, apNormaliza, apVars };

// ---------- En la página ----------
let apTema = AP_DEF, apUrl = '', apUrlId = '';
function apLee() { try { return JSON.parse(localStorage.getItem(AP_K) || '{}'); } catch { return {}; } }
function apGuarda(cambios) { apTema = apNormaliza(Object.assign({}, apTema, cambios)); try { localStorage.setItem(AP_K, JSON.stringify(apTema)); } catch {} return apAplica(); }
const apHayFondos = () => !!(window.brain && window.brain.fondosLista && window.brain.fondoDatos);

async function apAplica(t = apTema) {
  const r = document.documentElement, b = document.body; if (!b) return; const { vars, clases } = apVars(t);
  for (const [k, v] of Object.entries(vars)) { if (v === '') r.style.removeProperty(k); else r.style.setProperty(k, v); }
  for (const c of [...b.classList]) if (c.startsWith('ap-')) b.classList.remove(c);
  if (clases.length) b.classList.add(...clases);
  let f = document.getElementById('fondo'); if (!f) { f = document.createElement('div'); f.id = 'fondo'; f.setAttribute('aria-hidden', 'true'); f.append(document.createElement('i')); b.prepend(f); }
  const capa = f.firstChild;
  if (t.fondo.startsWith('img:')) {
    // imagen propia: siempre llena la ventana, centrada y sin deformarse (cover); se recorta lo que sobre
    const id = t.fondo.slice(4);
    if (apUrlId !== id) {
      apUrlId = id; apUrl = '';
      let d = null; if (apHayFondos()) { try { d = await window.brain.fondoDatos(id); } catch {} }
      if (apUrlId !== id) return;   // mientras tanto se eligió otro
      apUrl = d && d.ok ? d.url : '';
    }
    // tamaño, posición y repetición vienen del CSS (#fondo i: cover, centrada, sin repetir)
    if (apUrl) capa.style.backgroundImage = `url("${apUrl}")`;
    else { capa.style.backgroundImage = ''; b.classList.remove('ap-fondo'); }   // la imagen ya no está: sin fondo
  } else { apUrlId = ''; apUrl = ''; capa.style.backgroundImage = AP_FONDOS[t.fondo][1]; }
}

// Controles de Ajustes › Apariencia (los llama pintaApariencia de extras.js, debajo del tamaño de letra y del modo)
async function apPintaControles(w, tk) {
  const t = apTema, rep = () => { if (typeof pintaApariencia === 'function') pintaApariencia(); };
  const h = (x) => w.append(el('h3', 'ap-h', x));
  const fila = () => { const d = el('div', 'ap-fila'); w.append(d); return d; };

  h('Temas');
  const tp = fila();
  for (const [id, [n, p]] of Object.entries(AP_PRESETS)) {
    const b = el('button', 'ap-preset'); b.type = 'button'; const m = el('span', 'ap-prev'); m.style.background = AP_FONDOS[p.fondo][1] || 'var(--bg)'; b.append(m, el('span', null, n));
    b.onclick = async () => { const { tema, ...v } = p; await apGuarda(v); if (tema && window.brain && window.brain.ajustesSet) { try { await window.brain.ajustesSet({ tema }); } catch {} } rep(); };
    tp.append(b);
  }

  h('Fondo de pantalla');
  if (apHayFondos()) {
    const ad = fila(), add = el('button', 'pri', 'Añadir imágenes…'); add.type = 'button'; ad.append(add, el('span', 'dsub', 'JPG, PNG, WebP o GIF, hasta 25 MB. Se copian a la carpeta de la app: no van al Brain ni a GitHub.'));
    const msg = el('p', 'dsub'); w.append(msg);
    add.onclick = async () => {
      add.disabled = true; let r = null; try { r = await window.brain.fondosAnadir(); } catch {} add.disabled = false;
      if (!r || !r.ok) { msg.textContent = (r && r.msg) || ''; return; }
      if (r.anadidas && r.anadidas.length) { await apGuarda({ fondo: 'img:' + r.anadidas[r.anadidas.length - 1] }); rep(); }
      if (r.errores && r.errores.length) { msg.textContent = r.errores.map(e => `${e.nombre}: ${e.msg}`).join(' · '); }
    };
    let l = []; try { l = (await window.brain.fondosLista()) || []; } catch {}
    if (!w.isConnected || (tk && w.dataset.tk !== tk)) return;
    if (l.length) {
      const g = el('div', 'ap-gal'); w.append(g);
      for (const f of l) {
        const c = el('div', 'ap-mini'), b = el('button', 'ap-img' + (t.fondo === 'img:' + f.id ? ' on' : '')); b.type = 'button'; b.title = f.nombre; b.setAttribute('aria-label', 'Usar ' + f.nombre + ' de fondo');
        if (f.mini) b.style.backgroundImage = `url("${f.mini}")`;
        b.onclick = async () => { await apGuarda({ fondo: 'img:' + f.id }); rep(); };
        const x = el('button', 'ap-x', '✕'); x.type = 'button'; x.title = 'Quitar'; x.setAttribute('aria-label', 'Quitar ' + f.nombre);
        x.onclick = async () => { try { await window.brain.fondosQuitar(f.id); } catch {} if (apTema.fondo === 'img:' + f.id) await apGuarda({ fondo: 'ninguno' }); rep(); };
        c.append(b, x); g.append(c);
      }
    } else w.append(el('p', 'dsub', 'Aún no has añadido imágenes. Puedes añadir todas las que quieras y cambiar entre ellas.'));
  } else w.append(el('p', 'dsub', 'Las imágenes propias de fondo están en la app de escritorio. Aquí puedes usar los fondos incluidos.'));
  w.append(el('p', 'dsub', 'Incluidos'));
  const inc = fila();
  for (const [id, [n, css]] of Object.entries(AP_FONDOS)) {
    const b = el('button', 'ap-inc' + (t.fondo === id ? ' on' : '')); b.type = 'button'; b.title = n; b.setAttribute('aria-label', 'Fondo ' + n); b.style.background = css || 'var(--bg)';
    b.onclick = async () => { await apGuarda({ fondo: id }); rep(); }; inc.append(b);
  }
  w.append(el('p', 'dsub', 'La imagen llena sola la ventana, centrada y sin deformarse; si su forma no coincide, se recorta lo que sobra.'));
  apRango(w, 'Desenfocar el fondo', 'fblur', 0, 30, 1, ' px');
  apRango(w, 'Oscurecer el fondo', 'velo', 0, 80, 5, ' %');

  h('Texto y color');
  const ft = fila(), fs = el('select'); fs.setAttribute('aria-label', 'Tipo de letra');
  for (const [id, [n]] of Object.entries(AP_FUENTES)) fs.append(Object.assign(el('option', null, n), { value: id }));
  fs.value = t.fuente; fs.onchange = () => apGuarda({ fuente: fs.value }); ft.append(el('span', null, 'Tipo de letra:'), fs);
  const ac = fila(); ac.append(el('span', null, 'Color de acento:'));
  for (const [c, n] of AP_ACENTOS) { const b = el('button', 'ap-acc' + (t.acento === c ? ' on' : '')); b.type = 'button'; b.title = n; b.setAttribute('aria-label', 'Acento ' + n); b.style.background = c; b.onclick = async () => { await apGuarda({ acento: c }); rep(); }; ac.append(b); }
  const cp = el('input'); cp.type = 'color'; cp.value = t.acento; cp.title = 'Otro color'; cp.setAttribute('aria-label', 'Otro color de acento'); cp.onchange = async () => { await apGuarda({ acento: cp.value }); rep(); }; ac.append(cp);

  h('Recuadros');
  const cr = fila(), ck = el('label', 'msg-chk'), ci = el('input'); ci.type = 'checkbox'; ci.checked = t.cristal; ci.onchange = () => apGuarda({ cristal: ci.checked }); ck.append(ci, document.createTextNode(' Efecto cristal (translúcido y desenfocado)')); cr.append(ck);
  apRango(w, 'Desenfoque del cristal', 'blur', 0, 40, 1, ' px');
  apRango(w, 'Opacidad del cristal', 'opac', 10, 95, 5, ' %');
  const bd = fila(), bl = el('label', 'msg-chk'), bi = el('input'); bi.type = 'checkbox'; bi.checked = t.borde; bi.onchange = () => apGuarda({ borde: bi.checked }); bl.append(bi, document.createTextNode(' Borde brillante')); bd.append(bl);
  apRango(w, 'Esquinas', 'radio', 0, 28, 1, ' px', 12);

  h('Animaciones');
  const an = fila(), as = el('select'); as.setAttribute('aria-label', 'Animaciones');
  for (const [id, n] of Object.entries(AP_ANIMS)) as.append(Object.assign(el('option', null, n), { value: id }));
  as.value = t.anim; as.onchange = () => apGuarda({ anim: as.value }); an.append(as, el('span', 'dsub', 'Suaves: los recuadros entran deslizándose. Vivas: con rebote y el fondo con un zoom lento. Si el sistema pide reducir el movimiento, no se anima nada.'));

  const fin = fila(); fin.classList.add('ap-fin');
  const ex = el('button', null, 'Exportar tema'); ex.type = 'button';
  ex.onclick = async () => { const o = Object.assign({ brainTema: 1 }, apTema); if (o.fondo.startsWith('img:')) o.fondo = 'ninguno';   // las imágenes propias no viajan en el tema
    if (window.brain && window.brain.textoGuardar) { try { await window.brain.textoGuardar({ nombre: 'brain-tema.json', texto: JSON.stringify(o, null, 1), extension: 'json', titulo: 'Exportar tema' }); } catch {} } };
  const im = el('label', 'ap-imp', 'Importar tema…'), ii = el('input'); ii.type = 'file'; ii.accept = '.json,application/json'; im.append(ii);
  const res = el('span', 'dsub');
  ii.onchange = async () => { const f = ii.files && ii.files[0]; ii.value = ''; if (!f) return; let o = null; try { o = JSON.parse(await f.text()); } catch {} if (!o || o.brainTema !== 1) { res.textContent = 'Ese fichero no es un tema de Brain.'; return; } await apGuarda(apNormaliza(o)); rep(); };
  const rs = el('button', null, 'Restablecer'); rs.type = 'button'; rs.onclick = async () => { await apGuarda(AP_DEF); rep(); };
  fin.append(ex, im, rs, res);
}

// Deslizador con su valor al lado; cambia el tema al momento sin repintar la sección
function apRango(w, txt, k, min, max, step, ud, sinValor) {
  const l = el('label', 'ap-rango'), top = el('span'), v = el('b'), i = el('input'), val = apTema[k] === null ? sinValor : apTema[k];
  i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = val; v.textContent = val + ud;
  top.append(document.createTextNode(txt + ' '), v); l.append(top, i); w.append(l);
  i.oninput = () => { v.textContent = i.value + ud; apGuarda({ [k]: Number(i.value) }); };
}

if (typeof document !== 'undefined') { apTema = apNormaliza(apLee()); apAplica(); }
