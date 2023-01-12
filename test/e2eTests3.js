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
    const BIGWALLET = "0xf977814e90da44bfa03b6295a0616a897441acec"
    const GOVERNANCE_OLD = "0x02803dcFD7Cb32E97320CFe7449BFb45b6C931b8"
    const REPORTER = "0x0D4F81320d36d7B7Cf5fE7d1D547f63EcBD1a3E0"
    const LIQUITY_PRICE_FEED = "0x4c517D4e2C851CA76d7eC94B805269Df0f2201De"
    const TELLOR_ORACLE_OLD = "0xB3B662644F8d3138df63D2F43068ea621e2981f9"
    const TELLOR_PROVIDER_AMPL = "0xf5b7562791114fB1A8838A9E8025de4b7627Aa79"
    const MEDIAN_ORACLE_AMPL = "0x99C9775E076FDF99388C029550155032Ba2d8914"
    const STAKE_AMOUNT_DOLLAR_TARGET = h.toWei("1500")
    const MINIMUM_STAKE_AMOUNT = web3.utils.toWei("100")
    const REPORTING_LOCK = 12*60*60
    const keccak256 = web3.utils.keccak256;
    const abiCoder = new ethers.utils.AbiCoder();
    const TRB_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["trb", "usd"]);
    const TRB_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", TRB_QUERY_DATA_ARGS]);
    const TRB_QUERY_ID = web3.utils.keccak256(TRB_QUERY_DATA);
    const ETH_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["eth", "usd"]);
    const ETH_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", ETH_QUERY_DATA_ARGS]);
    const ETH_QUERY_ID = web3.utils.keccak256(ETH_QUERY_DATA);
    const AMPL_QUERY_DATA_ARGS = abiCoder.encode(["bytes"], ["0x"])
    const AMPL_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["AmpleforthCustomSpotPrice", AMPL_QUERY_DATA_ARGS]);
    const AMPL_QUERY_ID = web3.utils.keccak256(AMPL_QUERY_DATA);
    const TELLOR_ORACLE_ADDRESS_QUERY_DATA_ARGS = abiCoder.encode(["bytes"], ["0x"])
    const TELLOR_ORACLE_ADDRESS_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["TellorOracleAddress", TELLOR_ORACLE_ADDRESS_QUERY_DATA_ARGS]);
    const TELLOR_ORACLE_ADDRESS_QUERY_ID = web3.utils.keccak256(TELLOR_ORACLE_ADDRESS_QUERY_DATA);

    let accounts = null
    let oracle = null
    let tellor = null
    let governanceOld = null
    let cfac,ofac,tfac,gfac,parachute,govBig,govTeam
    let govSigner = null
    let devWallet = null
    let oracleOld
    let governance = null
    let voteCount = null

  beforeEach("deploy and setup Tellor360", async function () {

    await hre.network.provider.request({
      method: "hardhat_reset",
      params: [{forking: {
            jsonRpcUrl: hre.config.networks.hardhat.forking.url,
            blockNumber:16385143

          },},],
      });

    await new Promise(r => setTimeout(r, 1000));

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [BIGWALLET]}
    )

    await new Promise(r => setTimeout(r, 1000));


    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [PARACHUTE]}
    )

    await new Promise(r => setTimeout(r, 1000));


    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [DEV_WALLET]
    })

    await new Promise(r => setTimeout(r, 2000));

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [REPORTER]
    })

    await new Promise(r => setTimeout(r, 2000));


    //account forks
    accounts = await ethers.getSigners()
    devWallet = await ethers.provider.getSigner(DEV_WALLET);
    bigWallet = await ethers.provider.getSigner(BIGWALLET);
    reporter = await ethers.provider.getSigner(REPORTER)

    //contract forks
    tellor = await ethers.getContractAt("contracts/oldContracts/contracts/interfaces/ITellor.sol:ITellor", tellorMaster)
    governanceOld = await ethers.getContractAt("polygongovernance/contracts/Governance.sol:Governance", GOVERNANCE_OLD)
    oracleOld = await ethers.getContractAt("TellorFlex", TELLOR_ORACLE_OLD)
    parachute = await ethers.getContractAt("contracts/oldContracts/contracts/interfaces/ITellor.sol:ITellor",PARACHUTE, devWallet);
    
    await new Promise(r => setTimeout(r, 2000));

    // deploy new contracts
    let oracleFactory = await ethers.getContractFactory("TellorFlex")
    oracle = await oracleFactory.deploy(tellorMaster, REPORTING_LOCK, STAKE_AMOUNT_DOLLAR_TARGET, h.toWei("15"), MINIMUM_STAKE_AMOUNT, TRB_QUERY_ID)
    await oracle.deployed()
    await new Promise(r => setTimeout(r, 1000));

    let governanceFactory = await ethers.getContractFactory("polygongovernance/contracts/Governance.sol:Governance")
    governance = await governanceFactory.deploy(oracle.address, DEV_WALLET)
    await governance.deployed()

    // sleep 1 second for api rate limit
    await new Promise(r => setTimeout(r, 1000));

    await oracle.init(governance.address)

    // sleep 1 second for api rate limit
    await new Promise(r => setTimeout(r, 1000));

    // submit eth price to new oracle
    await tellor.connect(devWallet).transfer(accounts[1].address, web3.utils.toWei("200"));
    await new Promise(r => setTimeout(r, 1000));
    await tellor.connect(accounts[1]).approve(oracle.address, h.toWei("200"))
    await new Promise(r => setTimeout(r, 2000));
    await oracle.connect(accounts[1]).depositStake(h.toWei("200"))
    await new Promise(r => setTimeout(r, 1000));
    await oracle.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.uintTob32(h.toWei("100")), 0, ETH_QUERY_DATA)
    await new Promise(r => setTimeout(r, 2000));

    // submit new oracle address to old oracle
    await tellor.connect(devWallet).transfer(accounts[2].address, h.toWei("200"));
    await new Promise(r => setTimeout(r, 2000));
    await tellor.connect(accounts[2]).approve(oracleOld.address, h.toWei("200"))
    await new Promise(r => setTimeout(r, 1000));
    await oracleOld.connect(accounts[2]).depositStake(h.toWei("200"))
    await new Promise(r => setTimeout(r, 2000));
    newOracleAddressEncoded = abiCoder.encode(["address"], [oracle.address])
    await oracleOld.connect(accounts[2]).submitValue(TELLOR_ORACLE_ADDRESS_QUERY_ID, newOracleAddressEncoded, 0, TELLOR_ORACLE_ADDRESS_QUERY_DATA)
    await new Promise(r => setTimeout(r, 2000));
    await h.advanceTime(86400 / 2)

    await tellor.updateOracleAddress()
    await new Promise(r => setTimeout(r, 1000));

    await h.advanceTime(86400 * 7)

    await tellor.updateOracleAddress()

    // sleep 1 second for api rate limit
    await new Promise(r => setTimeout(r, 1000));
  });

  it("ensure oracle address updated", async function() {
    officialOracleAddress = await tellor.getAddressVars(h.hash("_ORACLE_CONTRACT"))
    assert(officialOracleAddress == oracle.address, "new oracle address not set")
  });

  it("Mine 2 values on 50 different ID's", async function () {
    await tellor.connect(bigWallet).transfer(accounts[9].address, BigInt(1200E18))
    await tellor.connect(bigWallet).transfer(accounts[10].address, BigInt(1200E18))
    await tellor.connect(accounts[9]).approve(oracle.address, BigInt(1200E18))
    await tellor.connect(accounts[10]).approve(oracle.address, BigInt(1200E18))
    await oracle.connect(accounts[9]).depositStake(BigInt(1200E18))
    await oracle.connect(accounts[10]).depositStake(BigInt(1200E18))

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

  it("Manually verify that Liquity still work (mainnet fork their state after oracle updates)", async function() {
    let liquityPriceFeed = await ethers.getContractAt("contracts/testing/IPriceFeed.sol:IPriceFeed", LIQUITY_PRICE_FEED)
    await liquityPriceFeed.fetchPrice()
    lastGoodPrice = await liquityPriceFeed.lastGoodPrice()
    expect(lastGoodPrice).to.equal("1324680000000000000000", "Liquity ether price should be correct")

    await tellor.connect(bigWallet).transfer(accounts[10].address, h.toWei("200"))
    await tellor.connect(accounts[10]).approve(oracle.address, h.toWei("200"))
    await oracle.connect(accounts[10]).depositStake(h.toWei("200"))
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

  it("stakers on old tellorflex can withdraw", async function() {
    // accounts[2] has 200 stake
    reporterBalBefore = await tellor.balanceOf(accounts[2].address)
    await oracleOld.connect(accounts[2]).requestStakingWithdraw(h.toWei("200"))
    await h.advanceTime(86400 * 7)
    await oracleOld.connect(accounts[2]).withdrawStake()
    reporterBal = await tellor.balanceOf(accounts[2].address)
    assert(BigInt(reporterBal) > BigInt(reporterBalBefore) + BigInt(h.toWei("200")), "reporter balance should be correct")
  })

  it("ampl can read from TellorMaster", async function() {
    let tellorProviderAmpl = await ethers.getContractAt("contracts/testing/TellorProvider.sol:TellorProvider", TELLOR_PROVIDER_AMPL)
    let medianOracleAmpl = await ethers.getContractAt("contracts/testing/MedianOracle.sol:MedianOracle", MEDIAN_ORACLE_AMPL)

    // submit ampl value to new oracle
    await oracle.connect(accounts[1]).submitValue(AMPL_QUERY_ID, h.uintTob32(web3.utils.toWei("1.23")), 0, AMPL_QUERY_DATA)
    blocky2 = await h.getBlock()

    await tellorProviderAmpl.pushTellor()

    // ensure correct oracle value pushed to medianOracle contract
    providerReports0 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 0)
    providerReports1 = await medianOracleAmpl.providerReports(tellorProviderAmpl.address, 1)
    assert(providerReports0.payload == web3.utils.toWei("1.23") || providerReports1.payload == web3.utils.toWei("1.23"), "tellor report not pushed")
        
    // ensure correct timestamp pushed to tellor provider
    tellorReport = await tellorProviderAmpl.tellorReport()
    assert(tellorReport[0] == blocky2.timestamp || tellorReport[1] == blocky2.timestamp, "tellor report not pushed")

    // advance time
    await h.advanceTime(86400)
    
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

  it("Mint to oracle", async function() {
    newOracleBalance = await tellor.balanceOf(oracle.address)
    await tellor.mintToOracle();
    newOracleBalance2 = await tellor.balanceOf(oracle.address)
    assert(BigInt(newOracleBalance2) > BigInt(newOracleBalance), "oracle balance should be correct")
  })

  it("Mint to team", async function() {
    teamBalance = await tellor.balanceOf(DEV_WALLET)
    await tellor.mintToTeam();
    teamBalance2 = await tellor.balanceOf(DEV_WALLET)
    assert(BigInt(teamBalance2) > BigInt(teamBalance), "team balance should be correct")
  })

  it("mint to oracle mints correctly", async function() {
    //fast forward 12 hours
    await tellor.mintToOracle()
    blocky0 = await h.getBlock()
    //get _ORACLE_CONTRACT contract balance
    let oldBalance = BigInt(await tellor.balanceOf(oracle.address))
    //fast forward one day
    h.advanceTime(86399)
    //mint
    await tellor.mintToOracle()
    blocky1 = await h.getBlock()
    blocky1Retrieved = await tellor.getUintVar(h.hash("_LAST_RELEASE_TIME_DAO"))
    let newBalance = BigInt(await tellor.balanceOf(oracle.address))
    expectedBalance1 =  oldBalance + (BigInt(h.toWei("146.94")) * BigInt(blocky1Retrieved - blocky0.timestamp)) / BigInt(86400)
    expect(newBalance).to.equal(expectedBalance1)

    for (let i = 1; i <= 15; i++) {
      await h.advanceTime(86400 * i)
      await tellor.mintToOracle()
    }

    await h.advanceTime(86400 * 7 * 12)

    await tellor.mintToOracle()
    blocky2 = await h.getBlock()
    blocky2Retrieved = await tellor.getUintVar(h.hash("_LAST_RELEASE_TIME_DAO"))

    newBalance = BigInt(await tellor.balanceOf(oracle.address))
    expectedBalance2 =  expectedBalance1 + (BigInt(h.toWei("146.94")) * BigInt(blocky2Retrieved - blocky1Retrieved)) / BigInt(86400)
    assert(newBalance > expectedBalance2 - BigInt(10), "time based rewards not minted correctly")
    assert(newBalance < expectedBalance2 + BigInt(10), "time based rewards not minted correctly")
  })
});