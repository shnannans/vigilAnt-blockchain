// ─────────────────────────────────────────────────────────────────────────────
//  vigilAnt — app.js
//  Plain JS + ethers.js v6 (no build step, no framework)
//  Pattern: DreamCity frontend adapted for vigilAnt contract
//
//  ⚠️  Person C owns this file.
//  ⚠️  All contract calls use CONFIG.USDC_UNIT for amount conversion.
//      100 USDC display = 100_000_000 on-chain (6 decimals, NOT 18).
//  ⚠️  deposit() requires approve(full amount) FIRST — two MetaMask popups.
// ─────────────────────────────────────────────────────────────────────────────

import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.14.0/+esm";
import { CONFIG, VIGILANT_ABI, USDC_ABI } from "./config.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const connectBtn       = document.getElementById("connectBtn");
const switchNetworkBtn = document.getElementById("switchNetworkBtn");
const oracleBtn        = document.getElementById("oracleBtn");
const simulateBtn      = document.getElementById("simulateBtn");
const returnBtn        = document.getElementById("returnBtn");
const depositBtn       = document.getElementById("depositBtn");
const confirmBtn       = document.getElementById("confirmBtn");
const refreshFeedBtn   = document.getElementById("refreshFeedBtn");
const clearFeedBtn     = document.getElementById("clearFeedBtn");

const walletBanner     = document.getElementById("walletBanner");
const walletDot        = document.getElementById("walletDot");
const walletAddress    = document.getElementById("walletAddress");
const walletRole       = document.getElementById("walletRole");
const usdcBalance      = document.getElementById("usdcBalance");
const networkBanner    = document.getElementById("networkBanner");
const contractBanner   = document.getElementById("contractBanner");
const navNetwork       = document.getElementById("navNetwork");

const panelContributor = document.getElementById("panelContributor");
const panelValidator   = document.getElementById("panelValidator");
const panelAdmin       = document.getElementById("panelAdmin");

const contributionDisplay = document.getElementById("contributionDisplay");
const contribEmpty     = document.getElementById("contribEmpty");
const contribAmount    = document.getElementById("contribAmount");
const contribCountry   = document.getElementById("contribCountry");
const contribExpiry    = document.getElementById("contribExpiry");
const contribStatus    = document.getElementById("contribStatus");

const depositForm      = document.getElementById("depositForm");
const depositCountry   = document.getElementById("depositCountry");
const depositAmount    = document.getElementById("depositAmount");
const depositProgress  = document.getElementById("depositProgress");
const txStep1          = document.getElementById("txStep1");
const txStep2          = document.getElementById("txStep2");

const validatorEmpty   = document.getElementById("validatorEmpty");
const eventDisplay     = document.getElementById("eventDisplay");
const eventCountry     = document.getElementById("eventCountry");
const eventSeverity    = document.getElementById("eventSeverity");
const eventIdEl        = document.getElementById("eventId");
const eventReportedAt  = document.getElementById("eventReportedAt");
const eventGdacsId     = document.getElementById("eventGdacsId");
const confirmCount     = document.getElementById("confirmCount");
const confirmFill      = document.getElementById("confirmFill");
const validatorGrid    = document.getElementById("validatorGrid");

const simulateSeverity = document.getElementById("simulateSeverity");
const returnAddress    = document.getElementById("returnAddress");

const poolBalance      = document.getElementById("poolBalance");
const poolStatus       = document.getElementById("poolStatus");
const poolLatestEvent  = document.getElementById("poolLatestEvent");

const activityFeed     = document.getElementById("activityFeed");
const feedStatus       = document.getElementById("feedStatus");
const heroCountries    = document.getElementById("heroCountries");
const countrySelector  = document.getElementById("countrySelector");
const durationPills    = document.getElementById("durationPills");
const toastContainer   = document.getElementById("toastContainer");

// ── State ─────────────────────────────────────────────────────────────────────
let provider, signer, vigilant, usdc;
let currentAddress   = null;
let currentRole      = null; // "contributor" | "validator" | "admin"
let currentCountry   = 1;   // selected country code (1–5)
let selectedDuration = 0;   // 0=1mo 1=3mo 2=6mo
let validatorAddresses = [];
let feedListening    = false;
let isContractDeployed = false;
let feedHistoryLoaded = false;

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (usdc6) => usdc6 !== undefined && usdc6 !== null
  ? (Number(usdc6) / CONFIG.USDC_UNIT).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " USDC"
  : "—";

