require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const RPC_URL = process.env.RPC_URL;
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const ENGINE = process.env.ENGINE_ADDRESS;

  if (!RPC_URL || !PRIVATE_KEY || !ENGINE) throw new Error("Missing RPC_URL, PRIVATE_KEY, or ENGINE_ADDRESS");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
  const MUSD = process.env.USD_ADDRESS; // your MockUSD address
  if (!MUSD) throw new Error("Missing USD_ADDRESS in .env");

  const erc20Abi = [
    "function approve(address spender,uint256 amount) returns (bool)",
    "function transfer(address to,uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)"
  ];

  const engineAbi = [
    "function fundToken(address token,uint256 amount) external"
  ];

  const wbnb = new ethers.Contract(WBNB, erc20Abi, wallet);
  const musd = new ethers.Contract(MUSD, erc20Abi, wallet);
  const engine = new ethers.Contract(ENGINE, engineAbi, wallet);

  const wbnbAmount = ethers.parseUnits("0.01", 18);
  const musdAmount = ethers.parseUnits("500", 18);

  console.log("Funding engine:", ENGINE);

  console.log("Approving WBNB...");
  await (await wbnb.approve(ENGINE, wbnbAmount)).wait();
  console.log("Calling fundToken(WBNB)...");
  await (await engine.fundToken(WBNB, wbnbAmount)).wait();

  console.log("Approving mUSD...");
  await (await musd.approve(ENGINE, musdAmount)).wait();
  console.log("Calling fundToken(mUSD)...");
  await (await engine.fundToken(MUSD, musdAmount)).wait();

  const wbnbBal = await wbnb.balanceOf(ENGINE);
  const musdBal = await musd.balanceOf(ENGINE);

  console.log("Engine WBNB:", ethers.formatUnits(wbnbBal, 18));
  console.log("Engine mUSD:", ethers.formatUnits(musdBal, 18));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
