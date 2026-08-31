// Registro de estudiantes sin pasar por el correo.
//
// auth.signUp envía un correo de confirmación a usuario@taller.local, un dominio
// que no existe, y además choca con el límite de ~2 correos por hora del plan
// gratuito. Esta función crea la cuenta YA CONFIRMADA con la API de administración,
// que no envía nada. Login y sesión siguen siendo los normales de Supabase.
//
// Corre con verify_jwt = false porque el estudiante todavía no tiene sesión
// cuando se registra. Su autenticación propia es el código de clase que da el
// instructor, guardado en la tabla `ajustes`.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const URL_SB  = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DOMINIO = "taller.local";

const cabeceras = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "No se pudo leer la solicitud." }, 400);
  }

  const texto = (k: string, max: number) => String(cuerpo[k] ?? "").trim().slice(0, max);
  const usuario  = texto("usuario", 32).toLowerCase();
  const password = String(cuerpo.password ?? "");
  const codigo   = texto("codigo", 64);

  if (!/^[a-z0-9._-]{3,32}$/.test(usuario)) {
    return json({ error: "El usuario debe tener entre 3 y 32 caracteres: minúsculas, números, punto, guion o guion bajo." }, 400);
  }
  if (password.length < 6) {
    return json({ error: "La contraseña necesita al menos 6 caracteres." }, 400);
  }

  // 1. código de clase
  const rCodigo = await fetch(
    `${URL_SB}/rest/v1/ajustes?clave=eq.codigo_registro&select=valor`,
    { headers: cabeceras },
  );
  if (!rCodigo.ok) {
    console.error("ajustes:", rCodigo.status, await rCodigo.text());
    return json({ error: "No se pudo verificar el código. Avisa al instructor." }, 500);
  }
  const esperado = (await rCodigo.json())?.[0]?.valor ?? "";
  if (!esperado || codigo.toLowerCase() !== String(esperado).toLowerCase()) {
    return json({ error: "Código de clase incorrecto. Pídeselo al instructor." }, 403);
  }

  // 2. ¿está libre el usuario?
  const rLibre = await fetch(
    `${URL_SB}/rest/v1/perfiles?usuario=eq.${encodeURIComponent(usuario)}&select=usuario`,
    { headers: cabeceras },
  );
  if (rLibre.ok && ((await rLibre.json()) as unknown[]).length > 0) {
    return json({ error: "Ese usuario ya está tomado. Escoge otro." }, 409);
  }

  // 3. crear la cuenta ya confirmada. El rol siempre es estudiante:
  //    nadie se hace instructor desde el formulario.
  const rNuevo = await fetch(`${URL_SB}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...cabeceras, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `${usuario}@${DOMINIO}`,
      password,
      email_confirm: true,
      user_metadata: {
        usuario,
        nombre:  texto("nombre", 120),
        grupo:   texto("grupo", 60),
        escuela: texto("escuela", 120),
      },
    }),
  });

  if (!rNuevo.ok) {
    const detalle = await rNuevo.text();
    console.error("admin/users:", rNuevo.status, detalle);
    if (detalle.includes("already been registered")) {
      return json({ error: "Ese usuario ya está tomado. Escoge otro." }, 409);
    }
    return json({ error: "No se pudo crear la cuenta. Avisa al instructor." }, 500);
  }

  return json({ ok: true, usuario });
});
