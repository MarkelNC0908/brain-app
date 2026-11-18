// Asistente de estudio: responde dudas sobre los apuntes con un modelo LOCAL de Ollama (gratis, sin claves y sin que los apuntes salgan del equipo).
// La dirección está fija en 127.0.0.1:11434: no hay forma de apuntarla a un servicio externo.
// Flujo: la pregunta se compara con trozos de los apuntes (búsqueda por palabras, sin base vectorial), los mejores se pasan al modelo
// como único material permitido y la respuesta se emite por trozos mientras se genera. Solo se usan apuntes: nunca entregas, _entrada ni 99-Privado
// (el índice que recibe ya los excluye).
const BASE = 'http://127.0.0.1:11434';
const DEFECTO = 'qwen2.5:7b';
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
async function estado() {
  const t = conTiempo(2500);
  try {
    const r = await fetch(BASE + '/api/tags', { signal: t.signal }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), modelos = (j.models || []).map(m => m.name).filter(n => !/embed/i.test(n));
    return { ok: true, modelos, defecto: DEFECTO };
  } catch { return { ok: false, motivo: 'sin-ollama', defecto: DEFECTO }; } finally { t.fin(); }
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
module.exports = { estado, preguntar, cancelar, _trocea: R.trocea, _busca: R.busca, _mensajes: mensajes, BASE, DEFECTO };
