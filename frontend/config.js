// ─────────────────────────────────────────────────────────────────────────────
//  vigilAnt — config.js
//  Single source for  all addresses, chain info, and constants.
//  Person C owns this file. Update VIGILANT_CONTRACT after Person A deploys.
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG = {

  // ── Network ──────────────────────────────────────────────────────────────
  CHAIN_ID:   11155111,
  CHAIN_NAME: "Ethereum Sepolia",
  RPC_URLS:   ["https://rpc.sepolia.org"],
  BLOCK_EXPLORER: "https://sepolia.etherscan.io",
  NATIVE_CURRENCY: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },

  // ── Contracts ─────────────────────────────────────────────────────────────
  // ⚠️  Fill VIGILANT_CONTRACT after Person A deploys — update here + notify team
  VIGILANT_CONTRACT: "0xC7E948D515d3a501033728469F728680D1dFB37A",
  USDC_ADDRESS:      "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // DO NOT CHANGE

  // ── USDC ──────────────────────────────────────────────────────────────────
  // ⚠️  USDC uses 6 decimals NOT 18. Always multiply display amounts by USDC_UNIT.
  //     e.g.  const raw = inputValue * CONFIG.USDC_UNIT
  USDC_DECIMALS: 6,
  USDC_UNIT:     1_000_000,

  // ── Countries ─────────────────────────────────────────────────────────────
  COUNTRIES: {
    1: { name: "Japan",       flag: "🇯🇵", gdacs: "JPN", short: "JP" },
    2: { name: "Thailand",    flag: "🇹🇭", gdacs: "THA", short: "TH" },
    3: { name: "Philippines", flag: "🇵🇭", gdacs: "PHL", short: "PH" },
    4: { name: "Indonesia",   flag: "🇮🇩", gdacs: "IDN", short: "ID" },
    5: { name: "Vietnam",     flag: "🇻🇳", gdacs: "VNM", short: "VN" },
  },

  // ── Deposit Options ───────────────────────────────────────────────────────
  DURATIONS: [
    { label: "1 Month",  value: 0, seconds: 30 * 24 * 60 * 60 },
    { label: "3 Months", value: 1, seconds: 90 * 24 * 60 * 60 },
    { label: "6 Months", value: 2, seconds: 180 * 24 * 60 * 60 },
  ],
  MIN_DEPOSIT_USDC: 10,   // display only — contract enforces 10 * 1e6
  PLATFORM_FEE_PCT: 5,    // for UI disclosure only

  // ── Feed ──────────────────────────────────────────────────────────────────
  FEED_BLOCK_RANGE: 1000, // how far back to scan for past events on load
};

// ── Minimal ABIs ─────────────────────────────────────────────────────────────
// Only the functions and events actually used by the frontend.
// Full ABI lives in the compiled artifacts — these are trimmed for bundle size.

export const VIGILANT_ABI = [
  // Write — Contributor
  "function deposit(uint8 countryCode, uint256 amount, uint8 duration) external",

  // Write — Admin
  "function requestDisasterData(uint8 countryCode) external",
  "function simulateDisaster(uint8 countryCode, uint8 severity) external",
  "function returnExpired(address contributorAddress) external",

  // Write — Validator
  "function confirmDisaster(uint256 eventId) external",

  // Read
  "function getContribution(address contributor) external view returns (tuple(address contributor, uint8 countryCode, uint256 amount, uint256 expiry, bool returned))",
  "function getPoolBalance(uint8 countryCode) external view returns (uint256)",
  "function getDisasterEvent(uint256 eventId) external view returns (tuple(uint8 countryCode, uint8 severity, string gdacsEventId, uint256 reportedAt, uint8 confirmations, uint8 status))",
  "function getConfirmationCount(uint256 eventId) external view returns (uint8)",
  "function hasConfirmed(uint256 eventId, address validator) external view returns (bool)",
  "function isValidator(address account) external view returns (bool)",
  "function getLatestEvent(uint8 countryCode) external view returns (uint256)",
  "function getNGOs(uint8 countryCode) external view returns (tuple(address wallet, uint256 minAmount, uint8 countryCode)[])",
  "function owner() external view returns (address)",
  "function validators(uint256 index) external view returns (address)",

  // Events — transparency dashboard
  "event Deposited(address indexed contributor, uint8 indexed countryCode, uint256 netAmount, uint256 expiry)",
  "event DisasterReported(uint256 indexed eventId, uint8 indexed countryCode, uint8 severity, uint256 timestamp)",
  "event ValidatorConfirmed(uint256 indexed eventId, address indexed validator, uint8 confirmationCount)",
  "event NGOFunded(address indexed ngoWallet, uint8 indexed countryCode, uint256 amount, uint256 eventId)",
  "event FundsReturned(address indexed contributor, uint256 amount, uint8 countryCode)",
];

export const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];