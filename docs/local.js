// Guardado en el propio equipo del estudiante, para que el taller sin señal
// no cueste el trabajo del día.
//
// La regla: TODO se escribe primero aquí y de aquí sube a Supabase. Escribir
// en IndexedDB no depende de la red, así que guardar nunca falla; lo único
// que puede fallar es la subida, y eso se reintenta solo.
//
// Cada renglón lleva "_sucio: 1" mientras haya cambios que Supabase todavía
// no tiene. Sincronizar es recorrer lo sucio, empujarlo y apagar la marca.
// No hay bitácora de operaciones: como RLS garantiza que solo el autor edita
// su hoja, el último estado del equipo del estudiante es el bueno.

const NOMBRE_DB = "bitacora";
const VERSION_DB = 1;

// Las columnas que Supabase acepta. Todo lo demás (los "_campos" internos,
// los objetos anidados del select) se queda en el equipo del estudiante.
const COL_DIAG = ["id","autor_id","equipo_id","orden","fecha","usuario_equipo","sistema",
                  "estado","veredicto","conteo","acciones","hallazgos","proximo_paso","entregado_en"];
const COL_EQ   = ["serial","marca","modelo","tipo","inventario","ubicacion","creado_por"];
const COL_PTO  = ["diagnostico_id","clave","grupo","titulo","estado","nota"];

const soloColumnas = (fila, cols) => {
  const o = {};
  cols.forEach(c => { if(fila[c] !== undefined) o[c] = fila[c]; });
  return o;
};

export const nuevoId = () =>
  (crypto.randomUUID ? crypto.randomUUID()
   : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
       (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)));

/* ================= plomería de IndexedDB ================= */
let _db = null;

function abrirDB(){
  if(_db) return Promise.resolve(_db);
  return new Promise((ok, mal) => {
    const p = indexedDB.open(NOMBRE_DB, VERSION_DB);
    p.onupgradeneeded = () => {
      const db = p.result;
      if(!db.objectStoreNames.contains("diagnosticos")) db.createObjectStore("diagnosticos", { keyPath:"id" });
      if(!db.objectStoreNames.contains("puntos"))       db.createObjectStore("puntos", { keyPath:["diagnostico_id","clave"] });
      if(!db.objectStoreNames.contains("equipos"))      db.createObjectStore("equipos", { keyPath:"serial" });
      if(!db.objectStoreNames.contains("meta"))         db.createObjectStore("meta", { keyPath:"clave" });
    };
    p.onsuccess = () => { _db = p.result; ok(_db); };
    p.onerror   = () => mal(p.error);
  });
}

const pedir = req => new Promise((ok, mal) => {
  req.onsuccess = () => ok(req.result);
  req.onerror   = () => mal(req.error);
});

// Abre una transacción, corre `fn` con sus almacenes y espera a que cierre.
// `fn` debe lanzar sus peticiones sin esperar entre una y otra: una
// transacción de IndexedDB se cierra sola en cuanto el turno queda vacío.
async function conTx(nombres, modo, fn){
  const db = await abrirDB();
  const tx = db.transaction(nombres, modo);
  const almacenes = {};
  nombres.forEach(n => almacenes[n] = tx.objectStore(n));
  const resultado = fn(almacenes);
  await new Promise((ok, mal) => {
    tx.oncomplete = ok;
    tx.onerror    = () => mal(tx.error);
    tx.onabort    = () => mal(tx.error);
  });
  return resultado;
}

const leerTodo  = n => conTx([n], "readonly",  a => pedir(a[n].getAll())).then(p => p);
const leerUno   = (n, k) => conTx([n], "readonly", a => pedir(a[n].get(k)));

/* ================= memoria de sesión ================= */
// El perfil se guarda para que la app abra sin red: sin él no sabríamos ni
// el nombre del estudiante ni si es instructor.
export const guardarMeta = (clave, valor) =>
  conTx(["meta"], "readwrite", a => a.meta.put({ clave, valor }));

export const leerMeta = async clave => (await leerUno("meta", clave))?.valor ?? null;

export async function olvidarTodo(){
  await conTx(["diagnosticos","puntos","equipos","meta"], "readwrite", a => {
    a.diagnosticos.clear(); a.puntos.clear(); a.equipos.clear(); a.meta.clear();
  });
}

