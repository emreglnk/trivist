"use client";

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { base } from 'wagmi/chains';
import { useMiniKit } from '@coinbase/onchainkit/minikit';

export default function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain, status: switchStatus } = useSwitchChain();
  const isSwitching = switchStatus === 'pending';
  const { context } = useMiniKit();

  // Get Farcaster username from MiniKit context
  const username = context?.user?.username || context?.user?.displayName || null;

  const handleConnect = async () => {
    // Diagnostics: list connectors
    try {
      // eslint-disable-next-line no-console
      console.log('Wagmi connectors:', connectors?.map((c: any) => ({ id: c.id, name: c.name })));
      // Prefer injected connector; ensure getChainId exists if possible
      const preferred = connectors?.find((c: any) => c.id === 'injected')
        || connectors?.find((c: any) => typeof (c as any)?.getChainId === 'function')
        || connectors?.[0];
      if (preferred) {
        // eslint-disable-next-line no-console
        console.log('Connecting with:', { id: (preferred as any).id, name: (preferred as any).name });
        connect({ connector: preferred as any, chainId: base.id });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Connect error:', err);
    }
  };

  if (isConnected && (username || address)) {
    const label = username ? `${username}` : `${address!.slice(0, 6)}...${address!.slice(-4)}`;
    const onWrongNetwork = typeof chainId === 'number' && chainId !== base.id;
    return (
      <div className="flex items-center gap-2">
        <div
          className="px-3 py-1 bg-green-600/20 text-green-300 rounded-lg text-sm font-mono"
          title={(address || '') + (typeof chainId === 'number' ? ` (chain: ${chainId})` : '')}
        >
          {label}
        </div>
        {onWrongNetwork && (
          <button
            onClick={() => switchChain({ chainId: base.id })}
            disabled={isSwitching}
            className="px-3 py-1 bg-yellow-600/20 text-yellow-300 hover:bg-yellow-600/30 rounded-lg text-sm transition-colors"
            title="Switch to Base network (8453)"
          >
            {isSwitching ? 'Switching…' : 'Switch to Base'}
          </button>
        )}
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
