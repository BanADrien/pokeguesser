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

const rooms = new Map();
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

      rooms.set(roomCode, room);
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
      const room = rooms.get(roomCode);

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

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
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
        rooms.delete(room.roomCode);
        continue;
      }

      // Promote remaining player as host.
      room.players[0].isHost = true;
      io.to(room.roomCode).emit("duel:state", { state: serializeRoom(room) });
      io.to(room.roomCode).emit("duel:error", { message: "Adversaire deconnecte." });
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
        if (p.id > MAX_GEN8_ID || !Array.isArray(p.types) || p.types.length !== 2) {
          return null;
        }

        const typeNames = p.types.map((t) => t.type.name).sort();
        return {
          id: p.id,
          name: p.name,
          displayNameEn: toDisplayName(p.name),
          types: typeNames,
          comboKey: buildComboKey(typeNames[0], typeNames[1]),
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

  const byCombo = new Map();
  for (const pokemon of localized) {
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
  } while (rooms.has(code));
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
  return rooms.get(roomCode);
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

function getOtherScore(room, playerId) {
  const other = room.players.find((p) => p.id !== playerId);
  return other ? room.scores[other.id] || 0 : 0;
}

function buildComboKey(typeA, typeB) {
  return [typeA, typeB].sort().join("|");
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
