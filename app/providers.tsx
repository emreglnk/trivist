"use client";

import { type ReactNode } from "react";
import { base } from "wagmi/chains";
import { createConfig, WagmiProvider, createStorage } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
// import { farcasterBaseConnector } from "./lib/connectors";
import { injected } from "wagmi/connectors";
import { http } from "viem";

// Create Wagmi config with Farcaster Mini App connector
const config = createConfig({
  chains: [base],
  // TODO: Re-enable Farcaster connector after upstream getChainId support/patch is confirmed
  connectors: [
    injected(), // Primary for regular browsers (MetaMask, Coinbase Wallet extension, etc.)
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_RPC_URL || "https://mainnet.base.org"),
  },
  // Avoid rehydrating stale connection state from previous connector implementations
  storage: typeof window !== 'undefined'
    ? createStorage({ storage: window.localStorage, key: 'trivist-wagmi-v2' })
    : undefined,
  ssr: true,
});

const queryClient = new QueryClient();

export function Providers(props: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <MiniKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={base}
          config={{
            appearance: {
              mode: "auto",
              theme: "mini-app-theme",
              name: process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME,
              logo: process.env.NEXT_PUBLIC_ICON_URL,
            },
          }}
        >
          {props.children}
        </MiniKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
