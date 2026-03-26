# Chainlink UI Runbook (vigilAnt)

This runbook is for the **next person** who needs to use the Chainlink node UI, create the correct job, and prove the end-to-end flow:

**VigilAnt (on Sepolia)** → `requestDisasterData(country)` → **Operator/Oracle emits OracleRequest** → **Chainlink node job Run appears in UI** → **node submits fulfill tx** → `VigilAnt.fulfill(...)` → `DisasterReported` event.

---

## What you must understand (non-negotiable)

### 1) The job is tied to the **Operator contract**, not the VigilAnt contract

- In a Direct Request job, `contractAddress` in the TOML is the **Operator/Oracle contract address**.
- Your VigilAnt contract does **not** need to match this address.
- VigilAnt must be configured to send requests **to that Operator address**, and must use the correct **jobId/specId**.

### 2) “Seeing a Run in the Chainlink UI” only happens on the node that owns the job

- If you want Runs to appear in **your** Chainlink UI, the job must exist on **your** node.
- If you point VigilAnt to someone else’s Operator+Job (and that job is on someone else’s node), then **they** will see Runs in **their** UI.

### 3) `requestDisasterData()` is **owner-only**

To trigger the request:
- You must call it from the wallet address returned by `VigilAnt.owner()`.

---

## Terminology

- **VigilAnt**: the main project contract you deployed on Sepolia.
- **Operator/Oracle**: Chainlink’s Operator contract (Direct Request) that receives `OracleRequest` logs.
- **Node sender**: the EVM address of your Chainlink node key (the address that submits fulfill txs).
- **Job external ID**: the job’s external identifier (UUID or 16-byte hex). In on-chain logs this becomes the `specId` (`bytes32`).
- **Fee**: LINK paid by VigilAnt per request (commonly `0.1 LINK` on Sepolia).

---

## Source-of-truth files in this repo

- **Job spec**: `chainlink/job-spec.md`
- **Deploy script**: `scripts/deploy.js`
- **Update oracle config script**: `scripts/fix-jobid.js`
- **Trigger request script**: `scripts/test-oracle-request.js`
- **Env**: `.env`
- **Frontend contract address**: `frontend/config.js` → `VIGILANT_CONTRACT`

---

## Prerequisites

You need:

- **Sepolia ETH** in your wallet (for gas).
- **Sepolia LINK** to fund the VigilAnt contract (for oracle fees).
- A **Sepolia RPC** URL (`SEPOLIA_RPC_URL`).
- Docker Desktop installed (if using the provided `chainlink-node/` compose).

---

## Step-by-step (Own your node + own the job) — recommended

### Step 1) Start the Chainlink node (local)

From repo root:

```bash
cd chainlink-node
docker compose up -d
```

Open the node UI:
- `http://localhost:6688/`

Log in with the credentials configured in `chainlink-node/docker-compose.yml`.

### Step 2) Ensure Sepolia is enabled in node config

The compose file provides an `[[EVM]]` config for Sepolia.
If the UI shows no Sepolia EVM chain accounts, your Sepolia EVM chain config is missing/disabled.

### Step 3) Create an EVM key (node sender address)

In the Chainlink UI:
- Go to **Keys → EVM**
- Click **Create**
- Copy the EVM address shown (this is your **node sender**)

In this repo it is stored in `.env` as:
- `CHAINLINK_NODE_SENDER=0x...`

### Step 4) Deploy (or choose) an Operator/Oracle contract you control

You have two viable setups:

- **A) You own the Operator** (best for development):
  - You can authorize your node sender yourself.
- **B) Someone else owns the Operator**:
  - They must authorize your node sender, or your fulfills will fail.

If you need to authorize senders on an Operator you own, run:

```bash
npx hardhat run scripts/authorize-operator-sender.js --network sepolia --config hardhat.operator.config.js
```

This uses:
- `.env OPERATOR_ADDRESS`
- `.env CHAINLINK_NODE_SENDER`

### Step 5) Create the Direct Request job in the Chainlink UI

In the Chainlink UI:
- Go to **Jobs → New Job**
- Select **Direct Request** (or paste TOML)

Critical fields:

- `type = "directrequest"`
- `contractAddress = "<OPERATOR_ADDRESS>"`  ✅ must be the Operator, not VigilAnt
- `externalJobID = "<JOB_ID_STRING>"`       ✅ must match what VigilAnt uses (as bytes32)
- `evmChainID = "11155111"`

For the demo flow in this repo, the request fetches mock JSON and reads `alertlevel`.
Use the observation pipeline style that:
- decodes the `OracleRequest`
- fetches `$(decode_cbor.get)`
- parses the `$(decode_cbor.path)` field
- maps `Red/Orange` to a bytes32 payload
- calls Operator `fulfillOracleRequest2(...)` to submit the callback

