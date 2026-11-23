
require("dotenv").config();

const http = require("node:http");

const { manejar } = require("./rutas");
const { inicializarBD } = require("./datos/partidas");

const PORT = Number(process.env.PORT) || 3000;

function iniciarServidor() {
  try {
    // Inicializa la base de datos SQLite.
    inicializarBD();

    // Crea el servidor HTTP.
    const servidor = http.createServer(manejar);

    // Límites de tiempo para que un cliente lento no
    // mantenga conexiones abiertas para siempre.
    servidor.headersTimeout = 10000;
    servidor.requestTimeout = 15000;

    // Inicia el servidor sin mostrar mensajes.
    servidor.listen(PORT, "0.0.0.0");

    // Muestra únicamente los errores.
    servidor.on("error", error => {
      console.error("Error del servidor:", error.message);
    });

  } catch (error) {
    console.error("Error al iniciar:", error.message);
    process.exit(1);
  }
}

iniciarServidor();
