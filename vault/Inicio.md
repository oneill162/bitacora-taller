---
tipo: tablero
---
# Bitácora del Taller

Los estudiantes trabajan en la **app web** y todo lo que entregan aterriza aquí como notas.
Las carpetas `02-Equipos`, `03-Estudiantes` y `04-Diagnosticos` las alimenta el sincronizador — ver [[Cómo funciona esto]].

> [!tip] Esto es la vista larga
> Para saber quién está trabajando **hoy**, mira el tablero del día en la app. Aquí está lo acumulado: el historial de cada equipo, cómo va el semestre, y tus propias notas.

## Protocolo
[[00 Seguridad antes de tocar nada]] · [[01 Identificar el equipo]] · [[02 Inspección externa]] · [[03 Encendido y POST]] · [[04 Interior y enfriamiento]] · [[05 Memoria RAM]] · [[06 Almacenamiento]] · [[07 Arranque de Windows]] · [[08 Integridad del sistema]] · [[09 Actualizaciones y seguridad]] · [[10 Dispositivos y periféricos]] · [[11 Red e internet]] · [[12 Energía y batería]] · [[13 Visor de eventos]] · [[14 Veredicto y entrega]] · [[15 Glosario]]

## Hojas entregadas sin culminar
Entregadas pero a las que les falta algo. La app las marca igual; aquí quedan por escrito para repasarlas con calma.
```dataview
TABLE WITHOUT ID
  file.link AS "Hoja", estudiante AS "Técnico", fecha AS "Fecha", falta AS "Qué le falta"
FROM "04-Diagnosticos"
WHERE estado = "entregado" AND completa = false
SORT fecha DESC
```

## Equipos que salieron No Apto
```dataview
TABLE WITHOUT ID
  link(file.link, equipo_serial) AS "Equipo",
  salon AS "Salón",
  fecha AS "Fecha",
  estudiante AS "Técnico",
  falla AS "Fallas",
  proximo_paso AS "Próximo paso"
FROM "04-Diagnosticos"
WHERE veredicto = "no"
SORT fecha DESC
```

## Máquinas que vuelven a fallar
Más de una revisión con fallas. Si un equipo sale aquí, el arreglo anterior no aguantó.
```dataview
TABLE WITHOUT ID
  equipo_serial AS "Equipo",
  length(rows) AS "Revisiones con falla",
  sum(rows.falla) AS "Fallas en total",
  max(rows.fecha) AS "Última"
FROM "04-Diagnosticos"
WHERE falla > 0 AND equipo_serial != ""
GROUP BY equipo_serial
WHERE length(rows) > 1
SORT length(rows) DESC
```

## Por salón
Dónde están las máquinas, no de qué grupo es el estudiante.
```dataview
TABLE WITHOUT ID
  salon AS "Salón",
  length(rows) AS "Revisiones",
  length(filter(rows, (r) => r.veredicto = "no")) AS "No aptas",
  sum(rows.falla) AS "Fallas halladas",
  max(rows.fecha) AS "Última"
FROM "04-Diagnosticos"
WHERE estado = "entregado"
GROUP BY salon
SORT length(rows) DESC
```

## Producción por estudiante
```dataview
TABLE WITHOUT ID
  estudiante AS "Estudiante",
  length(rows) AS "Hojas",
  length(filter(rows, (r) => r.completa = false)) AS "Sin culminar",
  sum(rows.falla) AS "Fallas halladas",
  sum(rows.obs) AS "Observaciones",
  max(rows.fecha) AS "Última"
FROM "04-Diagnosticos"
WHERE estado = "entregado"
GROUP BY estudiante
SORT length(rows) DESC
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

## Borradores sin entregar
```dataview
TABLE WITHOUT ID
  file.link AS "Hoja", estudiante AS "Técnico", fecha AS "Empezada"
FROM "04-Diagnosticos"
WHERE estado = "borrador"
SORT fecha ASC
```

## Inventario acumulado
No se teclea: cada serial que un estudiante escribe en una hoja crea su nota aquí.
```dataview
TABLE WITHOUT ID
  file.link AS "Equipo", serial AS "Serial", inventario AS "Inventario",
  ubicacion AS "Salón", tipo_equipo AS "Tipo"
FROM "02-Equipos"
SORT ubicacion ASC, serial ASC
```
