import * as local from "./local.js";
import * as taller from "./taller.js";

/* Supabase de mentira: anota lo que le piden y contesta lo que se le diga. */
function falso({ caer = false } = {}){
  const llamadas = [];
  const equipoServidor = { id: "EQ-REAL-0001", serial: "", marca:"", modelo:"" };
  const armar = (tabla, op, carga, opts) => {
    const reg = { tabla, op, carga, opts };
    llamadas.push(reg);
    const resultado = () => {
      if(caer) return { data:null, error:{ message:"Failed to fetch" } };
      if(tabla === "equipos") return { data: { ...equipoServidor, ...(Array.isArray(carga)?carga[0]:carga) }, error:null };
      return { data: carga, error:null };
    };
    const api = {
      select: () => api,
      single: () => Promise.resolve(resultado()),
      eq: (col, v) => { reg.eq = [col, v]; return api; },
      then: (ok, mal) => Promise.resolve(resultado()).then(ok, mal)
    };
    return api;
  };
  return {
    llamadas,
    from: tabla => ({
      upsert: (carga, opts) => armar(tabla, "upsert", carga, opts),
      delete: () => armar(tabla, "delete", null, null)
    })
  };
}

const META = { i0: { grupo:"01 Identificación", titulo:"Serial legible" },
               i1: { grupo:"01 Identificación", titulo:"Chasis sin daño" } };

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push([nombre, fn]);
function igual(a, b, que){
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if(x !== y) throw new Error(`${que}\n   esperaba: ${y}\n   obtuvo:   ${x}`);
}
const cierto = (v, que) => { if(!v) throw new Error(que); };

/* ---------------------------------------------------------------- */
prueba("guardar sin señal no pierde nada y queda pendiente", async () => {
  await local.olvidarTodo();
  const id = local.nuevoId();
  cierto(/^[0-9a-f-]{36}$/.test(id), "el id local debe ser un uuid: " + id);
  const d = { id, autor_id:"AUTOR-1", fecha:"2026-09-01", orden:"DX-260901-01",
              estado:"borrador", veredicto:"", conteo:{}, acciones:"limpieza",
              hallazgos:"", proximo_paso:"", usuario_equipo:"Salón 204", sistema:"Win 11",
              _serial:"ABC1234", equipos:{ serial:"ABC1234", marca:"Dell", modelo:"3080" } };
  await local.guardarTrabajo(d, { i0:{estado:"ok",nota:"legible"}, i1:{estado:"falla",nota:""} },
                             { serial:"ABC1234", marca:"Dell", modelo:"3080", creado_por:"AUTOR-1" }, META);

  const lista = await local.listaLocal();
  igual(lista.length, 1, "la hoja tiene que estar en el equipo del estudiante");
  igual(lista[0].acciones, "limpieza", "y con lo que se escribió");
  igual(await local.leerPuntos(id), { i0:{estado:"ok",nota:"legible"}, i1:{estado:"falla",nota:""} },
        "los puntos también se guardan");
  igual(await local.porSubir(), 2, "una hoja y un equipo por subir");
});

prueba("sin red, sincronizar no rompe ni marca como subido", async () => {
  const sb = falso({ caer:true });
  const r = await local.sincronizar(sb);
  igual(r.subio, false, "no pudo subir");
  cierto(r.error, "debe devolver el error, no tragárselo");
  igual(await local.porSubir(), 2, "lo pendiente sigue pendiente");
});