const fmtAddress = (addr) => addr ? `${addr.slice(0,6)}…${addr.slice(-4)}` : "—";

const fmtDate = (ts) => {
  if (!ts || ts === 0n || ts === 0) return "—";
  return new Date(Number(ts) * 1000).toLocaleDateString("en-SG", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
};

const fmtRelative = (ts) => {
  if (!ts) return "—";
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(ts) - now;
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h remaining`;
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m remaining`;
};

const countryName = (code) => CONFIG.COUNTRIES[code]?.name || "Unknown";
const countryFlag = (code) => CONFIG.COUNTRIES[code]?.flag || "🌍";

function extractError(err) {
  if (!err) return "Transaction failed";
  const msg = err?.info?.error?.data?.message || err?.data?.message || err?.message || "Transaction failed";
  return msg.replace("execution reverted: ", "").replace("VigilAnt: ", "").trim();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(title, msg = "", type = "pending") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div>
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ""}
    </div>
    <button class="toast-close" onclick="this.closest('.toast').remove()">✕</button>
  `;
  toastContainer.prepend(el);
  if (type !== "pending") setTimeout(() => el.remove(), 5000);
  return el;
}

// ── Network ───────────────────────────────────────────────────────────────────
function normalizeChainId(id) {
  if (typeof id === "bigint") return id;
  if (typeof id === "number") return BigInt(id);
  return BigInt(id);
}
const isCorrectNetwork = (id) => normalizeChainId(id) === BigInt(CONFIG.CHAIN_ID);

async function switchNetwork() {
  if (!window.ethereum) return;
  const hex = `0x${Number(CONFIG.CHAIN_ID).toString(16)}`;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (err) {
    if (err?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: hex,
          chainName: CONFIG.CHAIN_NAME,
          rpcUrls: CONFIG.RPC_URLS,
          nativeCurrency: CONFIG.NATIVE_CURRENCY,
          blockExplorerUrls: [CONFIG.BLOCK_EXPLORER],
        }],
      });
    }
  }
}

// ── Init UI ───────────────────────────────────────────────────────────────────
function buildStaticUI() {
  // Hero country chips
  heroCountries.innerHTML = Object.entries(CONFIG.COUNTRIES).map(([, c]) =>
    `<div class="hero-country-chip"><span>${c.flag}</span><span>${c.name}</span></div>`
  ).join("");

  // Country selector buttons
  countrySelector.innerHTML = Object.entries(CONFIG.COUNTRIES).map(([code, c]) =>
    `<button class="country-btn ${Number(code) === currentCountry ? "active" : ""}"
      data-code="${code}" onclick="selectCountry(${code})">
      <span class="cflag">${c.flag}</span>${c.name}
    </button>`
  ).join("");

  // Deposit country dropdown
  depositCountry.innerHTML = Object.entries(CONFIG.COUNTRIES).map(([code, c]) =>
    `<option value="${code}">${c.flag} ${c.name}</option>`
  ).join("");

  // Duration pills
  durationPills.innerHTML = CONFIG.DURATIONS.map((d) =>
    `<button class="duration-pill ${d.value === selectedDuration ? "active" : ""}"
      data-value="${d.value}" onclick="selectDuration(${d.value})">${d.label}</button>`
  ).join("");

  // Check if contract is deployed
  if (CONFIG.VIGILANT_CONTRACT.includes("FILL")) {
    contractBanner.classList.remove("hidden");
    isContractDeployed = false;
  } else {
    isContractDeployed = true;
  }
}

// Exposed to HTML onclick
window.selectCountry = async (code) => {
  currentCountry = Number(code);
  document.querySelectorAll(".country-btn").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.code) === currentCountry);
  });
  if (vigilant) await refreshPoolStats();
  if (vigilant && (currentRole === "validator" || currentRole === "admin")) {
    await refreshValidatorPanel();
  }
};

window.selectDuration = (value) => {
  selectedDuration = Number(value);
  document.querySelectorAll(".duration-pill").forEach(pill => {
    pill.classList.toggle("active", Number(pill.dataset.value) === selectedDuration);
  });
};

// ── Wallet connect ─────────────────────────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) {
    toast("MetaMask not found", "Install MetaMask to continue", "error");
    return;
  }
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    provider = new ethers.BrowserProvider(window.ethereum);
    signer   = await provider.getSigner();
    await initSession();
  } catch (err) {
    toast("Connection failed", extractError(err), "error");
  }
}

async function initSession() {
  if (!signer) return;
  const network = await provider.getNetwork();
  const chainId = network.chainId;

  currentAddress = await signer.getAddress();

  // Update wallet banner
  walletBanner.classList.remove("hidden");
  walletDot.classList.add("connected");
  walletAddress.textContent = fmtAddress(currentAddress);

  // Network check
  if (!isCorrectNetwork(chainId)) {
    networkBanner.classList.remove("hidden");
    walletRole.textContent = "Wrong Network";
    setAllPanelsDisabled();
    return;
  }
  networkBanner.classList.add("hidden");

  // Load contracts
  if (!isContractDeployed) {
    walletRole.textContent = "Not Deployed";
    setAllPanelsDisabled();
    return;
  }

  vigilant = new ethers.Contract(CONFIG.VIGILANT_CONTRACT, VIGILANT_ABI, signer);
  usdc     = new ethers.Contract(CONFIG.USDC_ADDRESS, USDC_ABI, signer);

  // Detect role
  const [isVal, owner, bal] = await Promise.all([
    vigilant.isValidator(currentAddress),
    vigilant.owner(),
    usdc.balanceOf(currentAddress),
  ]);

  const isOwner = owner.toLowerCase() === currentAddress.toLowerCase();
  currentRole = isOwner ? "admin" : isVal ? "validator" : "contributor";

  // Load validator addresses
  validatorAddresses = CONFIG.VALIDATORS;

  // Update wallet badge
  walletRole.textContent = currentRole.charAt(0).toUpperCase() + currentRole.slice(1);
  walletRole.className = `wallet-badge ${currentRole}`;
  usdcBalance.textContent = fmt(bal);

  // Show correct panels
  panelContributor.classList.remove("hidden");
  panelValidator.classList.toggle("hidden", currentRole !== "validator" && currentRole !== "admin");
  panelAdmin.classList.toggle("hidden", currentRole !== "admin");

  // Connect button update
  connectBtn.textContent = fmtAddress(currentAddress);

  // Load data
  await refreshContributorPanel();
  await refreshPoolStats();
  if (currentRole !== "contributor") await refreshValidatorPanel();

  // Start event listeners
  startFeedListeners();
  await loadFeedHistory();
}

function setAllPanelsDisabled() {
  panelContributor.classList.remove("hidden");
  panelValidator.classList.add("hidden");
  panelAdmin.classList.add("hidden");
  depositBtn.disabled = true;
  depositBtn.textContent = "Connect wallet to deposit";
}

// ── Pool Stats ────────────────────────────────────────────────────────────────
async function refreshPoolStats() {
  try {
    const [bal, latestId] = await Promise.all([
      vigilant.getPoolBalance(currentCountry),
      vigilant.getLatestEvent(currentCountry),
    ]);

    poolBalance.textContent = fmt(bal);

    const eventId = Number(latestId);
    if (eventId > 0) {
      const evt = await vigilant.getDisasterEvent(eventId);
      const statusMap = { 0: "No Event", 1: "⚠ PENDING", 2: "✓ Executed" };
      poolStatus.textContent = statusMap[Number(evt.status)] || "Unknown";
      poolLatestEvent.textContent = `#${eventId}`;
    } else {
      poolStatus.textContent = "No Events";
      poolLatestEvent.textContent = "None";
    }
  } catch (err) {
    console.error("refreshPoolStats:", err);
  }
}

