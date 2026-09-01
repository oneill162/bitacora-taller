---
tipo: referencia
---
# Cómo funciona esto

Tres piezas separadas, cada una haciendo lo que sabe hacer.

## 1. La app web — donde trabajan los estudiantes

Una página que abren del teléfono. Entran con **usuario y contraseña**, llenan la hoja de cotejo, y entregan. Cada estudiante ve solo lo suyo, y eso lo garantiza la base de datos, no la app.

**Entran por un código QR.** En el panel del instructor, *Código para entrar* arma un cartel con el QR para pegar en la plataforma del curso o proyectarlo en clase. El enlace lleva dentro el código de clase, así que el estudiante escanea y le sale la pantalla de crear cuenta con el código ya puesto: solo pone su nombre, grupo y contraseña. Eso lo hace **una sola vez**; después entra con usuario y contraseña.

**Funciona sin señal.** El taller no tiene wifi, así que la app no guarda en Supabase: guarda en el propio teléfono y de ahí sube cuando hay conexión. Escribir en el teléfono no depende de la red, de modo que guardar nunca falla. En la barra de arriba aparece lo que queda por subir; cuando vuelve la señal se sube solo. Un diagnóstico empezado entero sin internet sube completo después.

> [!warning] Lo que sí necesita internet
> Crear la cuenta y el primer acceso. Y para el instructor, todo lo del taller completo: el trabajo de los demás nunca se guarda en su equipo, porque no es suyo.

## 2. Supabase — donde vive el dato

Postgres con *Row Level Security*: la regla de "cada quien ve lo suyo" la aplica la base de datos, no la app. Aunque un estudiante manipule el navegador, el servidor no le entrega hojas ajenas. El instructor sí ve todo, porque su perfil tiene `rol = instructor`.

Tablas: `perfiles`, `equipos`, `diagnosticos`, `puntos`, `ajustes`.

## 3. Este vault — donde se acumula el conocimiento

Un script baja lo entregado y escribe una nota por diagnóstico en `04-Diagnosticos`, con frontmatter que Dataview puede consultar. Las notas de `02-Equipos` y `03-Estudiantes` se crean una vez y **no se sobreescriben**: ahí puedes añadir tus propias notas y sobreviven a la próxima sincronización.

```bash
cd bitacora-taller
node sync/sync.mjs          # baja y escribe
node sync/sync.mjs --dry    # muestra qué haría, sin escribir
node sync/sync.mjs --limpiar # además borra notas de diagnósticos que ya no existen
```

> [!warning] No edites `04-Diagnosticos` a mano
> Esas notas son un espejo de la base de datos y se reescriben en cada sincronización. Si quieres anotar algo sobre un diagnóstico, hazlo en la nota del equipo o del estudiante.

## Qué mirar en la app y qué mirar aquí

Las dos cosas enseñan el mismo trabajo, pero contestan preguntas distintas y no conviene mezclarlas.

| | La app | Este vault |
|---|---|---|
| **Cuándo** | durante la clase, del teléfono | después, sentado |
| **Contesta** | quién está trabajando ahora mismo, quién no ha empezado, quién lleva rato atascado | qué ha pasado con este equipo desde el principio, cómo va el semestre |
| **Fuerte en** | el día de hoy, el inventario al vuelo, cazar duplicados | historial largo, tus propias notas, enlazar ideas |
| **Se actualiza** | sola, cada 30 segundos | cuando corres `sync.mjs` |

Lo que **solo** está en la app: el tablero del día, unificar duplicados y el cartel del QR.
Lo que **solo** está aquí: tus notas de instructor, el manual del protocolo y todo lo que enlaces a mano.

## Plugins que necesita este vault

- **Dataview** (comunidad) — las tablas de [[Inicio]] no funcionan sin él
- **Templater** (comunidad, opcional) — para las plantillas de `01-Plantillas`
