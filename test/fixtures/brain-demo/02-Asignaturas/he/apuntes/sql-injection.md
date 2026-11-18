---
type: tema
sigla: "HE"
title: "HE · tema · Inyección SQL"
status: revisado
updated: 2026-11-10
---

# Inyección SQL

## Fundamentos
- HE, Inyección SQL: manipular una consulta de base de datos mediante datos de entrada no filtrados que llegan a la aplicación [verificado]
- HE, Inyección SQL ciega: no se ve el resultado de la consulta; se deduce por tiempos o respuestas verdadero o falso [verificado]
- HE, Consultas parametrizadas: separan los datos del código SQL y evitan la mayoría de las inyecciones [verificado]

## Inyección ciega por tiempo
La técnica mide el retraso de la respuesta cuando se fuerza una condición con la función sleep para deducir el contenido carácter a carácter.

