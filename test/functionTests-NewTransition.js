const { AbiCoder } = require("@ethersproject/abi");
const { expect } = require("chai");
const h = require("./helpers/helpers");
var assert = require('assert');
const web3 = require('web3');
const { ethers } = require("hardhat");

describe("Function Tests - NewTransition", function() {

  const tellorMaster = "0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0"
  const DEV_WALLET = "0x39E419bA25196794B595B2a595Ea8E527ddC9856"
  const PARACHUTE = "0x83eB2094072f6eD9F57d3F19f54820ee0BaE6084"
  const BIGWALLET = "0xf977814e90da44bfa03b6295a0616a897441acec";
  const CURR_GOV = "0x51d4088d4EeE00Ae4c55f46E0673e9997121DB00"
  const REPORTER = "0x0D4F81320d36d7B7Cf5fE7d1D547f63EcBD1a3E0"
  const TELLORX_ORACLE = "0xe8218cACb0a5421BC6409e498d9f8CC8869945ea"
  const TRB_QUERY_ID = "0x5c13cd9c97dbb98f2429c101a2a8150e6c7a0ddaff6124ee176a3a411067ded0"

  let accounts = null
  let oracle = null
  let tellor = null
  let newGovernance = null
  let governance = null
  let govSigner = null
  let devWallet = null
  let totalSupply = null
  let blockyOld1 = null
  let blockyNew2 = null
  let blockyNew3 = null

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
    oracle = await oracleFactory.deploy(tellorMaster, 12*60*60, BigInt(100E18), BigInt(10E18), TRB_QUERY_ID)
    await oracle.deployed()

    let governanceFactory = await ethers.getContractFactory("contracts/testing/TestGovernance.sol:TestGovernance")
    newGovernance = await governanceFactory.deploy(oracle.address, DEV_WALLET)
    await newGovernance.deployed()

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [newGovernance.address]
    })
    govSigner = await ethers.getSigner(newGovernance.address);
    await accounts[10].sendTransaction({ to: newGovernance.address, value: ethers.utils.parseEther("1.0") });

    await oracle.init(newGovernance.address)

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
    blockyNew3 = await h.getBlock()

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
    totalSupply = await tellor.totalSupply()
    await governance.executeVote(voteCount)
  });

  it("decimals()", async function () {
    expect(await tellor.decimals()).to.equal(18)
  })

  it("getAddressVars()", async function () {
    await tellor.connect(devWallet).init()
    expect(await tellor.getAddressVars(h.hash("_ORACLE_CONTRACT"))).to.equal(oracle.address)
  })

  it("getLastNewValueById()", async function () {
    // retrieve from old oracle
    lastNewVal = await tellor.getLastNewValueById(70)
    expect(lastNewVal[0]).to.equal(200)
    expect(lastNewVal[1]).to.be.true

    // INIT TELLORFLEX
    await tellor.connect(devWallet).init()

    // retrieve from new oracle
    lastNewVal = await tellor.getLastNewValueById(70)
    expect(lastNewVal[0]).to.equal(100)
    expect(lastNewVal[1]).to.be.true

    // dispute last value
    await oracle.connect(govSigner).removeValue(h.uintTob32(70), blockyNew2.timestamp)

    // retrieve value
    lastNewVal = await tellor.getLastNewValueById(70)
    expect(lastNewVal[0]).to.equal(99)

    // dispute first value
    await oracle.connect(govSigner).removeValue(h.uintTob32(70), blockyNew1.timestamp)

    // retrieve value
    lastNewVal = await tellor.getLastNewValueById(70)
    expect(lastNewVal[0]).to.equal(0)
  })

  it("getNewCurrentVariables()", async function () {
    abiCoder = new ethers.utils.AbiCoder()

    // retrieve from old oracle
    currentVars = await tellor.getNewCurrentVariables()
    encodedTime = abiCoder.encode(["uint256"], [blockyOld1.timestamp])
    expect(currentVars[0]).to.equal(ethers.utils.keccak256(encodedTime))

    // init tellor360
    await tellor.connect(devWallet).init()

    // retrieve from new oracle
    currentVars = await tellor.getNewCurrentVariables()
    encodedTime = abiCoder.encode(["uint256"], [blockyNew3.timestamp])
    expect(currentVars[0]).to.equal(ethers.utils.keccak256(encodedTime))
  })

  it("getNewValueCountByRequestId()", async function () {
    // retrieve from old oracle
    newValCount = await tellor.getNewValueCountbyRequestId(70)
    expect(newValCount).to.equal(1)

    // init tellor360
    await tellor.connect(devWallet).init()

    // retrieve from new oracle
    newValCount = await tellor.getNewValueCountbyRequestId(70)
    expect(newValCount).to.equal(2)

    // dispute last value
    await oracle.connect(govSigner).removeValue(h.uintTob32(70), blockyNew2.timestamp)

    // retrieve from new oracle
    newValCount = await tellor.getNewValueCountbyRequestId(70)
    expect(newValCount).to.equal(1)

    // dispute first value
    await oracle.connect(govSigner).removeValue(h.uintTob32(70), blockyNew1.timestamp)
    
    // retrieve from new oracle
    newValCount = await tellor.getNewValueCountbyRequestId(70)
    expect(newValCount).to.equal(0)

    // get value count for requestId with 0 values
    newValCount = await tellor.getNewValueCountbyRequestId(71)
    expect(newValCount).to.equal(0)
  })

  it("getTimestampbyRequestIDandIndex()", async function () {
    // retrieve from old oracle
    timestampByIndex = await tellor.getTimestampbyRequestIDandIndex(70, 0)
    expect(timestampByIndex).to.equal(blockyOld1.timestamp)

    // INIT tellor360
    await tellor.connect(devWallet).init()

    // retrieve from new oracle
    timestampByIndex = await tellor.getTimestampbyRequestIDandIndex(70, 0)
    expect(timestampByIndex).to.equal(blockyNew1.timestamp)
  })

  it("getUintVar()", async function () {
    await tellor.connect(devWallet).init()
    expect(await tellor.getUintVar(h.hash("_STAKE_AMOUNT"))).to.equal(h.toWei("100"))
  })

  it("isMigrated()", async function () {
    expect(await tellor.isMigrated(DEV_WALLET)).to.be.true
    await tellor.connect(devWallet).init()
    expect(await tellor.isMigrated(DEV_WALLET)).to.be.true
    expect(await tellor.isMigrated(oracle.address)).to.be.false
  })

  it("name()", async function () {
    expect(await tellor.name()).to.equal("Tellor Tributes")
    await tellor.connect(devWallet).init()
    expect(await tellor.name()).to.equal("Tellor Tributes")
  })

  it("retrieveData()", async function () {
    retrievedVal = await tellor["retrieveData(uint256,uint256)"](70, blockyOld1.timestamp);
    expect(retrievedVal).to.equal(200)
    await tellor.connect(devWallet).init()
    retrievedVal = await tellor["retrieveData(uint256,uint256)"](70, blockyNew1.timestamp);
    expect(retrievedVal).to.equal(99)
  })

  it("symbol()", async function () {
    expect(await tellor.symbol()).to.equal("TRB")
    await tellor.connect(devWallet).init()
    expect(await tellor.symbol()).to.equal("TRB")
  })

  it("totalSupply()", async function () {
    expect(await tellor.totalSupply()).to.equal(totalSupply)
    await tellor.connect(devWallet).init()
    expect(await tellor.totalSupply()).to.equal(totalSupply)
  })

  it("_sliceUint()", async function () {
    expect(await tellor.sliceUintTest(h.uintTob32(123))).to.equal(123)
    await tellor.connect(devWallet).init()
    expect(await tellor.sliceUintTest(h.uintTob32(456))).to.equal(456)
  })
})
