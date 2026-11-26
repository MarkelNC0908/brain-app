// ---------- Lectura de apuntes e Inicio ----------
// Apuntes: etiquetas [verificado]/[pendiente]/[supuesto]/[TEST diap. N] como chips de color, índice del apunte («En este apunte»),
// bloques de código con colores y botón «Copiar», y enlaces «diap. N» que abren el PDF del profesor en esa página (pdf.js).
// Inicio: tarjetas de cuenta atrás al próximo examen y entrega, racha de estudio y «sigue donde lo dejaste».
// Lo que se guarda (último apunte, días de estudio) vive en este equipo por perfil: brain-ultimo{-perfil}, brain-dias{-perfil}.

const suf_ = () => (typeof sufPerfil === 'function' ? sufPerfil() : '');
const lecLee = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k + suf_()) || 'null'); return v == null ? d : v; } catch { return d; } };
const lecGuarda = (k, v) => { try { localStorage.setItem(k + suf_(), JSON.stringify(v)); } catch {} };
const hoyIso = () => (typeof isoDe === 'function' ? isoDe(new Date()) : new Date().toISOString().slice(0, 10));
// Días en los que se ha estudiado (abrir apuntes, Estudiar, simulacros o temporizador): para la racha
function marcaDiaEstudio() { const d = lecLee('brain-dias', []), h = hoyIso(); if (!d.includes(h)) { d.push(h); lecGuarda('brain-dias', d.slice(-400)); } }
function rachaEstudio() {
  const dias = new Set(lecLee('brain-dias', [])); if (typeof leePomo === 'function') for (const x of leePomo()) dias.add(x.fecha);
  const menos1 = (f) => { const d = new Date(f + 'T00:00'); d.setDate(d.getDate() - 1); return isoDe(d); };
  let r = 0, h = hoyIso(); for (let d = dias.has(h) ? h : menos1(h); dias.has(d); d = menos1(d)) r++; return { racha: r, hoy: dias.has(h), total: dias.size };
}

// ---------- chips de estado ----------
const LEC_CHIP = /\[(verificado(?: en el PDF)?|pendiente|PENDIENTE|supuesto|corregido|TEST diap\. ?\d+(?:[-–]\d+)?)\]/g;
function lecChips(raiz) {
  const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && n.parentElement.closest('pre,code,.chip') ? NodeFilter.FILTER_REJECT : LEC_CHIP.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  const nodos = []; let n; while ((n = w.nextNode())) nodos.push(n);
  for (const t of nodos) {
    const f = document.createDocumentFragment(), s = t.nodeValue; let i = 0; LEC_CHIP.lastIndex = 0; let m;
    while ((m = LEC_CHIP.exec(s))) {
      if (m.index > i) f.append(s.slice(i, m.index));
      const k = m[1].toLowerCase(), c = /^verificado|^corregido/.test(k) ? 'ok' : /^pendiente/.test(k) ? 'pe' : /^supuesto/.test(k) ? 'su' : 'test';
      f.append(el('span', 'chip chip-' + c, m[1])); i = m.index + m[0].length;
    }
    if (i < s.length) f.append(s.slice(i)); t.replaceWith(f);
  }
}

// ---------- índice del apunte ----------
const lecSlug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'apartado';
function lecIndice() {
  const hs = [...doc.querySelectorAll('h2, h3')]; if (hs.filter(h => h.tagName === 'H2').length < 3) return;
  const usados = new Set(), det = el('details', 'toc'); det.open = true; det.append(el('summary', null, `En este apunte (${hs.filter(h => h.tagName === 'H2').length} apartados)`));
  const ul = el('ul');
  for (const h of hs) {
    let id = lecSlug(h.textContent); while (usados.has(id)) id += '-2'; usados.add(id); h.id = 'h-' + id;
    const li = el('li', h.tagName === 'H3' ? 'toc-3' : null), a = el('a', 'it toc-a', h.textContent.replace(/\s+/g, ' ').trim()); a.href = '#h-' + id;
    a.onclick = (e) => { e.preventDefault(); h.scrollIntoView({ behavior: 'smooth', block: 'start' }); }; li.append(a); ul.append(li);
  }
  det.append(ul); const meta = doc.querySelector('.meta'); if (meta) meta.after(det); else doc.prepend(det);
}