// ── Contributor Panel ─────────────────────────────────────────────────────────
async function refreshContributorPanel() {
  if (!vigilant || !currentAddress) return;
  try {
    const c = await vigilant.getContribution(currentAddress);
    const amount = Number(c.amount);

    if (amount > 0 || c.returned) {
      contributionDisplay.classList.remove("hidden");
      contribEmpty.classList.add("hidden");

      contribAmount.textContent  = fmt(c.amount);
      contribCountry.textContent = `${countryFlag(Number(c.countryCode))} ${countryName(Number(c.countryCode))}`;
      contribExpiry.textContent  = `${fmtDate(c.expiry)} (${fmtRelative(c.expiry)})`;

      const now = Math.floor(Date.now() / 1000);
      const expired = Number(c.expiry) < now;

      if (c.returned) {
        contribStatus.textContent = "Returned";
        contribStatus.className = "contrib-value contrib-status returned";
      } else if (expired) {
        contribStatus.textContent = "Expired — awaiting return";
        contribStatus.className = "contrib-value contrib-status expired";
      } else {
        contribStatus.textContent = "Active";
        contribStatus.className = "contrib-value contrib-status active";
      }

      // Enable deposit even if active contribution exists
      enableDepositBtn();
    } else {
      contributionDisplay.classList.add("hidden");
      contribEmpty.classList.remove("hidden");
      enableDepositBtn();
    }
  } catch (err) {
    console.error("refreshContributorPanel:", err);
  }
}