/* ================= lectura ================= */
export async function listaLocal(){
  const filas = (await leerTodo("diagnosticos")).filter(d => !d._borrado);
  return filas.sort((x, y) =>
    (y.fecha || "").localeCompare(x.fecha || "") ||
    (y.creado_en || "").localeCompare(x.creado_en || ""));
}

export const leerDiag = id => leerUno("diagnosticos", id);
export const leerEquipo = serial => leerUno("equipos", serial);

export async function leerPuntos(diagnostico_id){
  const todos = await leerTodo("puntos");
  const o = {};
  todos.filter(p => p.diagnostico_id === diagnostico_id)
       .forEach(p => o[p.clave] = { estado: p.estado || "", nota: p.nota || "" });
  return o;
}

export async function porSubir(){
  const [diags, ptos, eqs] = await Promise.all(
    ["diagnosticos","puntos","equipos"].map(leerTodo));
  const hojas = new Set();
  diags.filter(d => d._sucio || d._borrado).forEach(d => hojas.add(d.id));
  ptos.filter(p => p._sucio).forEach(p => hojas.add(p.diagnostico_id));
  return hojas.size + eqs.filter(e => e._sucio).length;
}

/* ================= escritura local ================= */
// Guarda la hoja completa tal como está en pantalla. Siempre queda sucia:
// la subida es el paso siguiente y puede o no ocurrir ahora.
export async function guardarTrabajo(diag, puntos, equipo, metaPuntos){
  const filasPto = Object.keys(puntos)
    .filter(k => puntos[k].estado || puntos[k].nota)
    .map(k => ({
      diagnostico_id: diag.id, clave: k,
      grupo:  metaPuntos[k]?.grupo  || "",
      titulo: metaPuntos[k]?.titulo || "",
      estado: puntos[k].estado || "", nota: puntos[k].nota || "",
      _sucio: 1
    }));

  await conTx(["diagnosticos","puntos","equipos"], "readwrite", a => {
    a.diagnosticos.put({ ...diag, _sucio: 1 });
    filasPto.forEach(f => a.puntos.put(f));
    if(equipo?.serial) a.equipos.put({ ...equipo, _sucio: 1 });
  });
}

export const guardarDiag = diag =>
  conTx(["diagnosticos"], "readwrite", a => a.diagnosticos.put({ ...diag, _sucio: 1 }));

// Borrar es marcar: la fila tiene que sobrevivir hasta poder avisarle al servidor.
export async function marcarBorrado(id){
  const d = await leerDiag(id);
  if(!d) return;
  await conTx(["diagnosticos"], "readwrite", a =>
    a.diagnosticos.put({ ...d, _borrado: 1, _sucio: 1 }));
}

/* ================= espejo de lo que manda el servidor ================= */
// Baja lo que hay en Supabase para poder verlo sin señal, pero nunca pisa
// una fila sucia: lo del equipo del estudiante es más nuevo que lo bajado.
export async function espejarLista(filas){
  const locales = await leerTodo("diagnosticos");
  const sucias = new Set(locales.filter(d => d._sucio || d._borrado).map(d => d.id));
  const previa = new Map(locales.map(d => [d.id, d]));
  const vivas = new Set(filas.map(f => f.id));
  await conTx(["diagnosticos"], "readwrite", a => {
    // el panel pide pocas columnas: se mezcla sobre lo que ya hubiera bajado
    // completo, para no dejar la hoja sin acciones ni hallazgos al abrirla sin señal
    filas.forEach(f => { if(!sucias.has(f.id)) a.diagnosticos.put({ ...(previa.get(f.id) || {}), ...f }); });
    // lo que ya no está en el servidor y aquí tampoco tiene cambios, sobra
    locales.forEach(d => { if(!vivas.has(d.id) && !sucias.has(d.id)) a.diagnosticos.delete(d.id); });
  });
}

export async function espejarDiag(diag, puntos, equipo){
  const local = await leerDiag(diag.id);
  if(local?._sucio || local?._borrado) return false;   // lo de aquí manda
  const filasPto = puntos.map(p => ({
    diagnostico_id: diag.id, clave: p.clave,
    grupo: p.grupo || "", titulo: p.titulo || "",
    estado: p.estado || "", nota: p.nota || "", _sucio: 0
  }));
  await conTx(["diagnosticos","puntos","equipos"], "readwrite", a => {
    a.diagnosticos.put({ ...diag, _sucio: 0 });
    filasPto.forEach(f => a.puntos.put(f));
    if(equipo?.serial) a.equipos.put({ ...equipo, _sucio: 0 });
  });
  return true;
}

