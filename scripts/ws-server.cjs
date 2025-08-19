// Simple Socket.IO standalone server for dev (no TS imports)
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.WS_PORT ? Number(process.env.WS_PORT) : 4000;
const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });

// Inlined minimal game hub (mirrors lib/ws-hub.ts)
const games = new Map();
const waitingQueue = [];
const REQUIRED_PLAYERS = process.env.WS_REQUIRED_PLAYERS ? Number(process.env.WS_REQUIRED_PLAYERS) : 4;
const playerColors = ['red', 'green', 'blue', 'yellow'];

function getOrCreateGame(gameId) {
  let g = games.get(gameId);
  if (!g) {
    const players = {
      red:   { id: 'red',   name: 'Player 1', color: '#ff3b30', state: 'center', pos: 0, offset: 0, badges: [], gold: 0, lane: null, isConnected: false },
      green: { id: 'green', name: 'Player 2', color: '#34c759', state: 'center', pos: 0, offset: 1, badges: [], gold: 0, lane: null, isConnected: false },
      blue:  { id: 'blue',  name: 'Player 3', color: '#0a84ff', state: 'center', pos: 0, offset: 2, badges: [], gold: 0, lane: null, isConnected: false },
      yellow:{ id: 'yellow',name: 'Player 4', color: '#ffd400', state: 'center', pos: 0, offset: 3, badges: [], gold: 0, lane: null, isConnected: false },
    };
    const categories = [
      'history','art','sports','geography','entertainment','science',
      'history','art','sports','geography','entertainment','roll',
      'science','history','art','sports','geography','entertainment',
      'roll','science','history','art','sports','geography',
    ];
    g = { id: gameId, currentPlayer: 'red', players, boardCategories: categories, diceValue: 0, gameStatus: 'waiting' };
    games.set(gameId, g);
  }
  return g;
}

