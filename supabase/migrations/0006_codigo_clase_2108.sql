-- El código de clase del taller es 2108 y no cambia por semestre: es el número
-- del grupo. Se sigue guardando en `ajustes` (no en el código de la app) para
-- que el instructor pueda cambiarlo desde SQL si algún día hace falta.
insert into public.ajustes (clave, valor, descripcion) values
  ('codigo_registro', '2108',
   'Código que el estudiante escribe a mano al crear su cuenta. Es 2108.')
on conflict (clave) do update
  set valor = excluded.valor,
      descripcion = excluded.descripcion,
      actualizado_en = now();
