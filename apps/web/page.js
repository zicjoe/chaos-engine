"use client";

import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

import { Line, Doughnut } from "react-chartjs-2";


console.log("env check", {
  rpc: process.env.NEXT_PUBLIC_RPC_URL,
  engine: process.env.NEXT_PUBLIC_ENGINE_ADDRESS,
  usd: process.env.NEXT_PUBLIC_USD_ADDRESS
});

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_ADDRESS;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
const WBNB = process.env.NEXT_PUBLIC_WBNB_ADDRESS;
const USD = process.env.NEXT_PUBLIC_USD_ADDRESS;
const PAIR = process.env.NEXT_PUBLIC_PAIR_ADDRESS;

const ROUTER =
  process.env.NEXT_PUBLIC_ROUTER_ADDRESS ||
  "0xD99D1c33F9fC3444f8101754aBC46c52416550D1";

const BSC_TESTNET_CHAIN_ID_DEC = "97";
const BSC_TESTNET_CHAIN_ID_HEX = "0x61";

const engineAbi = [
  "event ChaosTriggered(uint256 indexed roundId, uint8 eventType, uint256 severity, address indexed trigger)",
  "event DecisionMade(uint256 indexed roundId, uint8 actionType, uint256 riskScore, uint256 tradeBps, uint256 confidence, bytes32 metadataHash)",
  "event SwapExecuted(uint256 indexed roundId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, bytes32 txTag)",
  "function roundId() view returns (uint256)",
  "function getBalances() view returns (uint256 wbnbBal, uint256 usdBal)",
  "function triggerFeeWei() view returns (uint256)",
  "function triggerChaos(uint256 userSeed) payable returns (uint256)"
];

const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// Uses your current MockUSD.sol public mint so no redeploy needed
const musdMintAbi = [
  "function mint(address to, uint256 amount)"
];

const pairAbi = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32)"
];

const routerAbi = [
  "function getAmountsOut(uint amountIn, address[] calldata path) view returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) returns (uint[] memory amounts)"
];

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function safeAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function bscTestnetTx(hash) {
  return `https://testnet.bscscan.com/tx/${hash}`;
}

function bscTestnetAddr(addr) {
  return `https://testnet.bscscan.com/address/${addr}`;
}

function actionLabel(n) {
  const map = ["HOLD", "SWAP_WBNB_TO_USD", "SWAP_USD_TO_WBNB"];
  return map[n] ?? `UNKNOWN_${n}`;
}

function eventTypeLabel(n) {
  const map = ["VOLATILITY_SPIKE", "LIQUIDITY_DRAIN", "FAKE_PUMP", "FAKE_DUMP", "CALM"];
  return map[n] ?? `UNKNOWN_${n}`;
}

function lastTxLink(feed) {
  const item = (feed || []).find((x) => x?.link);
  return item?.link || "";
}

function PrototypeChart({ points }) {
  const labels = points.map((p) => p.t);
  const values = points.map((p) => p.v);

  const bars = values.map((v, i) => {
    const base = values[Math.max(0, i - 1)] ?? v;
    return Math.abs(v - base) + v * 0.02;
  });

  const data = {
    labels,
    datasets: [
      {
        type: "bar",
        data: bars,
        borderWidth: 0,
        backgroundColor: "rgba(255,255,255,0.06)",
        barPercentage: 1.0,
        categoryPercentage: 1.0
      },
      {
        type: "line",
        data: values,
        borderColor: "#d7f21c",
        backgroundColor: "rgba(215,242,28,0.15)",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.35
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      x: { grid: { display: false }, ticks: { display: false } },
      y: {
        grid: { color: "rgba(255,255,255,0.06)" },
        ticks: { color: "rgba(245,247,251,0.55)" }
      }
    }
  };

  return (
    <div
      style={{
        height: 260,
        borderRadius: 18,
        overflow: "hidden",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid #232833",
        padding: 12
      }}
    >
      <Line data={data} options={options} />
    </div>
  );
}

function AllocationDonut({ wbnb, usd, strategy }) {
  const w = Math.max(0, Number(wbnb || 0));
  const u = Math.max(0, Number(usd || 0));
  const total = w + u || 1;

  const wPct = (w / total) * 100;
  const uPct = (u / total) * 100;

  const targetMap = {
    Conservative: { w: 10, u: 90 },
    Balanced: { w: 30, u: 70 },
    Aggressive: { w: 55, u: 45 }
  };

  const tgt = targetMap[strategy] || targetMap.Balanced;

  const data = {
    labels: ["WBNB", "mUSD"],
    datasets: [
      {
        data: [wPct, uPct],
        backgroundColor: ["rgba(215,242,28,0.9)", "rgba(255,255,255,0.10)"],
        borderColor: ["rgba(215,242,28,0.35)", "rgba(255,255,255,0.08)"],
        borderWidth: 1,
        cutout: "72%"
      }
    ]
  };

  const options = {
    plugins: { legend: { display: false } },
    responsive: true,
    maintainAspectRatio: false
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12, alignItems: "center" }}>
      <div style={{ height: 120 }}>
        <Doughnut data={data} options={options} />
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 900 }}>Allocation</div>

        <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.75 }}>
          <span>WBNB</span>
          <span>{wPct.toFixed(1)}%</span>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", opacity: 0.75 }}>
          <span>mUSD</span>
          <span>{uPct.toFixed(1)}%</span>
        </div>

        <div style={{ fontSize: 12, opacity: 0.6 }}>
          Target for {strategy}: WBNB {tgt.w}% mUSD {tgt.u}%
        </div>
      </div>
    </div>
  );
}

