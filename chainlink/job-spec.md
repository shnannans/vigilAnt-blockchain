# vigilAnt Chainlink Any API Job Spec (Section B)

This file is the single handoff document for Person B.
Fill the placeholders, configure the node job, then give Person A the final values to paste into `scripts/deploy.js`.

---

## 1) Contract + Network Targets (fixed)

- Network: `Ethereum Sepolia` (chainId `11155111`)
- VigilAnt callback contract function:
  - `fulfill(bytes32 requestId, bytes32 alertLevel)`
- LINK token (Sepolia): `0x779877A7B0D9E8603169DdbD7836e478b4624789`
- USDC token (Sepolia): `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`
- Demo data source (mock JSON): `https://gist.githubusercontent.com/Hgowj/8f26ad2fda6590653f64dac4993fdced/raw/f38ff4109fac488f39e3bf942b03c0f69764d6f7/gdacs-mock.json`
- Production data source (GDACS RSS): `https://www.gdacs.org/xml/rss.xml` (not currently used by this repo’s `requestDisasterData()`)

Important contract expectation:
- `alertLevel` must be ABI-encoded to `bytes32` and match:
  - `bytes32("Red")` or
  - `bytes32("Orange")`
- Any other value is treated as no-alert and does not create a pending event.

---

## 2) Values Person B must fill

Fill these after creating the Chainlink job:

- `ORACLE_ADDRESS`: `0x2aF65748a2333482733B94E7EF958692Fc78c948`
- `JOB_ID_STRING`: `9f0e2f67-2d7f-4b84-bb7d-9e1a4e7d6c31`
- `LINK_FEE`: `0.1 LINK` (default in this repo) or `____ LINK` if node requires different

Also record:
- Chainlink node URL/dashboard: `http://localhost:6688/`
- External adapter used (if any): `none (job reads mock JSON directly via http + jsonparse)`

---

## 3) Required updates in repo (exact)

### A) Update `scripts/deploy.js`

Replace:

- `const ORACLE_ADDRESS = "0x_FILL_IN_ORACLE_ADDRESS";`
- `const JOB_ID_STRING  = "FILL_IN_JOB_ID";`

With real values from your node.

Keep (unless you intentionally changed node fee):

- `const LINK_FEE = ethers.parseUnits("0.1", 18);`

### B) Keep constructor format unchanged

`deploy.js` already converts job ID string to bytes32:

- UUID / 16-byte hex / bytes32 formats are all supported (see `scripts/deploy.js`).

No code change needed there as long as `.env` and the node job match.

---

## 4) Job behavior requirements

The node job must:

1. Fetch the URL provided by the request (`get`), which in this repo is the mock JSON endpoint.
2. Extract the alert level field (`alertlevel`) as a string.
4. Return one of:
   - `"Red"`
   - `"Orange"`
   - anything else for no alert
5. ABI-encode result so callback receives `bytes32`.

Contract side mapping:

- `"Red"` -> severity `2`
- `"Orange"` -> severity `1`
- others -> ignored

---

## 5) Endpoint/filter decision (must verify)

Current Solidity call builds URL as:

- Demo (current): `https://gist.githubusercontent.com/.../gdacs-mock.json` (no filtering; deterministic)
- Production (future): `https://www.gdacs.org/xml/rss.xml?country=<ISO>` (needs verification)

You must test if this query param truly filters.

### Test decision table

- If URL filtering works reliably:
  - Keep as-is in contract.
- If not reliable:
  - Keep URL as base RSS (`/xml/rss.xml`) and perform country filtering in the job pipeline.

Record outcome:

- URL filter works? `N/A for demo (mock JSON used). Not yet verified for production GDACS RSS.`
- Evidence link or notes: `Mock endpoint returns {"alertlevel":"Red", ...} and is used for demo stability.`

---

## 6) Pipeline template (implementation-ready)

Use this as a functional template. Adapt exact task names to your node version.