/* ================= subida ================= */
// Con el wifi conectado y sin salida, una consulta a Supabase no falla: se
// queda esperando y la librería reintenta sola sin rendirse nunca. Sin corte,
// sincronizar dejaría colgado al que la llamó. Devuelve un error con la misma
// forma que Supabase para que el resto del código no cambie.
const CORTE = 10000;
const conCorte = consulta => Promise.race([
  consulta,
  new Promise(ok => setTimeout(
    () => ok({ data:null, error:{ message:"Failed to fetch: Supabase no contestó a tiempo." } }), CORTE))
]);

// Devuelve { subio, pendientes, error, hablo }. No lanza: quien la llama solo
// quiere saber si pudo o no, para pintarlo en pantalla. `hablo` dice si de
// verdad se habló con Supabase: sin eso, "no hubo error" no prueba nada —
// también es lo que pasa cuando no había nada que subir.
//
// `intentar` es lo que la app cree de la conexión. Cuando ya sabe que Supabase
// no contesta vale más no intentarlo: cada llamada tarda el corte entero en
// morirse, y el autoguardado dispara una por tecleo.
export async function sincronizar(sb, intentar = navigator.onLine){
  if(!intentar) return { subio:false, pendientes: await porSubir(), error:null, hablo:false };

  let hablo = false;
  try{
    // 1) equipos primero: el diagnóstico necesita su id de verdad.
    //    Se suben sin id para que Supabase conserve el del serial ya conocido.
    const eqSucios = (await leerTodo("equipos")).filter(e => e._sucio);
    for(const eq of eqSucios){
      hablo = true;
      const { data, error } = await conCorte(sb.from("equipos")
        .upsert(soloColumnas(eq, COL_EQ), { onConflict: "serial" }).select().single());
      if(error) throw error;
      await conTx(["equipos"], "readwrite", a => a.equipos.put({ ...data, _sucio: 0 }));
    }

    const diags = await leerTodo("diagnosticos");

    // 2) las hojas borradas sin señal
    for(const d of diags.filter(x => x._borrado)){
      hablo = true;
      const { error } = await conCorte(sb.from("diagnosticos").delete().eq("id", d.id));
      if(error) throw error;
      await conTx(["diagnosticos","puntos"], "readwrite", a => {
        a.diagnosticos.delete(d.id);
        a.puntos.getAllKeys().onsuccess = ev =>
          ev.target.result.filter(k => k[0] === d.id).forEach(k => a.puntos.delete(k));
      });
    }

    // 3) las hojas con cambios. upsert y no update: si la fila nunca llegó a
    //    Supabase (se creó sin señal) hay que insertarla, y si ya está hay
    //    que actualizarla. Las dos políticas de RLS piden autor_id = auth.uid().
    const sucios = diags.filter(d => d._sucio && !d._borrado);
    for(const d of sucios){
      const fila = soloColumnas(d, COL_DIAG);
      if(d._serial){
        const eq = await leerEquipo(d._serial);
        if(eq?.id) fila.equipo_id = eq.id;
      }
      hablo = true;
      const { error } = await conCorte(sb.from("diagnosticos").upsert(fila));
      if(error) throw error;
      await conTx(["diagnosticos"], "readwrite", a =>
        a.diagnosticos.put({ ...d, equipo_id: fila.equipo_id ?? d.equipo_id ?? null, _sucio: 0 }));
    }

    // 4) los puntos, ya con la hoja existiendo del otro lado
    const ptoSucios = (await leerTodo("puntos")).filter(p => p._sucio);
    if(ptoSucios.length){
      hablo = true;
      const { error } = await conCorte(sb.from("puntos")
        .upsert(ptoSucios.map(p => soloColumnas(p, COL_PTO)), { onConflict: "diagnostico_id,clave" }));
      if(error) throw error;
      await conTx(["puntos"], "readwrite", a =>
        ptoSucios.forEach(p => a.puntos.put({ ...p, _sucio: 0 })));
    }

    return { subio:true, pendientes: await porSubir(), error:null, hablo };
  } catch(err){
    return { subio:false, pendientes: await porSubir(), error: err, hablo };
  }
}
