---
tipo: equipo
serial:
marca:
modelo:
inventario:
ubicacion:
---
# {{title}}

## Historial de diagnósticos
```dataview
TABLE WITHOUT ID file.link AS "Hoja", fecha AS "Fecha", estudiante AS "Técnico", veredicto_texto AS "Veredicto"
FROM "04-Diagnosticos"
WHERE equipo_serial = this.serial
SORT fecha DESC
```

## Notas del instructor
