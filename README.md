# Brain U-tad

App para estudiar con tu **Brain** de apuntes: lee tus asignaturas, muestra los apuntes, un dashboard de entregas y notas,
un modo juego (tests y flashcards generados de tus propios apuntes) y avisos de entregas cercanas. Cada persona usa su propio
perfil, con su carpeta de Brain y su campus Blackboard, sin mezclar datos con los demás.

> Las apps **no están firmadas**: el sistema te avisará la primera vez. Instrucciones abajo.

## Descargas
Están en la sección **Releases** (columna derecha de este repositorio), no en el código.

| Sistema | Fichero |
|---|---|
| macOS (Apple Silicon) | `Brain-U-tad-macos-arm64.zip` |
| Windows 10/11 (x64) | `Brain-U-tad-windows-x64.zip` |
| Linux (x64) | `Brain-U-tad-linux-x64.zip` |
| Android 7+ | `Brain-U-tad-android.apk` |

## Instalar y abrir
- **macOS:** descomprime y arrastra `Brain U-tad.app` a Aplicaciones. La primera vez: clic derecho sobre la app → **Abrir** → Abrir.
- **Windows:** descomprime y ejecuta `Brain U-tad.exe`. Si SmartScreen avisa: **Más información** → **Ejecutar de todas formas**.
- **Linux:** descomprime y ejecuta `./Brain\ U-tad`. La terminal integrada no estará disponible salvo que recompiles `node-pty` en tu sistema.
- **Android:** copia el `.apk` al móvil y ábrelo (hay que permitir «instalar apps desconocidas»). Es una compilación de depuración.

## Primer uso (escritorio)
1. Crea tu **perfil**: nombre, carpeta de tu Brain (si está vacía, la app crea `02-Asignaturas/`), URL de tu campus Blackboard (opcional) y un PIN (opcional).
2. Añade asignaturas con **＋ Añadir asignatura**, o copia tu Brain a esa carpeta.
3. Varias personas pueden compartir el ordenador: al abrir, cada una elige su perfil.

El **PIN** solo evita entrar por error en el perfil de otra persona; **no cifra** tu Brain.

## Estructura que espera el Brain
```
02-Asignaturas/<sigla>/<sigla>.md      ficha de la asignatura (con «title:» en el frontmatter)
02-Asignaturas/<sigla>/apuntes/*.md    una nota por tema; las líneas «- SIGLA, término: definición» alimentan el modo juego
02-Asignaturas/<sigla>/entregas/*.md   una nota por entrega (frontmatter: due, status, grade)
02-Asignaturas/<sigla>/recursos/       material
02-Asignaturas/<sigla>/_entrada/       ficheros sin procesar (la app no los lee)
```

## Qué hace
- **Apuntes:** árbol por asignatura, búsqueda, enlaces `[[nota]]` y retroenlaces.
- **Dashboard:** entregadas, corregidas, nota media, próxima entrega y un tablero que se puede mover arrastrando tarjetas (se guarda en tu Brain).
- **Modo juego:** tests y flashcards con repaso espaciado, XP, rachas e insignias. El progreso es de cada perfil.
- **Blackboard:** con tu sesión (iniciada en la propia app, que no ve tu contraseña) avisa de novedades y permite traer ficheros nuevos y notas a tu Brain.
- **GitHub:** `git pull` al abrir y botón para publicar tus apuntes; un LED indica si estás al día.
- **Terminal integrada** para lanzar `claude` en la carpeta del Brain (macOS y Windows).

## Móvil (Android)
Versión de lectura: apuntes, modo juego, dashboard y avisos de entregas. Lee **tu** repositorio de GitHub con un token de **solo lectura**
(Settings → Developer settings → Fine-grained tokens → solo tu repositorio → *Contents: Read-only*). El token se guarda solo en la app.
No incluye terminal, ingesta de Blackboard ni edición. iOS no está disponible todavía.

## Privacidad
- Tus perfiles y el estado de la app se guardan en la carpeta de datos de tu usuario del sistema, nunca dentro de la app ni de tu Brain.
- La app solo lee y escribe dentro de la carpeta del Brain de tu perfil.
- Las compilaciones no incluyen datos personales de quien las generó.

## Límites conocidos
Probado en macOS (Apple Silicon) y en un emulador Android. Las compilaciones de Windows y Linux se han generado pero no se han probado en un sistema real.
El cruce entre cursos de Blackboard y asignaturas es aproximado fuera de U-tad: revisa las casillas antes de aplicar.
