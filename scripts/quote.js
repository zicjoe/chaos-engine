require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const RPC_URL = process.env.RPC_URL;
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";
  const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
  const MUSD = "0x0e27acB66585F0284f1fe384aCb2FF810F801893";

  const routerAbi = [
    "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)"
  ];

  const router = new ethers.Contract(ROUTER, routerAbi, provider);

  const amountIn = ethers.parseUnits("0.001", 18);
  const amounts = await router.getAmountsOut(amountIn, [WBNB, MUSD]);

  console.log("amountIn WBNB:", amountIn.toString());
  console.log("amountOut mUSD:", amounts[1].toString());
}

main().catch(console.error);