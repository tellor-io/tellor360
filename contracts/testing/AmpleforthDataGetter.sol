// // SPDX-License-Identifier: MIT
// pragma solidity ^0.4.24;

// import "./MedianOracle.sol";
// import "hardhat/console.sol";

// contract AmpleforthDataGetter {
//     MedianOracle public medianOracle;
//     uint256 public value;
//     bool public ifReceive;

//     constructor(address _medianOracle) {
//         medianOracle = MedianOracle(_medianOracle);
//     }

//     function saveData() external {
//         (value, ifReceive) = medianOracle.getData();
//         console.log("@value: %s", value);
//         console.log("@ifReceive: %s", ifReceive);

//     }

//     function providerReportGetter(address _provider) external view returns(Report[2]) {
//         Report[2] storage reports = medianOracle.providerReports[providerAddress];

//     }
// }