
const {
  obtenerPartida,
  guardarPartidas,
  agregarPartida,
  listarPartidas,
  eliminarPartida
} = require("./partidas");

const {
  nuevoId,
  fallo,
  validarNombre,
  crearJugador,
  identificarJugador,
  sinToken
} = require("./jugadores");

const {
  comprobarFase,
  iniciarPartida,
  enviarRespuesta,
  votar,
  elegirGanador,
  avanzarPartida,
  vista
} = require("./juego");

// Envía una respuesta HTTP en formato JSON.
function responder(res, codigo, datos) {
  res.writeHead(codigo, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(datos));
}

// Lee los datos recibidos desde React.
async function leerJSON(req) {
  let contenido = "";

  for await (const parte of req) {
    contenido += parte.toString();

    if (Buffer.byteLength(contenido) > 4096) {
      fallo(413, "La solicitud es demasiado grande.");
    }
  }

  if (!contenido.trim()) {
    return {};
  }

  try {
    return JSON.parse(contenido);
  } catch {
    fallo(400, "El contenido JSON no es válido.");
  }
}

// Comprueba los campos permitidos.
function validarCampos(datos, permitidos) {
  if (
    !datos ||
    typeof datos !== "object" ||
    Array.isArray(datos)
  ) {
    fallo(400, "Se esperaba un objeto JSON.");
  }

  const campos = Object.keys(datos);

  if (campos.some(campo => !permitidos.includes(campo))) {
    fallo(409, "La solicitud contiene campos no permitidos.");
  }
}

// Crea una partida nueva.
async function crearPartida(req, res) {
  sinToken(req);

  const datos = await leerJSON(req);

  validarCampos(datos, [
    "nombre",
    "puntos_para_ganar"
  ]);

  const nombre = validarNombre(datos.nombre);

  const puntos = datos.puntos_para_ganar === undefined
    ? 5
    : datos.puntos_para_ganar;

  if (
    !Number.isInteger(puntos) ||
    puntos < 1 ||
    puntos > 100
  ) {
    fallo(400, "Los puntos deben estar entre 1 y 100.");
  }

  const anfitrion = crearJugador(nombre);

  const partida = {
    id: nuevoId(16),
    fase: "sala",
    anfitrion_id: anfitrion.id,
    puntos_para_ganar: puntos,
    jugadores: [anfitrion],
    ronda: null,
    historial: [],
    ganador_id: null
  };

  await agregarPartida(partida);

  return responder(res, 201, {
    partida_id: partida.id,
    jugador_id: anfitrion.id,
    token: anfitrion.token,
    partida: vista(partida, anfitrion)
  });
}

// Permite unirse a una partida.
async function unirsePartida(partida, req, res) {
  sinToken(req);
  comprobarFase(partida, "sala");

  const datos = await leerJSON(req);

  validarCampos(datos, ["nombre"]);

  const nombre = validarNombre(datos.nombre);

  if (partida.jugadores.length >= 22) {
    fallo(409, "La partida ya está llena.");
  }

  const repetido = partida.jugadores.some(
    j => j.nombre.toLowerCase() === nombre.toLowerCase()
  );

  if (repetido) {
    fallo(409, "Ya existe un jugador con ese nombre.");
  }

  const jugador = crearJugador(nombre);

  partida.jugadores.push(jugador);

  await guardarPartidas(partida);

  return responder(res, 201, {
    partida_id: partida.id,
    jugador_id: jugador.id,
    token: jugador.token,
    partida: vista(partida, jugador)
  });
}

