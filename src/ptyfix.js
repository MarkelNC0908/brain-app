// Arreglo de la terminal integrada: node-pty abre el shell a través de un ayudante («spawn-helper») que tiene que ser ejecutable.
// En los zips de la 1.0.13 y 1.0.14 para macOS venía sin permiso de ejecución y la terminal fallaba con «posix_spawnp failed».
// Aquí se le da el permiso (si falta) antes de abrir el shell y se traduce el error a algo que se pueda entender.
const fs = require('fs');
const path = require('path');

// Carpeta de node-pty tal y como existe en disco: dentro de un .asar los ejecutables viven en «app.asar.unpacked»
function carpetaPty(resolve) {
  let main; try { main = (resolve || require.resolve)('node-pty'); } catch { return ''; }
  let dir = path.dirname(main);                       // …/node-pty/lib
  dir = path.resolve(dir, '..');                      // …/node-pty
  return dir.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

// Ayudantes posibles de esta plataforma y arquitectura (prebuilds y compilación local)
function candidatos(base, plat, arch) {
  return [path.join(base, 'prebuilds', `${plat}-${arch}`, 'spawn-helper'), path.join(base, 'build', 'Release', 'spawn-helper'), path.join(base, 'build', 'Debug', 'spawn-helper')];
}

// Da permiso de ejecución a los ayudantes que existan y no lo tengan. Devuelve { arreglados:[rutas], fallos:[{ruta,msg}] }. No hace nada en Windows.
function aseguraHelper({ base, plat = process.platform, arch = process.arch } = {}) {
  const res = { arreglados: [], fallos: [] };
  if (plat === 'win32') return res;
  const raiz = base || carpetaPty(); if (!raiz) return res;
  for (const f of candidatos(raiz, plat, arch)) {
    let st; try { st = fs.statSync(f); } catch { continue; }
    if (!st.isFile() || (st.mode & 0o111) === 0o111) continue;
    try { fs.chmodSync(f, st.mode | 0o755); res.arreglados.push(f); } catch (e) { res.fallos.push({ ruta: f, msg: e.message }); }
  }
  return res;
}

// Mensaje para el usuario cuando pty.spawn falla
function mensajeError(err, plat = process.platform) {
  const m = String((err && err.message) || err || '');
  if (/posix_spawnp/.test(m)) return 'No se pudo abrir el shell (posix_spawnp falló). Suele ser que el ayudante de la terminal no es ejecutable o que el shell no existe; ' + (plat === 'darwin' ? 'cierra y vuelve a abrir Brain; si sigue, ejecuta «chmod +x» sobre «spawn-helper» dentro de Brain.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds.' : 'comprueba los permisos de «spawn-helper» de node-pty y la variable SHELL.') + ' Detalle: ' + m;
  return m;
}

module.exports = { carpetaPty, candidatos, aseguraHelper, mensajeError };
