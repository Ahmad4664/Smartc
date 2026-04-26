import { expect } from "chai";
import hre from "hardhat";

describe("Token", function () {
  let token: any;
  let owner: any;
  let addr1: any;
  let addr2: any;

  beforeEach(async function () {
    [owner, addr1, addr2] = await hre.ethers.getSigners();
    
    const Token = await hre.ethers.getContractFactory("ProjectToken");
    token = await Token.deploy("Token", "PROJ", owner.address);
  });

  describe("Deployment", function () {
    it("Should set correct name and symbol", async function () {
      expect(await token.name()).to.equal("Token");
      expect(await token.symbol()).to.equal("PROJ");
    });

    it("Should set owner correctly", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("Should have 0 initial supply", async function () {
      expect(await token.totalSupply()).to.equal(0);
    });
  });

  describe("Minting", function () {
    it("Should mint tokens to address", async function () {
      await token.mint(addr1.address, 1000);
      expect(await token.balanceOf(addr1.address)).to.equal(1000);
    });

    it("Should increase total supply", async function () {
      await token.mint(addr1.address, 1000);
      expect(await token.totalSupply()).to.equal(1000);
    });

    it("Should emit TokensMinted event", async function () {
      await expect(token.mint(addr1.address, 1000))
        .to.emit(token, "TokensMinted")
        .withArgs(addr1.address, 1000);
    });

    it("Should fail if non-owner tries to mint", async function () {
      await expect(
        token.connect(addr1).mint(addr1.address, 1000)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("Should fail if exceeds max supply", async function () {
      const maxSupply = await token.MAX_SUPPLY();
      await expect(
        token.mint(addr1.address, maxSupply + 1n)
      ).to.be.revertedWith("Exceeds max supply");
    });
  });

  describe("Batch Minting", function () {
    it("Should mint batch to multiple addresses", async function () {
      const recipients = [addr1.address, addr2.address];
      const amounts = [1000, 2000];

      await token.mintBatch(recipients, amounts);

      expect(await token.balanceOf(addr1.address)).to.equal(1000);
      expect(await token.balanceOf(addr2.address)).to.equal(2000);
    });

    it("Should fail if arrays length mismatch", async function () {
      await expect(
        token.mintBatch([addr1.address], [1000, 2000])
      ).to.be.revertedWith("Length mismatch");
    });
  });

  describe("Burning", function () {
    it("Should burn tokens", async function () {
      await token.mint(addr1.address, 1000);
      
      await token.connect(addr1).burn(500);
      
      expect(await token.balanceOf(addr1.address)).to.equal(500);
    });

    it("Should decrease total supply", async function () {
      await token.mint(addr1.address, 1000);
      await token.connect(addr1).burn(500);
      
      expect(await token.totalSupply()).to.equal(500);
    });
  });
});
