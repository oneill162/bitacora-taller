// Avisos por correo. La app la llama al entregar una hoja y cuando el
// instructor califica o cambia algo.
//
// Se manda con Resend (https://resend.com). Hace falta, como secretos de la función:
//   RESEND_API_KEY   la llave de Resend
//   AVISOS_DE        remitente, p. ej. "Bitácora <avisos@tudominio.com>".
//                    Sin dominio verificado, Resend solo deja escribir a TU correo
//                    (onboarding@resend.dev): sirve para probar, no para la clase.
// Sin RESEND_API_KEY la función responde ok:false y no pasa nada.
//
// Limitación: el aviso sale desde el navegador de quien actúa. Una hoja entregada
// sin señal avisará cuando suba, no antes; y si se cierra la app justo antes, se pierde.
//
// verify_jwt = true. Quién puede avisar de qué se decide aquí, no en el cliente:
//   entregada    solo el autor de la hoja   → le llega a él
//   calificada   solo un instructor         → le llega al autor

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const URL_SB = Deno.env.get("SUPABASE_URL")!;
const ANON   = Deno.env.get("SUPABASE_ANON_KEY")!;
const LLAVE  = Deno.env.get("RESEND_API_KEY") ?? "";
const DE     = Deno.env.get("AVISOS_DE") ?? "Bitácora de Diagnóstico <onboarding@resend.dev>";

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const VEREDICTO: Record<string, string> = { apto: "Apto", obs: "Apto con observaciones", no: "No apto" };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (!LLAVE) return json({ ok: false, motivo: "El correo no está configurado." });

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
  const yo = { apikey: ANON, Authorization: `Bearer ${token}` };
  const rUser = await fetch(`${URL_SB}/auth/v1/user`, { headers: yo });
  if (!rUser.ok) return json({ error: "Sesión no válida." }, 401);
  const { id: yoId } = await rUser.json();

  let c: Record<string, unknown>;
  try { c = await req.json(); } catch { return json({ error: "No se pudo leer la solicitud." }, 400); }
  const tipo = String(c.tipo ?? "");
  const diagId = String(c.diag_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(diagId) || !["entregada", "calificada"].includes(tipo)) {
    return json({ error: "Solicitud no válida." }, 400);
  }

  // todo se lee con el token de quien llama: RLS ya limita lo que puede ver
  const get = async (ruta: string) => {
    const r = await fetch(`${URL_SB}/rest/v1/${ruta}`, { headers: yo });
    return r.ok ? (await r.json())?.[0] : null;
  };
  const d = await get(`diagnosticos?id=eq.${diagId}&select=*,equipos(serial,marca,modelo)`);
  if (!d) return json({ error: "No encuentras esa hoja." }, 404);
  const yoPerfil = await get(`perfiles?id=eq.${yoId}&select=rol,nombre,usuario`);

  if (tipo === "entregada" && d.autor_id !== yoId) return json({ error: "No es tu hoja." }, 403);
  if (tipo !== "entregada" && yoPerfil?.rol !== "instructor") return json({ error: "Solo el instructor." }, 403);

  const autor = await get(`perfiles?id=eq.${d.autor_id}&select=nombre,usuario,email`);
  if (!autor?.email) return json({ ok: false, motivo: "El estudiante no tiene correo." });

  const eq = d.equipos ? `${d.equipos.marca} ${d.equipos.modelo} (${d.equipos.serial})`.replace(/\s+/g, " ").trim() : "equipo sin identificar";
  const hola = `Hola ${esc(autor.nombre || autor.usuario)},`;
  let asunto = "", cuerpo = "";
  if (tipo === "entregada") {
    asunto = "Recibimos tu diagnóstico";
    cuerpo = `<p>${hola}</p><p>Tu diagnóstico de <b>${esc(eq)}</b> (orden ${esc(d.orden || "—")}, ${esc(d.fecha)}) quedó entregado.</p>
      <p>Veredicto: <b>${esc(VEREDICTO[d.veredicto] || "—")}</b>.
      Puntos: ${esc(d.conteo?.ok ?? 0)} bien, ${esc(d.conteo?.obs ?? 0)} con observación, ${esc(d.conteo?.falla ?? 0)} con falla.</p>`;
  } else {
    asunto = "Tu diagnóstico fue calificado";
    cuerpo = `<p>${hola}</p><p>${esc(yoPerfil.nombre || yoPerfil.usuario)} calificó tu diagnóstico de <b>${esc(eq)}</b> (${esc(d.fecha)}).</p>
      <p>Nota: <b>${esc(d.nota ?? "—")}</b></p>${d.comentario ? `<p>Comentario: ${esc(d.comentario)}</p>` : ""}`;
  }

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${LLAVE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: DE, to: [autor.email], subject: asunto, html: cuerpo }),
  });
  if (!r.ok) { console.error("resend:", r.status, await r.text()); return json({ ok: false, motivo: "No se pudo enviar." }); }
  return json({ ok: true });
});
