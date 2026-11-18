// Asistente de estudio: responde dudas sobre los apuntes con un modelo LOCAL de Ollama (gratis, sin claves y sin que los apuntes salgan del equipo).
// La dirección está fija en 127.0.0.1:11434: no hay forma de apuntarla a un servicio externo.
// Flujo: la pregunta se compara con trozos de los apuntes (búsqueda por palabras, sin base vectorial), los mejores se pasan al modelo
// como único material permitido y la respuesta se emite por trozos mientras se genera. Solo se usan apuntes: nunca entregas, _entrada ni 99-Privado
// (el índice que recibe ya los excluye).
const fs = require('fs');
let safeStorage = null; try { safeStorage = require('electron').safeStorage || null; } catch {}   // fuera de Electron (pruebas) no hay almacén seguro
const BASE = 'http://127.0.0.1:11434';
const DEFECTO = 'qwen2.5:7b';
// Gemini (nube, opcional): dirección fija de Google; la clave es del usuario, va solo en una cabecera y se guarda cifrada con el almacén del sistema (llavero)
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
// Solo modelos «lite»: son los que responden de forma fiable en el plan gratuito (probados el 2026-11-18). Los «flash» grandes (gemini-flash-latest, 3.5-flash, 3.7-flash…) daban 503 por saturación y gemini-2.5-flash ya no está para cuentas nuevas.
const GEMINI_MODELOS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite'];   // «-latest» apunta siempre al modelo actual de la familia
let F = (...a) => fetch(...a);   // solo las pruebas lo sustituyen (_fetch)
const R = require('./respuestas');   // misma búsqueda por apartados que usa el buscador sin IA
const SISTEMA = `Eres el asistente de estudio de la app Brain. Respondes dudas de las asignaturas del alumno usando SOLO los fragmentos de apuntes que se te dan entre [1], [2]…
Reglas:
- Responde en español, de forma directa y técnica, sin relleno. Si pides o das comandos o código, coméntalos brevemente.
- No uses nada que no esté en los fragmentos. Si no responden a la pregunta, di exactamente «No está en tus apuntes» y, si ayuda, sugiere qué apunte habría que añadir. No inventes fechas, pesos, notas ni contenidos.
- Cita de dónde sale cada dato con el número del fragmento, por ejemplo [2].
- Si el fragmento marca un dato como [supuesto] o [pendiente], dilo: no lo des por verificado.
- No redactes entregas ni prácticas completas: explica los conceptos, propón una estructura y revisa lo que escriba el alumno.`;

function mensajes(pregunta, historial, frags) {
  const ctx = frags.map((f, i) => `[${i + 1}] ${f.sigla} · ${f.titulo}${f.cab ? ' › ' + f.cab : ''}${f.borrador ? ' (borrador sin material de clase)' : ''}\n${f.texto}`).join('\n\n');
  const prev = (historial || []).slice(-6).map(m => ({ role: m.rol === 'assistant' ? 'assistant' : 'user', content: String(m.txt || '').slice(0, 3000) }));
  return [{ role: 'system', content: SISTEMA }, ...prev, { role: 'user', content: `Fragmentos de mis apuntes:\n\n${ctx}\n\nPregunta: ${pregunta}` }];
}

const conTiempo = (ms) => { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); return { signal: c.signal, fin: () => clearTimeout(t) }; };
async function estadoOllama() {
  const t = conTiempo(2500);
  try {
    const r = await F(BASE + '/api/tags', { signal: t.signal }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), modelos = (j.models || []).map(m => m.name).filter(n => !/embed/i.test(n));
    return { ok: true, modelos, defecto: DEFECTO };
  } catch { return { ok: false, motivo: 'sin-ollama', defecto: DEFECTO }; } finally { t.fin(); }
}

