const MAX_GEN8_ID = 905;
const BASE_TIME_SECONDS = 30;
const BONUS_TIME_SECONDS = 10;
const HINT_WINDOW_SECONDS = 10;

const dom = {
  menuScreen: document.getElementById("menuScreen"),
  gameScreen: document.getElementById("gameScreen"),
  duelScreen: document.getElementById("duelScreen"),
  whoScreen: document.getElementById("whoScreen"),
  languageSelect: document.getElementById("languageSelect"),
  startInfiniteBtn: document.getElementById("startInfiniteBtn"),
  duelBtn: document.getElementById("duelBtn"),
  whoBtn: document.getElementById("whoBtn"),
  scoreValue: document.getElementById("scoreValue"),
  levelValue: document.getElementById("levelValue"),
  timerValue: document.getElementById("timerValue"),
  challengeTitle: document.getElementById("challengeTitle"),
  challengeTypes: document.getElementById("challengeTypes"),
  challengeSubtitle: document.getElementById("challengeSubtitle"),
  pokemonInput: document.getElementById("pokemonInput"),
  submitGuessBtn: document.getElementById("submitGuessBtn"),
  skipBtn: document.getElementById("skipBtn"),
  hintsList: document.getElementById("hintsList"),
  foundList: document.getElementById("foundList"),
  remainingCount: document.getElementById("remainingCount"),
  suggestions: document.getElementById("suggestions"),
  resultModal: document.getElementById("resultModal"),
  resultTitle: document.getElementById("resultTitle"),
  resultText: document.getElementById("resultText"),
  revealZone: document.getElementById("revealZone"),
  replayBtn: document.getElementById("replayBtn"),
  backMenuBtn: document.getElementById("backMenuBtn"),
  whoResultModal: document.getElementById("whoResultModal"),
  whoResultTitle: document.getElementById("whoResultTitle"),
  whoResultText: document.getElementById("whoResultText"),
  whoResultCloseBtn: document.getElementById("whoResultCloseBtn"),
  whoResultMenuBtn: document.getElementById("whoResultMenuBtn"),
  pokemonCardTemplate: document.getElementById("pokemonCardTemplate"),
  duelRoomValue: document.getElementById("duelRoomValue"),
  duelMyScore: document.getElementById("duelMyScore"),
  duelOpponentScore: document.getElementById("duelOpponentScore"),
  duelStatus: document.getElementById("duelStatus"),
  duelPlayerName: document.getElementById("duelPlayerName"),
  duelPreJoinBox: document.getElementById("duelPreJoinBox"),
  duelLobbyBox: document.getElementById("duelLobbyBox"),
  duelLobbyCode: document.getElementById("duelLobbyCode"),
  duelPlayersList: document.getElementById("duelPlayersList"),
  duelCreateBtn: document.getElementById("duelCreateBtn"),
  duelRoomInput: document.getElementById("duelRoomInput"),
  duelJoinBtn: document.getElementById("duelJoinBtn"),
  duelStartBtn: document.getElementById("duelStartBtn"),
  duelLeaveBtn: document.getElementById("duelLeaveBtn"),
  duelBackBtn: document.getElementById("duelBackBtn"),
  duelRoundBox: document.getElementById("duelRoundBox"),
  duelRoundTitle: document.getElementById("duelRoundTitle"),
  duelTypes: document.getElementById("duelTypes"),
  duelRoundMeta: document.getElementById("duelRoundMeta"),
  duelInput: document.getElementById("duelInput"),
  duelSuggestions: document.getElementById("duelSuggestions"),
  duelSendBtn: document.getElementById("duelSendBtn"),
  whoRoomValue: document.getElementById("whoRoomValue"),
  whoPhase: document.getElementById("whoPhase"),
  whoStatus: document.getElementById("whoStatus"),
  whoPlayerName: document.getElementById("whoPlayerName"),
  whoPreJoinBox: document.getElementById("whoPreJoinBox"),
  whoLobbyBox: document.getElementById("whoLobbyBox"),
  whoLobbyCode: document.getElementById("whoLobbyCode"),
  whoPlayersList: document.getElementById("whoPlayersList"),
  whoCreateBtn: document.getElementById("whoCreateBtn"),
  whoRoomInput: document.getElementById("whoRoomInput"),
  whoJoinBtn: document.getElementById("whoJoinBtn"),
  whoStartBtn: document.getElementById("whoStartBtn"),
  whoLeaveBtn: document.getElementById("whoLeaveBtn"),
  whoBackBtn: document.getElementById("whoBackBtn"),
  whoSelectWrap: document.getElementById("whoSelectWrap"),
  whoSelectionInfo: document.getElementById("whoSelectionInfo"),
  whoPickValidateBtn: document.getElementById("whoPickValidateBtn"),
  whoGuessWrap: document.getElementById("whoGuessWrap"),
  whoDoGuessBtn: document.getElementById("whoDoGuessBtn"),
  whoGuessValidateBtn: document.getElementById("whoGuessValidateBtn"),
  whoBoard: document.getElementById("whoBoard"),
};

const state = {
  loading: false,
  allPokemon: [],
  comboEntries: [],
  levelBuckets: [],
  roundQueue: [],
  usedCombos: new Set(),
  timerInterval: null,
  timerSeconds: BASE_TIME_SECONDS,
  timerStartedAt: 0,
  score: 0,
  level: 1,
  currentRound: null,
  currentSuggestions: [],
  selectedLanguage: "fr",
  mode: "menu",
  duel: {
    socket: null,
    connected: false,
    roomCode: "-",
    playerId: null,
    isHost: false,
    players: [],
    scores: {},
    timerInterval: null,
    roundEndsAt: 0,
    currentTypes: [],
    myScore: 0,
    opponentScore: 0,
  },
  who: {
    socket: null,
    connected: false,
    roomCode: "-",
    playerId: null,
    isHost: false,
    players: [],
    phase: "lobby",
    board: [],
    boardSignature: "",
    selectedBy: {},
    crossedIds: new Set(),
    selectedPickId: null,
    selectedGuessId: null,
    guessArmed: false,
  },
};

const generationById = [
  { min: 1, max: 151, generation: 1 },
  { min: 152, max: 251, generation: 2 },
  { min: 252, max: 386, generation: 3 },
  { min: 387, max: 493, generation: 4 },
  { min: 494, max: 649, generation: 5 },
  { min: 650, max: 721, generation: 6 },
  { min: 722, max: 809, generation: 7 },
  { min: 810, max: 905, generation: 8 },
];

init();

function init() {
  bindEvents();
}

