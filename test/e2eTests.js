const { AbiCoder } = require("@ethersproject/abi");
const { expect } = require("chai");
const {ethers} = require("hardhat")
const h = require("./helpers/helpers");
var assert = require('assert');
const web3 = require('web3');

describe("End-to-End Tests - One", function() {

    const tellorMaster = "0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0"
    const DEV_WALLET = "0x39E419bA25196794B595B2a595Ea8E527ddC9856"
    const PARACHUTE = "0x83eB2094072f6eD9F57d3F19f54820ee0BaE6084"
    const BIGWALLET = "0xf977814e90da44bfa03b6295a0616a897441acec";
    const CURR_GOV = "0x51d4088d4EeE00Ae4c55f46E0673e9997121DB00"
    let accounts = null
    let token = null
    let oracle = null
    let newTellor = null
    let oldTellor = null
    let governance = null
    let cfac,ofac,tfac,gfac,parachute,govBig,govTeam
    let govSigner = null

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

    accounts = await ethers.getSigners()
    devWallet = await ethers.provider.getSigner(DEV_WALLET);
    bigWallet = await ethers.provider.getSigner(BIGWALLET);

    const tokenFactory = await ethers.getContractFactory("TestToken")
    token = await tokenFactory.deploy()
    await token.deployed()

    let oracleFactory = await ethers.getContractFactory("TellorFlex")
    oracle = await oracleFactory.deploy(token.address, BIGWALLET, BigInt(10E18), 12*60*60)
    await oracle.deployed()

    await token.mint(accounts[1].address, web3.utils.toWei("1000"));
    await token.connect(accounts[1]).approve(oracle.address, web3.utils.toWei("1000"))

    await oracle.connect(accounts[1]).depositStake(BigInt(11E18))
    await oracle.connect(accounts[1]).submitValue(h.uintTob32(1), h.bytes(100), 0, '0x')

    newTellorFactory = await ethers.getContractFactory("Tellor360")
    newTellor = await newTellorFactory.deploy()
    await newTellor.deployed()

    oldTellor = await ethers.getContractAt("contracts/oldContracts/contracts/interfaces/ITellor.sol:ITellor", tellorMaster)
    governance = await ethers.getContractAt("contracts/oldContracts/contracts/interfaces/ITellor.sol:ITellor", CURR_GOV)
    parachute = await ethers.getContractAt("contracts/oldContracts/contracts/interfaces/ITellor.sol:ITellor",PARACHUTE, devWallet);


    await governance.connect(devWallet).proposeVote(tellorMaster, 0x3c46a185, newTellor.address, 0)

    let voteCount = await governance.getVoteCount()
    await governance.connect(devWallet).vote(voteCount,true, false)
    await governance.connect(bigWallet).vote(voteCount,true, false)

    await h.advanceTime(86400 * 8)
    await governance.tallyVotes(voteCount)
    await h.advanceTime(86400 * 2.5)
    await governance.executeVote(voteCount)





    


  });
  it("Mine 2 values on 50 different ID's", async function() {
  });
  
  it("Parachute Tests -- rescue failed update", async function() {
    await expect(
      parachute.rescueFailedUpdate(),
      "tellor address should be valid"
    ).to.be.reverted

    console.log("here")
    
    await governance.connect(devWallet).proposeVote(tellorMaster, 0x3c46a185, ethers.constants.AddressZero, 0)
    let voteCount = await governance.getVoteCount()
    await governance.connect(devWallet).vote(voteCount,true, false)
    await governance.connect(bigWallet).vote(voteCount,true, false)

    await h.advanceTime(86400 * 8)
    await governance.tallyVotes(voteCount)
    await h.advanceTime(86400 * 2.5)
    await governance.executeVote(voteCount)
    await h.advanceTime(86400 * 8)

    console.log(0)

    console.log(oldTellor.address)

    let tellorContract = '0x0f1293c916694ac6af4daa2f866f0448d0c2ce8847074a7896d397c961914a08'
    console.log("here")
    await expect(
      oldTellor.getAddressVars(tellorContract),
      "shouldn't be able to read"
    ).to.be.reverted
    console.log("here2")
    //throw deity to parachute
    await parachute.rescueFailedUpdate()
    //get it back!
    console.log(1 )
    await governance.changeControllerContract(controller.address)
    //read tellor contract adddres
    let newAdd = await tellor.getAddressVars(tellorContract)
    await assert(newAdd == controller.address, "Tellor's address was not updated")
  })

});
