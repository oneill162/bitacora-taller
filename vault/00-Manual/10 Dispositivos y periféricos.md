---
tipo: manual
paso: 10
tags: [manual, hardware, perifericos]
---
# 10 · Dispositivos y periféricos

```
devmgmt.msc
```
Un **triángulo amarillo** = controlador con problema. Un **"Dispositivo desconocido"** = falta el driver. Anota el nombre exacto del dispositivo; se resuelve bajando el controlador del sitio del fabricante del equipo, no de páginas de terceros.

## Prueba de periféricos
- **Pantalla:** fondo blanco y fondo negro a pantalla completa para cazar píxeles muertos, manchas y parpadeo
- **Teclado:** Bloc de notas, fila por fila, incluyendo el numérico. En equipos en español verifica la `ñ` y los acentos
- **Touchpad y mouse:** movimiento, ambos clics, desplazamiento
- **Audio:** reproduce un sonido y prueba el micrófono en *Configuración → Sistema → Sonido*; la barra de entrada debe moverse al hablar
- **Puertos USB:** prueba cada puerto con la misma memoria USB. Si uno falla y los demás no, el puerto es el problema
- **Cámara:** app Cámara, con imagen y luz indicadora

```
dxdiag
```

Anterior: [[09 Actualizaciones y seguridad]] · Siguiente: [[11 Red e internet]]
