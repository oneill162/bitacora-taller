-- Limpieza única (no es migración). Correr en el SQL Editor de Supabase.
-- 1) Borra equipos sin ninguna hoja que sean restos del serial a medio escribir:
--    sin datos, o prefijo de otro equipo del mismo creador. Esperado: 177 filas.
--    Quedan 10 dudosos (con datos y sin hoja) para revisar a mano.
with orf as (
  select e.* from equipos e
  where not exists (select 1 from diagnosticos d where d.equipo_id = e.id)
), borrar as (
  select o.id from orf o
  where (coalesce(trim(o.inventario),'')='' and coalesce(trim(o.marca),'')='' and coalesce(trim(o.modelo),'')='')
     or exists (select 1 from equipos b
                where b.id <> o.id and b.creado_por = o.creado_por
                  and length(b.serial) > length(o.serial)
                  and upper(b.serial) like upper(o.serial) || '%')
)
delete from equipos where id in (select id from borrar);

-- 2) Unifica el grupo escrito de cinco maneras.
update perfiles set grupo = 'TESI 2' where rol = 'estudiante' and grupo <> 'TESI 2';
