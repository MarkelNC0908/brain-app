// ---------- Iconos de línea propios (SVG, toman el color del texto) ----------
// Cada icono es una lista de trazos sobre una rejilla de 24×24: 'M…' = path, 'c:x,y,r' = círculo, 'e:cx,cy,rx,ry' = elipse.
const ICONOS = {
  inicio: ['M3 11 12 4l9 7', 'M5 10v10h14V10', 'M10 20v-6h4v6'],
  estudiar: ['M2 9l10-5 10 5-10 5z', 'M6 11v5c2 2.2 10 2.2 12 0v-5', 'M22 9v6'],
  plan: ['M9 3h6v3H9z', 'M7 4.5H6a1 1 0 0 0-1 1V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5.5a1 1 0 0 0-1-1h-1', 'M9 13l2 2 4-4'],
  dudas: ['c:12,12,9', 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14', 'M12 17.5v.01'],
  dashboard: ['M4 4h7v9H4z', 'M13 4h7v5h-7z', 'M13 11h7v9h-7z', 'M4 15h7v5H4z'],
  horario: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4', 'M8 14h2', 'M14 14h2'],
  notas: ['M4 20h16', 'M7 16v-5', 'M12 16V7', 'M17 16v-8'],
  preguntar: ['c:11,11,6', 'M20 20l-4.5-4.5'],
  mensajes: ['M4 5h16v11H9l-5 4z'],
  avisos: ['M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z', 'M10 20.5a2 2 0 0 0 4 0'],
  terminal: ['M3 5h18v14H3z', 'M7 9l3 3-3 3', 'M12 15h5'],
  ajustes: ['c:12,12,3', 'M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'M4.9 4.9 7 7', 'M17 17l2.1 2.1', 'M4.9 19.1 7 17', 'M17 7l2.1-2.1'],
  simulacros: ['M5 3h14v18H5z', 'M8 8h.01', 'M11 8h5', 'M8 12h.01', 'M11 12h5', 'M8 16h.01', 'M11 16h5'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  mas: ['M6 12h.01', 'M12 12h.01', 'M18 12h.01'],
  foco: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  abajo: ['M6 9l6 6 6-6'],
  arriba: ['M6 15l6-6 6 6'],
  pdf: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 13h6', 'M9 17h4'],
  cerrar: ['M6 6l12 12', 'M18 6 6 18'],
  // para asignaturas
  escudo: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  servidor: ['M4 4h16v6H4z', 'M4 14h16v6H4z', 'M8 7h.01', 'M8 17h.01'],
  candado: ['M6 11h12v9H6z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  bicho: ['M8 9h8v7a4 4 0 0 1-8 0z', 'M9 9a3 3 0 0 1 6 0', 'M4 13h4', 'M16 13h4', 'M5 8l3 2', 'M19 8l-3 2', 'M5 19l3-2', 'M19 19l-3-2'],
  balanza: ['M12 4v16', 'M7 20h10', 'M5 8h14', 'M5 8l-3 6a3 3 0 0 0 6 0z', 'M19 8l-3 6a3 3 0 0 0 6 0z'],
  forense: ['M6 3h9l4 4v5', 'M6 3v18h6', 'c:16,17,3', 'M18.2 19.2 21 22'],
  alerta: ['M12 3 2 20h20z', 'M12 10v4', 'M12 17h.01'],
  globo: ['c:12,12,9', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
  codigo: ['M8 8l-4 4 4 4', 'M16 8l4 4-4 4', 'M14 5l-4 14'],
  libro: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 19V5'],
  chip: ['M7 7h10v10H7z', 'M9 3v4', 'M15 3v4', 'M9 17v4', 'M15 17v4', 'M3 9h4', 'M3 15h4', 'M17 9h4', 'M17 15h4'],
  movil: ['M7 3h10v18H7z', 'M11 18h2'],
  datos: ['e:12,6,7,3', 'M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6', 'M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3'],
  llave: ['c:8,15,4', 'M11 12l9-9', 'M17 6l3 3'],
  red: ['c:12,5,2', 'c:5,19,2', 'c:19,19,2', 'M12 7v5', 'M12 12l-6 5', 'M12 12l6 5'],
  fichero: ['M6 3h9l4 4v14H6z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6']
};
// Iconos que se pueden elegir para una asignatura, con su nombre en español
const ICONOS_ASIG = [['escudo', 'Escudo'], ['servidor', 'Servidor'], ['candado', 'Candado'], ['bicho', 'Bicho'], ['balanza', 'Balanza'], ['forense', 'Lupa'], ['alerta', 'Alerta'], ['globo', 'Web'], ['codigo', 'Código'], ['libro', 'Libro'], ['chip', 'Chip'], ['movil', 'Móvil'], ['datos', 'Base de datos'], ['llave', 'Llave'], ['red', 'Red'], ['fichero', 'Documento']];

function icono(nombre, tam = 18) {
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', tam); s.setAttribute('height', tam); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', nombre === 'mas' ? '3' : '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ico');
  for (const t of ICONOS[nombre] || ICONOS.fichero) {
    let e;
    if (t.startsWith('c:')) { const [cx, cy, r] = t.slice(2).split(','); e = document.createElementNS(NS, 'circle'); e.setAttribute('cx', cx); e.setAttribute('cy', cy); e.setAttribute('r', r); }
    else if (t.startsWith('e:')) { const [cx, cy, rx, ry] = t.slice(2).split(','); e = document.createElementNS(NS, 'ellipse'); e.setAttribute('cx', cx); e.setAttribute('cy', cy); e.setAttribute('rx', rx); e.setAttribute('ry', ry); }
    else { e = document.createElementNS(NS, 'path'); e.setAttribute('d', t); }
    s.append(e);
  }
  return s;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { ICONOS, ICONOS_ASIG };