function enableDepositBtn() {
  depositBtn.disabled = false;
  depositBtn.textContent = "Deposit USDC";
}

// ── Validator Panel ───────────────────────────────────────────────────────────
async function refreshValidatorPanel() {
  if (!vigilant) return;
  try {
    const latestId = Number(await vigilant.getLatestEvent(currentCountry));

    if (latestId === 0) {
      validatorEmpty.classList.remove("hidden");
      eventDisplay.classList.add("hidden");
      return;
    }

    const evt = await vigilant.getDisasterEvent(latestId);

    if (Number(evt.status) !== 1) { // not PENDING
      validatorEmpty.classList.remove("hidden");
      eventDisplay.classList.add("hidden");
      return;
    }

    validatorEmpty.classList.add("hidden");
    eventDisplay.classList.remove("hidden");

    const country = CONFIG.COUNTRIES[Number(evt.countryCode)];
    eventCountry.textContent   = `${country?.flag || ""} ${country?.name || "Unknown"}`;
    eventIdEl.textContent      = `#${latestId}`;
    eventReportedAt.textContent = fmtDate(evt.reportedAt);
    // decode bytes32 to readable string, trim null bytes
    try {
      eventGdacsId.textContent = ethers.decodeBytes32String(evt.gdacsEventId) || "—";
    } catch {
      eventGdacsId.textContent = evt.gdacsEventId === "0x0000000000000000000000000000000000000000000000000000000000000000" ? "—" : evt.gdacsEventId;
    }

    const severity = Number(evt.severity);
    eventSeverity.textContent  = severity === 2 ? "🔴 Red Alert" : "🟠 Orange Alert";
    eventSeverity.className    = `event-severity ${severity === 2 ? "red" : "orange"}`;

    const confs = Number(evt.confirmations);
    confirmCount.textContent = `${confs} / 3`;
    confirmFill.style.width  = `${Math.min((confs / 3) * 100, 100)}%`;

    // Validator chips
    const confirmChecks = await Promise.all(
      validatorAddresses.map(addr => addr ? vigilant.hasConfirmed(latestId, addr) : Promise.resolve(false))
    );
    validatorGrid.innerHTML = validatorAddresses.map((addr, i) => {
      const confirmed = confirmChecks[i];
      const isMe = addr && currentAddress && addr.toLowerCase() === currentAddress.toLowerCase();
      const cls = confirmed ? (isMe ? "validator-chip you" : "validator-chip confirmed") : "validator-chip";
      const icon = confirmed ? "✓" : `V${i+1}`;
      return `<div class="${cls}">
        <span class="validator-chip-icon">${confirmed ? "✅" : "○"}</span>
        <span>${isMe ? "You" : `V${i+1}`}</span>
      </div>`;
    }).join("");

    // Confirm button
    const alreadyConfirmed = currentAddress
      ? await vigilant.hasConfirmed(latestId, currentAddress)
      : false;

    if (currentRole === "validator" || currentRole === "admin") {
      confirmBtn.disabled = alreadyConfirmed || confs >= 3;
      confirmBtn.textContent = alreadyConfirmed
        ? "Already confirmed"
        : confs >= 3
        ? "Threshold reached"
        : "Confirm Disaster";
      confirmBtn.dataset.eventId = latestId;
    }
  } catch (err) {
    console.error("refreshValidatorPanel:", err);
  }
}

