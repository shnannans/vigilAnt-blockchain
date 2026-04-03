# vigilAnt — Parametric Disaster Relief Fund

A proof-of-concept decentralised application (DApp) built on Ethereum Sepolia that automates disaster relief fund disbursement using blockchain smart contracts, Chainlink oracle data, and USDC stablecoins.

**BAC2002 Blockchain and Cryptocurrency — Group 9, Singapore Institute of Technology**

---

## Overview

Contributors deposit USDC into country-specific pools (Japan, Thailand, Philippines, Indonesia, Vietnam). When a Chainlink oracle verifies a qualifying disaster event and 3-of-5 registered validators confirm it, the contract automatically transfers USDC to pre-registered NGO wallets. No banks, no intermediaries, no single point of control.

- Contract address: `0xC7E948D515d3a501033728469F728680D1dFB37A`
- Network: Ethereum Sepolia testnet
- Etherscan: https://sepolia.etherscan.io/address/0xC7E948D515d3a501033728469F728680D1dFB37A

---

## Repository Structure

```
vigilAnt/
├── contracts/
│   ├── VigilAnt.sol                  # Main smart contract
│   └── mocks/
│       └── MockUSDC.sol              # Mock ERC-20 for local testing
├── scripts/
│   ├── deploy.js                     # Hardhat deployment script
│   ├── verify.js                     # Etherscan verification helper
│   ├── fix-jobid.js                  # Chainlink job ID utility
│   └── test-oracle-request.js        # Oracle integration test script
├── test/
│   └── VigilAnt.test.js              # Hardhat test suite (4 tests)
├── chainlink/
│   └── CHAINLINK_UI_RUNBOOK.md       # Chainlink oracle setup guide
├── frontend/
│   ├── index.html                    # Main UI (4 role-based panels)
│   ├── styles.css                    # Stylesheet
│   ├── app.js                        # ethers.js v6 frontend logic
│   ├── config.js                     # Contract addresses, ABIs, constants
│   └── assets/                       # Images and static assets
├── docs/
│   └── sequence-diagram.md           # Mermaid sequence diagram source
├── gas-report.txt                    # Hardhat gas reporter output
├── hardhat.config.js                 # Hardhat configuration
├── package.json
├── .env.example                      # Environment variable template
└── README.md
```

---

## Prerequisites

Before running anything, ensure you have the following installed:

- Node.js v18 or higher — https://nodejs.org
- npm v9 or higher (comes with Node.js)
- MetaMask browser extension — https://metamask.io
- Git — https://git-scm.com

---

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/shnannans/vigilAnt-blockchain.git
cd vigilAnt-blockchain
npm install
```

---

## Environment Configuration

Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and fill in the following:

```
PRIVATE_KEY=your_deployer_wallet_private_key
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/your_infura_project_id
ETHERSCAN_API_KEY=your_etherscan_api_key
COINMARKETCAP_API_KEY=your_coinmarketcap_api_key
```

How to obtain each value:

- `PRIVATE_KEY` — Export from MetaMask: Account Details > Export Private Key. Use a dedicated testnet wallet only, never a mainnet wallet with real funds.
- `SEPOLIA_RPC_URL` — Create a free account at https://infura.io, create a new API key, and copy the Sepolia endpoint URL.
- `ETHERSCAN_API_KEY` — Register at https://etherscan.io/register and generate a free API key under your account settings.
- `COINMARKETCAP_API_KEY` — Optional. Register at https://coinmarketcap.com/api for USD gas cost conversion in the gas report. Without this, gas units still appear but no USD conversion is shown.

The `.env` file is listed in `.gitignore` and will never be committed to the repository.

---

## Running the Frontend (no deployment required)

The contract is already deployed at `0xC7E948D515d3a501033728469F728680D1dFB37A` on Sepolia. To run the frontend against the live contract:

**Step 1 — Configure MetaMask**

Add Ethereum Sepolia to MetaMask if not already present:
- Network name: Sepolia
- RPC URL: `https://sepolia.infura.io/v3/your_infura_key`
- Chain ID: 11155111
- Currency symbol: ETH
- Block explorer: https://sepolia.etherscan.io

