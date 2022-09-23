const { expect } = require("chai");
const {ethers} = require("hardhat")
const h = require("./helpers/helpers");
var assert = require('assert');
const web3 = require('web3');

describe("Parachute Tests", function() {

    const tellorMaster = "0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0"
    const DEV_WALLET = "0x39E419bA25196794B595B2a595Ea8E527ddC9856"
    const PARACHUTE = "0x83eB2094072f6eD9F57d3F19f54820ee0BaE6084"
    const BIGWALLET = "0xf977814e90da44bfa03b6295a0616a897441acec"
    const CURR_GOV = "0x51d4088d4EeE00Ae4c55f46E0673e9997121DB00"
    const REPORTER = "0x0D4F81320d36d7B7Cf5fE7d1D547f63EcBD1a3E0"
    const TELLORX_ORACLE = "0xe8218cACb0a5421BC6409e498d9f8CC8869945ea"
    const TRB_QUERY_ID = "0x0000000000000000000000000000000000000000000000000000000000000032"
    const abiCoder = new ethers.utils.AbiCoder();
    const ETH_QUERY_DATA_ARGS = abiCoder.encode(["string", "string"], ["eth", "usd"]);
    const ETH_QUERY_DATA = abiCoder.encode(["string", "bytes"], ["SpotPrice", ETH_QUERY_DATA_ARGS]);
    const ETH_QUERY_ID = web3.utils.keccak256(ETH_QUERY_DATA);

    let accounts = null
    let oracle = null
    let tellor = null
    let governance = null
    let parachute
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
    oracle = await oracleFactory.deploy(tellorMaster, 12*60*60, BigInt(100E18), BigInt(10E18), TRB_QUERY_ID)
    await oracle.deployed()

    let governanceFactory = await ethers.getContractFactory("contracts/oldContracts/contracts/Governance360.sol:Governance")
    newGovernance = await governanceFactory.deploy(oracle.address, DEV_WALLET)
    await newGovernance.deployed()

    await oracle.init(newGovernance.address)

    await tellor.connect(devWallet).transfer(accounts[1].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[1]).approve(oracle.address, BigInt(10E18))

    await oracle.connect(accounts[1]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[1]).submitValue(ETH_QUERY_ID, h.bytes(100), 0, ETH_QUERY_DATA)
    blocky = await h.getBlock()

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

  it("rescueFailedUpdate", async function () {
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
    await assert(newAdd == controller.address, "Tellor's address was not updated")
    let newDeity = await tellor.getAddressVars(h.hash("_DEITY"))
    await assert(newDeity == DEV_WALLET)
  });

  it("rescueBrokenDataReporting", async function () {
    await governance.executeVote(voteCount)
    await tellor.init()
    await parachute.rescueBrokenDataReporting()
    await h.advanceTime(86400 * 7 + 1)
    await parachute.rescueBrokenDataReporting()
    expect(await tellor.getAddressVars(h.hash("_DEITY"))).to.equal(DEV_WALLET)
    await tellor.connect(devWallet).changeDeity(parachute.address)
    expect(await tellor.getAddressVars(h.hash("_DEITY"))).to.equal(parachute.address)
    await oracle.connect(accounts[1]).submitValue(h.uintTob32(1), h.bytes(100), 0, '0x')
    await tellor.connect(devWallet).transfer(accounts[1].address, h.toWei("100"))
  })

  it("rescue51PercentAttack", async function() {
    await governance.executeVote(voteCount)
    await tellor.init()
    await h.expectThrow(parachute.rescue51PercentAttack(DEV_WALLET))
    totalSupply = await tellor.totalSupply()
    await tellor.doMintTest(DEV_WALLET, totalSupply)
    await parachute.rescue51PercentAttack(DEV_WALLET)
    expect(await tellor.getAddressVars(h.hash("_DEITY"))).to.equal(DEV_WALLET)
    await tellor.connect(devWallet).changeDeity(parachute.address)
    expect(await tellor.getAddressVars(h.hash("_DEITY"))).to.equal(parachute.address)
    await oracle.connect(accounts[1]).submitValue(h.uintTob32(1), h.bytes(100), 0, '0x')
    await tellor.connect(devWallet).transfer(accounts[1].address, h.toWei("100"))
  })

  it("killContract", async function() {
    await governance.executeVote(voteCount)
    await tellor.init()
    await h.expectThrow(parachute.connect(accounts[1]).killContract())
    await parachute.connect(devWallet).killContract()
    expect(await tellor.getAddressVars(h.hash("_DEITY"))).to.equal("0x0000000000000000000000000000000000000000")
  })

  it("migrateFor", async function() {
    await governance.executeVote(voteCount)
    await tellor.init()
    await h.expectThrow(parachute.connect(accounts[1]).migrateFor(accounts[10].address, h.toWei("100")))
    await parachute.connect(devWallet).migrateFor(accounts[10].address, h.toWei("100"))
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(h.toWei("100"))
  })
});