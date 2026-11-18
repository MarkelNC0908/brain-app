---
type: tema
sigla: "HE"
title: "HE · tema · Cross-Site Scripting (XSS)"
status: revisado
updated: 2026-11-10
---

# Cross-Site Scripting (XSS)

**TL;DR**: el XSS inyecta código en páginas que ven otros usuarios.

## Conceptos clave
- HE, XSS reflejado: el payload viaja en la petición y se devuelve en la respuesta sin guardarse en el servidor [verificado]
- HE, XSS almacenado: el payload queda guardado en la base de datos y afecta a todo el que cargue la página [verificado]
- HE, Sanitización: limpiar o escapar la entrada del usuario antes de mostrarla en el HTML de la página [verificado]
- HE, Content Security Policy: cabecera que limita desde dónde puede cargar scripts el navegador [verificado]

## Ejercicio 1 — inyección directa
El método consiste en probar etiquetas simples en los campos que se reflejan en la página, comprobando si el navegador las ejecuta sin ningún filtro.

