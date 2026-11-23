// Prueba de la API contra la especificación del profesor.
// Juega partidas completas y revisa validaciones, permisos y fases.

export async function ejecutar(B) {
  let ok = 0, malos = [];
async function req(m, p, { body, tok, headers = {}, raw } = {}) {
  const h = { ...headers };
  if (tok) h.Authorization = "Bearer " + tok;
  let b;
  if (raw !== undefined) b = raw;
  else if (body !== undefined) { b = JSON.stringify(body); h["Content-Type"] ??= "application/json"; }
  let r; try { r = await fetch(B + p, { method: m, headers: h, body: b }); } catch (x) { return { s: "ERROR-RED:" + (x.cause?.code || x.message), j: null, h: new Headers() }; }
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { s: r.status, j, h: r.headers };
}
function esperar(nombre, real, esperado, extra = "") {
  if (real === esperado) ok++;
  else malos.push(`${nombre}: esperado ${esperado}, obtuvo ${real} ${extra}`);
}
const e = r => JSON.stringify(r.j);

// salud y CORS
let r = await req("HEAD", "/api/salud"); esperar("HEAD salud", r.s, 200);
esperar("CORS en salud", r.h.get("access-control-allow-origin"), "*");
r = await req("OPTIONS", "/api/partidas"); esperar("OPTIONS", r.s, 204);
r = await req("HEAD", "/api/salud?x=1"); esperar("salud con query", r.s, 409);

// crear: validaciones
r = await req("POST", "/api/partidas", { body: { nombre: "Ana", admin: true } }); esperar("campo desconocido", r.s, 409, e(r));
r = await req("POST", "/api/partidas", { body: {} }); esperar("sin nombre (obligatorio)", r.s, 409, e(r));
r = await req("POST", "/api/partidas", { body: { nombre: 123 } }); esperar("nombre tipo incorrecto", r.s, 409, e(r));
r = await req("POST", "/api/partidas", { body: { nombre: "   " } }); esperar("nombre vacío", r.s, 400, e(r));
r = await req("POST", "/api/partidas", { body: { nombre: "x".repeat(25) } }); esperar("nombre largo", r.s, 400, e(r));
r = await req("POST", "/api/partidas", { body: { nombre: "A\u0007b" } }); esperar("nombre con carácter de control", r.s, 400, e(r));
r = await req("POST", "/api/partidas", { body: { nombre: "Ana", puntos_para_ganar: 21 } }); esperar("puntos 21 (máx 20)", r.s, 400, e(r));
r = await req("POST", "/api/partidas", { body: { nombre: "Ana", puntos_para_ganar: null } }); esperar("puntos null (default 5)", r.s, 201, e(r));
if (r.s===201) esperar("puntos null => 5", r.j.partida.puntos_para_ganar, 5);
r = await req("POST", "/api/partidas", { raw: "{nope", headers: { "Content-Type": "application/json" } }); esperar("JSON inválido", r.s, 409, e(r));
r = await req("POST", "/api/partidas", { raw: '{"nombre":"A","nombre":"B"}', headers: { "Content-Type": "application/json" } }); esperar("campo repetido", r.s, 409, e(r));
r = await req("POST", "/api/partidas", { raw: "[]", headers: { "Content-Type": "application/json" } }); esperar("cuerpo no objeto", r.s, 409, e(r));
r = await req("POST", "/api/partidas", { raw: '{"nombre":"Ana"}', headers: { "Content-Type": "text/plain" } }); esperar("Content-Type incorrecto", r.s, 409, e(r));
r = await req("POST", "/api/partidas", { raw: '{"nombre":"Ana"}' }); esperar("sin Content-Type", r.s, 409, e(r));
r = await req("POST", "/api/partidas", { body: { nombre: "Ana" }, headers: { "X-HTTP-Method-Override": "DELETE" } }); esperar("X-HTTP-Method-Override", r.s, 409, e(r));
r = await req("POST", "/api/partidas", { body: { nombre: "Ana" }, tok: "a".repeat(64) }); esperar("token en ruta pública", r.s, 409, e(r));
r = await req("POST", "/api/partidas", { raw: JSON.stringify({ nombre: "x".repeat(5000) }), headers: { "Content-Type": "application/json" } }); esperar("cuerpo > 4KB", r.s, 413, e(r));
r = await req("POST", "/api/partidas", { body: { nombre: "Ana" }, headers: { "Content-Type": "application/json; charset=utf-8" } }); esperar("charset=utf-8 aceptado", r.s, 201, e(r));

// partida principal
r = await req("POST", "/api/partidas", { body: { nombre: "<script>alert(1)</b>", puntos_para_ganar: 2 } });
esperar("crear partida", r.s, 201, e(r));
if (r.s !== 201) { console.log("CREAR FALLÓ", r.s, e(r)); r = await req("POST", "/api/partidas", { body: { nombre: "<script>alert(1)</b>", puntos_para_ganar: 2 } }); console.log("reintento", r.s); }
const ID = r.j.partida_id; const host = { id: r.j.jugador_id, t: r.j.token };
esperar("ronda null en sala", r.j.partida.ronda, null);
esperar("token 64 hex", /^[0-9a-f]{64}$/.test(host.t), true);
esperar("id 32 hex", /^[0-9a-f]{32}$/.test(ID), true);
const js = [host];
r = await req("POST", `/api/partidas/${ID}/iniciar`, { tok: host.t }); esperar("iniciar con 1 jugador", r.s, 409, e(r));
for (const n of ["Beto", "Caro", "Dani"]) {
  r = await req("POST", `/api/partidas/${ID}/jugadores`, { body: { nombre: n } }); esperar("unirse " + n, r.s, 201);
  js.push({ id: r.j.jugador_id, t: r.j.token, n });
}
r = await req("POST", `/api/partidas/${ID}/jugadores`, { body: { nombre: "beto" } }); esperar("nombre repetido (mayúsc.)", r.s, 409, e(r));
r = await req("POST", `/api/partidas/${ID}/jugadores`, { body: { nombre: "Eva" }, tok: host.t }); esperar("unirse con token", r.s, 409, e(r));

// tokens
r = await req("GET", `/api/partidas/${ID}`); esperar("GET público", r.s, 200); esperar("yo null público", r.j?.yo, null);
r = await req("GET", `/api/partidas/${ID}`, { tok: "b".repeat(64) }); esperar("token ajeno", r.s, 401, e(r));
r = await req("GET", `/api/partidas/${ID}`, { tok: host.t.toUpperCase() }); esperar("token en mayúsculas", r.s, 409, e(r));
r = await req("GET", `/api/partidas/${ID}`, { tok: "abc" }); esperar("token mal formado", r.s, 409, e(r));
r = await req("GET", `/api/partidas/${ID}`, { raw: "{}", headers: { "Content-Type": "application/json" } }).catch(x => ({ s: "fetch-no-permite" }));
r = await req("GET", `/api/partidas/${ID}`, { headers: { "Content-Type": "application/json" } }); esperar("GET con Content-Type", r.s, 409, e(r));
r = await req("GET", `/api/partidas/${"0".repeat(32)}`); esperar("partida inexistente", r.s, 404);
r = await req("GET", `/api/otra`); esperar("ruta inexistente", r.s, 404);
r = await req("POST", `/api/partidas/${ID}/iniciar`, { tok: js[1].t }); esperar("iniciar no anfitrión", r.s, 403, e(r));
r = await req("POST", `/api/partidas/${ID}/iniciar`, { tok: host.t, body: { x: 1 } }); esperar("iniciar con campo", r.s, 409, e(r));
r = await req("POST", `/api/partidas/${ID}/iniciar`); esperar("iniciar sin token", r.s, 401, e(r));
r = await req("POST", `/api/partidas/${ID}/iniciar`, { tok: host.t }); esperar("iniciar", r.s, 200, e(r));
esperar("fase respuestas", r.j.fase, "respuestas"); esperar("mano 7", r.j.yo.mano.length, 7);
r = await req("POST", `/api/partidas/${ID}/jugadores`, { body: { nombre: "Tarde" } }); esperar("unirse tras iniciar", r.s, 409, e(r));
r = await req("DELETE", `/api/partidas/${ID}`, { tok: host.t }); esperar("borrar no terminada", r.s, 409, e(r));

const tokDe = id => js.find(j => j.id === id).t;
async function ronda(numR, usarAvanzar) {
  let v = (await req("GET", `/api/partidas/${ID}`, { tok: host.t })).j;
  const sob = v.ronda.soberano_id; const k = v.ronda.carta_negra.elegir;
  const otros = js.filter(j => j.id !== sob);
  // soberano intenta responder
  const vs = (await req("GET", `/api/partidas/${ID}`, { tok: tokDe(sob) })).j;
  r = await req("PUT", `/api/partidas/${ID}/respuestas`, { tok: tokDe(sob), body: { cartas: vs.yo.mano.slice(0, k).map(c => c.id) } }); esperar("soberano responde", r.s, 403, e(r));
  const responden = usarAvanzar ? otros.slice(0, 2) : otros;
  for (const j of responden) {
    const mio = (await req("GET", `/api/partidas/${ID}`, { tok: j.t })).j;
    r = await req("PUT", `/api/partidas/${ID}/respuestas`, { tok: j.t, body: { cartas: mio.yo.mano.slice(0, k + 1).map(c => c.id) } }); esperar("cantidad incorrecta", r.s, 400, e(r));
    r = await req("PUT", `/api/partidas/${ID}/respuestas`, { tok: j.t, body: { cartas: "x" } }); esperar("cartas tipo incorrecto", r.s, 409, e(r));
    r = await req("PUT", `/api/partidas/${ID}/respuestas`, { tok: j.t, body: { cartas: Array(k).fill(9999) } }); esperar("carta fuera de la mano", r.s, 400, e(r));
    r = await req("PUT", `/api/partidas/${ID}/respuestas`, { tok: j.t, body: { cartas: mio.yo.mano.slice(0, k).map(c => c.id) } }); esperar("responder", r.s, 200, e(r));
    esperar("respuestas ocultas en fase respuestas", r.j.fase === "respuestas" ? r.j.ronda.respuestas.length : 0, 0);
    r = await req("PUT", `/api/partidas/${ID}/respuestas`, { tok: j.t, body: { cartas: mio.yo.mano.slice(k, 2*k).map(c => c.id) } }); esperar("responder dos veces", r.s, 409, e(r));
  }
  if (usarAvanzar) { r = await req("POST", `/api/partidas/${ID}/avanzar`, { tok: tokDe(sob) }); esperar("avanzar a votación", r.s, 200, e(r)); }
  if (!usarAvanzar) r = await req("GET", `/api/partidas/${ID}`, { tok: otros[0].t });
  v = r.j; esperar("fase votacion", v.fase, "votacion");
  esperar("votos ocultos en votación", v.ronda.respuestas.every(x => x.votos == null), true);
  esperar("autores ocultos en votación", v.ronda.respuestas.every(x => x.autor_id == null), true);
  const rid = v.ronda.respuestas[0].id;
  r = await req("PUT", `/api/partidas/${ID}/votos`, { tok: tokDe(sob), body: { respuesta_id: rid } }); esperar("soberano vota", r.s, 403, e(r));
  r = await req("PUT", `/api/partidas/${ID}/votos`, { tok: otros[0].t, body: { respuesta_id: "ffffffffffff" } }); esperar("voto a respuesta inexistente", r.s, 404, e(r));
  r = await req("PUT", `/api/partidas/${ID}/votos`, { tok: otros[0].t, body: { respuesta_id: 5 } }); esperar("respuesta_id tipo", r.s, 409, e(r));
  if (usarAvanzar) {
    r = await req("PUT", `/api/partidas/${ID}/votos`, { tok: otros[0].t, body: { respuesta_id: rid } }); esperar("votar", r.s, 200, e(r));
    r = await req("PUT", `/api/partidas/${ID}/votos`, { tok: otros[0].t, body: { respuesta_id: rid } }); esperar("voto duplicado", r.s, 409, e(r));
    const noSob = js.find(j => j.id === host.id && j.id !== sob);
    if (noSob) { r = await req("POST", `/api/partidas/${ID}/avanzar`, { tok: host.t }); esperar("anfitrión cierra votación incompleta (spec: permitido)", r.s, 200, e(r)); }
    if (r.s !== 200 || r.j.fase !== "decision") { r = await req("POST", `/api/partidas/${ID}/avanzar`, { tok: tokDe(sob) }); }
  } else {
    for (const j of otros) { r = await req("PUT", `/api/partidas/${ID}/votos`, { tok: j.t, body: { respuesta_id: rid } }); esperar("votar", r.s, 200, e(r)); }
  }
  r = await req("GET", `/api/partidas/${ID}`, { tok: otros[0].t });
  v = r.j; esperar("fase decision", v.fase, "decision");
  esperar("votos visibles en decision", v.ronda.respuestas.every(x => Number.isInteger(x.votos)), true);
  esperar("favoritas en decision", v.ronda.favoritas_del_pueblo.length > 0, true);
  r = await req("POST", `/api/partidas/${ID}/avanzar`, { tok: tokDe(sob) }); esperar("avanzar en decision", r.s, 409, e(r));
  r = await req("POST", `/api/partidas/${ID}/decision`, { tok: otros[0].t, body: { respuesta_id: rid } }); esperar("decide no soberano", r.s, 403, e(r));
  const elegida = v.ronda.respuestas[v.ronda.respuestas.length - 1].id;
  r = await req("POST", `/api/partidas/${ID}/decision`, { tok: tokDe(sob), body: { respuesta_id: elegida } }); esperar("decisión", r.s, 200, e(r));
  v = r.j;
  esperar("autores visibles en resultado", v.ronda.respuestas.every(x => /^[0-9a-f]{16}$/.test(x.autor_id)), true);
  esperar("historial crece", v.historial.length, numR);
  console.log(`ronda ${numR}: soberano=${js.find(j=>j.id===sob).n||"host"} fase=${v.fase} frase="${v.historial.at(-1).frase}" respeto=${v.historial.at(-1).respeto_al_pueblo}`);
  return v;
}
let v = await ronda(1, false);
const soberanos = [v.ronda.soberano_id];
let n = 1;
while (v.fase !== "terminada" && n < 12) {
  r = await req("POST", `/api/partidas/${ID}/avanzar`, { tok: host.t }); esperar("avanzar a nueva ronda", r.s, 200, e(r));
  esperar("mano rellenada a 7", r.j.yo.mano.length, 7);
  soberanos.push(r.j.ronda.soberano_id);
  n++; v = await ronda(n, n % 2 === 0);
}
esperar("partida terminada", v.fase, "terminada");
esperar("ganador_id", typeof v.ganador_id, "string");
console.log("soberanos rotan:", soberanos.map(s => js.find(j=>j.id===s).n || "host").join(" → "));
r = await req("POST", `/api/partidas/${ID}/avanzar`, { tok: host.t }); esperar("avanzar terminada", r.s, 409);
r = await req("DELETE", `/api/partidas/${ID}`, { tok: js[1].t }); esperar("borrar no anfitrión", r.s, 403);
r = await req("DELETE", `/api/partidas/${ID}`, { tok: host.t, body: {} }); esperar("DELETE con cuerpo", r.s, 409, e(r));
r = await req("DELETE", `/api/partidas/${ID}`, { tok: host.t }); esperar("borrar", r.s, 204);
r = await req("GET", `/api/partidas/${ID}`); esperar("borrada => 404", r.s, 404);
r = await req("GET", `/api/partidas`); esperar("GET /api/partidas (no existe en la API del profe)", r.s, 404, "(devuelve lista)");


// --- Pruebas adicionales ---
{
  // Partida donde nadie vota: respeto_al_pueblo debe ser true.
  let c = await req("POST", "/api/partidas", { body: { nombre: "Ana", puntos_para_ganar: 1 } });
  const id2 = c.j.partida_id; const gente = [{ id: c.j.jugador_id, t: c.j.token }];
  for (const n of ["Beto", "Caro", "Dani"]) { c = await req("POST", `/api/partidas/${id2}/jugadores`, { body: { nombre: n } }); gente.push({ id: c.j.jugador_id, t: c.j.token }); }
  await req("POST", `/api/partidas/${id2}/iniciar`, { tok: gente[0].t, body: {} });
  let v2 = (await req("GET", `/api/partidas/${id2}`, { tok: gente[0].t })).j;
  const manos = [];
  for (const g of gente) manos.push(...(await req("GET", `/api/partidas/${id2}`, { tok: g.t })).j.yo.mano.map(x => x.id));
  esperar("ninguna carta blanca repetida entre manos", new Set(manos).size, manos.length);
  const sob2 = v2.ronda.soberano_id; const k2 = v2.ronda.carta_negra.elegir;
  const orden = [];
  for (const g of gente.filter(g => g.id !== sob2)) {
    const m = (await req("GET", `/api/partidas/${id2}`, { tok: g.t })).j;
    c = await req("PUT", `/api/partidas/${id2}/respuestas`, { tok: g.t, body: { cartas: m.yo.mano.slice(0, k2).map(x => x.id) } });
  }
  v2 = c.j;
  esperar("votos ausentes (no null) en votación", v2.ronda.respuestas.some(x => "votos" in x || "autor_id" in x), false);
  esperar("frase sin doble punto ni mayúscula a media frase", v2.ronda.respuestas.every(x => !/\.\.|[a-z,:] U(n|na) /.test(x.frase)), true);
  c = await req("POST", `/api/partidas/${id2}/avanzar`, { tok: gente[0].t, body: {} }); // anfitrión cierra sin votos
  esperar("anfitrión cierra votación sin votos", c.j?.fase, "decision", e(c));
  esperar("favoritas vacías si nadie votó", c.j?.ronda.favoritas_del_pueblo.length, 0);
  c = await req("POST", `/api/partidas/${id2}/decision`, { tok: gente.find(g => g.id === sob2).t, body: { respuesta_id: c.j.ronda.respuestas[0].id } });
  esperar("respeto_al_pueblo true si nadie votó", c.j?.historial[0].respeto_al_pueblo, true, e(c));
  esperar("terminada a 1 punto", c.j?.fase, "terminada");

  // Cabeceras.
  const rr = await fetch(B + "/api/partidas", { method: "POST", headers: [["Content-Type", "application/json"], ["Authorization", "Bearer " + "a".repeat(64)], ["Authorization", "Bearer " + "b".repeat(64)]], body: '{"nombre":"Z"}' });
  esperar("Authorization repetida", rr.status, 409);
  c = await req("POST", "/api/partidas", { body: { nombre: "Ana" }, headers: { "X-HTTP-Method": "PUT" } }); esperar("X-HTTP-Method", c.s, 409);
  c = await req("POST", "/api/partidas", { body: { nombre: "Ana" }, headers: { "X-Method-Override": "PUT" } }); esperar("X-Method-Override", c.s, 409);
  c = await req("POST", "/api/partidas", { body: { nombre: "Ana", puntos_para_ganar: "5" } }); esperar("puntos como texto", c.s, 409);
  c = await req("POST", "/api/partidas", { body: { nombre: "Ana", puntos_para_ganar: 0 } }); esperar("puntos 0", c.s, 400);
  c = await req("POST", "/api/partidas", { body: { nombre: "Ana", puntos_para_ganar: 20 } }); esperar("puntos 20", c.s, 201);
  c = await req("POST", "/api/partidas", { raw: '{"nombre":"Ana","x":{"a":1,"a":2}}', headers: { "Content-Type": "application/json" } }); esperar("campo desconocido con objeto", c.s, 409);
  c = await req("POST", "/api/partidas", { body: { nombre: "  Ana  " } }); esperar("nombre recortado", c.j?.partida?.jugadores[0].nombre, "Ana");
  c = await req("HEAD", "/api/salud", { tok: "a".repeat(64) }); esperar("salud con token", c.s, 409);
  c = await req("OPTIONS", "/api/partidas/x/votos"); esperar("OPTIONS permite métodos", c.h.get("access-control-allow-methods"), "GET, HEAD, POST, PUT, DELETE");
  esperar("OPTIONS permite cabeceras", c.h.get("access-control-allow-headers"), "Authorization, Content-Type");
  c = await req("GET", "/api/partidas/" + "0".repeat(32), {}); esperar("CORS en errores", c.h.get("access-control-allow-origin"), "*");
}

  return { ok, malos };
}

// Uso directo: node pruebas/prueba-api.mjs http://localhost:3000
if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, malos } = await ejecutar(process.argv[2] || "http://localhost:3000");
  console.log(`OK: ${ok}   FALLAS: ${malos.length}`);
  for (const m of malos) console.log(" ✗ " + m);
  process.exitCode = malos.length ? 1 : 0;
}
