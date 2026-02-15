"use client";

import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";

const ENGINE = process.env.NEXT_PUBLIC_ENGINE_ADDRESS;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
const USD = process.env.NEXT_PUBLIC_USD_ADDRESS;
const WBNB = process.env.NEXT_PUBLIC_WBNB_ADDRESS;

const engineAbi = [
  "event ChaosTriggered(uint256 indexed roundId, uint8 eventType, uint256 severity, address indexed trigger)",
  "event DecisionMade(uint256 indexed roundId, uint8 actionType, uint256 riskScore, uint256 tradeBps, uint256 confidence, bytes32 metadataHash)",
  "event SwapExecuted(uint256 indexed roundId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, bytes32 txTag)",
  "function roundId() view returns (uint256)",
  "function getBalances() view returns (uint256 wbnbBal, uint256 usdBal)",
  "function triggerFeeWei() view returns (uint256)",
  "function triggerChaos(uint256 userSeed) payable returns (uint256)"
];

const eventTypeLabel = (n) => {
  const map = ["VOLATILITY_SPIKE", "LIQUIDITY_DRAIN", "FAKE_PUMP", "FAKE_DUMP", "CALM"];
  return map[n] ?? `UNKNOWN_${n}`;
};

const actionLabel = (n) => {
  const map = ["HOLD", "SWAP_WBNB_TO_USD", "SWAP_USD_TO_WBNB"];
  return map[n] ?? `UNKNOWN_${n}`;
};

const bscTestnetTx = (hash) => `https://testnet.bscscan.com/tx/${hash}`;
const bscTestnetAddr = (addr) => `https://testnet.bscscan.com/address/${addr}`;