function StressBar({ score }) {
  const s = clamp(Number(score || 0), 0, 100);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.7 }}>
        <span>Market Stress Index</span>
        <span>{s} / 100</span>
      </div>
      <div
        style={{
          height: 10,
          marginTop: 8,
          borderRadius: 999,
          overflow: "hidden",
          border: "1px solid #232833",
          background: "rgba(255,255,255,0.05)"
        }}
      >
        <div
          style={{
            width: `${s}%`,
            height: "100%",
            background: "linear-gradient(90deg, #2ee59d, #d7f21c, #ff4d4d)"
          }}
        />
      </div>
    </div>
  );
}

function Stat({ title, value, sub }) {
  return (
    <div style={card()}>
      <div style={{ opacity: 0.65, fontSize: 12, fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 16, fontWeight: 900 }}>{value}</div>
      {sub ? <div style={{ marginTop: 6, opacity: 0.6, fontSize: 12 }}>{sub}</div> : null}
    </div>
  );
}

function Kpi({ title, value, sub }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid #232833", borderRadius: 14, padding: 12 }}>
      <div style={{ opacity: 0.65, fontSize: 12, fontWeight: 700 }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 18, fontWeight: 900 }}>{value}</div>
      <div style={{ marginTop: 6, opacity: 0.6, fontSize: 12 }}>{sub}</div>
    </div>
  );
}

function kindIcon(kind) {
  if (kind === "SWAP") return "⇄";
  if (kind === "DECISION") return "AI";
  if (kind === "CHAOS") return "⚡";
  if (kind === "TX_SENT") return "↗";
  if (kind === "TX_MINED") return "✓";
  return "•";
}

function kindBadge(kind) {
  if (kind === "TX_MINED") return { bg: "rgba(46,229,157,0.12)", bd: "rgba(46,229,157,0.35)", tx: "rgba(46,229,157,0.95)" };
  if (kind === "TX_SENT") return { bg: "rgba(215,242,28,0.10)", bd: "rgba(215,242,28,0.35)", tx: "rgba(215,242,28,0.95)" };
  if (kind === "SWAP") return { bg: "rgba(120,170,255,0.10)", bd: "rgba(120,170,255,0.35)", tx: "rgba(120,170,255,0.95)" };
  if (kind === "DECISION") return { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.14)", tx: "rgba(245,247,251,0.90)" };
  if (kind === "CHAOS") return { bg: "rgba(255,77,77,0.10)", bd: "rgba(255,77,77,0.35)", tx: "rgba(255,77,77,0.95)" };
  return { bg: "rgba(255,255,255,0.04)", bd: "rgba(255,255,255,0.10)", tx: "rgba(245,247,251,0.85)" };
}

function FeedTile({ item }) {
  const b = kindBadge(item.kind);
  return (
    <div
      style={{
        border: "1px solid #232833",
        background: "rgba(255,255,255,0.02)",
        borderRadius: 16,
        padding: 14,
        display: "grid",
        gap: 10
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              background: b.bg,
              border: `1px solid ${b.bd}`,
              color: b.tx,
              fontWeight: 900
            }}
          >
            {kindIcon(item.kind)}
          </div>

          <div>
            <div style={{ fontWeight: 900 }}>{item.title}</div>
            {item.detail ? <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>{item.detail}</div> : null}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, opacity: 0.6 }}>{item.ts}</div>
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12, color: "rgba(215,242,28,0.95)", fontWeight: 900 }}
            >
              View
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const card = () => ({
  background: "#14181e",
  border: "1px solid #232833",
  borderRadius: 18,
  padding: 18
});

