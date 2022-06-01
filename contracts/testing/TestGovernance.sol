// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "contracts/oldContracts/contracts/interfaces/ITellor.sol";

contract TestGovernance {

    /**
     * @dev Changes Governance contract to a new address
     * Note: this function is only callable by the Governance contract.
     * @param _newGovernance is the address of the new Governance contract
     */
    function changeGovernanceContract(address _newGovernance) external {

        ITellor.changeGovernanceContract(_newGovernance);
    }

    /**
     * @dev Used during the upgrade process to verify valid Tellor Contracts
     */
    function verify() external pure returns (uint256) {
        return 9999;
    }

    //allows team to gain control of any tokens sent directly to this contract (and send them back))
    //be sure to test we can't just print tokens
    function transferOutOfContract() external{
        _doTransfer(address(this),addresses[_OWNER],balanceOf(address(this)));
    }

}