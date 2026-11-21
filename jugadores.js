
const crypto = require("node:crypto");

// Genera identificadores aleatorios.
function nuevoId(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

// Genera errores con un código HTTP.
function fallo(codigo, mensaje) {
  const error = new Error(mensaje);
  error.codigo = codigo;
  throw error;
}

// Comprueba el nombre de un jugador.
function validarNombre(nombre) {
  if (
    typeof nombre !== "string" ||
    nombre.trim().length < 1 ||
    nombre.trim().length > 24
  ) {
    fallo(400, "El nombre debe tener entre 1 y 24 caracteres.");
  }

  return nombre.trim();
}

// Crea los datos iniciales de un jugador.
function crearJugador(nombre) {
  return {
    id: nuevoId(8),
    nombre: validarNombre(nombre),
    token: nuevoId(32),
    puntos: 0,
    mano: [],
    mi_voto: null
  };
}

// Busca un jugador mediante su token.
function identificarJugador(partida, req, obligatorio = true) {
  const autorizacion = req.headers.authorization;

  if (!autorizacion) {
    if (obligatorio) {
      fallo(401, "Debes enviar un token de autenticación.");
    }

    return null;
  }

  const coincidencia = /^Bearer ([a-f0-9]{64})$/i.exec(
    autorizacion
  );

  if (!coincidencia) {
    fallo(401, "El formato del token es incorrecto.");
  }

  const jugador = partida.jugadores.find(
    j => j.token === coincidencia[1]
  );

  if (!jugador) {
    fallo(401, "El token no pertenece a esta partida.");
  }

  return jugador;
}

// Impide enviar tokens en rutas públicas.
function sinToken(req) {
  if (req.headers.authorization) {
    fallo(409, "Esta operación no necesita un token.");
  }
}

// Comprueba quién puede avanzar las fases.
function puedeAvanzar(partida, jugador) {
  if (!jugador) return false;

  return (
    jugador.id === partida.anfitrion_id ||
    jugador.id === partida.ronda?.soberano_id
  );
}

module.exports = {
  nuevoId,
  fallo,
  validarNombre,
  crearJugador,
  identificarJugador,
  sinToken,
  puedeAvanzar
};
