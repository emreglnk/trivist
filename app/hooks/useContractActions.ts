"use client";

import { useState, useMemo } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { TRIV_TOKEN_CONFIG } from '../../config/contracts';
import { base } from 'wagmi/chains';
import { createWalletClient, custom } from 'viem';

export function useContractActions() {
  const { address } = useAccount();
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const { writeContract, data: wagmiHash, error: writeError, isPending: isWritePending } = useWriteContract();

  // Track whichever hash is available (wagmi or viem fallback)
  const txHash = useMemo(() => (wagmiHash ?? (lastTxHash as any)) as `0x${string}` | undefined, [wagmiHash, lastTxHash]);

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: base.id,
  });

  // Helper: check Base network via EIP-1193 provider (avoids wagmi connector.getChainId)
  const isOnBaseNetwork = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).ethereum?.request) {
        const hex = await (window as any).ethereum.request({ method: 'eth_chainId' });
        const current = typeof hex === 'string' ? parseInt(hex, 16) : Number(hex);
        return current === base.id;
      }
    } catch (e) {
      // ignore
    }
    // If we cannot detect, allow flow to proceed; write will specify chainId
    return true;
  };

  // claimDailyTokens removed - use useTokenSystem for gasless server-side claiming

  const enterGame = async () => {
    if (!address) {
      setActionError('Wallet not connected');
      return false;
    }

    const correct = await isOnBaseNetwork();
    if (!correct) {
      setActionError('Please switch to Base network');
      return false;
    }

    try {
      setActionLoading(true);
      setActionError(null);
      
      try {
        await writeContract({
          address: TRIV_TOKEN_CONFIG.address,
          abi: TRIV_TOKEN_CONFIG.abi,
          functionName: 'enterGame',
          args: [],
          // Explicitly set chain to Base to avoid connector.getChainId lookups
          chainId: base.id,
          account: address,
        });
      } catch (err: any) {
        const msg = String(err?.message || err);
        if (msg.includes('getChainId is not a function') && typeof window !== 'undefined' && (window as any).ethereum) {
          const walletClient = createWalletClient({ chain: base, transport: custom((window as any).ethereum) });
          const h = await walletClient.writeContract({
            address: TRIV_TOKEN_CONFIG.address,
            abi: TRIV_TOKEN_CONFIG.abi as any,
            functionName: 'enterGame',
            args: [],
            account: address as any,
          });
          setLastTxHash(h as any);
        } else {
          throw err;
        }
      }

      return true;
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('enterGame error:', error);
      const message = error?.message || 'Failed to enter game';
      setActionError(message);
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  // Combined loading state for UI
  const isLoading = actionLoading || isWritePending || isConfirming;

  // Transaction status for user feedback
  const getTransactionStatus = () => {
    if (isWritePending) return 'Preparing transaction...';
    if (isConfirming) return 'Confirming transaction...';
    if (isConfirmed) return 'Transaction confirmed!';
    if (writeError || actionError) return actionError || writeError?.message || 'Transaction failed';
    return null;
  };

  return {
    enterGame,
    isLoading,
    error: actionError || writeError?.message || null,
    isConfirmed,
    lastTxHash,
    transactionStatus: getTransactionStatus(),
    isCorrectNetwork: undefined,
  };
}
