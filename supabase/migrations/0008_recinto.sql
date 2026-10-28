-- 0008: el recinto de cada persona (tema de la app).
--
--   ''         = sin elegir: la app usa el tema del sistema ITPR
--   'itpr'     = sistema ITPR
--   'sanjuan'  = Recinto de San Juan (Tiburones)
--   'manati'   = Recinto de Manatí (Pumas)
--
-- Cada quien puede cambiar el suyo (la política perfiles_editar ya deja editar el propio
-- perfil y proteger_perfil solo revierte rol, usuario y banderas de superusuario). El instructor
-- también lo puede cambiar al de sus estudiantes desde la pestaña Gente.

alter table public.perfiles
  add column if not exists recinto text not null default ''
    check (recinto in ('', 'itpr', 'sanjuan', 'manati'));

-- el registro puede traer el recinto elegido en la pantalla de entrada
create or replace function public.manejar_usuario_nuevo()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfiles (id, usuario, nombre, grupo, escuela, email, solicita_instructor, recinto)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'usuario', split_part(new.email, '@', 1))),
    coalesce(new.raw_user_meta_data->>'nombre',  ''),
    coalesce(new.raw_user_meta_data->>'grupo',   ''),
    coalesce(new.raw_user_meta_data->>'escuela', ''),
    case when coalesce(new.raw_user_meta_data->>'email', '') ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
         then new.raw_user_meta_data->>'email' else '' end,
    coalesce((new.raw_user_meta_data->>'solicita_instructor')::boolean, false),
    case when new.raw_user_meta_data->>'recinto' in ('itpr', 'sanjuan', 'manati')
         then new.raw_user_meta_data->>'recinto' else '' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
