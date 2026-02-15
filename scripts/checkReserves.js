require("dotenv").config();
const { ethers } = require("ethers");

async function main() {
  const RPC_URL = process.env.RPC_URL;
  if (!RPC_URL) throw new Error("Missing RPC_URL in .env");

  const PAIR = process.env.PAIR_ADDRESS; // put it in .env
  if (!PAIR || !ethers.isAddress(PAIR)) throw new Error("Set PAIR_ADDRESS in .env");

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  const pairAbi = [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
  ];

  const pair = new ethers.Contract(PAIR, pairAbi, provider);

  const t0 = await pair.token0();
  const t1 = await pair.token1();
  const [r0, r1] = await pair.getReserves();

  console.log("pair:", PAIR);
  console.log("token0:", t0);
  console.log("token1:", t1);
  console.log("reserve0:", r0.toString());
  console.log("reserve1:", r1.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});