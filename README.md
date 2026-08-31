# Bitácora de Diagnóstico — Taller de Tecnología

Tres piezas que hacen una sola cosa: que lo que los estudiantes diagnostican todos los
días se acumule en un lugar consultable.

```
app/       Lo que abren los estudiantes del teléfono. HTML plano + Supabase.
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

La llave `anon` que va en `app/config.js` **no es un secreto** — está diseñada para
vivir en el navegador. Lo que protege los datos es RLS. La que sí es secreta es
`service_role`, que solo vive en tu `.env` local.

## Puesta en marcha

### 1. Base de datos
Crea el proyecto en Supabase y corre `supabase/migrations/0001_esquema.sql`
(SQL Editor del panel, o `supabase db push` si usas el CLI).

### 2. Apagar la confirmación por correo
Los estudiantes entran con usuario, no con correo: la app arma `usuario@taller.local`
por detrás. Ese dominio no existe, así que **hay que apagar la confirmación**:

> Authentication → Sign In / Providers → Email → **Confirm email: off**

Sin esto, cada cuenta nueva queda esperando un correo que nunca llega.

### 3. Configurar la app
En `app/config.js` pon la URL del proyecto y la llave `anon` (Project Settings → API).

### 4. Nombrarte instructor
Después de crear tu propia cuenta desde la app, en el SQL Editor:

```sql
update public.perfiles set rol = 'instructor' where usuario = 'tu_usuario';
```

### 5. Publicar para los estudiantes
```bash
gh auth login
gh repo create bitacora-taller --public --source=. --push
gh api -X POST repos/:owner/bitacora-taller/pages -f build_type=legacy \
  -f 'source[branch]=main' -f 'source[path]=/docs'
```
GitHub Pages sirve desde `/docs` o desde la raíz; lo más simple es publicar la
carpeta `app/` renombrada a `docs/`, o activar Pages desde la pestaña Settings del
repo apuntando a `main /docs`.

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
- **No sincroniza de vuelta.** El vault es de solo lectura respecto a la base de
  datos: lo que edites en `04-Diagnosticos` se pierde en la próxima corrida. Tus
  notas van en `02-Equipos` y `03-Estudiantes`, que el script nunca sobreescribe.

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
correo a esa dirección. Si cambias `DOMINIO_LOGIN` en `app/config.js`, prueba
antes que Supabase acepte el dominio nuevo, o los estudiantes no podrán
registrarse.
