import hre from "hardhat";
import fs from "fs";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("🚀 Deploying with:", deployer.address);

  // 1. نشر التوكن
  const Token = await hre.ethers.getContractFactory("ProjectToken");
  const token = await Token.deploy("ProjectToken", "PROJ", deployer.address);
  await token.waitForDeployment();
  console.log("✅ Token:", await token.getAddress());

  // 2. نشر Vesting
  const Vesting = await hre.ethers.getContractFactory("Vesting");
  const vesting = await Vesting.deploy(await token.getAddress(), deployer.address);
  await vesting.waitForDeployment();
  console.log("✅ Vesting:", await vesting.getAddress());

  // 3. نشر Airdrop
  const Airdrop = await hre.ethers.getContractFactory("Airdrop");
  const airdrop = await Airdrop.deploy(await token.getAddress(), deployer.address);
  await airdrop.waitForDeployment();
  console.log("✅ Airdrop:", await airdrop.getAddress());

  // 4. Mint توكن للأنظمة
  await token.mint(await vesting.getAddress(), hre.ethers.parseEther("1000000"));
  await token.mint(await airdrop.getAddress(), hre.ethers.parseEther("500000"));

  // 5. حفظ العناوين
  const addresses = {
    token: await token.getAddress(),
    vesting: await vesting.getAddress(),
    airdrop: await airdrop.getAddress(),
    deployer: deployer.address,
  };

  fs.writeFileSync("contract-addresses.json", JSON.stringify(addresses, null, 2));
  console.log("\n📄 Saved to contract-addresses.json");
}

main().catch(console.error);
