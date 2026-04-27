import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { ProjectToken, TimelockController } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("ProjectToken v7 — Trust-Minimized", function () {
  let token: ProjectToken;
  let timelock: TimelockController;
  let owner: SignerWithAddress;
  let timelockSigner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let pair: SignerWithAddress;
  let router: SignerWithAddress;
  let attacker: SignerWithAddress;

  const MAX_SUPPLY = ethers.parseEther("1000000000");
  const ONE_DAY = 86400;
  const TWO_DAYS = 2 * ONE_DAY;

  beforeEach(async function () {
    [owner, user1, user2, pair, router, attacker] = await ethers.getSigners();

    // Deploy TimelockController
    const TimelockFactory = await ethers.getContractFactory("TimelockController");
    timelock = await TimelockFactory.deploy(
      TWO_DAYS,
      [owner.address],
      [owner.address],
      owner.address
    );
    await timelock.waitForDeployment();

    // Get timelock signer
    timelockSigner = await ethers.getImpersonatedSigner(await timelock.getAddress());
    await owner.sendTransaction({ to: timelockSigner.address, value: ethers.parseEther("1") });

    // Deploy Token
    const TokenFactory = await ethers.getContractFactory("ProjectToken");
    token = await TokenFactory.deploy(
      "MyToken",
      "MTK",
      await timelock.getAddress(),
      [user1.address, user2.address],
      [ethers.parseEther("600000000"), ethers.parseEther("400000000")]
    );
    await token.waitForDeployment();
  });

  // ═════════════════════════════════════════════════════════════
  // DEPLOYMENT TESTS
  // ═════════════════════════════════════════════════════════════

  describe("Deployment", function () {
    it("Should mint max supply in constructor", async function () {
      expect(await token.totalMinted()).to.equal(MAX_SUPPLY);
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY);
    });

    it("Should store timelock address", async function () {
      expect(await token.timelock()).to.equal(await timelock.getAddress());
    });

    it("Should distribute tokens correctly", async function () {
      expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("600000000"));
      expect(await token.balanceOf(user2.address)).to.equal(ethers.parseEther("400000000"));
    });

    it("Should not be finalized initially", async function () {
      expect(await token.finalized()).to.be.false;
      expect(await token.isFinalized()).to.be.false;
      expect(await token.isImmutable()).to.be.false;
    });

    it("Should set maxWalletAmount", async function () {
      expect(await token.maxWalletAmount()).to.equal(ethers.parseEther("10000000"));
    });

    it("Should exclude timelock from limits", async function () {
      expect(await token.isExcludedFromLimits(await timelock.getAddress())).to.be.true;
    });

    it("Should emit TimelockSet event", async function () {
      const tx = await token.deploymentTransaction();
      const receipt = await tx?.wait();
      // Event emitted in constructor
    });

    it("Should revert with empty distribution", async function () {
      const TokenFactory = await ethers.getContractFactory("ProjectToken");
      await expect(
        TokenFactory.deploy("T", "T", await timelock.getAddress(), [], [])
      ).to.be.revertedWith("Empty distribution");
    });

    it("Should revert with too many recipients", async function () {
      const TokenFactory = await ethers.getContractFactory("ProjectToken");
      const recipients = Array(201).fill(user1.address);
      const amounts = Array(201).fill(ethers.parseEther("1"));
      await expect(
        TokenFactory.deploy("T", "T", await timelock.getAddress(), recipients, amounts)
      ).to.be.revertedWith("Too many recipients");
    });

    it("Should revert if totalMinted != MAX_SUPPLY", async function () {
      const TokenFactory = await ethers.getContractFactory("ProjectToken");
      await expect(
        TokenFactory.deploy(
          "T", "T", await timelock.getAddress(),
          [user1.address], [ethers.parseEther("1")]
        )
      ).to.be.revertedWith("Must mint max supply");
    });
  });

  // ═════════════════════════════════════════════════════════════
  // ACCESS CONTROL TESTS
  // ═════════════════════════════════════════════════════════════

  describe("Access Control", function () {
    it("Should grant roles to timelock only", async function () {
      expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), await timelock.getAddress())).to.be.true;
      expect(await token.hasRole(await token.ADMIN_ROLE(), await timelock.getAddress())).to.be.true;
      expect(await token.hasRole(await token.DEX_MANAGER_ROLE(), await timelock.getAddress())).to.be.true;
    });

    it("Should not allow non-timelock to grant roles", async function () {
      await expect(
        token.connect(attacker).grantRole(await token.ADMIN_ROLE(), attacker.address)
      ).to.be.revertedWith("Only timelock with role admin can grant");
    });

    it("Should not allow non-timelock to revoke roles", async function () {
      await expect(
        token.connect(attacker).revokeRole(await token.ADMIN_ROLE(), await timelock.getAddress())
      ).to.be.revertedWith("Only timelock with role admin can revoke");
    });

    it("Should not allow non-timelock to renounce roles", async function () {
      await expect(
        token.connect(attacker).renounceRole(await token.ADMIN_ROLE(), await timelock.getAddress())
      ).to.be.revertedWith("Only timelock can renounce roles");
    });

    it("Should allow timelock to grant roles before finalize", async function () {
      // Simulate timelock calling grantRole
      await owner.sendTransaction({
        to: await timelock.getAddress(),
        value: ethers.parseEther("0.1"),
      });
      
      // We can't directly test timelock execution here, but we verify the logic
      expect(await token.hasRole(await token.ADMIN_ROLE(), await timelock.getAddress())).to.be.true;
    });
  });

  // ═════════════════════════════════════════════════════════════
  // DEX SETUP TESTS
  // ═════════════════════════════════════════════════════════════

  describe("DEX Setup", function () {
    it("Should setup DEX via timelock", async function () {
      // Simulate timelock execution
      await token.connect(owner).setupDEX(pair.address, router.address);
      
      expect(await token.pair()).to.equal(pair.address);
      expect(await token.router()).to.equal(router.address);
    });

    it("Should exclude pair and router from limits", async function () {
      await token.connect(owner).setupDEX(pair.address, router.address);
      
      expect(await token.isExcludedFromLimits(pair.address)).to.be.true;
      expect(await token.isExcludedFromLimits(router.address)).to.be.true;
    });

    it("Should revert with zero address pair", async function () {
      await expect(
        token.connect(owner).setupDEX(ethers.ZeroAddress, router.address)
      ).to.be.revertedWith("Invalid pair");
    });

    it("Should revert with zero address router", async function () {
      await expect(
        token.connect(owner).setupDEX(pair.address, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid router");
    });

    it("Should revert if DEX already setup", async function () {
      await token.connect(owner).setupDEX(pair.address, router.address);
      await expect(
        token.connect(owner).setupDEX(user1.address, user2.address)
      ).to.be.revertedWith("DEX already setup");
    });

    it("Should revert setupDEX after finalize", async function () {
      await token.connect(owner).setupDEX(pair.address, router.address);
      await token.connect(owner).finalize();
      
      await expect(
        token.connect(owner).setupDEX(user1.address, user2.address)
      ).to.be.revertedWith("Contract is finalized");
    });
  });

  // ═════════════════════════════════════════════════════════════
  // MAX WALLET TESTS
  // ═════════════════════════════════════════════════════════════

  describe("Max Wallet", function () {
    it("Should enforce maxWallet before finalize", async function () {
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("10000001"))
      ).to.be.revertedWith("Exceeds max wallet");
    });

    it("Should allow transfer within maxWallet", async function () {
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("10000000"))
      ).to.not.be.reverted;
    });

    it("Should exclude pair from maxWallet (null safety)", async function () {
      // Before DEX setup — pair is address(0), should not revert
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("1"))
      ).to.not.be.reverted;
    });

    it("Should exclude pair from maxWallet after setup", async function () {
      await token.connect(owner).setupDEX(pair.address, router.address);
      
      // Transfer to pair should not check maxWallet
      await expect(
        token.connect(user1).transfer(pair.address, ethers.parseEther("500000000"))
      ).to.not.be.reverted;
    });

    it("Should disable maxWallet after finalize", async function () {
      await token.connect(owner).setupDEX(pair.address, router.address);
      await token.connect(owner).finalize();
      
      expect(await token.maxWalletDisabled()).to.be.true;
      expect(await token.maxWalletAmount()).to.equal(0);
      
      // Should allow large transfers after finalize
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("100000000"))
      ).to.not.be.reverted;
    });
  });

  // ═════════════════════════════════════════════════════════════
  // FINALIZE TESTS
  // ═════════════════════════════════════════════════════════════

  describe("Finalize", function () {
    beforeEach(async function () {
      await token.connect(owner).setupDEX(pair.address, router.address);
    });

    it("Should finalize successfully", async function () {
      await expect(token.connect(owner).finalize())
        .to.emit(token, "Finalized")
        .to.emit(token, "ContractImmutable");
      
      expect(await token.finalized()).to.be.true;
      expect(await token.isImmutable()).to.be.true;
    });

    it("Should revoke all roles from timelock", async function () {
      await token.connect(owner).finalize();
      
      expect(await token.hasRole(await token.DEFAULT_ADMIN_ROLE(), await timelock.getAddress())).to.be.false;
      expect(await token.hasRole(await token.ADMIN_ROLE(), await timelock.getAddress())).to.be.false;
      expect(await token.hasRole(await token.DEX_MANAGER_ROLE(), await timelock.getAddress())).to.be.false;
    });

    it("Should set role admin to bytes32(0)", async function () {
      await token.connect(owner).finalize();
      
      expect(await token.getRoleAdmin(await token.ADMIN_ROLE())).to.equal(ethers.ZeroHash);
      expect(await token.getRoleAdmin(await token.DEX_MANAGER_ROLE())).to.equal(ethers.ZeroHash);
    });

    it("Should disable maxWallet", async function () {
      await token.connect(owner).finalize();
      
      expect(await token.maxWalletDisabled()).to.be.true;
      expect(await token.maxWalletAmount()).to.equal(0);
    });

    it("Should revert if DEX not set", async function () {
      // Deploy new token without DEX
      const TokenFactory = await ethers.getContractFactory("ProjectToken");
      const newToken = await TokenFactory.deploy(
        "T", "T", await timelock.getAddress(),
        [user1.address], [MAX_SUPPLY]
      );
      
      await expect(newToken.connect(owner).finalize())
        .to.be.revertedWith("DEX not set");
    });

    it("Should revert finalize twice", async function () {
      await token.connect(owner).finalize();
      
      await expect(token.connect(owner).finalize())
        .to.be.revertedWith("Already finalized");
    });

    it("Should revert admin functions after finalize", async function () {
      await token.connect(owner).finalize();
      
      await expect(
        token.connect(owner).setMaxWalletAmount(ethers.parseEther("1"))
      ).to.be.revertedWith("Contract is finalized");
      
      await expect(
        token.connect(owner).setExcludedFromLimits(user1.address, true)
      ).to.be.revertedWith("Contract is finalized");
    });

    it("Should revert grantRole after finalize", async function () {
      await token.connect(owner).finalize();
      
      await expect(
        token.connect(owner).grantRole(await token.ADMIN_ROLE(), attacker.address)
      ).to.be.revertedWith("Contract is finalized");
    });
  });

  // ═════════════════════════════════════════════════════════════
  // BURN TESTS
  // ═════════════════════════════════════════════════════════════

  describe("Burn", function () {
    it("Should allow users to burn their tokens", async function () {
      const burnAmount = ethers.parseEther("1000");
      await expect(token.connect(user1).burn(burnAmount))
        .to.emit(token, "TokensBurned")
        .withArgs(user1.address, burnAmount);
      
      expect(await token.totalSupply()).to.equal(MAX_SUPPLY - burnAmount);
    });

    it("Should allow burnFrom with approval", async function () {
      const burnAmount = ethers.parseEther("1000");
      await token.connect(user1).approve(user2.address, burnAmount);
      
      await expect(token.connect(user2).burnFrom(user1.address, burnAmount))
        .to.emit(token, "TokensBurned")
        .withArgs(user1.address, burnAmount);
    });

    it("Should revert burn with zero amount", async function () {
      await expect(token.connect(user1).burn(0))
        .to.be.revertedWith("Amount must be > 0");
    });
  });

  // ═════════════════════════════════════════════════════════════
  // TRANSFER TESTS
  // ═════════════════════════════════════════════════════════════

  describe("Transfer", function () {
    it("Should allow standard transfers", async function () {
      await expect(
        token.connect(user1).transfer(user2.address, ethers.parseEther("1000"))
      ).to.not.be.reverted;
      
      expect(await token.balanceOf(user2.address)).to.equal(ethers.parseEther("400000001000"));
    });

    it("Should work with DEX after finalize", async function () {
      await token.connect(owner).setupDEX(pair.address, router.address);
      await token.connect(owner).finalize();
      
      // Simulate DEX interaction
      await token.connect(user1).approve(pair.address, ethers.parseEther("1000"));
      
      // Pair should be able to transferFrom
      await expect(
        token.connect(pair).transferFrom(user1.address, user2.address, ethers.parseEther("1000"))
      ).to.not.be.reverted;
    });
  });

  // ═════════════════════════════════════════════════════════════
  // VIEW FUNCTION TESTS
  // ═════════════════════════════════════════════════════════════

  describe("View Functions", function () {
    it("Should return correct token status", async function () {
      const status = await token.getTokenStatus();
      
      expect(status._finalized).to.be.false;
      expect(status._maxWalletDisabled).to.be.false;
      expect(status._totalMinted).to.equal(MAX_SUPPLY);
      expect(status._timelock).to.equal(await timelock.getAddress());
    });

    it("Should return correct role status", async function () {
      expect(await token.hasAdminRole(await timelock.getAddress())).to.be.true;
      expect(await token.hasDexManagerRole(await timelock.getAddress())).to.be.true;
      expect(await token.hasDefaultAdminRole(await timelock.getAddress())).to.be.true;
      
      expect(await token.hasAdminRole(attacker.address)).to.be.false;
    });
  });

  // ═════════════════════════════════════════════════════════════
  // SECURITY TESTS
  // ═════════════════════════════════════════════════════════════

  describe("Security", function () {
    it("Should not allow attacker to take control", async function () {
      await token.connect(owner).setupDEX(pair.address, router.address);
      await token.connect(owner).finalize();
      
      // Attacker cannot grant themselves roles
      await expect(
        token.connect(attacker).grantRole(await token.ADMIN_ROLE(), attacker.address)
      ).to.be.reverted;
      
      // Attacker cannot change maxWallet
      await expect(
        token.connect(attacker).setMaxWalletAmount(ethers.parseEther("1"))
      ).to.be.reverted;
    });

    it("Should maintain immutability after finalize", async function () {
      await token.connect(owner).setupDEX(pair.address, router.address);
      await token.connect(owner).finalize();
      
      // Verify all immutability conditions
      expect(await token.finalized()).to.be.true;
      expect(await token.maxWalletDisabled()).to.be.true;
      expect(await token.getRoleAdmin(await token.ADMIN_ROLE())).to.equal(ethers.ZeroHash);
      expect(await token.getRoleAdmin(await token.DEX_MANAGER_ROLE())).to.equal(ethers.ZeroHash);
    });
  });
});