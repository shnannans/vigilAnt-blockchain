// ─────────────────────────────────────────────────────────────────────────────
//  vigilAnt — verify.js
//  Windows-friendly Etherscan verification script.
//
//  Usage:
//    Set CONTRACT_ADDRESS in env, then run:
//      npx hardhat run scripts/verify.js --network sepolia
//
//  Required env:
//    CONTRACT_ADDRESS
//    (optional) ORACLE_ADDRESS, JOB_ID_STRING, LINK_FEE_WEI
// ─────────────────────────────────────────────────────────────────────────────

const hre = require("hardhat");

function toBytes32JobId(jobIdString) {
  if (!jobIdString) throw new Error("Missing JOB_ID_STRING");

  if (/^0x[0-9a-fA-F]{64}$/.test(jobIdString)) return jobIdString;

  // 32 hex chars (16 bytes) -> left-pad to bytes32
  if (/^[0-9a-fA-F]{32}$/.test(jobIdString)) {
    return hre.ethers.zeroPadBytes("0x" + jobIdString, 32);
  }

  // UUID -> left-aligned into bytes32
  if (/^[0-9a-fA-F-]{36}$/.test(jobIdString) && jobIdString.includes("-")) {
    const uuidHex = jobIdString.replace(/-/g, "");
    return "0x" + uuidHex + "0".repeat(32);
  }

  // short string -> bytes32 string encoding
  return hre.ethers.encodeBytes32String(jobIdString);
}

async function main() {
  const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
  if (!CONTRACT_ADDRESS) throw new Error("Set CONTRACT_ADDRESS in your environment");

  const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const LINK_ADDRESS = "0x779877A7B0D9E8603169DdbD7836e478b4624789";

  const ORACLE_ADDRESS = process.env.ORACLE_ADDRESS || "0x2aF65748a2333482733B94E7EF958692Fc78c948";
  const JOB_ID_STRING = process.env.JOB_ID_STRING || "9f0e2f67-2d7f-4b84-bb7d-9e1a4e7d6c31";
  const JOB_ID_BYTES32 = toBytes32JobId(JOB_ID_STRING);

  const LINK_FEE_WEI = process.env.LINK_FEE_WEI || "100000000000000000"; // 0.1 LINK

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

  // FEE_RESERVE was set to deployer address during deploy in scripts/deploy.js
  const FEE_RESERVE = process.env.FEE_RESERVE;
  if (!FEE_RESERVE) throw new Error("Set FEE_RESERVE (the deployer address used at deploy time)");

  console.log("🔍 Verifying VigilAnt on Etherscan Sepolia...");
  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("Oracle:", ORACLE_ADDRESS);
  console.log("Job ID bytes32:", JOB_ID_BYTES32);

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
      LINK_FEE_WEI,
    ],
  });

  console.log("\n✅ Verification complete!");
  console.log(`Etherscan: https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}#code`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Verification failed:");
    console.error(error);
    process.exit(1);
  });

