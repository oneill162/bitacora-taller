// Conduce Chromium por el protocolo de depuración. Sin dependencias.
import { spawn } from "node:child_process";

const dormir = ms => new Promise(r => setTimeout(r, ms));

export async function abrirNavegador(perfil){
  const cr = spawn("chromium", [
    "--headless=new", "--remote-debugging-port=9333", "--no-sandbox",
    "--disable-gpu", `--user-data-dir=${perfil}`, "about:blank"
  ], { stdio:"ignore" });

  let version = null;
  for(let i = 0; i < 60 && !version; i++){
    try { version = await (await fetch("http://127.0.0.1:9333/json/version")).json(); }
    catch(_){ await dormir(250); }
  }
  if(!version) throw new Error("Chromium no levantó");
  return { cr, version };
}

export function conectar(url){
  const ws = new WebSocket(url);
  let n = 0;
  const espera = new Map();
  const oyentes = [];
  const listo = new Promise(ok => ws.addEventListener("open", ok));
  ws.addEventListener("message", ev => {
    const m = JSON.parse(ev.data);
    if(m.id && espera.has(m.id)){
      const { ok, mal } = espera.get(m.id); espera.delete(m.id);
      m.error ? mal(new Error(JSON.stringify(m.error))) : ok(m.result);
    } else if(m.method) oyentes.forEach(f => f(m));
  });
  return {
    listo,
    al: f => oyentes.push(f),
    enviar: (method, params = {}, sessionId) => new Promise((ok, mal) => {
      const id = ++n;
      espera.set(id, { ok, mal });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    }),
    cerrar: () => ws.close()
  };
}
