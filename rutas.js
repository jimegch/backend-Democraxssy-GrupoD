const {
  obtenerPartida,
  guardarPartidas,
  agregarPartida,
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

// Tamaño máximo del cuerpo (4 KB).
const LIMITE_CUERPO = 4096;

// Métodos que no admiten cuerpo ni Content-Type.
const METODOS_SIN_CUERPO = ["GET", "HEAD", "DELETE"];

// Cabeceras que intentan cambiar el método HTTP.
const CABECERAS_PROHIBIDAS = [
  "x-http-method-override",
  "x-http-method",
  "x-method-override"
];

// Content-Type aceptado cuando hay cuerpo.
const TIPO_JSON = /^application\/json\s*(;\s*charset\s*=\s*"?utf-8"?\s*)?$/i;

// Envía una respuesta HTTP en formato JSON.
function responder(res, codigo, datos) {
  res.writeHead(codigo, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(JSON.stringify(datos));
}

// Agrega las cabeceras CORS a todas las respuestas.
function ponerCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, HEAD, POST, PUT, DELETE"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type"
  );
}

// Revisa la URL y las cabeceras antes de leer el cuerpo.
function validarSolicitud(req) {
  const url = new URL(req.url, "http://localhost");

  if (url.search || req.url.includes("?")) {
    fallo(409, "No se permiten parámetros de consulta.");
  }

  for (const cabecera of CABECERAS_PROHIBIDAS) {
    if (req.headers[cabecera] !== undefined) {
      fallo(409, `La cabecera ${cabecera} no está permitida.`);
    }
  }

  // Authorization solo puede venir una vez.
  const autorizaciones = req.rawHeaders.filter(
    (valor, i) => i % 2 === 0 && valor.toLowerCase() === "authorization"
  );

  if (autorizaciones.length > 1) {
    fallo(409, "La cabecera Authorization solo puede enviarse una vez.");
  }

  const tieneTipo = req.headers["content-type"] !== undefined;

  if (METODOS_SIN_CUERPO.includes(req.method)) {
    const largo = Number(req.headers["content-length"] || 0);

    if (tieneTipo || largo > 0 || req.headers["transfer-encoding"]) {
      fallo(409, `${req.method} no admite cuerpo ni Content-Type.`);
    }
  } else if (tieneTipo && !TIPO_JSON.test(req.headers["content-type"])) {
    fallo(409, "El Content-Type debe ser application/json.");
  }

  if (Number(req.headers["content-length"] || 0) > LIMITE_CUERPO) {
    fallo(413, "El cuerpo de la solicitud es demasiado grande.");
  }

  return url;
}

// Lee el cuerpo completo, con un máximo de 4 KB.
async function leerCuerpo(req) {
  const partes = [];
  let total = 0;

  for await (const parte of req) {
    total += parte.length;

    if (total > LIMITE_CUERPO) {
      fallo(413, "El cuerpo de la solicitud es demasiado grande.");
    }

    partes.push(parte);
  }

  const texto = Buffer.concat(partes).toString("utf8");

  // Si hay cuerpo, el Content-Type es obligatorio.
  if (texto.length > 0 && req.headers["content-type"] === undefined) {
    fallo(409, "Falta el Content-Type application/json.");
  }

  return texto;
}

// Busca campos repetidos dentro de los objetos de un JSON válido.
function buscarCamposRepetidos(texto) {
  const pila = [];
  let i = 0;

  while (i < texto.length) {
    const c = texto[i];

    if (c === "{") {
      pila.push({ objeto: true, claves: new Set(), esperaClave: true });
    } else if (c === "[") {
      pila.push({ objeto: false });
    } else if (c === "}" || c === "]") {
      pila.pop();
    } else if (c === ",") {
      const actual = pila[pila.length - 1];
      if (actual?.objeto) actual.esperaClave = true;
    } else if (c === ":") {
      pila[pila.length - 1].esperaClave = false;
    } else if (c === "\"") {
      let fin = i + 1;

      while (texto[fin] !== "\"") {
        fin += texto[fin] === "\\" ? 2 : 1;
      }

      const actual = pila[pila.length - 1];

      if (actual?.objeto && actual.esperaClave) {
        const clave = JSON.parse(texto.slice(i, fin + 1));

        if (actual.claves.has(clave)) {
          fallo(409, `Cuerpo JSON inválido o inesperado: campo repetido \`${clave}\``);
        }

        actual.claves.add(clave);
      }

      i = fin;
    }

    i++;
  }
}

// Convierte el cuerpo en un objeto y revisa sus campos.
// "obligatorios" y "opcionales" indican el tipo esperado de cada campo.
function leerObjeto(texto, obligatorios = {}, opcionales = {}) {
  if (!texto.trim()) {
    texto = "{}";
  }

  let datos;

  try {
    datos = JSON.parse(texto);
  } catch {
    fallo(409, "Cuerpo JSON inválido o inesperado: no es un JSON válido.");
  }

  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    fallo(409, "Cuerpo JSON inválido o inesperado: se esperaba un objeto.");
  }

  buscarCamposRepetidos(texto);

  const permitidos = [
    ...Object.keys(obligatorios),
    ...Object.keys(opcionales)
  ];

  for (const campo of Object.keys(datos)) {
    if (!permitidos.includes(campo)) {
      const esperados = permitidos.length
        ? `, se esperaba ${permitidos.map(p => `\`${p}\``).join(" o ")}`
        : ", no se esperaba ningún campo";

      fallo(409, `Cuerpo JSON inválido o inesperado: campo desconocido \`${campo}\`${esperados}`);
    }
  }

  for (const [campo, tipo] of Object.entries(obligatorios)) {
    if (!(campo in datos)) {
      fallo(409, `Cuerpo JSON inválido o inesperado: falta el campo \`${campo}\``);
    }

    if (!tipo(datos[campo])) {
      fallo(409, `Cuerpo JSON inválido o inesperado: tipo incorrecto en \`${campo}\``);
    }
  }

  for (const [campo, tipo] of Object.entries(opcionales)) {
    if (campo in datos && !tipo(datos[campo])) {
      fallo(409, `Cuerpo JSON inválido o inesperado: tipo incorrecto en \`${campo}\``);
    }
  }

  return datos;
}

