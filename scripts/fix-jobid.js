const { ethers } = require("hardhat");

function toBytes32JobId(jobIdString) {
  if (!jobIdString) throw new Error("Missing JOB_ID_STRING");

  if (/^0x[0-9a-fA-F]{64}$/.test(jobIdString)) return jobIdString;

  // 32 hex chars (16 bytes) -> left-pad to bytes32
  if (/^[0-9a-fA-F]{32}$/.test(jobIdString)) {
    return ethers.zeroPadBytes("0x" + jobIdString, 32);
  }

  // UUID -> left-aligned into bytes32
  if (/^[0-9a-fA-F-]{36}$/.test(jobIdString) && jobIdString.includes("-")) {
    const uuidHex = jobIdString.replace(/-/g, "");
    return "0x" + uuidHex + "0".repeat(32);
  }

  return ethers.encodeBytes32String(jobIdString);
}

async function main() {
  const CONTRACT = process.env.VIGILANT_CONTRACT || process.env.CONTRACT_ADDRESS;
  const ORACLE = process.env.ORACLE_ADDRESS || process.env.OPERATOR_ADDRESS;
  const JOB_ID_STRING = process.env.JOB_ID_STRING;
  const LINK_FEE_WEI = process.env.LINK_FEE_WEI || ethers.parseUnits("0.1", 18).toString();

  if (!CONTRACT || !ethers.isAddress(CONTRACT)) throw new Error("Set VIGILANT_CONTRACT (or CONTRACT_ADDRESS) in .env");
  if (!ORACLE || !ethers.isAddress(ORACLE)) throw new Error("Set ORACLE_ADDRESS (or OPERATOR_ADDRESS) in .env");
  if (!JOB_ID_STRING) throw new Error("Set JOB_ID_STRING in .env (UUID or 32-hex-char job id)");

  const JOB_ID_BYTES32 = toBytes32JobId(JOB_ID_STRING);
  const FEE = BigInt(LINK_FEE_WEI);

  const abi = [
    "function updateOracleConfig(address _oracle, bytes32 _jobId, uint256 _fee) external",
  ];

  const [owner] = await ethers.getSigners();
  console.log("Owner:", owner.address);
  console.log("VigilAnt:", CONTRACT);
  console.log("Oracle:", ORACLE);
  console.log("JobId(bytes32):", JOB_ID_BYTES32);
  console.log("Fee(juels):", FEE.toString());
  const c = new ethers.Contract(CONTRACT, abi, owner);
  const tx = await c.updateOracleConfig(ORACLE, JOB_ID_BYTES32, FEE);
  await tx.wait();
  console.log("Updated oracle config tx:", tx.hash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
