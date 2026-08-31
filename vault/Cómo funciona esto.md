---
tipo: referencia
---
# Cómo funciona esto

Tres piezas separadas, cada una haciendo lo que sabe hacer.

## 1. La app web — donde trabajan los estudiantes
Una página que abren del teléfono o de la computadora. Entran con **usuario y contraseña**, llenan la hoja de cotejo, y entregan. Cada estudiante ve solo sus hojas.

## 2. Supabase — donde vive el dato
Postgres con *Row Level Security*: la regla de "cada quien ve lo suyo" la aplica la base de datos, no la app. Aunque un estudiante manipule el navegador, el servidor no le entrega hojas ajenas. El instructor sí ve todo, porque su perfil tiene `rol = instructor`.

Tablas: `perfiles`, `equipos`, `diagnosticos`, `puntos`.

## 3. Este vault — donde se acumula el conocimiento
Un script baja lo entregado y escribe una nota por diagnóstico en `04-Diagnosticos`, con frontmatter que Dataview puede consultar. Las notas de `02-Equipos` y `03-Estudiantes` se crean una vez y **no se sobreescriben**: ahí puedes añadir tus propias notas y sobreviven a la próxima sincronización.

```bash
cd bitacora-taller
node sync/sync.mjs          # baja y escribe
node sync/sync.mjs --dry    # muestra qué haría, sin escribir
```

> [!warning] No edites `04-Diagnosticos` a mano
> Esas notas son un espejo de la base de datos y se reescriben en cada sincronización. Si quieres anotar algo sobre un diagnóstico, hazlo en la nota del equipo o del estudiante.

## Plugins que necesita este vault
- **Dataview** (comunidad) — las tablas de [[Inicio]] no funcionan sin él
- **Templater** (comunidad, opcional) — para las plantillas de `01-Plantillas`
