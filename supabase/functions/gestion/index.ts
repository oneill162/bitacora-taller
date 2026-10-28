// Gestión de cuentas por el instructor: crear estudiante, borrar, cambiar clave.
//
// Hace falta service_role (API de administración de Auth), que el navegador
// no puede tener. Por eso es una función y no una política de RLS.
//
// Las contraseñas NO se pueden ver: Auth solo guarda un hash. Lo que sí se
// puede es poner una nueva y decírsela al estudiante.
//
// verify_jwt = true, y además se comprueba el rol de quien llama leyendo SU
// perfil con SU token (RLS), no con service_role.
//
// Reglas:
//  - instructor: gestiona estudiantes.
//  - superusuario: además gestiona instructores. A sí mismo nadie se borra.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const URL_SB  = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON    = Deno.env.get("SUPABASE_ANON_KEY")!;
const DOMINIO = "taller.local";

const admin = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
  const yo = { apikey: ANON, Authorization: `Bearer ${token}` };

  const rUser = await fetch(`${URL_SB}/auth/v1/user`, { headers: yo });
  if (!rUser.ok) return json({ error: "Sesión no válida." }, 401);
  const { id: yoId } = await rUser.json();

  const rYo = await fetch(`${URL_SB}/rest/v1/perfiles?id=eq.${yoId}&select=rol,es_superusuario`, { headers: yo });
  const mio = rYo.ok ? (await rYo.json())?.[0] : null;
  if (mio?.rol !== "instructor") return json({ error: "Solo el instructor puede hacer esto." }, 403);
  const soySuper = mio.es_superusuario === true;

  let c: Record<string, unknown>;
  try { c = await req.json(); } catch { return json({ error: "No se pudo leer la solicitud." }, 400); }
  const accion = String(c.accion ?? "");
  const texto = (k: string, max: number) => String(c[k] ?? "").trim().slice(0, max);

  // sobre quién se actúa: un instructor solo toca estudiantes
  const objetivo = async () => {
    const id = String(c.id ?? "");
    if (!UUID.test(id)) return { error: json({ error: "Estudiante no válido." }, 400) };
    const r = await fetch(`${URL_SB}/rest/v1/perfiles?id=eq.${id}&select=id,rol,es_superusuario`, { headers: admin });
    const p = r.ok ? (await r.json())?.[0] : null;
    if (!p) return { error: json({ error: "Ese estudiante ya no existe." }, 404) };
    if (p.rol !== "estudiante" && !soySuper) return { error: json({ error: "Solo el superusuario gestiona instructores." }, 403) };
    return { id, p };
  };

  if (accion === "crear") {
    const usuario = texto("usuario", 32).toLowerCase();
    const password = String(c.password ?? "");
    const email = texto("email", 160);
    if (!/^[a-z0-9._-]{3,32}$/.test(usuario)) return json({ error: "Usuario no válido (minúsculas, números, punto, guion)." }, 400);
    if (password.length < 6) return json({ error: "La contraseña necesita al menos 6 caracteres." }, 400);
    if (email && !EMAIL.test(email)) return json({ error: "Ese correo no es válido." }, 400);
    const r = await fetch(`${URL_SB}/auth/v1/admin/users`, {
      method: "POST", headers: admin,
      body: JSON.stringify({
        email: `${usuario}@${DOMINIO}`, password, email_confirm: true,
        user_metadata: { usuario, nombre: texto("nombre", 120), grupo: texto("grupo", 60),
                         escuela: texto("escuela", 120), email, recinto: texto("recinto", 16) },
      }),
    });
    if (!r.ok) {
      const d = await r.text();
      console.error("crear:", r.status, d);
      return json({ error: d.includes("already been registered") ? "Ese usuario ya está tomado." : "No se pudo crear la cuenta." },
                  d.includes("already been registered") ? 409 : 500);
    }
    return json({ ok: true });
  }

  if (accion === "clave") {
    const password = String(c.password ?? "");
    if (password.length < 6) return json({ error: "La contraseña necesita al menos 6 caracteres." }, 400);
    const o = await objetivo(); if (o.error) return o.error;
    const r = await fetch(`${URL_SB}/auth/v1/admin/users/${o.id}`, {
      method: "PUT", headers: admin, body: JSON.stringify({ password }),
    });
    if (!r.ok) { console.error("clave:", r.status, await r.text()); return json({ error: "No se pudo cambiar la contraseña." }, 500); }
    return json({ ok: true });
  }

  if (accion === "borrar") {
    const o = await objetivo(); if (o.error) return o.error;
    if (o.id === yoId) return json({ error: "No puedes borrar tu propia cuenta." }, 400);
    if (o.p.es_superusuario) return json({ error: "El superusuario no se puede borrar." }, 403);
    // borra el usuario de Auth; el perfil y sus hojas se van por ON DELETE CASCADE
    const r = await fetch(`${URL_SB}/auth/v1/admin/users/${o.id}`, { method: "DELETE", headers: admin });
    if (!r.ok) { console.error("borrar:", r.status, await r.text()); return json({ error: "No se pudo borrar la cuenta." }, 500); }
    return json({ ok: true });
  }

  return json({ error: "Acción desconocida." }, 400);
});
