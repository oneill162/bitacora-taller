---
tipo: manual
paso: 13
tags: [manual, software, windows]
---
# 13 · Visor de eventos

```
eventvwr.msc
```
*Registros de Windows → Sistema* y usa *Filtrar registro actual* marcando **Crítico** y **Error** en las últimas 24 horas.

Dos eventos que debes reconocer:
- **Kernel-Power, evento 41** — el equipo se apagó sin cerrar bien. Apunta a corriente, fuente de poder o sobrecalentamiento.
- **Disk, evento 7 o 51** — errores de lectura o escritura en el disco. Correlaciónalo con [[06 Almacenamiento]].

Anota el **ID del evento** y la **fuente**. Esos dos datos bastan para investigar después; copiar el texto completo no hace falta.

Anterior: [[12 Energía y batería]] · Siguiente: [[14 Veredicto y entrega]]
