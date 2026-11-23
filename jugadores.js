
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
  const limpio = typeof nombre === "string" ? nombre.trim() : "";

  // Se cuentan caracteres reales (un emoji cuenta como uno).
  const largo = [...limpio].length;

  if (largo < 1 || largo > 24) {
    fallo(400, "El nombre debe tener entre 1 y 24 caracteres.");
  }

  // No se admiten caracteres de control.
  if (/[\u0000-\u001F\u007F-\u009F]/.test(limpio)) {
    fallo(400, "El nombre no puede tener caracteres de control.");
  }

  return limpio;
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

  if (autorizacion === undefined) {
    if (obligatorio) {
      fallo(401, "Token ausente o inválido para esta partida.");
    }

    return null;
  }

  // Bearer + 64 caracteres hexadecimales en minúsculas.
  const coincidencia = /^Bearer ([0-9a-f]{64})$/.exec(autorizacion);

  if (!coincidencia) {
    fallo(409, "La cabecera Authorization debe ser Bearer seguido de 64 caracteres hexadecimales en minúsculas.");
  }

  const jugador = partida.jugadores.find(
    j => j.token === coincidencia[1]
  );

  if (!jugador) {
    fallo(401, "Token ausente o inválido para esta partida.");
  }

  return jugador;
}

// Impide enviar tokens en rutas públicas.
function sinToken(req) {
  if (req.headers.authorization !== undefined) {
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
