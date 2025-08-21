"use client";

import { useTokenSystem } from '../hooks/useTokenSystem';

interface TokenBalanceProps {
  address?: string;
  className?: string;
}

export default function TokenBalance({ address, className = '' }: TokenBalanceProps) {
  const { stats, loading, error, formatTimeUntilClaim, claimDailyTokens } = useTokenSystem(address);

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
    // Server-side gasless claim via /api/token/claim
    await claimDailyTokens();
  };

  return (
    <div className={`flex items-center justify-between w-full ${className}`}>
      {/* TRIV Balance */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
          <span className="text-xs font-bold text-white">T</span>
        </div>
        <span className="text-white font-medium text-sm">
          {parseFloat(stats.balance).toFixed(0)} TRIV
        </span>
      </div>

      {/* Daily Claim */}
      <div className="flex items-center">
        {stats.canClaimDaily ? (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={handleClaim}
              disabled={loading}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Claim 50 TRIV'}
            </button>
          </div>
        ) : (
          <div className="text-white/50 text-xs">
            Next: {formatTimeUntilClaim(stats.timeUntilNextClaim)}
          </div>
        )}
      </div>
    </div>
  );
}
