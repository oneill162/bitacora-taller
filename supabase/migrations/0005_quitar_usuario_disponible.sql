-- Ya no hace falta: la Edge Function `registro` comprueba la disponibilidad
-- del usuario con service_role. Quitarla elimina el único endpoint que
-- permitía enumerar nombres de usuario sin sesión, y con eso desaparecen
-- los dos avisos que quedaban del linter de seguridad.
drop function if exists public.usuario_disponible(text);
