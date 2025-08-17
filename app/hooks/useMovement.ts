"use client";

import { useCallback } from "react";
import { Player } from "./useGameState";

const BOARD_CONFIG = {
  segments: 24,
  laneSteps: 3,
  laneEntries: [0, 6, 12, 18] // Raw entries
};

interface MovementResult {
  moved: boolean;
  rollAgain: boolean;
  needsChoice?: boolean;
  choiceType?: 'direction' | 'ring-or-lane' | 'center-exit';
}

export function useMovement() {
  const isRingOccupied = useCallback((pos: number, players: Record<string, Player>, excludePlayer?: string): boolean => {
    return Object.values(players).some(player => 
      player.id !== excludePlayer && 
      player.state === 'ring' && 
      player.pos === pos
    );
  }, []);

  const isLaneOccupied = useCallback((laneId: number, depth: number, players: Record<string, Player>, excludePlayer?: string): boolean => {
    return Object.values(players).some(player => 
      player.id !== excludePlayer && 
      player.state === 'lane' && 
      player.lane?.id === laneId && 
      player.lane?.depth === depth
    );
  }, []);

  const canMoveToCenter = useCallback((player: Player): boolean => {
    return player.badges.size >= 6;
  }, []);

  const movePlayerStep = useCallback((
    player: Player, 
    players: Record<string, Player>,
    direction: 'cw' | 'ccw' = 'cw'
  ): { success: boolean; newState: Partial<Player> } => {
    if (player.state === 'ring') {
      const stepDir = direction === 'ccw' ? -1 : 1;
      const nextPos = (player.pos + stepDir + BOARD_CONFIG.segments) % BOARD_CONFIG.segments;
      
      if (isRingOccupied(nextPos, players, player.id)) {
        return { success: false, newState: {} };
      }
      
      return { success: true, newState: { pos: nextPos } };
    } 
    else if (player.state === 'lane' && player.lane) {
      if (player.lane.dir === 'in') {
        const nextDepth = player.lane.depth + 1;
        
        if (nextDepth > BOARD_CONFIG.laneSteps) {
          // Try to move to center
          if (!canMoveToCenter(player)) {
            return { success: false, newState: {} };
          }
          return { 
            success: true, 
            newState: { 
              state: 'center', 
              lane: null 
            } 
          };
        }
        
        if (isLaneOccupied(player.lane.id, nextDepth, players, player.id)) {
          return { success: false, newState: {} };
        }
        
        return { 
          success: true, 
          newState: { 
            lane: { ...player.lane, depth: nextDepth } 
          } 
        };
      } else {
        // Moving out of lane (dir === 'out')
        const nextDepth = player.lane.depth - 1;
        
        if (nextDepth < 1) {
          // Exit to ring (when depth would become 0 or less)
          // Align with HTML's ENTRY_INDEXES mapping
          const entryPos = (BOARD_CONFIG.laneEntries[player.lane.id] - 1 + BOARD_CONFIG.segments) % BOARD_CONFIG.segments;
          if (isRingOccupied(entryPos, players, player.id)) {
            return { success: false, newState: {} };
          }
          
          return { 
            success: true, 
            newState: { 
              state: 'ring', 
              pos: entryPos, 
              lane: null 
            } 
          };
        }
        
        if (isLaneOccupied(player.lane.id, nextDepth, players, player.id)) {
          return { success: false, newState: {} };
        }
        
        return { 
          success: true, 
          newState: { 
            lane: { ...player.lane, depth: nextDepth } 
          } 
        };
      }
    }
    
    return { success: false, newState: {} };
  }, [isRingOccupied, isLaneOccupied, canMoveToCenter]);

  const canEnterLane = useCallback((player: Player, players: Record<string, Player>): boolean => {
    if (player.state !== 'ring') return false;
    
    const laneId = BOARD_CONFIG.laneEntries.indexOf(player.pos);
    if (laneId === -1) return false;
    
    // Check if all badges are collected for center access
    if (player.badges.size < 6) return false;
    
    return !isLaneOccupied(laneId, 1, players, player.id);
  }, [isLaneOccupied]);

  const getAvailableDirections = useCallback((
    player: Player, 
    players: Record<string, Player>, 
    steps: number
  ): { cw: boolean; ccw: boolean } => {
    if (player.state !== 'ring') return { cw: false, ccw: false };
    
    const cwNext = (player.pos + 1) % BOARD_CONFIG.segments;
    const ccwNext = (player.pos - 1 + BOARD_CONFIG.segments) % BOARD_CONFIG.segments;
    
    return {
      cw: !isRingOccupied(cwNext, players, player.id),
      ccw: !isRingOccupied(ccwNext, players, player.id)
    };
  }, [isRingOccupied]);

  const simulateMovement = useCallback((
    player: Player,
    players: Record<string, Player>,
    steps: number,
    direction: 'cw' | 'ccw' = 'cw'
  ): MovementResult => {
    let currentPlayer = { ...player };
    let remainingSteps = steps;
    let moved = false;

    // Check if player is at entry point and can choose direction
    if (currentPlayer.state === 'ring' && BOARD_CONFIG.laneEntries.includes(currentPlayer.pos)) {
      const directions = getAvailableDirections(currentPlayer, players, steps);
      if (directions.cw || directions.ccw) {
        return {
          moved: false,
          rollAgain: false,
          needsChoice: true,
          choiceType: 'ring-or-lane'
        };
      }
    }

    // Check for direction choice on ring
    if (currentPlayer.state === 'ring' && steps > 0) {
      const directions = getAvailableDirections(currentPlayer, players, steps);
      if (!directions.cw && !directions.ccw) {
        return { moved: false, rollAgain: false };
      }
      if (directions.cw && directions.ccw) {
        return {
          moved: false,
          rollAgain: false,
          needsChoice: true,
          choiceType: 'direction'
        };
      }
    }

    // Simulate step-by-step movement
    while (remainingSteps > 0) {
      const result = movePlayerStep(currentPlayer, players, direction);
      
      if (!result.success) break;
      
      currentPlayer = { ...currentPlayer, ...result.newState };
      moved = true;
      remainingSteps--;
      
      if (currentPlayer.state === 'center') break;
    }

    return { moved, rollAgain: false };
  }, [movePlayerStep, getAvailableDirections]);

  return {
    simulateMovement,
    movePlayerStep,
    canEnterLane,
    getAvailableDirections,
    isRingOccupied,
    isLaneOccupied,
    canMoveToCenter
  };
}
