"use client";

import { useState, useCallback, useEffect } from 'react';

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId?: number;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    chainId: undefined
  });

  const connect = useCallback(async () => {
    setState(prev => ({ ...prev, isConnecting: true }));
    
    try {
      // Check if wallet is available
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const accounts = await (window as any).ethereum.request({
          method: 'eth_requestAccounts'
        });
        
        // Get chain ID
        const chainId = await (window as any).ethereum.request({
          method: 'eth_chainId'
        });
        
        // Check if we're on Base Sepolia (0x14A34 = 84532)
        const baseChainId = 84532;
        const currentChainId = parseInt(chainId, 16);
        
        if (currentChainId !== baseChainId) {
          // Request to switch to Base network
          try {
            await (window as any).ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x14A34' }], // Base Sepolia chain ID in hex
            });
          } catch (switchError: any) {
            // Chain not added to MetaMask, add it
            if (switchError.code === 4902) {
              await (window as any).ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x14A34',
                  chainName: 'Base Sepolia',
                  nativeCurrency: {
                    name: 'Ethereum',
                    symbol: 'ETH',
                    decimals: 18,
                  },
                  rpcUrls: ['https://sepolia.base.org'],
                  blockExplorerUrls: ['https://sepolia.basescan.org'],
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
            chainId: baseChainId
          });
          
          // Store in localStorage
          localStorage.setItem('wallet_address', accounts[0]);
          localStorage.setItem('wallet_chain_id', baseChainId.toString());
        }
      } else {
        // Fallback for testing - generate a valid 20-byte mock address
        let mockAddress = '0x000000000000000000000000000000000000dead';
        try {
          if (typeof window !== 'undefined' && (window as any).crypto?.getRandomValues) {
            const bytes = new Uint8Array(20);
            (window as any).crypto.getRandomValues(bytes);
            mockAddress = '0x' + Array.from(bytes).map((b: number) => b.toString(16).padStart(2, '0')).join('');
          }
        } catch {}
        setState({
          address: mockAddress,
          isConnected: true,
          isConnecting: false,
          chainId: 84532
        });
        
        localStorage.setItem('wallet_address', mockAddress);
        localStorage.setItem('wallet_chain_id', '84532');
      }
    } catch (error) {
      console.error('Wallet connection failed:', error);
      setState(prev => ({ ...prev, isConnecting: false }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({
      address: null,
      isConnected: false,
      isConnecting: false,
      chainId: undefined
    });
    localStorage.removeItem('wallet_address');
    localStorage.removeItem('wallet_chain_id');
  }, []);

  // Auto-connect on mount if previously connected
  useEffect(() => {
    const savedAddress = localStorage.getItem('wallet_address');
    const savedChainId = localStorage.getItem('wallet_chain_id');
    if (savedAddress) {
      setState({
        address: savedAddress,
        isConnected: true,
        isConnecting: false,
        chainId: savedChainId ? parseInt(savedChainId) : 84532
      });
    }
  }, []);

  return {
    ...state,
    connect,
    disconnect
  };
}
