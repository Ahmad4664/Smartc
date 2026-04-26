import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import { HardhatUserConfig } from "hardhat/config";

const PRIVATE_KEY = process.env.PRIVATE_KEY!;
const RPC_URL = process.env.SOMNIA_RPC_URL!;

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    hardhat: { chainId: 31337 },
    somniaTestnet: {
      url: RPC_URL,
      accounts: [PRIVATE_KEY],
    },
  },
};

export default config;
