const { ethers } = require("hardhat");
const { expect } = require("chai");

describe("VigilAnt — Gas Report", function () {
  let contract, mockUSDC, mockLink;
  let owner, validator1, validator2, validator3, contributor, ngo;

  beforeEach(async () => {
    [owner, validator1, validator2, validator3, contributor, ngo] =
      await ethers.getSigners();

    // Deploy mock USDC
    const MockERC20 = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockERC20.deploy();
    mockLink = await MockERC20.deploy();

    // Deploy VigilAnt
    const VigilAnt = await ethers.getContractFactory("VigilAnt");
    contract = await VigilAnt.deploy(
      await mockUSDC.getAddress(),
      [
        owner.address,
        validator1.address,
        validator2.address,
        validator3.address,
        contributor.address,
      ],
      [ngo.address, ngo.address, ngo.address, ngo.address, ngo.address],
      [5_000_000n, 5_000_000n, 5_000_000n, 5_000_000n, 5_000_000n],
      owner.address,
      await mockLink.getAddress(),
      owner.address,       // oracle address = owner for testing
      ethers.encodeBytes32String("test-job-id"),
      ethers.parseUnits("0.1", 18)
    );

    // Mint USDC to contributor
    await mockUSDC.mint(contributor.address, 1000_000_000n); // 1000 USDC
    // Approve
    await mockUSDC.connect(contributor)
      .approve(await contract.getAddress(), 1000_000_000n);
  });

  it("deposit()", async () => {
    await contract.connect(contributor).deposit(2, 10_000_000n, 0);
  });

  it("simulateDisaster()", async () => {
    await contract.connect(owner).simulateDisaster(2, 2);
  });

  it("confirmDisaster() x3 — triggers payout", async () => {
    await contract.connect(contributor).deposit(2, 10_000_000n, 0);
    await contract.connect(owner).simulateDisaster(2, 2);
    await contract.connect(owner).confirmDisaster(1);
    await contract.connect(validator1).confirmDisaster(1);
    await contract.connect(validator2).confirmDisaster(1);
  });

  it("returnExpired()", async () => {
    await contract.connect(contributor).deposit(2, 10_000_000n, 0);
    // fast forward time
    await ethers.provider.send("evm_increaseTime", [30 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await contract.connect(owner).returnExpired(contributor.address);
  });
});