// ---------- código: colores sencillos (comentarios, cadenas, opciones, palabras clave, números) y «Copiar» ----------
const LEC_KW = {
  sql: 'select|from|where|and|or|not|insert|into|values|update|set|delete|create|alter|drop|table|database|login|user|grant|revoke|deny|on|to|with|as|join|left|right|inner|union|order|by|group|having|exec|execute|go|use|null|is|like|in|exists|backup|restore|encryption|certificate|key|master|name|disable|enable|password|check_policy|check_expiration',
  sh: 'sudo|apt|apt-get|systemctl|service|chmod|chown|chgrp|cat|grep|echo|cd|ls|rm|cp|mv|mkdir|touch|nano|vim|ufw|iptables|nft|ssh|scp|curl|wget|nmap|hydra|sqlmap|wfuzz|gobuster|ffuf|nc|netstat|ss|ps|kill|tail|head|find|awk|sed|export|if|then|else|fi|for|do|done|while|case|esac|function|return|useradd|usermod|passwd|mount|umount|fail2ban-client|journalctl|auditctl',
  ps: 'get-[a-z]+|set-[a-z]+|new-[a-z]+|remove-[a-z]+|enable-[a-z]+|disable-[a-z]+|invoke-[a-z]+|import-[a-z]+|export-[a-z]+|test-[a-z]+|start-[a-z]+|stop-[a-z]+|if|else|foreach|function|param|return|true|false|null',
  js: 'const|let|var|function|return|if|else|for|while|await|async|new|class|import|export|from|try|catch|throw|true|false|null|undefined'
};
const lecFam = (lang, txt) => { lang = (lang || '').toLowerCase(); if (/sql|tsql|mysql/.test(lang)) return 'sql'; if (/powershell|ps1?|pwsh/.test(lang)) return 'ps'; if (/^(js|javascript|ts|json)/.test(lang)) return 'js'; if (/bash|sh|shell|zsh|console|terminal/.test(lang)) return 'sh'; if (/\b(select|insert|create table|alter login)\b/i.test(txt)) return 'sql'; if (/\b(Get|Set|New)-[A-Z]/.test(txt)) return 'ps'; return 'sh'; };
const escH = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function lecColorea(txt, fam) {
  const com = fam === 'sql' ? '--[^\\n]*' : fam === 'js' ? '\\/\\/[^\\n]*' : '#[^\\n]*';
  const re = new RegExp(`(${com})|('(?:[^'\\\\\\n]|\\\\.)*'|"(?:[^"\\\\\\n]|\\\\.)*")|((?:^|(?<=\\s))--?[A-Za-z][\\w-]*)|\\b(${LEC_KW[fam]})\\b|\\b(\\d+(?:\\.\\d+)?)\\b`, fam === 'sql' || fam === 'ps' ? 'gim' : 'gm');
  let out = '', i = 0, m;
  while ((m = re.exec(txt))) {
    if (m[0] === '') { re.lastIndex++; continue; }
    out += escH(txt.slice(i, m.index)); const c = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'o' : m[4] ? 'k' : 'n';
    out += `<span class="hl-${c}">${escH(m[0])}</span>`; i = m.index + m[0].length;
  }
  return out + escH(txt.slice(i));
}
function lecCodigo() {
  for (const code of doc.querySelectorAll('pre > code')) {
    const pre = code.parentElement; if (pre.dataset.hl) continue; pre.dataset.hl = '1';
    const lang = ((code.className || '').match(/language-([\w+-]+)/) || [])[1], txt = code.textContent;
    if (txt.length < 20000) code.innerHTML = lecColorea(txt, lecFam(lang, txt));   // se construye desde el texto ya escapado: no entra HTML del apunte
    const b = el('button', 'pre-copia', 'Copiar'); b.type = 'button'; b.setAttribute('aria-label', 'Copiar el código');
    b.onclick = async () => { try { await navigator.clipboard.writeText(txt); b.textContent = 'Copiado'; } catch { b.textContent = 'No se pudo copiar'; } setTimeout(() => { b.textContent = 'Copiar'; }, 1500); };
    pre.classList.add('con-copia'); pre.append(b);
  }
}

