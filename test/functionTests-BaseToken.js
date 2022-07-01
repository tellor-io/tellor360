const { AbiCoder } = require("@ethersproject/abi");
const { expect } = require("chai");
const h = require("./helpers/helpers");
var assert = require('assert');
const web3 = require('web3');
const { ethers } = require("hardhat");

describe("Function Tests - BaseToken", function() {

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
  let newGovernance = null
  let governance = null
  let cfac,ofac,tfac,gfac,parachute,govBig,govTeam
  let govSigner = null
  let devWallet = null
  let abiCoder = new ethers.utils.AbiCoder
  let totalSupply = null

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
    oracle = await oracleFactory.deploy(tellorMaster, 12*60*60, BigInt(100E18), BigInt(10E18))
    await oracle.deployed()

    let governanceFactory = await ethers.getContractFactory("contracts/oldContracts/contracts/Governance360.sol:Governance")
    newGovernance = await governanceFactory.deploy(oracle.address, DEV_WALLET)
    await newGovernance.deployed()

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

  it("allowance()", async function () {
    expect(await tellor.allowance(accounts[1].address, accounts[2].address)).to.equal(0)
    await tellor.connect(accounts[1]).approve(accounts[2].address, web3.utils.toWei("20"))
    expect(await tellor.allowance(accounts[1].address, accounts[2].address)).to.equal(web3.utils.toWei("20"))

    await tellor.connect(devWallet).init()
    expect(await tellor.allowance(accounts[1].address, accounts[2].address)).to.equal(web3.utils.toWei("20"))
    await tellor.connect(accounts[1]).approve(accounts[2].address, web3.utils.toWei("100"))
    expect(await tellor.allowance(accounts[1].address, accounts[2].address)).to.equal(web3.utils.toWei("100"))
  })

  it("approve()", async function () {
    await h.expectThrow(tellor.approve("0x0000000000000000000000000000000000000000", web3.utils.toWei("10"))) // can't approve zero address as spender
    expect(await tellor.allowance(accounts[1].address, accounts[2].address)).to.equal(0)
    await tellor.connect(accounts[1]).approve(accounts[2].address, web3.utils.toWei("20"))
    expect(await tellor.allowance(accounts[1].address, accounts[2].address)).to.equal(web3.utils.toWei("20"))

    await tellor.connect(devWallet).init()
    expect(await tellor.allowance(accounts[1].address, accounts[2].address)).to.equal(web3.utils.toWei("20"))
    await tellor.connect(accounts[1]).approve(accounts[2].address, web3.utils.toWei("100"))
    expect(await tellor.allowance(accounts[1].address, accounts[2].address)).to.equal(web3.utils.toWei("100"))
  })

  it("approveAndTransferFrom()", async function () {
    await h.expectThrow(tellor.connect(accounts[1]).approveAndTransferFrom(DEV_WALLET, accounts[1].address, web3.utils.toWei("100")))
  })

  it("balanceOf()", async function () {
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(0)
    await tellor.connect(devWallet).transfer(accounts[10].address, web3.utils.toWei("100"))
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(web3.utils.toWei("100"))

    await tellor.connect(devWallet).init()
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(web3.utils.toWei("100"))    
  })

  it("balanceOfAt()", async function () {
    blocky1 = await h.getBlock()
    expect(await tellor.balanceOfAt(accounts[10].address, blocky1.number)).to.equal(0)
    await tellor.connect(devWallet).transfer(accounts[10].address, web3.utils.toWei("100"))
    expect(await tellor.balanceOfAt(accounts[10].address, blocky1.number)).to.equal(0)
    blocky2 = await h.getBlock()
    expect(await tellor.balanceOfAt(accounts[10].address, blocky2.number)).to.equal(web3.utils.toWei("100"))

    await tellor.connect(devWallet).init()
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(web3.utils.toWei("100"))    
  })

  it("balanceOfAt()", async function () {
    blocky1 = await h.getBlock()
    expect(await tellor.balanceOfAt(accounts[10].address, blocky1.number)).to.equal(0)
    await tellor.connect(devWallet).transfer(accounts[10].address, web3.utils.toWei("100"))
    expect(await tellor.balanceOfAt(accounts[10].address, blocky1.number)).to.equal(0)
    blocky2 = await h.getBlock()
    expect(await tellor.balanceOfAt(accounts[10].address, blocky2.number)).to.equal(web3.utils.toWei("100"))

    await tellor.connect(devWallet).init()
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(web3.utils.toWei("100"))    
  })

  it("transfer()", async function () {
    await h.expectThrow(tellor.connect(devWallet).transfer("0x0000000000000000000000000000000000000000", web3.utils.toWei("10"))) // can't transfer 0 amount
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(0)
    await h.expectThrow(tellor.connect(accounts[10]).transfer(accounts[6].address, web3.utils.toWei("75")))
    await tellor.connect(devWallet).transfer(accounts[10].address, web3.utils.toWei("100"))
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(web3.utils.toWei("100"))
    await tellor.connect(accounts[10]).transfer(accounts[9].address, web3.utils.toWei("75"))
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(web3.utils.toWei("25"))
    expect(await tellor.balanceOf(accounts[9].address)).to.equal(web3.utils.toWei("75"))
    await h.expectThrow(tellor.connect(accounts[10]).transfer(accounts[9].address, web3.utils.toWei("75")))
    await tellor.connect(devWallet).init()
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(web3.utils.toWei("25"))    
    await tellor.connect(accounts[10]).transfer(accounts[9].address, web3.utils.toWei("10"))
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(web3.utils.toWei("15"))    
    expect(await tellor.balanceOf(accounts[9].address)).to.equal(web3.utils.toWei("85"))    
  })

  it("transferFrom()", async function () {
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(0)
    expect(await tellor.balanceOf(accounts[9].address)).to.equal(0)
    expect(await tellor.allowance(DEV_WALLET, accounts[10].address)).to.equal(0)
    await h.expectThrow(tellor.connect(accounts[10]).transferFrom(DEV_WALLET, accounts[9].address, web3.utils.toWei("75"))) // insufficient allowance
    await tellor.connect(devWallet).approve(accounts[10].address, web3.utils.toWei("100"))
    expect(await tellor.allowance(DEV_WALLET, accounts[10].address)).to.equal(web3.utils.toWei("100"))
    await tellor.connect(accounts[10]).transferFrom(DEV_WALLET, accounts[9].address, web3.utils.toWei("75"))
    expect(await tellor.allowance(DEV_WALLET, accounts[10].address)).to.equal(web3.utils.toWei("25"))
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(0)
    expect(await tellor.balanceOf(accounts[9].address)).to.equal(web3.utils.toWei("75"))
    await h.expectThrow(tellor.connect(accounts[10]).transferFrom(DEV_WALLET, accounts[9].address, web3.utils.toWei("26"))) // insufficient allowance
    
    await tellor.connect(devWallet).init()
    await h.expectThrow(tellor.connect(accounts[10]).transferFrom(DEV_WALLET, accounts[9].address, web3.utils.toWei("26"))) // insufficient allowance
    await tellor.connect(accounts[10]).transferFrom(DEV_WALLET, accounts[9].address, web3.utils.toWei("25"))
    expect(await tellor.allowance(DEV_WALLET, accounts[10].address)).to.equal(0)
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(0)
    expect(await tellor.balanceOf(accounts[9].address)).to.equal(web3.utils.toWei("100"))
  })

  it("_doMint()", async function () {
    await h.expectThrow(tellor._doMint(accounts[10].address, web3.utils.toWei("10"))) // internal function can only be called by self contract
    await h.expectThrow(tellor.doMintTest(accounts[10].address, 0)) // can't mint 0 tokens
    await h.expectThrow(tellor.doMintTest("0x0000000000000000000000000000000000000000", web3.utils.toWei("10"))) // can't mint to 0 address
    expect(await tellor.totalSupply()).to.equal(totalSupply)
    await tellor.doMintTest(accounts[10].address, web3.utils.toWei("10"))
    expectedNewSupply = BigInt(totalSupply) + BigInt(web3.utils.toWei("10"))
    expect(BigInt(await tellor.totalSupply())).to.equal(expectedNewSupply)
    expect(await tellor.balanceOf(accounts[10].address)).to.equal(web3.utils.toWei("10"))
    blocky = await h.getBlock()
    expect(await tellor.balanceOfAt(accounts[10].address, blocky.number)).to.equal(web3.utils.toWei("10"))
    await tellor.connect(devWallet).init()
    await tellor.doMintTest(accounts[10].address, web3.utils.toWei("10"))
  })
})
