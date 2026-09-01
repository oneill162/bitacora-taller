# Pruebas

Comprueban lo único que este proyecto promete y no se puede ver leyendo el
código: que el trabajo de un estudiante no se pierde cuando el taller se
queda sin señal.

```bash
node pruebas/correr.mjs        # la app: guardado sin señal, tablero, informes
node pruebas/correr-sync.mjs   # el sincronizador al vault de Obsidian
```

Hace falta `chromium` en el PATH para la primera y nada más: ni `npm install`
ni conexión a Supabase. El corredor levanta un servidor que sirve `docs/` igual que lo hace
GitHub Pages, abre Chromium por su protocolo de depuración y le corta la red
desde fuera.

Tres cosas se prueban por separado:

- **`prueba.mjs`** — la lógica de `docs/local.js` contra un Supabase de
  mentira: que lo guardado sin señal sobreviva, que suba en el orden correcto
  (el equipo antes que el diagnóstico, porque este necesita el id de aquel),
  que lo bajado del servidor no pise lo que aquí todavía no ha subido, y que
  a Supabase no le lleguen los campos internos. También `docs/taller.js`, que
  arma el tablero del instructor: que el que no empezó tenga fila igual, que
  las hojas se cuelguen del estudiante correcto, que el resumen cuente
  estudiantes y no hojas, y que el orden no baile cuando se refresca solo.
  Y `docs/informes.js`: las sumas de cada informe, el inventario, qué le falta
  a una hoja y los cuatro tipos de duplicado.
- **El casco de la app** — que el service worker guarde copia de todo y que
  la app abra con la red cortada de verdad.
- **El wifi de la escuela** — conectado y sin salida a internet, que es el
  caso que `navigator.onLine` no sabe distinguir. La app tiene que abrirle su
  bitácora al estudiante en vez de mandarlo a la pantalla de entrar.

## El sincronizador (`correr-sync.mjs`)

Corre `sync/sync.mjs` entero contra un Supabase de mentira y mira las notas que
escribe: que lleven el salón y el tipo de equipo, que marquen si la hoja quedó
a medias **con la misma regla que usa la app** —`faltantes()` está compartido,
no copiado—, que `--dry` no escriba nada, y sobre todo que una segunda corrida
**no pise lo que el instructor haya escrito** en las notas de equipo y
estudiante.

Copia `sync/` y `docs/` a una carpeta temporal para poner ahí el `.env`, porque
`sync.mjs` lo lee de la raíz del proyecto. Así no hay manera de que la prueba
deje un `.env` falso al lado del de verdad; de hecho lo comprueba al terminar.

## Lo que estas pruebas no cubren

Que Supabase acepte lo que se le manda. Eso depende de las políticas de RLS
del proyecto y no se puede comprobar contra un Supabase de mentira: hace falta
el proyecto de verdad y una cuenta de estudiante.

Comprobado a mano el 1 de septiembre de 2026 contra `glwinbslxgurmzyvttyo`,
con una cuenta de prueba borrada después:

| Camino | Política que ejerce | Resultado |
|---|---|---|
| Crear la cuenta con el código de clase | Edge Function `registro` | entra al panel |
| Subir una hoja creada sin señal | `diag_crear`, con el UUID puesto por el teléfono | sube completa |
| Enlazar el equipo al subir | `equipos_crear` / `equipos_editar` por serial | `equipo_id` correcto |
| Los 3 puntos anotados sin señal | `puntos_crear` | con grupo y título |
| Editar sin señal una hoja que Supabase ya tenía | `diag_editar` (upsert como update) | el cambio sobreescribe |
| Borrar sin señal | `diag_borrar` | la hoja y sus puntos desaparecen |
| El tablero del instructor | `perfiles_leer` para instructores | lista a los 5 estudiantes, con y sin hojas |
| Abrir la hoja de un estudiante | `diag_leer` / `puntos_leer` | de solo lectura, firmada por el estudiante |
| Informes, inventario y duplicados | `perfiles_leer`, `equipos_leer` | los 4 duplicados sembrados, detectados |
| Unificar equipos | `diag_editar` + `equipos_borrar` | 9 equipos → 7, **0 hojas huérfanas**, ninguna hoja perdida |
| Unificar estudiantes | `diag_editar` sobre `autor_id` | el trabajo pasa entero a una cuenta |
| El QR | — | decodificado con `zbarimg`: lleva el enlace y el código correctos |

Las subidas salieron solas, sin tocar nada, en el reintento de la propia app
(~20 s del corte de 30 s), porque desbloquear la red no dispara el evento
`online`. En el caso de verdad —salir del sótano y agarrar wifi— el evento sí
se dispara y sube al momento.

Repetirlo crea datos en el proyecto de producción y hay que borrarlos a mano
después. No hay guion para eso en el repo a propósito.

**Las consultas de Dataview de `vault/Inicio.md`.** Necesitan Obsidian con el
plugin puesto y no hay forma de ejecutarlas desde aquí. Lo que sí está probado
es que el sincronizador escriba los campos que esas consultas piden (`salon`,
`completa`, `falta`). Si alguna tabla sale vacía al abrir el vault, mira
primero si las notas de `04-Diagnosticos` traen esos campos: son nuevos, así
que hace falta una corrida de `sync.mjs` para que aparezcan en las viejas.
