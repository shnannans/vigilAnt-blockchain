// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@chainlink/contracts/src/v0.8/operatorforwarder/Operator.sol";

contract OperatorHarness is Operator {
    constructor(address link, address owner) Operator(link, owner) {}
}
