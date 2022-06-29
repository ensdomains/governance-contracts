const config = require('../config');

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployments, getNamedAccounts } = require("hardhat");
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

async function setNextBlockTimestamp(ts) {
    await ethers.provider.send('evm_setNextBlockTimestamp', [ts]);
    await ethers.provider.send('evm_mine', []);
}

function increaseTime(secs) {
    return ethers.provider.send('evm_increaseTime', [secs]);
}

describe("TokenStream", () => {
    let snapshot;
    let token;
    let tokenStream;
    let deployer;
    let account2;
    let lockAmount;
    let startTime; 
    let endTime;
    let streamingRate = 2;

    before(async () => {
        ({deployer} = await getNamedAccounts());
        const signers = await ethers.getSigners();
        account2 = signers[1];
        await deployments.fixture(['ENSToken']);
        token = await ethers.getContract("ENSToken");
        startTime = (await ethers.provider.getBlock('latest')).timestamp + 86400;
        endTime = startTime + 86400 * 31;
        const TokenStream = await ethers.getContractFactory("TokenStream", account2);
        tokenStream = await TokenStream.deploy(token.address, deployer, startTime, endTime, streamingRate);
        await token.approve(tokenStream.address, streamingRate * (endTime - startTime));
    });

    beforeEach(async () => {
        snapshot = await ethers.provider.send('evm_snapshot', []);
    })

    afterEach(async () => {
        await ethers.provider.send('evm_revert', [snapshot]);
    });

    it("should not transfer any tokens before the stream starts", async () => {
        await increaseTime(60);
        expect(await tokenStream.claimableBalance()).to.equal(0);
        await tokenStream.claim(account2.address, 120);
        expect(await token.balanceOf(account2.address)).to.equal(0);
    });

    it("should stream the expected number of tokens during the stream", async () => {
        await setNextBlockTimestamp(startTime + 86400);
        const expected = 86400 * streamingRate;
        const tx = await tokenStream.claim(account2.address, expected * 2);
        const receipt = await tx.wait();
        const ts = (await ethers.provider.getBlock(receipt.blockNumber)).timestamp;
        expect(await token.balanceOf(account2.address)).to.equal((ts - startTime) * streamingRate);
    });

    it("should allow partial claims", async () => {
        await setNextBlockTimestamp(startTime + 86400);
        await tokenStream.claim(account2.address, 100);
        expect(await token.balanceOf(account2.address)).to.equal(100);
    });

    it("should not stream tokens after the stream ends", async () => {
        await setNextBlockTimestamp(endTime + 86400);
        const expected = (endTime - startTime) * streamingRate;
        await tokenStream.claim(account2.address, expected * 2);
        expect(await token.balanceOf(account2.address)).to.equal(expected);
    });

    it("should only allow the owner to claim tokens", async () => {
        const signers = await ethers.getSigners();
        await expect(tokenStream.connect(signers[0]).claim(account2.address, 100)).to.be.revertedWith("Ownable");
    });

    it("should allow the sender to change the end time", async () => {
        const signers = await ethers.getSigners();
        await tokenStream.connect(signers[0]).setEndTime(startTime + 86400);
        expect(await tokenStream.endTime()).to.equal(startTime + 86400);
    });

    it("should not allow anyone else to change the end time", async () => {
        await expect(tokenStream.setEndTime(startTime + 86400)).to.be.revertedWith("Only token sender");
    });
});
