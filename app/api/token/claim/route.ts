import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
// Ensure Node.js runtime for viem compatibility
export const runtime = 'nodejs';

// Contract configuration
const TRIV_TOKEN_ADDRESS = process.env.TRIV_TOKEN_ADDRESS as `0x${string}` || '0x3129DD4d0454E94fcC98C7880A730038fD325063';
const BASE_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org';

// Check if we should use mock or real contract
const USE_MOCK = !process.env.TRIV_TOKEN_ADDRESS || 
                 process.env.TRIV_TOKEN_ADDRESS === '0x0000000000000000000000000000000000000000' ||
                 !process.env.PRIVATE_KEY;

// Mock token system for development
interface MockUserStats {
  balance: string;
  gamesPlayed: number;
  questionsAnswered: number;
  lastClaimTime: number;
}

const mockUsers = new Map<string, MockUserStats>();

function getMockUser(address: string): MockUserStats {
  if (!mockUsers.has(address)) {
    mockUsers.set(address, {
      balance: '100', // Start with 100 TRIV
      gamesPlayed: 0,
      questionsAnswered: 0,
      lastClaimTime: 0
    });
  }
  return mockUsers.get(address)!;
}

function canClaimDaily(user: MockUserStats): boolean {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  return now >= user.lastClaimTime + dayInMs;
}

// Real contract clients
const publicClient = createPublicClient({
  chain: baseSepolia,
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

const walletClient = account ? createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(BASE_RPC_URL)
}) : null;

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

      // Mock claim: Add 50 TRIV
      user.balance = (parseFloat(user.balance) + 50).toString();
      user.lastClaimTime = Date.now();

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
        address: TRIV_TOKEN_ADDRESS,
        abi: TRIV_TOKEN_ABI,
        functionName: 'canClaimDaily',
        args: [address]
      });

      if (!canClaim) {
        return NextResponse.json({ error: 'Daily claim not available yet' }, { status: 400 });
      }

      // Execute gasless claim transaction
      const hash = await walletClient.writeContract({
        address: TRIV_TOKEN_ADDRESS,
        abi: TRIV_TOKEN_ABI,
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
      if (publicClient && TRIV_TOKEN_ADDRESS && isAddress(address)) {
        const stats = await publicClient.readContract({
          address: TRIV_TOKEN_ADDRESS,
          abi: TRIV_TOKEN_ABI,
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
    const dayInMs = 24 * 60 * 60 * 1000;
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
