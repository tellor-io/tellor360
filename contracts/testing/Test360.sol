// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

import "../Tellor360.sol";
import "hardhat/console.sol";

contract Test360 is Tellor360 {
    event Received(address, uint256);

    // constructor(address _multis
    // ) Tellor360(_multis) {}

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    function changeAddressVar(bytes32 _id, address _addy) external {
        addresses[_id] = _addy;
    }

    function sliceUintTest(bytes memory bs) external pure returns (uint256) {
        return _sliceUint(bs);
    }
}
