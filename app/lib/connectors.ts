"use client";

import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { base } from "wagmi/chains";

// Wrap Farcaster Mini App connector to ensure getChainId is available.
// We return a CreateConnectorFn-compatible function.
export function farcasterBaseConnector(): any {
  const createBase: any = farcasterMiniApp();
  return (config: any) => {
    const connector: any = createBase(config);
    const originalGet = connector?.getChainId?.bind(connector);
    connector.getChainId = async () => {
      try {
        const id = await originalGet?.();
        if (typeof id === 'number') return id;
      } catch (_) {
        // ignore and fallback
      }
      return base.id;
    };
    return connector;
  };
}
