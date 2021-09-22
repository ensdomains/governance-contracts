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

function getIndex(tree, leaves, address) {
    leaf = hashLeaf([address, leaves[address]]);
    const proof = tree.getProof(leaf);
    return proof.reduce((prev, curr) => prev * 2 + (curr == 'left' ? 0 : 1), 0);
}

describe("ENS token", () => {
    let token;
    let deployer;
    let tree;

    before(async () => {
        ({deployer} = await getNamedAccounts());
        const signers = await ethers.getSigners();
        tree = ShardedMerkleTree.fromFiles('airdrops/hardhat');
        config.AIRDROP_MERKLE_ROOT = tree.root;
    });

    beforeEach(async () => {
        await deployments.fixture(['ENSToken']);
        token = await ethers.getContract("ENSToken");
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
            expect(await token.balanceOf(account.address)).to.equal(balanceBefore.add(entry.balance));
            expect(await token.claimed(account.address)).to.equal(entry.balance);
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
    });
});
