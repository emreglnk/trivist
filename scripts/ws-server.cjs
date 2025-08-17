// Simple Socket.IO standalone server for dev (no TS imports)
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.WS_PORT ? Number(process.env.WS_PORT) : 4000;
const server = http.createServer();
const io = new Server(server, { cors: { origin: '*' } });

// Inlined minimal game hub (mirrors lib/ws-hub.ts)
const games = new Map();
const waitingQueue = [];
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
    if (waitingQueue.length >= 4) {
      const group = waitingQueue.splice(0, 4);
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
      io.to(gameId).emit('lobbyUpdate', { connected: 4, required: 4, players: game.players, status: game.gameStatus });
      io.to(gameId).emit('gameState', game);
    } else {
      socket.emit('lobbyUpdate', { connected: waitingQueue.length, required: 4, players: {}, status: 'waiting' });
    }
  });

  socket.on('rollDice', () => {
    const { gameId, playerColor } = socket.data || {};
    if (!gameId || !playerColor) return;
    const game = games.get(gameId);
    if (!game || game.gameStatus !== 'playing') return;
    if (game.currentPlayer !== playerColor) { socket.emit('error', 'Not your turn'); return; }
    const diceValue = Math.floor(Math.random()*6)+1;
    game.diceValue = diceValue;
    io.to(gameId).emit('diceRolled', { player: playerColor, value: diceValue });
    io.to(gameId).emit('gameState', game);
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


