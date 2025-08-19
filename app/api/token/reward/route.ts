import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { TRIV_TOKEN_CONFIG } from '../../../../config/contracts';
import { getMockUser, updateMockUser, QUESTION_REWARD } from '../../../lib/mockUsers';

// Ensure Node.js runtime for viem compatibility
export const runtime = 'nodejs';

// Contract configuration
const BASE_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org';
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532); // 8453 mainnet, 84532 sepolia
const CHAIN = CHAIN_ID === 8453 ? base : baseSepolia;

// Check if we should use mock or real contract (private key presence/validity)
const USE_MOCK = !process.env.PRIVATE_KEY ||
                 process.env.PRIVATE_KEY === '0x0000000000000000000000000000000000000000000000000000000000000000';

// Using shared mock system from app/lib/mockUsers

// Real contract client (writes only)

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
  chain: CHAIN,
  transport: http(BASE_RPC_URL)
}) : null;

// TRIV_TOKEN_CONFIG.abi used for contract writes

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
      // Mock implementation using shared constants
      const user = getMockUser(address);
      const newBalance = (parseFloat(user.balance) + QUESTION_REWARD).toString();
      const updated = updateMockUser(address, {
        balance: newBalance,
        questionsAnswered: user.questionsAnswered + 1
      });

      return NextResponse.json({ 
        success: true, 
        transactionHash: '0x' + Math.random().toString(16).substr(2, 64),
        reward: QUESTION_REWARD.toString(),
        newBalance: updated.balance,
        questionsAnswered: updated.questionsAnswered
      });
    } else {
      // Real contract implementation
      if (!walletClient) {
        return NextResponse.json({ error: 'Contract not configured' }, { status: 500 });
      }

      // Execute gasless reward transaction
      const hash = await walletClient.writeContract({
        address: TRIV_TOKEN_CONFIG.address,
        abi: TRIV_TOKEN_CONFIG.abi,
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
