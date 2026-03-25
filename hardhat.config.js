// ─────────────────────────────────────────────────────────────────────────────
//  vigilAnt — hardhat.config.js
//  Project root — same level as package.json, NOT inside scripts/ or contracts/
//
//  SETUP (run once after cloning the repo):
//    npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox hardhat-gas-reporter
//    npm install @chainlink/contracts @openzeppelin/contracts
//    cp .env.example .env    ← then fill in your values
//
//  COMMANDS:
//    npx hardhat compile                              — compile contracts
//    npx hardhat test                                 — run tests + gas report
//    npx hardhat run scripts/deploy.js --network sepolia  — deploy
//    npx hardhat verify --network sepolia <address> <args> — verify on Etherscan
// ─────────────────────────────────────────────────────────────────────────────

require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");
require("dotenv").config();

// ── ENV VALIDATION ───────────────────────────────────────────────────────────
// These values must be in your .env file before deploying.
// For local testing only (npx hardhat test), they can be left empty.
const PRIVATE_KEY      = process.env.PRIVATE_KEY      || "0x" + "0".repeat(64); // dummy for local
const SEPOLIA_RPC_URL  = process.env.SEPOLIA_RPC_URL  || "";
const ETHERSCAN_API_KEY= process.env.ETHERSCAN_API_KEY|| "";
const COINMARKETCAP_KEY= process.env.COINMARKETCAP_API_KEY || ""; // for USD gas costs

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {

  // ── SOLIDITY COMPILER ──────────────────────────────────────────────────────
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,   // reduces deployment gas cost — required for report's gas section
        runs: 200,       // 200 = optimise for average call frequency (standard default)
      },
    },
  },

  // ── NETWORKS ───────────────────────────────────────────────────────────────
  networks: {
    // Local Hardhat network — used for npx hardhat test
    // No config needed — Hardhat spins it up automatically
    hardhat: {
      chainId: 31337,
    },

    // Ethereum Sepolia testnet — used for deployment and demo
    sepolia: {
      url:      SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId:  11155111,
    },
  },

  // ── ETHERSCAN VERIFICATION ─────────────────────────────────────────────────
  // Used by: npx hardhat verify --network sepolia <contractAddress> <...args>
  // Get a free API key at: https://etherscan.io/register
etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },

  // ── GAS REPORTER ──────────────────────────────────────────────────────────
  // Runs automatically when you run: npx hardhat test
  // Prints a table showing gas used + USD cost for every function call in tests.
  // Use this output for the report's gas cost analysis section.
  //
  // To get USD prices: add COINMARKETCAP_API_KEY to .env (free at coinmarketcap.com/api)
  // Without the API key it still shows gas units — just no USD conversion.
  gasReporter: {
    enabled:       true,
    currency:      "USD",
    coinmarketcap: COINMARKETCAP_KEY,
    token:         "ETH",              // we're on Ethereum Sepolia
    gasPriceApi:   "https://api.etherscan.io/api?module=proxy&action=eth_gasPrice",
    showTimeSpent: true,               // shows how long each test took
    showMethodSig: true,               // shows full function signature in output

    // Output the gas report to a file as well — useful for the report
    outputFile:    "gas-report.txt",
    noColors:      true,               // plain text in the file (no terminal colour codes)
  },

  // ── TEST PATHS ─────────────────────────────────────────────────────────────
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },

  // ── MOCHA (test runner) ────────────────────────────────────────────────────
  mocha: {
    timeout: 60000, // 60 seconds — Sepolia calls can be slow during tests
  },
};
