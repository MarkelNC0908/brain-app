// Buscar y descargar la versión nueva de la app desde los «Releases» de un repositorio de GitHub.
// Si el repositorio es público no hace falta nada más; si es privado, el usuario puede añadir un token de solo lectura, que solo vive en el proceso principal (cifrado con el llavero del sistema).
// No se instala nada solo: se descarga el .zip y se avisa de dónde está.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const API = 'https://api.github.com';
const REPO_RE = /^[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9_.-]{1,100}$/, TOKEN_RE = /^[A-Za-z0-9_]{20,255}$/;
let F = (...a) => fetch(...a);
const REPO_DEFECTO = 'MarkelNC0908/brain-app';   // repositorio público de la app; se puede cambiar en Ajustes
const cab = (token, extra) => ({ ...(token ? { Authorization: 'Bearer ' + token } : {}), 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Brain-app', Accept: 'application/vnd.github+json', ...extra });
const num = (v) => String(v).replace(/^v/i, '').split('.').map(x => parseInt(x, 10) || 0);
function comparaVersiones(a, b) { const x = num(a), y = num(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; }
// Nombre del fichero que toca descargar en este sistema (los que publica el proyecto)
function nombreAsset(plataforma, arch) { return plataforma === 'darwin' ? (arch === 'arm64' ? 'Brain-macos-arm64.zip' : '') : plataforma === 'win32' ? 'Brain-windows-x64.zip' : plataforma === 'linux' ? 'Brain-linux-x64.zip' : ''; }
const msgHttp = (s) => s === 401 ? 'GitHub no acepta el token (¿caducado o mal copiado?).' : s === 403 ? 'GitHub rechazó la petición (permisos del token o límite de uso).' : s === 404 ? 'No encuentro ese repositorio (si es privado, añade un token con acceso de lectura).' : `GitHub devolvió un error (HTTP ${s}).`;
async function buscar({ repo, token, version, plataforma, arch }) {
  if (!REPO_RE.test(repo || '')) return { ok: false, msg: 'Escribe el repositorio como usuario/repositorio.' }; if (token && !TOKEN_RE.test(token)) return { ok: false, msg: 'Ese token no tiene el formato de un token de GitHub.' };
  let r; try { r = await F(`${API}/repos/${repo}/releases/latest`, { headers: cab(token) }); } catch { return { ok: false, msg: 'No se pudo conectar con GitHub. Revisa tu conexión.' }; }
  if (!r.ok) return { ok: false, msg: msgHttp(r.status) };
  const j = await r.json(), tag = String(j.tag_name || ''), nombre = nombreAsset(plataforma, arch), a = (j.assets || []).find(x => x.name === nombre);
  return { ok: true, tag, titulo: String(j.name || tag), notas: String(j.body || '').slice(0, 1500), nueva: comparaVersiones(tag, version) > 0, actual: version, asset: a ? { id: a.id, name: a.name, size: a.size, digest: a.digest || '' } : null, sinFichero: !a };
}
// Descarga el asset a la carpeta indicada (sin sobrescribir); comprueba el tamaño y, si GitHub da el hash, el sha256.
async function descargar({ repo, token, asset, carpeta, onProgreso, signal }) {
  if (!REPO_RE.test(repo || '') || (token && !TOKEN_RE.test(token)) || !asset || !/^\d+$/.test(String(asset.id)) || !/^[\w.-]+\.(zip|apk)$/.test(asset.name || '')) return { ok: false, msg: 'Datos de descarga no válidos.' };
  let r; try { r = await F(`${API}/repos/${repo}/releases/assets/${asset.id}`, { headers: cab(token, { Accept: 'application/octet-stream' }), redirect: 'follow', signal }); } catch (e) { return { ok: false, msg: signal && signal.aborted ? 'Descarga cancelada.' : 'No se pudo conectar con GitHub.' }; }
  if (!r.ok) return { ok: false, msg: msgHttp(r.status) };
  fs.mkdirSync(carpeta, { recursive: true }); let dest = path.join(carpeta, asset.name), k = 1; while (fs.existsSync(dest)) { k++; dest = path.join(carpeta, asset.name.replace(/(\.[^.]+)$/, ` (${k})$1`)); }
  const h = crypto.createHash('sha256'), out = fs.createWriteStream(dest); let hecho = 0; out.on('error', () => {});   // un error del fichero se trata abajo; sin este manejador, cancelar a mitad tiraba la app
  try {
    for await (const parte of r.body) { h.update(parte); hecho += parte.length; if (!out.write(parte)) await new Promise(ok => out.once('drain', ok)); if (onProgreso) onProgreso(hecho, asset.size); }
    await new Promise((ok, ko) => out.end((e) => (e ? ko(e) : ok())));
  } catch (e) { try { out.destroy(); fs.rmSync(dest, { force: true }); } catch {} return { ok: false, msg: signal && signal.aborted ? 'Descarga cancelada.' : 'Se cortó la descarga: ' + (e.message || e) }; }
  const sha = h.digest('hex'); if (asset.size && hecho !== asset.size) { fs.rmSync(dest, { force: true }); return { ok: false, msg: `La descarga está incompleta (${hecho} de ${asset.size} bytes). Inténtalo de nuevo.` }; }
  const esperado = String(asset.digest || '').replace(/^sha256:/, ''); if (esperado && esperado !== sha) { fs.rmSync(dest, { force: true }); return { ok: false, msg: 'El hash del fichero descargado no coincide con el de GitHub: descartado.' }; }
  return { ok: true, ruta: dest, sha256: sha, verificado: !!esperado };
}
module.exports = { REPO_DEFECTO, REPO_RE, TOKEN_RE, comparaVersiones, nombreAsset, buscar, descargar, _fetch: (f) => { F = f || ((...a) => fetch(...a)); } };
