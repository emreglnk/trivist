"use client";

import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

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
  socket: Socket | null;
  gameState: GameState | null;
  isConnected: boolean;
  assignedColor?: 'red' | 'green' | 'blue' | 'yellow';
  lobby?: { connected: number; required: number; status: GameState['gameStatus'] };
  moveOptions?: { id: string; label: string; path: any[]; meta?: any }[];
  questionMeta?: { category: string; askedBy: 'red'|'green'|'blue'|'yellow' };
  joinRoom: (roomId: string, playerData: { address: string; signature: string }) => void;
  rollDice: () => void;
  movePlayer: (newPosition: { state: string; pos: number; lane?: any }) => void;
  chooseMove: (optionId: string) => void;
  answerQuestion: (correct: boolean) => void;
  leaveRoom: () => void;
}

export function useRealtimeGame(): UseRealtimeGameReturn {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [assignedColor, setAssignedColor] = useState<'red' | 'green' | 'blue' | 'yellow' | undefined>(undefined);
  const [lobby, setLobby] = useState<{ connected: number; required: number; status: GameState['gameStatus'] } | undefined>(undefined);
  const [moveOptions, setMoveOptions] = useState<{ id: string; label: string; path: any[]; meta?: any }[] | undefined>(undefined);
  const [questionMeta, setQuestionMeta] = useState<{ category: string; askedBy: 'red'|'green'|'blue'|'yellow' } | undefined>(undefined);

  useEffect(() => {
    // Connect via Socket.IO through Nginx proxy (/socket.io)
    if (typeof window === 'undefined') return;
    const origin = window.location.origin;
    const s = io(origin, { path: '/socket.io', transports: ['websocket'] });

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);

    s.on('playerAssigned', (payload: { playerColor: 'red'|'green'|'blue'|'yellow'; player: any }) => {
      setAssignedColor(payload.playerColor);
    });

    s.on('gameState', (data: any) => {
      setGameState({
        id: data.id,
        players: data.players,
        currentPlayer: data.currentPlayer,
        diceValue: data.diceValue,
        gameStatus: data.gameStatus,
        winner: data.winner,
      });
    });

    s.on('lobbyUpdate', (data: any) => {
      setLobby({ connected: data.connected, required: data.required, status: data.status });
      setGameState(prev => prev ? { ...prev, players: data.players, gameStatus: data.status } as GameState : prev);
    });

    s.on('diceRolled', () => {/* handled via gameState sync */});
    s.on('answerResult', () => {/* handled via gameState sync */});
    s.on('gameWon', () => {/* handled via gameState sync */});
    s.on('moveOptions', (payload: { options: any[]; dice: number }) => {
      setMoveOptions(payload.options || []);
    });
    s.on('questionOpened', (payload: { category: string; askedBy: 'red'|'green'|'blue'|'yellow' }) => {
      setQuestionMeta(payload);
      // clear move options upon question opening
      setMoveOptions(undefined);
    });

    setSocket(s);
    return () => {
      try { s.disconnect(); } catch {}
    };
  }, []);

  const joinRoom = useCallback((roomId: string, playerData: { address: string; signature: string }) => {
    if (socket && socket.connected) socket.emit('quickJoin', { address: playerData.address });
  }, [socket]);

  const rollDice = useCallback(() => {
    if (socket && socket.connected) socket.emit('rollDice');
  }, [socket]);

  const movePlayer = useCallback((newPosition: { state?: string; pos?: number; offset?: number; lane?: any }) => {
    if (socket && socket.connected) {
      const position: any = {};
      if (newPosition.state !== undefined) position.state = newPosition.state;
      if (newPosition.pos !== undefined) position.pos = newPosition.pos;
      if (newPosition.offset !== undefined) position.offset = newPosition.offset;
      if (newPosition.lane !== undefined) position.lane = newPosition.lane;
      socket.emit('movePlayer', { position });
    }
  }, [socket]);

  const chooseMove = useCallback((optionId: string) => {
    if (socket && socket.connected) socket.emit('chooseMove', { optionId });
  }, [socket]);

  const answerQuestion = useCallback((correct: boolean) => {
    if (socket && socket.connected) socket.emit('answerQuestion', { correct });
  }, [socket]);

  const leaveRoom = useCallback(() => {
    if (socket) try { socket.disconnect(); } catch {}
  }, [socket]);

  return {
    socket,
    gameState,
    isConnected,
    assignedColor,
    lobby,
    moveOptions,
    questionMeta,
    joinRoom,
    rollDice,
    movePlayer,
    chooseMove,
    answerQuestion,
    leaveRoom,
  };
}
