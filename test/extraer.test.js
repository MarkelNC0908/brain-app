// Extracción de texto de PDF, Word y PowerPoint (el PDF es un fixture sin datos de nadie; Word y PowerPoint se generan aquí) y su uso en el buscador
const fs = require('fs'), os = require('os'), path = require('path'), JSZip = require('jszip');
const { extraerTexto, _xmlOffice } = require('../src/extraer.js'), R = require('../src/respuestas.js');
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-extraer-')), cache = path.join(dir, 'cache');
(async () => {
  t('xml office', _xmlOffice('<w:p><w:r><w:t>Hola &amp; adiós</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Segunda</w:t></w:r></w:p>', 'w') === 'Hola & adiós\nSegunda');
  const dz = new JSZip(); dz.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>El hardening reduce la superficie de ataque</w:t></w:r></w:p><w:p><w:r><w:t>Fail2Ban bloquea IP tras varios fallos</w:t></w:r></w:p></w:body></w:document>');
  fs.writeFileSync(path.join(dir, 'a.docx'), await dz.generateAsync({ type: 'nodebuffer' }));
  const pz = new JSZip(); for (const [i, tx] of [[2, 'Segunda diapositiva: cifrado TDE'], [1, 'Primera diapositiva: snapshot de la VM']]) pz.file(`ppt/slides/slide${i}.xml`, `<p:sld><a:p><a:r><a:t>${tx}</a:t></a:r></a:p></p:sld>`);
  fs.writeFileSync(path.join(dir, 'b.pptx'), await pz.generateAsync({ type: 'nodebuffer' }));
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'ejemplo.pdf'), path.join(dir, 'c.pdf'));   // PDF real (generado con cupsfilter) con dos líneas de texto
  fs.writeFileSync(path.join(dir, 'd.txt'), 'no se extrae'); fs.writeFileSync(path.join(dir, 'roto.pdf'), 'esto no es un pdf');
  const d = await extraerTexto(path.join(dir, 'a.docx'), cache); t('docx', /El hardening reduce la superficie/.test(d) && /Fail2Ban bloquea/.test(d));
  const p = await extraerTexto(path.join(dir, 'b.pptx'), cache); t('pptx en orden de diapositiva', p.indexOf('Primera diapositiva') < p.indexOf('Segunda diapositiva') && /## Diapositiva 1/.test(p));
  const f = await extraerTexto(path.join(dir, 'c.pdf'), cache); t('pdf', /Cadena de custodia garantiza/.test(f)); if (!/Cadena/.test(f)) console.log('PDF →', JSON.stringify(f));
  t('txt no se extrae', (await extraerTexto(path.join(dir, 'd.txt'), cache)) === ''); t('pdf roto no rompe', (await extraerTexto(path.join(dir, 'roto.pdf'), cache)) === '');
  t('caché creada', fs.readdirSync(cache).length === 3);
  fs.writeFileSync(path.join(dir, 'a.docx'), Buffer.from('corrupto')); const antes = fs.statSync(path.join(dir, 'a.docx')); t('si el fichero cambia se invalida la caché', (await extraerTexto(path.join(dir, 'a.docx'), cache)) === '' && antes.size === 8);
  // el buscador usa el texto de los externos
  const notas = [{ path: 'x/c.pdf', title: 'c.pdf', base: 'c', sigla: 'HE', externo: true, ext: 'pdf', body: f }, { path: 'x/v.pdf', title: 'v.pdf', base: 'v', sigla: 'HE', externo: true, ext: 'pdf', body: '' }];
  t('trocea incluye externos con texto', R.trocea(notas, '').length === 1 && R.busca(R.trocea(notas, ''), 'cadena de custodia').length === 1);
  fs.rmSync(dir, { recursive: true, force: true }); console.log('ok', ok, 'ko', ko); process.exit(0);
})();