prueba("con red sube en orden, enlaza el equipo y limpia lo pendiente", async () => {
  const sb = falso();
  const r = await local.sincronizar(sb);
  igual(r.subio, true, "debió subir");
  igual(r.error, null, "sin error");

  const orden = sb.llamadas.map(l => `${l.tabla}.${l.op}`);
  igual(orden, ["equipos.upsert","diagnosticos.upsert","puntos.upsert"],
        "el equipo va primero: el diagnóstico necesita su id de verdad");

  const eq = sb.llamadas[0];
  igual(eq.opts, { onConflict:"serial" }, "el equipo se resuelve por serial");
  igual(eq.carga.id, undefined, "no se manda id: lo pone Supabase o ya existe");
  igual(Object.keys(eq.carga).sort(),
        ["creado_por","inventario","marca","modelo","serial","tipo","ubicacion"].filter(k => k in eq.carga).sort(),
        "solo columnas de la tabla");

  const dia = sb.llamadas[1].carga;
  igual(dia.equipo_id, "EQ-REAL-0001", "el diagnóstico queda enlazado al id que devolvió Supabase");
  cierto(!("_serial" in dia) && !("_sucio" in dia) && !("equipos" in dia),
         "no se le mandan a Supabase los campos internos: " + Object.keys(dia));
  igual(dia.autor_id, "AUTOR-1", "el autor viaja: RLS lo exige");

  const pts = sb.llamadas[2];
  igual(pts.opts, { onConflict:"diagnostico_id,clave" }, "los puntos se resuelven por hoja y clave");
  igual(pts.carga.length, 2, "los dos puntos anotados");
  igual(pts.carga[0].titulo, "Serial legible", "con su título, para el vault");

  igual(await local.porSubir(), 0, "ya no queda nada pendiente");
});

prueba("el espejo no pisa lo que este equipo tiene sin subir", async () => {
  await local.olvidarTodo();
  const id = local.nuevoId();
  await local.guardarTrabajo({ id, autor_id:"A", fecha:"2026-09-01", acciones:"lo mío, sin subir" },
                             {}, null, META);
  await local.espejarLista([{ id, fecha:"2026-09-01", acciones:"lo viejo del servidor", orden:"DX-1" }]);
  const d = await local.leerDiag(id);
  igual(d.acciones, "lo mío, sin subir", "lo del equipo del estudiante manda sobre lo bajado");
});

prueba("el espejo mezcla columnas parciales en vez de vaciar la hoja", async () => {
  await local.olvidarTodo();
  const id = local.nuevoId();
  // primero baja la hoja completa (como al abrirla)
  await local.espejarDiag({ id, fecha:"2026-09-01", acciones:"cambio de pasta térmica",
                            hallazgos:"disco al 96%", orden:"DX-1" }, [], null);
  // después el panel, que solo pide unas pocas columnas
  await local.espejarLista([{ id, fecha:"2026-09-01", orden:"DX-1", estado:"borrador", veredicto:"" }]);
  const d = await local.leerDiag(id);
  igual(d.acciones, "cambio de pasta térmica", "la lista del panel no puede borrar el detalle");
  igual(d.hallazgos, "disco al 96%", "ni los hallazgos");
});

prueba("el espejo suelta lo que ya no está en el servidor", async () => {
  await local.olvidarTodo();
  await local.espejarDiag({ id:"VIEJA", fecha:"2026-08-01" }, [], null);
  await local.espejarLista([]);
  igual((await local.listaLocal()).length, 0, "si el servidor no la tiene y aquí no hay cambios, sobra");
});

prueba("borrar sin señal se recuerda y se le avisa a Supabase después", async () => {
  await local.olvidarTodo();
  const id = local.nuevoId();
  await local.guardarTrabajo({ id, autor_id:"A", fecha:"2026-09-01" },
                             { i0:{estado:"ok",nota:""} }, null, META);
  const sb1 = falso();
  await local.sincronizar(sb1);
  igual(await local.porSubir(), 0, "queda al día");

  await local.marcarBorrado(id);
  igual((await local.listaLocal()).length, 0, "desaparece del panel de una vez");
  igual(await local.porSubir(), 1, "pero queda el aviso pendiente");

  const sb2 = falso();
  await local.sincronizar(sb2);
  const borra = sb2.llamadas.find(l => l.op === "delete");
  cierto(borra, "tiene que llamar al delete de Supabase");
  igual(borra.eq, ["id", id], "sobre la hoja correcta");
  igual(await local.porSubir(), 0, "y ya");
  igual(await local.leerPuntos(id), {}, "los puntos de esa hoja no quedan huérfanos");
});

