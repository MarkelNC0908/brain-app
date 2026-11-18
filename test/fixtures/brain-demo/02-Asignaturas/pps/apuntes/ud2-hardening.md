---
type: tema
sigla: "PPS"
title: "PPS · tema · Hardening con Fail2Ban y MySQL"
status: revisado
updated: 2026-11-10
---

# Hardening con Fail2Ban y MySQL

## Conceptos clave
- PPS, Hardening: reducir superficie de ataque quitando servicios, cuentas y permisos innecesarios en un servidor [verificado]
- PPS, Fail2Ban: aplicación que cuenta fallos de autenticación por IP y bloquea la dirección al superar el límite configurado [verificado]
- PPS, Snapshot: copia del estado de la máquina virtual que se hace antes de cambiar nada en el servidor [verificado]

## Hardening de MySQL
1. Paso 0: snapshot de la VM y copia de los ficheros de configuración antes de modificar nada.
2. Ejecutar mysql_secure_installation para quitar usuarios anónimos y la base de datos de pruebas.
3. Limitar el acceso remoto de root y escuchar solo en 127.0.0.1 si la aplicación está en la misma máquina.

