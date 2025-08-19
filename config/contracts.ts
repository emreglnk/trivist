import { Address } from 'viem';

export interface ContractConfig {
  address: Address;
  abi: any[];
}

// TRIV Token Contract Configuration
export const TRIV_TOKEN_CONFIG: ContractConfig = {
  address: (process.env.TRIV_TOKEN_ADDRESS as Address) || '0x3129DD4d0454E94fcC98C7880A730038fD325063',
  abi: [
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
      "name": "getTimeUntilNextClaim",
      "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
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
    },
    {
      "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
      "name": "rewardCorrectAnswer",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "enterGame",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {"internalType": "address", "name": "to", "type": "address"},
        {"internalType": "uint256", "name": "amount", "type": "uint256"}
      ],
      "name": "transfer",
      "outputs": [
        {"internalType": "bool", "name": "", "type": "bool"}
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
      "name": "balanceOf",
      "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "DAILY_CLAIM_AMOUNT",
      "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "GAME_ENTRY_COST",
      "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "QUESTION_REWARD",
      "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    }
  ]
};

// Network Configuration
export const NETWORK_CONFIG = {
  chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '84532'),
  name: 'Base Sepolia',
  currency: 'ETH',
  explorerUrl: 'https://sepolia.basescan.org',
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org'
};

// Contract Deployment Instructions
export const DEPLOYMENT_GUIDE = `
## TRIV Token Deployment Guide

### 1. Install Hardhat
\`\`\`bash
npm install --save-dev hardhat @nomiclabs/hardhat-ethers ethers
\`\`\`

### 2. Create hardhat.config.js
\`\`\`javascript
require('@nomiclabs/hardhat-ethers');

module.exports = {
  solidity: "0.8.19",
  networks: {
    base: {
      url: "https://mainnet.base.org",
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
\`\`\`

### 3. Deploy Script (scripts/deploy.js)
\`\`\`javascript
async function main() {
  const TRIVToken = await ethers.getContractFactory("TRIVToken");
  const token = await TRIVToken.deploy();
  await token.deployed();
  console.log("TRIV Token deployed to:", token.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
\`\`\`

### 4. Deploy Command
\`\`\`bash
npx hardhat run scripts/deploy.js --network base
\`\`\`

### 5. Update Environment Variables
Copy the deployed contract address to TRIV_TOKEN_ADDRESS in .env.local
`;
