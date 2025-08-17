"use client";

import { useState, useEffect, useCallback } from 'react';

interface TokenStats {
  balance: string;
  gamesPlayed: number;
  questionsAnswered: number;
  canClaimDaily: boolean;
  timeUntilNextClaim: number;
}

export function useTokenSystem(address?: string) {
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/token/claim?address=${address}`);
      const contentType = response.headers.get('content-type') || '';
      let data: any = null;
      let textFallback: string | null = null;

      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (e) {
          // JSON parse failed, read as text to surface better error
          textFallback = await response.text();
        }
      } else {
        // Non-JSON (e.g., HTML error page)
        textFallback = await response.text();
      }

      if (response.ok) {
        setStats(data);
      } else {
        const message = (data && (data.error || data.message)) || textFallback || `Failed to fetch stats (HTTP ${response.status})`;
        setError(message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(message);
      console.error('Token stats error:', err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const claimDailyTokens = useCallback(async () => {
    if (!address) return false;

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/token/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      });

      const contentType = response.headers.get('content-type') || '';
      let data: any = null;
      let textFallback: string | null = null;

      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (e) {
          textFallback = await response.text();
        }
      } else {
        textFallback = await response.text();
      }

      if (response.ok) {
        await fetchStats(); // Refresh stats
        return true;
      } else {
        const message = (data && (data.error || data.message)) || textFallback || `Failed to claim tokens (HTTP ${response.status})`;
        setError(message);
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(message);
      console.error('Claim error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [address, fetchStats]);

  const rewardCorrectAnswer = useCallback(async () => {
    if (!address) return;

    try {
      const response = await fetch('/api/token/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, correct: true })
      });
      
      if (response.ok) {
        await fetchStats(); // Refresh stats
      }
    } catch (err) {
      console.error('Reward error:', err);
    }
  }, [address, fetchStats]);

  // Auto-fetch stats when address changes
  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh stats every 30 seconds
  useEffect(() => {
    if (!address) return;

    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats, address]);

  const formatTimeUntilClaim = (seconds: number) => {
    if (seconds <= 0) return '0s';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  return {
    stats,
    loading,
    error,
    claimDailyTokens,
    rewardCorrectAnswer,
    refreshStats: fetchStats,
    formatTimeUntilClaim
  };
}