// ---- clave de Gemini (por perfil): cifrada con safeStorage; si el sistema no lo permite, solo vive en memoria hasta cerrar la app ----
let CFG = {}, claveMem = '';
function init(ctx) { CFG = ctx || {}; claveMem = ''; }
const cifrado = async () => { try { return !!(safeStorage && await safeStorage.isAsyncEncryptionAvailable()); } catch { return false; } };   // las versiones síncronas de safeStorage están en desuso
async function leerClave() {
  if (claveMem) return claveMem;
  try { const j = JSON.parse(fs.readFileSync(CFG.keyFile, 'utf8')); if (j.gemini && await cifrado()) return (await safeStorage.decryptStringAsync(Buffer.from(j.gemini, 'base64'))).result; } catch {}
  return '';
}
async function guardarClave(k) {
  k = String(k || '').trim();
  if (!/^[\w.\-]{20,200}$/.test(k)) return { ok: false, msg: 'Esa clave no tiene el formato de una clave de Gemini' };
  const t = conTiempo(15000);
  try {   // se comprueba con una consulta que no gasta cuota (lista de modelos)
    const r = await F(GEMINI + '/models?pageSize=1', { headers: { 'x-goog-api-key': k }, signal: t.signal });
    if (r.status === 400 || r.status === 401 || r.status === 403) return { ok: false, msg: 'Gemini no acepta esa clave. Cópiala de nuevo desde Google AI Studio.' };
    if (!r.ok) return { ok: false, msg: 'No se pudo comprobar la clave (HTTP ' + r.status + '). Inténtalo de nuevo en un rato.' };
  } catch { return { ok: false, msg: 'No se pudo conectar con Google para comprobar la clave. Revisa tu conexión.' }; } finally { t.fin(); }
  let persistente = false;
  if (CFG.keyFile && await cifrado()) { try { fs.writeFileSync(CFG.keyFile, JSON.stringify({ gemini: (await safeStorage.encryptStringAsync(k)).toString('base64') }), { mode: 0o600 }); persistente = true; claveMem = ''; } catch {} }
  if (!persistente) claveMem = k;
  return { ok: true, persistente };
}
function quitarClave() { claveMem = ''; try { if (CFG.keyFile) fs.rmSync(CFG.keyFile, { force: true }); } catch {} return { ok: true }; }
async function estado() {
  const ollama = await estadoOllama();
  return { ...ollama, ollama, gemini: { clave: !!(await leerClave()), cifrada: await cifrado(), modelos: GEMINI_MODELOS, defecto: GEMINI_MODELOS[0] } };   // .ok/.modelos de arriba = Ollama (compatibilidad)
}

const activas = new Map();   // id de pregunta → AbortController
function cancelar(id) { const c = activas.get(id); if (c) c.abort(); }
// d = { id, pregunta, sigla, modelo, historial }; notes = apuntes del índice; emite({id, t:'chunk', txt}). Devuelve { ok, fuentes } o { ok:false, msg }
async function preguntar(d, notes, emite) {
  const pregunta = String(d.pregunta || '').trim().slice(0, 2000); if (!pregunta) return { ok: false, msg: 'Escribe una pregunta' };
  const modelo = /^[\w.:\/-]{1,100}$/.test(d.modelo || '') ? d.modelo : DEFECTO, hist = Array.isArray(d.historial) ? d.historial : [];
  const chunks = R.trocea(notes, d.sigla);
  if (!chunks.length) return { ok: false, msg: 'No hay apuntes en esta asignatura para consultar.' };
  // en una repregunta corta («¿y el segundo?») se añade la pregunta anterior para no perder el tema
  const ultima = [...hist].reverse().find(m => m.rol === 'user');
  const frags = R.busca(chunks, R.toks(pregunta).length < 3 && ultima ? ultima.txt + ' ' + pregunta : pregunta);
  const fuentes = frags.map((f, i) => ({ n: i + 1, path: f.path, titulo: f.titulo, sigla: f.sigla, cab: f.cab }));   // el número es el que cita el modelo
  if (!frags.length) { const m = 'No está en tus apuntes: no he encontrado ningún fragmento que hable de eso' + (d.sigla ? ' en esta asignatura.' : '.'); emite({ id: d.id, t: 'chunk', txt: m }); return { ok: true, fuentes: [], sinContexto: true }; }
  const ctl = new AbortController(); activas.set(d.id, ctl);
  if (d.proveedor === 'gemini') { try { return await conGemini(d, mensajes(pregunta, hist, frags), fuentes, emite, ctl); } finally { activas.delete(d.id); } }
  try {
    let r;
    try { r = await fetch(BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal, body: JSON.stringify({ model: modelo, stream: true, messages: mensajes(pregunta, hist, frags), options: { num_ctx: 8192, temperature: 0.2 } }) }); }
    catch (e) { if (ctl.signal.aborted) return { ok: true, fuentes, cancelado: true }; return { ok: false, msg: 'Ollama no responde. Ábrelo (aplicación Ollama) y vuelve a intentarlo.' }; }
    if (!r.ok) {
      let m = ''; try { m = (await r.json()).error || ''; } catch {}
      return { ok: false, msg: /not found/i.test(m) ? `El modelo «${modelo}» no está descargado. En la Terminal: ollama pull ${modelo}` : 'Ollama devolvió un error' + (m ? ': ' + m : ' (HTTP ' + r.status + ')') };
    }
    const dec = new TextDecoder(); let resto = '', hubo = false;
    const linea = (l) => { if (!l.trim()) return; let j; try { j = JSON.parse(l); } catch { return; } if (j.error) throw new Error(j.error); const t = j.message && j.message.content; if (t) { hubo = true; emite({ id: d.id, t: 'chunk', txt: t }); } };
    try { for await (const part of r.body) { resto += dec.decode(part, { stream: true }); const ls = resto.split('\n'); resto = ls.pop(); ls.forEach(linea); } linea(resto); }
    catch (e) { if (ctl.signal.aborted) return { ok: true, fuentes, cancelado: true }; return { ok: false, msg: 'Se cortó la respuesta: ' + (e.message || e) }; }
    return hubo ? { ok: true, fuentes } : { ok: false, msg: 'El modelo no devolvió respuesta.' };
  } finally { activas.delete(d.id); }
}