// ── Deposit ───────────────────────────────────────────────────────────────────
async function handleDeposit() {
  const rawAmount = parseFloat(depositAmount.value);
  if (!rawAmount || rawAmount < CONFIG.MIN_DEPOSIT_USDC) {
    toast("Invalid amount", `Minimum deposit is ${CONFIG.MIN_DEPOSIT_USDC} USDC`, "error");
    return;
  }

  const country  = Number(depositCountry.value);
  const duration = selectedDuration;

  // Amount in 6-decimal units
  const amountRaw = BigInt(Math.floor(rawAmount * CONFIG.USDC_UNIT));

  depositBtn.disabled = true;
  depositProgress.classList.remove("hidden");
  txStep1.classList.add("active");
  txStep2.classList.remove("active", "done");

  const t = toast("Depositing…", "Step 1 of 2: Approving USDC spend", "pending");

  try {
    // Step 1: Approve full amount (net + fee both pulled from user wallet)
    // ⚠️  Must approve full amountRaw — contract does two transferFrom internally
    const approveTx = await usdc.connect(signer).approve(CONFIG.VIGILANT_CONTRACT, amountRaw);
    await approveTx.wait(1);

    txStep1.classList.remove("active");
    txStep1.classList.add("done");
    txStep2.classList.add("active");
    t.querySelector(".toast-msg").textContent = "Step 2 of 2: Depositing into pool…";

    // Step 2: Deposit
    const depositTx = await vigilant.connect(signer).deposit(country, amountRaw, duration);
    await depositTx.wait(1);

    txStep2.classList.remove("active");
    txStep2.classList.add("done");

    t.remove();
    toast("Deposit successful!", `${rawAmount} USDC deposited into ${countryName(country)} pool`, "success");

    depositAmount.value = "";
    depositProgress.classList.add("hidden");
    await Promise.all([refreshContributorPanel(), refreshPoolStats()]);
  } catch (err) {
    t.remove();
    toast("Deposit failed", extractError(err), "error");
    depositProgress.classList.add("hidden");
    txStep1.classList.remove("active", "done");
    txStep2.classList.remove("active", "done");
    depositBtn.disabled = false;
  }

  depositBtn.disabled = false;
}

// ── Confirm Disaster ──────────────────────────────────────────────────────────
async function handleConfirmDisaster() {
  const eventId = Number(confirmBtn.dataset.eventId);
  if (!eventId) return;

  confirmBtn.disabled = true;
  const t = toast("Confirming…", `confirmDisaster(${eventId})`, "pending");

  try {
    const tx = await vigilant.connect(signer).confirmDisaster(eventId);
    await tx.wait();
    t.remove();
    toast("Confirmed!", "Your confirmation has been recorded on-chain", "success");
    await Promise.all([refreshValidatorPanel(), refreshPoolStats()]);
  } catch (err) {
    t.remove();
    toast("Confirmation failed", extractError(err), "error");
    confirmBtn.disabled = false;
  }
}

// ── Admin: Oracle Request ─────────────────────────────────────────────────────
async function handleOracleRequest() {
  oracleBtn.disabled = true;
  const t = toast("Requesting oracle data…", `requestDisasterData(${currentCountry}) — costs 0.1 LINK`, "pending");

  try {
    const tx = await vigilant.connect(signer).requestDisasterData(currentCountry);
    await tx.wait();
    t.remove();
    toast("Oracle request sent!", "Chainlink is fetching GDACS data — DisasterReported event will appear in the feed in 1–3 minutes.", "success");
    await refreshPoolStats();
  } catch (err) {
    t.remove();
    toast("Oracle request failed", extractError(err), "error");
  }
  oracleBtn.disabled = false;
}

// ── Admin: Simulate Disaster ──────────────────────────────────────────────────
async function handleSimulate() {
  const severity = Number(simulateSeverity.value);
  simulateBtn.disabled = true;
  const t = toast("Simulating disaster…", `simulateDisaster(${currentCountry}, ${severity})`, "pending");

  try {
    const tx = await vigilant.connect(signer).simulateDisaster(currentCountry, severity);
    await tx.wait();
    t.remove();
    toast("Disaster simulated!", "PENDING event created — validators can now confirm", "success");
    await Promise.all([refreshPoolStats(), refreshValidatorPanel()]);
  } catch (err) {
    t.remove();
    toast("Simulation failed", extractError(err), "error");
  }
  simulateBtn.disabled = false;
}

