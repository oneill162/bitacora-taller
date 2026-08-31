---
tipo: manual
paso: 8
tags: [manual, software, windows]
---
# 08 · Integridad del sistema

Cuando Windows se comporta raro sin causa clara, se revisan los archivos del propio sistema. **El orden importa: primero DISM, después SFC**, porque SFC repara usando la imagen que DISM acaba de sanar.

```
DISM /Online /Cleanup-Image /RestoreHealth
sfc /scannow
```

DISM necesita internet porque descarga los archivos buenos de Windows Update. Cada comando puede tardar de 10 a 30 minutos; deja que terminen sin cerrar la ventana.

## Cómo leer el resultado de SFC
| Mensaje | Significa |
|---|---|
| No encontró infracciones | Bien. Archivos del sistema íntegros |
| Reparó archivos | Observación. Había daño; reinicia y vuelve a correrlo para confirmar |
| No pudo reparar | Falla. Escala: puede requerir reparación de instalación o reinstalar Windows |

Anterior: [[07 Arranque de Windows]] · Siguiente: [[09 Actualizaciones y seguridad]]
