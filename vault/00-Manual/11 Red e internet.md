---
tipo: manual
paso: 11
tags: [manual, red]
---
# 11 · Red e internet

Se prueba de adentro hacia afuera: primero la tarjeta, después el router, después el internet, y por último los nombres de dominio.

```
ipconfig /all
ping 127.0.0.1
ping 192.168.1.1
ping 8.8.8.8
nslookup google.com
```

| Dónde falla | Qué indica |
|---|---|
| 127.0.0.1 | La pila de red de Windows está dañada. Casi nunca falla |
| Puerta de enlace | Cable, Wi-Fi o router. Una IP que empieza en 169.254 significa que no recibió DHCP |
| 8.8.8.8 | Hay red local pero no hay salida a internet: cae del lado del proveedor o del router |
| nslookup | Hay internet pero el DNS no resuelve nombres |

Si nada destraba, reinicia la configuración de red:
```
ipconfig /release
ipconfig /renew
ipconfig /flushdns
netsh winsock reset
```
El último requiere reiniciar el equipo para tomar efecto.

Anterior: [[10 Dispositivos y periféricos]] · Siguiente: [[12 Energía y batería]]