io.on('connection', (socket) => {
  socket.on('quickJoin', (data) => {
    if (!waitingQueue.find(w => w.socketId === socket.id)) waitingQueue.push({ socketId: socket.id, address: data && data.address });
    // prune dead sockets
    for (let i = waitingQueue.length - 1; i >= 0; i--) {
      if (!io.sockets.sockets.get(waitingQueue[i].socketId)) waitingQueue.splice(i, 1);
    }
    if (waitingQueue.length >= REQUIRED_PLAYERS) {
      const group = waitingQueue.splice(0, REQUIRED_PLAYERS);
      const gameId = `game_${Date.now()}_${Math.floor(Math.random()*1000)}`;
      const game = getOrCreateGame(gameId);
      playerColors.forEach((color, idx) => {
        const entry = group[idx];
        const s = io.sockets.sockets.get(entry.socketId);
        if (!s) return;
        const p = game.players[color];
        p.isConnected = true; p.socketId = entry.socketId; p.address = entry.address;
        s.join(gameId); s.data = { gameId, playerColor: color };
        console.log(`[ws] Assigning ${color} to socket ${entry.socketId}`);
        // Add slight delay to ensure client is ready
        setTimeout(() => {
          s.emit('playerAssigned', { playerColor: color, player: p });
        }, 100);
      });
      game.gameStatus = 'playing'; game.currentPlayer = 'red';
      io.to(gameId).emit('lobbyUpdate', { connected: group.length, required: REQUIRED_PLAYERS, players: game.players, status: game.gameStatus });
      io.to(gameId).emit('gameState', game);
    } else {
      // Broadcast waiting status to all sockets still in queue
      waitingQueue.forEach(w => {
        const s = io.sockets.sockets.get(w.socketId);
        if (s) s.emit('lobbyUpdate', { connected: waitingQueue.length, required: REQUIRED_PLAYERS, players: {}, status: 'waiting' });
      });
    }
  });

  // Compute legal move options and paths for a given player and dice
  function computeMoveOptions(game, playerColor, dice) {
    const player = game.players[playerColor];
    const opts = [];
    const laneEntries = [0, 6, 12, 18];
    const laneEntryIndex = (laneId) => (laneEntries[laneId] - 1 + 24) % 24;
    const categories = game.boardCategories || [];

    // helper to build a path (array of states) and target meta
    const addOption = (label, path, meta) => {
      const id = `${playerColor}-${Date.now()}-${opts.length}`;
      opts.push({ id, label, path, meta });
    };

    if (player.state === 'center') {
      // Exit via each lane id (0..3). For simplicity, allow all lanes.
      for (let laneId = 0; laneId < 4; laneId++) {
        const laneSteps = 3;
        const entryIdx = laneEntryIndex(laneId);
        if (dice <= laneSteps) {
          // Stop inside lane at depth (3 - dice + 1)
          const depth = 3 - dice + 1;
          const path = [];
          // simulate placement steps inside lane
          for (let d = 1; d <= dice; d++) {
            const stepDepth = 3 - d + 1;
            path.push({ state: 'lane', lane: { id: laneId, depth: stepDepth, dir: 'out' } });
          }
          addOption(`Lane ${laneId} depth ${depth}`, path, { type: 'lane', laneId, depth });
        } else {
          // Exit to ring and move remaining CW and CCW
          const remaining = dice - (laneSteps + 1);
          // One step to exit to ring (landing on entryIdx)
          const base = [{ state: 'ring', pos: entryIdx }];
          const cwPath = base.concat(Array.from({ length: remaining }, (_, i) => ({ state: 'ring', pos: (entryIdx + i + 1) % 24 })));
          const ccwPath = base.concat(Array.from({ length: remaining }, (_, i) => ({ state: 'ring', pos: (entryIdx - i - 1 + 24) % 24 })));
          addOption(`Ring CW from lane ${laneId}`, cwPath, { type: 'ring', dir: 'cw' });
          addOption(`Ring CCW from lane ${laneId}`, ccwPath, { type: 'ring', dir: 'ccw' });
        }
      }
    } else if (player.state === 'ring') {
      // Two ring options: CW and CCW
      const cwPath = Array.from({ length: dice }, (_, i) => ({ state: 'ring', pos: (player.pos + i + 1) % 24 }));
      const ccwPath = Array.from({ length: dice }, (_, i) => ({ state: 'ring', pos: (player.pos - i - 1 + 24) % 24 }));
      addOption('Ring CW', cwPath, { type: 'ring', dir: 'cw' });
      addOption('Ring CCW', ccwPath, { type: 'ring', dir: 'ccw' });

      // If at entry and has 6 badges, allow entering lane towards center
      const entryIdxFor = (laneId) => laneEntryIndex(laneId);
      const atEntryLane = [0,1,2,3].find(l => entryIdxFor(l) === player.pos);
      if (atEntryLane !== undefined && (game.players[playerColor].badges || []).length >= 6) {
        // Move into lane towards center (dir 'in')
        const inPath = Array.from({ length: Math.min(3, dice) }, (_, i) => ({ state: 'lane', lane: { id: atEntryLane, depth: i+1, dir: 'in' } }));
        addOption(`Enter lane ${atEntryLane} towards center`, inPath, { type: 'lane-in', laneId: atEntryLane });
      }
    } else if (player.state === 'lane') {
      // Move along lane
      const path = [];
      let depth = player.lane && player.lane.depth || 1;
      const dir = player.lane && player.lane.dir || 'out';
      const laneId = player.lane && player.lane.id || 0;
      let remaining = dice;
      if (dir === 'out') {
        const toEdge = Math.max(0, 3 - depth);
        const stepCount = Math.min(remaining, toEdge);
        for (let i = 1; i <= stepCount; i++) path.push({ state: 'lane', lane: { id: laneId, depth: depth + i, dir: 'out' } });
        remaining -= stepCount;
        if (remaining > 0) {
          // exit to ring entry and continue CW
          const entryIdx = laneEntryIndex(laneId);
          path.push({ state: 'ring', pos: entryIdx }); // exit step
          for (let i = 1; i <= remaining; i++) path.push({ state: 'ring', pos: (entryIdx + i) % 24 });
        }
        addOption(`Lane ${laneId} outward`, path, { type: 'lane-out', laneId });
      } else {
        // dir === 'in' towards center
        const stepCount = Math.min(remaining, Math.max(0, 3 - (depth - 1)));
        for (let i = 1; i <= stepCount; i++) path.push({ state: 'lane', lane: { id: laneId, depth: depth + i, dir: 'in' } });
        addOption(`Lane ${laneId} inward`, path, { type: 'lane-in', laneId });
      }
    }
    return opts;
  }

  socket.on('rollDice', () => {
    const { gameId, playerColor } = socket.data || {};
    if (!gameId || !playerColor) return;
    const game = games.get(gameId);
    if (!game || game.gameStatus !== 'playing') return;
    if (game.currentPlayer !== playerColor) { socket.emit('error', 'Not your turn'); return; }
    const diceValue = Math.floor(Math.random()*6)+1;
    game.diceValue = diceValue;
    io.to(gameId).emit('diceRolled', { player: playerColor, value: diceValue });
    // Compute and send move options to the current player only
    const options = computeMoveOptions(game, playerColor, diceValue);
    socket.emit('moveOptions', { options, dice: diceValue });
  });

  socket.on('chooseMove', async ({ optionId }) => {
    const { gameId, playerColor } = socket.data || {};
    if (!gameId || !playerColor) return;
    const game = games.get(gameId);
    if (!game || game.gameStatus !== 'playing') return;
    if (game.currentPlayer !== playerColor) { socket.emit('error', 'Not your turn'); return; }
    // Recompute options with stored dice
    const diceValue = game.diceValue || 1;
    const options = (function(){
      try { return computeMoveOptions(game, playerColor, diceValue); } catch { return []; }
    })();
    const chosen = options.find(o => o.id === optionId) || options[0];
    if (!chosen) return;
    const player = game.players[playerColor];
    for (const step of chosen.path) {
      if (step.state === 'ring') {
        player.state = 'ring';
        player.lane = null;
        player.pos = step.pos;
      } else if (step.state === 'lane') {
        player.state = 'lane';
        player.lane = { ...step.lane };
      }
      io.to(gameId).emit('gameState', game);
      await new Promise(r => setTimeout(r, 220));
    }
    // Arrival: open question broadcast to all; only current player can answer
    const tileCategory = (() => {
      if (player.state === 'ring') {
        const idx = player.pos % (game.boardCategories.length || 24);
        return game.boardCategories[idx] || 'science';
      } else if (player.state === 'lane') {
        // Lane tiles: map to category by lane
        const map = ['history','art','sports','geography'];
        return map[player.lane.id % 4];
      }
      return 'science';
    })();
    io.to(gameId).emit('questionOpened', { category: tileCategory, askedBy: playerColor });
  });

  socket.on('movePlayer', (data) => {
    const { gameId, playerColor } = socket.data || {};
    if (!gameId || !playerColor) return;
    const game = games.get(gameId); if (!game) return;
    if (game.gameStatus !== 'playing') return;
    if (game.currentPlayer !== playerColor) { socket.emit('error', 'Not your turn'); return; }
    const player = game.players[playerColor];
    if (player && data && data.position && typeof data.position === 'object') {
      const pos = data.position;
      console.log(`[ws] Moving ${playerColor}: ${player.state}@${player.pos} -> ${pos.state}@${pos.pos}`);
      if (Object.prototype.hasOwnProperty.call(pos, 'state')) player.state = pos.state;
      if (Object.prototype.hasOwnProperty.call(pos, 'pos')) player.pos = pos.pos;
      if (Object.prototype.hasOwnProperty.call(pos, 'offset')) player.offset = pos.offset;
      if (Object.prototype.hasOwnProperty.call(pos, 'lane')) player.lane = pos.lane;
      console.log(`[ws] New position: ${player.state}@${player.pos}, offset: ${player.offset}`);
      io.to(gameId).emit('gameState', game);
    }
  });

  socket.on('questionOpened', (payload) => {
    const { gameId, playerColor } = socket.data || {};
    const game = games.get(gameId); if (!game || game.gameStatus !== 'playing') return;
    if (game.currentPlayer !== playerColor) return;
    io.to(gameId).emit('questionOpened', { ...payload, askedBy: playerColor });
  });

  socket.on('answerQuestion', (data) => {
    const { gameId, playerColor } = socket.data || {};
    const game = games.get(gameId); if (!game || game.gameStatus !== 'playing') return;
    if (game.currentPlayer !== playerColor) { socket.emit('error', 'Not your turn'); return; }
    const player = game.players[playerColor];
    if (player && data.correct) {
      const categories = ['science','history','art','sports','geography','entertainment'];
      const available = categories.filter(c => !player.badges.includes(c));
      if (available.length) player.badges.push(available[Math.floor(Math.random()*available.length)]);
      player.gold += 10;
      if (player.badges.length >= 6 && player.state === 'center') {
        game.gameStatus = 'finished'; game.winner = playerColor;
        io.to(gameId).emit('gameWon', { winner: playerColor, playerName: player.name });
      }
    }
    const connected = playerColors.filter(c => game.players[c].isConnected);
    const idx = connected.indexOf(game.currentPlayer);
    game.currentPlayer = connected[(idx+1)%connected.length];
    io.to(gameId).emit('gameState', game);
    io.to(gameId).emit('answerResult', { answeredBy: playerColor, correct: data.correct });
  });

  socket.on('disconnect', () => {
    // remove from queue
    const i = waitingQueue.findIndex(w => w.socketId === socket.id);
    if (i !== -1) waitingQueue.splice(i, 1);
    const { gameId, playerColor } = socket.data || {};
    if (!gameId || !playerColor) return;
    const game = games.get(gameId); if (!game) return;
    const player = game.players[playerColor]; if (player) { player.isConnected = false; player.socketId = undefined; }
    const connectedCount = Object.values(game.players).filter(p => p.isConnected).length;
    if (connectedCount === 0) setTimeout(() => { if (Object.values(game.players).every(p => !p.isConnected)) games.delete(gameId); }, 60000);
    io.to(gameId).emit('lobbyUpdate', { connected: connectedCount, required: 4, players: game.players, status: game.gameStatus });
    io.to(gameId).emit('gameState', game);
  });
});

server.listen(PORT, () => {
  console.log(`[ws] Socket.IO server listening on http://localhost:${PORT}`);
});


