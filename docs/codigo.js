import { NOMBRE_TALLER } from "./config.js";
import { sb, $, app, estado, esc, aviso, explicar, conCorte, conectado } from "./nucleo.js";
import { RECINTOS, recintoActual, ilustracion, placaHero } from "./campus.js";
import { pintar } from "./router.js";
import { descargar } from "./admin.js";

/* ================= código de entrada (instructor) ================= */
// El QR se dibuja en el navegador y no se guarda como imagen en el repo: así
// siempre lleva la dirección real desde donde se abrió la app. El código de
// clase NO viaja en el enlace; va impreso en el cartel para que el estudiante
// lo escriba. Un enlace que se cuele fuera del salón no abre cuentas solo.
//
// La librería se carga solo cuando hace falta: son 20 KB que un estudiante
// nunca necesita. El service worker la tiene guardada, así que entra al
// momento y también sin señal.
export let qrCargado = null;
export function cargarQR(){
  if(window.qrcode) return Promise.resolve(window.qrcode);
  if(qrCargado) return qrCargado;
  qrCargado = new Promise((ok, mal) => {
    const et = document.createElement("script");
    et.src = "./vendor/qr.js";
    et.onload = () => ok(window.qrcode);
    et.onerror = () => { qrCargado = null; mal(new Error("No se pudo cargar el generador de QR.")); };
    document.head.appendChild(et);
  });
  return qrCargado;
}

// La dirección de la app tal como el navegador la tiene abierta, sin el
// index.html ni parámetros: es la que hay que repartir.
export function direccionApp(){
  const u = new URL(location.href);
  u.search = ""; u.hash = "";
  u.pathname = u.pathname.replace(/index\.html$/, "");
  return u.toString();
}

export function enlaceEntrada(){
  return `${direccionApp()}?nuevo=1`;
}

export async function cargarCodigoClase(){
  if(!conectado()) return;
  const { data, error } = await conCorte(
    sb.from("ajustes").select("valor").eq("clave", "codigo_registro").maybeSingle());
  if(!error && data) estado.codigoClase = data.valor;
}

export function vistaCodigo(){
  // las tres marcas van siempre; el CSS enseña la del recinto activo (así el cartel sigue al cambiar de recinto)
  const marcas = Object.values(RECINTOS).map(r =>
    `<img class="c-${r.id}" src="${r.crest}" alt="${esc(r.alt)}" width="${r.w}" height="${r.h}">`).join("");
  return `
  <section class="cap hero campo hero-chico sin-placa-tel no-print" aria-labelledby="h-cod">
    ${ilustracion()}
    <div class="in hero-in">
      <div class="hero-txt">
        <h1 class="h1" id="h-cod"><span class="linea"><span>Código para</span></span> <span class="linea"><span>entrar</span></span></h1>
        <p class="hero-sub rev">Pégalo en la plataforma de los estudiantes o proyéctalo en clase.</p>
        <div class="hero-acc rev"><button type="button" class="btn sec" id="b-volver">Volver</button></div>
      </div>
    </div>
    ${placaHero()}
  </section>

  <section class="cap campo-s2 cartel-sec" aria-label="Cartel para imprimir">
    <div class="in cartel-rej">
      <div id="aviso" hidden role="status"></div>
      <article class="cartel" aria-label="Cartel con el código QR">
        <div class="cartel-banda no-print" aria-hidden="true"></div>
        <header class="cartel-cab">
          <div class="cartel-marca">${marcas}</div>
          <div class="cartel-tit">
            <h2>Bitácora de Diagnóstico</h2>
            <p class="cartel-sub">${esc(NOMBRE_TALLER)}</p>
          </div>
        </header>
        <div class="qr" id="qr">Generando…</div>
        <p class="cartel-url" id="qr-url">${esc(enlaceEntrada())}</p>
        ${estado.codigoClase ? `<p class="cartel-cod">Código de clase <b>${esc(estado.codigoClase)}</b></p>` : ""}
        <p class="cartel-pie">Escanea con la cámara del teléfono y escribe el código de arriba.
          Crea tu cuenta una sola vez; después entras con tu usuario y contraseña.</p>
        <footer class="cartel-aval">
          <img src="img/depr.webp" alt="Departamento de Educación, Gobierno de Puerto Rico" width="1000" height="323">
        </footer>
      </article>

      <div class="cartel-acc no-print">
        <div class="fila">
          <button type="button" class="btn" id="b-imprimir">Imprimir el cartel</button>
          <button type="button" class="btn tenue" id="b-png">Descargar imagen</button>
        </div>
        <p class="pista">El QR abre la app en <i>Crear cuenta</i>, pero el código no
          viaja en el enlace: el estudiante lo escribe a mano. Proyéctalo o díctalo en clase.</p>
      </div>
    </div>
  </section>`;
}

export async function pintarQR(){
  const caja = $("#qr");
  if(!caja) return;
  try{
    const qrcode = await cargarQR();
    // nivel M de corrección y tipo automático: aguanta que el cartel se
    // imprima regular o se escanee de una pantalla proyectada
    const q = qrcode(0, "M");
    q.addData(enlaceEntrada());
    q.make();
    caja.innerHTML = q.createSvgTag({ cellSize: 8, margin: 8, scalable: true });
    const url = $("#qr-url");
    if(url) url.textContent = enlaceEntrada();
  } catch(err){ caja.textContent = "No se pudo generar el QR."; aviso(explicar(err)); }
}

export function montarCodigo(){
  $("#b-volver").onclick = () => { estado.vista = "panel"; pintar(); };
  $("#b-imprimir").onclick = () => window.print();
  // El SVG se pasa por un lienzo para bajarlo como PNG: es lo que aceptan
  // las plataformas escolares, que no siempre dejan subir SVG. Debajo del QR va una
  // franja blanca con el escudo del recinto: nunca encima del QR (las marcas no se
  // cruzan con nada, docs/img/LEEME.md) y con aire de sobra alrededor.
  $("#b-png").onclick = async () => {
    const svg = $("#qr svg");
    if(!svg){ aviso("Todavía no hay QR que descargar."); return; }
    const cargar = src => new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = src; });
    const src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type:"image/svg+xml" }));
    try{
      const r = RECINTOS[recintoActual()];
      const [qr, escudo] = await Promise.all([cargar(src), cargar(r.crest).catch(() => null)]);   // sin escudo, la franja queda con el texto
      const lado = 1024, franja = 224, alto = 160;
      const c = document.createElement("canvas");
      c.width = lado; c.height = lado + franja;
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(qr, 0, 0, lado, lado);
      let x = 48;
      if(escudo){
        const ancho = Math.round(alto * r.w / r.h);
        g.drawImage(escudo, x, lado + (franja - alto) / 2, ancho, alto);
        x += ancho + 40;
      }
      const letra = getComputedStyle(document.body).fontFamily;
      g.fillStyle = "#111"; g.textBaseline = "alphabetic";
      g.font = `800 46px ${letra}`;
      g.fillText("Bitácora de Diagnóstico", x, lado + franja / 2 - 6);
      g.fillStyle = "#444"; g.font = `500 32px ${letra}`;
      g.fillText(`${NOMBRE_TALLER} · ${r.largo}`, x, lado + franja / 2 + 42);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = "bitacora-taller-qr.png";
      a.click();
    } catch(_){ aviso("No se pudo convertir el QR a imagen."); }
    finally { URL.revokeObjectURL(src); }
  };
  pintarQR();
}
