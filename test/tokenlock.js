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

describe("TokenLock", () => {
    let snapshot;
    let token;
    let tokenLock;
    let deployer;
    let account2;
    let lockAmount;
    let unlockBegin;
    let unlockCliff;
    let unlockEnd;

    before(async () => {
        ({deployer} = await getNamedAccounts());
        const signers = await ethers.getSigners();
        account2 = signers[1];
        lockAmount = ethers.BigNumber.from(10).pow(18).mul(1000000);
        unlockBegin = new Date(config.UNLOCK_BEGIN).getTime() / 1000;
        unlockCliff = new Date(config.UNLOCK_CLIFF).getTime() / 1000;
        unlockEnd = new Date(config.UNLOCK_END).getTime() / 1000;
        await deployments.fixture(['ENSToken', 'TokenLock']);
        token = await ethers.getContract("ENSToken");
        tokenLock = await ethers.getContract("TokenLock");
        await token.approve(tokenLock.address, lockAmount);
        await tokenLock.lock(account2.address, lockAmount);
    });

    beforeEach(async () => {
        snapshot = await ethers.provider.send('evm_snapshot', []);
    })

    afterEach(async () => {
        await ethers.provider.send('evm_revert', [snapshot]);
    });

    it("should allow a token owner to lock tokens", async () => {
        await token.approve(tokenLock.address, lockAmount);
        await expect(tokenLock.lock(account2.address, lockAmount))
            .to.emit(tokenLock, 'Locked')
            .withArgs(deployer, account2.address, lockAmount);
    });

    it("should not allow any claiming before the cliff", async () => {
        expect(await tokenLock.claimableBalance(account2.address)).to.equal(0);
        const balanceBefore = await token.balanceOf(account2.address);
        await expect(tokenLock.connect(account2).claim(account2.address, 1))
            .to.emit(tokenLock, 'Claimed')
            .withArgs(account2.address, account2.address, 0);
        expect(await token.balanceOf(account2.address)).to.equal(balanceBefore);
    });

    it("should allow a proportional amount to be claimed after the cliff", async () => {
        await setNextBlockTimestamp(unlockCliff);
        const unlockAmount = lockAmount.mul(unlockCliff - unlockBegin).div(unlockEnd - unlockBegin);
        expect(await tokenLock.claimableBalance(account2.address)).to.equal(unlockAmount);
        const balanceBefore = await token.balanceOf(account2.address);
        await expect(tokenLock.connect(account2).claim(account2.address, unlockAmount))
            .to.emit(tokenLock, 'Claimed')
            .withArgs(account2.address, account2.address, unlockAmount);
        expect(await token.balanceOf(account2.address)).to.equal(balanceBefore.add(unlockAmount));
    });

    it("should automatically limit claims to the maximum allowed", async () => {
        await setNextBlockTimestamp(unlockCliff);
        const balanceBefore = await token.balanceOf(account2.address);
        const tx = await tokenLock.connect(account2).claim(account2.address, lockAmount);
        const receipt = await tx.wait();
        const block = await account2.provider.getBlock(receipt.blockNumber);
        const unlockAmount = lockAmount.mul(block.timestamp - unlockBegin).div(unlockEnd - unlockBegin);
        await expect(tx)
            .to.emit(tokenLock, 'Claimed')
            .withArgs(account2.address, account2.address, unlockAmount);
        expect(await token.balanceOf(account2.address)).to.equal(balanceBefore.add(unlockAmount));
    });

    it("should allow all tokens to be claimed after the end", async () => {
        await setNextBlockTimestamp(unlockEnd);
        expect(await tokenLock.claimableBalance(account2.address)).to.equal(lockAmount);
        const balanceBefore = await token.balanceOf(account2.address);
        await expect(tokenLock.connect(account2).claim(account2.address, lockAmount))
            .to.emit(tokenLock, 'Claimed')
            .withArgs(account2.address, account2.address, lockAmount);
        expect(await token.balanceOf(account2.address)).to.equal(balanceBefore.add(lockAmount));
    });

    it("should not allow new locks after the end", async () => {
        await setNextBlockTimestamp(unlockEnd);
        await expect(tokenLock.lock(account2.address, lockAmount))
            .to.be.revertedWith("Unlock period already complete");
    });
});
