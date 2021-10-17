const config = require('../config');

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployments, getNamedAccounts } = require("hardhat");
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { ShardedMerkleTree } = require('../src/merkle');

function setNextBlockTimestamp(ts) {
    return ethers.provider.send('evm_setNextBlockTimestamp', [ts]);
}

function increaseTime(secs) {
    return ethers.provider.send('evm_increaseTime', [secs]);
}

function hashLeaf(data) {
    return ethers.utils.solidityKeccak256(['address', 'uint256'], data);
}

function getIndex(address, balance, proof) {
    let index = 0;
    let computedHash = hashLeaf([address, balance]);

    for(let i = 0; i < proof.length; i++) {
        index *= 2;
        const proofElement = proof[i];

        if (computedHash <= proofElement) {
            // Hash(current computed hash + current element of the proof)
            computedHash = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [computedHash, proofElement]);
        } else {
            // Hash(current element of the proof + current computed hash)
            computedHash = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'], [proofElement, computedHash]);
            index += 1;
        }
    }
    return index;
}

describe("ENS token", () => {
    let token;
    let deployer;
    let tree;
    let snapshot;

    before(async () => {
        ({deployer} = await getNamedAccounts());
        const signers = await ethers.getSigners();
        tree = ShardedMerkleTree.fromFiles('airdrops/hardhat');
        config.AIRDROP_MERKLE_ROOT = tree.root;
        await deployments.fixture(['ENSToken']);
        token = await ethers.getContract("ENSToken");
    });

    beforeEach(async () => {
        snapshot = await ethers.provider.send('evm_snapshot', []);
    })

    afterEach(async () => {
        await ethers.provider.send('evm_revert', [snapshot]);
    });

    describe("minting", () => {
        it("should not allow minting until the first mint window", async () => {
            await expect(token.mint(deployer, 1)).to.be.revertedWith("Cannot mint yet");
        });

        it("should allow the owner of the contract to mint new tokens", async () => {
            await increaseTime(365 * 24 * 60 * 60);
            const balanceBefore = await token.balanceOf(deployer);
            const mintAmount = (await token.totalSupply()).div(50);
            await token.mint(deployer, mintAmount);
            expect(await token.balanceOf(deployer)).to.equal(balanceBefore.add(mintAmount));
        });

        it("should not allow non-owners to mint new tokens", async () => {
            await increaseTime(365 * 24 * 60 * 60);
            await expect(token
                .connect((await ethers.getSigners())[1])
                .mint(deployer, 1)
            ).to.be.revertedWith("caller is not the owner");
        });

        it("should not allow minting before the next mint window", async () => {
            await increaseTime(365 * 24 * 60 * 60);
            await token.mint(deployer, 1);
            await expect(token.mint(deployer, 1)).to.be.revertedWith("Cannot mint yet");
        });

        it("should not allow minting more than the prescribed amount", async () => {
            await increaseTime(365 * 24 * 60 * 60);
            await expect(
                token.mint(deployer, (await token.totalSupply()).div(50).add(1))
            ).to.be.revertedWith("Mint exceeds maximum amount");
        });
    });

    describe("airdrop", () => {
        it("should allow airdrop claims", async () => {
            const account = (await ethers.getSigners())[1];
            const balanceBefore = await token.balanceOf(account.address);
            const [entry, proof] = tree.getProof(account.address);
            await token
                .connect(account)
                .claimTokens(
                    entry.balance,
                    deployer,
                    proof
                );
            expect(await token.balanceOf(account.address)).to.equal(balanceBefore.add(entry.balance))
            const index = getIndex(account.address, entry.balance, proof);
            expect(await token.isClaimed(index)).to.equal(true);
        });

        it("should not allow multiple claims by the same user", async () => {
            const account = (await ethers.getSigners())[1];
            const token2 = token.connect(account);
            const [entry, proof] = tree.getProof(account.address);
            await token2
                .claimTokens(
                    entry.balance,
                    deployer,
                    proof
                );
            await expect(token2.claimTokens(entry.balance, deployer, proof))
                .to.be.revertedWith("Tokens already claimed");
        });

        it("should not allow claims with incorrect amounts", async () => {
            const [entry, proof] = tree.getProof(deployer);
            await expect(token
                .claimTokens(
                    ethers.BigNumber.from(entry.balance).add(1),
                    deployer,
                    proof
                )
            ).to.be.revertedWith("Valid proof required");
        });

        it("should not allow claims for a different addresses", async () => {
            const account = (await ethers.getSigners())[1];
            const [entry, proof] = tree.getProof(account.address);
            await expect(token
                .claimTokens(
                    entry.balance,
                    deployer,
                    proof
                )
            ).to.be.revertedWith("Valid proof required");
        });

        it("should not allow claims with invalid proofs", async () => {
            const [entry, proof] = tree.getProof(deployer);
            proof[0] = proof[1];
            await expect(token
                .claimTokens(
                    entry.balance,
                    deployer,
                    proof,
                )
            ).to.be.revertedWith("Valid proof required");
        });

        it("should not allow sweeping tokens until the claim period ends", async () => {
            await expect(token.sweep(deployer)).to.be.revertedWith("ENS: Claim period not yet ended'");
        });

        it("should allow sweeping tokens after the claim period ends", async () => {
            await setNextBlockTimestamp((await token.claimPeriodEnds()).toNumber() + 1);
            const balanceBefore = await token.balanceOf(deployer);
            const sweepBalance = await token.balanceOf(token.address);
            await token.sweep(deployer);
            expect(await token.balanceOf(deployer)).to.equal(balanceBefore.add(sweepBalance));
        });
    });
});
