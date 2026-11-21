
const { cartasNegras, cartasBlancas } = require("./cartas");
const { fallo, nuevoId, puedeAvanzar } = require("./jugadores");

// Selecciona un elemento aleatorio.
function aleatorio(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// Comprueba que la partida esté en la fase correcta.
function comprobarFase(partida, fase) {
  if (partida.fase !== fase) {
    fallo(409, "Esta acción no corresponde a la fase actual.");
  }
}

// Completa la mano de un jugador hasta tener 7 cartas.
function rellenarMano(jugador) {
  while (jugador.mano.length < 7) {
    const disponibles = cartasBlancas.filter(
      carta => !jugador.mano.some(
        actual => actual.id === carta.id
      )
    );

    if (disponibles.length === 0) break;

    jugador.mano.push(aleatorio(disponibles));
  }
}

// Comprueba si todos los jugadores respondieron.
function respuestasCompletas(partida) {
  return partida.ronda.respuestas.length ===
    partida.jugadores.length - 1;
}

// Comprueba si todos los jugadores votaron.
function votosCompletos(partida) {
  return partida.ronda.votos_emitidos ===
    partida.jugadores.length - 1;
}

// Crea una nueva ronda y asigna el soberano por orden.
function nuevaRonda(partida) {
  const numero = partida.ronda
    ? partida.ronda.numero + 1
    : 1;

  // El anfitrión siempre ocupa la primera posición.
  const ordenJugadores = [
    partida.jugadores.find(
      jugador => jugador.id === partida.anfitrion_id
    ),
    ...partida.jugadores.filter(
      jugador => jugador.id !== partida.anfitrion_id
    )
  ];

  // Ronda 1: anfitrión.
  // Ronda 2: jugador 2.
  // Ronda 3: jugador 3, etc.
  const posicion = (numero - 1) % ordenJugadores.length;
  const soberano = ordenJugadores[posicion];

  for (const jugador of partida.jugadores) {
    jugador.mi_voto = null;
    rellenarMano(jugador);
  }

  partida.ronda = {
    numero,
    soberano_id: soberano.id,
    carta_negra: aleatorio(cartasNegras),
    respuestas: [],
    votos_emitidos: 0,
    favoritas_del_pueblo: [],
    ganadora: null
  };

  partida.fase = "respuestas";
}

// Inicia la partida.
function iniciarPartida(partida, jugador) {
  comprobarFase(partida, "sala");

  if (jugador.id !== partida.anfitrion_id) {
    fallo(403, "Solo el anfitrión puede iniciar la partida.");
  }

  const cantidad = partida.jugadores.length;

  if (cantidad < 4 || cantidad > 22 || cantidad % 2 !== 0) {
    fallo(
      409,
      "Se necesitan entre 4 y 22 jugadores, en cantidad par."
    );
  }

  nuevaRonda(partida);
}

// Abre la fase de votación.

function abrirVotacion(partida) {
  comprobarFase(partida, "respuestas");

  // Cuenta cuántos jugadores enviaron sus cartas blancas.
  const cantidadRespuestas = partida.ronda.respuestas.length;

  // Se necesitan al menos 2 respuestas para avanzar.
  if (cantidadRespuestas < 2) {
    fallo(
      409,
      "Se necesitan al menos 2 jugadores que hayan enviado sus cartas blancas para avanzar a votación."
    );
  }

  // Avanza a la fase de votación.
  partida.fase = "votacion";
}


// Permite enviar una respuesta con 1 o 2 cartas.
function enviarRespuesta(partida, jugador, ids) {
  comprobarFase(partida, "respuestas");

  if (jugador.id === partida.ronda.soberano_id) {
    fallo(403, "El soberano no puede responder.");
  }

  const yaRespondio = partida.ronda.respuestas.some(
    respuesta => respuesta.autor_id === jugador.id
  );

  if (yaRespondio) {
    fallo(409, "Ya enviaste una respuesta.");
  }

  const cantidad = partida.ronda.carta_negra.elegir;

  if (
    !Array.isArray(ids) ||
    ids.length !== cantidad ||
    ids.some(id => !Number.isInteger(id)) ||
    new Set(ids).size !== ids.length
  ) {
    fallo(400, "La selección de cartas no es válida.");
  }

  const seleccion = ids.map(
    id => jugador.mano.find(carta => carta.id === id)
  );

  if (seleccion.some(carta => !carta)) {
    fallo(400, "Solo puedes jugar cartas de tu mano.");
  }

  let posicion = 0;

  const frase = partida.ronda.carta_negra.texto.replace(
    /____/g,
    () => seleccion[posicion++]?.texto || "____"
  );

  partida.ronda.respuestas.push({
    id: nuevoId(6),
    autor_id: jugador.id,
    cartas: seleccion.map(carta => carta.texto),
    frase,
    votos: 0,
    ganadora: false
  });

  // Quita las cartas utilizadas de la mano.
  jugador.mano = jugador.mano.filter(
    carta => !ids.includes(carta.id)
  );

  // Si todos respondieron, empieza la votación.
  if (respuestasCompletas(partida)) {
    abrirVotacion(partida);
  }
}

// Busca una respuesta dentro de la ronda.
function buscarRespuesta(partida, respuestaId) {
  const respuesta = partida.ronda.respuestas.find(
    r => r.id === respuestaId
  );

  if (!respuesta) {
    fallo(404, "La respuesta no existe.");
  }

  return respuesta;
}

// Cierra la votación, aunque no hayan votado todos.
function cerrarVotacion(partida) {
  comprobarFase(partida, "votacion");

  const respuestas = partida.ronda.respuestas;

  const maximo = Math.max(
    0,
    ...respuestas.map(respuesta => respuesta.votos)
  );

  // Si nadie votó, no hay favoritas del pueblo.
  if (maximo === 0) {
    partida.ronda.favoritas_del_pueblo = [];
  } else {
    partida.ronda.favoritas_del_pueblo = respuestas
      .filter(respuesta => respuesta.votos === maximo)
      .map(respuesta => respuesta.id);
  }

  partida.fase = "decision";
}

// Permite votar por cualquier respuesta,
// incluso por la respuesta propia.
function votar(partida, jugador, respuestaId) {
  comprobarFase(partida, "votacion");

  if (jugador.id === partida.ronda.soberano_id) {
    fallo(403, "El soberano no puede votar.");
  }

  if (jugador.mi_voto !== null) {
    fallo(409, "Ya emitiste tu voto.");
  }

  const respuesta = buscarRespuesta(partida, respuestaId);

  // Se permite votar por la respuesta propia.
  respuesta.votos++;

  jugador.mi_voto = respuesta.id;
  partida.ronda.votos_emitidos++;

  // Si todos votaron, avanza automáticamente.
  if (votosCompletos(partida)) {
    cerrarVotacion(partida);
  }
}

// El soberano selecciona al ganador.
function elegirGanador(partida, jugador, respuestaId) {
  comprobarFase(partida, "decision");

  if (jugador.id !== partida.ronda.soberano_id) {
    fallo(403, "Solo el soberano puede elegir al ganador.");
  }

  const respuesta = buscarRespuesta(partida, respuestaId);

  const ganador = partida.jugadores.find(
    j => j.id === respuesta.autor_id
  );

  if (!ganador) {
    fallo(404, "No se encontró al autor de la respuesta.");
  }

  respuesta.ganadora = true;
  partida.ronda.ganadora = respuesta.id;
  ganador.puntos++;

  partida.historial.push({
    numero: partida.ronda.numero,
    soberano_id: jugador.id,
    ganador_id: ganador.id,
    frase: respuesta.frase,
    respeto_al_pueblo:
      partida.ronda.favoritas_del_pueblo.includes(respuesta.id)
  });

  if (ganador.puntos >= partida.puntos_para_ganar) {
    partida.ganador_id = ganador.id;
    partida.fase = "terminada";
  } else {
    partida.fase = "resultado";
  }
}

// Permite avanzar las fases.
function avanzarPartida(partida, jugador) {
  if (!puedeAvanzar(partida, jugador)) {
    fallo(403, "No tienes permiso para avanzar.");
  }

  // Fase de respuestas.
  if (partida.fase === "respuestas") {
    abrirVotacion(partida);
    return;
  }

  // Fase de votación.
  if (partida.fase === "votacion") {
    // Solo el soberano puede cerrar
    // anticipadamente la votación.
    if (
      jugador.id !== partida.ronda.soberano_id &&
      !votosCompletos(partida)
    ) {
      fallo(
        403,
        "Solo el soberano puede cerrar una votación incompleta."
      );
    }

    cerrarVotacion(partida);
    return;
  }

  // Inicia la siguiente ronda.
  if (partida.fase === "resultado") {
    nuevaRonda(partida);
    return;
  }

  fallo(409, "No se puede avanzar en esta fase.");
}

// Prepara la información que recibe React.
function vista(partida, jugador) {
  const r = partida.ronda;

  const mostrarRespuestas =
    r && partida.fase !== "respuestas";

  const mostrarVotos = [
    "decision",
    "resultado",
    "terminada"
  ].includes(partida.fase);

  const mostrarAutores = [
    "resultado",
    "terminada"
  ].includes(partida.fase);

  return {
    id: partida.id,
    fase: partida.fase,
    anfitrion_id: partida.anfitrion_id,
    puntos_para_ganar: partida.puntos_para_ganar,
    ganador_id: partida.ganador_id,

    jugadores: partida.jugadores.map(j => ({
      id: j.id,
      nombre: j.nombre,
      puntos: j.puntos,
      es_anfitrion: j.id === partida.anfitrion_id,
      es_soberano: j.id === r?.soberano_id,

      ya_respondio: r
        ? (
            j.id === r.soberano_id ||
            r.respuestas.some(x => x.autor_id === j.id)
          )
        : false,

      ya_voto: r
        ? (
            j.id === r.soberano_id ||
            j.mi_voto !== null
          )
        : false
    })),

    ronda: r ? {
      numero: r.numero,
      soberano_id: r.soberano_id,
      carta_negra: r.carta_negra,
      respuestas_recibidas: r.respuestas.length,
      votos_emitidos: r.votos_emitidos,

      respuestas: mostrarRespuestas
        ? r.respuestas.map(x => ({
            id: x.id,
            cartas: x.cartas,
            frase: x.frase,
            es_mia: Boolean(
              jugador && x.autor_id === jugador.id
            ),
            votos: mostrarVotos ? x.votos : null,
            autor_id: mostrarAutores ? x.autor_id : null
          }))
        : [],

      favoritas_del_pueblo: mostrarVotos
        ? r.favoritas_del_pueblo
        : [],

      ganadora: mostrarAutores ? r.ganadora : null
    } : null,

    yo: jugador ? {
      id: jugador.id,
      nombre: jugador.nombre,
      mano: jugador.mano,
      mi_voto: jugador.mi_voto,
      puede_avanzar: puedeAvanzar(partida, jugador)
    } : null,

    historial: partida.historial
  };
}

module.exports = {
  comprobarFase,
  iniciarPartida,
  enviarRespuesta,
  votar,
  elegirGanador,
  avanzarPartida,
  vista
};
