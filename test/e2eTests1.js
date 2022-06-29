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
    let oldOracle
    let newGovernance = null
    let voteCount = null

  beforeEach("deploy and setup Tellor360", async function () {

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
    oracle = await oracleFactory.deploy(tellorMaster, 12*60*60, BigInt(100E18), BigInt(10E18))
    await oracle.deployed()

    let governanceFactory = await ethers.getContractFactory("contracts/oldContracts/contracts/Governance360.sol:Governance")
    newGovernance = await governanceFactory.deploy(oracle.address, DEV_WALLET)
    await newGovernance.deployed()

    await oracle.init(newGovernance.address)

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

    // non-disputed reporter
    await tellor.connect(devWallet).transfer(accounts[4].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[4]).depositStake()

    //disputer 
    await tellor.connect(devWallet).transfer(accounts[4].address, web3.utils.toWei("100"));
    let latestTimestamp = await oldOracle.getTimeOfLastNewValue()
    await governance.connect(accounts[4]).beginDispute(h.uintTob32(70), latestTimestamp)

    controllerFactory = await ethers.getContractFactory("Test360")
    controller = await controllerFactory.deploy()
    await controller.deployed()

    let controllerAddressEncoded = ethers.utils.defaultAbiCoder.encode([ "address" ],[controller.address])
    await governance.connect(devWallet).proposeVote(tellorMaster, 0x3c46a185, controllerAddressEncoded, 0)
    voteCount = await governance.getVoteCount()

    await governance.connect(devWallet).vote(voteCount,true, false)
    await governance.connect(bigWallet).vote(voteCount,true, false)
    await governance.connect(reporter).vote(voteCount, true, false)

    await h.advanceTime(86400 * 8)
    await governance.tallyVotes(voteCount)
    await h.advanceTime(86400 * 2.5)
    // await governance.executeVote(voteCount)
  });

  it("Mine 2 values on 50 different ID's", async function () {
    // init 360
    await governance.executeVote(voteCount)
    await tellor.connect(devWallet).init(oracle.address)

    await tellor.connect(bigWallet).transfer(accounts[9].address, BigInt(120E18))
    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(120E18))
    await tellor.connect(accounts[9]).approve(oracle.address, BigInt(120E18))
    await tellor.connect(accounts[10]).approve(oracle.address, BigInt(120E18))
    await oracle.connect(accounts[9]).depositStake(BigInt(120E18))
    await oracle.connect(accounts[10]).depositStake(BigInt(120E18))

    for (let i=1; i<=50; i++) {
      await oracle.connect(accounts[9]).submitValue(h.uintTob32(i.toString()), h.uintTob32(i.toString()), 0, '0x')
      await oracle.connect(accounts[10]).submitValue(h.uintTob32(i.toString()), h.uintTob32(i.toString()), 0, '0x')
      await h.advanceTime(3600)
    }
  });
  
  it("Parachute Tests -- rescue failed update", async function () {
    await governance.executeVote(voteCount)
    await tellor.connect(devWallet).init(oracle.address)

    let tellorContract = '0x0f1293c916694ac6af4daa2f866f0448d0c2ce8847074a7896d397c961914a08'

    await expect(
      parachute.rescueFailedUpdate(),
      "tellor address should be valid"
    ).to.be.reverted

    await tellor.changeAddressVar(h.hash("_TELLOR_CONTRACT"),ethers.constants.AddressZero)

    await expect(
      tellor.verify(),
      "shouldn't be able to read"
    ).to.be.reverted
    //throw deity to parachute
    await parachute.rescueFailedUpdate()
    //get it back!
    await tellor.connect(devWallet).changeTellorContract(controller.address)
    //read tellor contract adddres
    let newAdd = await tellor.getAddressVars(tellorContract)
    await assert(newAdd == controller.address, "Tellor's address was not updated")
    let newDeity = await tellor.getAddressVars(h.hash("_DEITY"))
    await assert(newDeity == DEV_WALLET)
  })

  it("Manually verify that Liquity still work (mainnet fork their state after oracle updates)", async function() {
    await governance.executeVote(voteCount)
    await tellor.connect(devWallet).init(oracle.address)

    let liquityPriceFeed = await ethers.getContractAt("contracts/testing/IPriceFeed.sol:IPriceFeed", LIQUITY_PRICE_FEED)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()

    expect(lastGoodPrice).to.equal("2075224047850000000000", "Liquity ether price should be correct")
    await h.advanceTime(60*60*24*7)

    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(100E18))
    await tellor.connect(accounts[10]).approve(oracle.address, BigInt(10E18))
    await oracle.connect(accounts[10]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[10]).submitValue(h.uintTob32("1"),h.uintTob32("2095150000"),0,'0x')
    currentVal = await tellor.getLastNewValueById(1)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    expect(lastGoodPrice).to.eq("2095150000000000000000", "Liquity ether price should be correct")

    await h.advanceTime(60*60*12)
    await oracle.connect(accounts[10]).submitValue(h.uintTob32("1"),h.uintTob32("3395160000"),0,'0x')
    currentVal = await tellor.getLastNewValueById(1)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    expect(lastGoodPrice).to.eq("3395160000000000000000", "Liquity ether price should be correct")
    await h.advanceTime(60*60*12)
    await oracle.connect(accounts[10]).submitValue(h.uintTob32("1"),h.uintTob32("3395170000"),0,'0x')
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    assert(lastGoodPrice == "3395170000000000000000", "Liquity ether price should be correct")
  });

  it("disputes on tellorx work for first 12 hours", async function () {
    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(100E18))

    // stake account on tellor master (tellorx oracle)
    await tellor.connect(accounts[10]).depositStake()

    //account submits a value
    valueCount = await tellor.getNewValueCountbyRequestId(1)
    await oldOracle.connect(accounts[10]).submitValue(h.uintTob32("1"), h.uintTob32("3395170000"), valueCount, '0x')
    blocky = await h.getBlock()

    //account disputes their value
    await governance.connect(bigWallet).beginDispute(h.uintTob32("1"), blocky.timestamp)
    newVoteCount = await governance.getVoteCount()
    await governance.connect(bigWallet).vote(newVoteCount, true, false)

    // init 360
    await governance.executeVote(voteCount)
    await tellor.connect(devWallet).init(oracle.address)
  })

  it("can stake and dispute on tellorx within the 12 hours (before init)", async function() {
    // stake and submit value
    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(100E18))
    await tellor.connect(accounts[10]).depositStake()
    await oldOracle.connect(accounts[10]).submitValue(h.uintTob32("99"),h.uintTob32("1500000000"),0,'0x')
    blocky1 = await h.getBlock()
    lastNewVal = await tellor.getLastNewValueById(99)
    expect(lastNewVal[0]).to.equal(h.uintTob32("1500000000"))

    // begin dispute
    await tellor.connect(bigWallet).transfer(accounts[1].address, BigInt(100E18))
    await governance.connect(accounts[1]).beginDispute(h.uintTob32("99"), blocky1.timestamp)
    newVoteCount = governance.getVoteCount()
    await governance.connect(accounts[1]).vote(newVoteCount, true, false)

    // init 360
    await governance.executeVote(voteCount)
    await tellor.connect(devWallet).init(oracle.address)
  })

  it("stakers on tellorx can withdraw and re-stake on tellorflex", async function() {
    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(100E18))
    await tellor.connect(accounts[10]).depositStake()
    await h.expectThrow(tellor.connect(accounts[10]).transfer(accounts[9].address, BigInt(100E18)))

    // execute upgrade proposal
    await governance.executeVote(voteCount)

    // ensure old staker can transfer tokens
    await tellor.connect(accounts[10]).transfer(accounts[9].address, BigInt(100E18))
    await tellor.connect(accounts[9]).transfer(accounts[10].address, BigInt(100E18))

    // ensure staker can stake in new oracle
    await tellor.connect(accounts[10]).approve(oracle.address, BigInt(100E18))
    await oracle.connect(accounts[10]).depositStake(BigInt(100E18))
  })
});
