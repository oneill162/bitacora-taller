---
tipo: manual
paso: 12
tags: [manual, hardware, bateria]
---
# 12 · Energía y batería

Solo para portátiles.

```
powercfg /batteryreport
```
El comando dice dónde guardó el archivo HTML (normalmente en tu carpeta de usuario). Ábrelo en el navegador y compara:

- **Design Capacity** — lo que la batería aguantaba nueva
- **Full Charge Capacity** — lo que aguanta hoy

Salud = capacidad actual ÷ capacidad de diseño. Sobre 80% es Bien; entre 50% y 80% es Observación; bajo 50%, o batería hinchada, es Falla y se reemplaza.

> [!danger] Batería hinchada
> Se retira del servicio de inmediato. No se pincha, no se dobla, no se sigue usando.

Confirma también que el equipo cargue: conecta el adaptador y verifica que el ícono cambie a "cargando" y el porcentaje suba.

Anterior: [[11 Red e internet]] · Siguiente: [[13 Visor de eventos]]
