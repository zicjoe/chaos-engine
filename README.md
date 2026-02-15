# Chaos Engine  
### Autonomous AI Risk Engine for On-Chain Treasury Management  

---

## Overview

Chaos Engine is an autonomous AI-driven treasury management protocol deployed on BSC Testnet.  

It enables:
- Public triggering of market stress events  
- AI-based risk evaluation  
- On-chain capital rebalancing  
- Fully transparent decision proofs  

The system operates in two modes:
- **Protocol Mode** — manages a shared treasury  
- **Personal Mode** — stress tests a user wallet without moving funds  

---

## Problem

On-chain treasuries are reactive and manually managed.  
Human operators are slow, emotional, and often respond after damage occurs.

There is no autonomous, verifiable AI system that:
- Reacts instantly to market shocks  
- Evaluates risk objectively  
- Executes trades on-chain  
- Provides decision transparency  

Chaos Engine solves this.

---

## Solution

Chaos Engine introduces a dual-layer architecture:

1. **Smart Contract Treasury**
   - Holds WBNB + mUSD  
   - Emits ChaosTriggered events  
   - Executes AI decisions on-chain  

2. **Autonomous AI Agent**
   - Listens for events  
   - Fetches balances  
   - Requests AI risk analysis  
   - Calculates slippage-protected swaps  
   - Executes rebalancing transaction  

3. **Institutional Dashboard**
   - Real-time treasury value  
   - AI decision breakdown  
   - Metadata hash proof  
   - Dual mode (Protocol / Personal)  

---

## How It Works

1. User triggers Chaos (pays small BNB fee)  
2. Smart contract emits `ChaosTriggered`  
3. Agent receives event  
4. AI evaluates:
   - Event type  
   - Severity  
   - Treasury allocation  
5. AI returns:
   - Risk score  
   - Action (HOLD / SWAP)  
   - Trade percentage  
   - Confidence  
6. Agent executes `decideAndExecute`  
7. Dashboard displays decision + proof  

Fully on-chain execution.  
Fully auditable logic.  
Human-free rebalancing.  

---

## Architecture

                   ┌────────────────────────┐
                   │        User UI         │
                   │  (Next.js Dashboard)   │
                   └────────────┬───────────┘
                                │
                                ▼
                   ┌────────────────────────┐
                   │   ChaosEngine.sol      │
                   │ Smart Contract Treasury│
                   │ - Holds WBNB + mUSD    │
                   │ - Emits Events         │
                   │ - Executes Swaps       │
                   └────────────┬───────────┘
                                │ Emits ChaosTriggered
                                ▼
                   ┌────────────────────────┐
                   │  Autonomous Agent      │
                   │  (Node.js Listener)    │
                   │ - Fetch balances       │
                   │ - Call AI model        │
                   │ - Quote Router         │
                   │ - Execute decision     │
                   └────────────┬───────────┘
                                │
                                ▼
                   ┌────────────────────────┐
                   │   AI Risk Model        │
                   │  (Anthropic Claude)    │
                   │ - Risk Score           │
                   │ - Action               │
                   │ - Trade Size           │
                   └────────────────────────┘


---

## Tech Stack

- Solidity  
- Hardhat  
- Ethers v6  
- Next.js  
- PancakeSwap V2  
- Anthropic Claude API  
- BSC Testnet  

---

## Why It Matters

Chaos Engine demonstrates that AI can evaluate risk, make capital allocation decisions, and execute trades autonomously and transparently on-chain.

It lays the foundation for AI-governed treasury infrastructure in DeFi.

---

## Future Expansion

- Multi-asset treasury support  
- DAO governance layer  
- Cross-chain risk routing  
- Dynamic trigger incentives  


