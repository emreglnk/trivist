"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

interface Props {
  className?: string;
}

export default function WalletBadge({ className = "" }: Props) {
  const { address, isConnected } = useAccount();
  const { context } = useMiniKit();
  
  // Get Farcaster username from MiniKit context
  const username = context?.user?.username || context?.user?.displayName || null;

  const label = useMemo(() => {
    if (username) return username;
    if (address) return `${address.slice(0, 6)}...${address.slice(-4)}`;
    return "";
  }, [address, username]);

  return (
    <span
      title={address || undefined}
      className={`inline-flex items-center px-2.5 py-1 rounded-md border border-white/10 text-xs font-mono ${
        isConnected && (username || address)
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-slate-700/50 text-white/60"
      } ${className}`}
    >
      {isConnected && (username || address) ? label : "No wallet"}
    </span>
  );
}
