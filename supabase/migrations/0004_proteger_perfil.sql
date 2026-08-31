-- HUECO ENCONTRADO EN PRUEBAS: la política perfiles_editar dejaba que un
-- estudiante editara su propio perfil, pero no restringía QUÉ columnas. Un
-- estudiante podía hacer PATCH {"rol":"instructor"} sobre sí mismo y con eso
-- leer el trabajo de toda la clase y el código de registro.
--
-- auth.uid() es null cuando no hay JWT: service_role y psql pasan de largo,
-- que es como el instructor promueve a alguien.

create or replace function privado.proteger_perfil()
returns trigger language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or privado.es_instructor() then
    return new;
  end if;
  new.rol     := old.rol;
  new.usuario := old.usuario;
  return new;
end;
$$;

grant execute on function privado.proteger_perfil() to authenticated;

create trigger al_editar_perfil
  before update on public.perfiles
  for each row execute function privado.proteger_perfil();
