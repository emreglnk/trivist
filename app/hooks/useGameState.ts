"use client";

import { useState, useCallback } from "react";

export interface Player {
  id: string;
  color: string;
  state: 'center' | 'ring' | 'lane';
  pos: number;
  offset: number;
  badges: Set<string>;
  lane: { id: number; depth: number; dir: 'in' | 'out' } | null;
}

export interface GameState {
  players: Record<string, Player>;
  currentPlayer: string;
  gold: number;
  diceValue: number;
  boardCategories: string[];
}

const INITIAL_PLAYERS: Record<string, Player> = {
  red: { id: 'red', color: '#ff3b30', state: 'center', pos: 0, offset: 0, badges: new Set(), lane: null },
  green: { id: 'green', color: '#34c759', state: 'center', pos: 0, offset: 1, badges: new Set(), lane: null },
  blue: { id: 'blue', color: '#0a84ff', state: 'center', pos: 0, offset: 2, badges: new Set(), lane: null },
  yellow: { id: 'yellow', color: '#ffd400', state: 'center', pos: 0, offset: 3, badges: new Set(), lane: null }
};

export function useGameState() {
  const [state, setState] = useState<GameState>({
    players: INITIAL_PLAYERS,
    currentPlayer: 'red',
    gold: 0,
    diceValue: 1,
    boardCategories: generateBoardCategories()
  });

  const setCurrentPlayer = useCallback((playerId: string) => {
    setState(prev => ({ ...prev, currentPlayer: playerId }));
  }, []);

  const nextPlayer = useCallback(() => {
    const playerIds = Object.keys(state.players);
    const currentIndex = playerIds.indexOf(state.currentPlayer);
    const nextIndex = (currentIndex + 1) % playerIds.length;
    setCurrentPlayer(playerIds[nextIndex]);
  }, [state.currentPlayer, state.players, setCurrentPlayer]);

  const rollDice = useCallback(() => {
    const value = 1 + Math.floor(Math.random() * 6);
    setState(prev => ({ ...prev, diceValue: value }));
    return value;
  }, []);

  const addGold = useCallback((amount: number) => {
    setState(prev => ({ ...prev, gold: prev.gold + amount }));
  }, []);

  const addBadge = useCallback((playerId: string, category: string) => {
    setState(prev => ({
      ...prev,
      players: {
        ...prev.players,
        [playerId]: {
          ...prev.players[playerId],
          badges: new Set([...prev.players[playerId].badges, category])
        }
      }
    }));
  }, []);

  const movePlayer = useCallback((playerId: string, newState: Partial<Player>) => {
    setState(prev => ({
      ...prev,
      players: {
        ...prev.players,
        [playerId]: { ...prev.players[playerId], ...newState }
      }
    }));
  }, []);

  const resetGame = useCallback(() => {
    setState({
      players: INITIAL_PLAYERS,
      currentPlayer: 'red',
      gold: 0,
      diceValue: 1,
      boardCategories: generateBoardCategories()
    });
  }, []);

  return {
    ...state,
    setCurrentPlayer,
    nextPlayer,
    rollDice,
    addGold,
    addBadge,
    movePlayer,
    resetGame
  };
}

function generateBoardCategories(): string[] {
  // Fixed board layout to avoid SSR hydration mismatch
  return [
    'roll',        // 0
    'history',     // 1
    'art',         // 2
    'sports',      // 3
    'geography',   // 4
    'entertainment', // 5
    'roll',        // 6
    'science',     // 7
    'history',     // 8
    'art',         // 9
    'sports',      // 10
    'geography',   // 11
    'roll',        // 12
    'entertainment', // 13
    'science',     // 14
    'history',     // 15
    'art',         // 16
    'sports',      // 17
    'roll',        // 18
    'geography',   // 19
    'entertainment', // 20
    'science',     // 21
    'history',     // 22
    'art'          // 23
  ];
}
