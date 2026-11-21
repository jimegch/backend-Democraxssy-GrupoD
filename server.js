
require("dotenv").config();

const http = require("node:http");

const { manejar } = require("./rutas");
const { inicializarBD } = require("./partidas");

const PORT = Number(process.env.PORT) || 3000;

function iniciarServidor() {
  try {
    // Prepara la base de datos SQLite.
    inicializarBD();

    // Crea el servidor HTTP.
    const servidor = http.createServer(manejar);

    // Permite conexiones desde otras computadoras.
    servidor.listen(PORT, "0.0.0.0", () => {
      console.log("--------------------------------");
      console.log("DemocrAXSSY - Backend");
      console.log(`Puerto: ${PORT}`);
      console.log(`Servidor: http://localhost:${PORT}`);
      console.log("Base de datos: SQLite");
      console.log("--------------------------------");
    });

    servidor.on("error", error => {
      console.error(
        "Error del servidor:",
        error.message
      );
    });

  } catch (error) {
    console.error(
      "No se pudo iniciar el servidor:",
      error.message
    );

    process.exit(1);
  }
}

iniciarServidor();
