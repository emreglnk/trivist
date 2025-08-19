"use client";

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useMiniKit } from '@coinbase/onchainkit/minikit';

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { context } = useMiniKit();

  // Get Farcaster username from MiniKit context
  const username = context?.user?.username || context?.user?.displayName || null;

  const handleConnect = async () => {
    // Prefer Farcaster Mini App connector, fallback to injected
    const farcasterConnector = connectors?.find((c: any) => c.name.toLowerCase().includes('farcaster'));
    const connector = farcasterConnector || connectors?.find((c: any) => c.id === 'injected') || connectors?.[0];
    if (connector) {
      connect({ connector });
    }
  };

  if (isConnected && (username || address)) {
    const label = username ? `${username}` : `${address!.slice(0, 6)}...${address!.slice(-4)}`;
    return (
      <div className="flex items-center gap-2">
        <div
          className="px-3 py-1 bg-green-600/20 text-green-300 rounded-lg text-sm font-mono"
          title={address || undefined}
        >
          {label}
        </div>
        <button
          onClick={() => disconnect()}
          className="px-3 py-1 bg-red-600/20 text-red-300 hover:bg-red-600/30 rounded-lg text-sm transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isPending}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-lg font-medium transition-colors"
    >
      {isPending ? 'Connecting...' : 'Connect'}
    </button>
  );
}