function bindEvents() {
  dom.languageSelect.addEventListener("change", () => {
    state.selectedLanguage = dom.languageSelect.value;
    rerenderAfterLanguageSwitch();
    rerenderDuelSuggestions();
    renderWhoBoard();
  });

  dom.startInfiniteBtn.addEventListener("click", async () => {
    await startInfiniteMode();
  });

  dom.submitGuessBtn.addEventListener("click", onSubmitGuess);
  dom.skipBtn.addEventListener("click", onSkipRound);
  dom.pokemonInput.addEventListener("keydown", onInputKeyDown);
  dom.pokemonInput.addEventListener("input", onInputChange);

  document.addEventListener("click", (event) => {
    if (!dom.suggestions.contains(event.target) && event.target !== dom.pokemonInput) {
      hideSuggestions();
    }

    if (!dom.duelSuggestions.contains(event.target) && event.target !== dom.duelInput) {
      hideDuelSuggestions();
    }

  });

  dom.replayBtn.addEventListener("click", () => {
    closeModal();
    startInfiniteMode();
  });

  dom.backMenuBtn.addEventListener("click", () => {
    closeModal();
    stopTimer();
    showMenu();
  });

  dom.whoResultCloseBtn.addEventListener("click", closeWhoResultModal);
  dom.whoResultMenuBtn.addEventListener("click", () => {
    closeWhoResultModal();
    showMenu();
  });

  dom.duelBtn.addEventListener("click", startDuelMode);
  dom.whoBtn.addEventListener("click", startWhoMode);
  dom.duelCreateBtn.addEventListener("click", onDuelCreateRoom);
  dom.duelJoinBtn.addEventListener("click", onDuelJoinRoom);
  dom.duelStartBtn.addEventListener("click", onDuelStart);
  dom.duelBackBtn.addEventListener("click", onDuelBackToMenu);
  dom.duelLeaveBtn.addEventListener("click", onDuelLeaveRoom);
  dom.duelSendBtn.addEventListener("click", onDuelSendGuess);
  dom.duelInput.addEventListener("input", onDuelInputChange);
  dom.duelInput.addEventListener("keydown", onDuelInputKeyDown);

  dom.whoCreateBtn.addEventListener("click", onWhoCreateRoom);
  dom.whoJoinBtn.addEventListener("click", onWhoJoinRoom);
  dom.whoStartBtn.addEventListener("click", onWhoStart);
  dom.whoLeaveBtn.addEventListener("click", onWhoLeaveRoom);
  dom.whoBackBtn.addEventListener("click", onWhoBackToMenu);
  dom.whoPickValidateBtn.addEventListener("click", onWhoSelectTarget);
  dom.whoDoGuessBtn.addEventListener("click", onWhoDoGuessToggle);
  dom.whoGuessValidateBtn.addEventListener("click", onWhoGuess);
}

async function startInfiniteMode() {
  resetGameState();
  showGameScreen();

  if (!state.allPokemon.length || !state.comboEntries.length) {
    try {
      dom.challengeTitle.textContent = "Chargement des Pokemon...";
      dom.challengeSubtitle.textContent = "Recuperation API en cours (Gen 1 a 8)...";
      await loadPokemonData();
    } catch (error) {
      dom.challengeTitle.textContent = "Erreur de chargement";
      dom.challengeSubtitle.textContent = "Impossible de recuperer les donnees API pour le moment.";
      console.error(error);
      return;
    }
  }

  startTimer();
  startRound();
}

function resetGameState() {
  stopTimer();
  state.timerSeconds = BASE_TIME_SECONDS;
  state.score = 0;
  state.level = 1;
  state.usedCombos.clear();
  state.roundQueue = [];
  state.currentRound = null;

  dom.scoreValue.textContent = "0";
  dom.levelValue.textContent = "1 / 10";
  dom.timerValue.textContent = String(BASE_TIME_SECONDS);
  dom.hintsList.innerHTML = "";
  dom.foundList.innerHTML = "";
  dom.remainingCount.textContent = "-";
  dom.challengeTitle.textContent = "Preparation...";
  dom.challengeTypes.innerHTML = "";
  dom.challengeSubtitle.textContent = "";
  dom.pokemonInput.value = "";
  dom.pokemonInput.disabled = true;
  dom.submitGuessBtn.disabled = true;
  dom.skipBtn.disabled = true;
  hideSuggestions();
}

async function loadPokemonData() {
  if (state.loading) {
    return;
  }

  state.loading = true;
  const cached = getCache();

  if (cached) {
    state.allPokemon = cached;
    buildComboData();
    state.loading = false;
    return;
  }

  const listResponse = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=${MAX_GEN8_ID}`);
  if (!listResponse.ok) {
    throw new Error("Echec de la requete de liste Pokemon.");
  }

  const listData = await listResponse.json();
  const urls = listData.results.map((item) => item.url);

  const chunkSize = 24;
  const allDetailed = [];

  for (let i = 0; i < urls.length; i += chunkSize) {
    const chunk = urls.slice(i, i + chunkSize);
    const detailedChunk = await Promise.all(
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
          displayName: toDisplayName(p.name),
          types: typeNames,
          comboKey: buildComboKey(typeNames[0], typeNames[1]),
          generation: getGenerationFromId(p.id),
          artwork: p.sprites?.other?.["official-artwork"]?.front_default || p.sprites?.front_default || "",
        };
      })
    );

    allDetailed.push(...detailedChunk.filter(Boolean));
    dom.challengeSubtitle.textContent = `Chargement ${Math.min(i + chunk.length, urls.length)} / ${urls.length}`;
  }

  const withLocalizedNames = await enrichFrenchNames(allDetailed);
  state.allPokemon = withLocalizedNames;
  setCache(withLocalizedNames);
  buildComboData();
  state.loading = false;
}

async function enrichFrenchNames(pokemonList) {
  const chunkSize = 24;
  const byIdFrench = new Map();

  for (let i = 0; i < pokemonList.length; i += chunkSize) {
    const chunk = pokemonList.slice(i, i + chunkSize);
    const speciesChunk = await Promise.all(
      chunk.map(async (p) => {
        const response = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${p.id}`);
        if (!response.ok) {
          return { id: p.id, fr: p.displayName };
        }

        const species = await response.json();
        const frName = species.names?.find((n) => n.language?.name === "fr")?.name;
        return { id: p.id, fr: frName || p.displayName };
      })
    );

    for (const row of speciesChunk) {
      byIdFrench.set(row.id, row.fr);
    }

    dom.challengeSubtitle.textContent = `Localisation FR ${Math.min(i + chunk.length, pokemonList.length)} / ${pokemonList.length}`;
  }

  return pokemonList.map((p) => ({
    ...p,
    displayNameEn: toDisplayName(p.name),
    displayNameFr: byIdFrench.get(p.id) || toDisplayName(p.name),
  }));
}

