// ─────────────────────────────────────────────────────────────────────────────
//  vigilAnt — verify.js
//  Run this instead of the npx hardhat verify command on Windows.
//  Avoids all the single-quote / array escaping issues in Windows CMD.
//
//  Usage: npx hardhat run scripts/verify.js --network sepolia
// ─────────────────────────────────────────────────────────────────────────────

const hre = require("hardhat");

async function main() {

  const CONTRACT_ADDRESS = "0x477f721640CfB9a9c3A8aE953B1f69a45F15B904";

  const USDC_ADDRESS   = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const LINK_ADDRESS   = "0x779877A7B0D9E8603169DdbD7836e478b4624789";
  const ORACLE_ADDRESS = "0x6090149792dAAeE9D1D568c9f9a6F6B46AA29eFD";
  const JOB_ID_BYTES32 = "0x7da2702f37fd48e5b1b9a5715e3509b600000000000000000000000000000000";
  const LINK_FEE       = "100000000000000000"; // 0.1 LINK in wei

  const VALIDATORS = [
    "0x06cBE48CD25F61682740F76B6cd966862b21015F",
    "0xB4A6b8A3cC14389df36f5470c5A860C7C0F8eb13",
    "0xa2b2874B8cBD27bce28A6c9c2B909521dD3C6477",
    "0xC5b5a02Ba126F3c0a7a1e1A315E1708ccdE4211c",
    "0x8257Ba2524235f3a4150F7Af864BA0c0cc8fF914",
  ];

  const NGO_ADDRESSES = [
    "0x114EF71B6C7a32ADA778b55E2274fB9BeD999f11",
    "0xADFA8566Bcc92cBB4937E1d7f8F1db9eFe8978FA",
    "0x107300c3AbC40e6d9A4760193E6fd2943E16211B",
    "0x2BdfA05937d04983a50bd2F0BA9C24aEec498598",
    "0x13831f285554B53850Ee42049F9c61924F72F2a7",
  ];

  const NGO_MIN_AMOUNTS = [
    50_000_000n,
    50_000_000n,
    50_000_000n,
    50_000_000n,
    50_000_000n,
  ];

  // FEE_RESERVE = deployer address
  const FEE_RESERVE = "0x06cBE48CD25F61682740F76B6cd966862b21015F";

  console.log("🔍 Verifying VigilAnt on Etherscan Sepolia...");
  console.log("Contract:", CONTRACT_ADDRESS);

  await hre.run("verify:verify", {
    address: CONTRACT_ADDRESS,
    constructorArguments: [
      USDC_ADDRESS,
      VALIDATORS,
      NGO_ADDRESSES,
      NGO_MIN_AMOUNTS,
      FEE_RESERVE,
      LINK_ADDRESS,
      ORACLE_ADDRESS,
      JOB_ID_BYTES32,
      LINK_FEE,
    ],
  });

  console.log("\n✅ Verification complete!");
  console.log(`Etherscan: https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}#code`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Verification failed:");
    console.error(error.message);
    process.exit(1);
  });
