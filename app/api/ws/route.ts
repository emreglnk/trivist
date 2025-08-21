export const runtime = 'edge';
export const dynamic = 'force-dynamic';

type PlayerColor = 'red' | 'green' | 'blue' | 'yellow';

interface ServerPlayer {
  id: PlayerColor;
  name: string;
  color: string;
  state: 'center' | 'ring' | 'lane';
  pos: number;
  offset: number;
  badges: string[];
  gold: number;
  lane: { id: number; depth: number; dir: 'in' | 'out' } | null;
  address?: string;
  isConnected: boolean;
  socket?: WebSocket;
}

interface GameState {
  id: string;
  players: Record<PlayerColor, ServerPlayer>;
  currentPlayer: PlayerColor;
  diceValue: number;
  gameStatus: 'waiting' | 'playing' | 'finished';
  winner?: PlayerColor;
}

// In-memory hub within the Edge worker instance
const games = new Map<string, GameState>();
const waitingQueue: { socket: WebSocket; address?: string }[] = [];
const playerColors: PlayerColor[] = ['red', 'green', 'blue', 'yellow'];
const connMeta = new Map<WebSocket, { gameId?: string; playerColor?: PlayerColor }>();

function getOrCreateGame(gameId: string): GameState {
  let g = games.get(gameId);
  if (!g) {
    const players: Record<PlayerColor, ServerPlayer> = {
      red:   { id: 'red',   name: 'Player 1', color: '#ff3b30', state: 'center', pos: 0, offset: 0, badges: [], gold: 0, lane: null, isConnected: false },
      green: { id: 'green', name: 'Player 2', color: '#34c759', state: 'center', pos: 0, offset: 1, badges: [], gold: 0, lane: null, isConnected: false },
      blue:  { id: 'blue',  name: 'Player 3', color: '#0a84ff', state: 'center', pos: 0, offset: 2, badges: [], gold: 0, lane: null, isConnected: false },
      yellow:{ id: 'yellow',name: 'Player 4', color: '#ffd400', state: 'center', pos: 0, offset: 3, badges: [], gold: 0, lane: null, isConnected: false },
    };
    g = { id: gameId, currentPlayer: 'red', players, diceValue: 0, gameStatus: 'waiting' };
    games.set(gameId, g);
  }
  return g;
}

function send(ws: WebSocket, data: any) {
  try { ws.send(JSON.stringify(data)); } catch {}
}

function broadcast(game: GameState, data: any) {
  (Object.values(game.players) as ServerPlayer[]).forEach(p => {
    if (p.socket) send(p.socket, data);
  });
}