// Tipos usados para validar los campos.
const esTexto = valor => typeof valor === "string";
const esEnteroONulo = valor => valor === null || Number.isInteger(valor);
const esListaDeEnteros = valor =>
  Array.isArray(valor) && valor.every(Number.isInteger);

// Crea una partida nueva.
async function crearPartida(req, res, cuerpo) {
  sinToken(req);

  const datos = leerObjeto(
    cuerpo,
    { nombre: esTexto },
    { puntos_para_ganar: esEnteroONulo }
  );

  const nombre = validarNombre(datos.nombre);

  const puntos = datos.puntos_para_ganar ?? 5;

  if (puntos < 1 || puntos > 20) {
    fallo(400, "Los puntos para ganar deben estar entre 1 y 20.");
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
async function unirsePartida(partida, req, res, cuerpo) {
  sinToken(req);

  const datos = leerObjeto(cuerpo, { nombre: esTexto });

  comprobarFase(partida, "sala");

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

// Rutas que exigen token: "MÉTODO acción".
const RUTAS_CON_TOKEN = [
  "DELETE ",
  "POST iniciar",
  "PUT respuestas",
  "PUT votos",
  "POST decision",
  "POST avanzar"
];

// Procesa una solicitud cuyo cuerpo ya fue leído.
async function manejarInterno(req, res, url, cuerpo) {
  const partes = url.pathname.split("/").filter(Boolean);

  // HEAD /api/salud
  if (req.method === "HEAD" && url.pathname === "/api/salud") {
    sinToken(req);
    res.writeHead(200);
    return res.end();
  }

  if (partes[0] !== "api" || partes[1] !== "partidas") {
    fallo(404, "Ruta no encontrada.");
  }

  // POST /api/partidas
  if (partes.length === 2 && req.method === "POST") {
    return await crearPartida(req, res, cuerpo);
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
    return await unirsePartida(partida, req, res, cuerpo);
  }

  if (!RUTAS_CON_TOKEN.includes(`${req.method} ${accion ?? ""}`)) {
    fallo(404, "Ruta no encontrada.");
  }

  // Las siguientes acciones requieren token.
  const jugador = identificarJugador(partida, req);

  // DELETE /api/partidas/:id
  if (!accion) {
    if (jugador.id !== partida.anfitrion_id) {
      fallo(403, "Solo el anfitrión puede eliminar la partida.");
    }

    comprobarFase(partida, "terminada");

    await eliminarPartida(partida.id);

    res.writeHead(204);
    return res.end();
  }

  if (accion === "iniciar") {
    // POST /api/partidas/:id/iniciar
    leerObjeto(cuerpo);
    iniciarPartida(partida, jugador);

  } else if (accion === "respuestas") {
    // PUT /api/partidas/:id/respuestas
    const datos = leerObjeto(cuerpo, { cartas: esListaDeEnteros });
    enviarRespuesta(partida, jugador, datos.cartas);

  } else if (accion === "votos") {
    // PUT /api/partidas/:id/votos
    const datos = leerObjeto(cuerpo, { respuesta_id: esTexto });
    votar(partida, jugador, datos.respuesta_id);

  } else if (accion === "decision") {
    // POST /api/partidas/:id/decision
    const datos = leerObjeto(cuerpo, { respuesta_id: esTexto });
    elegirGanador(partida, jugador, datos.respuesta_id);

  } else {
    // POST /api/partidas/:id/avanzar
    leerObjeto(cuerpo);
    avanzarPartida(partida, jugador);
  }

  // Guarda los cambios en SQLite.
  await guardarPartidas(partida);

  // Devuelve la información actualizada.
  return responder(res, 200, vista(partida, jugador));
}

// Responde un error con el formato de la API.
function responderError(res, error) {
  if (!error.codigo) {
    console.error("Error del servidor:", error);
  }

  if (res.headersSent) {
    return res.end();
  }

  return responder(res, error.codigo || 500, {
    error: error.codigo
      ? error.message
      : "Error interno del servidor."
  });
}

// Cola para evitar modificaciones simultáneas.
// Solo entra a la cola una solicitud cuyo cuerpo ya llegó completo,
// así un cliente lento no detiene a los demás.
let cola = Promise.resolve();

async function manejar(req, res) {
  ponerCORS(res);

  // Verificación previa de CORS.
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  let url;
  let cuerpo;

  try {
    url = validarSolicitud(req);
    cuerpo = await leerCuerpo(req);
  } catch (error) {
    // El cuerpo pudo quedar sin leer: se cierra la conexión.
    res.setHeader("Connection", "close");

    return responderError(res, error);
  }

  const tarea = cola.then(() =>
    manejarInterno(req, res, url, cuerpo).catch(error =>
      responderError(res, error)
    )
  );

  cola = tarea.catch(() => {});

  return tarea;
}

module.exports = {
  manejar
};
