// Reinicia la contraseña de un estudiante. Solo la puede llamar un instructor.
//
// Como las cuentas usan un correo falso (usuario@taller.local) no hay "olvidé mi
// contraseña" por correo. Esta función cambia la clave con la API de administración;
// el instructor se la dice al estudiante, que luego la cambia o la conserva.
//
// verify_jwt queda en true: hace falta sesión. Además se comprueba que quien llama
// sea instructor, leyendo SU perfil con SU token (RLS), no con service_role.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const URL_SB  = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON    = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
  const yo = { apikey: ANON, Authorization: `Bearer ${token}` };

  // ¿quién llama? Con su propio token, su propio perfil: RLS le deja leer solo el suyo
  // (o todos, si es instructor), así que pedir rol = instructor sobre su id basta.
  const rUser = await fetch(`${URL_SB}/auth/v1/user`, { headers: yo });
  if (!rUser.ok) return json({ error: "Sesión no válida." }, 401);
  const { id: yoId } = await rUser.json();
  const rRol = await fetch(
    `${URL_SB}/rest/v1/perfiles?id=eq.${yoId}&rol=eq.instructor&select=id`,
    { headers: yo },
  );
  if (!rRol.ok || ((await rRol.json()) as unknown[]).length === 0) {
    return json({ error: "Solo el instructor puede reiniciar contraseñas." }, 403);
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "No se pudo leer la solicitud." }, 400);
  }
  const id = String(cuerpo.id ?? "");
  const password = String(cuerpo.password ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "Estudiante no válido." }, 400);
  if (password.length < 6) return json({ error: "La contraseña necesita al menos 6 caracteres." }, 400);

  const r = await fetch(`${URL_SB}/auth/v1/admin/users/${id}`, {
    method: "PUT",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!r.ok) {
    console.error("admin/users PUT:", r.status, await r.text());
    return json({ error: "No se pudo cambiar la contraseña." }, 500);
  }
  return json({ ok: true });
});
