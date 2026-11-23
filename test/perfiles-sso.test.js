// La URL del campus no puede ser la página de inicio de sesión de la universidad (SSO): la app abriría páginas que no existen
const P = require('../src/profiles.js');
let ok = 0, ko = 0; const t = (n, c) => { c ? ok++ : (ko++, console.log('FALLA', n)); };
const f = P._esPaginaDeLogin;
t('SAML/Shibboleth de una universidad', f('https://id-provider.uoc.edu/idp/profile/SAML2/Redirect/SSO?execution=e1s1'));
t('Microsoft, CAS y ADFS', f('https://login.microsoftonline.com/x/saml2') && f('https://sso.uni.es/cas/login') && f('https://adfs.uni.es/adfs/ls/'));
t('campus normales', !f('https://u-tad.blackboard.com') && !f('https://universidad.instructure.com') && !f('https://campus.uni.es/moodle') && !f('https://aula.uni.edu') && !f('https://loginator.uni.es'));
console.log('ok', ok, 'ko', ko);
