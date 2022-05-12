// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "./BaseToken.sol";

contract Tellor360 is BaseToken{



    constructor(address _flexAddress) {
        //mint a few people some tokens (those locked)

        //on switch over, require tellorFlex values are over 12 hours old
        //then when we switch, the governance switch can be instantaneous
        
        //no need for the dispute transistion
    }


    /**
     * @dev Changes Governance contract to a new address
     * Note: this function is only callable by the Governance contract.
     * @param _newGovernance is the address of the new Governance contract
     */
    function changeGovernanceContract(address _newGovernance) external {
        require(
            msg.sender == addresses[_GOVERNANCE_CONTRACT],
            "Only the Governance contract can change the Governance contract address"
        );
        require(_isValid(_newGovernance));
        addresses[_GOVERNANCE_CONTRACT] = _newGovernance;
        emit NewContractAddress(_newGovernance, "Governance");
    }
    
    /**
     * @dev Use this function to withdraw released tokens
     *
     */
    function mintToTeam() external{
        //yearly is 4k * 12 mos = 48k per year (131.5 per day)
        uint256 _releasedAmount = 131.5 ether * (block.timestamp - lastReleaseTime)/(86400); 
        lastReleaseTime = block.timestamp;
        mint(owner, _releasedAmount);
    }

    function mintToDAO() external{
        //yearly is 4k * 12 mos = 48k per year (131.5 per day)
        uint256 _releasedAmount = 131.5 ether * (block.timestamp - lastReleaseTime)/(86400); 
        lastReleaseTime = block.timestamp;
        mint(addresses[_GOVERNANCE_CONTRACT], _releasedAmount);
    }

    /**
     * @dev Used during the upgrade process to verify valid Tellor Contracts and ensure
     * they have the right signature
     * @param _contract is the address of the Tellor contract to verify
     * @return bool of whether or not the address is a valid Tellor contract
     */
    function _isValid(address _contract) internal returns (bool) {
        (bool _success, bytes memory _data) = address(_contract).call(
            abi.encodeWithSelector(0xfc735e99, "") // verify() signature
        );
        require(
            _success && abi.decode(_data, (uint256)) > 9000, // An arbitrary number to ensure that the contract is valid
            "New contract is invalid"
        );
        return true;
    }
    /**
     * @dev Used during the upgrade process to verify valid Tellor Contracts
     */
    function verify() external pure returns (uint256) {
        return 9999;
    }

    //allows team to gain control of any tokens sent directly to this contract (and send them back))
    function transferOutOfContract() external{
        transfer(owner,balanceOf(address(this)));
    }

}