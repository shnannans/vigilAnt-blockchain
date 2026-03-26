const { ethers } = require("hardhat");

async function main() {
  // Deployed VigilAnt on Sepolia
  const VIGILANT = process.env.VIGILANT_CONTRACT || process.env.CONTRACT_ADDRESS;
  if (!VIGILANT) throw new Error("Set VIGILANT_CONTRACT (or CONTRACT_ADDRESS) in .env");

  const abi = [
    "function requestDisasterData(uint8 countryCode) external",
    "function owner() external view returns (address)",
  ];

  const [signer] = await ethers.getSigners();
  const c = new ethers.Contract(VIGILANT, abi, signer);

  const owner = await c.owner();
  console.log("Caller:", signer.address);
  console.log("VigilAnt:", VIGILANT);
  console.log("VigilAnt owner:", owner);

  const countryCode = 2; // THA
  const tx = await c.requestDisasterData(countryCode);
  console.log("requestDisasterData tx:", tx.hash);
  await tx.wait();
  console.log("Confirmed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

