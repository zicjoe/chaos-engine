require("dotenv").config();
const { ethers } = require("ethers");
const Anthropic = require("@anthropic-ai/sdk");

const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!RPC_URL || !PRIVATE_KEY || !ANTHROPIC_API_KEY) {
  throw new Error("Missing env vars");
}

const ENGINE_ADDRESS = process.env.ENGINE_ADDRESS;
const USD_ADDRESS = process.env.USD_ADDRESS;
const WBNB_ADDRESS = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const ROUTER = "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";

if (!ENGINE_ADDRESS || !USD_ADDRESS) {
  throw new Error("Set ENGINE_ADDRESS and USD_ADDRESS in env");
}

const engineAbi = [
  "event ChaosTriggered(uint256 indexed roundId, uint8 eventType, uint256 severity, address indexed trigger)",
  "function getBalances() view returns (uint256 wbnbBal, uint256 usdBal)",
  "function decideAndExecute(uint256,uint8,uint256,uint256,uint256,uint256,uint256,bytes32,bytes32)"
];

const routerAbi = [
  "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)"
];

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AI timeout")), ms)
    )
  ]);
}

async function askClaude(input) {
  const system =
    "You are an autonomous treasury survival agent. Return ONLY valid JSON. Keys: riskScore 0-100, action HOLD|SWAP_WBNB_TO_USD|SWAP_USD_TO_WBNB, tradePct 0-50, confidence 0-100.";

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 150,
    temperature: 0.2,
    system,
    messages: [{ role: "user", content: JSON.stringify(input) }]
  });

  const text = msg.content[0].text;
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

function fallbackDecision(severity) {
  const risk = clamp(Number(severity) * 10, 0, 100);
  const action = risk >= 50 ? "SWAP_WBNB_TO_USD" : "HOLD";
  return {
    riskScore: risk,
    action,
    tradePct: action === "HOLD" ? 0 : 25,
    confidence: 55
  };
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const engine = new ethers.Contract(ENGINE_ADDRESS, engineAbi, wallet);
  const router = new ethers.Contract(ROUTER, routerAbi, provider);

  console.log("Agent wallet:", wallet.address);
  console.log("Listening for ChaosTriggered...");

  const processedRounds = new Set();

  engine.on("ChaosTriggered", async (roundId, eventType, severity) => {
    const rid = roundId.toString();
    if (processedRounds.has(rid)) return;
    processedRounds.add(rid);

    const startTime = Date.now();

    try {
      console.log("ChaosTriggered:", rid);

      const [wbnbBal, usdBal] = await engine.getBalances();

      const input = {
        eventType: Number(eventType),
        severity: Number(severity),
        treasuryWbnb: ethers.formatUnits(wbnbBal, 18),
        treasuryUsd: ethers.formatUnits(usdBal, 18)
      };

      let decision;

      try {
        decision = await withTimeout(askClaude(input), 10000);
        console.log("AI decision received in", Date.now() - startTime, "ms");
      } catch (e) {
        console.log("AI slow or failed, using fallback.");
        decision = fallbackDecision(severity);
      }

      const actionMap = {
        HOLD: 0,
        SWAP_WBNB_TO_USD: 1,
        SWAP_USD_TO_WBNB: 2
      };

      const actionType = actionMap[decision.action] ?? 0;
      const tradeBps = clamp(Number(decision.tradePct), 0, 50) * 100;
      const riskScore = clamp(Number(decision.riskScore), 0, 100);
      const confidence = clamp(Number(decision.confidence), 0, 100);

      let amountOutMin = 0n;

      if (actionType !== 0) {
        const tokenIn = actionType === 1 ? WBNB_ADDRESS : USD_ADDRESS;
        const tokenOut = actionType === 1 ? USD_ADDRESS : WBNB_ADDRESS;

        const bal = actionType === 1 ? wbnbBal : usdBal;
        const amountIn = (bal * BigInt(tradeBps)) / 10000n;

        if (amountIn > 0n) {
          const amounts = await router.getAmountsOut(amountIn, [tokenIn, tokenOut]);
          const quotedOut = amounts[1];
          amountOutMin = (quotedOut * 9800n) / 10000n;
        }
      }

      const deadline = Math.floor(Date.now() / 1000) + 600;

      const metadataHash = ethers.keccak256(
        ethers.toUtf8Bytes(JSON.stringify(decision))
      );

      const txTag = ethers.keccak256(
        ethers.toUtf8Bytes(`round:${rid}`)
      );

      const tx = await engine.decideAndExecute(
        roundId,
        actionType,
        riskScore,
        tradeBps,
        confidence,
        amountOutMin,
        deadline,
        metadataHash,
        txTag
      );

      console.log("Decision tx sent:", tx.hash);

      await tx.wait(1);

      console.log(
        "Decision confirmed in",
        Date.now() - startTime,
        "ms"
      );
    } catch (e) {
      console.error("Agent error:", e);
    }
  });
}

main();
