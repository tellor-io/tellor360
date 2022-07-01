// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "./BaseToken.sol";
import "./NewTransition.sol";
import "hardhat/console.sol";
import "./interfaces/ITellorFlex.sol";

contract Tellor360 is BaseToken, NewTransition {
    // Events
    event NewContractAddress(address _newContract, string _contractName);
    event NewOracleAddress(address _newOracle, uint256 _timestamp);
    event NewProposedOracleAddress(
        address _newProposedOracle,
        uint256 _timestamp
    );

    // Functions
    /**
     * @dev Constructor used to store new flex oracle address 
     * @param _flexAddress is the new oracle contract which will replace the 
     * tellorX oracle
     */
    constructor(address _flexAddress) {
        addresses[_ORACLE_CONTRACT] = _flexAddress;
    }

    /**
     * @dev Use this function to initiate the contract
     */
    function init() external {
        require(uints[keccak256("_INIT")] == 0, "should only happen once");
        uints[keccak256("_INIT")] = 1;
        // retrieve new oracle address from Tellor360 contract address storage
        NewTransition _newController = NewTransition(addresses[_TELLOR_CONTRACT]);
        address _flexAddress = _newController.getAddressVars(_ORACLE_CONTRACT);
        //on switch over, require tellorFlex values are over 12 hours old
        //then when we switch, the governance switch can be instantaneous
        uint256 _id = 1;
        uint256 _firstTimestamp = IOracle(_flexAddress)
            .getTimestampbyQueryIdandIndex(bytes32(_id), 0);
        require(
            block.timestamp - _firstTimestamp >= 12 hours,
            "contract should be at least 12 hours old"
        );
        addresses[keccak256("_OLD_ORACLE_CONTRACT")] = addresses[
            _ORACLE_CONTRACT
        ];
        addresses[_ORACLE_CONTRACT] = _flexAddress; //used by Liquity+AMPL for this contract's reads
        //init minting uints (timestamps)
        uints[keccak256("_LAST_RELEASE_TIME_TEAM")] = block.timestamp;
        uints[keccak256("_LAST_RELEASE_TIME_DAO")] = block.timestamp;
        uints[_SWITCH_TIME] = block.timestamp;
        // transfer dispute fees collected during transition period to team
        _doTransfer(
            addresses[_GOVERNANCE_CONTRACT],
            addresses[_OWNER],
            balanceOf(addresses[_GOVERNANCE_CONTRACT])
        );
    }

    /**
     * @dev Use this function to withdraw released tokens to the oracle
     */
    function mintToOracle() external {
        require(uints[keccak256("_INIT")] == 1, "tellor360 not initiated");
        // X - 0.02X = 144 daily. X = 146.94
        uint256 _releasedAmount = (146.94 ether *
            (block.timestamp - uints[keccak256("_LAST_RELEASE_TIME_DAO")])) /
            (86400);
        uints[keccak256("_LAST_RELEASE_TIME_DAO")] = block.timestamp;
        uint256 stakingRewards = (_releasedAmount * 2) / 100;
        _doMint(addresses[_ORACLE_CONTRACT], _releasedAmount - stakingRewards);
        // Send staking rewards
        _doMint(address(this), stakingRewards);
        approve(addresses[_ORACLE_CONTRACT], stakingRewards);
        try
            ITellorFlex(addresses[_ORACLE_CONTRACT]).addStakingRewards(
                stakingRewards
            )
        {
            return;
        } catch {
            _doMint(addresses[_ORACLE_CONTRACT], stakingRewards);
        }
    }

    /**
     * @dev Use this function to withdraw released tokens to the team
     */
    function mintToTeam() external {
        require(uints[keccak256("_INIT")] == 1, "tellor360 not initiated");
        //yearly is 4k * 12 mos = 48k per year (131.5 per day)
        uint256 _releasedAmount = (131.5 ether *
            (block.timestamp - uints[keccak256("_LAST_RELEASE_TIME_TEAM")])) /
            (86400);
        uints[keccak256("_LAST_RELEASE_TIME_TEAM")] = block.timestamp;
        _doMint(addresses[_OWNER], _releasedAmount);
    }

    //TODO: be sure to test we can't just print tokens
    /**
     * @dev This function allows team to gain control of any tokens sent directly to this
     * contract (and send them back))
     */
    function transferOutOfContract() external {
        _doTransfer(address(this), addresses[_OWNER], balanceOf(address(this)));
    }

    /**
     * @dev Use this function to update the oracle contract
     */
    function updateOracleAddress() external {
        bytes32 _queryID = keccak256(
            abi.encode("TellorOracleAddress", abi.encode(bytes("")))
        );
        bytes memory _currentOracleAddress;
        (, _currentOracleAddress, ) = IOracle(addresses[_ORACLE_CONTRACT])
            .getDataBefore(_queryID, block.timestamp - 12 hours);
        address _currentOracle = abi.decode(_currentOracleAddress, (address));
        // If the oracle address being reported is the same as the proposed oracle then update the oracle contract
        // only if 7 days have passed since the new oracle address was made official
        // and if 12 hours have passed since query id 1 was last reported on the soon to be deprecated oracle contract
        if (_currentOracle == addresses[keccak256("_PROPOSED_ORACLE")]) {
            require(
                block.timestamp >
                    uints[keccak256("_TIME_PROPOSED_UPDATED")] + 7 days
            );
            uint256 _firstTimestamp = IOracle(_currentOracle)
                .getTimestampbyQueryIdandIndex(bytes32(uint256(1)), 0);
            require(
                block.timestamp - _firstTimestamp >= 12 hours,
                "contract should be at least 12 hours old"
            );
            addresses[keccak256("_OLD_ORACLE_CONTRACT")] = addresses[
                _ORACLE_CONTRACT
            ];
            addresses[_ORACLE_CONTRACT] = _currentOracle;
            uints[_SWITCH_TIME] = block.timestamp;
            emit NewOracleAddress(_currentOracle, block.timestamp);
        }
        //Otherwise if the current oracle is not the proposed oracle, then propose it and
        //start the clock on the 7 days before it can be made official
        else {
            require(_isValid(_currentOracle));
            addresses[keccak256("_PROPOSED_ORACLE")] = _currentOracle;
            uints[keccak256("_TIME_PROPOSED_UPDATED")] = block.timestamp;
            emit NewProposedOracleAddress(_currentOracle, block.timestamp);
        }
    }

    /**
     * @dev Used during the upgrade process to verify valid Tellor Contracts
     */
    function verify() external pure returns (uint256) {
        return 9999;
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
}
