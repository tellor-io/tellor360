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
    const BIGWALLET = "0xf977814e90da44bfa03b6295a0616a897441acec"
    const CURR_GOV = "0x51d4088d4EeE00Ae4c55f46E0673e9997121DB00"
    const REPORTER = "0x0D4F81320d36d7B7Cf5fE7d1D547f63EcBD1a3E0"
    const LIQUITY_PRICE_FEED = "0x4c517D4e2C851CA76d7eC94B805269Df0f2201De"
    const TELLORX_ORACLE = "0xe8218cACb0a5421BC6409e498d9f8CC8869945ea"
    const TELLOR_PROVIDER_AMPL = "0xf5b7562791114fB1A8838A9E8025de4b7627Aa79"
    const MEDIAN_ORACLE_AMPL = "0x99C9775E076FDF99388C029550155032Ba2d8914"
    const TRB_QUERY_ID = "0x0000000000000000000000000000000000000000000000000000000000000032"
    const MINIMUM_STAKE_AMOUNT = web3.utils.toWei("10")
    const keccak256 = web3.utils.keccak256;
    const abiCoder = new ethers.utils.AbiCoder();
    const ETH_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["eth", "usd"]);
    const ETH_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", ETH_QUERY_DATA_ARGS]);
    const ETH_QUERY_ID = web3.utils.keccak256(ETH_QUERY_DATA);
    const AMPL_QUERY_DATA_ARGS = abiCoder.encode(["bytes"], ["0x"])
    const AMPL_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["AmpleforthCustomSpotPrice", AMPL_QUERY_DATA_ARGS]);
    const AMPL_QUERY_ID = web3.utils.keccak256(AMPL_QUERY_DATA);

    let accounts = null
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
  
    let oracleFactory = await ethers.getContractFactory("TellorFlex")
    oracle = await oracleFactory.deploy(tellorMaster, 12*60*60, BigInt(100E18), BigInt(10E18), MINIMUM_STAKE_AMOUNT, TRB_QUERY_ID)
    await oracle.deployed()

    let governanceFactory = await ethers.getContractFactory("polygongovernance/contracts/Governance.sol:Governance")
    newGovernance = await governanceFactory.deploy(oracle.address, DEV_WALLET)
    await newGovernance.deployed()

    await oracle.init(newGovernance.address)

    await tellor.connect(devWallet).transfer(accounts[1].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[1]).approve(oracle.address, BigInt(10E18))

    await oracle.connect(accounts[1]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(h.toWei("100")), 0, ETH_QUERY_DATA)

    //tellorx staker
    await tellor.connect(devWallet).transfer(accounts[2].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[2]).depositStake()

    //disputed tellorx staker
    await tellor.connect(devWallet).transfer(accounts[3].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[3]).depositStake()
    await oldOracle.connect(accounts[3]).submitValue(keccak256(h.uintTob32(70)), h.bytes(100), 0, h.uintTob32(70))

    // non-disputed reporter
    await tellor.connect(devWallet).transfer(accounts[4].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[4]).depositStake()

    //disputer 
    await tellor.connect(devWallet).transfer(accounts[4].address, web3.utils.toWei("100"));
    let latestTimestamp = await oldOracle.getTimeOfLastNewValue()
    await governance.connect(accounts[4]).beginDispute(keccak256(h.uintTob32(70)), latestTimestamp)

    controllerFactory = await ethers.getContractFactory("Test360")
    controller = await controllerFactory.deploy(oracle.address)
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
  });

  it("Mine 2 values on 50 different ID's", async function () {
    // init 360
    await governance.executeVote(voteCount)
    await tellor.connect(devWallet).init()

    await tellor.connect(bigWallet).transfer(accounts[9].address, BigInt(120E18))
    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(120E18))
    await tellor.connect(accounts[9]).approve(oracle.address, BigInt(120E18))
    await tellor.connect(accounts[10]).approve(oracle.address, BigInt(120E18))
    await oracle.connect(accounts[9]).depositStake(BigInt(120E18))
    await oracle.connect(accounts[10]).depositStake(BigInt(120E18))

    for (let i=1; i<=50; i++) {
      queryData = h.uintTob32(i.toString())
      queryId = ethers.utils.keccak256(queryData)
      await oracle.connect(accounts[9]).submitValue(queryId, h.uintTob32(i.toString()), 0, queryData)
      await oracle.connect(accounts[10]).submitValue(queryId, h.uintTob32(i.toString()), 0, queryData)
      await h.advanceTime(3600)
      let val = await tellor.getLastNewValueById(queryId)
      assert(val[0] - i == 0,"val should be correct")
    }
  });
  
  it("Parachute Tests -- rescue failed update", async function () {
    await governance.executeVote(voteCount)
    await tellor.connect(devWallet).init()

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
    assert(newAdd == controller.address, "Tellor's address was not updated")
    let newDeity = await tellor.getAddressVars(h.hash("_DEITY"))
    assert(newDeity == DEV_WALLET)
  })

  it("Manually verify that Liquity still work (mainnet fork their state after oracle updates)", async function() {
    let liquityPriceFeed = await ethers.getContractAt("contracts/testing/IPriceFeed.sol:IPriceFeed", LIQUITY_PRICE_FEED)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    expect(lastGoodPrice).to.equal("2075224047850000000000", "Liquity ether price should be correct")
    
    await governance.executeVote(voteCount)

    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    expect(lastGoodPrice).to.equal("2075224047850000000000", "Liquity ether price should be correct")

    await tellor.connect(devWallet).init()

    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()

    expect(lastGoodPrice).to.equal("2075224047850000000000", "Liquity ether price should be correct")
    await h.advanceTime(60*60*24*7)

    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(100E18))
    await tellor.connect(accounts[10]).approve(oracle.address, BigInt(10E18))
    await oracle.connect(accounts[10]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[10]).submitValue(ETH_QUERY_ID,h.uintTob32(h.toWei("2095.15")),0,ETH_QUERY_DATA)
    await h.advanceTime(60 * 15 + 1)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    expect(lastGoodPrice).to.eq("2095150000000000000000", "Liquity ether price should be correct")

    await h.advanceTime(60*60*12)
    await oracle.connect(accounts[10]).submitValue(ETH_QUERY_ID,h.uintTob32(h.toWei("3395.16")),0,ETH_QUERY_DATA)
    await h.advanceTime(60 * 15 + 1)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    expect(lastGoodPrice).to.eq("3395160000000000000000", "Liquity ether price should be correct")

    await h.advanceTime(60*60*12)
    await oracle.connect(accounts[10]).submitValue(ETH_QUERY_ID,h.uintTob32(h.toWei("3395.17")),0,ETH_QUERY_DATA)
    await h.advanceTime(60 * 15 + 1)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    assert(lastGoodPrice == "3395170000000000000000", "Liquity ether price should be correct")
  });

  it("Another liquity test", async function() {
    let liquityPriceFeed = await ethers.getContractAt("contracts/testing/IPriceFeed.sol:IPriceFeed", LIQUITY_PRICE_FEED)
    const TellorCallerTest = await ethers.getContractFactory("contracts/testing/liquity/TellorCaller.sol:TellorCaller")
    let tellorCallerTest = await TellorCallerTest.deploy(tellor.address)
    await liquityPriceFeed.fetchPrice()
    await governance.executeVote(voteCount)
    await liquityPriceFeed.fetchPrice()
    await tellor.connect(devWallet).init()
    await liquityPriceFeed.fetchPrice()

    await h.advanceTime(3600 * 24 * 7)
    await liquityPriceFeed.fetchPrice()

    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(100E18))
    await tellor.connect(accounts[10]).approve(oracle.address, BigInt(10E18))
    await oracle.connect(accounts[10]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[10]).submitValue(ETH_QUERY_ID,h.uintTob32(h.toWei("2095.15")),0,ETH_QUERY_DATA)
    blocky0 = await h.getBlock()
    await h.advanceTime(60 * 15 + 1)

    retrievedVal = await tellor["retrieveData(uint256,uint256)"](1, 0);
    assert(retrievedVal == 2095150000, "retrieved data should be correct")

    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    expect(lastGoodPrice).to.equal("2095150000000000000000", "Liquity ether price should be correct")
    currentVal = await tellorCallerTest.getTellorCurrentValue(1)
    assert(currentVal[0] == true, "ifRetrieve should be correct")
    assert(currentVal[1] == 2095150000, "current value should be correct")
    assert(currentVal[2] == blocky0.timestamp, "current timestamp should be correct")

    await h.advanceTime(60*60*12)
    await oracle.connect(accounts[10]).submitValue(ETH_QUERY_ID,h.uintTob32(h.toWei("3395.16")),0,ETH_QUERY_DATA)
    blocky1 = await h.getBlock()
    
    // fetch price without advancing time
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    expect(lastGoodPrice).to.equal("2095150000000000000000", "Liquity ether price should be correct")
    currentVal = await tellorCallerTest.getTellorCurrentValue(1)
    assert(currentVal[0] == true, "ifRetrieve should be correct")
    assert(currentVal[1] == 2095150000, "current value should be correct")
    assert(currentVal[2] == blocky0.timestamp, "current timestamp should be correct")
    
    await h.advanceTime(60 * 15 + 1)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    currentVal = await tellorCallerTest.getTellorCurrentValue(1)
    expect(lastGoodPrice).to.eq("3395160000000000000000", "Liquity ether price should be correct")
    currentVal = await tellorCallerTest.getTellorCurrentValue(1)
    assert(currentVal[0] == true, "ifRetrieve should be correct")
    assert(currentVal[1] == 3395160000, "current value should be correct")
    assert(currentVal[2] == blocky1.timestamp, "current timestamp should be correct")

    await h.advanceTime(60*60*12)
    await oracle.connect(accounts[10]).submitValue(ETH_QUERY_ID,h.uintTob32(h.toWei("3395.17")),0,ETH_QUERY_DATA)
    await h.advanceTime(60 * 15 + 1)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    assert(lastGoodPrice == "3395170000000000000000", "Liquity ether price should be correct")
  })

  it("disputes on tellorx work for first 12 hours", async function () {
    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(100E18))

    // stake account on tellor master (tellorx oracle)
    await tellor.connect(accounts[10]).depositStake()

    //account submits a value
    valueCount = await tellor.getNewValueCountbyRequestId(1)
    await oldOracle.connect(accounts[10]).submitValue(ETH_QUERY_ID, h.uintTob32("3395170000"), 0, ETH_QUERY_DATA)
    blocky = await h.getBlock()

    //account disputes their value
    await governance.connect(bigWallet).beginDispute(ETH_QUERY_ID, blocky.timestamp)
    newVoteCount = await governance.getVoteCount()
    await governance.connect(bigWallet).vote(newVoteCount, true, false)

    // init 360
    await governance.executeVote(voteCount)
    await tellor.connect(devWallet).init()
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
    await tellor.connect(devWallet).init()
  })

  it("stakers on tellorx can withdraw and re-stake on tellorflex", async function() {
    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(100E18))
    await tellor.connect(accounts[10]).depositStake()
    await h.expectThrow(tellor.connect(accounts[10]).transfer(accounts[9].address, BigInt(100E18)))

    // execute upgrade proposal
    await governance.executeVote(voteCount)
    await tellor.init()

    // ensure old staker can transfer tokens
    await tellor.connect(accounts[10]).transfer(accounts[9].address, BigInt(100E18))
    await tellor.connect(accounts[9]).transfer(accounts[10].address, BigInt(100E18))

    // ensure staker can stake in new oracle
    await tellor.connect(accounts[10]).approve(oracle.address, BigInt(100E18))
    await oracle.connect(accounts[10]).depositStake(BigInt(100E18))
  })

  it("ampl can read from TellorMaster", async function() {
    let tellorProviderAmpl = await ethers.getContractAt("contracts/testing/TellorProvider.sol:TellorProvider", TELLOR_PROVIDER_AMPL)
    let medianOracleAmpl = await ethers.getContractAt("contracts/testing/MedianOracle.sol:MedianOracle", MEDIAN_ORACLE_AMPL)

    // submit ampl value to tellorx
    let amplValCount = await tellor.getNewValueCountbyRequestId(10)
    await oldOracle.connect(accounts[4]).submitValue(h.uintTob32(10), h.uintTob32(web3.utils.toWei(".95")), amplValCount, '0x')
    blocky1 = await h.getBlock()

    // advance time
    await h.advanceTime(86400)

    // push tellor value to ampl provider
    await tellorProviderAmpl.pushTellor()
    
    // ensure correct timestamp pushed to tellor provider
    tellorReport = await tellorProviderAmpl.tellorReport()
    assert(tellorReport[0] == blocky1.timestamp || tellorReport[1] == blocky1.timestamp, "tellor report not pushed")

    // ensure correct oracle value pushed to medianOracle contract
    providerReports0 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 0)
    providerReports1 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 1)
    assert(providerReports0.payload == web3.utils.toWei(".95") || providerReports1.payload == web3.utils.toWei(".95"), "tellor report not pushed")

    // submit ampl value to 360 oracle
    await oracle.connect(accounts[1]).submitValue(AMPL_QUERY_ID, h.uintTob32(web3.utils.toWei("1.23")), 0, AMPL_QUERY_DATA)
    blocky2 = await h.getBlock()

    // upgrade to tellor360
    await governance.executeVote(voteCount)

    // ensure correct oracle value pushed to medianOracle contract
    providerReports0 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 0)
    providerReports1 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 1)
    assert(providerReports0.payload == web3.utils.toWei(".95") || providerReports1.payload == web3.utils.toWei(".95"), "tellor report not pushed")
    
        
    await tellor.connect(devWallet).init()

    // ensure correct oracle value pushed to medianOracle contract
    providerReports0 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 0)
    providerReports1 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 1)
    assert(providerReports0.payload == web3.utils.toWei(".95") || providerReports1.payload == web3.utils.toWei(".95"), "tellor report not pushed")
        

    // advance time
    await h.advanceTime(86400)

    // push tellor value to ampl provider
    await tellorProviderAmpl.pushTellor()

    // ensure correct timestamp pushed to tellor provider
    tellorReport = await tellorProviderAmpl.tellorReport()
    assert(tellorReport[0] == blocky2.timestamp || tellorReport[1] == blocky2.timestamp, "tellor report not pushed")

    // ensure correct oracle value pushed to medianOracle contract
    providerReports0 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 0)
    providerReports1 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 1)
    assert(providerReports0.payload == web3.utils.toWei("1.23") || providerReports1.payload == web3.utils.toWei("1.23"), "tellor report not pushed")
    
    await oracle.connect(accounts[1]).submitValue(AMPL_QUERY_ID, h.uintTob32(web3.utils.toWei(".99")), 1, AMPL_QUERY_DATA)
    blocky1 = await h.getBlock()

    // advance time
    await h.advanceTime(86400)
    // push tellor value to ampl provider
    await tellorProviderAmpl.pushTellor()
    
    // ensure correct timestamp pushed to tellor provider
    tellorReport = await tellorProviderAmpl.tellorReport()
    assert(tellorReport[0] == blocky1.timestamp || tellorReport[1] == blocky1.timestamp, "tellor report not pushed")

    // ensure correct oracle value pushed to medianOracle contract
    providerReports0 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 0)
    providerReports1 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 1)
    assert(providerReports0.payload == web3.utils.toWei(".99") || providerReports1.payload == web3.utils.toWei(".99"), "tellor report not pushed")
  })

  it("ensure no submissions between 360 execution and init", async function() {
    // submit from existing staker
    await oldOracle.connect(accounts[4]).submitValue(h.uintTob32(70), h.uintTob32(456), 0, '0x')

    // add another staker and submit
    await tellor.connect(devWallet).transfer(accounts[9].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[9]).depositStake()
    await oldOracle.connect(accounts[9]).submitValue(h.uintTob32(70), h.bytes(100), 1, '0x')

    // advance past reporting lock
    await h.advanceTime(86400)

    // execute vote
    await governance.executeVote(voteCount)

    // ensure can't submit to old oracle
    await h.expectThrow(oldOracle.connect(accounts[4]).submitValue(h.uintTob32(70), h.uintTob32(456), 2, '0x'))
    await h.expectThrow(oldOracle.connect(accounts[4]).submitValue(h.uintTob32(71), h.uintTob32(456), 0, '0x'))

    await h.expectThrow(oldOracle.connect(accounts[9]).submitValue(h.uintTob32(72), h.uintTob32(456), 0, '0x'))
    await h.expectThrow(oldOracle.connect(accounts[9]).submitValue(h.uintTob32(73), h.uintTob32(456), 0, '0x'))

    // init
    await tellor.connect(devWallet).init()

    // ensure can't submit to old oracle
    await h.expectThrow(oldOracle.connect(accounts[4]).submitValue(h.uintTob32(70), h.uintTob32(456), 2, '0x'))
    await h.expectThrow(oldOracle.connect(accounts[4]).submitValue(h.uintTob32(71), h.uintTob32(456), 0, '0x'))

    await h.expectThrow(oldOracle.connect(accounts[9]).submitValue(h.uintTob32(72), h.uintTob32(456), 0, '0x'))
    await h.expectThrow(oldOracle.connect(accounts[9]).submitValue(h.uintTob32(73), h.uintTob32(456), 0, '0x'))
  })

  it("disputed tellorx reporters can't transfer stake after init, but team can recover stake", async function() {
    acc3BalBefore = await tellor.balanceOf(accounts[3].address)
    acc4BalBefore = await tellor.balanceOf(accounts[4].address)

    await h.expectThrow(tellor.connect(accounts[3]).transfer(accounts[1].address, h.toWei("100"))) // reporter disputed

    // execute vote
    await governance.executeVote(voteCount)
    await h.expectThrow(tellor.connect(accounts[3]).transfer(accounts[1].address, h.toWei("100"))) // reporter disputed
    expect(await tellor.allowedToTrade(accounts[3].address, h.toWei("100"))).to.equal(false)
    // init
    await tellor.connect(accounts[1]).init()

    await h.expectThrow(tellor.connect(accounts[3]).transfer(accounts[1].address, h.toWei("100"))) // reporter disputed
    expect(await tellor.allowedToTrade(accounts[3].address, h.toWei("100"))).to.equal(false)
    await tellor.connect(devWallet).teamTransferDisputedStake(accounts[3].address, accounts[4].address)
    expect(await tellor.balanceOf(accounts[3].address)).to.equal(BigInt(acc3BalBefore) - BigInt(h.toWei("100"))) // acct 3 balance updates
    expect(await tellor.balanceOf(accounts[4].address)).to.equal(BigInt(acc4BalBefore) + BigInt(h.toWei("100"))) // acct 4 balance updates

    await h.expectThrow(tellor.connect(devWallet).teamTransferDisputedStake(accounts[3].address, accounts[4].address)) // team can't call again
    await tellor.connect(accounts[3]).transfer(accounts[4].address, h.toWei("1"))
  })

  it("Time based rewards after transition", async function() {
    // execute vote
    oldOracleBalance0 = await tellor.balanceOf(oldOracle.address)
    await governance.executeVote(voteCount)
    // init
    await tellor.connect(devWallet).init()
    // ensure can't submit to old oracle
    await h.expectThrow(oldOracle.connect(accounts[4]).submitValue(h.uintTob32(70), h.uintTob32(456), 2, '0x'))
    oldOracleBalance1 = await tellor.balanceOf(oldOracle.address)
    assert(oldOracleBalance1.toString() == oldOracleBalance0.toString(), "old oracle balance changed after update")
  })
});