export async function GET(request: Request) {
  const upgradeHeader = request.headers.get('upgrade') || '';
  if (upgradeHeader.toLowerCase() !== 'websocket') {
    console.log('[ws] Non-upgrade request received');
    return new Response('Expected websocket', { status: 426 });
  }

  const pair: any = new (globalThis as any).WebSocketPair();
  const client: any = pair[0];
  const server: any = pair[1];
  const ws = server as unknown as WebSocket;

  // @ts-ignore accept is provided by Edge runtime WebSocket
  ws.accept();
  console.log('[ws] Connection accepted');

  ws.addEventListener('message', (event: MessageEvent) => {
    let msg: any;
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
    } catch {
      send(ws, { type: 'error', error: 'Invalid JSON' });
      return;
    }
    try { console.log('[ws] message:', msg?.type); } catch {}
    const meta = connMeta.get(ws) || {};
    switch (msg.type) {
      case 'quickJoin': {
        // dedup existing in queue
        if (!waitingQueue.find(w => w.socket === ws)) waitingQueue.push({ socket: ws, address: msg.address });
        // prune dead sockets
        for (let i = waitingQueue.length - 1; i >= 0; i--) {
          try { waitingQueue[i].socket.send(''); } catch { waitingQueue.splice(i, 1); }
        }
        if (waitingQueue.length >= 4) {
          const group = waitingQueue.splice(0, 4);
          const gameId = `game_${Date.now()}_${Math.floor(Math.random()*1000)}`;
          const game = getOrCreateGame(gameId);
          playerColors.forEach((color, idx) => {
            const entry = group[idx];
            const p = game.players[color];
            p.isConnected = true;
            p.address = entry.address;
            p.socket = entry.socket;
            connMeta.set(entry.socket, { gameId, playerColor: color });
            // small delay similar to socket.io version
            setTimeout(() => send(entry.socket!, { type: 'playerAssigned', playerColor: color, player: p }), 50);
          });
          game.gameStatus = 'playing';
          game.currentPlayer = 'red';
          broadcast(game, { type: 'lobbyUpdate', connected: 4, required: 4, players: game.players, status: game.gameStatus });
          broadcast(game, { type: 'gameState', ...game });
        } else {
          send(ws, { type: 'lobbyUpdate', connected: waitingQueue.length, required: 4, players: {}, status: 'waiting' });
        }
        break;
      }
      case 'rollDice': {
        const { gameId, playerColor } = meta;
        if (!gameId || !playerColor) break;
        const game = games.get(gameId);
        if (!game || game.gameStatus !== 'playing') break;
        if (game.currentPlayer !== playerColor) { send(ws, { type: 'error', error: 'Not your turn' }); break; }
        const diceValue = Math.floor(Math.random()*6)+1;
        game.diceValue = diceValue;
        broadcast(game, { type: 'diceRolled', player: playerColor, value: diceValue });
        broadcast(game, { type: 'gameState', ...game });
        break;
      }
      case 'movePlayer': {
        const { gameId, playerColor } = meta;
        if (!gameId || !playerColor) break;
        const game = games.get(gameId); if (!game) break;
        if (game.gameStatus !== 'playing') break;
        if (game.currentPlayer !== playerColor) { send(ws, { type: 'error', error: 'Not your turn' }); break; }
        const player = game.players[playerColor];
        const pos = msg.position || {};
        if (player && typeof pos === 'object') {
          if (Object.prototype.hasOwnProperty.call(pos, 'state')) player.state = pos.state;
          if (Object.prototype.hasOwnProperty.call(pos, 'pos')) player.pos = pos.pos;
          if (Object.prototype.hasOwnProperty.call(pos, 'offset')) player.offset = pos.offset;
          if (Object.prototype.hasOwnProperty.call(pos, 'lane')) player.lane = pos.lane;
          broadcast(game, { type: 'gameState', ...game });
        }
        break;
      }
      case 'questionOpened': {
        const { gameId, playerColor } = meta;
        if (!gameId || !playerColor) break;
        const game = games.get(gameId); if (!game || game.gameStatus !== 'playing') break;
        if (game.currentPlayer !== playerColor) break; // only current player asks
        const payload = {
          type: 'questionOpened',
          category: msg.category,
          question: msg.question,
          options: msg.options,
          askedBy: playerColor,
        };
        broadcast(game, payload);
        break;
      }
      case 'answerQuestion': {
        const { gameId, playerColor } = meta;
        if (!gameId || !playerColor) break;
        const game = games.get(gameId); if (!game || game.gameStatus !== 'playing') break;
        if (game.currentPlayer !== playerColor) { send(ws, { type: 'error', error: 'Not your turn' }); break; }
        const player = game.players[playerColor];
        if (player && msg.correct) {
          const categories = ['science','history','art','sports','geography','entertainment'];
          const available = categories.filter(c => !player.badges.includes(c));
          if (available.length) player.badges.push(available[Math.floor(Math.random()*available.length)]);
          player.gold += 10;
          if (player.badges.length >= 6 && player.state === 'center') {
            game.gameStatus = 'finished'; game.winner = playerColor;
            broadcast(game, { type: 'gameWon', winner: playerColor, playerName: player.name });
          }
        }
        const connected = playerColors.filter(c => game.players[c].isConnected);
        const idx = connected.indexOf(game.currentPlayer);
        const nextPlayer = connected[(idx+1)%connected.length];
        const turnChanged = !msg.correct; // keep turn on correct answer
        if (turnChanged) {
          game.currentPlayer = nextPlayer;
        }
        broadcast(game, { type: 'gameState', ...game });
        broadcast(game, { type: 'answerResult', answeredBy: playerColor, correct: !!msg.correct, nextPlayer, turnChanged });
        break;
      }
      default:
        // ignore unknown
        break;
    }
  });

  ws.addEventListener('close', () => {
    // remove from queue
    const qi = waitingQueue.findIndex(w => w.socket === ws);
    if (qi !== -1) waitingQueue.splice(qi, 1);
    const meta = connMeta.get(ws);
    if (!meta?.gameId || !meta.playerColor) return;
    const game = games.get(meta.gameId); if (!game) return;
    const player = game.players[meta.playerColor];
    if (player) { player.isConnected = false; player.socket = undefined; }
    const connectedCount = Object.values(game.players).filter(p => p.isConnected).length;
    if (connectedCount === 0) setTimeout(() => {
      const stillNone = Object.values(game.players).every(p => !p.isConnected);
      if (stillNone) games.delete(meta.gameId!);
    }, 60000);
    broadcast(game, { type: 'lobbyUpdate', connected: connectedCount, required: 4, players: game.players, status: game.gameStatus });
    broadcast(game, { type: 'gameState', ...game });
  });

  // @ts-ignore webSocket is valid in Edge runtime ResponseInit
  try { console.log('[ws] Returning 101 switching protocols'); } catch {}
  return new Response(null, { status: 101, webSocket: client } as any);
}


