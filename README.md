# Brain

App para estudiar con tus apuntes, **tengas un Brain o solo una carpeta de notas**: lee tus asignaturas, muestra los apuntes, un dashboard
de entregas y notas, un modo juego (tests y flashcards generados de tus propios apuntes) y avisos de entregas cercanas. Funciona con
cualquier universidad. Cada persona usa su propio perfil, con su carpeta y su campus virtual, sin mezclar datos con los demás.

> Las apps **no están firmadas**: el sistema te avisará la primera vez. Instrucciones abajo.

## Descargas
Están en la sección **Releases** (columna derecha de este repositorio), no en el código.

| Sistema | Fichero |
|---|---|
| macOS (Apple Silicon) | `Brain-macos-arm64.zip` |
| Windows 10/11 (x64) | `Brain-windows-x64.zip` |
| Linux (x64) | `Brain-linux-x64.zip` |
| Android 7+ | `Brain-android.apk` |

## Instalar y abrir
- **macOS:** descomprime y arrastra la app a Aplicaciones. La primera vez: clic derecho sobre la app → **Abrir** → Abrir.
- **Windows:** descomprime y ejecuta el `.exe`. Si SmartScreen avisa: **Más información** → **Ejecutar de todas formas**.
- **Linux:** descomprime y ejecútalo desde la terminal. La terminal integrada no estará disponible salvo que recompiles `node-pty` en tu sistema.
- **Android:** copia el `.apk` al móvil y ábrelo (hay que permitir «instalar apps desconocidas»). Es una compilación de depuración.

## Primer uso (escritorio)
1. Crea tu **perfil**: nombre, carpeta de apuntes, tipo de campus virtual con su dirección (opcional) y un PIN (opcional).
2. Añade asignaturas con **＋ Añadir asignatura**, o copia tus apuntes a esa carpeta.
3. Varias personas pueden compartir el ordenador: al abrir, cada una elige su perfil.

El **PIN** solo evita entrar por error en el perfil de otra persona; **no cifra** tus apuntes.

## Con o sin Brain
- **Con un Brain** (estructura de abajo): ficha, apuntes, entregas y recursos por asignatura, con sincronización con GitHub.
- **Sin Brain:** elige cualquier carpeta con tus apuntes. Cada **subcarpeta es una asignatura**, los ficheros sueltos de la raíz forman una más y se leen `.md`, `.markdown` y `.txt` (los PDF, Word y PowerPoint aparecen en la lista y se abren con su aplicación). En este modo no hay «Publicar apuntes» ni sincronización con GitHub.

```
02-Asignaturas/<sigla>/<sigla>.md      ficha de la asignatura (con «title:» en el frontmatter)
02-Asignaturas/<sigla>/apuntes/*.md    una nota por tema
02-Asignaturas/<sigla>/entregas/*.md   una nota por entrega (frontmatter: due, status, grade)
02-Asignaturas/<sigla>/recursos/       material
02-Asignaturas/<sigla>/_entrada/       ficheros sin procesar (la app no los lee)
```

## Qué hace
- **Apuntes:** árbol por asignatura, búsqueda, enlaces `[[nota]]` y retroenlaces.
- **Dashboard sin montar nada:** se genera con lo que haya en tus apuntes: notas de `entregas/`, líneas con fecha (`AAAA-MM-DD` o `dd/mm/aaaa`) y tareas `- [ ] … (AAAA-MM-DD)`. Muestra entregas, notas, próxima entrega y un tablero que se mueve arrastrando tarjetas (se guarda en tus apuntes). Si aún no hay entregas, enseña un resumen de tu contenido y deja añadirlas desde ahí.
- **Modo juego:** tests y flashcards con repaso espaciado, XP, rachas e insignias, a partir de líneas como `- **Término**: definición`. El progreso es de cada perfil.
- **Campus virtuales:** cada perfil elige **Blackboard, Moodle, Canvas** o **«Otro campus»** mediante la dirección de su **calendario iCal** (la mayoría de campus permiten exportarlo). Avisan de novedades, traen ficheros nuevos a `_entrada/`, notas y plazos. Inicias sesión en una ventana de la propia app, que no ve ni guarda tu contraseña.
- **Vídeos del campus:** se descargan en streaming (hasta 8 GB por fichero) con tamaño, barra de progreso y botón de cancelar; si se corta no queda nada a medias. Los que el campus no permite bajar (YouTube, Panopto, Collaborate…) se guardan como enlace en `recursos/videos-del-campus.md`.
- **GitHub (con Brain):** `git pull` al abrir y botón para publicar tus apuntes; un LED indica si estás al día.
- **Terminal integrada** para lanzar `claude` en tu carpeta (macOS y Windows).

## Móvil (Android)
Versión de lectura: apuntes, modo juego, dashboard y avisos de entregas. Lee **tu** repositorio de GitHub con un token de **solo lectura**
(Settings → Developer settings → Fine-grained tokens → solo tu repositorio → *Contents: Read-only*). El token se guarda solo en la app.
No incluye terminal, carpeta local, conexión con el campus ni edición. iOS no está disponible todavía.

## Privacidad
- Tus perfiles y el estado de la app se guardan en la carpeta de datos de tu usuario del sistema, nunca dentro de la app ni de tus apuntes.
- La app solo lee y escribe dentro de la carpeta de tu perfil.
- Las compilaciones no incluyen datos personales de quien las generó.

## Límites conocidos
Probado en macOS (Apple Silicon) y en un emulador Android. Windows y Linux se han generado pero no se han probado en un sistema real.
Los conectores de Moodle, Canvas e iCal y la descarga de vídeos se han probado con servidores simulados, no con un campus real: si algo no cuadra en el tuyo, avisa.
El cruce entre cursos del campus y asignaturas es aproximado: revisa las casillas antes de aplicar.