// ---------- tras pintar un apunte ----------
function lecDecora(p) {
  const n = byPath.get(p); if (!n || n.externo) return;
  lecChips(doc); lecIndice(); lecCodigo(); if (typeof pdfEnlaces === 'function') pdfEnlaces(n);
  lecGuarda('brain-ultimo', { path: p, t: Date.now() }); marcaDiaEstudio();
}

// ---------- Inicio: tarjetas ----------
function iniTarjetas() {
  if (view !== 'notes' || current || hist[hp] !== '@home') return;
  let box = $('#ini-t'); if (!box) { box = el('div', 'ini-t'); box.id = 'ini-t'; const lead = doc.querySelector('.lead'); if (lead) lead.after(box); else doc.prepend(box); }
  box.replaceChildren(); const items = dash && dash.items ? dash.items : [], hoy = hoyIso();
  const pend = items.filter(i => (i.col === 'todo' || i.col === 'doing') && i.fecha && i.fecha >= hoy && i.tipo !== 'calendario').sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  const dif = (f) => Math.round((new Date(f + 'T00:00') - new Date(hoy + 'T00:00')) / 864e5), cuando = (n) => (n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : `Faltan ${n} días`);
  const tarjeta = (ic, tit, grande, sub, f, extra) => { const c = el(f ? 'button' : 'div', 'ini-c' + (extra ? ' ' + extra : '')); if (f) { c.type = 'button'; c.onclick = f; } const h = el('span', 'ini-h'); h.append(icono(ic, 15), document.createTextNode(tit)); c.append(h, el('b', null, grande), el('span', 'ini-s', sub)); box.append(c); };
  const ex = typeof ntEsExamen === 'function' ? pend.find(ntEsExamen) : null;
  if (ex) { const n = dif(ex.fecha); tarjeta('alerta', 'Próximo examen', cuando(n), `${ex.sigla} · ${ex.titulo}`, () => typeof showPlan === 'function' ? showPlan() : showDash(), n <= 3 ? 'hot' : ''); }
  const en = pend.find(i => i !== ex); if (en) { const n = dif(en.fecha); tarjeta('plan', 'Próxima entrega', cuando(n), `${en.sigla} · ${en.titulo}`, () => showDash(), n <= 2 ? 'hot' : ''); }
  if (!dash) tarjeta('dashboard', 'Entregas', '…', 'Calculando');
  const r = rachaEstudio(); tarjeta('estudiar', 'Racha de estudio', `${r.racha} día${r.racha === 1 ? '' : 's'}`, r.racha ? (r.hoy ? '¡Hoy ya cuenta!' : 'Estudia hoy para no perderla') : 'Abre un apunte o haz un test para empezarla', () => (typeof showStudy === 'function' ? showStudy() : null));
  if (typeof simLee === 'function') { const pf = simPendientes(simLee(), hoy).length; if (pf) tarjeta('simulacros', 'Repasar fallos', `${pf} pregunta${pf > 1 ? 's' : ''}`, 'De tus simulacros, para hoy', () => { showSimulacros(); recursosCarga(true).then(() => { if (view === 'simulacros') simEmpieza(null, 'repaso'); }); }); }
  const u = lecLee('brain-ultimo', null), nu = u && byPath.get(u.path);
  if (nu) tarjeta('libro', 'Sigue donde lo dejaste', short(nu), (NOMBRES[sigOf(nu)] || sigOf(nu)) + (u.t ? ' · ' + new Date(u.t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : ''), () => go(nu.path));
}

(function lecInicia() {
  if (typeof document === 'undefined') return;
  if (typeof show === 'function') { const o = show; show = function (p) { const r = o.apply(this, arguments); try { lecDecora(p); } catch (e) { console.warn('lectura', e); } return r; }; }
  if (typeof home === 'function') { const o = home; home = function () { const r = o.apply(this, arguments); try { iniTarjetas(); } catch (e) { console.warn('inicio', e); } return r; }; }
  if (typeof showStudy === 'function') { const o = showStudy; showStudy = function () { marcaDiaEstudio(); return o.apply(this, arguments); }; }
  // cuando llega el dashboard (entregas), se repintan las tarjetas de Inicio
  if (typeof loadDash === 'function') { const o = loadDash; loadDash = async function () { const r = await o.apply(this, arguments); try { iniTarjetas(); } catch {} return r; }; }
})();