function buildComboData() {
  const byCombo = new Map();

  for (const pokemon of state.allPokemon) {
    if (!byCombo.has(pokemon.comboKey)) {
      byCombo.set(pokemon.comboKey, []);
    }

    byCombo.get(pokemon.comboKey).push(pokemon);
  }

  state.comboEntries = Array.from(byCombo.entries())
    .map(([comboKey, pokemon]) => ({
      comboKey,
      types: comboKey.split("|"),
      pokemon,
      count: pokemon.length,
      generations: [...new Set(pokemon.map((p) => p.generation))].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.count - a.count || a.comboKey.localeCompare(b.comboKey));

  state.levelBuckets = Array.from({ length: 10 }, (_, idx) => {
    const start = Math.floor((idx * state.comboEntries.length) / 10);
    const end = Math.floor(((idx + 1) * state.comboEntries.length) / 10);
    return state.comboEntries.slice(start, end);
  });
}

function startRound() {
  const levelIdx = Math.max(0, Math.min(9, state.level - 1));
  const pool = state.levelBuckets[levelIdx].filter((entry) => !state.usedCombos.has(entry.comboKey));
  const fallback = state.comboEntries.filter((entry) => !state.usedCombos.has(entry.comboKey));
  const pickFrom = pool.length ? pool : fallback;

  if (!pickFrom.length) {
    showWinModal();
    return;
  }

  const selected = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  state.usedCombos.add(selected.comboKey);

  state.currentRound = {
    comboKey: selected.comboKey,
    types: selected.types,
    allPokemon: selected.pokemon,
    remainingIds: new Set(selected.pokemon.map((p) => p.id)),
    foundIds: new Set(),
    generations: selected.generations,
    roundStartTime: Date.now(),
    hintsRevealed: new Set(),
    foundDisplayNames: [],
  };

  dom.challengeTitle.textContent = "Double type du round";
  renderTypeBadges(dom.challengeTypes, selected.types);
  dom.challengeSubtitle.textContent = "Trouve 1 Pokemon de ce double type.";
  dom.foundList.innerHTML = "";
  dom.remainingCount.textContent = "1 bonne reponse suffit";
  dom.hintsList.innerHTML = "";

  dom.pokemonInput.disabled = false;
  dom.submitGuessBtn.disabled = false;
  dom.skipBtn.disabled = false;
  dom.pokemonInput.value = "";
  dom.pokemonInput.focus();

  updateHUD();
}

function onSubmitGuess() {
  if (!state.currentRound) {
    return;
  }

  const raw = dom.pokemonInput.value.trim();
  if (!raw) {
    return;
  }

  const guess = normalize(raw);

  const matchedPokemon = state.currentRound.allPokemon.find((pokemon) => {
    if (!state.currentRound.remainingIds.has(pokemon.id)) {
      return false;
    }

    const aliases = [pokemon.name, pokemon.displayNameEn, pokemon.displayNameFr].map(normalize);
    return aliases.includes(guess);
  });

  if (matchedPokemon) {
    state.currentRound.remainingIds.delete(matchedPokemon.id);
    state.currentRound.foundIds.add(matchedPokemon.id);
    state.score += 1;
    state.timerSeconds += BONUS_TIME_SECONDS;
    renderFound(matchedPokemon);
    updateHUD();
    state.level = Math.min(10, state.level + 1);
    startRound();
    return;
  }

  dom.pokemonInput.value = "";
  hideSuggestions();
}

function onInputKeyDown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    onSubmitGuess();
    return;
  }

  const items = Array.from(dom.suggestions.querySelectorAll("li"));
  if (!items.length) {
    return;
  }

  const currentActive = items.findIndex((el) => el.classList.contains("active"));

  if (event.key === "ArrowDown") {
    event.preventDefault();
    const next = currentActive < items.length - 1 ? currentActive + 1 : 0;
    setActiveSuggestion(items, next);
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    const prev = currentActive > 0 ? currentActive - 1 : items.length - 1;
    setActiveSuggestion(items, prev);
  }

  if (event.key === "Tab") {
    if (currentActive >= 0) {
      event.preventDefault();
      dom.pokemonInput.value = items[currentActive].dataset.value;
      hideSuggestions();
    }
  }
}

function onInputChange() {
  if (!state.currentRound) {
    return;
  }

  const input = normalize(dom.pokemonInput.value);

  if (!input) {
    hideSuggestions();
    return;
  }

  const suggestions = state.allPokemon
    .map((pokemon) => ({
      pokemon,
      label: getDisplayName(pokemon),
    }))
    .filter((entry) => {
      const allNames = [entry.pokemon.name, entry.pokemon.displayNameEn, entry.pokemon.displayNameFr]
        .map(normalize)
        .join("|");
      return allNames.includes(input);
    })
    .slice(0, 10);

  state.currentSuggestions = suggestions;
  renderSuggestions(suggestions);
}

function renderSuggestions(suggestions) {
  dom.suggestions.innerHTML = "";
  if (!suggestions.length) {
    hideSuggestions();
    return;
  }

  for (const suggestion of suggestions) {
    const li = document.createElement("li");
    li.textContent = suggestion.label;
    li.dataset.value = suggestion.label;
    li.addEventListener("mousedown", (event) => {
      event.preventDefault();
      dom.pokemonInput.value = suggestion.label;
      hideSuggestions();
      onSubmitGuess();
    });

    dom.suggestions.appendChild(li);
  }

  dom.suggestions.classList.remove("hidden");
}

function setActiveSuggestion(items, index) {
  items.forEach((item) => item.classList.remove("active"));
  const selected = items[index];
  selected.classList.add("active");
  dom.pokemonInput.value = selected.dataset.value;
}

function hideSuggestions() {
  dom.suggestions.classList.add("hidden");
  dom.suggestions.innerHTML = "";
}

