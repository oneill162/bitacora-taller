import { NOMBRE_TALLER } from "./config.js";
import { sb, $, app, estado, esc, aviso, explicar, conCorte, conectado } from "./nucleo.js";
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
  return `
  <div class="pila">
    <div class="enc no-print">
      <div><h1>Código para entrar</h1>
        <p>Pégalo en la plataforma de los estudiantes o proyéctalo en clase.</p></div>
      <button class="btn ghost" id="b-volver">Volver</button>
    </div>
    <div id="aviso" hidden></div>

    <div class="cartel">
      <h2>Bitácora de Diagnóstico</h2>
      <p class="cartel-sub">${esc(NOMBRE_TALLER)}</p>
      <div class="qr" id="qr">Generando…</div>
      <p class="cartel-url" id="qr-url">${esc(enlaceEntrada())}</p>
      ${estado.codigoClase ? `<p class="cartel-cod">Código de clase: <b>${esc(estado.codigoClase)}</b></p>` : ""}
      <p class="cartel-pie">Escanea con la cámara del teléfono y escribe el código de arriba.
        Crea tu cuenta una sola vez; después entras con tu usuario y contraseña.</p>
    </div>

    <div class="filtros no-print">
      <button class="btn ghost chico" id="b-png">Descargar imagen</button>
      <button class="btn ghost chico" id="b-imprimir">Imprimir el cartel</button>
    </div>
    <p class="pista no-print">El QR abre la app en <i>Crear cuenta</i>, pero el código no
      viaja en el enlace: el estudiante lo escribe a mano. Proyéctalo o díctalo en clase.</p>
  </div>`;
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
  // las plataformas escolares, que no siempre dejan subir SVG.
  $("#b-png").onclick = async () => {
    const svg = $("#qr svg");
    if(!svg){ aviso("Todavía no hay QR que descargar."); return; }
    const lado = 1024;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type:"image/svg+xml" });
    const src = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = lado;
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, lado, lado);
      g.drawImage(img, 0, 0, lado, lado);
      URL.revokeObjectURL(src);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = "bitacora-taller-qr.png";
      a.click();
    };
    img.onerror = () => { URL.revokeObjectURL(src); aviso("No se pudo convertir el QR a imagen."); };
    img.src = src;
  };
  pintarQR();
}
