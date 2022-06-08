// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "./BaseToken.sol";
import "./NewTransition.sol";

contract Tellor360 is BaseToken, NewTransition{
    // Events
    event NewContractAddress(address _newContract, string _contractName);
    event NewOracleAddress(address _newOracle, uint256 timestamp);

    /**
     * @dev Use this to set the owner that will be able to run the init function, 
     * receive the team's tokens and tranferOutOfContract tokens mistakenly sent to it
     * @param _multis is the flex contract address that will be deprecated by thiscontract
     */
    constructor(address _multis) {
        addresses[_OWNER] = _multis;
    }
    
    // Functions
    //??? should this be _flexAddress or TellorX address? tellor flex is not on mainnet
    /**
     * @dev Use this function to initiate the contract
     * @param _flexAddress is the contract address that will be deprecated by this contract
     */
    function init(address _flexAddress) external {
        require(msg.sender == addresses[_OWNER], "only owner");
        require(uints[keccak256("_INIT")] == 0, "should only happen once");
        uints[keccak256("_INIT")] = 1;
        //on switch over, require tellorFlex values are over 12 hours old
        //then when we switch, the governance switch can be instantaneous
        //no need for the dispute transistion...but be sure disputes work on both contracts during those 12 hours
       //BL--ok so for the update to happen 
       //old tellor flex id 1 value has to be 12 hours old before we can init 360
        uint256 _id = 1;
        uint256 _firstTimestamp = IOracle(_flexAddress).getTimestampbyQueryIdandIndex(bytes32(_id),0);
        require(block.timestamp - _firstTimestamp >= 12 hours, "contract should be at least 12 hours old");
        addresses[_ORACLE_CONTRACT] = _flexAddress; //used by Liquity+AMPL for this contract's reads
        //init minting uints (timestamps)
        uints[keccak256("_LAST_RELEASE_TIME_TEAM")] = block.timestamp;
        uints[keccak256("_LAST_RELEASE_TIME_DAO")] = block.timestamp;
        //mint a few people some tokens (those locked)- These addresses accidentally sent TRB to the
        //oracle contract and are being reimbursed with this mint ??? BL
        //triple check: https://docs.google.com/spreadsheets/d/1z1GO_9cWRBbWxq651Z7FLoA6iI1nWE4lEHB9OPrZjko/edit#gid=0
        _doMint(address(0x3aa39f73D48739CDBeCD9EB788D4657E0d6a6815), 2.26981073 ether);
        _doMint(address(0xdbbAEee590a2744AfC0112ea3bdD89474f476eDa), 5.16836759 ether);
        _doMint(address(0x503828976D22510aad0201ac7EC88293211D23Da), 11.204 ether);
        _doMint(address(0xEf7353B92BE7CC840B5b2A190B3a555277Fc18c9), 68.55985987 ether);
        _doMint(address(0x7a11CDA496cC596E2241319982485217Cad3996C), 695.0062834 ether);
    }

    /**
     * @dev Use this function to update the oracle contract
     */
    function updateOracleAddress() external {
        bytes32 _queryID = keccak256(abi.encode("TellorOracleAddress"));
        bytes memory _currentOracleAddress;
        _currentOracleAddress = IOracle(addresses[_ORACLE_CONTRACT]).retrieveData(_queryID, block.timestamp - 12 hours);
        address _currentOracle = abi.decode(_currentOracleAddress,(address));
        //If the oracle address being reported is the same as the proposed oracle then update the oracle contract 
        //only if 7 days have passed since the new oracle address was made official
        //and if 12 hours have passed since query id 1 was last reported on the soon to be deprecated oracle contract
        if(_currentOracle == addresses[keccak256("_PROPOSED_ORACLE")]){
            require(block.timestamp > uints[keccak256("_TIME_PROPOSED_UPDATED")] + 7 days);
            uint256 _firstTimestamp = IOracle(_currentOracle).getTimestampbyQueryIdandIndex(bytes32(uint256(1)),0);
            require(block.timestamp - _firstTimestamp >= 12 hours, "contract should be at least 12 hours old");
            addresses[_ORACLE_CONTRACT] = _currentOracle;
            emit NewOracleAddress(_currentOracle, block.timestamp);
        }
        //otherwise if the current oracle is not the proposed oracle, then propose it and 
        //start the clock on the 7 days before it can be made official 
        else{
            addresses[keccak256("_PROPOSED_ORACLE")] = _currentOracle;
            uints[keccak256("_TIME_PROPOSED_UPDATED")] = block.timestamp;
        }
    }
 
    /**
     * @dev Use this function to withdraw released tokens to the team
     */
    function mintToTeam() external{
        require(uints[keccak256("_INIT")] == 1, "controller not initiated");
        //yearly is 4k * 12 mos = 48k per year (131.5 per day)
        uint256 _releasedAmount = 131.5 ether * (block.timestamp - uints[keccak256("_LAST_RELEASE_TIME_TEAM")])/(86400); 
        uints[keccak256("_LAST_RELEASE_TIME_TEAM")] = block.timestamp;
        _doMint(addresses[_OWNER], _releasedAmount);
    }

//BL--??? is this supposed to go to the DAO or to the oracle contract to pay the timebased rewards?
    /**
     * @dev Use this function to withdraw released tokens to the DAO
     */
    function mintToOracle() external{
        require(uints[keccak256("_INIT")] == 1, "controller not initiated");
        //yearly is 4k * 12 mos = 48k per year (131.5 per day)
        uint256 _releasedAmount = 131.5 ether * (block.timestamp - uints[keccak256("_LAST_RELEASE_TIME_DAO")])/(86400); 
        uints[keccak256("_LAST_RELEASE_TIME_DAO")] = block.timestamp;
        _doMint(addresses[_ORACLE_CONTRACT], _releasedAmount);
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


    //TODO: be sure to test we can't just print tokens
    /**
     * @dev This function allows team to gain control of any tokens sent directly to this 
     * contract (and send them back))
     */
    function transferOutOfContract() external{
        _doTransfer(address(this),addresses[_OWNER],balanceOf(address(this)));
    }

}