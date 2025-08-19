import { Server } from "socket.io";

type PlayerColor = "red" | "green" | "blue" | "yellow";

export interface ServerPlayer {
  id: PlayerColor;
  address?: string;
  name: string;
  color: string;
  state: "center" | "ring" | "lane";
  pos: number;
  offset: number;
  badges: string[];
  gold: number;
  lane: { id: number; depth: number; dir: "in" | "out" } | null;
  socketId?: string;
  isConnected: boolean;
}

export interface GameState {
  id: string;
  currentPlayer: PlayerColor;
  players: Record<PlayerColor, ServerPlayer>;
  boardCategories: string[];
  diceValue: number;
  gameStatus: 'waiting' | 'playing' | 'finished';
  winner?: PlayerColor;
}

const games = new Map<string, GameState>();
const waitingQueue: Array<{ socketId: string; address?: string }> = [];

export function getOrCreateGame(gameId: string): GameState {
  let g = games.get(gameId);
  if (!g) {
    const players: Record<PlayerColor, ServerPlayer> = {
      red: { 
        id: "red", 
        name: "Player 1",
        color: "#ff3b30", 
        state: "center", 
        pos: 0, 
        offset: 0, 
        badges: [], 
        gold: 0,
        lane: null,
        isConnected: false
      },
      green: { 
        id: "green", 
        name: "Player 2",
        color: "#34c759", 
        state: "center", 
        pos: 0, 
        offset: 1, 
        badges: [], 
        gold: 0,
        lane: null,
        isConnected: false
      },
      blue: { 
        id: "blue", 
        name: "Player 3",
        color: "#0a84ff", 
        state: "center", 
        pos: 0, 
        offset: 2, 
        badges: [], 
        gold: 0,
        lane: null,
        isConnected: false
      },
      yellow: { 
        id: "yellow", 
        name: "Player 4",
        color: "#ffd400", 
        state: "center", 
        pos: 0, 
        offset: 3, 
        badges: [], 
        gold: 0,
        lane: null,
        isConnected: false
      },
    };
    // basic board categories like client
    const categories = [
      "history","art","sports","geography","entertainment","science",
      "history","art","sports","geography","entertainment","roll",
      "science","history","art","sports","geography","entertainment",
      "roll","science","history","art","sports","geography",
    ];
    g = { 
      id: gameId, 
      currentPlayer: "red", 
      players, 
      boardCategories: categories,
      diceValue: 0,
      gameStatus: 'waiting'
    };
    games.set(gameId, g);
  }
  return g;
}

