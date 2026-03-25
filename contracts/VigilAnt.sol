// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

// ─────────────────────────────────────────────────────────────────────────────
//  IMPORTS
//  Chainlink: npm install @chainlink/contracts
//  Note: OpenZeppelin Ownable is NOT imported — ChainlinkClient already inherits
//  ConfirmedOwner which provides onlyOwner. Importing both causes a compile-time
//  ownership conflict. ConfirmedOwner is the single source of ownership here.
// ─────────────────────────────────────────────────────────────────────────────
import "@chainlink/contracts/src/v0.8/operatorforwarder/ChainlinkClient.sol";
import "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";

// ─────────────────────────────────────────────────────────────────────────────
//  IERC20 — minimal interface for USDC
//  Only the two functions we actually call: transferFrom and transfer
// ─────────────────────────────────────────────────────────────────────────────
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// ─────────────────────────────────────────────────────────────────────────────
//
//  ██╗   ██╗██╗ ██████╗ ██╗██╗      █████╗ ███╗   ██╗████████╗
//  ██║   ██║██║██╔════╝ ██║██║     ██╔══██╗████╗  ██║╚══██╔══╝
//  ██║   ██║██║██║  ███╗██║██║     ███████║██╔██╗ ██║   ██║
//  ╚██╗ ██╔╝██║██║   ██║██║██║     ██╔══██║██║╚██╗██║   ██║
//   ╚████╔╝ ██║╚██████╔╝██║███████╗██║  ██║██║ ╚████║   ██║
//    ╚═══╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝
//
//  Parametric disaster relief fund for Southeast/East Asia.
//  Contributors deposit USDC into country pools. When a Chainlink oracle
//  reports a verified disaster and 3-of-5 validators confirm, USDC is
//  automatically transferred to the registered NGO — no human can block or
//  fake a payout.
//
//  Network:   Ethereum Sepolia testnet
//  USDC:      0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238  (Circle official, Sepolia)
//  LINK:      0x779877A7B0D9E8603169DdbD7836e478b4624789  (Sepolia)
//
// ─────────────────────────────────────────────────────────────────────────────
// ConfirmedOwner (from Chainlink) provides onlyOwner and owner() — same API as OZ Ownable.
// Do NOT add OpenZeppelin Ownable here — ChainlinkClient already inherits ConfirmedOwner
// and the two ownership contracts conflict at compile time.
contract VigilAnt is ChainlinkClient, ConfirmedOwner {

    using Chainlink for Chainlink.Request;

    // ─────────────────────────────────────────────────────────────────────────
    //  CONSTANTS
    //  ⚠️  USDC uses 6 decimals, NOT 18.
    //      10 USDC  = 10_000_000
    //      100 USDC = 100_000_000
    //  Always multiply display amounts by USDC_DECIMALS before any contract call.
    // ─────────────────────────────────────────────────────────────────────────
    uint256 public constant USDC_DECIMALS   = 1e6;              // 6 decimals
    uint256 public constant MIN_DEPOSIT     = 10 * 1e6;         // 10 USDC minimum
    uint256 public constant PLATFORM_FEE    = 5;                // 5% fee at deposit
    uint256 public constant PAYOUT_PERCENT  = 40;               // 40% of pool per event
    uint8   public constant THRESHOLD       = 3;                // confirmations to trigger payout
    uint8   public constant VALIDATOR_COUNT = 5;                // total registered validators

    // Duration options in seconds
    uint256 public constant ONE_MONTH    = 30 days;
    uint256 public constant THREE_MONTHS = 90 days;
    uint256 public constant SIX_MONTHS   = 180 days;

    // ─────────────────────────────────────────────────────────────────────────
    //  ENUMS
    // ─────────────────────────────────────────────────────────────────────────

    // Country codes: 1=Japan 2=Thailand 3=Philippines 4=Indonesia 5=Vietnam
    // NONE (0) is the invalid/unset default — always validate countryCode > 0 && <= 5
    enum CountryCode { NONE, JPN, THA, PHL, IDN, VNM }

    // Pool state per disaster event
    enum DisasterStatus { NONE, PENDING, EXECUTED }

    // Commitment duration options — maps to duration constants above
    // Frontend CONFIG.DURATIONS: [{ value: 0 }, { value: 1 }, { value: 2 }]
    enum Duration { ONE_MONTH, THREE_MONTHS, SIX_MONTHS }

    // ─────────────────────────────────────────────────────────────────────────
    //  STRUCTS
    // ─────────────────────────────────────────────────────────────────────────

    struct Contribution {
        address contributor;
        uint8   countryCode;  // 1–5
        uint256 amount;       // net USDC after 5% fee, in 6-decimal units
        uint256 expiry;       // block.timestamp + duration — when window closes
        bool    returned;     // true once returnExpired() has processed this contribution
    }

    struct DisasterEvent {
        uint8          countryCode;   // which country this event applies to
        uint8          severity;      // 1 = Orange, 2 = Red (from GDACS alert level)
        bytes32        gdacsEventId;  // GDACS event ID — bytes32 for gas efficiency (cheaper than string storage)
        uint256        reportedAt;    // block.timestamp when Chainlink fulfilled
        uint8          confirmations; // how many validators have confirmed so far
        DisasterStatus status;        // NONE → PENDING → EXECUTED
    }

    struct NGO {
        address wallet;     // wallet that receives USDC payout
        uint256 minAmount;  // minimum USDC to send (6-decimal units) — 50 USDC = 50_000_000
        uint8   countryCode;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  STATE VARIABLES
    // ─────────────────────────────────────────────────────────────────────────

    // USDC token contract
    IERC20 public immutable usdc;

    // Chainlink oracle config — Person B fills in oracle address + jobId at deploy time
    address private oracleAddress;
    bytes32 private jobId;
    uint256 private fee; // LINK fee per request (0.1 LINK = 0.1 * 1e18)

    // Tracks which country code a Chainlink requestId is for
    // Needed because fulfill() only receives requestId — we look up countryCode from this
    mapping(bytes32 => uint8) private requestCountry;

    // Validators — internal mapping for modifier, public view function wraps it
    mapping(address => bool) private isValidatorMap;
    // Gas optimization: changed from public to private.
    // The public array was redundant — isValidatorMap already handles all lookups,
    // and the frontend gets validator addresses from config.js not from the contract.
    // A public array forces Solidity to generate a getter + store in contract storage,
    // costing extra deployment gas for no benefit.
    // Frontend role detection still uses isValidator(address) — that is unchanged.
    address[5] private validators;

    // Contributions — keyed by contributor address
    // One active contribution per wallet at a time (can re-deposit after expiry)
    mapping(address => Contribution) public contributions;

    // Pool balances — keyed by countryCode (1–5)
    mapping(uint8 => uint256) public poolBalances;

    // Disaster events — keyed by auto-incrementing eventId
    mapping(uint256 => DisasterEvent) public disasterEvents;
    uint256 public nextEventId; // starts at 1 — 0 is treated as "no event"

    // Latest eventId per country — used by frontend getLatestEvent()
    mapping(uint8 => uint256) public latestEventByCountry;

    // Confirmation tracking — prevents double-confirming
    // hasConfirmedMap[eventId][validatorAddress] = true/false
    mapping(uint256 => mapping(address => bool)) public hasConfirmedMap;

    // NGO registry — up to 5 NGOs per country (one per country for POC)
    mapping(uint8 => NGO[]) private ngosByCountry;

    // Fee reserve address — receives the 5% platform fee on each deposit
    // For POC this can be the deployer address; set in constructor
    address public feeReserve;

    // ─────────────────────────────────────────────────────────────────────────
    //  EVENTS
    //  ⚠️  These names and parameter types are FIXED.
    //      The frontend transparency dashboard listens for all five.
    //      Do NOT rename or change parameter types without updating app.js.
    // ─────────────────────────────────────────────────────────────────────────

    event Deposited(
        address indexed contributor,
        uint8   indexed countryCode,
        uint256         netAmount,   // after 5% fee
        uint256         expiry
    );

    event DisasterReported(
        uint256 indexed eventId,
        uint8   indexed countryCode,
        uint8           severity,    // 1=Orange, 2=Red
        uint256         timestamp
    );

    event ValidatorConfirmed(
        uint256 indexed eventId,
        address indexed validator,
        uint8           confirmationCount  // running total after this confirmation
    );

    event NGOFunded(
        address indexed ngoWallet,
        uint8   indexed countryCode,
        uint256         amount,
        uint256         eventId
    );

    event FundsReturned(
        address indexed contributor,
        uint256         amount,
        uint8           countryCode
    );

    // ─────────────────────────────────────────────────────────────────────────
    //  MODIFIERS
    // ─────────────────────────────────────────────────────────────────────────

    // Guards confirmDisaster() — only registered validators can call it
    modifier onlyValidator() {
        require(isValidatorMap[msg.sender], "VigilAnt: not a validator");
        _;
    }

    // Validates that countryCode is in range 1–5 (NONE = 0 is invalid)
    modifier validCountry(uint8 countryCode) {
        require(countryCode >= 1 && countryCode <= 5, "VigilAnt: invalid country code");
        _;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  CONSTRUCTOR
    //
    //  ⚠️  BLOCKER: All addresses below must be collected BEFORE running deploy.js.
    //  Everyone DM their MetaMask address to the group chat for validators.
    //  Create 5 fresh wallets for NGOs — they must visibly receive USDC in the demo.
    //
    //  Parameters:
    //    _usdc        — 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238 (Sepolia USDC, Circle official)
    //    _validators  — array of 5 team MetaMask wallet addresses
    //    _ngos        — array of NGO wallet addresses, one per country in order [JPN,THA,PHL,IDN,VNM]
    //    _minAmounts  — minimum USDC payout per NGO in 6-decimal units (50 USDC = 50_000_000)
    //    _feeReserve  — address to receive the 5% platform fee (can be deployer wallet for POC)
    //    _linkToken   — 0x779877A7B0D9E8603169DdbD7836e478b4624789 (Sepolia LINK)
    //    _oracle      — Chainlink oracle contract address (Person B fills in from job-spec.md)
    //    _jobId       — Chainlink job ID as bytes32 (Person B fills in from job-spec.md)
    //    _fee         — LINK fee per request, typically 0.1 * 1e18 for Sepolia
    // ─────────────────────────────────────────────────────────────────────────
    constructor(
        address           _usdc,
        address[5] memory _validators,
        address[] memory  _ngos,
        uint256[] memory  _minAmounts,
        address           _feeReserve,
        address           _linkToken,
        address           _oracle,
        bytes32           _jobId,
        uint256           _fee
    ) ConfirmedOwner(msg.sender) {
        require(_usdc        != address(0), "VigilAnt: zero usdc address");
        require(_feeReserve  != address(0), "VigilAnt: zero fee reserve");
        require(_linkToken   != address(0), "VigilAnt: zero link address");
        require(_oracle      != address(0), "VigilAnt: zero oracle address");
        require(_ngos.length == _minAmounts.length, "VigilAnt: ngo/amount length mismatch");
        require(_ngos.length == 5, "VigilAnt: must provide exactly 5 NGOs (one per country)");

        usdc        = IERC20(_usdc);
        feeReserve  = _feeReserve;
        oracleAddress = _oracle;
        jobId       = _jobId;
        fee         = _fee;
        nextEventId = 1; // event IDs start at 1; 0 means "no event"

        // Register Chainlink token
        _setChainlinkToken(_linkToken);
        _setChainlinkOracle(_oracle);

        // Register validators
        for (uint8 i = 0; i < VALIDATOR_COUNT; i++) {
            require(_validators[i] != address(0), "VigilAnt: zero validator address");
            isValidatorMap[_validators[i]] = true;
            validators[i] = _validators[i];
        }

        // Register NGOs — countryCode 1=JPN, 2=THA, 3=PHL, 4=IDN, 5=VNM
        // _ngos[0] → JPN, _ngos[1] → THA, _ngos[2] → PHL, _ngos[3] → IDN, _ngos[4] → VNM
        for (uint8 i = 0; i < 5; i++) {
            require(_ngos[i] != address(0), "VigilAnt: zero NGO address");
            ngosByCountry[i + 1].push(NGO({
                wallet:      _ngos[i],
                minAmount:   _minAmounts[i],
                countryCode: i + 1
            }));
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  WRITE FUNCTIONS — CONTRIBUTOR
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice  Deposit USDC into a country's disaster relief pool.
     *
     * @dev     TWO transactions required from the frontend:
     *          TX 1: USDC.approve(contractAddress, amount)   ← on the USDC contract
     *          TX 2: pool.deposit(countryCode, amount, duration) ← this function
     *
     *          ⚠️  FRONTEND (Person C): approve the FULL `amount`, NOT netAmount.
     *              The contract pulls two separate transferFrom calls internally:
     *                transferFrom(msg.sender, contract,   netAmount)  ← pool deposit
     *                transferFrom(msg.sender, feeReserve, fee)        ← 5% fee
     *              Both come from the contributor's wallet. If you only approve
     *              netAmount, the second transferFrom (fee) will revert.
     *              Approval must cover: amount = netAmount + fee = the full input value.
     *
     *          The frontend must show "Step 1 of 2: Approving USDC spend…"
     *          then "Step 2 of 2: Depositing into pool…"
     *
     *          5% fee is taken immediately at deposit time:
     *            fee    = amount * 5 / 100
     *            net    = amount - fee
     *            net    → poolBalances[countryCode]
     *            fee    → feeReserve
     *
     * @param   countryCode  1=JPN 2=THA 3=PHL 4=IDN 5=VNM
     * @param   amount       USDC amount in 6-decimal units (100 USDC = 100_000_000)
     * @param   duration     0=ONE_MONTH  1=THREE_MONTHS  2=SIX_MONTHS
     */
    function deposit(
        uint8 countryCode,
        uint256 amount,
        uint8 duration
    ) external validCountry(countryCode) {
        require(amount >= MIN_DEPOSIT, "VigilAnt: below minimum deposit (10 USDC)");
        require(duration <= 2, "VigilAnt: invalid duration (use 0, 1, or 2)");
        require(
            contributions[msg.sender].amount == 0 || contributions[msg.sender].returned,
            "VigilAnt: active contribution exists - wait for expiry or payout"
        );

        // Calculate fee and net amount
        uint256 platformFee = (amount * PLATFORM_FEE) / 100;
        uint256 netAmount   = amount - platformFee;

        // Pull USDC from contributor (requires prior approve)
        require(usdc.transferFrom(msg.sender, address(this), netAmount), "VigilAnt: USDC transfer failed (net)");
        require(usdc.transferFrom(msg.sender, feeReserve, platformFee),  "VigilAnt: USDC transfer failed (fee)");

        // Calculate expiry timestamp
        uint256 durationSeconds;
        if (duration == 0) durationSeconds = ONE_MONTH;
        else if (duration == 1) durationSeconds = THREE_MONTHS;
        else durationSeconds = SIX_MONTHS;

        uint256 expiry = block.timestamp + durationSeconds;

        // Record contribution
        contributions[msg.sender] = Contribution({
            contributor: msg.sender,
            countryCode: countryCode,
            amount:      netAmount,
            expiry:      expiry,
            returned:    false
        });

        // Add to pool
        poolBalances[countryCode] += netAmount;

        emit Deposited(msg.sender, countryCode, netAmount, expiry);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  WRITE FUNCTIONS — ADMIN (onlyOwner)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice  Trigger a Chainlink Any API request to fetch GDACS disaster data
     *          for the given country.
     *
     * @dev     COSTS 0.1 LINK from the contract's LINK balance.
     *          ⚠️  Fund the contract with at least 5 LINK immediately after deployment.
     *              If contract has no LINK, this call fails silently — most common demo surprise.
     *              Faucet: https://faucets.chain.link/sepolia
     *
     *          In production: Chainlink Automation would call this on a 15-min schedule.
     *          For the POC: admin triggers manually for a controllable demo flow.
     *
     *          The Chainlink job (Person B's job-spec.md) must be configured to:
     *            - Fetch: https://www.gdacs.org/xml/rss.xml
     *            - Filter by ISO country code (JPN / THA / PHL / IDN / VNM)
     *            - Return alertLevel as bytes32 ("Red" or "Orange")
     *
     * @param   countryCode  1=JPN 2=THA 3=PHL 4=IDN 5=VNM
     */
    function requestDisasterData(uint8 countryCode)
        external
        onlyOwner
        validCountry(countryCode)
    {
        Chainlink.Request memory req = _buildChainlinkRequest(
            jobId,
            address(this),
            this.fulfill.selector
        );

        // ⚠️  PERSON B — CONFIRM THIS BEFORE FINALISING job-spec.md:
        // The ?country=THA query parameter is UNCONFIRMED. The GDACS RSS feed
        // (https://www.gdacs.org/xml/rss.xml) may not support country filtering
        // via query parameter and may return all global events instead.
        //
        // Two options:
        //   Option A (preferred): Verify that ?country=THA works by testing the URL
        //     directly in a browser. If it returns filtered results, the current code is correct.
        //   Option B (fallback): If the feed returns all events, remove the ?country= param
        //     and configure the Chainlink job to filter by country ISO code client-side
        //     (in the job spec's JSON parse/filter task) before returning the alert level.
        //
        // Update this comment once confirmed.
        // for demo purposes (countryISO removed — mock URL used directly)
        req._add("get", "https://gist.githubusercontent.com/Hgowj/8f26ad2fda6590653f64dac4993fdced/raw/f38ff4109fac488f39e3bf942b03c0f69764d6f7/gdacs-mock.json");

        // Path to extract alert level from the GDACS response
        // Person B: confirm this path matches your job spec's parsed JSON/XML structure
        req._add("path", "alertlevel");

        bytes32 requestId = _sendChainlinkRequestTo(oracleAddress, req, fee);

        // Store the mapping so fulfill() knows which country this request was for
        requestCountry[requestId] = countryCode;
    }

    /**
     * @notice  Chainlink oracle callback — called BY the Chainlink oracle contract, not externally.
     *
     * @dev     ⚠️  alertLevel is bytes32 — NOT string.
     *              The Chainlink job must use the ethabi encode task to return bytes32.
     *              Compare using: alertLevel == bytes32("Red")
     *              Person B: confirm the job output type matches before finalising job-spec.md.
     *
     *          If Red or Orange → creates a PENDING DisasterEvent → emits DisasterReported
     *          The frontend listens for DisasterReported to show the validator confirmation panel.
     *
     * @param   requestId   Chainlink request ID (used to look up countryCode)
     * @param   alertLevel  bytes32 encoded alert level from GDACS ("Red", "Orange", or other)
     */
    function fulfill(bytes32 requestId, bytes32 alertLevel)
        external
        recordChainlinkFulfillment(requestId)
    {
        uint8 countryCode = requestCountry[requestId];
        require(countryCode != 0, "VigilAnt: unknown requestId");

        bool isAlert = (alertLevel == bytes32("Red") || alertLevel == bytes32("Orange"));

        if (isAlert) {
            uint8 severity = (alertLevel == bytes32("Red")) ? 2 : 1;

            uint256 eventId = nextEventId++;

            disasterEvents[eventId] = DisasterEvent({
                countryCode:   countryCode,
                severity:      severity,
                gdacsEventId:  bytes32(0), // Person B: populate with encodeBytes32String(eventId) if job returns one
                reportedAt:    block.timestamp,
                confirmations: 0,
                status:        DisasterStatus.PENDING
            });

            latestEventByCountry[countryCode] = eventId;

            emit DisasterReported(eventId, countryCode, severity, block.timestamp);
        }

        // Clean up request mapping
        delete requestCountry[requestId];
    }

    /**
     * @notice  Validator confirms a pending disaster event.
     *
     * @dev     Each of the 5 registered validators calls this independently
     *          from their own wallet — 3 separate MetaMask transactions.
     *
     *          On the 3rd confirmation: _triggerPayout() fires automatically
     *          within the SAME transaction. No separate trigger needed.
     *
     *          Guards:
     *            - onlyValidator: msg.sender must be a registered validator
     *            - event must be in PENDING status
     *            - validator cannot confirm the same event twice
     *
     * @param   eventId  The event ID from the DisasterReported event
     */
    function confirmDisaster(uint256 eventId) external onlyValidator {
        DisasterEvent storage evt = disasterEvents[eventId];

        require(evt.status == DisasterStatus.PENDING, "VigilAnt: event not pending");
        require(!hasConfirmedMap[eventId][msg.sender], "VigilAnt: already confirmed");

        // Record this validator's confirmation
        hasConfirmedMap[eventId][msg.sender] = true;
        evt.confirmations++;

        emit ValidatorConfirmed(eventId, msg.sender, evt.confirmations);

        // Auto-trigger payout when threshold is reached
        if (evt.confirmations >= THRESHOLD) {
            _triggerPayout(eventId);
        }
    }

    /**
     * @notice  Return USDC to a contributor whose commitment window has expired
     *          without a disaster payout.
     *
     * @dev     POC design: admin-triggered (onlyOwner).
     *          Production design would be contributor self-service — noted as a
     *          trade-off in the report.
     *
     *          Guards:
     *            - contribution must exist and not already returned
     *            - block.timestamp must be past the contribution's expiry
     *
     *          ⚠️  Zeros contribution.amount BEFORE transferring (re-entrancy protection).
     *
     * @param   contributorAddress  The wallet address to refund
     */
    function returnExpired(address contributorAddress) external onlyOwner {
        Contribution storage c = contributions[contributorAddress];

        require(c.amount > 0,                        "VigilAnt: no active contribution");
        require(!c.returned,                          "VigilAnt: already returned");
        require(block.timestamp > c.expiry,           "VigilAnt: window still active");

        uint256 refundAmount = c.amount;
        uint8   countryCode  = c.countryCode;

        // Zero out before transfer (re-entrancy guard)
        c.amount   = 0;
        c.returned = true;

        // Remove from pool
        poolBalances[countryCode] -= refundAmount;

        // Return USDC to contributor
        require(usdc.transfer(contributorAddress, refundAmount), "VigilAnt: USDC return failed");

        emit FundsReturned(contributorAddress, refundAmount, countryCode);
    }

    /**
     * @notice  Testing fallback — creates a PENDING disaster event without Chainlink.
     *
     * @dev     Produces an identical result to what fulfill() would create.
     *          Use this if Chainlink fails on demo day — demo continues from
     *          the validator confirmation step (Step 8) unchanged.
     *
     *          Document in the report as a TESTING UTILITY, not a backdoor.
     *          In production this function would be removed.
     *
     * @param   countryCode  1=JPN 2=THA 3=PHL 4=IDN 5=VNM
     * @param   severity     1=Orange  2=Red
     */
    function simulateDisaster(uint8 countryCode, uint8 severity)
        external
        onlyOwner
        validCountry(countryCode)
    {
        require(severity == 1 || severity == 2, "VigilAnt: severity must be 1 (Orange) or 2 (Red)");

        uint256 eventId = nextEventId++;

        disasterEvents[eventId] = DisasterEvent({
            countryCode:   countryCode,
            severity:      severity,
            gdacsEventId:  bytes32("SIMULATED"),
            reportedAt:    block.timestamp,
            confirmations: 0,
            status:        DisasterStatus.PENDING
        });

        latestEventByCountry[countryCode] = eventId;

        emit DisasterReported(eventId, countryCode, severity, block.timestamp);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INTERNAL — PAYOUT EXECUTION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice  Auto-executes within the same transaction as the 3rd validator confirmation.
     *
     * @dev     Calculates 40% of the country's pool as available funds.
     *          Calls _payNGOs() to transfer USDC to the registered NGO.
     *          Marks the event as EXECUTED.
     *
     *          This function is INTERNAL — it is never called externally.
     *          It only fires when confirmDisaster() reaches THRESHOLD.
     *
     * @param   eventId  The disaster event to pay out against
     */
    function _triggerPayout(uint256 eventId) internal {
        DisasterEvent storage evt = disasterEvents[eventId];

        uint8   countryCode = evt.countryCode;
        uint256 pool        = poolBalances[countryCode];

        require(pool > 0, "VigilAnt: pool is empty");

        // 40% of pool available for this payout
        uint256 available = (pool * PAYOUT_PERCENT) / 100;

        // Mark event executed BEFORE transfers (re-entrancy protection)
        evt.status = DisasterStatus.EXECUTED;

        // Pay the NGO(s) registered for this country
        _payNGOs(countryCode, available, eventId);
    }

    /**
     * @notice  Transfers USDC to the registered NGO for the given country.
     *
     * @dev     POC: pays the first (and only) NGO in the list.
     *          Production would iterate a priority queue.
     *
     *          Sends the lesser of:
     *            - available funds (40% of pool)
     *            - NGO's minAmount
     *          This prevents overpaying a single NGO in a small pool.
     *
     * @param   countryCode  1–5
     * @param   available    USDC available for payout (6-decimal units)
     * @param   eventId      The originating disaster event ID (for the NGOFunded event)
     */
    function _payNGOs(uint8 countryCode, uint256 available, uint256 eventId) internal {
        NGO[] storage ngos = ngosByCountry[countryCode];
        require(ngos.length > 0, "VigilAnt: no NGOs registered for this country");

        // POC: pay first NGO in list only
        NGO storage ngo = ngos[0];

        // Send the lower of: available funds or NGO's configured minimum
        uint256 toSend = available < ngo.minAmount ? available : ngo.minAmount;
        require(toSend > 0, "VigilAnt: payout amount is zero");

        // Deduct from pool BEFORE transfer
        poolBalances[countryCode] -= toSend;

        require(usdc.transfer(ngo.wallet, toSend), "VigilAnt: NGO USDC transfer failed");

        emit NGOFunded(ngo.wallet, countryCode, toSend, eventId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  READ FUNCTIONS — free, no gas
    //  These are the calls the frontend makes on wallet connect and page load.
    //  All return types match Section 4 of the SPEC exactly.
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice  Get a contributor's full contribution record.
     *          Frontend: getContribution(address).amount ÷ CONFIG.USDC_UNIT
     */
    function getContribution(address contributor)
        external view returns (Contribution memory)
    {
        return contributions[contributor];
    }

    /**
     * @notice  Get the current USDC pool balance for a country.
     *          Frontend: getPoolBalance(countryCode) — called on country dropdown change.
     */
    function getPoolBalance(uint8 countryCode)
        external view returns (uint256)
    {
        return poolBalances[countryCode];
    }

    /**
     * @notice  Get the full DisasterEvent struct by eventId.
     *          Frontend: getDisasterEvent(eventId) after getLatestEvent().
     */
    function getDisasterEvent(uint256 eventId)
        external view returns (DisasterEvent memory)
    {
        return disasterEvents[eventId];
    }

    /**
     * @notice  Get the number of validator confirmations for an event.
     *          Frontend: getConfirmationCount(eventId) shown as "2 / 3" in validator panel.
     */
    function getConfirmationCount(uint256 eventId)
        external view returns (uint8)
    {
        return disasterEvents[eventId].confirmations;
    }

    /**
     * @notice  Check if a specific validator has confirmed a specific event.
     *          Frontend: hasConfirmed(eventId, addr) shown per-validator in the panel.
     */
    function hasConfirmed(uint256 eventId, address validator)
        external view returns (bool)
    {
        return hasConfirmedMap[eventId][validator];
    }

    /**
     * @notice  Check if an address is a registered validator.
     *          Frontend: called on wallet connect to decide which panel to show.
     *          If true → show validator panel. If false → show contributor panel.
     */
    function isValidator(address account)
        external view returns (bool)
    {
        return isValidatorMap[account];
    }

    /**
     * @notice  Get the most recent eventId for a given country.
     *          Frontend: getLatestEvent(countryCode) → then getDisasterEvent(eventId).
     *          Returns 0 if no event has been reported for that country.
     *
     * @dev     Note: validator panel shows events for the currently selected country
     *          in the shared dropdown. Validator must select the correct country.
     */
    function getLatestEvent(uint8 countryCode)
        external view returns (uint256)
    {
        return latestEventByCountry[countryCode];
    }

    /**
     * @notice  Get all NGOs registered for a country.
     *          Frontend: can use this to display the NGO wallet in the transparency dashboard.
     */
    function getNGOs(uint8 countryCode)
        external view returns (NGO[] memory)
    {
        return ngosByCountry[countryCode];
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ADMIN UTILITIES
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice  Update oracle address and jobId after deployment if needed.
     *          Person B: use this if you need to update the oracle config post-deploy.
     */
    function updateOracleConfig(
        address _oracle,
        bytes32 _jobId,
        uint256 _fee
    ) external onlyOwner {
        require(_oracle != address(0), "VigilAnt: zero oracle address");
        oracleAddress = _oracle;
        jobId = _jobId;
        fee   = _fee;
        _setChainlinkOracle(_oracle);
    }

    /**
     * @notice  Withdraw any LINK remaining in the contract after the project.
     *          Prevents LINK from being locked forever.
     */
    function withdrawLink() external onlyOwner {
        LinkTokenInterface link = LinkTokenInterface(_chainlinkTokenAddress());
        require(link.transfer(owner(), link.balanceOf(address(this))), "VigilAnt: LINK withdrawal failed");
    }

    /**
     * @notice  Emergency: withdraw USDC to owner if something goes wrong.
     *          Include in report's security section — explains the trust trade-off.
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = usdc.balanceOf(address(this));
        require(balance > 0, "VigilAnt: nothing to withdraw");
        require(usdc.transfer(owner(), balance), "VigilAnt: emergency withdrawal failed");
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  INTERNAL HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice  Maps a uint8 countryCode to its ISO 3166-1 alpha-3 string.
     *          Used by requestDisasterData() to build the GDACS URL.
     */
    function _countryISO(uint8 countryCode) internal pure returns (string memory) {
        if (countryCode == 1) return "JPN";
        if (countryCode == 2) return "THA";
        if (countryCode == 3) return "PHL";
        if (countryCode == 4) return "IDN";
        if (countryCode == 5) return "VNM";
        revert("VigilAnt: invalid country code");
    }
}