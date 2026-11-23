// Pruebas automáticas: npm test
// Levanta el servidor con una base de datos temporal y ejecuta
// la prueba completa de la API.

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const PUERTO = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PUERTO}`;
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "democraxssy-"));
let servidor;D

before(async () => {
  servidor = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    env: { ...process.env, PORT: String(PUERTO), DB_RUTA: path.join(carpeta, "prueba.db") },
    stdio: "ignore"
  });

  // Espera a que el servidor responda.
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/salud`, { method: "HEAD" });
      if (r.status === 200) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }

  throw new Error("El servidor no arrancó.");
});

after(() => {
  servidor.kill();
  fs.rmSync(carpeta, { recursive: true, force: true });
});

test("la API se comporta como la especificación del profesor", async () => {
  const { ejecutar } = await import("./prueba-api.mjs");
  const { ok, malos } = await ejecutar(BASE);

  assert.deepStrictEqual(malos, [], `Fallaron ${malos.length} comprobaciones`);
  assert.ok(ok > 100);
});

test("un cliente lento no bloquea a los demás", async () => {
  const socket = net.connect(PUERTO, "127.0.0.1");
  await new Promise(r => socket.once("connect", r));

  socket.write(
    "POST /api/partidas HTTP/1.1\r\nHost: x\r\n" +
    "Content-Type: application/json\r\nContent-Length: 100\r\n\r\n{"
  );

  await new Promise(r => setTimeout(r, 200));

  const inicio = Date.now();
  const r = await fetch(`${BASE}/api/salud`, { method: "HEAD", signal: AbortSignal.timeout(3000) });

  assert.strictEqual(r.status, 200);
  assert.ok(Date.now() - inicio < 1000);

  socket.destroy();
});

test("las partidas se guardan en SQLite", async () => {
  const r = await fetch(`${BASE}/api/partidas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: "Persistente" })
  });

  const { partida_id } = await r.json();

  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(path.join(carpeta, "prueba.db"), { readOnly: true });
  const fila = db.prepare("SELECT datos FROM partidas WHERE id = ?").get(partida_id);
  db.close();

  assert.ok(fila, "La partida no está en la base de datos");
  assert.strictEqual(JSON.parse(fila.datos).jugadores[0].nombre, "Persistente");
});
