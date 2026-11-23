
const { cartasNegras, cartasBlancas } = require("./cartas");
const crypto = require("node:crypto");
const { fallo, nuevoId, puedeAvanzar } = require("./jugadores");

// Mezcla una lista (Fisher-Yates) y la devuelve.
function barajar(lista) {
  for (let i = lista.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }

  return lista;
}

// Saca la siguiente carta negra sin repetir hasta agotar el mazo.
function sacarCartaNegra(partida) {
  if (!Array.isArray(partida.mazo_negras) || partida.mazo_negras.length === 0) {
    const anterior = partida.ronda?.carta_negra?.texto;

    partida.mazo_negras = barajar(
      cartasNegras.map((_, i) => i)
    );

    // Evita repetir la última carta al volver a barajar.
    const primera = cartasNegras[partida.mazo_negras.at(-1)];
    if (primera.texto === anterior && partida.mazo_negras.length > 1) {
      partida.mazo_negras.unshift(partida.mazo_negras.pop());
    }
  }

  return { ...cartasNegras[partida.mazo_negras.pop()] };
}

// Saca una carta blanca del mazo común de la partida.
// Así dos jugadores no tienen la misma carta a la vez.
function sacarCartaBlanca(partida, jugador) {
  if (!Array.isArray(partida.mazo_blancas) || partida.mazo_blancas.length === 0) {
    // Se vuelven a barajar las cartas que nadie tiene en la mano.
    const enMano = new Set(
      partida.jugadores.flatMap(j => j.mano.map(c => c.id))
    );

    partida.mazo_blancas = barajar(
      cartasBlancas.map(c => c.id).filter(id => !enMano.has(id))
    );
  }

  const id = partida.mazo_blancas.pop();

  if (id !== undefined) {
    return { ...cartasBlancas[id] };
  }

  // Con muchos jugadores (22 x 7 = 154) no alcanzan las 120 cartas:
  // entonces se reparte una carta que este jugador no tenga.
  const disponibles = cartasBlancas.filter(
    carta => !jugador.mano.some(actual => actual.id === carta.id)
  );

  return disponibles.length
    ? { ...disponibles[crypto.randomInt(disponibles.length)] }
    : null;
}

// Adapta el texto de una carta blanca para ponerlo dentro de la frase:
// primera letra en minúscula y sin el punto final.
function textoEnFrase(texto) {
  let resultado = texto.trim().replace(/\.$/, "");

  // No cambia siglas como "CCSS" o "TSE".
  if (!/^[A-ZÁÉÍÓÚÑ]{2}/.test(resultado)) {
    resultado = resultado.charAt(0).toLowerCase() + resultado.slice(1);
  }

  return resultado;
}

// Comprueba que la partida esté en la fase correcta.
function comprobarFase(partida, fase) {
  if (partida.fase !== fase) {
    fallo(409, "Esta acción no corresponde a la fase actual.");
  }
}

// Completa la mano de un jugador hasta tener 7 cartas.
function rellenarMano(partida, jugador) {
  while (jugador.mano.length < 7) {
    const carta = sacarCartaBlanca(partida, jugador);

    if (!carta) break;

    jugador.mano.push(carta);
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

  
  const posicion = (numero - 1) % ordenJugadores.length;
  const soberano = ordenJugadores[posicion];

  for (const jugador of partida.jugadores) {
    jugador.mi_voto = null;
    rellenarMano(partida, jugador);
  }

  partida.ronda = {
    numero,
    soberano_id: soberano.id,
    carta_negra: sacarCartaNegra(partida),
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

  // Las respuestas se revelan barajadas para que sean anónimas.
  barajar(partida.ronda.respuestas);

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
    () => {
      const carta = seleccion[posicion++];
      return carta ? textoEnFrase(carta.texto) : "____";
    }
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
    // Si nadie votó, se considera que respetó al pueblo.
    respeto_al_pueblo:
      partida.ronda.favoritas_del_pueblo.length === 0 ||
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

  // Fase de votación: el anfitrión o el soberano
  // pueden cerrarla aunque falten votos.
  if (partida.fase === "votacion") {
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

// Prepara la información que recibe el front.
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
        ? r.respuestas.map(x => {
            const respuesta = {
              id: x.id,
              cartas: x.cartas,
              frase: x.frase,
              es_mia: Boolean(
                jugador && x.autor_id === jugador.id
              )
            };

            // Los votos aparecen desde la fase decision.
            if (mostrarVotos) respuesta.votos = x.votos;

            // El autor aparece desde la fase resultado.
            if (mostrarAutores) respuesta.autor_id = x.autor_id;

            return respuesta;
          })
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
