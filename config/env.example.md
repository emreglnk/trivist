# Environment Variables Configuration

`.env.local` dosyasını oluşturup aşağıdaki değişkenleri ekleyin:

```bash
# Base Sepolia Network Configuration
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_RPC_URL=https://sepolia.base.org

# TRIV Token Contract (Base Sepolia'ya deploy ettikten sonra güncelleyeceksin)
TRIV_TOKEN_ADDRESS=------------------

# Server-side wallet for gasless transactions (Production'da güvenli şekilde sakla)
PRIVATE_KEY=------------------------
# MongoDB Configuration
MONGODB_URI=------------------------
MONGODB_DB=quizdb

# MiniApp Configuration
NEXT_PUBLIC_MINIAPP_API_KEY=your_miniapp_api_key_here
NEXT_PUBLIC_MINIAPP_NAME=Trivio
NEXT_PUBLIC_MINIAPP_URL=https://triv.ist

# Coinbase OnchainKit
NEXT_PUBLIC_COINBASE_PROJECT_ID=your_coinbase_project_id_here
```

## Nasıl Ayarlayacaksın:

### 1. TRIV Token Deploy Et
```bash
# Hardhat/Foundry kullanarak Base mainnet'e deploy et
npx hardhat run scripts/deploy.js --network base
```

### 2. Environment Variables'ları Güncelle
- `TRIV_TOKEN_ADDRESS`: Deploy edilen kontrat adresi
- `PRIVATE_KEY`: Server-side işlemler için private key
- `NEXT_PUBLIC_COINBASE_PROJECT_ID`: Coinbase Developer Console'dan al

### 3. Base MiniApp Manifest
`public/miniapp.json` dosyasını oluştur ve Base'e kaydet
