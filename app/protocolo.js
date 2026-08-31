// Fuente única del protocolo de diagnóstico.
// La usan la app web (navegador) y el sincronizador a Obsidian (Node).
// Si añades o quitas puntos, mantén las claves i0, i1... estables:
// los diagnósticos ya guardados se enlazan por esa clave.

export const GRUPOS = [
  { n: "01", t: "Identificación y seguridad", items: [
    { t: "Etiqueta de servicio y serial legibles", h: "Marca, modelo y serial verificados contra la etiqueta física." },
    { t: "Chasis sin daño físico relevante", h: "Golpes, bisagras, tornillos, tapas y puertos." },
    { t: "Cable de corriente y adaptador en buen estado", h: "Sin forro pelado, puntas dobladas ni olor a quemado." }
  ]},
  { n: "02", t: "Encendido y POST", items: [
    { t: "Enciende al primer intento", h: "Luces y ventiladores responden al botón de encendido." },
    { t: "Completa el POST sin códigos de error", h: "Sin pitidos ni patrones de luces de error; llega al logo del fabricante." },
    { t: "Acceso al BIOS/UEFI", h: "Entra con la tecla del fabricante y muestra RAM y disco instalados." },
    { t: "Fecha y hora del BIOS correctas", h: "Si se atrasa siempre, la batería CMOS está gastada." }
  ]},
  { n: "03", t: "Interior y enfriamiento", items: [
    { t: "Rejillas y disipadores sin acumulación de polvo", h: "Revisar entrada y salida de aire." },
    { t: "Ventiladores giran libres y sin ruido anormal", h: "Sin arrastre, juego lateral ni cables rozando las aspas." },
    { t: "RAM y cables internos bien asentados", h: "Seguros cerrados, conectores SATA y de corriente firmes." },
    { t: "Sin capacitores abombados ni olor a quemado", h: "Inspección visual de la tarjeta madre." },
    { t: "Temperatura y uso de CPU normales en reposo", h: "Administrador de tareas: CPU bajo 20% sin carga." }
  ]},
  { n: "04", t: "Memoria y almacenamiento", items: [
    { t: "Diagnóstico de memoria sin errores", h: "mdsched.exe — resultado en el Visor de eventos." },
    { t: "Estado del disco: Healthy", h: "Get-PhysicalDisk | Select FriendlyName, HealthStatus" },
    { t: "chkdsk sin sectores dañados", h: "chkdsk C: /f /r — se programa para el próximo reinicio." },
    { t: "Espacio libre en C: sobre 15%", h: "Bajo 15% observación; bajo 5% falla." }
  ]},
  { n: "05", t: "Arranque y sistema operativo", items: [
    { t: "Arranca a Windows en tiempo razonable", h: "SSD bajo 30 s; disco mecánico hasta 90 s." },
    { t: "Windows activado y en versión con soporte", h: "winver y Configuración → Sistema → Activación." },
    { t: "DISM y sfc /scannow sin errores pendientes", h: "Primero DISM /Online /Cleanup-Image /RestoreHealth, después sfc /scannow." },
    { t: "Programas de inicio revisados", h: "Administrador de tareas → Aplicaciones de inicio." }
  ]},
  { n: "06", t: "Actualizaciones y seguridad", items: [
    { t: "Windows Update al día y sin fallos repetidos", h: "Configuración → Windows Update." },
    { t: "Antivirus y firewall activos", h: "Seguridad de Windows con protección en tiempo real encendida." },
    { t: "Escaneo completo sin amenazas", h: "Examen completo de Microsoft Defender." },
    { t: "Punto de restauración o respaldo verificado", h: "Antes de cualquier cambio mayor." }
  ]},
  { n: "07", t: "Dispositivos y periféricos", items: [
    { t: "Administrador de dispositivos sin advertencias", h: "devmgmt.msc — sin triángulos amarillos ni dispositivos desconocidos." },
    { t: "Pantalla sin píxeles muertos ni parpadeo", h: "Probar con fondo blanco y fondo negro a pantalla completa." },
    { t: "Teclado completo responde", h: "Probar fila por fila en el Bloc de notas, incluyendo ñ y acentos." },
    { t: "Mouse o touchpad funcionan", h: "Movimiento, ambos clics y desplazamiento." },
    { t: "Audio y micrófono funcionan", h: "Configuración → Sistema → Sonido." },
    { t: "Puertos USB y lector de tarjetas", h: "Probar cada puerto con la misma memoria USB." },
    { t: "Cámara funcional", h: "App Cámara, con imagen y luz indicadora." }
  ]},
  { n: "08", t: "Red e internet", items: [
    { t: "Obtiene dirección IP válida", h: "ipconfig /all — una IP que empiece en 169.254 significa que no recibió DHCP." },
    { t: "Alcanza la puerta de enlace y el internet", h: "ping a la puerta de enlace y a 8.8.8.8." },
    { t: "Resolución de nombres (DNS)", h: "nslookup google.com" }
  ]},
  { n: "09", t: "Energía y batería (portátiles)", items: [
    { t: "Salud de la batería sobre 80%", h: "powercfg /batteryreport — comparar Full Charge contra Design Capacity." },
    { t: "Carga correctamente con el adaptador", h: "El ícono cambia a cargando y el porcentaje sube." }
  ]},
  { n: "10", t: "Registro de eventos", items: [
    { t: "Sin errores críticos en las últimas 24 horas", h: "eventvwr.msc → Registros de Windows → Sistema, filtrado por Crítico y Error." }
  ]}
];

// Lista plana con claves estables: i0, i1, i2...
export const PUNTOS = (() => {
  const out = [];
  let k = 0;
  GRUPOS.forEach((g, gi) => g.items.forEach(it => {
    out.push({ clave: "i" + (k++), gi, grupo: g.n, grupoTitulo: g.t, titulo: it.t, ayuda: it.h });
  }));
  return out;
})();

export const ESTADOS = [
  { v: "ok",    corto: "Bien",  largo: "Bien" },
  { v: "obs",   corto: "Obs.",  largo: "Observación" },
  { v: "falla", corto: "Falla", largo: "Falla" },
  { v: "na",    corto: "N/A",   largo: "No aplica" }
];

export const VEREDICTOS = {
  "":     "Sin evaluar",
  apto:   "Apto",
  obs:    "Apto con observaciones",
  no:     "No apto"
};

// Regla del taller: una falla manda, si no manda la observación.
export function resumir(estadosPorClave) {
  const c = { ok: 0, obs: 0, falla: 0, na: 0, sin: 0 };
  PUNTOS.forEach(p => {
    const s = estadosPorClave[p.clave];
    if (s) c[s]++; else c.sin++;
  });
  const evaluados = PUNTOS.length - c.sin;
  let veredicto = "";
  if (evaluados > 0) {
    if (c.falla > 0) veredicto = "no";
    else if (c.obs > 0) veredicto = "obs";
    else veredicto = "apto";
  }
  return { conteo: c, evaluados, total: PUNTOS.length, veredicto, completo: c.sin === 0 };
}
