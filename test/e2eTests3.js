const { AbiCoder } = require("@ethersproject/abi");
const { expect } = require("chai");
const {ethers} = require("hardhat")
const h = require("./helpers/helpers");
var assert = require('assert');
const web3 = require('web3');
const { BigNumber } = require("ethers");

describe("End-to-End Tests - Three", function() {

    const tellorMaster = "0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0"
    const DEV_WALLET = "0x39E419bA25196794B595B2a595Ea8E527ddC9856"
    const PARACHUTE = "0x83eB2094072f6eD9F57d3F19f54820ee0BaE6084"
    const BIGWALLET = "0xf977814e90da44bfa03b6295a0616a897441acec";
    const CURR_GOV = "0x51d4088d4EeE00Ae4c55f46E0673e9997121DB00"
    const REPORTER = "0x0D4F81320d36d7B7Cf5fE7d1D547f63EcBD1a3E0"
    const LIQUITY_PRICE_FEED = "0x4c517D4e2C851CA76d7eC94B805269Df0f2201De"
    const TELLORX_ORACLE = "0xe8218cACb0a5421BC6409e498d9f8CC8869945ea"

    let accounts = null
    let token = null
    let oracle = null
    let tellor = null
    let governance = null
    let cfac,ofac,tfac,gfac,parachute,govBig,govTeam
    let govSigner = null
    let devWallet = null

  beforeEach("deploy and setup Tellor360", async function() {

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
      params: [PARACHUTE]}
    )

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DEV_WALLET]
    })

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [REPORTER]
    })

    //account forks
    accounts = await ethers.getSigners()
    devWallet = await ethers.provider.getSigner(DEV_WALLET);
    bigWallet = await ethers.provider.getSigner(BIGWALLET);
    reporter = await ethers.provider.getSigner(REPORTER)

    //contract forks
    tellor = await ethers.getContractAt("contracts/oldContracts/contracts/interfaces/ITellor.sol:ITellor", tellorMaster)
    governance = await ethers.getContractAt("contracts/oldContracts/contracts/interfaces/ITellor.sol:ITellor", CURR_GOV)
    oldOracle = await ethers.getContractAt("contracts/oldContracts/contracts/interfaces/ITellor.sol:ITellor", TELLORX_ORACLE)
    parachute = await ethers.getContractAt("contracts/oldContracts/contracts/interfaces/ITellor.sol:ITellor",PARACHUTE, devWallet);

    // // const tokenFactory = await ethers.getContractFactory("TestToken")
    // token = await tokenFactory.deploy()
    // await token.deployed()

    // deploy tellorFlex
    let oracleFactory = await ethers.getContractFactory("TellorFlex")
    oracle = await oracleFactory.deploy(tellorMaster, BIGWALLET, BigInt(10E18), 12*60*60)
    await oracle.deployed()

    // submit 2 queryId=70 values to new flex
    await tellor.connect(devWallet).transfer(accounts[1].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[1]).approve(oracle.address, BigInt(10E18))
    await oracle.connect(accounts[1]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[1]).submitValue(h.uintTob32(70), h.bytes(99), 0, '0x')
    blockyNew1 = await h.getBlock()

    await tellor.connect(devWallet).transfer(accounts[6].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[6]).approve(oracle.address, BigInt(10E18))
    await oracle.connect(accounts[6]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[6]).submitValue(h.uintTob32(70), h.bytes(100), 0, '0x')
    blockyNew2 = await h.getBlock()

    // submit 1 queryId=1 value to new flex (required for 360 init)
    await tellor.connect(devWallet).transfer(accounts[5].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[5]).approve(oracle.address, BigInt(10E18))
    await oracle.connect(accounts[5]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[5]).submitValue(h.uintTob32(1), h.uintTob32(1000), 0, '0x')

    //tellorx staker
    await tellor.connect(devWallet).transfer(accounts[2].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[2]).depositStake()
    blockyOld1 = await h.getBlock()

    //disputed tellorx staker
    await tellor.connect(devWallet).transfer(accounts[3].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[3]).depositStake()
    await oldOracle.connect(accounts[3]).submitValue(h.uintTob32(70), h.bytes(200), 0, '0x')

    //disputer 
    // await tellor.connect(devWallet).transfer(accounts[4].address, web3.utils.toWei("100"));
    // let latestTimestamp = await oldOracle.getTimeOfLastNewValue()
    // await governance.connect(accounts[4]).beginDispute(h.uintTob32(70), latestTimestamp)

    controllerFactory = await ethers.getContractFactory("Test360")
    controller = await controllerFactory.deploy()
    await controller.deployed()

    let controllerAddressEncoded = ethers.utils.defaultAbiCoder.encode([ "address" ],[controller.address])
    await governance.connect(devWallet).proposeVote(tellorMaster, 0x3c46a185, controllerAddressEncoded, 0)

    let voteCount = await governance.getVoteCount()

    await governance.connect(devWallet).vote(voteCount,true, false)
    await governance.connect(bigWallet).vote(voteCount,true, false)
    await governance.connect(reporter).vote(voteCount, true, false)

    await h.advanceTime(86400 * 8)
    await governance.tallyVotes(voteCount)
    await h.advanceTime(86400 * 2.5)
    await governance.executeVote(voteCount)

  })

  it.only("values can be retrieved through whole transition period", async function () {

    // getNewValueCountbyRequestId getTimestampbyRequestIDandIndex getLastNewValueById getCurrentValue

    // getLastNewValueById
    lastNewVal = await tellor.getLastNewValueById(70)
    expect(lastNewVal[0]).to.equal(200)
    expect(lastNewVal[1]).to.be.true

    // getNewValueCountbyRequestId
    newValCount = await tellor.getNewValueCountbyRequestId(70)
    expect(newValCount).to.equal(1)

    // getTimestampbyRequestIDandIndex
    timestampByIndex = await tellor.getTimestampbyRequestIDandIndex(70, 0)
    expect(timestampByIndex).to.equal(blockyOld1.timestamp)



    console.log("timestampByQueryIdAndIndex: " + await oracle.getTimestampbyQueryIdandIndex(h.uintTob32(70), 0))

    // INIT TELLORFLEX
    await tellor.connect(devWallet).init(oracle.address)

    // getLastNewValueById
    lastNewVal = await tellor.getLastNewValueById(70)
    expect(lastNewVal[0]).to.equal(100)
    expect(lastNewVal[1]).to.be.true

    // getNewValueCountbyRequestId
    newValCount = await tellor.getNewValueCountbyRequestId(70)
    expect(newValCount).to.equal(2)





    // //this staker has staked in the beforeEach on TellorX

    // let oldStakeAmount = BigInt(100E18)

    // let oldStakerBalance = BigInt(await tellor.balanceOf(accounts[2].address))
    
    // expect(oldStakerBalance).to.be.equal(oldStakeAmount)

    // //they can send their tokens now; they're unlocked

    // let tokensTransfered = BigInt(10E18)

    // let expectedBalance = BigInt(90E18)

    // await tellor.connect(accounts[2]).transfer(accounts[3].address, tokensTransfered)

    // expect(expectedBalance).to.be.equal(oldStakerBalance - tokensTransfered)

    // //init tellorflex!

    // await tellor.connect(devWallet).init(oracle.address)

    // //they can now stake again in tellorflex

    // let stake = BigInt(90E18)

    // await tellor.connect(accounts[2]).approve(oracle.address, stake)
    // await oracle.connect(accounts[2]).depositStake(stake)

    // let newBalance = await tellor.balanceOf(accounts[2].address)
    // expect(newBalance).to.be.equal(BigInt(0))

    // let stakerInfo = await oracle.getStakerInfo(accounts[2].address)

    // let amountStaked = stakerInfo[1]

    // expect(amountStaked).to.equal(BigInt(stake))
  })

});
