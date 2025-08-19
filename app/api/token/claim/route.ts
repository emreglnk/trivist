import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { TRIV_TOKEN_CONFIG } from '../../../../config/contracts';
import { getMockUser, updateMockUser, canClaimDaily, DAILY_CLAIM_AMOUNT } from '../../../lib/mockUsers';

// Ensure Node.js runtime for viem compatibility
export const runtime = 'nodejs';

// Contract configuration
const BASE_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org';
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532); // 8453 mainnet, 84532 sepolia
const CHAIN = CHAIN_ID === 8453 ? base : baseSepolia;

// Check if we should use mock or real contract
const USE_MOCK = !process.env.PRIVATE_KEY ||
  process.env.PRIVATE_KEY === '0x0000000000000000000000000000000000000000000000000000000000000000' ||
  !process.env.PRIVATE_KEY;

// Real contract clients
const publicClient = createPublicClient({
  chain: CHAIN,
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
  console.warn('Invalid PRIVATE_KEY, falling back to mock mode:', e);
  account = null;
}

const walletClient = account
  ? createWalletClient({
      account,
      chain: CHAIN,
      transport: http(BASE_RPC_URL),
    })
  : null;

const TRIV_TOKEN_ABI = [
  {
    "inputs": [],
    "name": "claimDailyTokens",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
    "name": "canClaimDaily",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
    "name": "getUserStats",
    "outputs": [
      {"internalType": "uint256", "name": "balance", "type": "uint256"},
      {"internalType": "uint256", "name": "games", "type": "uint256"},
      {"internalType": "uint256", "name": "questions", "type": "uint256"},
      {"internalType": "bool", "name": "canClaim", "type": "bool"},
      {"internalType": "uint256", "name": "timeUntilClaim", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();

    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    if (USE_MOCK) {
      // Mock implementation
      const user = getMockUser(address);

      if (!canClaimDaily(user)) {
        return NextResponse.json({ error: 'Daily claim not available yet' }, { status: 400 });
      }

      // Mock claim: Add DAILY_CLAIM_AMOUNT TRIV
      const newBalance = (parseFloat(user.balance) + DAILY_CLAIM_AMOUNT).toString();
      updateMockUser(address, {
        balance: newBalance,
        lastClaimTime: Date.now()
      });

      return NextResponse.json({ 
        success: true, 
        transactionHash: '0x' + Math.random().toString(16).substr(2, 64), // Mock hash
        amount: '50'
      });
    } else {
      // Real contract implementation
      if (!walletClient || !publicClient) {
        return NextResponse.json({ error: 'Contract not configured' }, { status: 500 });
      }

      // Check if user can claim
      const canClaim = await publicClient.readContract({
        address: TRIV_TOKEN_CONFIG.address,
        abi: TRIV_TOKEN_CONFIG.abi,
        functionName: 'canClaimDaily',
        args: [address]
      });

      if (!canClaim) {
        return NextResponse.json({ error: 'Daily claim not available yet' }, { status: 400 });
      }

      // Execute gasless claim transaction
      const hash = await walletClient.writeContract({
        address: TRIV_TOKEN_CONFIG.address,
        abi: TRIV_TOKEN_CONFIG.abi,
        functionName: 'claimDailyTokens',
        args: []
      });

      return NextResponse.json({ 
        success: true, 
        transactionHash: hash,
        amount: '50'
      });
    }

  } catch (error) {
    console.error('Claim error:', error);
    return NextResponse.json({ error: 'Failed to claim tokens' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    // Try real contract read first when possible; fallback to mock
    try {
      if (publicClient && TRIV_TOKEN_CONFIG.address && isAddress(address)) {
        const stats = await publicClient.readContract({
          address: TRIV_TOKEN_CONFIG.address,
          abi: TRIV_TOKEN_CONFIG.abi,
          functionName: 'getUserStats',
          args: [address]
        });

        const [balance, games, questions, canClaim, timeUntilClaim] = stats as [bigint, bigint, bigint, boolean, bigint];

        return NextResponse.json({
          balance: (Number(balance) / 10**18).toString(),
          gamesPlayed: Number(games),
          questionsAnswered: Number(questions),
          canClaimDaily: canClaim,
          timeUntilNextClaim: Number(timeUntilClaim)
        });
      }
    } catch (e) {
      console.warn('Contract read failed, falling back to mock stats:', e);
    }

    // Mock implementation fallback
    const user = getMockUser(address);
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000; // 24 hours as per contract
    const nextClaimTime = user.lastClaimTime + dayInMs;
    const timeUntilClaim = Math.max(0, Math.floor((nextClaimTime - now) / 1000));

    return NextResponse.json({
      balance: user.balance,
      gamesPlayed: user.gamesPlayed,
      questionsAnswered: user.questionsAnswered,
      canClaimDaily: canClaimDaily(user),
      timeUntilNextClaim: timeUntilClaim
    });

  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