**Step 2 — Get testnet tokens**

- Sepolia ETH (for gas): https://sepoliafaucet.com
- Sepolia USDC (for deposits): https://faucet.circle.com

**Step 3 — Start the local server**

```bash
cd frontend
npx serve .
```

Open http://localhost:3000 in your browser.

**Step 4 — Connect wallet**

Click "Connect Wallet" in the top navigation. MetaMask will prompt you to connect. Ensure you are on the Sepolia network before connecting.

Role detection is automatic:
- If your address matches the contract owner, you see the Admin panel.
- If your address is one of the 5 registered validators, you see the Validator panel.
- All other addresses see the Contributor panel.

---

## Running Tests

Tests run against a local Hardhat network and do not require Sepolia or any testnet tokens:

```bash
npx hardhat test
```

This runs 4 tests covering:
- `deposit()` — contributor deposits USDC into a country pool
- `simulateDisaster()` — admin creates a PENDING disaster event
- `confirmDisaster() x3` — 3 validator confirmations trigger automatic payout
- `returnExpired()` — admin returns USDC to a contributor after window expiry

The gas reporter runs automatically and outputs results to `gas-report.txt`.

---

## Deployment (team use only)

This section is for redeploying the contract. The contract is already live — do not redeploy unless intentionally replacing it.

**Step 1 — Fill in deploy.js**

Open `scripts/deploy.js` and confirm all addresses are filled in:
- `VALIDATORS` — 5 team MetaMask wallet addresses (one per team member)
- `NGO_ADDRESSES` — 5 fresh wallet addresses in order: JPN, THA, PHL, IDN, VNM
- `ORACLE_ADDRESS` — Chainlink operator contract on Sepolia
- `JOB_ID_STRING` — Chainlink Any API job ID

**Step 2 — Compile**

```bash
npx hardhat compile
```

**Step 3 — Deploy to Sepolia**

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

The script will print the new contract address and a copy-paste ready verify command on completion.

**Step 4 — Verify on Etherscan**

Copy the verify command printed by deploy.js and run it:

```bash
npx hardhat verify --network sepolia <contract_address> <constructor_args>
```

**Step 5 — Update frontend config**

Open `frontend/config.js` and update:

```javascript
VIGILANT_CONTRACT: "0xYOUR_NEW_CONTRACT_ADDRESS",
```

---

## Smart Contract Architecture

`VigilAnt.sol` manages all five country pools in a single contract. Key design decisions:

**Single contract, multiple pools**
Rather than deploying five separate contracts, a single contract accepts a `countryCode` parameter (1=Japan, 2=Thailand, 3=Philippines, 4=Indonesia, 5=Vietnam). This reduces deployment gas, simplifies oracle configuration, and centralises access control.

**USDC stablecoin**
All deposits and payouts use Circle's USDC ERC-20 token. USDC maintains a 1:1 USD peg, eliminating the ETH price volatility risk that would undermine the financial guarantees of a disaster relief fund.

**Chainlink Any API oracle**
The contract sends oracle requests via `requestDisasterData(countryCode)`, which costs 0.1 LINK from the contract's balance. The Chainlink DON fetches a JSON endpoint and calls `fulfill(requestId, alertLevel)` back on the contract. If alertLevel is "Red" or "Orange", a PENDING disaster event is created.

**Oracle fallback**
The contract includes `simulateDisaster(countryCode, severity)` which produces an identical PENDING event without the oracle. This is used for testing and demo reliability. In production this function would be removed. vigilAnt is not oracle-dependent for correctness — the validator consensus and payout mechanism work identically regardless of how the event was created.

**3-of-5 threshold consensus**
Five validator addresses are registered at deployment. Any 3 of the 5 must call `confirmDisaster(eventId)` independently. On the 3rd confirmation, `_triggerPayout()` executes automatically in the same transaction — no separate trigger and no admin override possible.

