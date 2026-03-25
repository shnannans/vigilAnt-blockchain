# vigilAnt — Chainlink Job Spec

## Oracle Details
- Network: Ethereum Sepolia
- Oracle contract: 0x6090149792dAAeE9D1D568c9f9a6F6B46AA29eFD
- Job ID: 7da2702f37fd48e5b1b9a5715e3509b6
- Fee per request: 0.1 LINK

## Job Type
Get > Bytes32 — HTTP GET request returning a bytes32 field

## Endpoint
- URL: https://gist.githubusercontent.com/Hgowj/8f26ad2fda6590653f64dac4993fdced/raw/...
- Field: alertlevel
- Demo note: endpoint returns controlled JSON simulating a GDACS Red alert.
  Production would point to live GDACS API with a JSON adapter.

## Response
{"alertlevel": "Red", "country": "THA", "eventtype": "FL"}

## Contract integration
- requestDisasterData() sends the Chainlink request (costs 0.1 LINK)
- fulfill() receives the bytes32 alertlevel callback
- If "Red" or "Orange" → creates PENDING DisasterEvent
