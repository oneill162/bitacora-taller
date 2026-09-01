# Bitácora de Diagnóstico — Taller de Tecnología

- **App para estudiantes:** https://oneill162.github.io/bitacora-taller/
- **Proyecto Supabase:** `glwinbslxgurmzyvttyo` (us-east-2)
- **Código de clase:** `2108` (fijo: es el número del grupo)

Tres piezas que hacen una sola cosa: que lo que los estudiantes diagnostican todos los
días se acumule en un lugar consultable.

```
docs/      Lo que abren estudiantes e instructor del teléfono. HTML plano + Supabase.
           Se llama docs/ porque es la carpeta que GitHub Pages publica.
supabase/  El esquema de la base de datos, con Row Level Security.
sync/      Baja lo entregado y lo escribe como notas en el vault.
vault/     El vault de Obsidian: manual, plantillas y todo lo acumulado.
pruebas/   Comprueban que el trabajo no se pierde sin señal. Ver pruebas/LÉEME.md.
```

## Cómo se separa el trabajo de cada estudiante

No por convención, sino por Postgres. Cada tabla tiene *Row Level Security* y la
política dice `autor_id = auth.uid()`. Aunque un estudiante abra la consola del
navegador y pida todas las hojas, el servidor le devuelve solo las suyas. El
instructor ve todo porque su perfil tiene `rol = 'instructor'`, y esa comprobación
también la hace la base de datos.

La llave `anon` que va en `docs/config.js` **no es un secreto** — está diseñada para
vivir en el navegador. Lo que protege los datos es RLS. La que sí es secreta es
`service_role`, que solo vive en tu `.env` local.

## Puesta en marcha

### 1. Base de datos
Crea el proyecto en Supabase y corre `supabase/migrations/0001_esquema.sql`
(SQL Editor del panel, o `supabase db push` si usas el CLI).

### 2. Desplegar la Edge Function del registro
```bash
supabase functions deploy registro --no-verify-jwt
```
(o desde el panel). **No hace falta tocar la configuración de Auth.**

El registro no pasa por `auth.signUp`, y esa es una decisión deliberada. Los
estudiantes entran con usuario, no con correo: la app arma `usuario@taller.local`
por detrás, un dominio que no existe. `auth.signUp` intentaría enviarle un correo
de confirmación a esa dirección, y además el plan gratuito solo permite ~2 correos
por hora — con 30 estudiantes registrándose el mismo día, el tercero se queda fuera.

La Edge Function `registro` crea la cuenta ya confirmada con la API de
administración, que no envía ningún correo y no tiene ese límite. Corre con
`verify_jwt = false` porque el estudiante todavía no tiene sesión; su autenticación
propia es el **código de clase**.

### 2b. El código de clase
Como el endpoint de registro es público, hace falta un código para que no cualquiera
abra cuentas. Es **`2108`**, el número del grupo, y no cambia por semestre. Vive en la
tabla `ajustes`, no en el código de la app, por si alguna vez hay que moverlo:

```sql
update public.ajustes set valor = 'TU-CODIGO-NUEVO' where clave = 'codigo_registro';
```

El estudiante lo escribe **a mano una sola vez**, al crear la cuenta. Nada se lo
llena solo: el campo es obligatorio en el formulario de *Crear cuenta*. Para entrar después
solo necesita usuario y contraseña. Solo el instructor puede leer o cambiar el
código; un estudiante que consulte la tabla `ajustes` recibe cero filas.

### 3. Configurar la app
En `docs/config.js` pon la URL del proyecto y la llave `anon` (Project Settings → API).

### 4. Nombrarte instructor
Después de crear tu propia cuenta desde la app, en el SQL Editor:

```sql
update public.perfiles set rol = 'instructor' where usuario = 'tu_usuario';
```

### 5. Publicar para los estudiantes
```bash
gh auth login
gh repo create bitacora-taller --public --source=. --push
gh api -X POST repos/:owner/bitacora-taller/pages \
  -f 'source[branch]=main' -f 'source[path]=/docs'
```
GitHub Pages sirve la carpeta `docs/` tal cual, sin build ni Actions. Cada `git
push` a `main` actualiza el sitio en un par de minutos.

