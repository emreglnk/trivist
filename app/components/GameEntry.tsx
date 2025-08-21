"use client";

import { useContractActions } from '../hooks/useContractActions';
import { useTokenSystem } from '../hooks/useTokenSystem';

interface GameEntryProps {
  address?: string;
  onGameEntered?: () => void;
  className?: string;
}

export default function GameEntry({ address, onGameEntered, className = '' }: GameEntryProps) {
  const { stats, loading: statsLoading } = useTokenSystem(address);
  const { enterGame, isLoading, transactionStatus, isConfirmed } = useContractActions();

  if (!address) {
    return (
      <div className={`text-white/70 text-sm ${className}`}>
        Connect wallet to enter game
      </div>
    );
  }

  const handleEnterGame = async () => {
    const success = await enterGame();
    if (success && isConfirmed) {
      onGameEntered?.();
    }
  };

  const canEnterGame = stats && parseFloat(stats.balance) >= 25;
  const insufficientBalance = stats && parseFloat(stats.balance) < 25;

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-white text-sm">Game Entry Cost: 25 TRIV</span>
        {stats && (
          <span className={`text-sm ${canEnterGame ? 'text-green-400' : 'text-red-400'}`}>
            Balance: {parseFloat(stats.balance).toFixed(0)} TRIV
          </span>
        )}
      </div>
      
      <button
        onClick={handleEnterGame}
        disabled={statsLoading || isLoading || !canEnterGame}
        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
          canEnterGame 
            ? 'bg-blue-600 hover:bg-blue-700 text-white' 
            : 'bg-gray-600 text-gray-300 cursor-not-allowed'
        }`}
      >
        {isLoading ? 'Entering Game...' : 'Enter Game (25 TRIV)'}
      </button>

      {insufficientBalance && (
        <div className="text-red-400 text-xs">
          Insufficient TRIV tokens. You need at least 25 TRIV to enter the game.
        </div>
      )}

      {transactionStatus && (
        <div className={`text-xs ${
          transactionStatus.includes('confirmed') ? 'text-green-400' : 
          transactionStatus.includes('failed') || transactionStatus.includes('Error') ? 'text-red-400' : 
          'text-yellow-400'
        }`}>
          {transactionStatus}
        </div>
      )}
    </div>
  );
}
