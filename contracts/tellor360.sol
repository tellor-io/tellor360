// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

//need transition and token functions and autoMinting functions

contract Tellor360 is Token{



    constructor(address _flexAddress) {

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

}