const titleStyle = () => ({ fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em" });
const subStyle = () => ({ fontSize: 13, opacity: 0.65 });

const pill = () => ({
  padding: "6px 12px",
  border: "1px solid #232833",
  background: "rgba(255,255,255,0.02)",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(245,247,251,0.85)"
});

const btn = () => ({
  background: "transparent",
  border: "1px solid #232833",
  padding: "8px 12px",
  borderRadius: 12,
  cursor: "pointer",
  color: "rgba(245,247,251,0.9)",
  fontWeight: 800
});

const btnPrimary = (disabled) => ({
  background: disabled ? "rgba(215,242,28,.06)" : "rgba(215,242,28,.15)",
  border: "1px solid rgba(215,242,28,.4)",
  padding: "8px 14px",
  borderRadius: 12,
  cursor: disabled ? "not-allowed" : "pointer",
  color: "rgba(245,247,251,0.95)",
  fontWeight: 900,
  opacity: disabled ? 0.6 : 1
});

const sectionTitle = () => ({
  fontSize: 14,
  fontWeight: 900,
  opacity: 0.8
});

const pillBtn = () => ({
  border: "1px solid #232833",
  background: "rgba(255,255,255,0.02)",
  padding: "7px 10px",
  borderRadius: 999,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(245,247,251,0.75)"
});

const pillBtnActive = () => ({
  ...pillBtn(),
  border: "1px solid rgba(215,242,28,0.5)",
  boxShadow: "0 0 0 2px rgba(215,242,28,0.08) inset",
  color: "rgba(245,247,251,0.95)"
});

export default function Page() {
  const [mode, setMode] = useState("Protocol");
  const [pendingRound, setPendingRound] = useState(null);

  const [walletAddr, setWalletAddr] = useState("");
  const [chainOk, setChainOk] = useState(false);
  const [chainId, setChainId] = useState("");

  const [lastRound, setLastRound] = useState("0");
  const [triggerFee, setTriggerFee] = useState("0");
  const [wbnbBal, setWbnbBal] = useState("0");
  const [usdBal, setUsdBal] = useState("0");

  const [feed, setFeed] = useState([]);
  const [feedFilter, setFeedFilter] = useState("All");

  const [lastDecision, setLastDecision] = useState(null);

  const [busy, setBusy] = useState(false);

  const [chartPoints, setChartPoints] = useState([]);
  const [range, setRange] = useState("6m");

  const [strategy, setStrategy] = useState(() => {
    if (typeof window === "undefined") return "Balanced";
    return localStorage.getItem("CE_STRATEGY") || "Balanced";
  });

  useEffect(() => {
    if (mode !== "Personal") return;
    if (!chainOk || !walletAddr) return;

    refreshPersonalBalances().catch((e) => {
      console.log("personal balance refresh failed", e?.message || e);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, chainOk, walletAddr]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("CE_STRATEGY", strategy);
  }, [strategy]);

  const [personal, setPersonal] = useState({
    wbnb: "0",
    usd: "0",
    price: 0,
    scenario: "Volatility dump",
    shockPct: -8,
    risk: 0,
    recommendation: null,
    analyzing: false,
    executing: false,
    slippageBps: 75
  });

  const provider = useMemo(() => {
    if (!RPC_URL) return null;
    return new ethers.JsonRpcProvider(RPC_URL);
  }, []);

  const readEngine = useMemo(() => {
    if (!provider || !ENGINE) return null;
    return new ethers.Contract(ENGINE, engineAbi, provider);
  }, [provider]);

  function pushFeed(x) {
    setFeed((prev) => [x, ...prev].slice(0, 12));
  }

  const filteredFeed = useMemo(() => {
    if (feedFilter === "All") return feed;
    if (feedFilter === "Decisions") return feed.filter((x) => x.kind === "DECISION");
    if (feedFilter === "Swaps") return feed.filter((x) => x.kind === "SWAP");
    if (feedFilter === "Triggers") return feed.filter((x) => x.kind === "TX_SENT" || x.kind === "TX_MINED");
    if (feedFilter === "Chaos") return feed.filter((x) => x.kind === "CHAOS");
    return feed;
  }, [feed, feedFilter]);

  async function refreshProtocol() {
    if (!readEngine) return;

    const [w, u] = await readEngine.getBalances();
    const rid = await readEngine.roundId();
    const fee = await readEngine.triggerFeeWei();

    const wbnb = ethers.formatUnits(w, 18);
    const usd = ethers.formatUnits(u, 18);

    setWbnbBal(wbnb);
    setUsdBal(usd);
    setLastRound(rid.toString());
    setTriggerFee(ethers.formatUnits(fee, 18));

    const totalValueProxy = Number(usd);
    setChartPoints((prev) => {
      const next = [...prev, { t: new Date().toLocaleTimeString(), v: totalValueProxy }].slice(-28);
      return next;
    });
  }

  async function readWalletState() {
    const eth = window.ethereum;
    if (!eth) return;

    try {
      const browser = new ethers.BrowserProvider(eth);
      const net = await browser.getNetwork();
      const cid = net.chainId.toString();
      setChainId(cid);
      setChainOk(cid === BSC_TESTNET_CHAIN_ID_DEC);

      const accounts = await browser.send("eth_accounts", []);
      if (accounts && accounts.length) setWalletAddr(accounts[0]);
    } catch {}
  }

  async function connectWallet() {
    const eth = window.ethereum;
    if (!eth) return alert("MetaMask not found");
    const browser = new ethers.BrowserProvider(eth);
    await browser.send("eth_requestAccounts", []);
    await readWalletState();
  }

  async function switchToBscTestnet() {
    const eth = window.ethereum;
    if (!eth) return alert("MetaMask not found");

    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_TESTNET_CHAIN_ID_HEX }]
      });
    } catch {
      alert("Please switch to BSC Testnet in MetaMask");
    } finally {
      await readWalletState();
    }
  }

  async function ensureWalletReady() {
    const eth = window.ethereum;
    if (!eth) throw new Error("MetaMask not found");

    const browser = new ethers.BrowserProvider(eth);
    await browser.send("eth_requestAccounts", []);
    const net = await browser.getNetwork();
    const cid = net.chainId.toString();

    if (cid !== BSC_TESTNET_CHAIN_ID_DEC) {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BSC_TESTNET_CHAIN_ID_HEX }]
      });
    }

    await readWalletState();
    return browser;
  }

  async function triggerChaos() {
    setBusy(true);
    try {
      if (!ENGINE) throw new Error("Missing NEXT_PUBLIC_ENGINE_ADDRESS");
      const browser = await ensureWalletReady();
      const signer = await browser.getSigner();
      const engine = new ethers.Contract(ENGINE, engineAbi, signer);

      const feeWei = await engine.triggerFeeWei();
      const seed = Math.floor(Math.random() * 1e9);

      const tx = await engine.triggerChaos(seed, { value: feeWei });

      pushFeed({
        kind: "TX_SENT",
        title: "Trigger sent",
        detail: tx.hash,
        link: bscTestnetTx(tx.hash),
        ts: new Date().toLocaleTimeString()
      });

      const rcpt = await tx.wait();

      pushFeed({
        kind: "TX_MINED",
        title: "Trigger mined",
        detail: rcpt.hash,
        link: bscTestnetTx(rcpt.hash),
        ts: new Date().toLocaleTimeString()
      });

      await refreshProtocol();
    } catch (e) {
      alert(e?.shortMessage || e?.message || "Trigger failed");
    } finally {
      setBusy(false);
    }
  }

  async function readPairPriceUsdPerWbnb() {
    if (!provider || !PAIR || !USD || !WBNB) return 0;

    const pair = new ethers.Contract(PAIR, pairAbi, provider);
    const [r0, r1] = await pair.getReserves();
    const t0 = (await pair.token0()).toLowerCase();
    const t1 = (await pair.token1()).toLowerCase();

    const reserve0 = BigInt(r0.toString());
    const reserve1 = BigInt(r1.toString());

    let usdReserve = 0n;
    let wbnbReserve = 0n;

    if (t0 === USD.toLowerCase() && t1 === WBNB.toLowerCase()) {
      usdReserve = reserve0;
      wbnbReserve = reserve1;
    } else if (t1 === USD.toLowerCase() && t0 === WBNB.toLowerCase()) {
      usdReserve = reserve1;
      wbnbReserve = reserve0;
    } else {
      return 0;
    }

    if (wbnbReserve === 0n) return 0;

    const priceWei = (usdReserve * 10n ** 18n) / wbnbReserve;
    return Number(ethers.formatUnits(priceWei, 18));
  }

  async function refreshPersonalBalances() {
    const browser = await ensureWalletReady();
    const signer = await browser.getSigner();
    const user = await signer.getAddress();

    if (!WBNB || !USD) throw new Error("Missing token addresses");

    const wbnbToken = new ethers.Contract(WBNB, erc20Abi, browser);
    const usdToken = new ethers.Contract(USD, erc20Abi, browser);

    const [wb, ub] = await Promise.all([wbnbToken.balanceOf(user), usdToken.balanceOf(user)]);

    const price = await readPairPriceUsdPerWbnb();

    setPersonal((p) => ({
      ...p,
      wbnb: ethers.formatUnits(wb, 18),
      usd: ethers.formatUnits(ub, 18),
      price
    }));
  }

  // Added: mint mUSD using existing MockUSD.mint so no redeploy needed
  async function mintMusdNoRedeploy() {
    try {
      if (!USD) throw new Error("Missing NEXT_PUBLIC_USD_ADDRESS");

      const browser = await ensureWalletReady();
      const signer = await browser.getSigner();
      const user = await signer.getAddress();

      const token = new ethers.Contract(USD, musdMintAbi, signer);

      const amount = ethers.parseUnits("1000", 18);
      const tx = await token.mint(user, amount);

      pushFeed({
        kind: "TX_SENT",
        title: "Mint mUSD sent",
        detail: tx.hash,
        link: bscTestnetTx(tx.hash),
        ts: new Date().toLocaleTimeString()
      });

      await tx.wait();

      pushFeed({
        kind: "TX_MINED",
        title: "Mint mUSD confirmed",
        detail: tx.hash,
        link: bscTestnetTx(tx.hash),
        ts: new Date().toLocaleTimeString()
      });

      await refreshPersonalBalances();
    } catch (e) {
      alert(e?.shortMessage || e?.message || "Mint failed");
    }
  }

  function computePersonalRisk({ wbnb, usd, price, shockPct }) {
    const w = Math.max(0, Number(wbnb || 0));
    const u = Math.max(0, Number(usd || 0));
    const p = Math.max(0, Number(price || 0));

    const nowValue = u + w * p;
    const shockedPrice = p * (1 + Number(shockPct) / 100);
    const shockedValue = u + w * shockedPrice;

    if (nowValue <= 0) return 0;

    const drawdownPct = ((nowValue - shockedValue) / nowValue) * 100;
    const risk = clamp(drawdownPct * 8, 0, 100);
    return { nowValue, shockedValue, drawdownPct, risk };
  }

  async function runPersonalAnalysis() {
    try {
      setPersonal((p) => ({ ...p, analyzing: true, recommendation: null }));

      await refreshPersonalBalances();

      setPersonal((p) => {
        const { risk } = computePersonalRisk(p);
        return { ...p, risk };
      });

      const payload = {
        strategy,
        scenario: personal.scenario,
        shockPct: personal.shockPct,
        balances: { wbnb: Number(personal.wbnb || 0), usd: Number(personal.usd || 0) },
        priceUsdPerWbnb: personal.price
      };

      let rec = null;

      try {
        const res = await fetch("/api/personal-recommendation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) rec = await res.json();
      } catch {}

      if (!rec || !rec.action) {
        const r = computePersonalRisk(personal).risk;
        const action = r >= 45 ? "SWAP_WBNB_TO_USD" : "HOLD";
        const tradeBps = r >= 45 ? 2500 : 0;
        rec = {
          action,
          tradeBps,
          confidence: 65,
          explain: "Fallback rule used because AI endpoint not available."
        };
      }

      setPersonal((p) => ({
        ...p,
        recommendation: {
          action: rec.action,
          tradeBps: Number(rec.tradeBps || 0),
          confidence: Number(rec.confidence || 0),
          explain: rec.explain || ""
        }
      }));
    } finally {
      setPersonal((p) => ({ ...p, analyzing: false }));
    }
  }

  async function ensureAllowance(tokenAddr, owner, spender, amountWei, browser) {
    const token = new ethers.Contract(tokenAddr, erc20Abi, browser);
    const allowance = await token.allowance(owner, spender);
    if (BigInt(allowance.toString()) >= BigInt(amountWei.toString())) return null;
    const signer = await browser.getSigner();
    const tokenWithSigner = token.connect(signer);
    const tx = await tokenWithSigner.approve(spender, amountWei);
    return tx;
  }

  async function executePersonalRebalance() {
    if (!personal.recommendation) return;

    const action = personal.recommendation.action;
    if (action === "HOLD") return alert("AI says HOLD. No swap needed.");

    setPersonal((p) => ({ ...p, executing: true }));

    try {
      const browser = await ensureWalletReady();
      const signer = await browser.getSigner();
      const user = await signer.getAddress();

      const router = new ethers.Contract(ROUTER, routerAbi, signer);

      const tradeBps = clamp(Number(personal.recommendation.tradeBps || 0), 0, 10000);
      const slippageBps = clamp(Number(personal.slippageBps || 75), 0, 3000);

      const wBal = Number(personal.wbnb || 0);
      const uBal = Number(personal.usd || 0);

      let tokenIn = "";
      let tokenOut = "";
      let amountInHuman = 0;

      if (action === "SWAP_WBNB_TO_USD") {
        tokenIn = WBNB;
        tokenOut = USD;
        amountInHuman = wBal * (tradeBps / 10000);
      } else if (action === "SWAP_USD_TO_WBNB") {
        tokenIn = USD;
        tokenOut = WBNB;
        amountInHuman = uBal * (tradeBps / 10000);
      } else {
        throw new Error("Unknown action");
      }

      if (amountInHuman <= 0) throw new Error("Amount in is zero");

      const amountInWei = ethers.parseUnits(amountInHuman.toFixed(18), 18);

      pushFeed({
        kind: "DECISION",
        title: "Personal rebalance approved",
        detail: `${action} trade ${(tradeBps / 100).toFixed(0)} percent`,
        ts: new Date().toLocaleTimeString()
      });

      const approveTx = await ensureAllowance(tokenIn, user, ROUTER, amountInWei, browser);
      if (approveTx) {
        pushFeed({
          kind: "TX_SENT",
          title: "Approve sent",
          detail: approveTx.hash,
          link: bscTestnetTx(approveTx.hash),
          ts: new Date().toLocaleTimeString()
        });
        await approveTx.wait();
        pushFeed({
          kind: "TX_MINED",
          title: "Approve mined",
          detail: approveTx.hash,
          link: bscTestnetTx(approveTx.hash),
          ts: new Date().toLocaleTimeString()
        });
      }

      const path = [tokenIn, tokenOut];
      const amountsOut = await router.getAmountsOut(amountInWei, path);
      const outWei = amountsOut[amountsOut.length - 1];

      const minOutWei = (BigInt(outWei.toString()) * BigInt(10000 - slippageBps)) / 10000n;
      const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

      const swapTx = await router.swapExactTokensForTokens(
        amountInWei,
        minOutWei,
        path,
        user,
        deadline
      );

      pushFeed({
        kind: "TX_SENT",
        title: "Swap sent",
        detail: swapTx.hash,
        link: bscTestnetTx(swapTx.hash),
        ts: new Date().toLocaleTimeString()
      });

      const rcpt = await swapTx.wait();

      pushFeed({
        kind: "TX_MINED",
        title: "Swap mined",
        detail: rcpt.hash,
        link: bscTestnetTx(rcpt.hash),
        ts: new Date().toLocaleTimeString()
      });

      await refreshPersonalBalances();

      pushFeed({
        kind: "SWAP",
        title: "Personal swap executed",
        detail: `${safeAddr(tokenIn)} to ${safeAddr(tokenOut)}`,
        ts: new Date().toLocaleTimeString()
      });
    } catch (e) {
      alert(e?.shortMessage || e?.message || "Personal swap failed");
    } finally {
      setPersonal((p) => ({ ...p, executing: false }));
    }
  }

  useEffect(() => {
    refreshProtocol().catch(() => {});
    readWalletState().catch(() => {});

    const i = setInterval(() => refreshProtocol().catch(() => {}), 6500);

    const eth = window.ethereum;
    if (eth?.on) {
      const handler = () => readWalletState().catch(() => {});
      eth.on("chainChanged", handler);
      eth.on("accountsChanged", handler);

      return () => {
        clearInterval(i);
        eth.removeListener("chainChanged", handler);
        eth.removeListener("accountsChanged", handler);
      };
    }

    return () => clearInterval(i);
  }, [readEngine]);

  useEffect(() => {
    if (!readEngine) return;

    const onChaos = (roundId, eventType, severity, trigger, ev) => {
      pushFeed({
        kind: "CHAOS",
        title: `ChaosTriggered #${roundId.toString()}`,
        detail: `${eventTypeLabel(Number(eventType))} severity ${severity.toString()}`,
        link: bscTestnetTx(ev.log.transactionHash),
        ts: new Date().toLocaleTimeString()
      });
      setLastRound(roundId.toString());
      setPendingRound(roundId.toString());
    };

    const onDecision = (roundId, actionType, riskScore, tradeBps, confidence, meta, ev) => {
      setLastDecision({
        round: roundId.toString(),
        action: actionLabel(Number(actionType)),
        risk: Number(riskScore.toString()),
        tradeBps: Number(tradeBps.toString()),
        confidence: Number(confidence.toString()),
        metaHash: meta?.toString?.() || String(meta),
        tx: ev?.log?.transactionHash || ""
      });

      pushFeed({
        kind: "DECISION",
        title: `Decision #${roundId.toString()}`,
        detail: `${actionLabel(Number(actionType))} risk ${riskScore.toString()} conf ${confidence.toString()}`,
        link: bscTestnetTx(ev.log.transactionHash),
        ts: new Date().toLocaleTimeString()
      });
    };

    const onSwap = (roundId, tokenIn, tokenOut, amountIn, amountOut, tag, ev) => {
      pushFeed({
        kind: "SWAP",
        title: `Swap #${roundId.toString()}`,
        detail: `in ${ethers.formatUnits(amountIn, 18)} out ${ethers.formatUnits(amountOut, 18)}`,
        link: bscTestnetTx(ev.log.transactionHash),
        ts: new Date().toLocaleTimeString()
      });
      refreshProtocol().catch(() => {});
    };

    readEngine.on("ChaosTriggered", onChaos);
    readEngine.on("DecisionMade", onDecision);
    readEngine.on("SwapExecuted", onSwap);

    return () => {
      readEngine.off("ChaosTriggered", onChaos);
      readEngine.off("DecisionMade", onDecision);
      readEngine.off("SwapExecuted", onSwap);
    };
  }, [readEngine]);

  const canTrigger = chainOk && walletAddr && !busy;

  const personalRiskComputed = computePersonalRisk(personal);

  return (
    <div style={{ display: "grid", gap: 18, color: "rgba(245,247,251,0.95)" }}>
      <div style={card()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  background: "rgba(215,242,28,0.08)",
                  border: "1px solid rgba(215,242,28,0.25)",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 0 18px rgba(215,242,28,0.15)",
                  overflow: "hidden"
                }}
              >
                <img
                  src="/logo.png"
                  alt="Chaos Engine"
                  style={{
                    width: "85%",
                    height: "85%",
                    objectFit: "contain"
                  }}
                />
              </div>
            </div>
            <div>
              <div style={titleStyle()}>Chaos Engine</div>
              <div style={subStyle()}>
                Dual mode AI risk engine on BSC testnet{" "}
                {ENGINE ? (
                  <a href={bscTestnetAddr(ENGINE)} target="_blank" rel="noreferrer" style={{ color: "rgba(215,242,28,0.95)", fontWeight: 800 }}>
                    Engine {safeAddr(ENGINE)}
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button style={mode === "Personal" ? pillBtnActive() : pillBtn()} onClick={() => setMode("Personal")}>
                Personal
              </button>
              <button style={mode === "Protocol" ? pillBtnActive() : pillBtn()} onClick={() => setMode("Protocol")}>
                Protocol
              </button>
            </div>

            <div style={pill()}>{chainOk ? "BSC Testnet" : `Wrong network${chainId ? ` (${chainId})` : ""}`}</div>

            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid #232833",
                color: "rgba(245,247,251,0.9)",
                padding: "8px 10px",
                borderRadius: 12,
                fontWeight: 800
              }}
            >
              <option>Conservative</option>
              <option>Balanced</option>
              <option>Aggressive</option>
            </select>

            {!walletAddr ? (
              <button style={btn()} onClick={connectWallet}>
                Connect
              </button>
            ) : !chainOk ? (
              <button style={btnPrimary(false)} onClick={switchToBscTestnet}>
                Switch to BSC Testnet
              </button>
            ) : (
              <div style={pill()}>{safeAddr(walletAddr)}</div>
            )}

            {mode === "Protocol" ? (
              <button style={btnPrimary(!canTrigger)} disabled={!canTrigger} onClick={triggerChaos}>
                {busy ? "Triggering…" : `Trigger Chaos (fee ${Number(triggerFee || 0).toFixed(4)} BNB)`}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  style={btn()}
                  onClick={mintMusdNoRedeploy}
                  disabled={!chainOk || !walletAddr}
                  title="Mints test mUSD using the testnet token mint function"
                >
                  Mint 1000 mUSD
                </button>

                <button
                  style={btnPrimary(!chainOk || !walletAddr || personal.analyzing)}
                  disabled={!chainOk || !walletAddr || personal.analyzing}
                  onClick={runPersonalAnalysis}
                >
                  {personal.analyzing ? "Analyzing…" : "Stress My Portfolio"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {mode === "Personal" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            <Stat title="Router" value={safeAddr(ROUTER)} sub="Pancake V2" />
            <Stat title="Pair" value={PAIR ? safeAddr(PAIR) : "Missing"} sub="WBNB to mUSD" />
            <Stat title="Price" value={personal.price ? `${personal.price.toFixed(4)} mUSD per WBNB` : "—"} sub="From reserves" />
            <Stat title="Scenario" value={personal.scenario} sub={`${personal.shockPct}% shock`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div style={card()}>
              <div style={sectionTitle()}>Your wallet</div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
                <Kpi title="WBNB" value={Number(personal.wbnb || 0).toFixed(6)} sub="Wallet balance" />
                <Kpi title="mUSD" value={Number(personal.usd || 0).toFixed(2)} sub="Wallet balance" />
                <Kpi title="Value" value={`${(personalRiskComputed.nowValue || 0).toFixed(2)} mUSD`} sub="Estimated" />
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={pill()}>Stress scenario</div>

                  <select
                    value={personal.scenario}
                    onChange={(e) => {
                      const v = e.target.value;
                      const shock = v === "Volatility dump" ? -8 : v === "Volatility pump" ? 8 : v === "Liquidity shock" ? -12 : -6;
                      setPersonal((p) => ({ ...p, scenario: v, shockPct: shock }));
                    }}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid #232833",
                      color: "rgba(245,247,251,0.9)",
                      padding: "8px 10px",
                      borderRadius: 12,
                      fontWeight: 800
                    }}
                  >
                    <option>Volatility dump</option>
                    <option>Volatility pump</option>
                    <option>Liquidity shock</option>
                    <option>Slow bleed</option>
                  </select>

                  <div style={pill()}>Slippage bps</div>

                  <input
                    value={personal.slippageBps}
                    onChange={(e) => setPersonal((p) => ({ ...p, slippageBps: Number(e.target.value || 0) }))}
                    style={{
                      width: 110,
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid #232833",
                      color: "rgba(245,247,251,0.9)",
                      padding: "8px 10px",
                      borderRadius: 12,
                      fontWeight: 900
                    }}
                    inputMode="numeric"
                  />
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={sectionTitle()}>Stress impact</div>
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    <Kpi title="Shocked value" value={`${(personalRiskComputed.shockedValue || 0).toFixed(2)} mUSD`} sub="After shock" />
                    <Kpi title="Drawdown" value={`${(personalRiskComputed.drawdownPct || 0).toFixed(2)} percent`} sub="Estimated" />
                    <Kpi title="Risk score" value={`${(personalRiskComputed.risk || 0).toFixed(0)}`} sub="0 to 100" />
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <StressBar score={personalRiskComputed.risk} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <div style={card()}>
                <div style={sectionTitle()}>AI recommendation</div>

                {!personal.recommendation ? (
                  <div style={{ marginTop: 12, opacity: 0.65 }}>
                    Click Stress My Portfolio to generate a plan.
                  </div>
                ) : (
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <Kpi title="Action" value={personal.recommendation.action} sub="Suggested" />
                    <Kpi title="Trade percent" value={`${(personal.recommendation.tradeBps / 100).toFixed(0)}%`} sub="Position size" />
                    <Kpi title="Confidence" value={`${personal.recommendation.confidence}`} sub="Model certainty" />
                    <div style={{ opacity: 0.75, fontSize: 12, lineHeight: 1.5 }}>
                      {personal.recommendation.explain}
                    </div>

                    <button
                      style={btnPrimary(!chainOk || !walletAddr || personal.executing)}
                      disabled={!chainOk || !walletAddr || personal.executing}
                      onClick={executePersonalRebalance}
                    >
                      {personal.executing ? "Executing…" : "Approve Rebalance"}
                    </button>

                    <div style={{ fontSize: 12, opacity: 0.6 }}>
                      Swaps happen directly from your wallet via Pancake Router.
                    </div>
                  </div>
                )}
              </div>

              <div style={card()}>
                <div style={sectionTitle()}>Proof links</div>
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {PAIR ? (
                    <a href={bscTestnetAddr(PAIR)} target="_blank" rel="noreferrer" style={{ color: "rgba(215,242,28,0.95)", fontWeight: 900 }}>
                      View pair on BscScan
                    </a>
                  ) : null}
                  <a href={bscTestnetAddr(ROUTER)} target="_blank" rel="noreferrer" style={{ color: "rgba(215,242,28,0.95)", fontWeight: 900 }}>
                    View router on BscScan
                  </a>
                  {walletAddr ? (
                    <a href={bscTestnetAddr(walletAddr)} target="_blank" rel="noreferrer" style={{ color: "rgba(215,242,28,0.95)", fontWeight: 900 }}>
                      View your wallet on BscScan
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div style={card()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 900, opacity: 0.85 }}>Activity</div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Personal swaps and protocol events</div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {["All", "Decisions", "Swaps", "Triggers", "Chaos"].map((x) => (
                  <button key={x} onClick={() => setFeedFilter(x)} style={feedFilter === x ? pillBtnActive() : pillBtn()}>
                    {x}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              {filteredFeed.length === 0 ? (
                <div style={{ opacity: 0.6 }}>No events yet.</div>
              ) : (
                filteredFeed.slice(0, 8).map((f, i) => <FeedTile key={i} item={f} />)
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            <Stat title="Round" value={lastRound} sub="Engine roundId" />
            <Stat title="Agent" value="Online" sub="Listening for events" />
            <Stat title="Liquidity" value="WBNB ↔ mUSD" sub="Pair routing" />
            <Stat title="Trigger fee" value={`${Number(triggerFee || 0).toFixed(4)} BNB`} sub="Onchain fee" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div style={card()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
                <div>
                  <div style={sectionTitle()}>Wallet Value</div>
                  <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.03em", marginTop: 6 }}>
                    ${Number(usdBal || 0).toFixed(2)}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>Updated just now</div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["1h", "8h", "1d", "1w", "1m", "6m", "1y"].map((t) => (
                    <button key={t} onClick={() => setRange(t)} style={t === range ? pillBtnActive() : pillBtn()}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                Chart removed for fast deployment
              </div>

              <StressBar score={lastDecision?.risk || 0} />

              <div style={{ marginTop: 14 }}>
                <AllocationDonut wbnb={wbnbBal} usd={usdBal} strategy={strategy} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 14 }}>
                <Kpi title="Treasury WBNB" value={Number(wbnbBal || 0).toFixed(4)} sub="Engine balance" />
                <Kpi title="Treasury mUSD" value={Number(usdBal || 0).toFixed(4)} sub="Engine balance" />
                <Kpi title="Last risk" value={lastDecision ? `${lastDecision.risk}` : "—"} sub="From AI decision" />
                <Kpi title="Last tx" value={lastTxLink(feed) ? "Available" : "—"} sub="Proof link" />
              </div>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <div style={card()}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 900, opacity: 0.85 }}>Transactions</div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Onchain events and AI decisions</div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {["All", "Decisions", "Swaps", "Triggers", "Chaos"].map((x) => (
                      <button key={x} onClick={() => setFeedFilter(x)} style={feedFilter === x ? pillBtnActive() : pillBtn()}>
                        {x}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                  {filteredFeed.length === 0 ? (
                    <div style={{ opacity: 0.6 }}>No events yet. Trigger chaos.</div>
                  ) : (
                    filteredFeed.slice(0, 6).map((f, i) => <FeedTile key={i} item={f} />)
                  )}
                </div>
              </div>

              <div style={card()}>
                <div style={sectionTitle()}>Onchain Audit</div>
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <div style={{ border: "1px solid #232833", background: "rgba(255,255,255,0.02)", borderRadius: 16, padding: 14 }}>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Engine</div>
                    <a href={bscTestnetAddr(ENGINE)} target="_blank" rel="noreferrer" style={{ fontWeight: 900, color: "rgba(215,242,28,0.95)" }}>
                      View contract
                    </a>
                  </div>

                  <div style={{ border: "1px solid #232833", background: "rgba(255,255,255,0.02)", borderRadius: 16, padding: 14 }}>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>Last transaction</div>
                    {lastTxLink(feed) ? (
                      <a href={lastTxLink(feed)} target="_blank" rel="noreferrer" style={{ fontWeight: 900, color: "rgba(215,242,28,0.95)" }}>
                        View transaction
                      </a>
                    ) : (
                      <div style={{ opacity: 0.6 }}>No tx yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={card()}>
            <div style={sectionTitle()}>AI decision breakdown</div>

            {!lastDecision ? (
              <div style={{ marginTop: 12, opacity: 0.6 }}>Waiting for decision...</div>
            ) : (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>Decision #{lastDecision.round}</div>
                  {lastDecision.tx ? (
                    <a href={bscTestnetTx(lastDecision.tx)} target="_blank" rel="noreferrer" style={{ color: "rgba(215,242,28,0.95)", fontWeight: 800 }}>
                      View decision tx
                    </a>
                  ) : null}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                  <Kpi title="Action" value={lastDecision.action} sub="Chosen behavior" />
                  <Kpi title="Risk score" value={`${lastDecision.risk}`} sub="0 to 100" />
                  <Kpi title="Trade percent" value={`${(lastDecision.tradeBps / 100).toFixed(0)}%`} sub="Position size" />
                  <Kpi title="Confidence" value={`${lastDecision.confidence}`} sub="Model certainty" />
                </div>

                <div style={{ opacity: 0.7, fontSize: 12 }}>
                  metadataHash {lastDecision.metaHash}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
