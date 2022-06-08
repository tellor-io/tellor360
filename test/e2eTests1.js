const { AbiCoder } = require("@ethersproject/abi");
const { expect } = require("chai");
const {ethers} = require("hardhat")
const h = require("./helpers/helpers");
var assert = require('assert');
const web3 = require('web3');
const { BigNumber } = require("ethers");

describe("End-to-End Tests - One", function() {

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

    const tokenFactory = await ethers.getContractFactory("TestToken")
    token = await tokenFactory.deploy()
    await token.deployed()

    let oracleFactory = await ethers.getContractFactory("TellorFlex")
    oracle = await oracleFactory.deploy(tellorMaster, BIGWALLET, BigInt(10E18), 12*60*60)
    await oracle.deployed()

    await tellor.connect(devWallet).transfer(accounts[1].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[1]).approve(oracle.address, BigInt(10E18))

    await oracle.connect(accounts[1]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[1]).submitValue(h.uintTob32(1), h.bytes(100), 0, '0x')

    //tellorx staker
    await tellor.connect(devWallet).transfer(accounts[2].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[2]).depositStake()

    //disputed tellorx staker
    await tellor.connect(devWallet).transfer(accounts[3].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[3]).depositStake()
    await oldOracle.connect(accounts[3]).submitValue(h.uintTob32(70), h.bytes(100), 0, '0x')

    //disputer 
    await tellor.connect(devWallet).transfer(accounts[4].address, web3.utils.toWei("100"));
    let latestTimestamp = await oldOracle.getTimeOfLastNewValue()
    await governance.connect(accounts[4]).beginDispute(h.uintTob32(70), latestTimestamp)


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

  });
  // it("Mine 2 values on 50 different ID's", async function () {
  // });
  
  it("Parachute Tests -- rescue failed update", async function () {

    await tellor.connect(devWallet).init(oracle.address)


    let tellorContract = '0x0f1293c916694ac6af4daa2f866f0448d0c2ce8847074a7896d397c961914a08'

    console.log(await tellor.getAddressVars(tellorContract))

    await expect(
      parachute.rescueFailedUpdate(),
      "tellor address should be valid"
    ).to.be.reverted

    await tellor.changeAddressVar(h.hash("_TELLOR_CONTRACT"),ethers.constants.AddressZero)

    console.log(0)

    console.log(tellor.address)

    console.log("here")

    await expect(
      tellor.verify(),
      "shouldn't be able to read"
    ).to.be.reverted
    console.log("here2")
    //throw deity to parachute
    await parachute.rescueFailedUpdate()
    //get it back!
    console.log(1 )
    await tellor.connect(devWallet).changeTellorContract(controller.address)
    //read tellor contract adddres
    console.log(tellor.address)
    let newAdd = await tellor.getAddressVars(tellorContract)
    await assert(newAdd == controller.address, "Tellor's address was not updated")
  })

  it("Manually verify that Liquity still work (mainnet fork their state after oracle updates)", async function () {


    await tellor.connect(devWallet).init(oracle.address)

    let liquityPriceFeed = await ethers.getContractAt("contracts/testing/IPriceFeed.sol:IPriceFeed", LIQUITY_PRICE_FEED)
    console.log(1)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()

    expect(lastGoodPrice).to.equal("2075224047850000000000", "Liquity ether price should be correct")
    await h.advanceTime(60*60*24*7)
    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(100E18))
    await tellor.connect(accounts[10]).approve(oracle.address, BigInt(10E18))

    await oracle.connect(accounts[10]).depositStake(BigInt(10E18))
    console.log(h.uintTob32("1"))
    await oracle.connect(accounts[10]).submitValue(h.uintTob32(1),h.uintTob32("2095150000"),0,'0x')
    await h.advanceTime(60*60*12)
    console.log( await liquityPriceFeed.tellorCaller())
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    await h.advanceTime(60*60*12)
    console.log("value count ", await oracle.getNewValueCountbyQueryId(h.uintTob32(1)))
    await oracle.connect(accounts[10]).submitValue(h.uintTob32(1),h.uintTob32("2095150000"),2,'0x')
    console.log(2)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    await h.advanceTime(60*60*12)

    let valueCount = await tellor.getNewValueCountbyRequestId(h.uintTob32(1))
    console.log(valueCount)

    let timestamp = await tellor.getTimestampbyRequestIDandIndex(1, valueCount - 1)
    console.log(timestamp)

    // let value = await tellor.retrieveData(1, timestamp)
    // console.log(value)

    expect(String(lastGoodPrice)).to.eq("2095150000000000000000", "Liquity ether price should be correct")
    await h.advanceTime(60*60*12)
    console.log(3)
    await oracle.connect(accounts[10]).submitValue(h.uintTob32("1"),h.uintTob32("3395160000"),3,'0x')
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    assert(lastGoodPrice == "3395160000000000000000", "Liquity ether price should be correct")
    await h.advanceTime(60*60*12)
    await oracle.connect(accounts[10]).submitValue(h.uintTob32("1"),h.uintTob32("3395170000"),4,'0x')
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    assert(lastGoodPrice == "3395170000000000000000", "Liquity ether price should be correct")
  });

  it("disputes on tellorx continue", async function () {

    console.log(await oracle.getStakerInfo(accounts[3].address))

    await tellor.connect(accounts[3]).withdrawStake()

    //transfer tokens to account for staking
    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(100E18))

    //stake account on tellor master (tellorx oracle)
    await tellor.connect(accounts[10]).depositStake(BigInt(100E18))

    console.log("here")
    //account submits a value
    await oldOracle.connect(accounts[10]).submitValue(h.uintTob32("1"),h.uintTob32("3395170000"),2,'0x')

    //assert value is inaccessible from tellorflex
    // await oracle.get

    //account disputes their value
    // await governance

  })

  it("stake deposits on tellorflex round down to nearest multiple of 10", async function () {

    let bigStaker = accounts[5]
    let bigStaker2 = accounts[6]
    let miniStaker = accounts[7]

    let bigStake = BigInt(21E18)
    let miniStake = BigInt(7E18)

    let reportingLock = BigInt(await oracle.reportingLock())
    let stakeAmount = BigInt(await oracle.stakeAmount())

    await tellor.connect(devWallet).transfer(bigStaker.address, bigStake)
    await tellor.connect(devWallet).transfer(bigStaker2.address, bigStake)
    await tellor.connect(devWallet).transfer(miniStaker.address, miniStake)

    await tellor.connect(bigStaker).approve(oracle.address, bigStake)
    await tellor.connect(bigStaker2).approve(oracle.address, bigStake)
    await tellor.connect(miniStaker).approve(oracle.address, miniStake)

    await oracle.connect(bigStaker).depositStake(bigStake)
    await oracle.connect(bigStaker2).depositStake(bigStake)
    await oracle.connect(miniStaker).depositStake(miniStake)

    //staking 21 TRB will round down to 2 stakes (halved wait time between reports)
    await oracle.connect(bigStaker).submitValue(h.uintTob32(71), h.bytes(100), 0, '0x')

    h.advanceTime(reportingLock / (bigStake / stakeAmount))

    await expect(
      oracle.connect(bigStaker).submitValue(h.uintTob32(71), h.bytes(100), 1, '0x')
    ).to.be.reverted

    await oracle.connect(bigStaker2).submitValue(h.uintTob32(71), h.bytes(100), 1, '0x')

    h.advanceTime(Number(reportingLock / (BigInt(20E18) / stakeAmount)))

    await oracle.connect(bigStaker2).submitValue(h.uintTob32(71), h.bytes(100), 2, '0x')

    //stake of less than stake amount should prohibit submitting values
    await expect(
      oracle.connect(miniStaker).submitValue(h.uintTob32(71), h.bytes(100), 3, '0x')
    ).to.be.reverted
    // await oracle.connect(littleStaker).submitValue(h.uintTob32(71), h.bytes(100), 2, '0x')

    //staking 11 TRB will round down to 1 stake (must wait full reporter lock)



  })

  // it("can stake and dispute on tellorx within the 12 hours (before init)", async function() {

  //   //

  //   // await tellor.connect(devWallet).init(oracle.address)
    

  // })

});
