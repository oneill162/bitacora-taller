-- =====================================================================
-- Bitácora de Diagnóstico — esquema base
-- Taller de tecnología · diagnósticos diarios de equipos
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- perfiles: un renglón por estudiante o instructor, atado a auth.users
-- ---------------------------------------------------------------------
create table public.perfiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  usuario   text not null unique check (usuario ~ '^[a-z0-9._-]{3,32}$'),
  nombre    text not null default '',
  grupo     text not null default '',
  escuela   text not null default '',
  rol       text not null default 'estudiante' check (rol in ('estudiante','instructor')),
  creado_en timestamptz not null default now()
);

comment on table public.perfiles is 'Estudiantes e instructores del taller. El usuario es el nombre corto de acceso.';

-- ---------------------------------------------------------------------
-- equipos: inventario compartido, identificado por serial
-- ---------------------------------------------------------------------
create table public.equipos (
  id          uuid primary key default gen_random_uuid(),
  serial      text not null unique,
  marca       text not null default '',
  modelo      text not null default '',
  tipo        text not null default '',
  inventario  text not null default '',
  ubicacion   text not null default '',
  creado_por  uuid references public.perfiles(id) on delete set null,
  creado_en   timestamptz not null default now()
);

comment on table public.equipos is 'Inventario compartido. Todos leen y añaden; solo instructores borran.';

-- ---------------------------------------------------------------------
-- diagnosticos: una sesión de trabajo de un estudiante sobre un equipo
-- ---------------------------------------------------------------------
create table public.diagnosticos (
  id             uuid primary key default gen_random_uuid(),
  autor_id       uuid not null references public.perfiles(id) on delete cascade,
  equipo_id      uuid references public.equipos(id) on delete set null,
  orden          text not null default '',
  fecha          date not null default current_date,
  usuario_equipo text not null default '',
  sistema        text not null default '',
  estado         text not null default 'borrador' check (estado in ('borrador','entregado')),
  veredicto      text not null default '' check (veredicto in ('','apto','obs','no')),
  conteo         jsonb not null default '{}'::jsonb,
  acciones       text not null default '',
  hallazgos      text not null default '',
  proximo_paso   text not null default '',
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  entregado_en   timestamptz
);

comment on column public.diagnosticos.conteo is 'Resumen {ok,obs,falla,na,sin} calculado por la app al guardar.';

create index diagnosticos_autor_idx  on public.diagnosticos (autor_id, fecha desc);
create index diagnosticos_equipo_idx on public.diagnosticos (equipo_id);
create index diagnosticos_estado_idx on public.diagnosticos (estado, fecha desc);

-- ---------------------------------------------------------------------
-- puntos: los renglones de la hoja de cotejo
-- ---------------------------------------------------------------------
create table public.puntos (
  id             uuid primary key default gen_random_uuid(),
  diagnostico_id uuid not null references public.diagnosticos(id) on delete cascade,
  clave          text not null,
  grupo          text not null default '',
  titulo         text not null default '',
  estado         text not null default '' check (estado in ('','ok','obs','falla','na')),
  nota           text not null default '',
  unique (diagnostico_id, clave)
);

create index puntos_diag_idx on public.puntos (diagnostico_id);

-- =====================================================================
-- Funciones auxiliares
-- =====================================================================

-- security definer: lee perfiles saltando RLS para no crear recursión
create or replace function public.es_instructor()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and p.rol = 'instructor'
  );
$$;

-- permite a la app avisar "ese usuario ya existe" ANTES de intentar el registro
create or replace function public.usuario_disponible(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (select 1 from public.perfiles p where p.usuario = lower(p_usuario));
$$;

grant execute on function public.usuario_disponible(text) to anon, authenticated;

-- crea el perfil automáticamente cuando nace el usuario de auth
create or replace function public.manejar_usuario_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfiles (id, usuario, nombre, grupo, escuela)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1))),
    coalesce(new.raw_user_meta_data->>'nombre',  ''),
    coalesce(new.raw_user_meta_data->>'grupo',   ''),
    coalesce(new.raw_user_meta_data->>'escuela', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.manejar_usuario_nuevo();

-- marca de tiempo de última edición
create or replace function public.tocar_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

create trigger al_actualizar_diagnostico
  before update on public.diagnosticos
  for each row execute function public.tocar_actualizado();

-- =====================================================================
-- Row Level Security: cada estudiante ve solo lo suyo
-- =====================================================================

alter table public.perfiles     enable row level security;
alter table public.equipos      enable row level security;
alter table public.diagnosticos enable row level security;
alter table public.puntos       enable row level security;

-- ---------- perfiles ----------
create policy perfiles_leer on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.es_instructor());

