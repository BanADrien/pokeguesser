const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const TARGET_SCORE = 10;
const ROUND_DURATION_MS = 15000;
const MAX_GEN8_ID = 905;
const WHO_GRID_SIZE = 30;

const duelRooms = new Map();
const whoRooms = new Map();
const duelData = {
  loaded: false,
  loadingPromise: null,
  allPokemon: [],
  comboEntries: [],
  levelBuckets: [],
};

app.use(express.static(path.join(__dirname, "..")));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

io.on("connection", (socket) => {
  socket.on("duel:createRoom", async (payload = {}) => {
    try {
      await ensureDataLoaded();
      const roomCode = createRoomCode();
      const player = createPlayer(socket, payload.playerName, true);
      const room = {
        roomCode,
        players: [player],
        scores: { [player.id]: 0 },
        started: false,
        usedCombos: new Set(),
        currentRound: null,
        level: 1,
        timeout: null,
      };

      duelRooms.set(roomCode, room);
      socket.join(roomCode);

      socket.emit("duel:roomCreated", {
        roomCode,
        playerId: player.id,
        state: serializeRoom(room),
      });
    } catch (error) {
      socket.emit("duel:error", { message: "Echec creation room." });
    }
  });

  socket.on("duel:joinRoom", async (payload = {}) => {
    try {
      await ensureDataLoaded();
      const roomCode = String(payload.roomCode || "").trim().toUpperCase();
      const room = duelRooms.get(roomCode);

      if (!room) {
        socket.emit("duel:error", { message: "Room introuvable." });
        return;
      }

      if (room.players.length >= 2) {
        socket.emit("duel:error", { message: "Room pleine." });
        return;
      }

      const player = createPlayer(socket, payload.playerName, false);
      room.players.push(player);
      room.scores[player.id] = 0;
      socket.join(roomCode);

      socket.emit("duel:joined", {
        roomCode,
        playerId: player.id,
        isHost: false,
        state: serializeRoom(room),
      });

      io.to(roomCode).emit("duel:state", { state: serializeRoom(room) });
    } catch (error) {
      socket.emit("duel:error", { message: "Echec join room." });
    }
  });

  socket.on("duel:start", async (payload = {}) => {
    try {
      await ensureDataLoaded();
      const room = getRoomFromPayload(payload);
      if (!room) {
        socket.emit("duel:error", { message: "Room introuvable." });
        return;
      }

      const me = room.players.find((p) => p.id === socket.id);
      if (!me || !me.isHost) {
        socket.emit("duel:error", { message: "Seul le host peut lancer." });
        return;
      }

      if (room.players.length !== 2) {
        socket.emit("duel:error", { message: "Il faut 2 joueurs." });
        return;
      }

      room.started = true;
      room.usedCombos.clear();
      room.level = 1;
      for (const player of room.players) {
        room.scores[player.id] = 0;
      }

      io.to(room.roomCode).emit("duel:state", { state: serializeRoom(room) });
      startNextRound(room);
    } catch (error) {
      socket.emit("duel:error", { message: "Impossible de demarrer." });
    }
  });

  socket.on("duel:guess", async (payload = {}) => {
    try {
      await ensureDataLoaded();
      const room = getRoomFromPayload(payload);
      if (!room || !room.started || !room.currentRound) {
        return;
      }

      const round = room.currentRound;
      if (round.locked || Date.now() > round.endsAt) {
        return;
      }

      const player = room.players.find((p) => p.id === socket.id);
      if (!player) {
        return;
      }

      const now = Date.now();
      if (player.lastGuessAt && now - player.lastGuessAt < 250) {
        return;
      }
      player.lastGuessAt = now;

      const guess = normalize(payload.guess || "");
      if (!guess) {
        return;
      }

      const isCorrect = round.acceptedNames.has(guess);
      if (!isCorrect) {
        return;
      }

      round.locked = true;
      room.scores[player.id] = (room.scores[player.id] || 0) + 1;

      io.to(room.roomCode).emit("duel:roundResult", {
        scores: room.scores,
        message: `${player.name} gagne le round (+1 point).`,
      });

      if (room.scores[player.id] >= TARGET_SCORE) {
        room.started = false;
        clearRoomTimeout(room);
        io.to(room.roomCode).emit("duel:gameOver", {
          scores: room.scores,
          message: `${player.name} gagne la partie ${room.scores[player.id]}-${getOtherScore(room, player.id)} !`,
        });
        io.to(room.roomCode).emit("duel:state", { state: serializeRoom(room) });
        return;
      }

      room.level = Math.min(10, 1 + Math.max(...Object.values(room.scores)));
      io.to(room.roomCode).emit("duel:state", { state: serializeRoom(room) });
      clearRoomTimeout(room);
      room.timeout = setTimeout(() => {
        startNextRound(room);
      }, 1600);
    } catch {
      socket.emit("duel:error", { message: "Erreur validation guess." });
    }
  });

  socket.on("who:createRoom", async (payload = {}) => {
    try {
      await ensureDataLoaded();
      const roomCode = createRoomCode();
      const player = createPlayer(socket, payload.playerName, true);
      const room = {
        roomCode,
        players: [player],
        started: false,
        phase: "lobby",
        board: [],
        boardNameIndex: new Map(),
        selections: {},
        targets: {},
        winnerId: null,
      };

      whoRooms.set(roomCode, room);
      socket.join(roomCode);

      socket.emit("who:roomCreated", {
        roomCode,
        playerId: player.id,
        state: serializeWhoRoom(room),
      });
    } catch {
      socket.emit("who:error", { message: "Echec creation room." });
    }
  });

  socket.on("who:joinRoom", async (payload = {}) => {
    try {
      await ensureDataLoaded();
      const roomCode = String(payload.roomCode || "").trim().toUpperCase();
      const room = whoRooms.get(roomCode);

      if (!room) {
        socket.emit("who:error", { message: "Room introuvable." });
        return;
      }

      if (room.players.length >= 2) {
        socket.emit("who:error", { message: "Room pleine." });
        return;
      }

      const player = createPlayer(socket, payload.playerName, false);
      room.players.push(player);
      socket.join(roomCode);

      socket.emit("who:joined", {
        roomCode,
        playerId: player.id,
        isHost: false,
        state: serializeWhoRoom(room),
      });

      io.to(roomCode).emit("who:state", { state: serializeWhoRoom(room) });
    } catch {
      socket.emit("who:error", { message: "Echec join room." });
    }
  });

  socket.on("who:start", async (payload = {}) => {
    try {
      await ensureDataLoaded();
      const room = getWhoRoomFromPayload(payload);
      if (!room) {
        socket.emit("who:error", { message: "Room introuvable." });
        return;
      }

      const me = room.players.find((p) => p.id === socket.id);
      if (!me || !me.isHost) {
        socket.emit("who:error", { message: "Seul le host peut lancer." });
        return;
      }

      if (room.players.length !== 2) {
        socket.emit("who:error", { message: "Il faut 2 joueurs." });
        return;
      }

      room.started = true;
      room.phase = "pick";
      room.winnerId = null;
      room.board = pickRandomPokemon(duelData.allPokemon, WHO_GRID_SIZE).map((pokemon) => ({
        id: pokemon.id,
        name: pokemon.name,
        displayNameEn: pokemon.displayNameEn,
        displayNameFr: pokemon.displayNameFr,
        artwork: pokemon.artwork,
      }));
      room.boardNameIndex = buildBoardNameIndex(room.board);
      room.selections = {};
      room.targets = {};

      io.to(room.roomCode).emit("who:state", { state: serializeWhoRoom(room) });
      io.to(room.roomCode).emit("who:phase", {
        phase: room.phase,
        message: "Choisis le Pokemon que ton adversaire devra deviner.",
      });
    } catch {
      socket.emit("who:error", { message: "Impossible de lancer la partie." });
    }
  });

  socket.on("who:selectTarget", async (payload = {}) => {
    try {
      await ensureDataLoaded();
      const room = getWhoRoomFromPayload(payload);
      if (!room || !room.started || room.phase !== "pick") {
        return;
      }

      const me = room.players.find((p) => p.id === socket.id);
      if (!me) {
        return;
      }

      const targetId = resolveBoardPokemonId(room, payload);
      if (!targetId) {
        socket.emit("who:error", { message: "Pokemon invalide pour cette grille." });
        return;
      }

      room.selections[me.id] = targetId;

      const allSelected = room.players.every((player) => Boolean(room.selections[player.id]));
      if (allSelected) {
        for (const player of room.players) {
          const opponent = room.players.find((p) => p.id !== player.id);
          room.targets[player.id] = opponent ? room.selections[opponent.id] : null;
        }
        room.phase = "play";
        io.to(room.roomCode).emit("who:phase", {
          phase: room.phase,
          message: "Partie en cours. Clique sur Guess pour tenter ta chance.",
        });
      }

      io.to(room.roomCode).emit("who:state", { state: serializeWhoRoom(room) });
    } catch {
      socket.emit("who:error", { message: "Erreur selection Pokemon." });
    }
  });

  socket.on("who:guess", async (payload = {}) => {
    try {
      await ensureDataLoaded();
      const room = getWhoRoomFromPayload(payload);
      if (!room || !room.started || room.phase !== "play" || room.winnerId) {
        return;
      }

      const me = room.players.find((p) => p.id === socket.id);
      if (!me) {
        return;
      }

      const guessedId = resolveBoardPokemonId(room, payload);
      if (!guessedId) {
        socket.emit("who:error", { message: "Pokemon invalide pour cette grille." });
        return;
      }

      const myTargetId = room.targets[me.id];
      const opponent = room.players.find((p) => p.id !== me.id);
      if (!myTargetId || !opponent) {
        return;
      }

      const didWin = guessedId === myTargetId;
      const winner = didWin ? me : opponent;
      const loser = didWin ? opponent : me;

      room.winnerId = winner.id;
      room.started = false;
      room.phase = "ended";

      const guessedPokemon = room.board.find((p) => p.id === guessedId);
      const correctPokemon = room.board.find((p) => p.id === myTargetId);
      const secretsByPlayer = {};
      for (const player of room.players) {
        const selectedId = room.selections[player.id];
        secretsByPlayer[player.id] = room.board.find((p) => p.id === selectedId) || null;
      }

      io.to(room.roomCode).emit("who:gameOver", {
        winnerId: winner.id,
        loserId: loser.id,
        guessedPokemon,
        correctPokemon,
        playerOrder: room.players.map((player) => player.id),
        secretsByPlayer,
        message: didWin
          ? `${me.name} a trouve le bon Pokemon et gagne la partie.`
          : `${me.name} a fait un mauvais guess et perd instantanement.`,
      });

      io.to(room.roomCode).emit("who:state", { state: serializeWhoRoom(room) });
    } catch {
      socket.emit("who:error", { message: "Erreur guess final." });
    }
  });

  socket.on("disconnect", () => {
    for (const room of duelRooms.values()) {
      const idx = room.players.findIndex((p) => p.id === socket.id);
      if (idx === -1) {
        continue;
      }

      const [leaver] = room.players.splice(idx, 1);
      delete room.scores[leaver.id];

      clearRoomTimeout(room);
      room.started = false;
      room.currentRound = null;

      if (!room.players.length) {
        duelRooms.delete(room.roomCode);
        continue;
      }

      // Promote remaining player as host.
      room.players[0].isHost = true;
      io.to(room.roomCode).emit("duel:state", { state: serializeRoom(room) });
      io.to(room.roomCode).emit("duel:error", { message: "Adversaire deconnecte." });
    }

    for (const room of whoRooms.values()) {
      const idx = room.players.findIndex((p) => p.id === socket.id);
      if (idx === -1) {
        continue;
      }

      room.players.splice(idx, 1);
      room.started = false;
      room.phase = "lobby";
      room.selections = {};
      room.targets = {};
      room.winnerId = null;

      if (!room.players.length) {
        whoRooms.delete(room.roomCode);
        continue;
      }

      room.players[0].isHost = true;
      io.to(room.roomCode).emit("who:state", { state: serializeWhoRoom(room) });
      io.to(room.roomCode).emit("who:error", { message: "Adversaire deconnecte." });
    }
  });
});