Los estudiantes abren la dirección y le dan a *Añadir a la pantalla de inicio*:
el `manifest.json` la instala como app con su propio ícono.

### 6. Sincronizar al vault
```bash
cp .env.ejemplo .env      # y llénalo con la llave service_role
node sync/sync.mjs --dry  # ver qué haría
node sync/sync.mjs        # escribir
```

Abre `vault/` como vault en Obsidian e instala **Dataview** (las tablas de
`Inicio.md` no funcionan sin él).

El vault es la vista larga: historial de cada equipo, cómo va el semestre y
tus propias notas. Lo del día —quién está trabajando ahora, quién no ha
empezado— está en la app, que se actualiza sola. Las notas de diagnóstico
llevan `salon`, `completa` y `falta` en el frontmatter, así que Dataview puede
agrupar por salón y listar lo que quedó a medias con la misma regla que usa la
app: `faltantes()` está compartido entre las dos, no copiado.

## Lo que este sistema NO hace

- **No deja entrar por primera vez sin internet.** Crear la cuenta y el primer
  acceso necesitan conexión, y ver el trabajo de los demás también. Todo lo
  demás sí funciona sin señal — ver la sección siguiente.
- **No recupera contraseñas solo.** Como no hay correo real, si un estudiante
  olvida la suya se la reinicias desde Authentication → Users en el panel.
- **No comprueba contraseñas filtradas.** Supabase puede validar contra
  HaveIBeenPwned; está apagado. Se enciende en Authentication → Policies si
  quieres que los estudiantes no usen contraseñas conocidas.
- **No sincroniza de vuelta.** El vault es de solo lectura respecto a la base de
  datos: lo que edites en `04-Diagnosticos` se pierde en la próxima corrida. Tus
  notas van en `02-Equipos` y `03-Estudiantes`, que el script nunca sobreescribe.

## Repartir el acceso: el código QR

En el panel del instructor, **Código para entrar** arma un cartel con un QR
para pegar en la plataforma de los estudiantes o proyectar en clase. Se puede
descargar como PNG o imprimir.

El QR se dibuja en el navegador, no es un archivo guardado en el repo: lleva
siempre la dirección desde donde se abrió la app.

El enlace es `?nuevo=1`: el estudiante escanea y la app le abre directo en
*Crear cuenta*, pero **el código no viaja en el enlace**. Va impreso en el cartel
(`Código de clase: 2108`) para que lo escriba. Así un enlace que se cuele fuera
del salón no sirve para abrir cuentas por sí solo.

## La vista del instructor

El instructor tiene dos botones de más en su panel, porque su perfil tiene
`rol = 'instructor'`. El taller abre en cuatro pestañas:

**El día.** Un renglón por **estudiante**, no por diagnóstico — y esa es toda
la diferencia. La tabla de diagnósticos no puede contestar la pregunta que se
hace en clase, que no es "qué se entregó" sino "quién no ha empezado": el que
no hizo nada no tiene diagnóstico y por tanto no tiene fila. Aquí sí sale, con
la barra vacía. De cada quien se ve cuánto lleva del protocolo, si entregó y
con qué veredicto, y cuánto hace que no toca la hoja — que es lo que distingue
al que va lento del que se atascó. Se filtra por grupo, se puede mirar otro
día, y se refresca solo cada 30 segundos para poder dejarlo puesto mientras se
camina por el taller.

Un estudiante con más de una hoja el mismo día no se resume en un solo
número: la fila pasa a ser encabezado y sus hojas se listan debajo. Enseñar la
última tocada escondería que ya entregó otra.

**Informes.** Cuatro cortes de lo mismo:

- *Por estudiante*, con una **gráfica de barras del trabajo acumulado**,
  ordenada de más a menos, que es la pregunta de "quién cumple y con quién hay
  que sentarse". Cada barra separa lo entregado de lo que sigue a medias: seis
  hojas todas sin entregar no es lo mismo que seis entregadas, y esa es
  justamente la diferencia que decide si hay una conversación pendiente. Los
  colores están comprobados para daltonismo y para los dos temas, y como el
  verde no llega al contraste mínimo sobre fondo claro, cada barra lleva su
  cifra escrita y la tabla de abajo repite todos los valores: la información
  nunca depende solo del color.