If you already have a working job in the UI, do **not** create a duplicate job with the same `externalJobID`.

### Step 6) Wire VigilAnt to your Operator + Job ID + Fee

There are two ways:

#### A) At deployment time

Edit `scripts/deploy.js` (oracle/job/fee constants) and deploy:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Then update:
- `.env VIGILANT_CONTRACT` and `CONTRACT_ADDRESS`
- `frontend/config.js` → `VIGILANT_CONTRACT`

#### B) After deployment (recommended if contract already deployed)

Set these in `.env`:

- `VIGILANT_CONTRACT=<your deployed VigilAnt>`
- `ORACLE_ADDRESS=<Operator>`
- `JOB_ID_STRING=<externalJobID>`
- `LINK_FEE_WEI=100000000000000000` (0.1 LINK)

Then run:

```bash
npx hardhat run scripts/fix-jobid.js --network sepolia
```

### Step 7) Fund the VigilAnt contract with LINK

Your VigilAnt contract pays the fee by transferring LINK to the Operator.
If VigilAnt has insufficient LINK, `requestDisasterData()` fails with an ERC20 transfer error (or appears to fail “silently” from the node perspective).

Send Sepolia LINK to the **VigilAnt contract address**:
- use Chainlink faucet: `https://faucets.chain.link/sepolia`

Recommended balance:
- **>= 1 LINK** for testing (each request costs 0.1 LINK by default)

### Step 8) Trigger the request and confirm the Run appears

#### Option A) Trigger from script (easiest)

Make sure `.env PRIVATE_KEY` corresponds to the VigilAnt **owner**.

```bash
npx hardhat run scripts/test-oracle-request.js --network sepolia
```

Then in the Chainlink UI:
- Go to **Runs**
- You should see a new Run for your job

#### Option B) Trigger from the frontend

Serve the frontend (don’t open the HTML file directly):

```bash
cd frontend
npx http-server -p 5173
```

Open:
- `http://localhost:5173/`

Connect the **owner wallet**, then click the Admin action to request disaster data.

---

## How to tell it’s working (checklist)

- ✅ `requestDisasterData(country)` tx succeeds (on Sepolia)
- ✅ Operator contract shows an **OracleRequest** log for that tx
- ✅ In Chainlink UI → **Runs** shows a new Run
- ✅ Run completes and `ethtx` task submits successfully
- ✅ There is an on-chain callback tx (fulfill) that calls back into VigilAnt
- ✅ VigilAnt emits `DisasterReported(...)` and creates a `PENDING` event for Red/Orange

---

## Common problems (and exactly what they mean)

### “No new Run appears in Chainlink UI”

Usually one of these:

- **Wrong Operator**: VigilAnt is sending to a different `oracleAddress` than your job’s `contractAddress`.
- **Wrong jobId**: VigilAnt `jobId` doesn’t match the job’s `externalJobID` (specId mismatch).
- **Looking at the wrong node**: the job exists on someone else’s Chainlink node, not yours.
- **Request tx reverted**: check the `requestDisasterData` transaction status on Etherscan.

### “Only callable by owner”

You are not using the VigilAnt owner wallet.
- Fix: call from the `owner()` address, or redeploy so you are owner.

### “ERC20: transfer amount exceeds balance”

VigilAnt doesn’t have enough LINK to pay the fee.
- Fix: fund VigilAnt with LINK.

### “Not authorized sender” (or fulfill tx fails)

The Operator contract does not allow your node sender to submit fulfills.
- Fix: Operator owner must call `setAuthorizedSenders([NODE_SENDER])`.

### Job creation fails with “duplicate external_job_id”

You tried to create another job with the same `externalJobID`.
- Fix: edit the existing job, or create a new job with a new UUID and update VigilAnt jobId.

---

## Minimal “what to change” for a new person

If you hand this repo to a new teammate and they want Runs on *their* Chainlink UI:

1. They run their own node (`chainlink-node/docker-compose.yml`).
2. They create an EVM key in UI and get `CHAINLINK_NODE_SENDER`.
3. They deploy or control an Operator contract and authorize that sender.
4. They create a Direct Request job in UI (contractAddress = Operator, externalJobID = their job id).
5. They set `.env`:
   - `VIGILANT_CONTRACT`
   - `ORACLE_ADDRESS` (Operator)
   - `JOB_ID_STRING`
   - `LINK_FEE_WEI`
6. They run `scripts/fix-jobid.js`.
7. They fund VigilAnt with LINK.
8. They call `requestDisasterData` as owner and confirm Runs appear.