async function ensureDataLoaded() {
  if (duelData.loaded) {
    return;
  }

  if (duelData.loadingPromise) {
    await duelData.loadingPromise;
    return;
  }

  duelData.loadingPromise = loadDuelData();
  await duelData.loadingPromise;
  duelData.loadingPromise = null;
  duelData.loaded = true;
}

async function loadDuelData() {
  const listResponse = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${MAX_GEN8_ID}`);
  if (!listResponse.ok) {
    throw new Error("List fetch failed");
  }

  const listData = await listResponse.json();
  const urls = listData.results.map((item) => item.url);

  const allDetailed = [];
  const chunkSize = 24;

  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) {
          return null;
        }

        const p = await response.json();
        if (p.id > MAX_GEN8_ID || !Array.isArray(p.types) || p.types.length < 1) {
          return null;
        }

        const typeNames = p.types.map((t) => t.type.name).sort();
        return {
          id: p.id,
          name: p.name,
          displayNameEn: toDisplayName(p.name),
          types: typeNames,
          comboKey: typeNames.length === 2 ? buildComboKey(typeNames[0], typeNames[1]) : "",
          artwork: p.sprites?.other?.["official-artwork"]?.front_default || p.sprites?.front_default || "",
        };
      })
    );

    allDetailed.push(...results.filter(Boolean));
  }

  const byIdFrench = new Map();

  for (let i = 0; i < allDetailed.length; i += chunkSize) {
    const chunk = allDetailed.slice(i, i + chunkSize);
    const speciesRows = await Promise.all(
      chunk.map(async (p) => {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${p.id}`);
        if (!response.ok) {
          return { id: p.id, fr: p.displayNameEn };
        }

        const species = await response.json();
        const frName = species.names?.find((n) => n.language?.name === "fr")?.name;
        return { id: p.id, fr: frName || p.displayNameEn };
      })
    );

    for (const row of speciesRows) {
      byIdFrench.set(row.id, row.fr);
    }
  }

  const localized = allDetailed.map((p) => ({
    ...p,
    displayNameFr: byIdFrench.get(p.id) || p.displayNameEn,
  }));

  const duelCandidates = localized.filter((pokemon) => pokemon.types.length === 2);

  const byCombo = new Map();
  for (const pokemon of duelCandidates) {
    if (!byCombo.has(pokemon.comboKey)) {
      byCombo.set(pokemon.comboKey, []);
    }
    byCombo.get(pokemon.comboKey).push(pokemon);
  }

  duelData.allPokemon = localized;
  duelData.comboEntries = Array.from(byCombo.entries())
    .map(([comboKey, pokemon]) => ({
      comboKey,
      types: comboKey.split("|"),
      pokemon,
      count: pokemon.length,
      acceptedNames: new Set(
        pokemon.flatMap((p) => [normalize(p.name), normalize(p.displayNameEn), normalize(p.displayNameFr)])
      ),
    }))
    .sort((a, b) => b.count - a.count || a.comboKey.localeCompare(b.comboKey));

  duelData.levelBuckets = Array.from({ length: 10 }, (_, idx) => {
    const start = Math.floor((idx * duelData.comboEntries.length) / 10);
    const end = Math.floor(((idx + 1) * duelData.comboEntries.length) / 10);
    return duelData.comboEntries.slice(start, end);
  });
}

