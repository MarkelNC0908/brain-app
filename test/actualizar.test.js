const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'); const U = require('../src/actualizar.js');
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
const TOKEN = 'github_pat_' + 'F'.repeat(30);   // falso
t('versiones', U.comparaVersiones('v1.0.14', '1.0.13') === 1 && U.comparaVersiones('1.0.9', '1.0.10') === -1 && U.comparaVersiones('v1.0.13', '1.0.13') === 0 && U.comparaVersiones('2.0', '1.9.9') === 1);
t('asset por sistema', U.nombreAsset('darwin', 'arm64') === 'Brain-macos-arm64.zip' && U.nombreAsset('darwin', 'x64') === '' && U.nombreAsset('win32', 'x64') === 'Brain-windows-x64.zip' && U.nombreAsset('linux', 'x64') === 'Brain-linux-x64.zip');
const contenido = Buffer.from('contenido del zip de prueba'.repeat(1000)), sha = crypto.createHash('sha256').update(contenido).digest('hex'); let visto = [];
const release = { tag_name: 'v1.0.14', name: 'Brain 1.0.14', body: 'Novedades…', assets: [{ id: 11, name: 'Brain-macos-arm64.zip', size: contenido.length, digest: 'sha256:' + sha }, { id: 12, name: 'Brain-windows-x64.zip', size: 5 }] };
const cuerpo = (b, n) => (async function* () { for (let i = 0; i < b.length; i += n) yield b.subarray(i, i + n); })();
U._fetch(async (url, o) => { visto.push([url, o.headers]); if (o.headers.Authorization !== 'Bearer ' + TOKEN) return { ok: false, status: 401 };
  if (/\/releases\/latest$/.test(url)) return /nadie\/nada/.test(url) ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => release };
  if (/\/releases\/assets\/11$/.test(url)) return { ok: true, status: 200, body: cuerpo(contenido, 4096) }; return { ok: false, status: 404 }; });