// Gemini en streaming (SSE). Si el modelo está saturado (503) o hay demasiadas peticiones (429), reintenta con espera y, al final, con otro modelo.
async function conGemini(d, msgs, fuentes, emite, ctl) {
  const clave = await leerClave(); if (!clave) return { ok: false, msg: 'Falta la clave de Gemini. Añádela en «IA opcional» de esta pantalla.' };
  const modelo = /^(gemini|gemma)-[\w.-]{1,60}$/.test(d.modelo || '') ? d.modelo : GEMINI_MODELOS[0];
  const cuerpo = JSON.stringify({
    systemInstruction: { parts: [{ text: msgs[0].content }] },
    contents: msgs.slice(1).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { temperature: 0.2 },
  });
  // hasta 3 intentos: el modelo elegido, otra vez tras 2 s y el otro modelo lite tras 4 s; cada intento espera como mucho 30 s a que Google empiece a responder
  const respaldo = GEMINI_MODELOS.find(x => x !== modelo) || GEMINI_MODELOS[0];
  let r = null, ac = null, timer = null;
  const cancela = () => { if (ac) ac.abort(); }; ctl.signal.addEventListener('abort', cancela);
  try {
    for (const [i, m] of [modelo, modelo, respaldo].entries()) {
      if (i) await new Promise(ok => setTimeout(ok, 2000 * i));
      if (ctl.signal.aborted) return { ok: true, fuentes, cancelado: true };
      ac = new AbortController(); timer = setTimeout(() => ac.abort(), 30000);
      try { r = await F(`${GEMINI}/models/${m}:streamGenerateContent?alt=sse`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave }, body: cuerpo, signal: ac.signal }); clearTimeout(timer); }
      catch (e) { clearTimeout(timer); if (ctl.signal.aborted) return { ok: true, fuentes, cancelado: true }; r = { ok: false, status: 503 }; continue; }   // sin respuesta en 30 s: como un 503
      if (r.status !== 503 && r.status !== 429) break;
    }
    if (!r.ok) {
      let m = ''; try { m = (await r.json()).error.message || ''; } catch {}
      return { ok: false, msg: r.status === 400 && /api key/i.test(m) ? 'Gemini no acepta la clave: vuelve a ponerla en Ajustes.' : r.status === 403 ? 'Gemini rechazó la petición (clave sin permiso o sin acceso a este modelo).' : r.status === 429 ? 'Has llegado al límite gratuito de Gemini. Espera un rato y vuelve a probar.' : r.status === 503 ? 'Gemini está saturado ahora mismo. Inténtalo en unos minutos o prueba con el otro modelo.' : 'Gemini devolvió un error (HTTP ' + r.status + ')' + (m ? ': ' + m.slice(0, 140) : '') };
    }
    const dec = new TextDecoder(); let resto = '', hubo = false, motivo = '';
    const linea = (l) => {
      if (!l.startsWith('data:')) return; let j; try { j = JSON.parse(l.slice(5)); } catch { return; }
      if (j.promptFeedback && j.promptFeedback.blockReason) motivo = j.promptFeedback.blockReason;
      const c = j.candidates && j.candidates[0]; if (!c) return; if (c.finishReason && c.finishReason !== 'STOP' && c.finishReason !== 'MAX_TOKENS') motivo = c.finishReason;
      for (const p of (c.content && c.content.parts) || []) if (p.text) { hubo = true; emite({ id: d.id, t: 'chunk', txt: p.text }); }
    };
    try { for await (const part of r.body) { resto += dec.decode(part, { stream: true }); const ls = resto.split('\n'); resto = ls.pop(); ls.forEach(linea); } linea(resto); }
    catch (e) { if (ctl.signal.aborted) return { ok: true, fuentes, cancelado: true }; return { ok: false, msg: 'Se cortó la respuesta: ' + (e.message || e) }; }
    return hubo ? { ok: true, fuentes } : { ok: false, msg: 'Gemini no devolvió texto' + (motivo ? ` (${motivo})` : '') + '.' };
  } finally { clearTimeout(timer); ctl.signal.removeEventListener('abort', cancela); }
}

