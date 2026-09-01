import * as local from "./local.js";
import * as taller from "./taller.js";
import * as inf from "./informes.js";

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

/* ============ informes, inventario y duplicados ============ */
const EQ = [
  { id:"q1", serial:"ABC1234",  marca:"Dell", modelo:"3080", inventario:"INV-01", ubicacion:"Salón 204" },
  { id:"q2", serial:"abc-1234", marca:"Dell", modelo:"3080", inventario:"",       ubicacion:"Salón 204" },
  { id:"q3", serial:"XYZ9",     marca:"HP",   modelo:"400",  inventario:"INV-01", ubicacion:"Salón 110" },
  { id:"q4", serial:"KKK7",     marca:"HP",   modelo:"400",  inventario:"INV-09", ubicacion:"" }
];
const GENTE = [
  { id:"e1", usuario:"lrivera",    nombre:"Luis Rivera", grupo:"4-B" },
  { id:"e2", usuario:"luis.rivera",nombre:"Luis  Rivera",grupo:"4-B" },
  { id:"e3", usuario:"mcolon",     nombre:"María Colón", grupo:"4-B" },
  { id:"e4", usuario:"rvega",      nombre:"Rosa Vega",   grupo:"3-A" }
];
const D = (id, autor, equipo, fecha, estado, conteo, extra = {}) =>
  ({ id, autor_id:autor, equipo_id:equipo, fecha, estado, veredicto:"", conteo,
     orden:"DX-"+id, sistema:"Win 11", hallazgos:"algo", ...extra });
const HOJAS = [
  D("h1","e1","q1","2026-09-01","entregado",{ok:37,obs:0,falla:0,na:0,sin:0},{veredicto:"apto"}),
  D("h2","e1","q3","2026-09-01","borrador", {ok:10,obs:0,falla:2,na:0,sin:25}),
  D("h3","e3","q1","2026-09-01","entregado",{ok:30,obs:2,falla:5,na:0,sin:0},{veredicto:"no"}),
  D("h4","e2","q4","2026-08-30","entregado",{ok:20,obs:0,falla:0,na:0,sin:17},{veredicto:"apto"})
];

prueba("el informe por estudiante no deja fuera al que no trabajó", async () => {
  const f = inf.porEstudiante(GENTE, HOJAS, 37, {});
  igual(f.length, 4, "los cuatro salen, trabajen o no");
  const vega = f.find(x => x.usuario === "rvega");
  igual([vega.hojas, vega.entregadas, vega.puntos], [0,0,0], "Rosa Vega en cero, pero presente");
  const rivera = f.find(x => x.usuario === "lrivera");
  igual([rivera.hojas, rivera.entregadas, rivera.borradores], [2,1,1], "Rivera: dos hojas, una entregada");
  igual(rivera.puntos, 37 + 12, "los puntos evaluados se suman entre sus hojas");
  igual(rivera.fallas, 2, "y las fallas que halló");
  igual(f[0].hojas >= f[f.length-1].hojas, true, "ordenado de más trabajo a menos");
});

prueba("el informe por grupo cuenta quién trabajó de cuántos", async () => {
  const g = inf.porGrupo(GENTE, HOJAS, 37);
  const b4 = g.find(x => x.grupo === "4-B");
  igual([b4.estudiantes, b4.activos], [3,3], "los 3 del grupo tienen trabajo");
  igual(b4.hojas, 4, "las cuatro hojas del grupo");
  igual(b4.entregadas, 3, "tres entregadas; la de Rivera sigue en borrador");
  igual(b4.noAptos, 1, "una entrega salió no apta");
  const a3 = g.find(x => x.grupo === "3-A");
  igual([a3.estudiantes, a3.activos, a3.hojas], [1,0,0], "el grupo sin trabajo también sale");
});

prueba("el informe por salón va por dónde está la máquina", async () => {
  const s = inf.porSalon(EQ, HOJAS, 37);
  const s204 = s.find(x => x.salon === "Salón 204");
  igual(s204.equipos, 2, "dos máquinas en el 204");
  igual(s204.diagnosticados, 1, "solo una ha sido revisada");
  igual(s204.noAptos, 1, "y su última entrega la dejó no apta");
  const sinUb = s.find(x => x.salon === "Sin ubicación");
  igual(sinUb.equipos, 1, "los equipos sin salón no se pierden, se agrupan aparte");
});

prueba("el veredicto del salón es el de la última entrega, no el de cualquiera", async () => {
  const hojas = [
    D("v1","e1","q1","2026-08-01","entregado",{sin:0},{veredicto:"no"}),
    D("v2","e1","q1","2026-09-01","entregado",{sin:0},{veredicto:"apto"}),
    D("v3","e1","q1","2026-09-02","borrador", {sin:20})
  ];
  const s = inf.porSalon([EQ[0]], hojas, 37).find(x => x.salon === "Salón 204");
  igual([s.equiposAptos, s.equiposNoAptos], [1,0],
        "vale la del 1 de septiembre, ya arreglada; el borrador no cuenta");
  igual(s.noAptos, 1, "y el conteo de HOJAS no aptas es otra cosa, con su propio nombre");
});

prueba("el inventario se arma solo con lo que escribieron los estudiantes", async () => {
  const inv = inf.inventario(EQ, HOJAS, Object.fromEntries(GENTE.map(g => [g.id, g])));
  igual(inv.length, 4, "una fila por equipo conocido");
  const abc = inv.find(x => x.serial === "ABC1234");
  igual(abc.revisiones, 2, "cuenta sus revisiones");
  igual(abc.ultimoTecnico, "Luis Rivera", "con quién lo revisó de último");
  igual(inv.find(x => x.serial === "KKK7").ubicacion, "Sin ubicación", "sin salón no queda en blanco");
});

