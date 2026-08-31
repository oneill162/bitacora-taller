# Bitácora de Diagnóstico — Taller de Tecnología

Tres piezas que hacen una sola cosa: que lo que los estudiantes diagnostican todos los
días se acumule en un lugar consultable.

```
docs/      Lo que abren los estudiantes del teléfono. HTML plano + Supabase.
           Se llama docs/ porque es la carpeta que GitHub Pages publica.
supabase/  El esquema de la base de datos, con Row Level Security.
sync/      Baja lo entregado y lo escribe como notas en el vault.
vault/     El vault de Obsidian: manual, plantillas y todo lo acumulado.
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
abra cuentas. Empieza en `TALLER-2026`. Cámbialo cada semestre:

```sql
update public.ajustes set valor = 'TU-CODIGO-NUEVO' where clave = 'codigo_registro';
```

El estudiante lo escribe **una sola vez**, al crear la cuenta. Para entrar después
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

## Lo que este sistema NO hace

- **No funciona sin internet.** La app guarda directo en Supabase; si se cae la
  conexión, el estudiante ve "Sin guardar" y tiene que reintentar. Para el taller
  sin señal está la plantilla en papel de `01-Plantillas`.
- **No recupera contraseñas solo.** Como no hay correo real, si un estudiante
  olvida la suya se la reinicias desde Authentication → Users en el panel.
- **No comprueba contraseñas filtradas.** Supabase puede validar contra
  HaveIBeenPwned; está apagado. Se enciende en Authentication → Policies si
  quieres que los estudiantes no usen contraseñas conocidas.
- **No sincroniza de vuelta.** El vault es de solo lectura respecto a la base de
  datos: lo que edites en `04-Diagnosticos` se pierde en la próxima corrida. Tus
  notas van en `02-Equipos` y `03-Estudiantes`, que el script nunca sobreescribe.

## El repositorio es público, los datos no

El repo lleva el código, el manual y las plantillas. **No lleva datos de
estudiantes.** `.gitignore` excluye `vault/02-Equipos`, `vault/03-Estudiantes` y
`vault/04-Diagnosticos`, que son justo las carpetas que `sync.mjs` llena con
nombres, grupos y el trabajo de cada quien. Si alguna vez las necesitas fuera de
tu máquina, van a un repo privado aparte, nunca a este.

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