// ── Admin: Return Expired ─────────────────────────────────────────────────────
async function handleReturn() {
  const addr = returnAddress.value.trim();
  if (!ethers.isAddress(addr)) {
    toast("Invalid address", "Enter a valid contributor wallet address", "error");
    return;
  }
  returnBtn.disabled = true;
  const t = toast("Returning funds…", `returnExpired(${fmtAddress(addr)})`, "pending");

  try {
    const tx = await vigilant.connect(signer).returnExpired(addr);
    await tx.wait();
    t.remove();
    toast("Funds returned!", `USDC returned to ${fmtAddress(addr)}`, "success");
    returnAddress.value = "";
    await Promise.all([refreshPoolStats(), refreshContributorPanel()]);
  } catch (err) {
    t.remove();
    toast("Return failed", extractError(err), "error");
  }
  returnBtn.disabled = false;
}

// ── Feed ──────────────────────────────────────────────────────────────────────
const EVENT_CONFIG = {
  Deposited:         { icon: "💵", cls: "deposited",  label: "Deposit" },
  DisasterReported:  { icon: "⚠️",  cls: "disaster",   label: "Disaster Reported" },
  ValidatorConfirmed:{ icon: "✅", cls: "confirmed",  label: "Validator Confirmed" },
  NGOFunded:         { icon: "🏥", cls: "funded",     label: "NGO Funded" },
  FundsReturned:     { icon: "↩️",  cls: "returned",   label: "Funds Returned" },
};

function formatEventDetail(name, args) {
  try {
    switch (name) {
      case "Deposited":
        return `${fmt(args.netAmount)} → ${countryFlag(Number(args.countryCode))} ${countryName(Number(args.countryCode))} pool · from ${fmtAddress(args.contributor)}`;
      case "DisasterReported":
        return `Event #${args.eventId} · ${countryFlag(Number(args.countryCode))} ${countryName(Number(args.countryCode))} · Severity ${Number(args.severity) === 2 ? "🔴 Red" : "🟠 Orange"}`;
      case "ValidatorConfirmed":
        return `Event #${args.eventId} · ${fmtAddress(args.validator)} confirmed · ${args.confirmationCount}/3`;
      case "NGOFunded":
        return `${fmt(args.amount)} → ${fmtAddress(args.ngoWallet)} · Event #${args.eventId}`;
      case "FundsReturned":
        return `${fmt(args.amount)} returned to ${fmtAddress(args.contributor)}`;
      default:
        return JSON.stringify(args);
    }
  } catch { return "—"; }
}

function addFeedItem(name, args, txHash, timestamp) {
  const cfg  = EVENT_CONFIG[name] || { icon: "📋", cls: "deposited", label: name };
  const time = timestamp ? new Date(Number(timestamp) * 1000).toLocaleTimeString("en-SG") : "—";
  const detail = formatEventDetail(name, args);
  const txUrl = txHash ? `${CONFIG.BLOCK_EXPLORER}/tx/${txHash}` : null;

  // Remove empty state
  const empty = activityFeed.querySelector(".feed-empty");
  if (empty) empty.remove();

  const el = document.createElement("div");
  el.className = "feed-item";
  el.innerHTML = `
    <div class="feed-item-icon ${cfg.cls}">${cfg.icon}</div>
    <div class="feed-item-body">
      <div class="feed-item-title">${cfg.label}</div>
      <div class="feed-item-detail">${detail}</div>
    </div>
    <div class="feed-item-meta">
      <div class="feed-item-time">${time}</div>
      ${txUrl ? `<a class="feed-item-link" href="${txUrl}" target="_blank" rel="noopener">Etherscan ↗</a>` : ""}
    </div>
  `;
  activityFeed.prepend(el);
}

function startFeedListeners() {
  if (!vigilant || feedListening) return;
  feedListening = true;
  feedStatus.textContent = "Listening";
  feedStatus.className = "feed-status listening";

  const eventNames = Object.keys(EVENT_CONFIG);
  eventNames.forEach(name => {
    vigilant.on(name, async (...argsAndEvent) => {
      const event = argsAndEvent[argsAndEvent.length - 1];
      const args  = event.args || {};
      const txHash = event.log?.transactionHash || event.transactionHash;
      const block  = await provider.getBlock(event.log?.blockNumber || event.blockNumber).catch(() => null);
      addFeedItem(name, args, txHash, block?.timestamp);
      // Refresh panels on key events
      if (name === "DisasterReported") await refreshValidatorPanel();
      if (name === "ValidatorConfirmed" || name === "NGOFunded") {
        await Promise.all([refreshValidatorPanel(), refreshPoolStats()]);
      }
      if (name === "Deposited") await refreshContributorPanel();
    });
  });
}