prueba("con dos hojas el mismo día, el último veredicto se desempata por la hora", async () => {
  // este es justo el caso que la pestaña Revisar marca como duplicado: sin
  // desempate, el veredicto del inventario salía a suertes
  const gente = Object.fromEntries(GENTE.map(g => [g.id, g]));
  const mismas = [
    D("m1","e1","q1","2026-09-01","entregado",{sin:0},{veredicto:"apto", actualizado_en:"2026-09-01T13:00:00Z"}),
    D("m2","e3","q1","2026-09-01","entregado",{sin:0},{veredicto:"no",   actualizado_en:"2026-09-01T16:00:00Z"})
  ];
  igual(inf.inventario([EQ[0]], mismas, gente)[0].ultimoVeredicto, "no", "manda la de las 16:00");
  igual(inf.inventario([EQ[0]], mismas.slice().reverse(), gente)[0].ultimoVeredicto, "no",
        "y no depende del orden en que lleguen de la base");
});

prueba("detecta la misma máquina con el serial escrito distinto", async () => {
  const d = inf.duplicados(EQ, HOJAS, GENTE, {});
  igual(d.serial.length, 1, "un solo caso");
  igual(d.serial[0].equipos.map(e => e.serial).sort(), ["ABC1234","abc-1234"], "los dos seriales");
  igual(d.serial[0].clave, "ABC1234", "comparados sin guiones ni mayúsculas");
});

prueba("al unificar se queda el registro que menos se pierde", async () => {
  const lleno  = { serial:"ABC1234",  inventario:"INV-1", marca:"Dell", modelo:"3080", tipo:"Torre", ubicacion:"204" };
  const pobre  = { serial:"abc-1234", inventario:"",      marca:"Dell", modelo:"3080", tipo:"Torre", ubicacion:"204" };
  const vacio  = { serial:"ABC 1234", inventario:"",      marca:"",     modelo:"",     tipo:"",      ubicacion:"" };

  igual(inf.elegirSuperviviente([pobre, lleno], [5, 0]), 0, "primero manda el historial: menos hojas que mover");
  igual(inf.elegirSuperviviente([pobre, lleno], [1, 1]), 1,
        "a igualdad, el que tiene número de inventario: borrarlo perdería ese dato");
  igual(inf.elegirSuperviviente([vacio, pobre, lleno], [0, 0, 0]), 2, "el más completo de los tres");
  igual(inf.elegirSuperviviente([{serial:"A-1", marca:"X"}, {serial:"A1", marca:"X"}], [0, 0]), 1,
        "a igualdad de todo, el serial escrito en limpio y no el que lleva guion");
});

prueba("detecta números de inventario repetidos en máquinas distintas", async () => {
  const d = inf.duplicados(EQ, HOJAS, GENTE, {});
  igual(d.inventario.length, 1, "un caso");
  igual(d.inventario[0].equipos.map(e => e.serial).sort(), ["ABC1234","XYZ9"], "dos máquinas, un número");
  cierto(!d.inventario.some(g => g.clave === ""), "los equipos sin número de inventario no cuentan como repetidos");
});

prueba("detecta el mismo equipo revisado dos veces el mismo día", async () => {
  const d = inf.duplicados(EQ, HOJAS, GENTE, Object.fromEntries(GENTE.map(g => [g.id, g])));
  igual(d.hojas.length, 1, "un caso");
  igual(d.hojas[0].equipo_id, "q1", "el equipo repetido");
  igual(d.hojas[0].fecha, "2026-09-01", "ese día");
  igual(d.hojas[0].autores.sort(), ["Luis Rivera","María Colón"], "y quiénes lo hicieron sin saberlo");
});

prueba("detecta a la misma persona con dos cuentas", async () => {
  const d = inf.duplicados(EQ, HOJAS, GENTE, {});
  igual(d.estudiantes.length, 1, "un caso");
  igual(d.estudiantes[0].estudiantes.map(e => e.usuario).sort(), ["lrivera","luis.rivera"],
        "las dos cuentas de Luis Rivera, aunque una lleve doble espacio");
  cierto(!d.estudiantes.some(g => g.estudiantes.some(e => e.usuario === "mcolon")),
         "y no confunde a María Colón con nadie");
});

prueba("sin duplicados no inventa ninguno", async () => {
  const limpio = [{ id:"z1", serial:"AAA1", inventario:"I1" }, { id:"z2", serial:"BBB2", inventario:"I2" }];
  const d = inf.duplicados(limpio, [], [GENTE[2], GENTE[3]], {});
  igual(inf.hayDuplicados(d), 0, "nada que revisar");
});

prueba("dice qué le falta a una hoja, empezando por lo que más duele", async () => {
  const falta = inf.faltantes({ conteo:{sin:5}, sistema:"", hallazgos:"", orden:"" },
                              { serial:"", marca:"", modelo:"" }, 37);
  igual(falta[0], "el serial del equipo", "el serial primero: sin él la hoja no entra al inventario");
  cierto(falta.includes("5 puntos sin evaluar"), "y cuántos puntos quedan");
  cierto(falta.includes("marca o modelo"), "y los datos del equipo");
  igual(inf.faltantes({ conteo:{sin:0}, sistema:"Win 11", hallazgos:"ok", orden:"DX-1" },
                      { serial:"A1", marca:"Dell", modelo:"X" }, 37), [],
        "una hoja completa no tiene nada que reclamar");
  igual(inf.faltantes({ conteo:{} }, null, 37).includes("37 puntos sin evaluar"), true,
        "una hoja recién creada está entera por hacer");
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
