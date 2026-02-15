require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const RPC_URL = process.env.RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const ENGINE = process.env.ENGINE_ADDRESS;

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const engineAbi = [
    "function triggerFeeWei() view returns (uint256)",
    "function triggerChaos(uint256 userSeed) payable returns (uint256)"
  ];

  const engine = new ethers.Contract(ENGINE, engineAbi, wallet);

  const fee = await engine.triggerFeeWei();
  const seed = Math.floor(Math.random() * 1e9);

  const tx = await engine.triggerChaos(seed, { value: fee });
  console.log("trigger tx:", tx.hash);

  const receipt = await tx.wait();
  console.log("mined:", receipt.hash);
}

main().catch(console.error);
