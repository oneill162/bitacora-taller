-- 0007: superusuario, solicitud de instructor, correo de aviso y calificaciones.
--
-- Quién puede qué:
--   superusuario  nombra y quita instructores (solo él toca rol / es_superusuario)
--   instructor    ve todo, edita y borra hojas, califica, gestiona estudiantes
--   estudiante    solo lo suyo; no puede tocar su nota ni su rol

alter table public.perfiles
  add column if not exists es_superusuario     boolean not null default false,
  add column if not exists solicita_instructor boolean not null default false,
  add column if not exists email text not null default ''
    check (email = '' or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

alter table public.diagnosticos
  add column if not exists nota           numeric(5,2) check (nota is null or nota between 0 and 100),
  add column if not exists comentario     text not null default '',
  add column if not exists calificado_por uuid references public.perfiles(id) on delete set null,
  add column if not exists calificado_en  timestamptz;

create or replace function privado.es_superusuario()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.perfiles p where p.id = auth.uid() and p.es_superusuario);
$$;
revoke all on function privado.es_superusuario() from public;
grant execute on function privado.es_superusuario() to authenticated, service_role;

-- El registro puede pedir ser instructor, pero solo queda como solicitud:
-- el rol siempre nace 'estudiante' y lo cambia el superusuario.
create or replace function public.manejar_usuario_nuevo()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfiles (id, usuario, nombre, grupo, escuela, email, solicita_instructor)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1))),
    coalesce(new.raw_user_meta_data->>'nombre',  ''),
    coalesce(new.raw_user_meta_data->>'grupo',   ''),
    coalesce(new.raw_user_meta_data->>'escuela', ''),
    case when coalesce(new.raw_user_meta_data->>'email', '') ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
         then new.raw_user_meta_data->>'email' else '' end,
    coalesce((new.raw_user_meta_data->>'solicita_instructor')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Perfil: sin JWT (service_role, SQL Editor) todo pasa. Con JWT, el rol y la
-- bandera de superusuario solo los cambia el superusuario; el usuario nunca.
create or replace function privado.proteger_perfil()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return new; end if;
  new.usuario := old.usuario;
  if not privado.es_superusuario() then
    new.rol                 := old.rol;
    new.es_superusuario     := old.es_superusuario;
    -- subir de rol borra la solicitud; pedirla solo lo hace el registro
    new.solicita_instructor := old.solicita_instructor;
  elsif new.rol = 'instructor' then
    new.solicita_instructor := false;
  end if;
  return new;
end;
$$;

-- Calificación: solo instructores. A un estudiante se le revierte aunque la
-- mande en su propio PATCH/upsert.
create or replace function privado.proteger_nota()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then return new; end if;
  if privado.es_instructor() then
    if tg_op = 'UPDATE' and (new.nota is distinct from old.nota
                             or new.comentario is distinct from old.comentario) then
      new.calificado_por := auth.uid();
      new.calificado_en  := now();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.nota := null; new.comentario := ''; new.calificado_por := null; new.calificado_en := null;
  else
    new.nota := old.nota; new.comentario := old.comentario;
    new.calificado_por := old.calificado_por; new.calificado_en := old.calificado_en;
  end if;
  return new;
end;
$$;

create trigger al_calificar
  before insert or update on public.diagnosticos
  for each row execute function privado.proteger_nota();

-- El instructor también borra hojas (entregadas incluidas) y sus puntos.
drop policy diag_borrar on public.diagnosticos;
create policy diag_borrar on public.diagnosticos
  for delete to authenticated
  using ((autor_id = auth.uid() and estado = 'borrador') or privado.es_instructor());

drop policy puntos_borrar on public.puntos;
create policy puntos_borrar on public.puntos
  for delete to authenticated
  using (exists (
    select 1 from public.diagnosticos d
    where d.id = puntos.diagnostico_id
      and (d.autor_id = auth.uid() or privado.es_instructor())
  ));

drop policy puntos_crear on public.puntos;
create policy puntos_crear on public.puntos
  for insert to authenticated
  with check (exists (
    select 1 from public.diagnosticos d
    where d.id = puntos.diagnostico_id
      and (d.autor_id = auth.uid() or privado.es_instructor())
  ));

-- Todos los que existen hoy ya son estudiantes. El superusuario se nombra una
-- sola vez, a mano, después de crear su cuenta:
--   update public.perfiles set rol = 'instructor', es_superusuario = true
--   where usuario = 'TU_USUARIO';
