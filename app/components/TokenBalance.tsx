"use client";

import { useTokenSystem } from '../hooks/useTokenSystem';

interface TokenBalanceProps {
  address?: string;
  className?: string;
}

export default function TokenBalance({ address, className = '' }: TokenBalanceProps) {
  const { stats, loading, error, claimDailyTokens, formatTimeUntilClaim } = useTokenSystem(address);

  if (!address) {
    return (
      <div className={`text-white/70 text-sm ${className}`}>
        Connect wallet to see TRIV balance
      </div>
    );
  }

  if (loading && !stats) {
    return (
      <div className={`text-white/70 text-sm ${className}`}>
        Loading TRIV balance...
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-red-400 text-sm ${className}`}>
        Error: {error}
      </div>
    );
  }

  if (!stats) return null;

  const handleClaim = async () => {
    const success = await claimDailyTokens();
    if (success) {
      alert('🎉 Successfully claimed 50 TRIV tokens!');
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* TRIV Balance */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-white">T</span>
        </div>
        <span className="text-white font-bold text-lg">
          {parseFloat(stats.balance).toFixed(0)} TRIV
        </span>
      </div>

      {/* Daily Claim */}
      <div className="flex items-center gap-2">
        {stats.canClaimDaily ? (
          <button
            onClick={handleClaim}
            disabled={loading}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Claiming...' : 'Claim 50 TRIV'}
          </button>
        ) : (
          <div className="text-white/50 text-xs">
            Next claim: {formatTimeUntilClaim(stats.timeUntilNextClaim)}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="text-white/40 text-xs space-y-1">
        <div>Games: {stats.gamesPlayed}</div>
        <div>Questions: {stats.questionsAnswered}</div>
      </div>
    </div>
  );
}