**Payout calculation**
40% of the country pool is released per disaster event. The payout is capped at the NGO's configured minimum amount to prevent overpaying small pools. State is zeroed before transfers to prevent re-entrancy.

**Contributor refunds**
If a contribution window expires without a disaster event, the admin calls `returnExpired(contributorAddress)`. The contract verifies the expiry, zeroes the contribution record before transferring, and emits `FundsReturned`.

---

## On-Chain / Off-Chain Design Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Pool balances | On-chain | Immutable, publicly auditable, tamper-proof |
| Disaster verification | Off-chain via Chainlink DON | Real-world data cannot originate on-chain |
| Validator identities | Off-chain (MetaMask wallets) | Private keys stay with validators |
| Frontend state | Off-chain (read from events) | No centralised database needed |
| NGO wallet management | On-chain (registered at deploy) | Prevents post-deployment substitution |
| Platform fee collection | On-chain (5% at deposit) | Automatic, trustless, auditable |

---

## Security

- **Re-entrancy protection** — state zeroed before all USDC transfers (`returnExpired`, `_payNGOs`)
- **Access control** — three tiers: `onlyOwner` for admin, `onlyValidator` for confirmation, unrestricted for deposits and reads
- **Double-confirmation guard** — `require(!hasConfirmedMap[eventId][msg.sender])` prevents a validator from confirming the same event twice
- **Oracle callback validation** — `recordChainlinkFulfillment(requestId)` verifies the response came from the correct oracle address
- **Emergency withdrawal** — owner can recover USDC in exceptional circumstances; this is acknowledged as a trust trade-off and would be governed by a DAO in production
- **Gas optimisations** — validators array stored as `private` (no auto-generated getter); `gdacsEventId` uses `bytes32` instead of `string` (saves approximately 20,000 gas per disaster event)

---

## Gas Costs

Measured using `hardhat-gas-reporter` on local Hardhat with Solidity optimizer enabled (runs: 200).

| Operation | Gas used | Notes |
|---|---|---|
| `USDC.approve()` | 44,230 | Standard ERC-20 approve |
| `deposit()` | 178,329 | 2x transferFrom + storage writes |
| `simulateDisaster()` | 142,530 | Single storage write |
| `confirmDisaster()` confirms 1 and 2 | 53,837 | Storage write + event |
| `confirmDisaster()` confirm 3 | 101,608 | Includes auto-triggered payout |
| `returnExpired()` | 61,976 | Storage zero + USDC transfer |
| Contract deployment | 3,493,283 | 5.8% of Sepolia block limit |

Full output in `gas-report.txt`.

---

## Scalability and Production Roadmap

The current POC handles five countries with one NGO per pool and admin-triggered oracle requests. A production deployment would require:

- Chainlink Automation for scheduled oracle polling instead of manual admin triggers
- Priority queue for multiple NGOs per country pool
- Contributor self-service refunds instead of admin-triggered `returnExpired()`
- Multi-sig or DAO governance replacing the single admin owner
- Migration to Ethereum mainnet or an L2 such as Arbitrum or Base — the same `deposit()` call at 178,329 gas would cost under $0.01 at Arbitrum gas prices, making micro-contributions viable in developing economies

---

## Team

| Name | Role |
|---|---|
| Shannon Yum Wan Ning | Smart contracts and deployment |
| Goh Jing Wen | Oracle integration and frontend |
| Corvan Chua | Chainlink oracle configuration |
| Venecia Weng | Testing and gas analysis |
| Jeanie Cherie Chua Yue-Ning | Report and demo |

---
## Demo

[![vigilAnt Demo](https://img.youtube.com/vi/Ibk8FJpvMmM/hqdefault.jpg)](https://youtu.be/Ibk8FJpvMmM)

Watch the full demo on YouTube: https://youtu.be/Ibk8FJpvMmM

## Acknowledgements

- Chainlink Any API documentation — https://docs.chain.link/any-api/introduction
- Circle USDC Sepolia faucet — https://faucet.circle.com
- GDACS Global Disaster Alert and Coordination System — https://www.gdacs.org
- Hardhat development environment — https://hardhat.org