prueba("reabrir una hoja guardada sin señal no pierde los datos del equipo", async () => {
  await local.olvidarTodo();
  const id = local.nuevoId();
  const equipo = { serial:"ABC1234", marca:"Dell", modelo:"OptiPlex 3080", tipo:"Torre de escritorio",
                   inventario:"INV-00842", ubicacion:"Salón 204", creado_por:"A" };
  const diag = { id, autor_id:"A", fecha:"2026-09-01", _serial:"ABC1234",
                 equipos:{ serial:"ABC1234", marca:"Dell", modelo:"OptiPlex 3080" } };
  await local.guardarTrabajo(diag, {}, equipo, META);

  // así es como abrir() reconstruye el equipo de una hoja guardada aquí
  const d = await local.leerDiag(id);
  const serial = d._serial || d.equipos?.serial;
  const reconstruido = (serial ? await local.leerEquipo(serial) : null) || d.equipos || null;

  igual(reconstruido.tipo, "Torre de escritorio", "el tipo tiene que seguir ahí");
  igual(reconstruido.inventario, "INV-00842", "y el número de inventario");
  igual(reconstruido.ubicacion, "Salón 204", "y la ubicación");
});

prueba("el perfil sobrevive para poder abrir la app sin señal", async () => {
  await local.olvidarTodo();
  igual(await local.leerMeta("perfil"), null, "arranca vacío");
  await local.guardarMeta("perfil", { id:"A", usuario:"mcolon", rol:"estudiante" });
  igual((await local.leerMeta("perfil")).usuario, "mcolon", "se recuerda quién entró");
  await local.olvidarTodo();
  igual(await local.leerMeta("perfil"), null, "y al salir no queda rastro en el equipo compartido");
});

/* ============ el tablero del día del instructor ============ */
const ESTUDIANTES = [
  { id:"e1", usuario:"lrivera", nombre:"Luis Rivera", grupo:"4-B" },
  { id:"e2", usuario:"mcolon",  nombre:"María Colón", grupo:"4-B" },
  { id:"e3", usuario:"psoto",   nombre:"Pedro Soto",  grupo:"4-B" },
  { id:"e4", usuario:"rvega",   nombre:"Rosa Vega",   grupo:"3-A" }
];
const hoja = (id, autor, sin, extra = {}) =>
  ({ id, autor_id: autor, estado:"borrador", veredicto:"", conteo:{ sin }, ...extra });

prueba("el que no empezó también sale, que es por quien se pregunta", async () => {
  const filas = taller.filasTaller(ESTUDIANTES, [hoja("h1","e1",0)]);
  igual(filas.length, 4, "una fila por estudiante, no por hoja");
  const soto = filas.find(f => f.estudiante.id === "e3");
  igual(soto.tipo, "sin", "Pedro Soto no empezó y aun así tiene fila");
  igual(soto.hojas, [], "sin hojas colgando");
});

prueba("las hojas se cuelgan del estudiante que las hizo", async () => {
  const filas = taller.filasTaller(ESTUDIANTES,
    [hoja("h1","e1",0), hoja("h2","e2",13), hoja("h3","e2",20)]);
  igual(filas.find(f => f.estudiante.id === "e1").hojas.map(h => h.id), ["h1"], "la de Rivera");
  igual(filas.find(f => f.estudiante.id === "e2").hojas.map(h => h.id).sort(), ["h2","h3"],
        "las dos de Colón, y ninguna ajena");
  igual(filas.find(f => f.estudiante.id === "e4").hojas, [], "Vega no tiene");
});

prueba("con varias hojas la fila no finge ser una sola", async () => {
  // el fallo que hubo: enseñar la última tocada escondía que ya había entregado otra
  const filas = taller.filasTaller(ESTUDIANTES, [
    hoja("vieja","e1",0,{ estado:"entregado", veredicto:"apto", actualizado_en:"2026-09-01T13:00:00Z" }),
    hoja("nueva","e1",4,{ actualizado_en:"2026-09-01T15:00:00Z" })
  ]);
  const r = filas.find(f => f.estudiante.id === "e1");
  igual(r.tipo, "varias", "la fila pasa a ser encabezado");
  igual(r.entregadas, 1, "y dice cuántas entregó");
  igual(r.hojas.map(h => h.id), ["nueva","vieja"], "las hojas van de más nueva a más vieja");
});

