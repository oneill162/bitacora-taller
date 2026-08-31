// Configuración pública de la app.
// La llave "anon" está DISEÑADA para ir en el navegador: no es un secreto.
// Lo que protege los datos es Row Level Security en Postgres, no esconder esta llave.
// Nunca pongas aquí la llave service_role.

export const SUPABASE_URL  = "https://glwinbslxgurmzyvttyo.supabase.co";
export const SUPABASE_ANON = "sb_publishable_kjvnKJpqOOV5W8oNq7jswg_dJYjafeh";

// Los estudiantes entran con usuario, no con correo. Por detrás la app
// arma "usuario@DOMINIO_LOGIN" porque Supabase Auth necesita un correo.
// No se envía correo a este dominio nunca.
export const DOMINIO_LOGIN = "taller.local";

export const NOMBRE_TALLER = "Taller de Tecnología";
