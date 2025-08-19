import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { TRIV_TOKEN_CONFIG } from '../../../../config/contracts';
import { getMockUser, updateMockUser, GAME_ENTRY_COST } from '../../../lib/mockUsers';

// Ensure Node.js runtime for viem compatibility
export const runtime = 'nodejs';

const BASE_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const USE_MOCK = !PRIVATE_KEY || PRIVATE_KEY.length < 64;

// Contract clients
const publicClient = createPublicClient({
  chain: base,
  transport: http(BASE_RPC_URL)
});

// Normalize PRIVATE_KEY (add 0x if missing) and guard account creation
let account: ReturnType<typeof privateKeyToAccount> | null = null;
try {
  const rawPk = process.env.PRIVATE_KEY;
  if (rawPk) {
    const normalizedPk = (rawPk.startsWith('0x') ? rawPk : `0x${rawPk}`) as `0x${string}`;
    account = privateKeyToAccount(normalizedPk);
  }
} catch (e) {
  console.warn('Invalid PRIVATE_KEY, falling back to mock mode (game entry route):', e);
  account = null;
}

const walletClient = account ? createWalletClient({
  chain: base,
  transport: http(BASE_RPC_URL),
  account
}) : null;

// POST: Enter game (costs 25 TRIV)
export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();
    
    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    if (USE_MOCK) {
      // Mock implementation
      const user = getMockUser(address);
      const balance = parseFloat(user.balance);
      const entryCost = GAME_ENTRY_COST;

      if (balance < entryCost) {
        return NextResponse.json({ error: 'Insufficient TRIV tokens' }, { status: 400 });
      }

      // Deduct entry cost and increment games played using shared updater
      const newBalance = (balance - entryCost).toString();
      const updated = updateMockUser(address, {
        balance: newBalance,
        gamesPlayed: user.gamesPlayed + 1
      });

      return NextResponse.json({ 
        success: true, 
        newBalance: updated.balance,
        gamesPlayed: updated.gamesPlayed
      });
    } else {
      // Real contract implementation
      if (!walletClient || !publicClient) {
        return NextResponse.json({ error: 'Contract not configured' }, { status: 500 });
      }

      // Check balance first (ensure bigint type regardless of ABI typing)
      const rawBalance = await publicClient.readContract({
        address: TRIV_TOKEN_CONFIG.address,
        abi: TRIV_TOKEN_CONFIG.abi,
        functionName: 'balanceOf',
        args: [address]
      });

      const balance: bigint =
        typeof rawBalance === 'bigint'
          ? rawBalance
          : BigInt(Array.isArray(rawBalance) ? (rawBalance as any)[0] : (rawBalance as any));

      const entryCost = BigInt(GAME_ENTRY_COST) * 10n**18n; // convert TRIV to wei based on decimals
      if (balance < entryCost) {
        return NextResponse.json({ error: 'Insufficient TRIV tokens' }, { status: 400 });
      }

      // Execute game entry transaction
      const hash = await walletClient.writeContract({
        address: TRIV_TOKEN_CONFIG.address,
        abi: TRIV_TOKEN_CONFIG.abi,
        functionName: 'enterGame',
        args: []
      });

      return NextResponse.json({ 
        success: true, 
        transactionHash: hash
      });
    }
  } catch (error) {
    console.error('Game entry error:', error);
    return NextResponse.json({ error: 'Failed to enter game' }, { status: 500 });
  }
}
