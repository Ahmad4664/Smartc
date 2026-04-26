import { expect } from "chai";
import hre from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";

describe("Airdrop", function () {
  let token: any;
  let airdrop: any;
  let owner: any;
  let user1: any;
  let user2: any;

  beforeEach(async function () {
    [owner, user1, user2] = await hre.ethers.getSigners();
    
    const Token = await hre.ethers.getContractFactory("ProjectToken");
    token = await Token.deploy("ProjectToken", "PROJ", owner.address);
    
    const Airdrop = await hre.ethers.getContractFactory("Airdrop");
    airdrop = await Airdrop.deploy(await token.getAddress(), owner.address);
    
    // Mint tokens for airdrop
    await token.mint(await airdrop.getAddress(), hre.ethers.parseEther("100000"));
  });

  describe("Merkle Root", function () {
    it("Should set merkle root", async function () {
      const tree = StandardMerkleTree.of(
        [[user1.address, hre.ethers.parseEther("100")]],
        ["address", "uint256"]
      );
      
      await airdrop.setMerkleRoot(tree.root);
      expect(await airdrop.merkleRoot()).to.equal(tree.root);
    });
  });

  describe("Claim", function () {
    it("Should claim airdrop", async function () {
      const amount = hre.ethers.parseEther("100");
      
      const tree = StandardMerkleTree.of(
        [[user1.address, amount]],
        ["address", "uint256"]
      );
      
      await airdrop.setMerkleRoot(tree.root);
      
      const proof = tree.getProof(0);
      
      await airdrop.connect(user1).claim(amount, proof);
      
      expect(await token.balanceOf(user1.address)).to.equal(amount);
    });

    it("Should fail if already claimed", async function () {
      const amount = hre.ethers.parseEther("100");
      
      const tree = StandardMerkleTree.of(
        [[user1.address, amount]],
        ["address", "uint256"]
      );
      
      await airdrop.setMerkleRoot(tree.root);
      const proof = tree.getProof(0);
      
      await airdrop.connect(user1).claim(amount, proof);
      
      await expect(
        airdrop.connect(user1).claim(amount, proof)
      ).to.be.revertedWith("Already claimed");
    });
  });
});
