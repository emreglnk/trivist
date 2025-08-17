const { ethers } = require('hardhat');

async function main() {
  console.log('Deploying TRIV Token to Base...');

  // Get the contract factory
  const TRIVToken = await ethers.getContractFactory('TRIVToken');

  // Deploy the contract
  const token = await TRIVToken.deploy();
  await token.deployed();

  console.log('✅ TRIV Token deployed to:', token.address);
  console.log('🔗 Base Explorer:', `https://basescan.org/address/${token.address}`);
  
  // Verify contract on Basescan (optional)
  console.log('\n📋 Contract verification command:');
  console.log(`npx hardhat verify --network base ${token.address}`);
  
  // Update environment variables instruction
  console.log('\n🔧 Update your .env.local file:');
  console.log(`TRIV_TOKEN_ADDRESS=${token.address}`);
  
  // Update miniapp.json instruction
  console.log('\n📱 Update public/miniapp.json:');
  console.log(`Replace the contract address in the blockchain.contracts.TRIV.address field`);
  
  // Initial setup transactions
  console.log('\n🚀 Initial setup complete!');
  console.log('Next steps:');
  console.log('1. Update .env.local with the contract address');
  console.log('2. Update public/miniapp.json with the contract address');
  console.log('3. Register your MiniApp with Base');
  console.log('4. Test the token functions');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
