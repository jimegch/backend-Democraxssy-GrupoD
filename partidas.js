
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { fallo } = require("./jugadores");

// Ruta donde se guardará la base de datos.
const rutaBD = path.join(__dirname, "democraxssy.db");

// Abre o crea la base de datos SQLite.
const db = new DatabaseSync(rutaBD);

// Configuración para mejorar la seguridad
// y el funcionamiento de SQLite.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
`);

// Crea la tabla si todavía no existe.
function inicializarBD() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS partidas (
      id TEXT PRIMARY KEY,
      datos TEXT NOT NULL
    );
  `);

}

// Recupera una partida mediante su ID.
async function obtenerPartida(id) {
  const resultado = db.prepare(`
    SELECT datos
    FROM partidas
    WHERE id = ?
  `).get(id);

  if (!resultado) {
    fallo(404, "Partida no encontrada.");
  }

  return JSON.parse(resultado.datos);
}

// Guarda una partida nueva o actualiza una existente.
async function guardarPartidas(partida) {
  const datos = JSON.stringify(partida);

  db.prepare(`
    INSERT INTO partidas (id, datos)
    VALUES (?, ?)
    ON CONFLICT(id)
    DO UPDATE SET datos = excluded.datos
  `).run(partida.id, datos);
}

// Agrega una partida.
async function agregarPartida(partida) {
  await guardarPartidas(partida);
}

// Recupera todas las partidas.
async function listarPartidas() {
  const resultados = db.prepare(`
    SELECT datos
    FROM partidas
  `).all();

  return resultados.map(
    fila => JSON.parse(fila.datos)
  );
}

// Elimina una partida.
async function eliminarPartida(id) {
  db.prepare(`
    DELETE FROM partidas
    WHERE id = ?
  `).run(id);
}

module.exports = {
  inicializarBD,
  obtenerPartida,
  guardarPartidas,
  agregarPartida,
  listarPartidas,
  eliminarPartida
};
