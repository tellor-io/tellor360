// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "./BaseToken.sol";
import "./NewTransition.sol";

contract Tellor360 is BaseToken, NewTransition{

    event NewContractAddress(address _newContract, string _contractName);

    function init(address _flexAddress) external {
        require(msg.sender == addresses[_OWNER], "only owner");
        require(uints[keccak256("_INIT")] == 0, "should only happen once");
        uints[keccak256("_INIT")] = 1;
        //on switch over, require tellorFlex values are over 12 hours old
        //then when we switch, the governance switch can be instantaneous
        //no need for the dispute transistion...but be sure disputes work on both contracts during those 12 hours
        uint256 _id = 1;
        uint256 _firstTimestamp = IOracle(_flexAddress).getTimestampbyQueryIdandIndex(bytes32(_id),0);
        require(block.timestamp - _firstTimestamp >= 12 hours, "contract should be at least 12 hours old");
        addresses[_ORACLE_CONTRACT] = _flexAddress; //used by Liquity+AMPL for this contract's reads
        //mint a few people some tokens (those locked)
        //triple check: https://docs.google.com/spreadsheets/d/1z1GO_9cWRBbWxq651Z7FLoA6iI1nWE4lEHB9OPrZjko/edit#gid=0
        _doMint(address(0x3aa39f73D48739CDBeCD9EB788D4657E0d6a6815), 2.26981073 ether);
        _doMint(address(0xdbbAEee590a2744AfC0112ea3bdD89474f476eDa), 5.16836759 ether);
        _doMint(address(0x503828976D22510aad0201ac7EC88293211D23Da), 11.204 ether);
        _doMint(address(0xEf7353B92BE7CC840B5b2A190B3a555277Fc18c9), 68.55985987 ether);
        _doMint(address(0x7a11CDA496cC596E2241319982485217Cad3996C), 695.0062834 ether);
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
        uint256 _releasedAmount = 131.5 ether * (block.timestamp - uints[keccak256("_LAST_RELEASE_TIME_TEAM")])/(86400); 
        uints[keccak256("_LAST_RELEASE_TIME_TEAM")] = block.timestamp;
        _doMint(addresses[_OWNER], _releasedAmount);
    }

    function mintToDAO() external{
        //yearly is 4k * 12 mos = 48k per year (131.5 per day)
        uint256 _releasedAmount = 131.5 ether * (block.timestamp - uints[keccak256("_LAST_RELEASE_TIME_DAO")])/(86400); 
        uints[keccak256("_LAST_RELEASE_TIME_DAO")] = block.timestamp;
        _doMint(addresses[_GOVERNANCE_CONTRACT], _releasedAmount);
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
    //be sure to test we can't just print tokens
    function transferOutOfContract() external{
        _doTransfer(address(this),addresses[_OWNER],balanceOf(address(this)));
    }

}