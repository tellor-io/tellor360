const { expect } = require("chai");
const h = require("./helpers/helpers");
var assert = require('assert');
const web3 = require('web3');
const { ethers } = require("hardhat");

describe("Function Tests - Tellor360", function() {

  const tellorMaster = "0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0"
  const DEV_WALLET = "0x39E419bA25196794B595B2a595Ea8E527ddC9856"
  const PARACHUTE = "0x83eB2094072f6eD9F57d3F19f54820ee0BaE6084"
  const BIGWALLET = "0xf977814e90da44bfa03b6295a0616a897441acec";
  const CURR_GOV = "0x51d4088d4EeE00Ae4c55f46E0673e9997121DB00"
  const REPORTER = "0x0D4F81320d36d7B7Cf5fE7d1D547f63EcBD1a3E0"
  const TELLORX_ORACLE = "0xe8218cACb0a5421BC6409e498d9f8CC8869945ea"
  const TRB_QUERY_ID = "0x0000000000000000000000000000000000000000000000000000000000000032"
  const MINIMUM_STAKE_AMOUNT = web3.utils.toWei("10")
  const abiCoder = new ethers.utils.AbiCoder();
  const keccak256 = web3.utils.keccak256;
  const ETH_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["eth", "usd"]);
  const ETH_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", ETH_QUERY_DATA_ARGS]);
  const ETH_QUERY_ID = web3.utils.keccak256(ETH_QUERY_DATA);


  let accounts = null
  let oracle = null
  let tellor = null
  let newGovernance = null
  let governance = null
  let controller = null
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
        params: [PARACHUTE]}
    )

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [BIGWALLET]}
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
    controller = await controllerFactory.deploy(oracle.address)
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

    // sleep 1 second for api rate limit
    await new Promise(r => setTimeout(r, 1000));
  });

  it("constructor()", async function() {
    expect(await controller.getAddressVars(h.hash("_ORACLE_CONTRACT_FOR_INIT"))).to.equal(oracle.address)
    controllerFactory = await ethers.getContractFactory("Test360")
    await h.expectThrow(controllerFactory.deploy('0x0000000000000000000000000000000000000000'))
  })

  it("init()", async function () {  
    await expect(
      tellor.connect(devWallet).init(),
      "was able to init tellor360 with empty tellorflex"
    ).to.be.reverted

    //submit a value
    await tellor.connect(devWallet).transfer(accounts[1].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[1]).approve(oracle.address, BigInt(10E18))
    await oracle.connect(accounts[1]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.bytes(100), 0, ETH_QUERY_DATA)

    //fast forward 12 hours
    h.advanceTime(60*60*12)

    oldGovBal = await tellor.balanceOf(CURR_GOV)
    oldDevWalletBal = await tellor.balanceOf(DEV_WALLET)

    // successful upgrade...
    // anyone can call init
    await tellor.connect(accounts[10]).init()
    blocky = await h.getBlock()

    //assert the _ORACLE_CONTRACT is now flex
    let oracleContract = await tellor.getAddressVars(h.hash("_ORACLE_CONTRACT"))
    expect(oracleContract).to.equal(oracle.address)

    //require 2: can only be called once
    await expect(
      tellor.connect(devWallet).init(),
      "was able to init twice!"
    ).to.be.reverted  

    expect(await tellor.getUintVar(h.hash("_INIT"))).to.equal(1)
    expect(await tellor.getAddressVars(h.hash("_ORACLE_CONTRACT"))).to.equal(oracle.address)
    expect(await tellor.getUintVar(h.hash("_LAST_RELEASE_TIME_TEAM"))).to.equal(blocky.timestamp)
    expect(await tellor.getUintVar(h.hash("_LAST_RELEASE_TIME_DAO"))).to.equal(blocky.timestamp - (86400 * 7 * 12))

    newDevWalletBal = await tellor.balanceOf(DEV_WALLET)
    expect(newDevWalletBal).to.equal(BigInt(oldDevWalletBal) + BigInt(oldGovBal))
    expect(await tellor.balanceOf(CURR_GOV)).to.equal(0)
  })

  it("migrate()", async function() {
    // init 360
    await oracle.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.bytes(100), 0, ETH_QUERY_DATA)
   //fast forward 12 hours
    h.advanceTime(60*60*12)
    await tellor.connect(devWallet).init()

    // setup migrate
    let tofac = await ethers.getContractFactory("contracts/testing/TestToken.sol:TestToken");
    let token = await tofac.deploy();
    await token.deployed()
    await token.mint(accounts[5].address, 500)
    await tellor.changeAddressVar(h.hash("_OLD_TELLOR"), token.address)

    // migrate
    await tellor.connect(accounts[5]).migrate();
    h.expectThrow(tellor.connect(accounts[5]).migrate());//should fail if run twice
    assert(await tellor.balanceOf(accounts[5].address) == 500, "migration should work correctly")
  });

  it("mintToTeam()", async function () {
    await oracle.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.bytes(100), 0, ETH_QUERY_DATA)
    await h.expectThrow(tellor.mintToTeam()) // tellor360 not initiated
   //fast forward 12 hours
    h.advanceTime(60*60*12)
    await tellor.connect(devWallet).init()
    //get _OWNER account address
    let owner = await tellor.getAddressVars(h.hash("_OWNER"))
    expect(owner).to.equal(DEV_WALLET)
    //get _OWNER contract balance
    let oldBalance = await tellor.balanceOf(owner)
    //fast forward one day
    h.advanceTime(86399)
    //mint
    await tellor.mintToTeam()
    //_OWNER balance should be greater by 131.5 tokens
    let newBalance = await tellor.balanceOf(owner)
    let val = 1*newBalance - 1*oldBalance - 1*web3.utils.toWei("146.94")
    assert(val > 0, "owner balance should go up")
    assert (val < web3.utils.toWei(".001"), "error for rounding")
  });

  it("mintToOracle()", async function () {
    await oracle.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.bytes(100), 0, ETH_QUERY_DATA)
    await h.expectThrow(tellor.mintToOracle()) // tellor360 not initiated
    //fast forward 12 hours
    h.advanceTime(60*60*12)
    await tellor.connect(devWallet).init()
    blocky0 = await h.getBlock()
    //get _ORACLE_CONTRACT contract balance
    let oldBalance = BigInt(await tellor.balanceOf(oracle.address))
    //fast forward one day
    h.advanceTime(86399)
    //mint
    await tellor.mintToOracle()
    blocky1 = await h.getBlock()
    let newBalance = BigInt(await tellor.balanceOf(oracle.address))
    expectedBalance1 = oldBalance + (BigInt(web3.utils.toWei("146.94")) * BigInt(blocky1.timestamp - (blocky0.timestamp - (86400 * 7 * 12)))) / BigInt(86400)
    expect(newBalance).to.equal(expectedBalance1)

    await h.advanceTime(86400 * 7 * 12)

    await tellor.mintToOracle()
    blocky2 = await h.getBlock()

    newBalance = BigInt(await tellor.balanceOf(oracle.address))
    expectedBalance2 =  (BigInt(h.toWei("146.94")) * BigInt(blocky2.timestamp - blocky1.timestamp + 1)) / BigInt(86400)
    expect(BigInt(newBalance) - BigInt(expectedBalance1)).to.equal(BigInt(expectedBalance2))
  });

  it("transferOutOfContract()", async function () {
    await oracle.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.bytes(100), 0, ETH_QUERY_DATA)
    await h.advanceTime(86400/2)
    await tellor.connect(devWallet).init()

    let oldTellorBalance = BigInt(await tellor.balanceOf(tellor.address))
    let oldMultisBalance = BigInt(await tellor.balanceOf(DEV_WALLET))

    //transfer tokens from contract to multis
    await tellor.transferOutOfContract()

    //read new balance of multis
    let newTellorBalance = BigInt(await tellor.balanceOf(tellor.address))
    let newMultisBalance = BigInt(await tellor.balanceOf(DEV_WALLET))

    expect(newTellorBalance).to.be.equal(BigInt(0))
    expect(newMultisBalance).to.be.equal(oldMultisBalance + oldTellorBalance)

    await h.advanceTime(86400 * 30)
    // make sure can't call and mint new tokens
    await tellor.transferOutOfContract()
    let newMultisBalance2 = BigInt(await tellor.balanceOf(DEV_WALLET))
    expect(newMultisBalance2).to.be.equal(newMultisBalance) // balance shouldn't change

    await tellor.connect(devWallet).transfer(tellor.address, newMultisBalance)
    expect(await tellor.balanceOf(tellor.address)).to.equal(newMultisBalance)
    expect(await tellor.balanceOf(DEV_WALLET)).to.equal(0)

    //transfer tokens from contract to multis
    await tellor.transferOutOfContract()
    expect(await tellor.balanceOf(tellor.address)).to.equal(0)
    expect(await tellor.balanceOf(DEV_WALLET)).to.equal(newMultisBalance)
  });

  it("updateOracleAddress()", async function () {
    await oracle.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.bytes(100), 0, ETH_QUERY_DATA)
    await h.advanceTime(86400/2)
    await tellor.connect(devWallet).init()

    // deploy new oracle
    let oracleFactory = await ethers.getContractFactory("TellorFlex")
    newOracle = await oracleFactory.deploy(tellorMaster, 12*60*60, BigInt(100E18), BigInt(10E18), MINIMUM_STAKE_AMOUNT, TRB_QUERY_ID)
    await newOracle.deployed()

    // deploy new governance
    let governanceFactory = await ethers.getContractFactory("polygongovernance/contracts/Governance.sol:Governance")
    newGovernance2 = await governanceFactory.deploy(oracle.address, DEV_WALLET)
    await newGovernance2.deployed()

    await newOracle.init(newGovernance2.address)

    expect(await tellor.getAddressVars(h.hash("_PROPOSED_ORACLE"))).to.equal('0x0000000000000000000000000000000000000000')
    expect(await tellor.getUintVar(h.hash("_TIME_PROPOSED_UPDATED"))).to.equal(0)

    await h.expectThrow(tellor.updateOracleAddress()) // no address submitted to oracle

    // TellorOracleAddress query type params
    oracleQueryDataPartial = abiCoder.encode(['bytes'], ['0x'])
    oracleQueryData = abiCoder.encode(['string', 'bytes'], ['TellorOracleAddress', oracleQueryDataPartial])
    oracleQueryId = ethers.utils.keccak256(oracleQueryData) // 0xcf0c5863be1cf3b948a9ff43290f931399765d051a60c3b23a4e098148b1f707
    newOracleAddressEncoded = abiCoder.encode(['address'], [newOracle.address])
    badOracleAddressEncoded = abiCoder.encode(['address'], [accounts[1].address])

    // submit bad oracle address
    await oracle.connect(accounts[1]).submitValue(oracleQueryId, badOracleAddressEncoded, 0, oracleQueryData)
    await h.advanceTime(86400/2 + 1)
    await h.expectThrow(tellor.updateOracleAddress()) // invalid oracle address

    // submit good oracle address
    await oracle.connect(accounts[1]).submitValue(oracleQueryId, newOracleAddressEncoded, 0, oracleQueryData)
    await h.advanceTime(86400/2)
    await tellor.updateOracleAddress()
    blockyProposedUpdate = await h.getBlock()

    expect(await tellor.getAddressVars(h.hash("_PROPOSED_ORACLE"))).to.equal(newOracle.address)
    expect(await tellor.getUintVar(h.hash("_TIME_PROPOSED_UPDATED"))).to.equal(blockyProposedUpdate.timestamp)

    await h.expectThrow(tellor.updateOracleAddress()) // 7 days have not passed since proposed

    await h.advanceTime(86400 * 7)

    await h.expectThrow(tellor.updateOracleAddress()) // 1st new oracle value must be 12+ hours old

    await tellor.connect(accounts[1]).approve(newOracle.address, BigInt(10E18))
    await newOracle.connect(accounts[1]).depositStake(BigInt(10E18))
    await newOracle.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.bytes(100), 0, ETH_QUERY_DATA)

    await h.expectThrow(tellor.updateOracleAddress()) // 1st new oracle value must be 12+ hours old
    
    await h.advanceTime(86400/2)

    expect(await tellor.getAddressVars(h.hash("_ORACLE_CONTRACT"))).to.equal(oracle.address)
    await tellor.updateOracleAddress()
    blockySwitchTime = await h.getBlock()

    expect(await tellor.getAddressVars(h.hash("_ORACLE_CONTRACT"))).to.equal(newOracle.address)
  });

  it("verify()", async function () {
    expect(await tellor.verify()).to.equal(9999)
  })

  it("_isValid()", async function () {
    await tellor.isValid(oracle.address)
    await h.expectThrow(tellor.isValid(accounts[1].address)) // not a valid tellor contract
  })  
})