async function loadFeedHistory() {
  if (!vigilant) return;
  if (feedHistoryLoaded) return;
  feedHistoryLoaded = true;
  feedStatus.textContent = "Loading…";
  feedStatus.className = "feed-status";
  try {
    const latest = await provider.getBlockNumber();
    const from   = Math.max(0, latest - CONFIG.FEED_BLOCK_RANGE);

    const eventNames = Object.keys(EVENT_CONFIG);
    const allLogs = [];

    for (const name of eventNames) {
      try {
        const filter = vigilant.filters[name]();
        const logs = await vigilant.queryFilter(filter, from, latest);
        logs.forEach(log => allLogs.push({ name, log }));
      } catch { /* event may not have fired yet */ }
    }

    // Sort by block number ascending, then prepend newest-first
    allLogs.sort((a, b) => a.log.blockNumber - b.log.blockNumber);

    for (const { name, log } of allLogs) {
      addFeedItem(name, log.args || {}, log.transactionHash, null);
    }

    feedStatus.textContent = "Listening";
    feedStatus.className = "feed-status listening";
  } catch (err) {
    console.error("loadFeedHistory:", err);
    feedStatus.textContent = "Error";
    feedStatus.className = "feed-status error";
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
connectBtn.addEventListener("click", () => connectWallet().catch(console.error));
switchNetworkBtn?.addEventListener("click", () => switchNetwork().catch(console.error));
depositBtn.addEventListener("click", () => handleDeposit().catch(console.error));
confirmBtn.addEventListener("click", () => handleConfirmDisaster().catch(console.error));
oracleBtn?.addEventListener("click", () => handleOracleRequest().catch(console.error));
simulateBtn?.addEventListener("click", () => handleSimulate().catch(console.error));
returnBtn?.addEventListener("click", () => handleReturn().catch(console.error));

refreshFeedBtn?.addEventListener("click", () => loadFeedHistory().catch(console.error));
clearFeedBtn?.addEventListener("click", () => {
  activityFeed.innerHTML = `<div class="feed-empty"><div class="feed-empty-icon">📋</div><div>Feed cleared</div></div>`;
  feedStatus.textContent = "Cleared";
});

// Deposit fee hint — live update
depositAmount.addEventListener("input", () => {
  const val = parseFloat(depositAmount.value);
  if (val >= CONFIG.MIN_DEPOSIT_USDC) {
    const fee = (val * CONFIG.PLATFORM_FEE_PCT / 100).toFixed(2);
    const net = (val - parseFloat(fee)).toFixed(2);
    document.getElementById("depositFeeHint").textContent =
      `5% platform fee: ${fee} USDC — ${net} USDC enters the pool`;
  } else {
    document.getElementById("depositFeeHint").textContent =
      `5% platform fee applies — e.g. 10 USDC deposited = 9.50 USDC in pool`;
  }
});

// MetaMask account / chain changes
if (window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts) => {
    if (!accounts.length) {
      location.reload();
    } else {
      connectWallet().catch(console.error);
    }
  });
  window.ethereum.on("chainChanged", () => {
    location.reload();
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
buildStaticUI();

// Show pool stats for ALL countries without requiring wallet connection
if (CONFIG.VIGILANT_CONTRACT && !CONFIG.VIGILANT_CONTRACT.includes("FILL")) {
  const readProvider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
  const readContract = new ethers.Contract(CONFIG.VIGILANT_CONTRACT, VIGILANT_ABI, readProvider);

  // Load balance for current selected country (default: Japan)
  readContract.getPoolBalance(currentCountry)
    .then(b => { if (poolBalance) poolBalance.textContent = fmt(b); })
    .catch(() => {});

  // Re-fetch whenever country selector changes before wallet connects
  document.querySelectorAll(".country-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!vigilant) { // only use read-only provider if wallet not connected
        readContract.getPoolBalance(currentCountry)
          .then(b => { if (poolBalance) poolBalance.textContent = fmt(b); })
          .catch(() => {});
      }
    });
  });
}