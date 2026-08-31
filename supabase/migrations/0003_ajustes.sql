-- Ajustes del taller. Guarda el código de clase que hace falta para abrir
-- cuenta. Solo el instructor lo lee y lo cambia; anon no lo ve nunca
-- (la Edge Function lo consulta con service_role).
create table public.ajustes (
  clave          text primary key,
  valor          text not null,
  descripcion    text not null default '',
  actualizado_en timestamptz not null default now()
);

alter table public.ajustes enable row level security;

create policy ajustes_leer on public.ajustes
  for select to authenticated using (privado.es_instructor());

create policy ajustes_editar on public.ajustes
  for update to authenticated
  using (privado.es_instructor()) with check (privado.es_instructor());

grant select, update on public.ajustes to authenticated;
grant select on public.ajustes to service_role;

insert into public.ajustes (clave, valor, descripcion) values
  ('codigo_registro', 'TALLER-2026',
   'Código que el estudiante escribe una sola vez al crear su cuenta. Cámbialo cada semestre.');