(async () => {
  let r = await U.buscar({ repo: 'usuario/repo', token: TOKEN, version: '1.0.13', plataforma: 'darwin', arch: 'arm64' });
  t('busca y detecta versión nueva', r.ok && r.nueva && r.tag === 'v1.0.14' && r.asset && r.asset.name === 'Brain-macos-arm64.zip' && r.asset.id === 11 && /Brain-macos/.test(r.asset.name));
  t('token en cabecera, no en la URL', visto[0][1].Authorization === 'Bearer ' + TOKEN && !visto[0][0].includes(TOKEN) && visto[0][0] === 'https://api.github.com/repos/usuario/repo/releases/latest');
  t('sin versión nueva', !(await U.buscar({ repo: 'usuario/repo', token: TOKEN, version: '1.0.14', plataforma: 'win32', arch: 'x64' })).nueva);
  t('sin fichero para este sistema', (await U.buscar({ repo: 'usuario/repo', token: TOKEN, version: '1.0.13', plataforma: 'darwin', arch: 'x64' })).sinFichero === true);
  t('token malo', /no acepta el token/.test((await U.buscar({ repo: 'usuario/repo', token: 'github_pat_' + 'X'.repeat(30), version: '1', plataforma: 'linux', arch: 'x64' })).msg));
  t('repo no encontrado', /No encuentro ese repositorio/.test((await U.buscar({ repo: 'nadie/nada', token: TOKEN, version: '1', plataforma: 'linux', arch: 'x64' })).msg));
  t('formato repo/token', !(await U.buscar({ repo: 'sin barra', token: TOKEN })).ok && !(await U.buscar({ repo: 'a/b', token: 'corto' })).ok);
  // repositorio PÚBLICO: sin token, sin cabecera Authorization
  U._fetch(async (url, o) => { visto.push([url, o.headers]); if (/\/releases\/latest$/.test(url)) return { ok: true, status: 200, json: async () => release }; if (/\/releases\/assets\/11$/.test(url)) return { ok: true, status: 200, body: cuerpo(contenido, 4096) }; return { ok: false, status: 404 }; });
  visto = []; const rp = await U.buscar({ repo: 'usuario/repo', token: '', version: '1.0.13', plataforma: 'darwin', arch: 'arm64' });
  t('público: busca sin token', rp.ok && rp.nueva && !('Authorization' in visto[0][1]));
  const dir0 = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-act0-')); const dp = await U.descargar({ repo: 'usuario/repo', token: '', asset: rp.asset, carpeta: dir0 }); t('público: descarga sin token y verifica hash', dp.ok && dp.verificado && !('Authorization' in visto[visto.length - 1][1])); fs.rmSync(dir0, { recursive: true, force: true });
  t('público: repo por defecto definido', U.REPO_RE.test(U.REPO_DEFECTO) && !/[A-Z]{3}[0-9]{4}/.test('x'));
  t('token con formato raro: error claro', /formato de un token/.test((await U.buscar({ repo: 'a/b', token: 'corto' })).msg));
  // vuelve el fetch con token para el resto de pruebas
  U._fetch(async (url, o) => { visto.push([url, o.headers]); if (o.headers.Authorization !== 'Bearer ' + TOKEN) return { ok: false, status: 401 }; if (/\/releases\/latest$/.test(url)) return { ok: true, status: 200, json: async () => release }; if (/\/releases\/assets\/11$/.test(url)) return { ok: true, status: 200, body: cuerpo(contenido, 4096) }; return { ok: false, status: 404 }; });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-act-')), prog = [];
  const d = await U.descargar({ repo: 'usuario/repo', token: TOKEN, asset: r.asset, carpeta: dir, onProgreso: (h, tt) => prog.push([h, tt]) });
  t('descarga y verifica sha256', d.ok && d.verificado && d.sha256 === sha && fs.readFileSync(d.ruta).equals(contenido) && prog.length > 3 && prog[prog.length - 1][0] === contenido.length);
  const d2 = await U.descargar({ repo: 'usuario/repo', token: TOKEN, asset: r.asset, carpeta: dir }); t('no sobrescribe', d2.ok && /\(2\)\.zip$/.test(d2.ruta) && fs.readdirSync(dir).length === 2);
  const malo = await U.descargar({ repo: 'usuario/repo', token: TOKEN, asset: { ...r.asset, digest: 'sha256:' + '0'.repeat(64) }, carpeta: dir }); t('hash distinto: descartado', !malo.ok && /no coincide/.test(malo.msg) && fs.readdirSync(dir).length === 2);
  const corto = await U.descargar({ repo: 'usuario/repo', token: TOKEN, asset: { ...r.asset, size: contenido.length + 10, digest: '' }, carpeta: dir }); t('tamaño incompleto: descartado', !corto.ok && /incompleta/.test(corto.msg) && fs.readdirSync(dir).length === 2);
  t('datos no válidos', !(await U.descargar({ repo: 'usuario/repo', token: TOKEN, asset: { id: '../x', name: 'a.zip' }, carpeta: dir })).ok && !(await U.descargar({ repo: 'usuario/repo', token: TOKEN, asset: { id: 1, name: '../a.zip' }, carpeta: dir })).ok);
  // cancelar a mitad de la descarga: sin ficheros a medias y sin excepciones
  let aborta = new AbortController(), errNoCapturado = null; process.once('uncaughtException', (e) => { errNoCapturado = e; });
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-act2-')), grande = Buffer.alloc(2 * 1024 * 1024, 7);
  U._fetch(async (u, o) => ({ ok: true, status: 200, body: (async function* () { for (let i = 0; i < grande.length; i += 16384) { if (o.signal && o.signal.aborted) { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; } yield grande.subarray(i, i + 16384); } })() }));   // como el fetch real: el cuerpo falla al abortar
  const cn = await U.descargar({ repo: 'usuario/repo', token: '', asset: { id: 11, name: 'Brain-macos-arm64.zip', size: grande.length }, carpeta: dir2, signal: aborta.signal, onProgreso: (h) => { if (h > 100000) aborta.abort(); } });
  await new Promise(r => setTimeout(r, 100)); t('cancelar: sin ficheros a medias ni excepciones', !cn.ok && fs.readdirSync(dir2).length === 0 && !errNoCapturado);
  fs.rmSync(dir2, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true }); console.log('ok', ok, 'ko', ko); process.exit(0);
})();
