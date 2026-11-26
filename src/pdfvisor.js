// ---------- Visor de PDF dentro de la app ----------
// En un apunte, cada «diap. N» se convierte en un enlace que abre el PDF del profesor en esa página, en un panel a la derecha.
// El PDF se encuentra por la ficha de recurso que enlaza el apunte ([[apunte]] en su texto) y su campo `location:` (ruta del PDF en el Brain).
// Opcional (Ajustes › Apariencia, apagado por defecto): buscar con Cmd/Ctrl+K dentro de esos PDF. El texto se extrae en este equipo y no va a la IA.

const PDF_BUSCA_K = 'brain-pdf-buscar';
const pdfRutaDe = (n) => { const loc = n && n.meta && String(n.meta.location || ''); const m = loc.match(/([^"]*?\.pdf)\b/i); return m ? m[1].trim() : ''; };
// PDF(s) del profesor de un apunte: fichas de recursos/ que lo enlazan y tienen location .pdf
function pdfsDe(n) {
  if (!n) return []; const re = new RegExp('\\[\\[(?:[^\\]|]*/)?' + n.base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\.md)?(?:[#|][^\\]]*)?\\]\\]', 'i');
  const fichas = [...(typeof RECURSOS !== 'undefined' ? RECURSOS : []), ...notes.filter(r => /\/recursos\//.test(r.path))];
  return fichas.filter(r => r.path !== n.path && pdfRutaDe(r) && re.test(r.body || '')).map(r => ({ rel: pdfRutaDe(r), titulo: short(r) }));
}
let pdfActual = null;
async function pdfAbre(rel, pagina, titulo) {
  if (!window.brain || !window.brain.pdfRuta) return;
  let r = null; try { r = await window.brain.pdfRuta(rel); } catch {}
  let p = $('#pdfp'); if (!p) { p = el('aside', 'pdfp'); p.id = 'pdfp'; p.setAttribute('aria-label', 'Visor de PDF'); $('#main').append(p); }
  p.replaceChildren(); document.body.classList.add('con-pdf');
  const h = el('div', 'pdfp-h'); h.append(icono('pdf', 16), el('b', null, titulo || rel.split('/').pop()), el('span', 'dsub', pagina ? `página ${pagina}` : ''));
  const fuera = el('button', null, 'Abrir fuera'); fuera.type = 'button'; fuera.title = 'Abrir con la aplicación de PDF del sistema'; fuera.onclick = () => window.brain.pdfAbrirFuera && window.brain.pdfAbrirFuera(rel);
  const x = el('button', 'pdfp-x'); x.type = 'button'; x.append(icono('cerrar', 16)); x.setAttribute('aria-label', 'Cerrar el visor'); x.onclick = pdfCierra;
  h.append(fuera, x); p.append(h);
  if (!r || !r.ok) { p.append(el('p', 'dsub pdfp-msg', (r && r.msg) || 'No se pudo abrir el PDF.')); return; }
  const f = el('iframe'); f.title = 'PDF: ' + (titulo || rel); f.src = r.url + (pagina ? `#page=${pagina}` : ''); p.append(f);
  pdfActual = { rel, pagina };
}
function pdfCierra() { const p = $('#pdfp'); if (p) p.remove(); document.body.classList.remove('con-pdf'); pdfActual = null; }

// «diap. 16», «diap. 5, 7 y 13», «diap. 45-51» → cada número es un enlace a esa página
const PDF_DIAP = /\b(diap(?:ositivas?)?\.?|p(?:ág)?s?\.)\s*(\d+(?:\s*(?:,|y|-|–)\s*\d+)*)/gi;
async function pdfEnlaces(n) {
  if (typeof recursosCarga === 'function') await recursosCarga();
  if (current !== n.path || view !== 'notes') return;   // mientras tanto se abrió otro apunte
  const pdfs = pdfsDe(n); if (!pdfs.length) return; const pdf = pdfs[0];
  const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.parentElement && t.parentElement.closest('pre,code,a,.toc') ? NodeFilter.FILTER_REJECT : /diap|p(?:ág)?s?\./i.test(t.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  const nodos = []; let t; while ((t = w.nextNode())) nodos.push(t);
  for (const nodo of nodos) {
    const s = nodo.nodeValue, f = document.createDocumentFragment(); let i = 0, m, hubo = false; PDF_DIAP.lastIndex = 0;
    while ((m = PDF_DIAP.exec(s))) {
      hubo = true; f.append(s.slice(i, m.index), m[1] + ' ');
      const partes = m[2].split(/(\s*(?:,|y|-|–)\s*)/);
      for (const pz of partes) { if (/^\d+$/.test(pz)) { const a = el('a', 'diap-a', pz); a.href = '#'; a.title = `Ver la página ${pz} de ${pdf.rel.split('/').pop()}`; a.onclick = (e) => { e.preventDefault(); e.stopPropagation(); pdfAbre(pdf.rel, +pz, pdf.titulo); }; f.append(a); } else f.append(pz); }
      i = m.index + m[0].length;
    }
    if (!hubo) continue; f.append(s.slice(i)); nodo.replaceWith(f);
  }
  // botón para abrir el PDF entero
  const meta = doc.querySelector('.meta'); if (meta && !meta.querySelector('.pdf-b')) { const b = el('button', 'tag pdf-b'); b.type = 'button'; b.append(icono('pdf', 12), document.createTextNode(' Ver el PDF del profesor')); b.onclick = () => pdfAbre(pdf.rel, 1, pdf.titulo); meta.append(b); }
}

// ---------- búsqueda dentro de los PDF (opcional) ----------
const pdfBuscaOn = () => { try { return localStorage.getItem(PDF_BUSCA_K) === '1'; } catch { return false; } };
const pdfTextos = new Map();   // rel → [texto de cada página]
async function pdfCargaTextos() {
  if (!pdfBuscaOn() || !window.brain || !window.brain.pdfTexto) return;
  if (typeof recursosCarga === 'function') await recursosCarga();
  const rels = [...new Set([...(typeof RECURSOS !== 'undefined' ? RECURSOS : []), ...notes.filter(r => /\/recursos\//.test(r.path))].map(pdfRutaDe).filter(Boolean))];
  for (const rel of rels) { if (pdfTextos.has(rel)) continue; pdfTextos.set(rel, null); try { const r = await window.brain.pdfTexto(rel); pdfTextos.set(rel, r && r.ok ? r.paginas : []); } catch { pdfTextos.set(rel, []); } }
}
function pdfBusca(q, max = 5) {
  const nq = norm(q).trim(); if (nq.length < 3) return []; const ts = nq.split(/\s+/), out = [];
  for (const [rel, pags] of pdfTextos) { if (!pags) continue; pags.forEach((tx, i) => { const nt = norm(tx); if (ts.every(t => nt.includes(t))) { const k = nt.indexOf(ts[0]); out.push({ rel, pagina: i + 1, s: tx.slice(Math.max(0, k - 40), k + 80).replace(/\s+/g, ' ') }); } }); }
  return out.slice(0, max);
}
function pdfPintaAjustes(w) {
  if (!window.brain || !window.brain.pdfTexto) return;
  w.append(el('h3', 'ap-h', 'PDF del profesor'));
  const l = el('label', 'msg-chk'), c = el('input'); c.type = 'checkbox'; c.checked = pdfBuscaOn(); c.onchange = () => { try { localStorage.setItem(PDF_BUSCA_K, c.checked ? '1' : '0'); } catch {} if (c.checked) pdfCargaTextos(); };
  l.append(c, document.createTextNode(' Buscar también dentro de los PDF de las fichas de recursos con Cmd/Ctrl+K')); w.append(l, el('p', 'dsub', 'El texto se saca en este equipo y se guarda en la carpeta de la app; no se envía a ninguna IA. La primera vez tarda unos segundos por PDF.'));
}

(function pdfInicia() {
  if (typeof document === 'undefined') return;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#pdfp') && !document.querySelector('.pal')) pdfCierra(); });
  // al cambiar de apunte o de pantalla se cierra el visor
  if (typeof show === 'function') { const o = show; show = function (p) { if (pdfActual) pdfCierra(); return o.apply(this, arguments); }; }
  // en la paleta (Cmd/Ctrl+K): resultados de los PDF
  if (typeof paleta === 'function') { const o = paleta; paleta = function () { const r = o.apply(this, arguments); const inp = document.querySelector('.pal-box input'); if (inp && pdfBuscaOn()) { pdfCargaTextos(); inp.addEventListener('input', () => setTimeout(() => pdfAnadePaleta(inp.value), 0)); } return r; }; }
})();
function pdfAnadePaleta(v) {
  const lst = document.querySelector('.pal-l'); if (!lst) return; lst.querySelectorAll('.pal-pdf').forEach(x => x.remove());
  for (const h of pdfBusca(v, 4)) { const r = el('div', 'pal-i pal-pdf'); r.append(el('span', 'pal-k', 'PDF'), el('span', 'pal-t', `${h.rel.split('/').pop()} · p. ${h.pagina}`), el('span', 'pal-s', h.s)); r.onmousedown = (e) => { e.preventDefault(); const pal = document.querySelector('.pal'); if (pal) pal.remove(); if (typeof palAbierta !== 'undefined') palAbierta = null; pdfAbre(h.rel, h.pagina); }; lst.append(r); }
}
