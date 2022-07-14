// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "../oldContracts/contracts/Governance360.sol";

contract TestGovernance is Governance {
    constructor(address payable _tellor, address _teamMultisig) Governance(_tellor, _teamMultisig) {}

    fallback() external payable {}
    receive() external payable {}
}