"use client";

import { useEffect } from "react";
import TokenBalance from "./TokenBalance";
import "./GameStyles.css";

interface GameHUDProps {
  currentPlayer: string;
  gold?: number; // Making this optional since it's not used
  diceValue: number;
  onRollDice: () => void;
  players: Record<string, { color?: string }>;
  walletAddress?: string;
}

export default function GameHUD({ currentPlayer, diceValue, onRollDice, walletAddress }: GameHUDProps) {
  // Optional MiniKit integration - only load if available
  useEffect(() => {
    const loadMiniKit = async () => {
      try {
        if (typeof window !== 'undefined') {
          await import("@coinbase/onchainkit/minikit");
          // MiniKit primary button for dice roll - but we'll handle this manually for now
        }
      } catch {
        console.log('MiniKit not available, using manual dice roll');
      }
    };
    loadMiniKit();
  }, []);

  return (
    <div className="space-y-4">
      {/* Top HUD */}
      <div className="flex justify-between items-center">
        {/* Dice */}
        <div 
          className="w-16 h-16 dice-container rounded-xl border-2 border-gray-300 shadow-lg cursor-pointer flex items-center justify-center text-2xl font-bold hover:scale-105 transition-transform"
          onClick={onRollDice}
          title="Roll Dice"
        >
          {renderDicePips(diceValue)}
        </div>

        {/* Token Balance */}
        <TokenBalance address={walletAddress} className="text-right" />
      </div>

      {/* Players strip moved below board */}

      {/* Current Player Indicator */}
      <div className="text-center text-sm font-medium text-gray-600">
        Turn: <span className={`capitalize current-player-indicator player-color-${currentPlayer}`}>
          {currentPlayer}
        </span>
      </div>
    </div>
  );
}

function renderDicePips(value: number) {
  const pipPatterns = {
    1: [[50, 50]],
    2: [[25, 25], [75, 75]],
    3: [[25, 25], [50, 50], [75, 75]],
    4: [[25, 25], [75, 25], [25, 75], [75, 75]],
    5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
    6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]]
  };

  const pips = pipPatterns[value as keyof typeof pipPatterns] || pipPatterns[1];

  return (
    <svg viewBox="0 0 100 100" className="w-12 h-12">
      {pips.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="6" fill="#111" />
      ))}
    </svg>
  );
}

// Removed unused function getCategoryColor
// Uncomment if needed later
// function getCategoryColor(category: string): string {
//   const colors = {
//     science: '#00b6b4',
//     history: '#f1c40f',
//     art: '#e91e63',
//     sports: '#27ae60',
//     geography: '#3498db',
//     entertainment: '#8e44ad',
//     roll: '#b0bec5'
//   };
//   return colors[category as keyof typeof colors] || '#666';
// }
