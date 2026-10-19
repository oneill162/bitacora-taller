// Punto de entrada: la lógica vive en los módulos de esta carpeta.
import { SUPABASE_URL } from "./config.js";
import { app } from "./nucleo.js";
import { iniciar } from "./router.js";

if(SUPABASE_URL === "PENDIENTE"){
  app.innerHTML = `<main><div class="acceso"><h1>Falta configurar</h1>
    <p class="sub">Abre <code>app/config.js</code> y pon la URL y la llave anon de tu proyecto de Supabase.</p></div></main>`;
} else {
  iniciar();
}