create policy perfiles_crear on public.perfiles
  for insert to authenticated
  with check (id = auth.uid());

create policy perfiles_editar on public.perfiles
  for update to authenticated
  using (id = auth.uid() or public.es_instructor())
  with check (id = auth.uid() or public.es_instructor());

-- ---------- equipos: inventario compartido ----------
create policy equipos_leer on public.equipos
  for select to authenticated using (true);

create policy equipos_crear on public.equipos
  for insert to authenticated with check (auth.uid() is not null);

create policy equipos_editar on public.equipos
  for update to authenticated
  using (auth.uid() is not null) with check (auth.uid() is not null);

create policy equipos_borrar on public.equipos
  for delete to authenticated using (public.es_instructor());

-- ---------- diagnosticos ----------
create policy diag_leer on public.diagnosticos
  for select to authenticated
  using (autor_id = auth.uid() or public.es_instructor());

create policy diag_crear on public.diagnosticos
  for insert to authenticated
  with check (autor_id = auth.uid());

create policy diag_editar on public.diagnosticos
  for update to authenticated
  using (autor_id = auth.uid() or public.es_instructor())
  with check (autor_id = auth.uid() or public.es_instructor());

create policy diag_borrar on public.diagnosticos
  for delete to authenticated
  using (autor_id = auth.uid() and estado = 'borrador');

-- ---------- puntos: heredan del diagnóstico ----------
create policy puntos_leer on public.puntos
  for select to authenticated
  using (exists (
    select 1 from public.diagnosticos d
    where d.id = puntos.diagnostico_id
      and (d.autor_id = auth.uid() or public.es_instructor())
  ));

create policy puntos_crear on public.puntos
  for insert to authenticated
  with check (exists (
    select 1 from public.diagnosticos d
    where d.id = puntos.diagnostico_id and d.autor_id = auth.uid()
  ));

create policy puntos_editar on public.puntos
  for update to authenticated
  using (exists (
    select 1 from public.diagnosticos d
    where d.id = puntos.diagnostico_id
      and (d.autor_id = auth.uid() or public.es_instructor())
  ))
  with check (exists (
    select 1 from public.diagnosticos d
    where d.id = puntos.diagnostico_id
      and (d.autor_id = auth.uid() or public.es_instructor())
  ));

create policy puntos_borrar on public.puntos
  for delete to authenticated
  using (exists (
    select 1 from public.diagnosticos d
    where d.id = puntos.diagnostico_id and d.autor_id = auth.uid()
  ));

-- =====================================================================
-- Vista de exportación hacia el vault de Obsidian
-- security_invoker: respeta RLS de quien consulta
-- =====================================================================
create view public.vista_diagnosticos
with (security_invoker = true) as
select
  d.id, d.orden, d.fecha, d.estado, d.veredicto, d.conteo,
  d.acciones, d.hallazgos, d.proximo_paso, d.usuario_equipo, d.sistema,
  d.creado_en, d.actualizado_en, d.entregado_en,
  p.usuario   as autor_usuario,
  p.nombre    as autor_nombre,
  p.grupo     as autor_grupo,
  p.escuela   as autor_escuela,
  e.serial    as equipo_serial,
  e.marca     as equipo_marca,
  e.modelo    as equipo_modelo,
  e.tipo      as equipo_tipo,
  e.inventario as equipo_inventario,
  e.ubicacion as equipo_ubicacion
from public.diagnosticos d
join public.perfiles p on p.id = d.autor_id
left join public.equipos e on e.id = d.equipo_id;

-- =====================================================================
-- Permisos de tabla. RLS es quien decide QUÉ renglones; estos GRANT
-- deciden si el rol puede tocar la tabla del todo.
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.perfiles, public.equipos, public.diagnosticos, public.puntos
  to authenticated;
grant select on public.vista_diagnosticos to authenticated;
grant execute on function public.es_instructor() to authenticated;

-- El sincronizador a Obsidian corre con service_role, que salta RLS.
grant select, insert, update, delete on
  public.perfiles, public.equipos, public.diagnosticos, public.puntos
  to service_role;
grant select on public.vista_diagnosticos to service_role;