// ---- Tareas con IA sobre UN apunte (test, resumen) o un borrador de mensaje; sin streaming. Solo se envía el texto que se le pasa. ----
const TAREAS = {
  test: { json: true, sistema: `Creas tests de opción múltiple para estudiar. Usa SOLO el contenido del apunte que se te da; no añadas datos de fuera.
Devuelve únicamente JSON con esta forma exacta: {"preguntas":[{"pregunta":"…","opciones":["…","…","…","…"],"correcta":0,"explicacion":"…"}]}
- 8 preguntas en español, cada una con 4 opciones; "correcta" es la posición (0 a 3) de la opción correcta; las opciones falsas deben ser verosímiles.
- "explicacion": una frase que justifique la respuesta según el apunte.`, pide: (t) => `Apunte:\n\n${t}` },
  resumen: { json: false, sistema: `Resumes apuntes de estudio en español usando SOLO su contenido. Formato: 5 a 8 viñetas con lo esencial y, al final, «Conceptos clave:» con 3 a 6 términos. No inventes nada. Si el apunte marca datos como [supuesto] o [pendiente], dilo.`, pide: (t) => `Apunte:\n\n${t}` },
  mensaje: { json: false, sistema: `Redactas borradores de mensajes breves, claros y educados, en español, para enviar a un profesor o compañero por el campus virtual. Parte de la idea del alumno y no inventes datos (fechas, notas, nombres). Devuelve solo el texto del mensaje, sin asunto ni explicaciones, con saludo y despedida sencillos.`, pide: (t) => `Idea del alumno: ${t}` },
};
function leeTest(txt) {
  let j; try { j = JSON.parse(String(txt).replace(/^```(?:json)?\s*|\s*```$/g, '').trim()); } catch { return null; }
  const arr = Array.isArray(j) ? j : j && j.preguntas; if (!Array.isArray(arr)) return null;
  const out = [];
  for (const p of arr.slice(0, 12)) {
    const op = Array.isArray(p && p.opciones) ? p.opciones.map(x => String(x).slice(0, 300)).filter(Boolean).slice(0, 4) : [], c = Number.isInteger(p && p.correcta) ? p.correcta : parseInt(p && p.correcta, 10);
    if (!p || !p.pregunta || op.length < 3 || !(c >= 0 && c < op.length)) continue;
    out.push({ pregunta: String(p.pregunta).slice(0, 400), opciones: op, correcta: c, explicacion: String(p.explicacion || '').slice(0, 400) });
  }
  return out.length ? out : null;
}
async function completarGemini(modelo, sistema, usuario, json, signal) {
  const clave = await leerClave(); if (!clave) return { ok: false, msg: 'Falta la clave de Gemini. Añádela en ⚙ Ajustes.' };
  const m0 = /^(gemini|gemma)-[\w.-]{1,60}$/.test(modelo || '') ? modelo : GEMINI_MODELOS[0], respaldo = GEMINI_MODELOS.find(x => x !== m0) || GEMINI_MODELOS[0];
  const cuerpo = JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: [{ text: usuario }] }], generationConfig: { temperature: 0.3, ...(json ? { responseMimeType: 'application/json' } : {}) } });
  let r = null;
  for (const [i, m] of [m0, m0, respaldo].entries()) {
    if (i) await new Promise(ok => setTimeout(ok, 2000 * i)); if (signal && signal.aborted) return { ok: false, msg: 'Cancelado' };
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 60000);
    try { r = await F(`${GEMINI}/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave }, body: cuerpo, signal: ac.signal }); clearTimeout(timer); }
    catch { clearTimeout(timer); r = { ok: false, status: 503 }; continue; }
    if (r.status !== 503 && r.status !== 429) break;
  }
  if (!r.ok) return { ok: false, msg: r.status === 429 ? 'Has llegado al límite gratuito de Gemini. Espera un rato.' : r.status === 503 ? 'Gemini está saturado ahora mismo. Inténtalo en unos minutos.' : r.status === 400 || r.status === 403 ? 'Gemini rechazó la petición (revisa la clave en Ajustes).' : 'Gemini devolvió un error (HTTP ' + r.status + ').' };
  const j = await r.json(), c = j.candidates && j.candidates[0], txt = ((c && c.content && c.content.parts) || []).map(p => p.text || '').join('');
  return txt ? { ok: true, txt } : { ok: false, msg: 'Gemini no devolvió texto' + ((j.promptFeedback && j.promptFeedback.blockReason) ? ` (${j.promptFeedback.blockReason})` : '') + '.' };
}
async function completarOllama(modelo, sistema, usuario, json) {
  const m = /^[\w.:\/-]{1,100}$/.test(modelo || '') ? modelo : DEFECTO;
  try {
    const r = await F(BASE + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m, stream: false, ...(json ? { format: 'json' } : {}), messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }], options: { num_ctx: 8192, temperature: 0.3 } }) });
    if (!r.ok) { let e = ''; try { e = (await r.json()).error || ''; } catch {} return { ok: false, msg: /not found/i.test(e) ? `El modelo «${m}» no está descargado. En la Terminal: ollama pull ${m}` : 'Ollama devolvió un error' + (e ? ': ' + e : '') }; }
    const j = await r.json(), txt = j.message && j.message.content; return txt ? { ok: true, txt } : { ok: false, msg: 'El modelo no devolvió respuesta.' };
  } catch { return { ok: false, msg: 'Ollama no responde. Ábrelo (aplicación Ollama) y vuelve a intentarlo.' }; }
}
// d = { tipo: 'test'|'resumen'|'mensaje', texto, proveedor, modelo }. Devuelve { ok, tipo, preguntas | texto } o { ok:false, msg }
async function tarea(d) {
  const T = TAREAS[d && d.tipo]; if (!T) return { ok: false, msg: 'Tarea no válida' };
  const texto = String(d.texto || '').trim().slice(0, d.tipo === 'mensaje' ? 1500 : 14000); if (texto.length < (d.tipo === 'mensaje' ? 5 : 80)) return { ok: false, msg: d.tipo === 'mensaje' ? 'Escribe qué quieres decir.' : 'Este apunte es demasiado corto para trabajar con él.' };
  const r = d.proveedor === 'gemini' ? await completarGemini(d.modelo, T.sistema, T.pide(texto), T.json) : await completarOllama(d.modelo, T.sistema, T.pide(texto), T.json);
  if (!r.ok) return r;
  if (d.tipo === 'test') { const p = leeTest(r.txt); return p ? { ok: true, tipo: 'test', preguntas: p } : { ok: false, msg: 'La IA no devolvió un test válido. Inténtalo otra vez (los modelos pequeños fallan a veces).' }; }
  return { ok: true, tipo: d.tipo, texto: r.txt.trim().slice(0, 6000) };
}
module.exports = { init, tarea, _leeTest: leeTest, guardarClave, quitarClave, _fetch: (f) => { F = f || ((...a) => fetch(...a)); }, estado, preguntar, cancelar, _trocea: R.trocea, _busca: R.busca, _mensajes: mensajes, BASE, DEFECTO };
