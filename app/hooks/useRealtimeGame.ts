"use client";

import { useEffect, useState, useCallback } from 'react';

interface Player {
  id: string;
  name: string;
  avatar: string;
  position: { ring: number; lane: number; depth: number };
  badges: string[];
  gold: number;
}

interface ServerPlayer {
  id: 'red' | 'green' | 'blue' | 'yellow';
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
}

interface GameState {
  id: string;
  players: Record<'red' | 'green' | 'blue' | 'yellow', ServerPlayer>;
  currentPlayer: 'red' | 'green' | 'blue' | 'yellow';
  diceValue: number;
  gameStatus: 'waiting' | 'playing' | 'finished';
  winner?: 'red' | 'green' | 'blue' | 'yellow';
}

interface UseRealtimeGameReturn {
  socket: WebSocket | null;
  gameState: GameState | null;
  isConnected: boolean;
  assignedColor?: 'red' | 'green' | 'blue' | 'yellow';
  lobby?: { connected: number; required: number; status: GameState['gameStatus'] };
  joinRoom: (roomId: string, playerData: { address: string; signature: string }) => void;
  rollDice: () => void;
  movePlayer: (newPosition: { state: string; pos: number; lane?: any }) => void;
  answerQuestion: (correct: boolean) => void;
  leaveRoom: () => void;
}

export function useRealtimeGame(): UseRealtimeGameReturn {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [assignedColor, setAssignedColor] = useState<'red' | 'green' | 'blue' | 'yellow' | undefined>(undefined);
  const [lobby, setLobby] = useState<{ connected: number; required: number; status: GameState['gameStatus'] } | undefined>(undefined);

  useEffect(() => {
    // Build WS URL: prefer env, otherwise same-origin /api/ws
    const computeUrl = () => {
      const env = process.env.NEXT_PUBLIC_WS_URL;
      if (env && env.startsWith('ws')) return env;
      if (typeof window !== 'undefined') {
        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        return `${proto}://${window.location.host}/api/ws`;
      }
      return '';
    };

    const url = computeUrl();
    if (!url) return;

    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('Connected to game server');
      setIsConnected(true);
    };

    ws.onclose = () => {
      console.log('Disconnected from game server');
      setIsConnected(false);
    };

    ws.onerror = (e) => {
      console.error('Game server error:', e);
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(typeof evt.data === 'string' ? evt.data : '');
        switch (data.type) {
          case 'playerAssigned':
            setAssignedColor(data.playerColor);
            break;
          case 'gameState':
            setGameState({
              id: data.id,
              players: data.players,
              currentPlayer: data.currentPlayer,
              diceValue: data.diceValue,
              gameStatus: data.gameStatus,
              winner: data.winner,
            });
            break;
          case 'lobbyUpdate':
            setLobby({ connected: data.connected, required: data.required, status: data.status });
            setGameState(prev => prev ? { ...prev, players: data.players, gameStatus: data.status } as GameState : prev);
            break;
          case 'diceRolled':
          case 'answerResult':
          case 'gameWon':
          case 'questionOpened':
            // these are informative events; gameState sync follows separately
            break;
          case 'error':
            console.error('Server error:', data.error);
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('Invalid WS message', err);
      }
    };

    setSocket(ws);
    return () => {
      try { ws.close(); } catch {}
    };
  }, []);

  const joinRoom = useCallback((roomId: string, playerData: { address: string; signature: string }) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'quickJoin', address: playerData.address }));
    }
  }, [socket]);

  const rollDice = useCallback(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'rollDice' }));
    }
  }, [socket]);

  const movePlayer = useCallback((newPosition: { state?: string; pos?: number; offset?: number; lane?: any }) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      const position: any = {};
      if (newPosition.state !== undefined) position.state = newPosition.state;
      if (newPosition.pos !== undefined) position.pos = newPosition.pos;
      if (newPosition.offset !== undefined) position.offset = newPosition.offset;
      if (newPosition.lane !== undefined) position.lane = newPosition.lane;
      console.log('[client] Sending movePlayer:', position);
      socket.send(JSON.stringify({ type: 'movePlayer', position }));
    }
  }, [socket]);

  const answerQuestion = useCallback((correct: boolean) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'answerQuestion', correct }));
    }
  }, [socket]);

  const leaveRoom = useCallback(() => {
    if (socket) {
      try { socket.close(); } catch {}
    }
  }, [socket]);

  return {
    socket,
    gameState,
    isConnected,
    assignedColor,
    lobby,
    joinRoom,
    rollDice,
    movePlayer,
    answerQuestion,
    leaveRoom,
  };
}