function startTimer() {
  stopTimer();

  state.timerInterval = window.setInterval(() => {
    state.timerSeconds -= 1;
    updateHUD();
    revealHintsIfNeeded();

    if (state.timerSeconds <= 0) {
      handleLose();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function revealHintsIfNeeded() {
  if (!state.currentRound) {
    return;
  }

  const elapsed = Math.floor((Date.now() - state.currentRound.roundStartTime) / 1000);
  if (elapsed < 1 || elapsed > HINT_WINDOW_SECONDS) {
    return;
  }

  const step = HINT_WINDOW_SECONDS / 2;

  if (elapsed >= step && !state.currentRound.hintsRevealed.has(1)) {
    state.currentRound.hintsRevealed.add(1);
    const gens = state.currentRound.generations.map((g) => `Gen ${g}`).join(", ");
    pushHint(`Indice: Present dans ${gens}.`);
  }
}

function pushHint(text) {
  const li = document.createElement("li");
  li.textContent = text;
  dom.hintsList.appendChild(li);
}

function updateHUD() {
  dom.scoreValue.textContent = String(state.score);
  dom.levelValue.textContent = `${state.level} / 10`;
  dom.timerValue.textContent = String(Math.max(0, state.timerSeconds));
}

function renderFound(pokemon) {
  const li = document.createElement("li");
  li.textContent = getDisplayName(pokemon);
  dom.foundList.appendChild(li);
}

function handleLose() {
  stopTimer();
  dom.pokemonInput.disabled = true;
  dom.submitGuessBtn.disabled = true;
  dom.skipBtn.disabled = true;

  const missing = state.currentRound
    ? state.currentRound.allPokemon.filter((p) => state.currentRound.remainingIds.has(p.id))
    : [];

  showLoseModal(missing);
}

function showLoseModal(missingPokemon) {
  dom.resultTitle.textContent = "Defaite";
  dom.resultText.textContent = `Temps ecoule. Score final: ${state.score}. Pokemon non trouves pour ${state.currentRound.types[0]} / ${state.currentRound.types[1]}:`;
  renderRevealCards(missingPokemon);
  dom.resultModal.classList.remove("hidden");
}

function showWinModal() {
  stopTimer();
  dom.resultTitle.textContent = "Victoire";
  dom.resultText.textContent = `Tu as vide la liste des doubles types disponibles. Score final: ${state.score}.`;
  renderRevealCards([]);
  dom.resultModal.classList.remove("hidden");
}

function renderRevealCards(pokemonList) {
  dom.revealZone.innerHTML = "";

  if (!pokemonList.length) {
    const p = document.createElement("p");
    p.textContent = "Aucun Pokemon restant a afficher.";
    dom.revealZone.appendChild(p);
    return;
  }

  for (const pokemon of pokemonList) {
    const node = dom.pokemonCardTemplate.content.cloneNode(true);
    const img = node.querySelector("img");
    const name = node.querySelector(".pokemon-name");
    const types = node.querySelector(".pokemon-types");

    img.src = pokemon.artwork || "";
    img.alt = `Artwork de ${getDisplayName(pokemon)}`;
    name.textContent = getDisplayName(pokemon);
    renderTypeBadges(types, pokemon.types);

    dom.revealZone.appendChild(node);
  }
}

function renderTypeBadges(container, types) {
  container.innerHTML = "";

  for (const typeName of types) {
    const badge = document.createElement("span");
    badge.className = `type-badge type-${typeName}`;
    badge.textContent = typeName;
    container.appendChild(badge);
  }
}

function showMenu() {
  state.mode = "menu";
  dom.menuScreen.classList.remove("hidden");
  dom.menuScreen.classList.add("active");
  dom.gameScreen.classList.add("hidden");
  dom.duelScreen.classList.add("hidden");
  dom.whoScreen.classList.add("hidden");
}

function showGameScreen() {
  state.mode = "infinite";
  dom.menuScreen.classList.add("hidden");
  dom.menuScreen.classList.remove("active");
  dom.gameScreen.classList.remove("hidden");
  dom.duelScreen.classList.add("hidden");
  dom.whoScreen.classList.add("hidden");
}

function showDuelScreen() {
  state.mode = "duel";
  dom.menuScreen.classList.add("hidden");
  dom.menuScreen.classList.remove("active");
  dom.gameScreen.classList.add("hidden");
  dom.duelScreen.classList.remove("hidden");
  dom.whoScreen.classList.add("hidden");
}

function showWhoScreen() {
  state.mode = "who";
  dom.menuScreen.classList.add("hidden");
  dom.menuScreen.classList.remove("active");
  dom.gameScreen.classList.add("hidden");
  dom.duelScreen.classList.add("hidden");
  dom.whoScreen.classList.remove("hidden");
}

function closeModal() {
  dom.resultModal.classList.add("hidden");
}

function closeWhoResultModal() {
  dom.whoResultModal.classList.add("hidden");
}

function onSkipRound() {
  if (!state.currentRound) {
    return;
  }

  state.timerSeconds -= 10;
  updateHUD();

  if (state.timerSeconds <= 0) {
    handleLose();
    return;
  }

  startRound();
}

async function startDuelMode() {
  stopTimer();
  showDuelScreen();
  resetDuelUi();
  if (!state.allPokemon.length || !state.comboEntries.length) {
    dom.duelStatus.textContent = "Chargement des donnees Pokemon...";
    try {
      await loadPokemonData();
    } catch (error) {
      dom.duelStatus.textContent = "Impossible de charger les donnees Pokemon.";
      console.error(error);
      return;
    }
  }
  connectDuelSocket();
}

function resetDuelUi() {
  dom.duelRoomValue.textContent = "-";
  dom.duelLobbyCode.textContent = "-";
  dom.duelMyScore.textContent = "0";
  dom.duelOpponentScore.textContent = "0";
  dom.duelStatus.textContent = "Connecte-toi a une room pour commencer.";
  dom.duelPreJoinBox.classList.remove("hidden");
  dom.duelLobbyBox.classList.add("hidden");
  dom.duelPlayersList.innerHTML = "";
  dom.duelRoundBox.classList.add("hidden");
  dom.duelStartBtn.disabled = true;
  dom.duelInput.value = "";
  dom.duelInput.disabled = true;
  dom.duelSendBtn.disabled = true;
  dom.duelRoundMeta.textContent = "Timer: -";
  dom.duelTypes.innerHTML = "";
  stopDuelTimer();
}

function connectDuelSocket() {
  if (state.duel.socket) {
    return;
  }

  if (typeof io !== "function") {
    dom.duelStatus.textContent = "Socket.IO indisponible. Lance l app via le serveur Node.";
    return;
  }

  const socket = io();
  state.duel.socket = socket;

  socket.on("connect", () => {
    state.duel.connected = true;
    dom.duelStatus.textContent = "Connecte au serveur duel.";
  });

  socket.on("disconnect", () => {
    state.duel.connected = false;
    dom.duelStatus.textContent = "Connexion perdue. Reconnexion automatique...";
    stopDuelTimer();
    dom.duelInput.disabled = true;
    dom.duelSendBtn.disabled = true;
    setDuelJoinedState(false);
  });

  socket.on("duel:error", (payload) => {
    dom.duelStatus.textContent = payload?.message || "Erreur duel.";
  });

  socket.on("duel:roomCreated", (payload) => {
    state.duel.playerId = payload.playerId;
    state.duel.roomCode = payload.roomCode;
    state.duel.isHost = true;
    dom.duelRoomValue.textContent = payload.roomCode;
    dom.duelRoomInput.value = payload.roomCode;
    dom.duelStatus.textContent = "Room creee. Attends un adversaire.";
    setDuelJoinedState(true);
    applyDuelState(payload.state);
  });

  socket.on("duel:joined", (payload) => {
    state.duel.playerId = payload.playerId;
    state.duel.roomCode = payload.roomCode;
    state.duel.isHost = payload.isHost;
    dom.duelRoomValue.textContent = payload.roomCode;
    dom.duelStatus.textContent = payload.isHost ? "Room prete." : "Room rejointe.";
    setDuelJoinedState(true);
    applyDuelState(payload.state);
  });

  socket.on("duel:state", (payload) => {
    applyDuelState(payload.state);
  });

  socket.on("duel:round", (payload) => {
    state.duel.currentTypes = payload.types || [];
    state.duel.roundEndsAt = payload.endsAt || 0;
    dom.duelRoundBox.classList.remove("hidden");
    dom.duelRoundTitle.textContent = "Double type duel";
    renderTypeBadges(dom.duelTypes, state.duel.currentTypes);
    dom.duelStatus.textContent = "Round en cours. Premier qui trouve prend 1 point.";
    dom.duelInput.disabled = false;
    dom.duelSendBtn.disabled = false;
    dom.duelInput.value = "";
    hideDuelSuggestions();
    startDuelTimer();
  });

  socket.on("duel:roundResult", (payload) => {
    dom.duelStatus.textContent = payload.message;
    applyScore(payload.scores || {});
    dom.duelInput.disabled = true;
    dom.duelSendBtn.disabled = true;
    hideDuelSuggestions();
  });

  socket.on("duel:gameOver", (payload) => {
    stopDuelTimer();
    applyScore(payload.scores || {});
    dom.duelStatus.textContent = payload.message;
    dom.duelInput.disabled = true;
    dom.duelSendBtn.disabled = true;
    dom.duelStartBtn.disabled = !state.duel.isHost;
  });
}

function getPlayerName() {
  const name = dom.duelPlayerName.value.trim();
  return name ? name : "Joueur";
}

function onDuelCreateRoom() {
  connectDuelSocket();
  if (!state.duel.connected || !state.duel.socket) {
    return;
  }

  state.duel.socket.emit("duel:createRoom", { playerName: getPlayerName() });
}

function onDuelJoinRoom() {
  connectDuelSocket();
  if (!state.duel.connected || !state.duel.socket) {
    return;
  }

  const roomCode = dom.duelRoomInput.value.trim().toUpperCase();
  if (!roomCode) {
    dom.duelStatus.textContent = "Entre un code room.";
    return;
  }

  state.duel.socket.emit("duel:joinRoom", {
    roomCode,
    playerName: getPlayerName(),
  });
}

function onDuelStart() {
  if (!state.duel.socket) {
    return;
  }

  state.duel.socket.emit("duel:start", {
    roomCode: state.duel.roomCode,
  });
}

function onDuelBackToMenu() {
  stopDuelTimer();
  showMenu();
}

function onDuelLeaveRoom() {
  if (state.duel.socket) {
    state.duel.socket.disconnect();
    state.duel.socket = null;
    state.duel.connected = false;
  }

  state.duel.roomCode = "-";
  state.duel.playerId = null;
  state.duel.players = [];
  state.duel.scores = {};
  stopDuelTimer();
  resetDuelUi();
}

function applyDuelState(roomState) {
  if (!roomState) {
    return;
  }

  state.duel.players = roomState.players || [];
  state.duel.scores = roomState.scores || {};
  state.duel.roomCode = roomState.roomCode || state.duel.roomCode;
  dom.duelRoomValue.textContent = state.duel.roomCode || "-";
  dom.duelLobbyCode.textContent = state.duel.roomCode || "-";

  applyScore(state.duel.scores);

  const me = state.duel.players.find((p) => p.id === state.duel.playerId);
  const opponent = state.duel.players.find((p) => p.id !== state.duel.playerId);
  const twoPlayersReady = state.duel.players.length === 2;

  if (!twoPlayersReady) {
    dom.duelStatus.textContent = "En attente du 2e joueur...";
  } else if (!roomState.started) {
    dom.duelStatus.textContent = "2 joueurs connectes. Le host peut lancer.";
  }

  if (me) {
    state.duel.isHost = !!me.isHost;
  }

  dom.duelStartBtn.disabled = !(state.duel.isHost && twoPlayersReady);
  dom.duelOpponentScore.textContent = String(opponent ? state.duel.scores[opponent.id] || 0 : 0);
  renderDuelPlayers();
}

function setDuelJoinedState(isJoined) {
  dom.duelPreJoinBox.classList.toggle("hidden", isJoined);
  dom.duelLobbyBox.classList.toggle("hidden", !isJoined);
}

function renderDuelPlayers() {
  dom.duelPlayersList.innerHTML = "";

  if (!state.duel.players.length) {
    const li = document.createElement("li");
    li.className = "duel-player-row";
    li.textContent = "Aucun joueur";
    dom.duelPlayersList.appendChild(li);
    return;
  }

  for (const player of state.duel.players) {
    const li = document.createElement("li");
    li.className = "duel-player-row";

    const name = document.createElement("span");
    name.className = "duel-player-tag";
    const isMe = player.id === state.duel.playerId;
    name.textContent = `${player.name}${isMe ? " (toi)" : ""}`;

    const badge = document.createElement("span");
    badge.className = "duel-player-badge";
    if (player.isHost) {
      badge.classList.add("duel-player-host");
      badge.textContent = "Host";
    } else {
      badge.classList.add("duel-player-ready");
      badge.textContent = "Pret";
    }

    li.appendChild(name);
    li.appendChild(badge);
    dom.duelPlayersList.appendChild(li);
  }

  if (state.duel.players.length < 2) {
    const waiting = document.createElement("li");
    waiting.className = "duel-player-row";

    const label = document.createElement("span");
    label.className = "duel-player-tag";
    label.textContent = "Slot 2";

    const badge = document.createElement("span");
    badge.className = "duel-player-badge duel-player-wait";
    badge.textContent = "En attente";

    waiting.appendChild(label);
    waiting.appendChild(badge);
    dom.duelPlayersList.appendChild(waiting);
  }
}

function applyScore(scores) {
  const myId = state.duel.playerId;
  state.duel.myScore = myId ? scores[myId] || 0 : 0;

  const opponent = state.duel.players.find((p) => p.id !== myId);
  state.duel.opponentScore = opponent ? scores[opponent.id] || 0 : 0;

  dom.duelMyScore.textContent = String(state.duel.myScore);
  dom.duelOpponentScore.textContent = String(state.duel.opponentScore);
}

function startDuelTimer() {
  stopDuelTimer();
  state.duel.timerInterval = window.setInterval(() => {
    const remaining = Math.max(0, Math.ceil((state.duel.roundEndsAt - Date.now()) / 1000));
    dom.duelRoundMeta.textContent = `Timer: ${remaining}s`;
    if (remaining <= 0) {
      stopDuelTimer();
    }
  }, 250);
}

function stopDuelTimer() {
  if (state.duel.timerInterval) {
    clearInterval(state.duel.timerInterval);
    state.duel.timerInterval = null;
  }
}

function onDuelSendGuess() {
  if (!state.duel.socket || dom.duelInput.disabled) {
    return;
  }

  const guess = dom.duelInput.value.trim();
  if (!guess) {
    return;
  }

  state.duel.socket.emit("duel:guess", {
    roomCode: state.duel.roomCode,
    guess,
  });

  dom.duelInput.value = "";
  hideDuelSuggestions();
}

function onDuelInputChange() {
  const input = normalize(dom.duelInput.value);
  if (!input) {
    hideDuelSuggestions();
    return;
  }

  if (!state.allPokemon.length) {
    return;
  }

  const suggestions = state.allPokemon
    .map((pokemon) => ({ pokemon, label: getDisplayName(pokemon) }))
    .filter((entry) => {
      const allNames = [entry.pokemon.name, entry.pokemon.displayNameEn, entry.pokemon.displayNameFr]
        .map(normalize)
        .join("|");
      return allNames.includes(input);
    })
    .slice(0, 10);

  renderDuelSuggestions(suggestions);
}

function renderDuelSuggestions(suggestions) {
  dom.duelSuggestions.innerHTML = "";
  if (!suggestions.length) {
    hideDuelSuggestions();
    return;
  }

  for (const suggestion of suggestions) {
    const li = document.createElement("li");
    li.textContent = suggestion.label;
    li.dataset.value = suggestion.label;
    li.addEventListener("mousedown", (event) => {
      event.preventDefault();
      dom.duelInput.value = suggestion.label;
      hideDuelSuggestions();
      onDuelSendGuess();
    });
    dom.duelSuggestions.appendChild(li);
  }

  dom.duelSuggestions.classList.remove("hidden");
}

function hideDuelSuggestions() {
  dom.duelSuggestions.classList.add("hidden");
  dom.duelSuggestions.innerHTML = "";
}

function onDuelInputKeyDown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    onDuelSendGuess();
    return;
  }

  const items = Array.from(dom.duelSuggestions.querySelectorAll("li"));
  if (!items.length) {
    return;
  }

  const currentActive = items.findIndex((el) => el.classList.contains("active"));

  if (event.key === "ArrowDown") {
    event.preventDefault();
    const next = currentActive < items.length - 1 ? currentActive + 1 : 0;
    setActiveDuelSuggestion(items, next);
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    const prev = currentActive > 0 ? currentActive - 1 : items.length - 1;
    setActiveDuelSuggestion(items, prev);
  }
}

function setActiveDuelSuggestion(items, index) {
  items.forEach((item) => item.classList.remove("active"));
  const selected = items[index];
  selected.classList.add("active");
  dom.duelInput.value = selected.dataset.value;
}

function rerenderDuelSuggestions() {
  if (dom.duelInput.value.trim()) {
    onDuelInputChange();
  }
}

function startWhoMode() {
  stopTimer();
  showWhoScreen();
  resetWhoUi();
  connectWhoSocket();
}

function resetWhoUi() {
  dom.whoRoomValue.textContent = "-";
  dom.whoLobbyCode.textContent = "-";
  dom.whoPhase.textContent = "Lobby";
  dom.whoStatus.textContent = "Connecte-toi a une room pour commencer.";
  dom.whoPreJoinBox.classList.remove("hidden");
  dom.whoLobbyBox.classList.add("hidden");
  dom.whoSelectWrap.classList.add("hidden");
  dom.whoGuessWrap.classList.add("hidden");
  dom.whoPlayersList.innerHTML = "";
  dom.whoBoard.innerHTML = "";
  dom.whoStartBtn.disabled = true;
  dom.whoPickValidateBtn.disabled = true;
  dom.whoDoGuessBtn.disabled = true;
  dom.whoDoGuessBtn.textContent = "Faire un guess";
  dom.whoGuessValidateBtn.disabled = true;
  dom.whoSelectionInfo.textContent = "Clique une carte pour la selectionner (contour vert), puis valide.";

  state.who.selectedPickId = null;
  state.who.selectedGuessId = null;
  state.who.guessArmed = false;
}

function connectWhoSocket() {
  if (state.who.socket) {
    return;
  }

  if (typeof io !== "function") {
    dom.whoStatus.textContent = "Socket.IO indisponible. Lance l app via le serveur Node.";
    return;
  }

  const socket = io();
  state.who.socket = socket;

  socket.on("connect", () => {
    state.who.connected = true;
    dom.whoStatus.textContent = "Connecte au serveur Who.";
  });

  socket.on("disconnect", () => {
    state.who.connected = false;
    dom.whoStatus.textContent = "Connexion perdue. Reconnexion automatique...";
    setWhoJoinedState(false);
    dom.whoPickValidateBtn.disabled = true;
    dom.whoDoGuessBtn.disabled = true;
    dom.whoGuessValidateBtn.disabled = true;
  });

  socket.on("who:error", (payload) => {
    dom.whoStatus.textContent = payload?.message || "Erreur mode Who.";
  });

  socket.on("who:roomCreated", (payload) => {
    state.who.playerId = payload.playerId;
    state.who.roomCode = payload.roomCode;
    state.who.isHost = true;
    dom.whoRoomValue.textContent = payload.roomCode;
    dom.whoRoomInput.value = payload.roomCode;
    dom.whoStatus.textContent = "Room creee. Attends un adversaire.";
    setWhoJoinedState(true);
    applyWhoState(payload.state);
  });

  socket.on("who:joined", (payload) => {
    state.who.playerId = payload.playerId;
    state.who.roomCode = payload.roomCode;
    state.who.isHost = payload.isHost;
    dom.whoRoomValue.textContent = payload.roomCode;
    dom.whoStatus.textContent = payload.isHost ? "Room prete." : "Room rejointe.";
    setWhoJoinedState(true);
    applyWhoState(payload.state);
  });

  socket.on("who:state", (payload) => {
    applyWhoState(payload.state);
  });

  socket.on("who:phase", (payload) => {
    if (!payload) {
      return;
    }

    dom.whoStatus.textContent = payload.message || dom.whoStatus.textContent;
  });

  socket.on("who:gameOver", (payload) => {
    if (!payload) {
      return;
    }

    const isWinner = payload.winnerId === state.who.playerId;
    const order = Array.isArray(payload.playerOrder) ? payload.playerOrder : state.who.players.map((player) => player.id);
    const player1Id = order[0] || null;
    const player2Id = order[1] || null;
    const secrets = payload.secretsByPlayer || {};
    const player1Pokemon = secrets[player1Id] ? getDisplayName(secrets[player1Id]) : "?";
    const player2Pokemon = secrets[player2Id] ? getDisplayName(secrets[player2Id]) : "?";
    const winner = state.who.players.find((player) => player.id === payload.winnerId);
    const winnerName = winner ? winner.name : "Un joueur";

    dom.whoStatus.textContent = isWinner ? "Victoire" : "Defaite";
    dom.whoResultTitle.textContent = isWinner ? "Victoire" : "Defaite";
    dom.whoResultText.textContent = `Joueur 1 : ${player1Pokemon}\nJoueur 2 : ${player2Pokemon}\n${winnerName} a trouve le pokemon`;
    dom.whoResultModal.classList.remove("hidden");
    dom.whoDoGuessBtn.disabled = true;
    dom.whoDoGuessBtn.textContent = "Faire un guess";
    dom.whoGuessValidateBtn.disabled = true;
    state.who.guessArmed = false;
    state.who.selectedGuessId = null;
    renderWhoBoard();
  });
}

function getWhoPlayerName() {
  const name = dom.whoPlayerName.value.trim();
  return name ? name : "Joueur";
}

function onWhoCreateRoom() {
  connectWhoSocket();
  if (!state.who.connected || !state.who.socket) {
    return;
  }

  state.who.socket.emit("who:createRoom", { playerName: getWhoPlayerName() });
}

function onWhoJoinRoom() {
  connectWhoSocket();
  if (!state.who.connected || !state.who.socket) {
    return;
  }

  const roomCode = dom.whoRoomInput.value.trim().toUpperCase();
  if (!roomCode) {
    dom.whoStatus.textContent = "Entre un code room.";
    return;
  }

  state.who.socket.emit("who:joinRoom", {
    roomCode,
    playerName: getWhoPlayerName(),
  });
}

function onWhoStart() {
  if (!state.who.socket) {
    return;
  }

  state.who.socket.emit("who:start", {
    roomCode: state.who.roomCode,
  });
}

function onWhoBackToMenu() {
  showMenu();
}

function onWhoLeaveRoom() {
  if (state.who.socket) {
    state.who.socket.disconnect();
    state.who.socket = null;
    state.who.connected = false;
  }

  state.who.roomCode = "-";
  state.who.playerId = null;
  state.who.players = [];
  state.who.phase = "lobby";
  state.who.board = [];
  state.who.boardSignature = "";
  state.who.selectedBy = {};
  state.who.crossedIds.clear();
  state.who.selectedPickId = null;
  state.who.selectedGuessId = null;
  state.who.guessArmed = false;
  resetWhoUi();
}

function applyWhoState(roomState) {
  if (!roomState) {
    return;
  }

  state.who.players = roomState.players || [];
  state.who.phase = roomState.phase || "lobby";
  state.who.selectedBy = roomState.selectedBy || {};
  state.who.roomCode = roomState.roomCode || state.who.roomCode;
  dom.whoRoomValue.textContent = state.who.roomCode || "-";
  dom.whoLobbyCode.textContent = state.who.roomCode || "-";

  const nextBoard = Array.isArray(roomState.board) ? roomState.board : [];
  const nextSignature = nextBoard.map((p) => p.id).join("|");
  if (nextSignature !== state.who.boardSignature) {
    state.who.crossedIds.clear();
    state.who.selectedPickId = null;
    state.who.selectedGuessId = null;
    state.who.guessArmed = false;
  }
  state.who.boardSignature = nextSignature;
  state.who.board = nextBoard;

  const me = state.who.players.find((p) => p.id === state.who.playerId);
  const twoPlayersReady = state.who.players.length === 2;

  if (me) {
    state.who.isHost = !!me.isHost;
  }

  const phaseLabel = state.who.phase === "pick" ? "Selection" : state.who.phase === "play" ? "Jeu" : state.who.phase === "ended" ? "Termine" : "Lobby";
  dom.whoPhase.textContent = phaseLabel;

  if (!twoPlayersReady) {
    dom.whoStatus.textContent = "En attente du 2e joueur...";
  } else if (state.who.phase === "lobby") {
    dom.whoStatus.textContent = "2 joueurs connectes. Le host peut lancer.";
  } else if (state.who.phase === "pick") {
    const meSelected = Boolean(state.who.selectedBy[state.who.playerId]);
    dom.whoStatus.textContent = meSelected
      ? "Selection envoyee. Attente de l adversaire..."
      : "Choissis ton pokemon secret";
  } else if (state.who.phase === "play") {
    dom.whoStatus.textContent = "Partie en cours. Barre les cartes. Active Faire un guess pour selectionner un Pokemon.";
  }

  dom.whoStartBtn.disabled = !(state.who.isHost && twoPlayersReady && state.who.phase === "lobby");
  dom.whoSelectWrap.classList.toggle("hidden", state.who.phase !== "pick");
  dom.whoGuessWrap.classList.toggle("hidden", state.who.phase !== "play");
  dom.whoLobbyBox.classList.toggle("hidden", !(Boolean(state.who.playerId) && state.who.phase === "lobby"));

  const meSelected = Boolean(state.who.selectedBy[state.who.playerId]);
  const canSelect = state.who.phase === "pick" && !meSelected;
  dom.whoPickValidateBtn.disabled = !canSelect || !state.who.selectedPickId;

  const opponent = state.who.players.find((p) => p.id !== state.who.playerId);
  const opponentSelected = opponent ? Boolean(state.who.selectedBy[opponent.id]) : false;
  if (state.who.phase === "pick") {
    dom.whoSelectionInfo.textContent = `Toi: ${meSelected ? "valide" : "pas encore"} | Adversaire: ${opponentSelected ? "valide" : "en attente"}`;
  }

  const canGuess = state.who.phase === "play";
  dom.whoDoGuessBtn.disabled = !canGuess;
  dom.whoDoGuessBtn.textContent = state.who.guessArmed ? "Annuler le guess" : "Faire un guess";
  dom.whoGuessValidateBtn.disabled = !canGuess || !state.who.guessArmed || !state.who.selectedGuessId;

  setWhoJoinedState(Boolean(state.who.playerId));
  renderWhoPlayers();
  renderWhoBoard();
}

function setWhoJoinedState(isJoined) {
  dom.whoPreJoinBox.classList.toggle("hidden", isJoined);
}

function renderWhoPlayers() {
  dom.whoPlayersList.innerHTML = "";

  if (!state.who.players.length) {
    const li = document.createElement("li");
    li.className = "duel-player-row";
    li.textContent = "Aucun joueur";
    dom.whoPlayersList.appendChild(li);
    return;
  }

  for (const player of state.who.players) {
    const li = document.createElement("li");
    li.className = "duel-player-row";

    const name = document.createElement("span");
    name.className = "duel-player-tag";
    const isMe = player.id === state.who.playerId;
    name.textContent = `${player.name}${isMe ? " (toi)" : ""}`;

    const badge = document.createElement("span");
    badge.className = "duel-player-badge";
    if (player.isHost) {
      badge.classList.add("duel-player-host");
      badge.textContent = "Host";
    } else {
      badge.classList.add("duel-player-ready");
      badge.textContent = "Pret";
    }

    li.appendChild(name);
    li.appendChild(badge);
    dom.whoPlayersList.appendChild(li);
  }

  if (state.who.players.length < 2) {
    const waiting = document.createElement("li");
    waiting.className = "duel-player-row";

    const label = document.createElement("span");
    label.className = "duel-player-tag";
    label.textContent = "Slot 2";

    const badge = document.createElement("span");
    badge.className = "duel-player-badge duel-player-wait";
    badge.textContent = "En attente";

    waiting.appendChild(label);
    waiting.appendChild(badge);
    dom.whoPlayersList.appendChild(waiting);
  }
}

function renderWhoBoard() {
  dom.whoBoard.innerHTML = "";
  if (!state.who.board.length) {
    const p = document.createElement("p");
    p.textContent = "La grille apparaitra au lancement de la partie.";
    dom.whoBoard.appendChild(p);
    return;
  }

  for (const pokemon of state.who.board) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "who-cell";
    if (state.who.crossedIds.has(pokemon.id)) {
      cell.classList.add("crossed");
    }
    if (state.who.selectedPickId === pokemon.id) {
      cell.classList.add("pick-selected");
    }
    if (state.who.selectedGuessId === pokemon.id) {
      cell.classList.add("guess-selected");
    }

    const img = document.createElement("img");
    img.src = pokemon.artwork || "";
    img.alt = getDisplayName(pokemon);

    const name = document.createElement("p");
    name.className = "who-cell-name";
    name.textContent = getDisplayName(pokemon);

    cell.appendChild(img);
    cell.appendChild(name);
    cell.addEventListener("click", () => {
      if (state.who.phase === "pick") {
        const meSelected = Boolean(state.who.selectedBy[state.who.playerId]);
        if (meSelected) {
          return;
        }

        state.who.selectedPickId = pokemon.id;
        dom.whoPickValidateBtn.disabled = false;
        renderWhoBoard();
        return;
      }

      if (state.who.phase === "play") {
        if (state.who.guessArmed) {
          state.who.selectedGuessId = pokemon.id;
          dom.whoGuessValidateBtn.disabled = false;
        } else if (state.who.crossedIds.has(pokemon.id)) {
          state.who.crossedIds.delete(pokemon.id);
        } else {
          state.who.crossedIds.add(pokemon.id);
        }
        renderWhoBoard();
        return;
      }

      if (state.who.crossedIds.has(pokemon.id)) {
        state.who.crossedIds.delete(pokemon.id);
      } else {
        state.who.crossedIds.add(pokemon.id);
      }
      renderWhoBoard();
    });

    dom.whoBoard.appendChild(cell);
  }
}

function onWhoSelectTarget() {
  if (!state.who.socket || !state.who.selectedPickId) {
    return;
  }

  state.who.socket.emit("who:selectTarget", {
    roomCode: state.who.roomCode,
    pokemonId: state.who.selectedPickId,
  });
}

function onWhoDoGuessToggle() {
  if (state.who.phase !== "play") {
    return;
  }

  state.who.guessArmed = !state.who.guessArmed;
  if (!state.who.guessArmed) {
    state.who.selectedGuessId = null;
  }

  dom.whoDoGuessBtn.textContent = state.who.guessArmed ? "Annuler le guess" : "Faire un guess";
  dom.whoGuessValidateBtn.disabled = !state.who.guessArmed || !state.who.selectedGuessId;
  renderWhoBoard();
}

function onWhoGuess() {
  if (!state.who.socket || !state.who.guessArmed || !state.who.selectedGuessId) {
    return;
  }

  state.who.socket.emit("who:guess", {
    roomCode: state.who.roomCode,
    pokemonId: state.who.selectedGuessId,
  });

  state.who.guessArmed = false;
  state.who.selectedGuessId = null;
  dom.whoDoGuessBtn.textContent = "Faire un guess";
  dom.whoGuessValidateBtn.disabled = true;
  renderWhoBoard();
}

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function buildComboKey(typeA, typeB) {
  return [typeA, typeB].sort().join("|");
}

function getGenerationFromId(id) {
  const found = generationById.find((range) => id >= range.min && id <= range.max);
  return found ? found.generation : 0;
}

function toDisplayName(name) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

function getDisplayName(pokemon) {
  return state.selectedLanguage === "en" ? pokemon.displayNameEn : pokemon.displayNameFr;
}

function rerenderAfterLanguageSwitch() {
  if (!state.currentRound) {
    return;
  }

  const foundIds = new Set(state.currentRound.foundIds);
  dom.foundList.innerHTML = "";
  for (const pokemon of state.currentRound.allPokemon) {
    if (foundIds.has(pokemon.id)) {
      renderFound(pokemon);
    }
  }

  if (!dom.resultModal.classList.contains("hidden")) {
    const missing = state.currentRound.allPokemon.filter((p) => state.currentRound.remainingIds.has(p.id));
    renderRevealCards(missing);
  }
}

function getCache() {
  const raw = localStorage.getItem("pokeguesser.gen8.doubletypes.cache");
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data) || !parsed.timestamp) {
      return null;
    }

    const hasLocalizedNames = parsed.data.length && parsed.data[0].displayNameFr && parsed.data[0].displayNameEn;
    if (!hasLocalizedNames) {
      return null;
    }

    const maxAgeMs = 1000 * 60 * 60 * 24 * 7;
    if (Date.now() - parsed.timestamp > maxAgeMs) {
      return null;
    }

    return parsed.data;
  } catch {
    return null;
  }
}

function setCache(data) {
  localStorage.setItem(
    "pokeguesser.gen8.doubletypes.cache",
    JSON.stringify({
      timestamp: Date.now(),
      data,
    })
  );
}