function startNextRound(room) {
  if (!room.started || room.players.length !== 2) {
    return;
  }

  const levelIdx = Math.max(0, Math.min(9, room.level - 1));
  const levelPool = duelData.levelBuckets[levelIdx] || [];
  const candidates = levelPool.filter((entry) => !room.usedCombos.has(entry.comboKey));
  const fallback = duelData.comboEntries.filter((entry) => !room.usedCombos.has(entry.comboKey));
  const pickFrom = candidates.length ? candidates : fallback;

  if (!pickFrom.length) {
    room.usedCombos.clear();
    startNextRound(room);
    return;
  }

  const selected = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  room.usedCombos.add(selected.comboKey);

  room.currentRound = {
    comboKey: selected.comboKey,
    types: selected.types,
    acceptedNames: selected.acceptedNames,
    endsAt: Date.now() + ROUND_DURATION_MS,
    locked: false,
  };

  io.to(room.roomCode).emit("duel:round", {
    types: selected.types,
    endsAt: room.currentRound.endsAt,
  });

  clearRoomTimeout(room);
  room.timeout = setTimeout(() => {
    if (!room.currentRound || room.currentRound.locked) {
      return;
    }

    room.currentRound.locked = true;
    io.to(room.roomCode).emit("duel:roundResult", {
      scores: room.scores,
      message: "Temps ecoule. Aucun point ce round.",
    });
    room.timeout = setTimeout(() => {
      startNextRound(room);
    }, 1200);
  }, ROUND_DURATION_MS + 20);
}

