// Proceso hijo de extraer.js: node extraer-cli.js <fichero> → imprime {"txt": "..."} (vacío si no se puede). No usa red.
const { extraerDirecto } = require('./extraer');
extraerDirecto(process.argv[2] || '').then(txt => { process.stdout.write(JSON.stringify({ txt })); process.exit(0); }).catch(() => { process.stdout.write('{"txt":""}'); process.exit(0); });