```toml
# Chainlink Any API job (template)
type            = "directrequest"
schemaVersion   = 1
name            = "vigilant-gdacs-alert"
maxTaskDuration = "0s"
contractAddress = "0x<ORACLE_ADDRESS>"
evmChainID      = "11155111"
externalJobID   = "<JOB_ID_UUID>"
observationSource = """
    decode_log [type=ethabidecodelog
                data="$(jobRun.logData)"
                topics="$(jobRun.logTopics)"
                abi="OracleRequest(bytes32 indexed specId,address requester,bytes32 requestId,uint256 payment,address callbackAddr,bytes4 callbackFunctionId,uint256 cancelExpiration,uint256 dataVersion,bytes data)"]

    decode_cbor [type=cborparse data="$(decode_log.data)"]

    fetch [type=http method=GET url="$(decode_cbor.get)"]
    parse [type=jsonparse path="$(decode_cbor.path)" data="$(fetch)"]

    # Ensure exact case: Red / Orange / None
    normalize [type=lowercase input="$(parse)"]
    map_alert [type=conditional input="$(normalize)" cases='{"red":"Red","orange":"Orange"}' default="None"]

    # ABI encode bytes32 payload passed to VigilAnt.fulfill(requestId, alertLevel)
    encode_data [type=ethabiencode abi="(bytes32 requestId,bytes32 alertLevel)"
                 data="{\\"requestId\\": $(decode_log.requestId), \\"alertLevel\\": $(map_alert)}"]

    # Operator/Oracle expects fulfillOracleRequest2(requestId,payment,callbackAddress,callbackFunctionId,expiration,data)
    encode_tx [type=ethabiencode
               abi="fulfillOracleRequest2(bytes32 requestId,uint256 payment,address callbackAddress,bytes4 callbackFunctionId,uint256 expiration,bytes data)"
               data="{\\"requestId\\": $(decode_log.requestId), \\"payment\\": $(decode_log.payment), \\"callbackAddress\\": $(decode_log.callbackAddr), \\"callbackFunctionId\\": $(decode_log.callbackFunctionId), \\"expiration\\": $(decode_log.cancelExpiration), \\"data\\": $(encode_data)}"]

    submit [type=ethtx to="0x<ORACLE_ADDRESS>" data="$(encode_tx)"]

    decode_log -> decode_cbor -> fetch -> parse -> normalize -> map_alert -> encode_data -> encode_tx -> submit
"""
```

Notes:

- If your node cannot parse XML directly, use an adapter or intermediary parse step.
- Keep output string exactly `Red` or `Orange` before encoding.
- Do not return lowercase `red`/`orange` to the contract unless your map step converts it.

---

## 7) Validation procedure (exact test runbook)

Run these checks in order after deployment + LINK funding.

### Preconditions

- VigilAnt deployed on Sepolia.
- Contract funded with at least `5 LINK`.
- `owner()` wallet available in MetaMask.
- `ORACLE_ADDRESS` and `JOB_ID_STRING` in `deploy.js` are real.

### Step-by-step

1. From admin wallet, call:
   - `requestDisasterData(2)` for Thailand
2. Confirm OracleRequest/Job run appears in node dashboard.
3. Confirm callback tx hits VigilAnt `fulfill`.
4. Read contract:
   - `getLatestEvent(2)`
   - if `> 0`, read `getDisasterEvent(eventId)`
5. Verify:
   - `status == PENDING` (`1`)
   - `severity == 1` for Orange or `2` for Red
6. Check emitted event:
   - `DisasterReported(eventId, countryCode, severity, timestamp)`

### Negative case

Run with a country/time where no Red/Orange applies:

- callback should not create a new pending event.
- `getLatestEvent(country)` should remain unchanged.

---

## 8) Final handoff to Person A

When validation passes, send Person A exactly this:

- Oracle address: `0x2aF65748a2333482733B94E7EF958692Fc78c948`
- Job ID string: `9f0e2f67-2d7f-4b84-bb7d-9e1a4e7d6c31`
- LINK fee in LINK: `0.1`
- Confirmation that output is bytes32-compatible with `fulfill(bytes32,bytes32)`: `YES (bytes32("Red") / bytes32("Orange"))`
- One successful callback tx hash: `N/A (fill after first successful run for the target VigilAnt deployment)`

---

## 9) Known caveats for this repo

- `scripts/deploy.js` intentionally aborts if placeholders remain.
- If contract has no LINK, oracle requests fail operationally (no useful demo output).
- Contract currently stores `gdacsEventId` as `bytes32(0)` in `fulfill`; this does not block Section B, but event ID population is a future enhancement.
