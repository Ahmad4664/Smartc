import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Vesting", function () {
  let token: any;
  let vesting: any;
  let owner: any;
  let buyer: any;

  beforeEach(async function () {
    [owner, buyer] = await hre.ethers.getSigners();
    
    const Token = await hre.ethers.getContractFactory("ProjectToken");
    token = await Token.deploy("ProjectToken", "PROJ", owner.address);
    
    const Vesting = await hre.ethers.getContractFactory("Vesting");
    vesting = await Vesting.deploy(await token.getAddress(), owner.address);
    
    // Mint tokens for OWNER (not vesting contract)
    await token.mint(owner.address, hre.ethers.parseEther("1000000"));
    
    // Approve vesting contract to spend owner's tokens
    await token.approve(await vesting.getAddress(), hre.ethers.parseEther("1000000"));
  });

  describe("Create Vesting", function () {
    it("Should create vesting with 25% immediate release", async function () {
      const amount = hre.ethers.parseEther("1000");
      
      await vesting.createVesting(buyer.address, amount);
      
      // Check immediate release (25%)
      const immediateRelease = amount / 4n;
      expect(await token.balanceOf(buyer.address)).to.equal(immediateRelease);
    });

    it("Should fail if already has vesting", async function () {
      const amount = hre.ethers.parseEther("1000");
      await vesting.createVesting(buyer.address, amount);
      
      await expect(
        vesting.createVesting(buyer.address, amount)
      ).to.be.revertedWith("Already exists");
    });
  });

  describe("Release", function () {
    it("Should release tokens after time passes", async function () {
      const amount = hre.ethers.parseEther("1000");
      await vesting.createVesting(buyer.address, amount);
      
      // Advance time by 30 days
      await time.increase(30 * 24 * 60 * 60);
      
      await vesting.connect(buyer).release();
      
      const balance = await token.balanceOf(buyer.address);
      expect(balance).to.be.gt(hre.ethers.parseEther("250")); // More than 25%
    });

    it("Should fail if no tokens to release", async function () {
      await expect(
        vesting.connect(buyer).release()
      ).to.be.revertedWith("No vesting found");
    });
  });
});
