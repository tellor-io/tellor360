const { AbiCoder } = require("@ethersproject/abi");
const { expect } = require("chai");
const {ethers} = require("hardhat")
const h = require("./helpers/helpers");
var assert = require('assert');
const web3 = require('web3');

describe("End-to-End Tests - One", function() {

    const tellorMaster = "0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0"
    const DEV_WALLET = "0x39E419bA25196794B595B2a595Ea8E527ddC9856"
    const PARACHUTE = "0x83eB2094072f6eD9F57d3F19f54820ee0BaE6084"
    const BIGWALLET = "0xf977814e90da44bfa03b6295a0616a897441acec";
    const CURR_GOV = "0x51d4088d4EeE00Ae4c55f46E0673e9997121DB00"
    let accounts = null
    let token = null
    let oracle = null
    let newTellor = null
    let oldTellor = null
    let governance = null
    let cfac,ofac,tfac,gfac,parachute,govBig,govTeam
    let govSigner = null

  beforeEach("deploy and setup TellorX", async function() {

    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{forking: {
            jsonRpcUrl: hre.config.networks.hardhat.forking.url,
            blockNumber:14768690

          },},],
      });

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [BIGWALLET]}
    )

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DEV_WALLET]
    })

    accounts = await ethers.getSigners()
    devWallet = await ethers.provider.getSigner(DEV_WALLET);
    bigWallet = await ethers.provider.getSigner(BIGWALLET);

    const tokenFactory = await ethers.getContractFactory("TestToken")
    token = await tokenFactory.deploy()
    await token.deployed()

    let oracleFactory = await ethers.getContractFactory("TellorFlex")
    oracle = await oracleFactory.deploy(token.address, BIGWALLET, BigInt(10E18), 12*60*60)
    await oracle.deployed()

    await token.mint(accounts[1].address, web3.utils.toWei("1000"));
    await token.connect(accounts[1]).approve(oracle.address, web3.utils.toWei("1000"))

    await oracle.connect(accounts[1]).depositStake(BigInt(11E18))
    await oracle.connect(accounts[1]).submitValue(h.uintTob32(1), h.bytes(100), 0, '0x')

    newTellorFactory = await ethers.getContractFactory("Tellor360")
    newTellor = await newTellorFactory.deploy()
    await newTellor.deployed()

    oldTellor = await ethers.getContractAt("contracts/oldContracts/contracts/interfaces/ITellor.sol:ITellor", tellorMaster)
    governance = await ethers.getContractAt("contracts/oldContracts/contracts/interfaces/ITellor.sol:ITellor", CURR_GOV)

    await governance.connect(devWallet).proposeVote(tellorMaster, 0x3c46a185, newTellor.address, 0)

    let voteCount = await governance.getVoteCount()
    console.log(1)
    await governance.connect(devWallet).vote(voteCount,true, false)
    console.log(2)
    await governance.connect(bigWallet).vote(voteCount,true, false)

    await h.advanceTime(86400 * 8)
    await governance.tallyVotes(voteCount)
    await h.advanceTime(86400 * 2.5)
    await governance.executeVote(voteCount)





    


  });
  it("Mine 2 values on 50 different ID's", async function() {
  });
  

});