export function bindSocketServer(io: Server) {
  io.on("connection", (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Quick matchmaking join: first 4 become a game
    socket.on("quickJoin", (data: { address?: string }) => {
      // Avoid duplicates
      if (waitingQueue.find(w => w.socketId === socket.id)) return;
      waitingQueue.push({ socketId: socket.id, address: data?.address });

      // Clean up disconnected sockets from queue
      for (let i = waitingQueue.length - 1; i >= 0; i--) {
        if (!io.sockets.sockets.get(waitingQueue[i].socketId)) {
          waitingQueue.splice(i, 1);
        }
      }

      if (waitingQueue.length >= 4) {
        // Create a new game and assign first 4 waiting
        const group = waitingQueue.splice(0, 4);
        const gameId = `game_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const game = getOrCreateGame(gameId);
        const colors: PlayerColor[] = ['red', 'green', 'blue', 'yellow'];

        colors.forEach((color, idx) => {
          const entry = group[idx];
          const s = io.sockets.sockets.get(entry.socketId);
          if (!s) return;
          const p = game.players[color];
          p.isConnected = true;
          p.socketId = entry.socketId;
          p.address = entry.address;
          s.join(gameId);
          (s as any).data = { gameId, playerColor: color };
          s.emit("playerAssigned", { playerColor: color, player: p });
        });

        game.gameStatus = 'playing';
        game.currentPlayer = 'red';
        io.to(gameId).emit("lobbyUpdate", { connected: 4, required: 4, players: game.players, status: game.gameStatus });
        io.to(gameId).emit("gameState", game);
      } else {
        // Inform queued players about queue size
        try {
          socket.emit("lobbyUpdate", { connected: waitingQueue.length, required: 4, players: {}, status: 'waiting' });
        } catch {}
      }
    });

    socket.on("joinRoom", (data: { roomId: string; address?: string; signature?: string; playerColor?: PlayerColor }) => {
      const gameId = data.roomId || "default";
      const game = getOrCreateGame(gameId);
      
      // Find available player slot or assign based on playerColor
      const playerColor = data.playerColor || findAvailablePlayerSlot(game);
      const player = game.players[playerColor];
      
      if (player) {
        player.isConnected = true;
        player.socketId = socket.id;
        if (data.address) {
          player.address = data.address;
        }
        
        socket.join(gameId);
        socket.data = { gameId, playerColor } as { gameId: string; playerColor: PlayerColor };
        
        // Start game if enough players (require 4)
        const connectedPlayers = Object.values(game.players).filter(p => p.isConnected).length;
        if (connectedPlayers >= 4 && game.gameStatus === 'waiting') {
          game.gameStatus = 'playing';
          game.currentPlayer = 'red';
        }

        // Send lobby status and updated game state to all players in room
        io.to(gameId).emit("lobbyUpdate", { connected: connectedPlayers, required: 4, players: game.players, status: game.gameStatus });
        io.to(gameId).emit("gameState", game);
        socket.emit("playerAssigned", { playerColor, player });
      }
    });

    socket.on("rollDice", () => {
      const { gameId, playerColor } = (socket.data as { gameId?: string; playerColor?: PlayerColor }) || {};
      if (!gameId || !playerColor) return;
      
      const game = games.get(gameId);
      if (!game || game.gameStatus !== 'playing') return;
      
      // Check if it's player's turn
      if (game.currentPlayer !== playerColor) {
        socket.emit("error", "Not your turn");
        return;
      }
      
      // Roll dice
      const diceValue = Math.floor(Math.random() * 6) + 1;
      game.diceValue = diceValue;
      
      io.to(gameId).emit("diceRolled", { player: playerColor, value: diceValue });
      io.to(gameId).emit("gameState", game);
      // Compute and send move options to the current player only
      try {
        const options = computeMoveOptions(game, playerColor, diceValue);
        socket.emit("moveOptions", { options, dice: diceValue });
      } catch {}
    });

    socket.on("chooseMove", async ({ optionId }: { optionId: string }) => {
      const { gameId, playerColor } = (socket.data as { gameId?: string; playerColor?: PlayerColor }) || {};
      if (!gameId || !playerColor) return;
      const game = games.get(gameId);
      if (!game || game.gameStatus !== 'playing') return;
      if (game.currentPlayer !== playerColor) { socket.emit("error", "Not your turn"); return; }
      // Recompute options with stored dice
      const diceValue = game.diceValue || 1;
      let options: ReturnType<typeof computeMoveOptions> = [];
      try { options = computeMoveOptions(game, playerColor, diceValue); } catch { options = []; }
      const chosen = options.find(o => o.id === optionId) || options[0];
      if (!chosen) return;
      const player = game.players[playerColor];
      for (const step of chosen.path) {
        if ((step as any).state === 'ring') {
          player.state = 'ring';
          player.lane = null;
          player.pos = (step as any).pos as number;
        } else if ((step as any).state === 'lane') {
          player.state = 'lane';
          player.lane = { ...(step as any).lane };
        }
        io.to(gameId).emit("gameState", game);
        await new Promise(r => setTimeout(r, 220));
      }
      // Arrival: determine category and open question for all
      const tileCategory = (() => {
        if (player.state === 'ring') {
          const idx = player.pos % (game.boardCategories.length || 24);
          return game.boardCategories[idx] || 'science';
        } else if (player.state === 'lane' && player.lane) {
          const map = ['history','art','sports','geography'];
          return map[player.lane.id % 4];
        }
        return 'science';
      })();
      io.to(gameId).emit("questionOpened", { category: tileCategory, askedBy: playerColor });
    });

    socket.on("movePlayer", (data: { position: { state: string; pos: number; lane?: any } }) => {
      const { gameId, playerColor } = (socket.data as { gameId?: string; playerColor?: PlayerColor }) || {};
      if (!gameId || !playerColor) return;
      
      const game = games.get(gameId);
      if (!game) return;
      if (game.gameStatus !== 'playing') return;
      if (game.currentPlayer !== playerColor) {
        socket.emit("error", "Not your turn");
        return;
      }
      
      const player = game.players[playerColor];
      if (player) {
        // Update player position
        player.state = data.position.state as any;
        player.pos = data.position.pos;
        if (data.position.lane) {
          player.lane = data.position.lane;
        }
        
        io.to(gameId).emit("gameState", game);
      }
    });

    // Broadcast question opened so all clients can see it (only current player can answer)
    socket.on("questionOpened", (payload: { category: string; question: string; options: string[] }) => {
      const { gameId, playerColor } = (socket.data as { gameId?: string; playerColor?: PlayerColor }) || {};
      if (!gameId || !playerColor) return;
      const game = games.get(gameId);
      if (!game || game.gameStatus !== 'playing') return;
      if (game.currentPlayer !== playerColor) return; // only current player can open
      io.to(gameId).emit("questionOpened", { ...payload, askedBy: playerColor });
    });

    socket.on("answerQuestion", (data: { correct: boolean }) => {
      const { gameId, playerColor } = (socket.data as { gameId?: string; playerColor?: PlayerColor }) || {};
      if (!gameId || !playerColor) return;
      
      const game = games.get(gameId);
      if (!game) return;
      if (game.gameStatus !== 'playing') return;
      if (game.currentPlayer !== playerColor) {
        socket.emit("error", "Not your turn");
        return;
      }
      
      const player = game.players[playerColor];
      if (player && data.correct) {
        // Award badge and gold
        const categories = ['science', 'history', 'art', 'sports', 'geography', 'entertainment'];
        const availableCategories = categories.filter(cat => !player.badges.includes(cat));
        
        if (availableCategories.length > 0) {
          const randomCategory = availableCategories[Math.floor(Math.random() * availableCategories.length)];
          player.badges.push(randomCategory);
        }
        
        player.gold += 10;
        
        // Check victory condition
        if (player.badges.length >= 6 && player.state === 'center') {
          game.gameStatus = 'finished';
          game.winner = playerColor;
          io.to(gameId).emit("gameWon", { winner: playerColor, playerName: player.name });
        }
      }
      
      // Move to next player
      const playerColors: PlayerColor[] = ['red', 'green', 'blue', 'yellow'];
      const connectedPlayers = playerColors.filter(color => game.players[color].isConnected);
      const currentIndex = connectedPlayers.indexOf(game.currentPlayer);
      const nextIndex = (currentIndex + 1) % connectedPlayers.length;
      game.currentPlayer = connectedPlayers[nextIndex];
      
      io.to(gameId).emit("gameState", game);
      io.to(gameId).emit("answerResult", { answeredBy: playerColor, correct: data.correct });
    });

    socket.on("disconnect", () => {
      const { gameId, playerColor } = (socket.data as { gameId?: string; playerColor?: PlayerColor }) || {};
      // Remove from matchmaking queue if present
      const idx = waitingQueue.findIndex(w => w.socketId === socket.id);
      if (idx !== -1) waitingQueue.splice(idx, 1);
      if (gameId && playerColor) {
        const game = games.get(gameId);
        if (game) {
          const player = game.players[playerColor];
          if (player) {
            player.isConnected = false;
            player.socketId = undefined;
          }
          
          // Check if any players are still connected
          const connectedPlayers = Object.values(game.players).filter(p => p.isConnected).length;
          if (connectedPlayers === 0) {
            // Clean up empty game after some time
            setTimeout(() => {
              if (Object.values(game.players).every(p => !p.isConnected)) {
                games.delete(gameId);
              }
            }, 60000); // 1 minute
          }
          
          io.to(gameId).emit("lobbyUpdate", { connected: connectedPlayers, required: 4, players: game.players, status: game.gameStatus });
          io.to(gameId).emit("gameState", game);
        }
      }
      console.log(`Player disconnected: ${socket.id}`);
    });
  });
}

// Compute legal move options and step-by-step paths for a given player and dice
function computeMoveOptions(game: GameState, playerColor: PlayerColor, dice: number) {
  const player = game.players[playerColor];
  type Step = { state: 'ring'; pos: number } | { state: 'lane'; lane: { id: number; depth: number; dir: 'in' | 'out' } };
  const opts: Array<{ id: string; label: string; path: Step[]; meta: any }> = [];
  const laneEntries = [0, 6, 12, 18];
  const laneEntryIndex = (laneId: number) => (laneEntries[laneId] - 1 + 24) % 24;
  
  const addOption = (label: string, path: Step[], meta: any) => {
    const id = `${playerColor}-${Date.now()}-${opts.length}`;
    opts.push({ id, label, path, meta });
  };
  
  if (player.state === 'center') {
    for (let laneId = 0; laneId < 4; laneId++) {
      const laneSteps = 3;
      const entryIdx = laneEntryIndex(laneId);
      if (dice <= laneSteps) {
        const depth = 3 - dice + 1;
        const path: Step[] = [];
        for (let d = 1; d <= dice; d++) {
          const stepDepth = 3 - d + 1;
          path.push({ state: 'lane', lane: { id: laneId, depth: stepDepth, dir: 'out' } });
        }
        addOption(`Lane ${laneId} depth ${depth}`, path, { type: 'lane', laneId, depth });
      } else {
        const remaining = dice - (laneSteps + 1);
        const base: Step[] = [{ state: 'ring', pos: entryIdx }];
        const cwPath: Step[] = base.concat(Array.from({ length: remaining }, (_, i) => ({ state: 'ring', pos: (entryIdx + i + 1) % 24 })));
        const ccwPath: Step[] = base.concat(Array.from({ length: remaining }, (_, i) => ({ state: 'ring', pos: (entryIdx - i - 1 + 24) % 24 })));
        addOption(`Ring CW from lane ${laneId}`, cwPath, { type: 'ring', dir: 'cw' });
        addOption(`Ring CCW from lane ${laneId}`, ccwPath, { type: 'ring', dir: 'ccw' });
      }
    }
  } else if (player.state === 'ring') {
    const cwPath: Step[] = Array.from({ length: dice }, (_, i) => ({ state: 'ring', pos: (player.pos + i + 1) % 24 }));
    const ccwPath: Step[] = Array.from({ length: dice }, (_, i) => ({ state: 'ring', pos: (player.pos - i - 1 + 24) % 24 }));
    addOption('Ring CW', cwPath, { type: 'ring', dir: 'cw' });
    addOption('Ring CCW', ccwPath, { type: 'ring', dir: 'ccw' });
    const entryIdxFor = (laneId: number) => laneEntryIndex(laneId);
    const atEntryLane = [0,1,2,3].find((l) => entryIdxFor(l) === player.pos);
    if (atEntryLane !== undefined && (game.players[playerColor].badges || []).length >= 6) {
      const inPath: Step[] = Array.from({ length: Math.min(3, dice) }, (_, i) => ({ state: 'lane', lane: { id: atEntryLane as number, depth: i + 1, dir: 'in' } }));
      addOption(`Enter lane ${atEntryLane} towards center`, inPath, { type: 'lane-in', laneId: atEntryLane });
    }
  } else if (player.state === 'lane' && player.lane) {
    const path: Step[] = [];
    let depth = player.lane.depth || 1;
    const dir = player.lane.dir || 'out';
    const laneId = player.lane.id || 0;
    let remaining = dice;
    if (dir === 'out') {
      const toEdge = Math.max(0, 3 - depth);
      const stepCount = Math.min(remaining, toEdge);
      for (let i = 1; i <= stepCount; i++) path.push({ state: 'lane', lane: { id: laneId, depth: depth + i, dir: 'out' } });
      remaining -= stepCount;
      if (remaining > 0) {
        const entryIdx = laneEntryIndex(laneId);
        path.push({ state: 'ring', pos: entryIdx });
        for (let i = 1; i <= remaining; i++) path.push({ state: 'ring', pos: (entryIdx + i) % 24 });
      }
      addOption(`Lane ${laneId} outward`, path, { type: 'lane-out', laneId });
    } else {
      const stepCount = Math.min(remaining, Math.max(0, 3 - (depth - 1)));
      for (let i = 1; i <= stepCount; i++) path.push({ state: 'lane', lane: { id: laneId, depth: depth + i, dir: 'in' } });
      addOption(`Lane ${laneId} inward`, path, { type: 'lane-in', laneId });
    }
  }
  return opts;
}

function findAvailablePlayerSlot(game: GameState): PlayerColor {
  const playerColors: PlayerColor[] = ['red', 'green', 'blue', 'yellow'];
  for (const color of playerColors) {
    if (!game.players[color].isConnected) {
      return color;
    }
  }
  return 'red'; // fallback
}


