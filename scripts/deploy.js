// ─────────────────────────────────────────────────────────────────────────────
//  vigilAnt — deploy.js
//  Hardhat deployment script for VigilAnt.sol on Ethereum Sepolia testnet.
//
//  BEFORE RUNNING:
//    1. Fill in all FILL_IN sections below — validator + NGO addresses
//    2. Copy .env.example to .env and fill in your private key + RPC URL
//    3. Ensure your deployer wallet has Sepolia ETH (faucet: sepoliafaucet.com)
//    4. Run: npx hardhat run scripts/deploy.js --network sepolia
//
//  AFTER RUNNING:
//    5. Copy the printed contract address into frontend/config.js → VIGILANT_CONTRACT
//    6. Run verification: npx hardhat verify --network sepolia <address> <...args>
//       (constructor args are printed at the end of this script for copy-paste)
//    7. Fund contract with 5 LINK: https://faucets.chain.link/sepolia
// ─────────────────────────────────────────────────────────────────────────────

const { ethers } = require("hardhat");

async function main() {

  // ── WHO IS DEPLOYING ────────────────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  console.log("\n🐜 vigilAnt — deploying to Sepolia");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Deployer (admin):", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

  if (balance < ethers.parseEther("0.05")) {
    throw new Error("⚠️  Deployer balance is low. Get Sepolia ETH from sepoliafaucet.com before deploying.");
  }

  // ── KNOWN ADDRESSES — DO NOT CHANGE THESE ──────────────────────────────────
  // Circle official USDC on Sepolia — everyone uses this exact address
  const USDC_ADDRESS  = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  // Chainlink LINK token on Sepolia
  const LINK_ADDRESS  = "0x779877A7B0D9E8603169DdbD7836e478b4624789";

  // ── VALIDATOR ADDRESSES — FILL IN ──────────────────────────────────────────
  // One MetaMask address per team member.
  // These wallets will call confirmDisaster() on demo day.
  // Collect from all 5 team members before running this script.
  const VALIDATORS = [
    "0x06cBE48CD25F61682740F76B6cd966862b21015F",   // shannon (both admin and validator)
    "0xB4A6b8A3cC14389df36f5470c5A860C7C0F8eb13",   // jing wen
    "0xa2b2874B8cBD27bce28A6c9c2B909521dD3C6477",   // Team member 3
    "0x_FILL_IN_VALIDATOR_4",   // Team member 4
    "0x_FILL_IN_VALIDATOR_5",   // Team member 5
  ];

  // ── NGO ADDRESSES — FILL IN ────────────────────────────────────────────────
  // 5 fresh MetaMask accounts created by Person A — one per country.
  // Order: [JPN, THA, PHL, IDN, VNM] — must match this exact order.
  // These wallets receive USDC on demo day when payout triggers.
  const NGO_ADDRESSES = [
    "0x114EF71B6C7a32ADA778b55E2274fB9BeD999f11",   // NGO-JP — Japan 🇯🇵
    "0xADFA8566Bcc92cBB4937E1d7f8F1db9eFe8978FA",   // NGO-TH — Thailand 🇹🇭
    "0x107300c3AbC40e6d9A4760193E6fd2943E16211B",   // NGO-PH — Philippines 🇵🇭
    "0x2BdfA05937d04983a50bd2F0BA9C24aEec498598",   // NGO-ID — Indonesia 🇮🇩
    "0x13831f285554B53850Ee42049F9c61924F72F2a7",   // NGO-VN — Vietnam 🇻🇳
  ];

  // Minimum USDC payout per NGO — 50 USDC each (in 6-decimal units)
  // 50 USDC = 50_000_000  (USDC uses 6 decimals, NOT 18)
  const NGO_MIN_AMOUNTS = [
    50_000_000n,   // NGO-JP — 50 USDC
    50_000_000n,   // NGO-TH — 50 USDC
    50_000_000n,   // NGO-PH — 50 USDC
    50_000_000n,   // NGO-ID — 50 USDC
    50_000_000n,   // NGO-VN — 50 USDC
  ];

  // ── CHAINLINK ORACLE CONFIG — PERSON B FILLS IN ────────────────────────────
  // Person B: fill these in after setting up the Chainlink Any API job.
  // Find them in your Chainlink node dashboard / job-spec.md.
  const ORACLE_ADDRESS = "0x_FILL_IN_ORACLE_ADDRESS";  // Person B fills in
  const JOB_ID_STRING  = "FILL_IN_JOB_ID";             // Person B fills in (string, will be converted to bytes32)
  const LINK_FEE       = ethers.parseUnits("0.1", 18); // 0.1 LINK per request (standard Sepolia fee)

  // Convert job ID string to bytes32 (Chainlink expects bytes32)
  const JOB_ID_BYTES32 = ethers.encodeBytes32String(JOB_ID_STRING);

  // ── FEE RESERVE ─────────────────────────────────────────────────────────────
  // Address that receives the 5% platform fee on each deposit.
  // For the POC, this is just the deployer's own wallet — no separate wallet needed.
  const FEE_RESERVE = deployer.address;

  // ── PRE-FLIGHT VALIDATION ───────────────────────────────────────────────────
  console.log("\n📋 Pre-flight checks...");

  // Check no FILL_IN placeholders remain
  const allAddresses = [...VALIDATORS, ...NGO_ADDRESSES, ORACLE_ADDRESS];
  const unfilled = allAddresses.filter(a => a.includes("FILL_IN") || a.includes("0x_"));
  if (unfilled.length > 0) {
    console.error("\n❌ Deploy aborted — unfilled addresses found:");
    unfilled.forEach(a => console.error("   →", a));
    console.error("\nFill in all FILL_IN values in deploy.js before running.");
    process.exit(1);
  }

  if (JOB_ID_STRING.includes("FILL_IN")) {
    console.error("\n❌ Deploy aborted — JOB_ID_STRING not filled in.");
    console.error("Person B must provide the Chainlink job ID before deployment.");
    process.exit(1);
  }

  // Validate all addresses are valid Ethereum addresses
  const validateAddress = (addr, label) => {
    if (!ethers.isAddress(addr)) {
      throw new Error(`Invalid address for ${label}: ${addr}`);
    }
  };

  VALIDATORS.forEach((v, i) => validateAddress(v, `Validator ${i + 1}`));
  NGO_ADDRESSES.forEach((n, i) => validateAddress(n, `NGO ${i + 1}`));
  validateAddress(USDC_ADDRESS,   "USDC");
  validateAddress(LINK_ADDRESS,   "LINK");
  validateAddress(ORACLE_ADDRESS, "Oracle");
  validateAddress(FEE_RESERVE,    "Fee reserve");

  console.log("✅ All addresses valid");
  console.log("✅ USDC :", USDC_ADDRESS);
  console.log("✅ LINK :", LINK_ADDRESS);
  console.log("✅ Oracle:", ORACLE_ADDRESS);
  console.log("✅ Fee reserve:", FEE_RESERVE, "(deployer)");
  console.log("\n✅ Validators:");
  VALIDATORS.forEach((v, i) => console.log(`   [${i}] ${v}`));
  console.log("\n✅ NGOs (JPN / THA / PHL / IDN / VNM):");
  NGO_ADDRESSES.forEach((n, i) => console.log(`   [${i}] ${n}`));

  // ── DEPLOY ──────────────────────────────────────────────────────────────────
  console.log("\n🚀 Deploying VigilAnt...");

  const VigilAnt = await ethers.getContractFactory("VigilAnt");

  const contract = await VigilAnt.deploy(
    USDC_ADDRESS,      // _usdc
    VALIDATORS,        // _validators  (address[5])
    NGO_ADDRESSES,     // _ngos        (address[])
    NGO_MIN_AMOUNTS,   // _minAmounts  (uint256[])
    FEE_RESERVE,       // _feeReserve
    LINK_ADDRESS,      // _linkToken
    ORACLE_ADDRESS,    // _oracle
    JOB_ID_BYTES32,    // _jobId       (bytes32)
    LINK_FEE           // _fee         (uint256 — 0.1 LINK in wei)
  );

  // Wait for deployment to be mined
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ VigilAnt deployed successfully!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Contract address:", contractAddress);
  console.log("Deployer (owner):", deployer.address);
  console.log("Network:          Sepolia");
  console.log(`Etherscan:        https://sepolia.etherscan.io/address/${contractAddress}`);

  // ── NEXT STEPS ──────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📋 NEXT STEPS — do all of these before the demo:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  console.log("\n1️⃣  Update frontend/config.js:");
  console.log(`   VIGILANT_CONTRACT: "${contractAddress}"`);

  console.log("\n2️⃣  Verify contract source on Etherscan Sepolia:");
  console.log("   npx hardhat verify --network sepolia \\");
  console.log(`     ${contractAddress} \\`);
  console.log(`     "${USDC_ADDRESS}" \\`);
  console.log(`     '["${VALIDATORS.join('","')}"]' \\`);
  console.log(`     '["${NGO_ADDRESSES.join('","')}"]' \\`);
  console.log(`     '[${NGO_MIN_AMOUNTS.join(",")}]' \\`);
  console.log(`     "${FEE_RESERVE}" \\`);
  console.log(`     "${LINK_ADDRESS}" \\`);
  console.log(`     "${ORACLE_ADDRESS}" \\`);
  console.log(`     "${JOB_ID_BYTES32}" \\`);
  console.log(`     "${LINK_FEE.toString()}"`);

  console.log("\n3️⃣  Fund contract with Sepolia LINK (minimum 5 LINK):");
  console.log("   Faucet: https://faucets.chain.link/sepolia");
  console.log(`   Send to: ${contractAddress}`);
  console.log("   ⚠️  If contract has no LINK, oracle calls fail silently — check this first if oracle isn't responding.");

  console.log("\n4️⃣  Tell the group the contract address is live:");
  console.log(`   Contract: ${contractAddress}`);
  console.log("   Person C: update config.js immediately and merge to main.");

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// ── HARDHAT BOILERPLATE ─────────────────────────────────────────────────────
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