- *Por grupo*, con cuántos de cuántos han trabajado.
- *Por salón*, por dónde está la máquina, con el veredicto de su última
  revisión entregada.
- *Todas las hojas*, la tabla de siempre para buscar por serial o mirar otras
  fechas.

**Inventario.** No se teclea aparte: se llena solo con cada serial que un
estudiante escribe en una hoja. Sale con marca, modelo, número de inventario,
salón, cuántas revisiones lleva y cómo salió la última. Se descarga en CSV
(con BOM, para que Excel abra bien los acentos).

**Revisar.** Lo que pide una decisión tuya:

- Hojas **entregadas sin culminar**, con la lista de qué les falta.
- La misma máquina con el **serial escrito distinto** (`ABC1234`, `abc-1234`,
  `ABC 1234`), que se pueden **unificar** en una sola.
- El **mismo equipo revisado dos veces el mismo día**, normalmente por dos
  estudiantes que no sabían el uno del otro.
- **Números de inventario repetidos** en máquinas distintas.
- **Estudiantes con más de una cuenta**, cuyo trabajo se puede pasar todo a una.

Tocar cualquier renglón abre la hoja del estudiante **de solo lectura**. Esto
importa más de lo que parece: RLS le deja al instructor *editar* las hojas de
sus estudiantes, no solo leerlas, y el editor tiene autoguardado. Si abrir
para mirar llevara al editor, un toque podría pisarle el trabajo a alguien que
lo está escribiendo en ese momento. Por eso se abre siempre el reporte, sin
botón de reabrir, y la firma sigue siendo la del estudiante y no la de quien
mira.

El tablero y los informes necesitan conexión: el trabajo de los demás nunca se
guarda en el equipo del instructor, porque no es suyo.

### Datos incompletos

Una hoja a la que le falte el serial, la marca o el modelo, el sistema
operativo, los hallazgos, el número de orden o puntos por evaluar sale marcada
**"falta culminar"** en tres sitios: en la propia hoja del estudiante, en su
panel y en el tablero del docente, siempre diciendo qué es lo que falta.

**No se bloquea nada.** Fue una decisión deliberada: bloquear el guardado
perdería trabajo en el taller sin señal, que es justo lo que el guardado local
existe para evitar, y bloquear la entrega dejaría al estudiante sin poder
cerrar una hoja de un equipo que, por ejemplo, no tiene etiqueta legible. Se
marca y decide el docente.

### Unificar duplicados

Unificar **borra filas y no se deshace**, así que nunca pasa solo: se pregunta
antes, diciendo qué se queda, qué desaparece y cuántas hojas se mueven.

Al unificar equipos se queda el que tiene más historial —así se mueven las
menos hojas posibles—; a igualdad, el registro más completo, porque borrar el
que tiene número de inventario perdería ese dato; y a igualdad de eso, el
serial escrito en limpio. Las hojas se mueven **antes** de borrar los equipos:
al revés, la clave foránea las dejaría sueltas.

Al unificar estudiantes el trabajo pasa a una sola cuenta, pero la cuenta
vacía **no se borra desde la app**: eso necesita permisos de administración
que el navegador no tiene ni debe tener. La app te dice cuál borrar desde
Authentication → Users en el panel de Supabase.

## El taller sin señal

El sótano donde están los equipos no tiene wifi. Por eso la app **no guarda en
Supabase: guarda en el teléfono del estudiante y de ahí sube.** Escribir en el
teléfono no depende de la red, así que guardar nunca falla; lo único que puede
fallar es la subida, y esa se reintenta sola.

En la barra de arriba aparece lo que falta: *"Sin conexión · 3 por subir"*.
Cuando vuelve la señal se suben solas y el aviso desaparece. Un diagnóstico
empezado sin internet sube completo, con su equipo y sus 40 puntos, porque la
hoja nace con su identificador ya puesto en el teléfono y no lo tiene que
inventar Supabase.

