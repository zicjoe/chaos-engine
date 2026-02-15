const hre = require("hardhat");

async function main() {
  const FACTORY = "0x6725F303b657a9451d8BA641348b6761A6CC7a17"; // Pancake V2 Factory testnet
  const WBNB = "0xae13d989dac2f0debff460ac112a837c89baa7cd";
  const MUSD = "0x0e27acB66585F0284f1fe384aCb2FF810F801893";

  const factoryAbi = [
    "function getPair(address tokenA, address tokenB) external view returns (address pair)"
  ];

  const provider = hre.ethers.provider;
  const factory = new hre.ethers.Contract(FACTORY, factoryAbi, provider);

  const pair = await factory.getPair(WBNB, MUSD);
  console.log("Pair address:", pair);
}

main().catch(console.error);