export default function Page() {
  const [walletAddr, setWalletAddr] = useState("");
  const [chainOk, setChainOk] = useState(false);

  const [wbnbBal, setWbnbBal] = useState("0");
  const [usdBal, setUsdBal] = useState("0");

  const [triggerFee, setTriggerFee] = useState("0");
  const [lastRound, setLastRound] = useState("0");

  const [feed, setFeed] = useState([]);
  const [busy, setBusy] = useState(false);

  const readProvider = useMemo(() => new ethers.JsonRpcProvider(RPC_URL), []);
  const readEngine = useMemo(() => new ethers.Contract(ENGINE, engineAbi, readProvider), [readProvider]);

  const pushFeed = (item) => {
    setFeed((prev) => [item, ...prev].slice(0, 30));
  };

  async function refreshBasics() {
    const [w, u] = await readEngine.getBalances();
    setWbnbBal(ethers.formatUnits(w, 18));
    setUsdBal(ethers.formatUnits(u, 18));

    const fee = await readEngine.triggerFeeWei();
    setTriggerFee(ethers.formatUnits(fee, 18));

    const rid = await readEngine.roundId();
    setLastRound(rid.toString());
  }

  async function connectWallet() {
    if (!window.ethereum) {
      alert("MetaMask not found");
      return;
    }
    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await browserProvider.send("eth_requestAccounts", []);
    const signer = await browserProvider.getSigner();
    const addr = await signer.getAddress();
    setWalletAddr(addr);

    const net = await browserProvider.getNetwork();
    setChainOk(Number(net.chainId) === 97);
  }

  async function triggerChaos() {
    if (!window.ethereum) return alert("MetaMask not found");
    if (!chainOk) return alert("Switch network to BSC Testnet (chainId 97)");

    setBusy(true);
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
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

      await refreshBasics();
    } catch (e) {
      console.error(e);
      alert(e?.shortMessage || e?.message || "Trigger failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!ENGINE || !RPC_URL || !USD || !WBNB) {
      pushFeed({
        kind: "ERROR",
        title: "Missing env",
        detail: "Check .env.local NEXT_PUBLIC values",
        ts: new Date().toLocaleTimeString()
      });
      return;
    }

    refreshBasics().catch(console.error);

    const interval = setInterval(() => refreshBasics().catch(() => {}), 6000);

    const onChaos = (roundId, eventType, severity, trigger, ev) => {
      pushFeed({
        kind: "CHAOS",
        title: `ChaosTriggered #${roundId.toString()}`,
        detail: `${eventTypeLabel(Number(eventType))} severity ${severity.toString()}`,
        link: bscTestnetTx(ev.log.transactionHash),
        ts: new Date().toLocaleTimeString()
      });
      setLastRound(roundId.toString());
    };

    const onDecision = (roundId, actionType, riskScore, tradeBps, confidence, _meta, ev) => {
      pushFeed({
        kind: "DECISION",
        title: `Decision #${roundId.toString()}`,
        detail: `${actionLabel(Number(actionType))} risk ${riskScore.toString()} tradeBps ${tradeBps.toString()} conf ${confidence.toString()}`,
        link: bscTestnetTx(ev.log.transactionHash),
        ts: new Date().toLocaleTimeString()
      });
    };

    const onSwap = (roundId, tokenIn, tokenOut, amountIn, amountOut, _tag, ev) => {
      pushFeed({
        kind: "SWAP",
        title: `Swap #${roundId.toString()}`,
        detail: `in ${ethers.formatUnits(amountIn, 18)} out ${ethers.formatUnits(amountOut, 18)}`,
        link: bscTestnetTx(ev.log.transactionHash),
        ts: new Date().toLocaleTimeString()
      });
      refreshBasics().catch(() => {});
    };

    readEngine.on("ChaosTriggered", onChaos);
    readEngine.on("DecisionMade", onDecision);
    readEngine.on("SwapExecuted", onSwap);

    return () => {
      clearInterval(interval);
      readEngine.off("ChaosTriggered", onChaos);
      readEngine.off("DecisionMade", onDecision);
      readEngine.off("SwapExecuted", onSwap);
    };
  }, []);

  const w = Number(wbnbBal || 0);
  const u = Number(usdBal || 0);
  const total = w + u;
  const wPct = total > 0 ? Math.round((w / total) * 100) : 0;
  const uPct = total > 0 ? 100 - wPct : 0;

  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Chaos Engine</h1>
          <div style={{ opacity: 0.75, marginTop: 6 }}>
            Engine{" "}
            <a href={bscTestnetAddr(ENGINE)} target="_blank" rel="noreferrer">
              {ENGINE?.slice(0, 10)}…
            </a>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {!walletAddr ? (
            <button onClick={connectWallet} style={btn()}>
              Connect wallet
            </button>
          ) : (
            <div style={{ fontSize: 14, opacity: 0.85 }}>
              {walletAddr.slice(0, 8)}… {chainOk ? "(BSC testnet)" : "(wrong network)"}
            </div>
          )}

          <button onClick={triggerChaos} disabled={!walletAddr || busy} style={btn(busy || !walletAddr)}>
            {busy ? "Working…" : `Trigger Chaos (fee ${triggerFee} BNB)`}
          </button>
        </div>
      </div>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 18 }}>
        <Card title="Round">
          <div style={bigNum()}>{lastRound}</div>
        </Card>
        <Card title="Treasury WBNB">
          <div style={bigNum()}>{trim(wbnbBal)}</div>
        </Card>
        <Card title="Treasury mUSD">
          <div style={bigNum()}>{trim(usdBal)}</div>
        </Card>
      </section>

      <section style={{ marginTop: 14 }}>
        <Card title="Allocation">
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ width: "100%", height: 12, background: "#eee", borderRadius: 999 }}>
              <div style={{ width: `${wPct}%`, height: 12, background: "#111", borderRadius: 999 }} />
            </div>
            <div style={{ minWidth: 150, fontSize: 14, opacity: 0.85 }}>
              WBNB {wPct}% · mUSD {uPct}%
            </div>
          </div>
        </Card>
      </section>

      <section style={{ marginTop: 14 }}>
        <Card title="Live feed">
          <div style={{ display: "grid", gap: 10 }}>
            {feed.length === 0 ? (
              <div style={{ opacity: 0.7 }}>No events yet. Trigger chaos.</div>
            ) : (
              feed.map((x, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid #eee", paddingBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{x.title}</div>
                    <div style={{ opacity: 0.75, fontSize: 13 }}>{x.detail}</div>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 140 }}>
                    <div style={{ opacity: 0.7, fontSize: 12 }}>{x.ts}</div>
                    {x.link ? (
                      <a href={x.link} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>
                        View tx
                      </a>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </main>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function btn(disabled) {
  return {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: disabled ? "#f5f5f5" : "#111",
    color: disabled ? "#999" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer"
  };
}

function bigNum() {
  return { fontSize: 24, fontWeight: 700 };
}

function trim(x) {
  const n = Number(x || 0);
  return n.toFixed(4);
}
