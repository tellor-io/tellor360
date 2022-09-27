const { AbiCoder } = require("@ethersproject/abi");
const { expect } = require("chai");
const {ethers} = require("hardhat")
const h = require("./helpers/helpers");
var assert = require('assert');
const web3 = require('web3');
const { BigNumber } = require("ethers");

describe("End-to-End Tests - Two", function() {

    const tellorMaster = "0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0"
    const DEV_WALLET = "0x39E419bA25196794B595B2a595Ea8E527ddC9856"
    const PARACHUTE = "0x83eB2094072f6eD9F57d3F19f54820ee0BaE6084"
    const BIGWALLET = "0xf977814e90da44bfa03b6295a0616a897441acec";
    const CURR_GOV = "0x51d4088d4EeE00Ae4c55f46E0673e9997121DB00"
    const REPORTER = "0x0D4F81320d36d7B7Cf5fE7d1D547f63EcBD1a3E0"
    const LIQUITY_PRICE_FEED = "0x4c517D4e2C851CA76d7eC94B805269Df0f2201De"
    const TELLORX_ORACLE = "0xe8218cACb0a5421BC6409e498d9f8CC8869945ea"
    const TRB_QUERY_ID = "0x0000000000000000000000000000000000000000000000000000000000000032"
    const keccak256 = web3.utils.keccak256;
    const abiCoder = new ethers.utils.AbiCoder();
    const ETH_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["eth", "usd"]);
    const ETH_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", ETH_QUERY_DATA_ARGS]);
    const ETH_QUERY_ID = web3.utils.keccak256(ETH_QUERY_DATA);

    let accounts = null
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

    // deploy tellorFlex
    let oracleFactory = await ethers.getContractFactory("TellorFlex")
    oracle = await oracleFactory.deploy(tellorMaster, 12*60*60, BigInt(100E18), BigInt(10E18), TRB_QUERY_ID)
    await oracle.deployed()

    let governanceFactory = await ethers.getContractFactory("contracts/oldContracts/contracts/Governance360.sol:Governance")
    newGovernance = await governanceFactory.deploy(oracle.address, DEV_WALLET)
    await newGovernance.deployed()

    await oracle.init(newGovernance.address)

    // submit 2 queryId=70 values to new flex
    await tellor.connect(devWallet).transfer(accounts[1].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[1]).approve(oracle.address, BigInt(10E18))
    await oracle.connect(accounts[1]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[1]).submitValue(keccak256(h.uintTob32(70)), h.bytes(99), 0, h.uintTob32(70))
    blockyNew1 = await h.getBlock()

    await tellor.connect(devWallet).transfer(accounts[6].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[6]).approve(oracle.address, BigInt(10E18))
    await oracle.connect(accounts[6]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[6]).submitValue(keccak256(h.uintTob32(70)), h.bytes(100), 0, h.uintTob32(70))
    blockyNew2 = await h.getBlock()

    // submit 1 queryId=1 value to new flex (required for 360 init)
    await tellor.connect(devWallet).transfer(accounts[5].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[5]).approve(oracle.address, BigInt(10E18))
    await oracle.connect(accounts[5]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[5]).submitValue(ETH_QUERY_ID, h.uintTob32(1000), 0, ETH_QUERY_DATA)

    //tellorx staker
    await tellor.connect(devWallet).transfer(accounts[2].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[2]).depositStake()
    

    //disputed tellorx staker
    await tellor.connect(devWallet).transfer(accounts[3].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[3]).depositStake()
    await oldOracle.connect(accounts[3]).submitValue(h.uintTob32(70), h.bytes(200), 0, '0x')
    blockyOld1 = await h.getBlock()

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

  })

  it("values can be retrieved through whole transition period", async function () {
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

    // init 360
    await tellor.connect(devWallet).init()

    // getLastNewValueById
    lastNewVal = await tellor.getLastNewValueById(keccak256(h.uintTob32(70)))
    expect(lastNewVal[0]).to.equal(100)
    expect(lastNewVal[1]).to.be.true

    // getNewValueCountbyRequestId
    newValCount = await tellor.getNewValueCountbyRequestId(keccak256(h.uintTob32(70)))
    expect(newValCount).to.equal(2)
  })

  it("mint to oracle mints correctly", async function() {
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
    blocky1Retrieved = await tellor.getUintVar(h.hash("_LAST_RELEASE_TIME_DAO"))
    let newBalance = BigInt(await tellor.balanceOf(oracle.address))
    expectedBalance1 = oldBalance + (BigInt(web3.utils.toWei("146.94")) * BigInt(blocky1.timestamp - (blocky0.timestamp - (86400 * 7 * 12)))) / BigInt(86400)
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
