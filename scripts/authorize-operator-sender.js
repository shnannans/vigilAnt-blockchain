const { ethers } = require("hardhat");

async function main() {
  const operatorAddress = process.env.OPERATOR_ADDRESS;
  const senderAddress = process.env.CHAINLINK_NODE_SENDER;

  if (!operatorAddress || !ethers.isAddress(operatorAddress)) {
    throw new Error("Set a valid OPERATOR_ADDRESS in environment");
  }
  if (!senderAddress || !ethers.isAddress(senderAddress)) {
    throw new Error("Set a valid CHAINLINK_NODE_SENDER in environment");
  }

  const operatorAbi = [
    "function setAuthorizedSenders(address[] calldata senders) external",
    "function getAuthorizedSenders() external view returns (address[] memory)",
  ];

  const [owner] = await ethers.getSigners();
  console.log("Owner:", owner.address);
  console.log("Operator:", operatorAddress);
  console.log("Authorize sender:", senderAddress);

  const operator = new ethers.Contract(operatorAddress, operatorAbi, owner);

  const tx = await operator.setAuthorizedSenders([senderAddress]);
  await tx.wait();
  console.log("setAuthorizedSenders tx:", tx.hash);

  const senders = await operator.getAuthorizedSenders();
  console.log("Authorized senders:", senders);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
