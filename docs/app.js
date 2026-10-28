// Punto de entrada: la lógica vive en los módulos de esta carpeta.
import { SUPABASE_URL } from "./config.js";
import { app } from "./nucleo.js";
import { iniciar } from "./router.js";
import { iniciarCampus } from "./campus.js";

// El recinto y el modo se aplican antes del primer pintado (index.html ya puso los atributos desde el
// almacenamiento; esto engancha los controles y la barra del sistema) y otra vez al entrar con el perfil.
iniciarCampus();

if(SUPABASE_URL === "PENDIENTE"){
  app.innerHTML = `<main><div class="aviso-pagina"><h1 class="h2">Falta configurar</h1>
    <p class="suave">Abre <code>docs/config.js</code> y pon la URL y la llave anon de tu proyecto de Supabase.</p></div></main>`;
} else {
  iniciar();
}
