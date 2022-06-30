// SPDX-License-Identifier: MIT
pragma solidity 0.8.3;

interface IMedianOracle {


    function pushReport(uint256 payload) external;

    function getData() external returns(uint256, bool);
}