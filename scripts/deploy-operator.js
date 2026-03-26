const { ethers } = require("hardhat");

async function main() {
  const link = process.env.LINK_TOKEN_ADDRESS || "0x779877A7B0D9E8603169DdbD7836e478b4624789";

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("LINK token:", link);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer ETH:", ethers.formatEther(balance));

  const OperatorHarness = await ethers.getContractFactory("OperatorHarness");
  const operator = await OperatorHarness.deploy(link, deployer.address);
  await operator.waitForDeployment();

  const operatorAddress = await operator.getAddress();
  console.log("Operator deployed:", operatorAddress);
  console.log(`Etherscan: https://sepolia.etherscan.io/address/${operatorAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
