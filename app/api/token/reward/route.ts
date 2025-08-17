import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http } from 'viem';
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
      balance: '100',
      gamesPlayed: 0,
      questionsAnswered: 0,
      lastClaimTime: 0
    });
  }
  return mockUsers.get(address)!;
}

// Real contract clients
// publicClient can be uncommented if needed for reading contract state
// const publicClient = createPublicClient({
//   chain: baseSepolia,
//   transport: http(BASE_RPC_URL)
// });

// Normalize PRIVATE_KEY (add 0x if missing) and guard account creation
let account: ReturnType<typeof privateKeyToAccount> | null = null;
try {
  const rawPk = process.env.PRIVATE_KEY;
  if (rawPk) {
    const normalizedPk = (rawPk.startsWith('0x') ? rawPk : `0x${rawPk}`) as `0x${string}`;
    account = privateKeyToAccount(normalizedPk);
  }
} catch (e) {
  console.warn('Invalid PRIVATE_KEY, falling back to mock mode (reward route):', e);
  account = null;
}

const walletClient = account ? createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(BASE_RPC_URL)
}) : null;

const TRIV_TOKEN_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
    "name": "rewardCorrectAnswer",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

export async function POST(request: NextRequest) {
  try {
    const { address, correct } = await request.json();

    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    if (!correct) {
      return NextResponse.json({ message: 'No reward for incorrect answer' });
    }

    if (USE_MOCK) {
      // Mock implementation
      const user = getMockUser(address);
      
      // Mock reward: Add 1 TRIV for correct answer
      user.balance = (parseFloat(user.balance) + 1).toString();
      user.questionsAnswered++;

      return NextResponse.json({ 
        success: true, 
        transactionHash: '0x' + Math.random().toString(16).substr(2, 64), // Mock hash
        reward: '1'
      });
    } else {
      // Real contract implementation
      if (!walletClient) {
        return NextResponse.json({ error: 'Contract not configured' }, { status: 500 });
      }

      // Execute gasless reward transaction
      const hash = await walletClient.writeContract({
        address: TRIV_TOKEN_ADDRESS,
        abi: TRIV_TOKEN_ABI,
        functionName: 'rewardCorrectAnswer',
        args: [address]
      });

      return NextResponse.json({ 
        success: true, 
        transactionHash: hash,
        reward: '1'
      });
    }

  } catch (error) {
    console.error('Reward error:', error);
    return NextResponse.json({ error: 'Failed to reward tokens' }, { status: 500 });
  }
}
