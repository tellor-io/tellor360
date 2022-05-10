//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.3;

import "./oldContract/tellor3/ITellor.sol";
import "./oldContracts/tellor3/TellorStorage.sol";

contract Parachute360 is TellorStorage {
  address constant tellorMaster = 0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0;
  address constant multis = 0x39E419bA25196794B595B2a595Ea8E527ddC9856;
  bytes32 challenge;
  uint256 challengeUpdate;

  /**
   * @dev Use this function to end parachutes ability to reinstate Tellor's admin key
   */
  function killContract() external {
    require(msg.sender == multis,"only multis wallet can call this");
    ITellor(tellorMaster).changeDeity(address(0));
  }

  /**
   * @dev This function allows the Tellor Team to migrate old TRB token to the new one
   * @param _destination is the destination adress to migrate tokens to
   * @param _amount is the amount of tokens to migrate
   */
  function migrateFor(address _destination,uint256 _amount) external {
    require(msg.sender == multis,"only multis wallet can call this");
    ITellor(tellorMaster).transfer(_destination, _amount);
  }

  /**
   * @dev This function allows the Tellor community to reinstate and admin key if an attacker
   * is able to get 51% or more of the total TRB supply.
   * @param _tokenHolder address to check if they hold more than 51% of TRB
   */
  function rescue51PercentAttack(address _tokenHolder) external {
    require(
      ITellor(tellorMaster).balanceOf(_tokenHolder) * 100 / ITellor(tellorMaster).totalSupply() >= 51,
      "attacker balance is < 51% of total supply"
    );
    ITellor(tellorMaster).changeDeity(multis);
  }

  /**
   * @dev Allows the TellorTeam to reinstate the admin key if a long time(timeBeforeRescue)
   * has gone by without a value being added on-chain
   */
  function rescueBrokenDataReporting() external {
    bytes32 _newChallenge;
    (_newChallenge,,,) = ITellor(tellorMaster).getNewCurrentVariables();
    if(_newChallenge == challenge){
      if(block.timestamp - challengeUpdate > 7 days){
        ITellor(tellorMaster).changeDeity(multis);
      }
    }
    else{
      challenge = _newChallenge;
      challengeUpdate = block.timestamp;
    }
  }

  /**
   * @dev Allows the Tellor community to reinstate the admin key if tellor is updated
   * to an invalid address.
   */
  function rescueFailedUpdate() external {
    (bool success, bytes memory data) =
        address(tellorMaster).call(
            abi.encodeWithSelector(0xfc735e99, "") //verify() signature
        );
    uint _val;
    if(data.length > 0){
      _val = abi.decode(data, (uint256));
    }
    require(!success || _val < 2999,"new tellor is valid");
    ITellor(tellorMaster).changeDeity(multis);
  }
}
