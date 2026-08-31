-- Las funciones internas salen del esquema public para que PostgREST
-- no las exponga como endpoints /rest/v1/rpc/...
-- (aviso del linter de Supabase: anon/authenticated_security_definer_function_executable)

create schema if not exists privado;
revoke all on schema privado from public;
grant usage on schema privado to authenticated, service_role;

create function privado.es_instructor()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.perfiles p
    where p.id = auth.uid() and p.rol = 'instructor'
  );
$$;
revoke all on function privado.es_instructor() from public;
grant execute on function privado.es_instructor() to authenticated, service_role;

drop policy perfiles_leer   on public.perfiles;
drop policy perfiles_editar on public.perfiles;
drop policy equipos_borrar  on public.equipos;
drop policy diag_leer       on public.diagnosticos;
drop policy diag_editar     on public.diagnosticos;
drop policy puntos_leer     on public.puntos;
drop policy puntos_editar   on public.puntos;

create policy perfiles_leer on public.perfiles
  for select to authenticated
  using (id = auth.uid() or privado.es_instructor());

create policy perfiles_editar on public.perfiles
  for update to authenticated
  using (id = auth.uid() or privado.es_instructor())
  with check (id = auth.uid() or privado.es_instructor());

create policy equipos_borrar on public.equipos
  for delete to authenticated using (privado.es_instructor());

create policy diag_leer on public.diagnosticos
  for select to authenticated
  using (autor_id = auth.uid() or privado.es_instructor());

create policy diag_editar on public.diagnosticos
  for update to authenticated
  using (autor_id = auth.uid() or privado.es_instructor())
  with check (autor_id = auth.uid() or privado.es_instructor());

create policy puntos_leer on public.puntos
  for select to authenticated
  using (exists (select 1 from public.diagnosticos d
    where d.id = puntos.diagnostico_id
      and (d.autor_id = auth.uid() or privado.es_instructor())));

create policy puntos_editar on public.puntos
  for update to authenticated
  using (exists (select 1 from public.diagnosticos d
    where d.id = puntos.diagnostico_id
      and (d.autor_id = auth.uid() or privado.es_instructor())))
  with check (exists (select 1 from public.diagnosticos d
    where d.id = puntos.diagnostico_id
      and (d.autor_id = auth.uid() or privado.es_instructor())));

drop function public.es_instructor();

-- Las funciones de trigger nunca deben ser llamables por REST.
-- El trigger sigue disparando: Postgres verifica EXECUTE al crear el trigger,
-- no en cada ejecución.
revoke all on function public.manejar_usuario_nuevo() from public, anon, authenticated;
revoke all on function public.tocar_actualizado()     from public, anon, authenticated;

-- usuario_disponible SÍ queda expuesta a propósito: la app la llama antes de que
-- el estudiante tenga sesión, para avisar "ese usuario ya está tomado".
revoke all on function public.usuario_disponible(text) from public;
grant execute on function public.usuario_disponible(text) to anon, authenticated;
