const hre = require("hardhat");

async function main() {
  const ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
  const WBNB = "0xae13d989dac2f0debff460ac112a837c89baa7cd";

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const MockUSD = await hre.ethers.getContractFactory("MockUSD");
  const usd = await MockUSD.deploy();
  await usd.waitForDeployment();
  const usdAddr = await usd.getAddress();
  console.log("MockUSD:", usdAddr);

  const ChaosEngine = await hre.ethers.getContractFactory("ChaosEngine");
  const triggerFeeWei = hre.ethers.parseEther("0.0005");
  const engine = await ChaosEngine.deploy(ROUTER, WBNB, usdAddr, deployer.address, triggerFeeWei);
  await engine.waitForDeployment();
  const engineAddr = await engine.getAddress();
  console.log("ChaosEngine:", engineAddr);

  console.log("Next: add liquidity for WBNB and mUSD on PancakeSwap testnet, then fund engine with tokens.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
