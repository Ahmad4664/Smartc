import { expect } from "chai";
import hre from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

describe("Airdrop", function () {
  let token: any;
  let airdrop: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let tree: any;
  let merkleRoot: string;

  beforeEach(async function () {
    [owner, user1, user2] = await hre.ethers.getSigners();
    
    const Token = await hre.ethers.getContractFactory("ProjectToken");
    token = await Token.deploy("ProjectToken", "PROJ", owner.address);
    
    const Airdrop = await hre.ethers.getContractFactory("Airdrop");
    airdrop = await Airdrop.deploy(await token.getAddress(), owner.address);
    
    // Mint tokens for airdrop
    await token.mint(await airdrop.getAddress(), hre.ethers.parseEther("100000"));
    
    // إنشاء Merkle Tree حقيقي
    const airdropData = [
      [user1.address, hre.ethers.parseEther("100").toString()],
      [user2.address, hre.ethers.parseEther("200").toString()],
    ];
    
    tree = StandardMerkleTree.of(airdropData, ["address", "uint256"]);
    merkleRoot = tree.root;
    
    // تعيين الجذر
    await airdrop.setMerkleRoot(merkleRoot);
  });

  describe("Merkle Root", function () {
    it("Should set merkle root", async function () {
      expect(await airdrop.merkleRoot()).to.equal(merkleRoot);
    });

    it("Should fail if not owner sets root", async function () {
      await expect(
        airdrop.connect(user1).setMerkleRoot("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef")
      ).to.be.revertedWithCustomError(airdrop, "OwnableUnauthorizedAccount");
    });
  });

  describe("Claim", function () {
    it("Should claim airdrop", async function () {
      const amount = hre.ethers.parseEther("100");
      
      // الحصول على الإثبات للمستخدم الأول
      const proof = tree.getProof(0); // index 0 = user1
      
      await airdrop.connect(user1).claim(amount, proof);
      
      expect(await token.balanceOf(user1.address)).to.equal(amount);
    });

    it("Should claim for user2", async function () {
      const amount = hre.ethers.parseEther("200");
      
      // الحصول على الإثبات للمستخدم الثاني
      const proof = tree.getProof(1); // index 1 = user2
      
      await airdrop.connect(user2).claim(amount, proof);
      
      expect(await token.balanceOf(user2.address)).to.equal(amount);
    });

    it("Should fail if already claimed", async function () {
      const amount = hre.ethers.parseEther("100");
      const proof = tree.getProof(0);
      
      await airdrop.connect(user1).claim(amount, proof);
      
      await expect(
        airdrop.connect(user1).claim(amount, proof)
      ).to.be.revertedWith("Already claimed");
    });

    it("Should fail with invalid proof", async function () {
      const amount = hre.ethers.parseEther("100");
      
      // إثبات خاطئ (مستخدم user2 proof لمستخدم user1)
      const wrongProof = tree.getProof(1);
      
      await expect(
        airdrop.connect(user1).claim(amount, wrongProof)
      ).to.be.revertedWith("Invalid proof");
    });

    it("Should fail with wrong amount", async function () {
      const amount = hre.ethers.parseEther("999"); // كمية خاطئة
      
      const proof = tree.getProof(0);
      
      await expect(
        airdrop.connect(user1).claim(amount, proof)
      ).to.be.revertedWith("Invalid proof");
    });
  });

  describe("Verify", function () {
    it("Should verify claim eligibility", async function () {
      const amount = hre.ethers.parseEther("100");
      const proof = tree.getProof(0);
      
      expect(await airdrop.verifyClaim(user1.address, amount, proof)).to.be.true;
    });

    it("Should return false for claimed user", async function () {
      const amount = hre.ethers.parseEther("100");
      const proof = tree.getProof(0);
      
      await airdrop.connect(user1).claim(amount, proof);
      
      expect(await airdrop.verifyClaim(user1.address, amount, proof)).to.be.false;
    });
  });
});