function clearRoomTimeout(room) {
  if (room.timeout) {
    clearTimeout(room.timeout);
    room.timeout = null;
  }
}

function createRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  } while (duelRooms.has(code) || whoRooms.has(code));
  return code;
}

function createPlayer(socket, name, isHost) {
  return {
    id: socket.id,
    name: String(name || "Joueur").slice(0, 24),
    isHost,
    lastGuessAt: 0,
  };
}

function getRoomFromPayload(payload) {
  const roomCode = String(payload.roomCode || "").trim().toUpperCase();
  return duelRooms.get(roomCode);
}

function getWhoRoomFromPayload(payload) {
  const roomCode = String(payload.roomCode || "").trim().toUpperCase();
  return whoRooms.get(roomCode);
}

function serializeRoom(room) {
  return {
    roomCode: room.roomCode,
    started: room.started,
    level: room.level,
    players: room.players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost })),
    scores: room.scores,
  };
}

function serializeWhoRoom(room) {
  const selectedBy = {};
  for (const player of room.players) {
    selectedBy[player.id] = Boolean(room.selections[player.id]);
  }

  return {
    roomCode: room.roomCode,
    started: room.started,
    phase: room.phase,
    winnerId: room.winnerId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost })),
    selectedBy,
    board: room.board,
  };
}

function getOtherScore(room, playerId) {
  const other = room.players.find((p) => p.id !== playerId);
  return other ? room.scores[other.id] || 0 : 0;
}

function buildComboKey(typeA, typeB) {
  return [typeA, typeB].sort().join("|");
}

function pickRandomPokemon(pool, amount) {
  const list = [...pool];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, Math.min(amount, list.length));
}

function buildBoardNameIndex(board) {
  const index = new Map();
  for (const pokemon of board) {
    const aliases = [pokemon.name, pokemon.displayNameEn, pokemon.displayNameFr];
    for (const alias of aliases) {
      index.set(normalize(alias), pokemon.id);
    }
  }
  return index;
}

function resolveBoardPokemonId(room, payload) {
  const numericId = Number(payload.pokemonId);
  if (Number.isInteger(numericId) && room.board.some((p) => p.id === numericId)) {
    return numericId;
  }

  const guess = normalize(payload.guess || payload.name || "");
  if (!guess) {
    return null;
  }

  const resolved = room.boardNameIndex.get(guess);
  return resolved || null;
}

function normalize(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toDisplayName(name) {
  return String(name)
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

server.listen(PORT, () => {
  console.log(`PokeGuesser server running on http://localhost:${PORT}`);
});