prueba("el resumen cuenta sobre los estudiantes, no sobre las hojas", async () => {
  const hojas = [hoja("h1","e1",0,{ estado:"entregado" }), hoja("h2","e1",4), hoja("h3","e2",13)];
  igual(taller.resumenTaller(ESTUDIANTES, hojas),
        { total:4, empezaron:2, entregaron:1 },
        "dos hojas de Rivera cuentan como un estudiante, no como dos");
  igual(taller.resumenTaller(ESTUDIANTES, hojas, "3-A"),
        { total:1, empezaron:0, entregaron:0 },
        "y filtrando por grupo se recalcula sobre ese grupo");
});

prueba("el filtro de grupo no se lleva a nadie por delante", async () => {
  igual(taller.filasTaller(ESTUDIANTES, [], "3-A").map(f => f.estudiante.usuario), ["rvega"],
        "solo los del grupo");
  igual(taller.filasTaller(ESTUDIANTES, [], "").length, 4, "sin filtro, todos");
  igual(taller.filasTaller(ESTUDIANTES, [], "no-existe").length, 0, "un grupo que no existe no inventa filas");
});

prueba("las filas salen en orden estable, para que no bailen al refrescarse", async () => {
  // el tablero se repinta solo cada 30 s: si el orden dependiera de la
  // actividad, las filas saltarían mientras el instructor las está mirando
  const a = taller.filasTaller(ESTUDIANTES, [hoja("h1","e3",0,{ actualizado_en:"2026-09-01T20:00:00Z" })]);
  const b = taller.filasTaller(ESTUDIANTES, [hoja("h1","e1",0,{ actualizado_en:"2026-09-01T21:00:00Z" })]);
  igual(a.map(f => f.estudiante.usuario), b.map(f => f.estudiante.usuario),
        "el orden no depende de quién tocó su hoja de último");
  igual(a.map(f => f.estudiante.nombre), ["Luis Rivera","María Colón","Pedro Soto","Rosa Vega"],
        "van por nombre, y María va después de Luis aunque lleve tilde");
});

prueba("el avance sale del conteo, y aguanta una hoja recién creada", async () => {
  igual(taller.avance({ conteo:{ sin:13 } }, 37), { hechos:24, total:37 }, "37 menos los 13 sin evaluar");
  igual(taller.avance({ conteo:{} }, 37),        { hechos:0,  total:37 }, "sin conteo, cero: no se inventa avance");
  igual(taller.avance(null, 37),                 { hechos:0,  total:37 }, "sin hoja tampoco");
  igual(taller.avance({ conteo:{ sin:0 } }, 37), { hechos:37, total:37 }, "completa");
  igual(taller.avance({ conteo:{ sin:99 } }, 37),{ hechos:0,  total:37 }, "un conteo imposible no da negativo");
});

prueba("se ve cuánto lleva quieta una hoja", async () => {
  const ahora = new Date("2026-09-01T15:00:00Z").getTime();
  const hace = min => taller.haceCuanto(new Date(ahora - min*60000).toISOString(), ahora);
  igual(hace(0), "ahora", "recién tocada");
  igual(hace(25), "hace 25 min", "el caso que importa: lleva rato parada");
  igual(hace(90), "hace 1 h", "más de una hora");
  igual(hace(60*30), "hace 1 d", "de otro día");
  igual(taller.haceCuanto(null), "", "sin fecha no se inventa nada");
});

/* ---------------------------------------------------------------- */
window.correr = async () => {
  const salida = [];
  for(const [nombre, fn] of pruebas){
    try { await fn(); salida.push({ ok:true, nombre }); }
    catch(err){ salida.push({ ok:false, nombre, error: err.message }); }
  }
  return salida;
};
window.listo = true;
