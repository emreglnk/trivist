"use client";

import { useState, useCallback, useEffect } from 'react';

interface WalletState {
  address: string | null;
  username?: string | null;
  fid?: number | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId?: number;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    username: null,
    fid: null,
    isConnected: false,
    isConnecting: false,
    chainId: undefined
  });

  const connect = useCallback(async () => {
    setState(prev => ({ ...prev, isConnecting: true }));
    
    try {
      // 1) Farcaster Miniapp SDK (if available)
      if (typeof window !== 'undefined') {
        try {
          const mod: any = await import('@farcaster/miniapp-sdk');
          // Ensure Mini App SDK is ready and detect environment via SDK
          try { if (typeof mod?.ready === 'function') await mod.ready(); } catch {}
          const isMini = (typeof mod?.isMiniApp === 'function' ? !!mod.isMiniApp() : false) || !!mod?.wallet;

          const requesters: Array<() => Promise<any>> = [];
          // Preferred connect methods per Base Mini Apps
          if (mod?.wallet && typeof mod.wallet.connect === 'function') requesters.push(() => mod.wallet.connect());
          if (typeof mod?.connect === 'function') requesters.push(() => mod.connect());
          // Legacy requestWallet methods
          if (mod && typeof mod.requestWallet === 'function') requesters.push(() => mod.requestWallet());
          if (mod?.wallet && typeof mod.wallet.requestWallet === 'function') requesters.push(() => mod.wallet.requestWallet());
          // Avoid non-standard globals; prefer official SDK methods only

          if (isMini && requesters.length) {
            let result: any = null;
            let lastErr: any = null;
            for (const fn of requesters) {
              try { result = await fn(); break; } catch (e) { lastErr = e; }
            }
            if (!result && lastErr) console.warn('Miniapp wallet request failed on all strategies:', lastErr);
            const addr = result?.address || result?.accountAddress || result?.walletAddress || result?.data?.address || null;
            let uname = result?.username || result?.user?.username || result?.user?.handle || result?.name || null;
            const fid = result?.fid || result?.user?.fid || null;
            if (addr) {
              setState(prev => ({
                address: addr,
                username: uname ?? prev.username ?? null,
                fid: (typeof fid === 'number') ? fid : (prev.fid ?? null),
                isConnected: true,
                isConnecting: false,
                chainId: undefined
              }));
              localStorage.setItem('wallet_address', addr);
              if (uname) localStorage.setItem('wallet_username', uname);
              else localStorage.removeItem('wallet_username');
              localStorage.removeItem('wallet_chain_id');
              // Try to fetch user profile to get username if missing
              if (!uname) {
                try {
                  const userGetters: Array<() => Promise<any>> = [];
                  if (typeof mod?.getUser === 'function') userGetters.push(() => mod.getUser());
                  if (typeof mod?.getCurrentUser === 'function') userGetters.push(() => mod.getCurrentUser());
                  if (mod?.user && typeof mod.user.getUser === 'function') userGetters.push(() => mod.user.getUser());
                  if (mod?.user && typeof mod.user.getCurrentUser === 'function') userGetters.push(() => mod.user.getCurrentUser());
                  if ((window as any).farcaster?.user?.getUser) userGetters.push(() => (window as any).farcaster.user.getUser());
                  if ((window as any).miniapp?.user?.getUser) userGetters.push(() => (window as any).miniapp.user.getUser());
                  let uinfo: any = null;
                  for (const fn of userGetters) { try { uinfo = await fn(); if (uinfo) break; } catch {} }
                  const fetchedUname = uinfo?.username || uinfo?.handle || uinfo?.name || uinfo?.fname || null;
                  const fetchedFid = uinfo?.fid || null;
                  if (fetchedUname || fetchedFid) {
                    setState(prev => ({ ...prev, username: fetchedUname ?? prev.username ?? null, fid: (typeof fetchedFid === 'number') ? fetchedFid : (prev.fid ?? null) }));
                    if (fetchedUname) localStorage.setItem('wallet_username', fetchedUname);
                  }
                } catch {}
              }
              return;
            }
            // In miniapp but no address returned -> stop here (do not pop MetaMask)
            setState(prev => ({ ...prev, isConnecting: false }));
            return;
          }
        } catch { /* no miniapp env */ }
      }

      // 2) MetaMask / EIP-1193 provider
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const accounts = await (window as any).ethereum.request({
          method: 'eth_requestAccounts'
        });
        
        // Get chain ID
        const chainId = await (window as any).ethereum.request({
          method: 'eth_chainId'
        });
        
        // Use env chain (default Base mainnet 8453 = 0x2105)
        const envChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453);
        const currentChainId = parseInt(chainId, 16);
        
        if (currentChainId !== envChainId) {
          // Request to switch to Base network
          try {
            await (window as any).ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x' + envChainId.toString(16) }],
            });
          } catch (switchError: any) {
            // Chain not added to MetaMask, add it
            if (switchError.code === 4902) {
              await (window as any).ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x' + envChainId.toString(16),
                  chainName: envChainId === 8453 ? 'Base' : envChainId === 84532 ? 'Base Sepolia' : 'Custom EVM',
                  nativeCurrency: {
                    name: 'Ethereum',
                    symbol: 'ETH',
                    decimals: 18,
                  },
                  rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL || (envChainId === 8453 ? 'https://mainnet.base.org' : 'https://sepolia.base.org')],
                  blockExplorerUrls: [envChainId === 8453 ? 'https://basescan.org' : 'https://sepolia.basescan.org'],
                }],
              });
            }
          }
        }
        
        if (accounts && accounts.length > 0) {
          setState({
            address: accounts[0],
            isConnected: true,
            isConnecting: false,
            chainId: envChainId
          });
          
          // Store in localStorage
          localStorage.setItem('wallet_address', accounts[0]);
          localStorage.setItem('wallet_chain_id', envChainId.toString());
        }
      } else {
        // No provider detected.
        setState(prev => ({ ...prev, isConnecting: false }));
        return;
      }
    } catch (error) {
      // Swallow detailed errors in prod; UI will reflect not connected
      setState(prev => ({ ...prev, isConnecting: false }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({
      address: null,
      username: null,
      fid: null,
      isConnected: false,
      isConnecting: false,
      chainId: undefined
    });
    localStorage.removeItem('wallet_address');
    localStorage.removeItem('wallet_username');
    localStorage.removeItem('wallet_chain_id');
  }, []);

  // Initialize Mini App bridge and detect any pre-connected wallet (Mini App only)
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const mod: any = await import('@farcaster/miniapp-sdk');
        // Ensure SDK ready first
        try { if (typeof mod?.ready === 'function') await mod.ready(); } catch {}
        // Prefer SDK environment check
        const isMini = (typeof mod?.isMiniApp === 'function' ? !!mod.isMiniApp() : false) || !!mod?.wallet;
        if (!isMini) return;
        // Try to get a pre-connected wallet
        const getters: Array<() => Promise<any>> = [];
        if (typeof mod?.getWallet === 'function') getters.push(() => mod.getWallet());
        if (mod?.wallet && typeof mod.wallet.getWallet === 'function') getters.push(() => mod.wallet.getWallet());
        if (typeof mod?.getCurrentWallet === 'function') getters.push(() => mod.getCurrentWallet());
        if (mod?.wallet && typeof mod.wallet.getCurrentWallet === 'function') getters.push(() => mod.wallet.getCurrentWallet());
        let info: any = null;
        for (const fn of getters) { try { info = await fn(); if (info) break; } catch { /* continue */ } }
        const addr = info?.address || info?.accountAddress || info?.walletAddress || info?.data?.address || null;
        let uname = info?.username || info?.user?.username || info?.user?.handle || info?.name || null;
        const fid = info?.fid || info?.user?.fid || null;
        if (addr) {
          setState({ address: addr, username: uname ?? null, fid: (typeof fid === 'number') ? fid : null, isConnected: true, isConnecting: false, chainId: undefined });
          localStorage.setItem('wallet_address', addr);
          if (uname) localStorage.setItem('wallet_username', uname); else localStorage.removeItem('wallet_username');
          localStorage.removeItem('wallet_chain_id');
          // If username missing, fetch profile via SDK
          if (!uname) {
            try {
              const userGetters: Array<() => Promise<any>> = [];
              if (typeof mod?.getUser === 'function') userGetters.push(() => mod.getUser());
              if (typeof mod?.getCurrentUser === 'function') userGetters.push(() => mod.getCurrentUser());
              if (mod?.user && typeof mod.user.getUser === 'function') userGetters.push(() => mod.user.getUser());
              if (mod?.user && typeof mod.user.getCurrentUser === 'function') userGetters.push(() => mod.user.getCurrentUser());
              let uinfo: any = null;
              for (const fn of userGetters) { try { uinfo = await fn(); if (uinfo) break; } catch {} }
              const fetchedUname = uinfo?.username || uinfo?.handle || uinfo?.name || uinfo?.fname || null;
              const fetchedFid = uinfo?.fid || null;
              if (fetchedUname || fetchedFid) {
                setState(prev => ({ ...prev, username: fetchedUname ?? prev.username ?? null, fid: (typeof fetchedFid === 'number') ? fetchedFid : (prev.fid ?? null) }));
                if (fetchedUname) localStorage.setItem('wallet_username', fetchedUname);
              }
            } catch {}
          }
        }
        // Listen for postMessage events from Mini App environment (if any)
        if (typeof window !== 'undefined') {
          const handler = (ev: MessageEvent) => {
            try {
              const data: any = ev.data || {};
              const addr = data?.walletAddress || data?.address || data?.data?.address || null;
              const uname = data?.username || data?.user?.username || data?.user?.handle || null;
              const fid = data?.fid || data?.user?.fid || null;
              if (addr) {
                setState(prev => ({ address: addr, username: uname ?? prev.username ?? null, fid: (typeof fid === 'number') ? fid : (prev.fid ?? null), isConnected: true, isConnecting: false, chainId: undefined }));
                localStorage.setItem('wallet_address', addr);
                if (uname) localStorage.setItem('wallet_username', uname); else localStorage.removeItem('wallet_username');
                localStorage.removeItem('wallet_chain_id');
              }
            } catch {}
          };
          window.addEventListener('message', handler);
          cleanup = () => window.removeEventListener('message', handler);
        }
      } catch { /* ignore */ }
    })();
    return () => { if (cleanup) cleanup(); };
  }, []);

  return {
    ...state,
    connect,
    disconnect
  };
}
