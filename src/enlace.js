// Enlace para conectar el móvil con el mismo Brain que el escritorio (se muestra como QR en Ajustes → Conectar el móvil).
// Formato: brain://conectar?repo=usuario/repositorio&branch=rama — lleva solo el repositorio y la rama, NUNCA un token:
// quien viera o fotografiara el QR no obtiene acceso a nada; en el móvil hay que iniciar sesión igualmente.
// Se usa en el escritorio (Node) y en el móvil (navegador), por eso es UMD.
(function (raiz, fabrica) { const m = fabrica(); if (typeof module === 'object' && module.exports) module.exports = m; else raiz.BrainEnlace = m; })(typeof self !== 'undefined' ? self : this, function () {
  const REPO_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/, RAMA_RE = /^[A-Za-z0-9._\/-]{1,200}$/;
  const repoValido = (r) => REPO_RE.test(r || '') && !/(^|\/)\./.test(r);
  const ramaValida = (b) => RAMA_RE.test(b || '') && !/\.\.|^\/|\/$/.test(b);

  // URL del remoto de git (https o ssh de github.com) → «usuario/repositorio»; '' si no es de GitHub
  function repoDeRemoto(url) {
    const u = String(url || '').trim();
    const m = u.match(/^(?:https?:\/\/(?:[^@/\s]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/i);
    return m && repoValido(m[1]) ? m[1] : '';
  }

  function construyeEnlace({ repo, branch }) {
    if (!repoValido(repo)) throw new Error('Repositorio no válido');
    const b = branch && ramaValida(branch) ? branch : 'main';
    return 'brain://conectar?repo=' + encodeURIComponent(repo) + '&branch=' + encodeURIComponent(b);
  }

  // Lee un enlace brain://conectar?…; devuelve { repo, branch } o null (cualquier otra cosa, incluido un token, se ignora)
  function leeEnlace(texto) {
    const t = String(texto || '').trim(), m = t.match(/^brain:\/\/conectar\?(.*)$/i); if (!m) return null;
    const p = {}; for (const par of m[1].split('&')) { const i = par.indexOf('='); if (i > 0) { try { p[decodeURIComponent(par.slice(0, i))] = decodeURIComponent(par.slice(i + 1)); } catch { return null; } } }
    if (!repoValido(p.repo)) return null;
    return { repo: p.repo, branch: ramaValida(p.branch) ? p.branch : 'main' };
  }

  return { repoDeRemoto, construyeEnlace, leeEnlace };
});
