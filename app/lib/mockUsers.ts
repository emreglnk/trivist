// Shared mock user system for development
export interface MockUserStats {
  balance: string;
  gamesPlayed: number;
  questionsAnswered: number;
  lastClaimTime: number;
}

// In-memory storage for mock users
const mockUsers = new Map<string, MockUserStats>();

export function getMockUser(address: string): MockUserStats {
  if (!mockUsers.has(address)) {
    mockUsers.set(address, {
      balance: '0', // Start with 0 TRIV, must claim daily
      gamesPlayed: 0,
      questionsAnswered: 0,
      lastClaimTime: 0
    });
  }
  return mockUsers.get(address)!;
}

export function updateMockUser(address: string, updates: Partial<MockUserStats>): MockUserStats {
  const user = getMockUser(address);
  Object.assign(user, updates);
  mockUsers.set(address, user);
  return user;
}

export function canClaimDaily(user: MockUserStats): boolean {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000; // 24 hours as per contract
  return now >= user.lastClaimTime + dayInMs;
}

// Contract constants
export const DAILY_CLAIM_AMOUNT = 50;
export const GAME_ENTRY_COST = 25;
export const QUESTION_REWARD = 1;
export const WINNER_BONUS = 50;