La app **abre** sin señal porque un service worker (`docs/sw.js`) guarda copia
de todo lo que necesita. Por eso `supabase-js` vive en `docs/vendor/` y no en
un CDN: en un sótano sin wifi no se puede depender de que se baje una
librería. Al publicar cambios en `docs/`, sube `VERSION` en `sw.js` — es lo
que hace que los teléfonos suelten la copia vieja.

Dos cosas que hubo que resolver y no son obvias:

- **`navigator.onLine` miente.** Con el wifi del plantel conectado y sin salida
  a internet dice que sí hay conexión. La app comprueba aparte si Supabase de
  verdad contesta, y si no, le abre al estudiante su bitácora guardada en vez
  de mandarlo a la pantalla de entrar.
- **Una consulta a Supabase puede colgarse para siempre** en esa misma
  situación: la librería reintenta por dentro y no se rinde. Todas las
  llamadas llevan un corte de 10 segundos. Sin él la app se quedaba en
  "Cargando la bitácora…" hasta que el estudiante la cerrara.

Al salir se borra lo guardado en el teléfono, porque los equipos del taller se
comparten y el trabajo de uno no puede quedar en la sesión del que sigue. Si
queda algo sin subir, la app avisa antes de borrarlo.

```bash
node pruebas/correr.mjs   # cortando la red de verdad, con Chromium
```

## El repositorio es público, los datos no

El repo lleva el código, el manual y las plantillas. **No lleva datos de
estudiantes.** `.gitignore` excluye `vault/02-Equipos`, `vault/03-Estudiantes` y
`vault/04-Diagnosticos`, que son justo las carpetas que `sync.mjs` llena con
nombres, grupos y el trabajo de cada quien. Si alguna vez las necesitas fuera de
tu máquina, van a un repo privado aparte, nunca a este.

Lo que sí lleva, además del código, es `docs/vendor/supabase.js`: la librería
de Supabase copiada tal cual del CDN (versión 2.112.4) para que la app pueda
abrir sin internet. No es código de este proyecto y no hay que editarlo.

La llave que sí está en el repo (`sb_publishable_...`) está diseñada para vivir en
el navegador de cualquiera. La que nunca puede estar es `service_role`, que vive
solo en tu `.env` local y que `.gitignore` bloquea.

## Datos de estudiantes

El sistema pide usuario, nombre, grupo y escuela — nada más. No pide correo,
teléfono ni dirección, y no envía correo a nadie. Si tu plantel tiene política de
manejo de datos de menores, esto es lo que hay que declarar: nombre y grupo,
guardados en Supabase (región us-east-2), borrables con
`delete from auth.users where id = '...'`, que arrastra el perfil y sus hojas.

## Por qué el dominio es `taller.local`

Supabase valida el dominio del correo antes de crear la cuenta. Rechaza
`example.com` y también `taller.pr` (probado). `taller.local` pasa la validación
y no existe como dominio real, que es justo lo que queremos: nunca se envía un
correo a esa dirección. Si cambias `DOMINIO_LOGIN` en `docs/config.js`, prueba
antes que Supabase acepte el dominio nuevo, o los estudiantes no podrán
registrarse.

## Lo que encontraron las pruebas

Antes de darlo por bueno probé el aislamiento con dos cuentas reales, y apareció
un hueco de verdad: la política `perfiles_editar` permitía que un estudiante
editara su propio perfil, pero no restringía **qué columnas**. Un
`PATCH {"rol":"instructor"}` sobre uno mismo funcionaba, y con eso el estudiante
leía el trabajo de toda la clase y el código de registro.

Lo cierra la migración `0004_proteger_perfil.sql`: un trigger que revierte `rol` y
`usuario` a su valor anterior salvo que quien edite sea instructor o una conexión
de servidor sin JWT. Verificado después del arreglo:

| Intento de mcolon | Resultado |
|---|---|
| Leer todos los diagnósticos | `[]` |
| Leer el diagnóstico de lrivera por id exacto | `[]` |
| Editar el diagnóstico de lrivera | `[]`, sin cambios |
| Crear un diagnóstico a nombre de lrivera | error 42501, RLS |
| Ascenderse a instructor | rol sigue en `estudiante` |
| Robar el usuario de otro | usuario sigue en `mcolon` |
| Leer el código de clase | `[]` |
| Cambiar su propio nombre | funciona, como debe |
