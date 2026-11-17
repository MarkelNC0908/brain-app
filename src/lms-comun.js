// Utilidades comunes de los conectores de campus virtual.
class NeedLogin extends Error {}
const entidades = (s) => String(s).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n));
const quitaTags = (h) => entidades(String(h).replace(/<span class="accesshide[^>]*>[\s\S]*?<\/span>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const dmy = (d) => { const x = new Date(d); return isNaN(x) ? '' : `${x.getDate()}/${x.getMonth() + 1}/${x.getFullYear()}`; };
const iso = (d) => { const x = new Date(d); return isNaN(x) ? '' : `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const coma = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
module.exports = { NeedLogin, entidades, quitaTags, dmy, iso, coma };
