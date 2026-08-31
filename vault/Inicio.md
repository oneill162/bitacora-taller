---
tipo: tablero
---
# Bitácora del Taller

Los estudiantes trabajan en la **app web** y todo lo que entregan aterriza aquí como notas.
Las carpetas `02-Equipos`, `03-Estudiantes` y `04-Diagnosticos` las alimenta el sincronizador — ver [[Cómo funciona esto]].

## Protocolo
[[00 Seguridad antes de tocar nada]] · [[01 Identificar el equipo]] · [[02 Inspección externa]] · [[03 Encendido y POST]] · [[04 Interior y enfriamiento]] · [[05 Memoria RAM]] · [[06 Almacenamiento]] · [[07 Arranque de Windows]] · [[08 Integridad del sistema]] · [[09 Actualizaciones y seguridad]] · [[10 Dispositivos y periféricos]] · [[11 Red e internet]] · [[12 Energía y batería]] · [[13 Visor de eventos]] · [[14 Veredicto y entrega]] · [[15 Glosario]]

## Equipos que salieron No Apto
```dataview
TABLE WITHOUT ID
  link(file.link, equipo_serial) AS "Equipo",
  fecha AS "Fecha",
  estudiante AS "Técnico",
  falla AS "Fallas",
  proximo_paso AS "Próximo paso"
FROM "04-Diagnosticos"
WHERE veredicto = "no"
SORT fecha DESC
```

## Últimos diagnósticos entregados
```dataview
TABLE WITHOUT ID
  file.link AS "Hoja",
  fecha AS "Fecha",
  estudiante AS "Técnico",
  equipo AS "Equipo",
  veredicto_texto AS "Veredicto"
FROM "04-Diagnosticos"
WHERE estado = "entregado"
SORT fecha DESC
LIMIT 25
```

## Producción por estudiante
```dataview
TABLE WITHOUT ID
  estudiante AS "Estudiante",
  length(rows) AS "Hojas",
  sum(rows.falla) AS "Fallas halladas",
  sum(rows.obs) AS "Observaciones",
  max(rows.fecha) AS "Última"
FROM "04-Diagnosticos"
WHERE estado = "entregado"
GROUP BY estudiante
SORT length(rows) DESC
```

## Borradores sin entregar
```dataview
TABLE WITHOUT ID
  file.link AS "Hoja", estudiante AS "Técnico", fecha AS "Empezada"
FROM "04-Diagnosticos"
WHERE estado = "borrador"
SORT fecha ASC
```