// Procesa las solicitudes HTTP.
async function manejarInterno(req, res) {

  // Permite conectar interfaces desde otros orígenes.
  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, HEAD, POST, PUT, DELETE, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept"
  );

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    const url = new URL(req.url, "http://localhost");

    if (url.search) {
      fallo(409, "No se permiten parámetros en la URL.");
    }

    const partes = url.pathname.split("/").filter(Boolean);

    // HEAD /api/salud
    if (
      req.method === "HEAD" &&
      url.pathname === "/api/salud"
    ) {
      res.writeHead(200);
      return res.end();
    }

    if (
      partes[0] !== "api" ||
      partes[1] !== "partidas"
    ) {
      fallo(404, "Ruta no encontrada.");
    }

    // GET /api/partidas
    if (partes.length === 2 && req.method === "GET") {
      const partidas = await listarPartidas();

      return responder(
        res,
        200,
        partidas.map(p => vista(p, null))
      );
    }

    // POST /api/partidas
    if (partes.length === 2 && req.method === "POST") {
      return await crearPartida(req, res);
    }

    if (partes.length < 3 || partes.length > 4) {
      fallo(404, "Ruta no encontrada.");
    }

    const partida = await obtenerPartida(partes[2]);
    const accion = partes[3];

    // GET /api/partidas/:id
    if (!accion && req.method === "GET") {
      const jugador = identificarJugador(partida, req, false);

      return responder(res, 200, vista(partida, jugador));
    }

    // POST /api/partidas/:id/jugadores
    if (accion === "jugadores" && req.method === "POST") {
      return await unirsePartida(partida, req, res);
    }

    // Las siguientes acciones requieren token.
    const jugador = identificarJugador(partida, req);

    // DELETE /api/partidas/:id
    if (!accion && req.method === "DELETE") {
      if (jugador.id !== partida.anfitrion_id) {
        fallo(403, "Solo el anfitrión puede eliminar la partida.");
      }

      comprobarFase(partida, "terminada");

      await eliminarPartida(partida.id);

      res.writeHead(204);
      return res.end();
    }

    // POST /api/partidas/:id/iniciar
    if (accion === "iniciar" && req.method === "POST") {
      validarCampos(await leerJSON(req), []);

      iniciarPartida(partida, jugador);

    // PUT /api/partidas/:id/respuestas
    } else if (
      accion === "respuestas" &&
      req.method === "PUT"
    ) {
      const datos = await leerJSON(req);

      validarCampos(datos, ["cartas"]);

      enviarRespuesta(partida, jugador, datos.cartas);

    // PUT /api/partidas/:id/votos
    } else if (
      accion === "votos" &&
      req.method === "PUT"
    ) {
      const datos = await leerJSON(req);

      validarCampos(datos, ["respuesta_id"]);

      votar(partida, jugador, datos.respuesta_id);

    // POST /api/partidas/:id/decision
    } else if (
      accion === "decision" &&
      req.method === "POST"
    ) {
      const datos = await leerJSON(req);

      validarCampos(datos, ["respuesta_id"]);

      elegirGanador(partida, jugador, datos.respuesta_id);

    // POST /api/partidas/:id/avanzar
    } else if (
      accion === "avanzar" &&
      req.method === "POST"
    ) {
      validarCampos(await leerJSON(req), []);

      avanzarPartida(partida, jugador);

    } else {
      fallo(404, "Ruta no encontrada.");
    }

    // Guarda los cambios realizados partidas.JSON.
    await guardarPartidas(partida);

    // Devuelve la información actualizada.
    return responder(res, 200, vista(partida, jugador));

  } catch (error) {
    if (!error.codigo) {
      console.error("Error del servidor:", error);
    }

    return responder(res, error.codigo || 500, {
      error: error.codigo
        ? error.message
        : "Error interno del servidor."
    });
  }
}

// Cola para evitar modificaciones simultáneas.
let cola = Promise.resolve();

function manejar(req, res) {
  const tarea = cola.then(() => manejarInterno(req, res));

  cola = tarea.catch(error => {
    console.error("Error inesperado:", error);

    if (!res.headersSent) {
      responder(res, 500, {
        error: "Error interno del servidor."
      });
    } else if (!res.writableEnded) {
      res.end();
    }
  });

  return tarea;
}

module.exports = {
  manejar
};
