# Pruebas

Comprueban lo único que este proyecto promete y no se puede ver leyendo el
código: que el trabajo de un estudiante no se pierde cuando el taller se
queda sin señal.

```bash
node pruebas/correr.mjs
```

Hace falta `chromium` en el PATH y nada más: ni `npm install` ni conexión a
Supabase. El corredor levanta un servidor que sirve `docs/` igual que lo hace
GitHub Pages, abre Chromium por su protocolo de depuración y le corta la red
desde fuera.

Tres cosas se prueban por separado:

- **`prueba.mjs`** — la lógica de `docs/local.js` contra un Supabase de
  mentira: que lo guardado sin señal sobreviva, que suba en el orden correcto
  (el equipo antes que el diagnóstico, porque este necesita el id de aquel),
  que lo bajado del servidor no pise lo que aquí todavía no ha subido, y que
  a Supabase no le lleguen los campos internos.
- **El casco de la app** — que el service worker guarde copia de todo y que
  la app abra con la red cortada de verdad.
- **El wifi de la escuela** — conectado y sin salida a internet, que es el
  caso que `navigator.onLine` no sabe distinguir. La app tiene que abrirle su
  bitácora al estudiante en vez de mandarlo a la pantalla de entrar.

Lo que estas pruebas **no** cubren: que Supabase acepte lo que se le manda.
Eso depende de las políticas de RLS del proyecto y solo se comprueba contra
el proyecto de verdad, con una cuenta de estudiante.
