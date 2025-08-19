import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { TRIV_TOKEN_CONFIG } from '../../../../config/contracts';
import { getMockUser, updateMockUser, QUESTION_REWARD, WINNER_BONUS } from '../../../lib/mockUsers';

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
  console.warn('Invalid PRIVATE_KEY, falling back to mock mode (game reward route):', e);
  account = null;
}

const walletClient = account ? createWalletClient({
  chain: base,
  transport: http(BASE_RPC_URL),
  account
}) : null;

// POST: Reward correct answer (gives 1 TRIV)
export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();
    
    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
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
        reward: QUESTION_REWARD.toString(),
        newBalance: updated.balance,
        questionsAnswered: updated.questionsAnswered
      });
    } else {
      // Real contract implementation
      if (!walletClient || !publicClient) {
        return NextResponse.json({ error: 'Contract not configured' }, { status: 500 });
      }

      // Execute reward transaction (only owner can call this)
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
    console.error('Question reward error:', error);
    return NextResponse.json({ error: 'Failed to reward question' }, { status: 500 });
  }
}

// POST: Reward game winner (gives 50 TRIV bonus)
export async function PUT(request: NextRequest) {
  try {
    const { address } = await request.json();
    
    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    if (USE_MOCK) {
      // Mock implementation using shared constants
      const user = getMockUser(address);
      const newBalance = (parseFloat(user.balance) + WINNER_BONUS).toString();
      const updated = updateMockUser(address, { balance: newBalance });

      return NextResponse.json({ 
        success: true, 
        bonus: WINNER_BONUS.toString(),
        newBalance: updated.balance
      });
    } else {
      // Real contract implementation - manual mint for winner
      if (!walletClient || !publicClient) {
        return NextResponse.json({ error: 'Contract not configured' }, { status: 500 });
      }

      // Mint winner bonus in wei using shared constant
      const winnerAmount = BigInt(WINNER_BONUS) * 10n ** 18n;
      const hash = await walletClient.writeContract({
        address: TRIV_TOKEN_CONFIG.address,
        abi: TRIV_TOKEN_CONFIG.abi,
        functionName: 'transfer', // Or a custom winner reward function
        args: [address, winnerAmount]
      });

      return NextResponse.json({ 
        success: true, 
        transactionHash: hash,
        bonus: '50'
      });
    }
  } catch (error) {
    console.error('Winner reward error:', error);
    return NextResponse.json({ error: 'Failed to reward winner' }, { status: 500 });
  }
}
