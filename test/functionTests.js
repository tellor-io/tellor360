const { AbiCoder } = require("@ethersproject/abi");
const { expect } = require("chai");
const h = require("./helpers/helpers");
var assert = require('assert');
const web3 = require('web3');

describe("Function Tests", function() {

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
    controller = await controllerFactory.deploy(DEV_WALLET)
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

  it("Init()", async function () {

    let refundedAccount = "0x3aa39f73D48739CDBeCD9EB788D4657E0d6a6815"
    let oldBalance = await tellor.balanceOf(refundedAccount)

    //require 1: onlyOwner
    await expect(
      tellor.connect(reporter).init(oracle.address),
      "rando account could init tellor360"
    ).to.be.reverted
  
    //require 3: tellorflex must have values at least 12 hours old (redeploy flex!)
    let oracleFactory = await ethers.getContractFactory("TellorFlex")
    oracle = await oracleFactory.deploy(tellorMaster, BIGWALLET, BigInt(10E18), 12*60*60)
    await oracle.deployed()

    await expect(
      tellor.connect(devWallet).init(oracle.address),
      "was able to init tellor360 with empty tellorflex"
    ).to.be.reverted

    //submit a value
    await tellor.connect(devWallet).transfer(accounts[1].address, web3.utils.toWei("100"));
    await tellor.connect(accounts[1]).approve(oracle.address, BigInt(10E18))
    await oracle.connect(accounts[1]).depositStake(BigInt(10E18))
    await oracle.connect(accounts[1]).submitValue(h.uintTob32(1), h.bytes(100), 0, '0x')

    //fast forward 12 hours
    h.advanceTime(60*60*12)

    // successful upgrade...
    await tellor.connect(devWallet).init(oracle.address)

    //assert the _ORACLE_CONTRACT is now flex
    let oracleContract = await tellor.getAddressVars(h.hash("_ORACLE_CONTRACT"))
    expect(oracleContract).to.equal(oracle.address)

    //assert refunded accounts get minted tokens
    let refund = web3.utils.toWei("2.26981073")
    let newBalance = await tellor.balanceOf(refundedAccount)
    expect(newBalance).to.equal(oldBalance + refund)

    //require 2: can only be called once
    await expect(
      tellor.connect(devWallet).init(oracle.address),
      "was able to init twice!"
    ).to.be.reverted
    
  })

  it("mintToTeam()", async function () {

    await tellor.connect(devWallet).init(oracle.address)

    //get _OWNER account address
    let owner = await tellor.getAddressVars(h.hash("_OWNER"))
    expect(owner).to.equal(DEV_WALLET)

    //get _OWNER contract balance
    let oldBalance = BigInt(await tellor.balanceOf(owner))


    //fast forward one day
    h.advanceTime(86400)

    //mint
    await tellor.mintToTeam()

    //_OWNER balance should be greater by 131.5 tokens
    let newBalance = BigInt(await tellor.balanceOf(owner))

    expect(newBalance).to.equal(oldBalance + BigInt(1315E17))

  })

  it("mintToOracle()", async function () {

    await tellor.connect(devWallet).init(oracle.address)

    //get _ORACLE_CONTRACT account address
    let owner = await tellor.getAddressVars(h.hash("_ORACLE_CONTRACT"))

    //get _ORACLE_CONTRACT contract balance
    let oldBalance = BigInt(await tellor.balanceOf(owner))

    //fast forward one day
    h.advanceTime(86400)

    //mint
    await tellor.mintToOracle()

    //_ORACLE_CONTRACT balance should be greater by 131.5 tokens
    let newBalance = BigInt(await tellor.balanceOf(owner))

    expect(newBalance).to.equal(oldBalance + BigInt(1315E17))

  })

  it("transferOutOfContract()", async function () {

    await tellor.connect(devWallet).init(oracle.address)

    let oldTellorBalance = BigInt(await tellor.balanceOf(tellor.address))
    let oldMultisBalance = BigInt(await tellor.balanceOf(DEV_WALLET))

    //transfer tokens from contract to multis
    await tellor.transferOutOfContract()

    //read new balance of multis
    let newTellorBalance = BigInt(await tellor.balanceOf(tellor.address))
    let newMultisBalance = BigInt(await tellor.balanceOf(DEV_WALLET))

    expect(newTellorBalance).to.be.equal(BigInt(0))
    expect(newMultisBalance).to.be.equal(oldMultisBalance + oldTellorBalance)



  })

})
