require('dotenv').config();

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployments, getNamedAccounts } = require("hardhat");
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

function setNextBlockTimestamp(ts) {
    return ethers.provider.send('evm_setNextBlockTimestamp', [ts]);
}

function increaseTime(secs) {
    return ethers.provider.send('evm_increaseTime', [secs]);
}

function hashLeaf(data) {
    return ethers.utils.solidityKeccak256(['address', 'uint256'], data);
}

function getProof(tree, leaves, address) {
    const leaf = hashLeaf([address, leaves[address]]);
    const proof = tree.getProof(leaf);
    return proof.map((element) => '0x' + element.data.toString('hex'));
}

describe("ENS token", () => {
    let token;
    let deployer;
    let airdrops;
    let tree;

    before(async () => {
        ({deployer} = await getNamedAccounts());
        const signers = await ethers.getSigners();
        airdrops = Object.fromEntries(signers.map((signer) => 
            [signer.address, ethers.BigNumber.from(10).pow(18).mul(1000000)]
        ));
        tree = new MerkleTree(Object.entries(airdrops).map((leaf) => hashLeaf(leaf)), keccak256, {sortPairs: true});
        process.env.AIRDROP_MERKLE_TREE_ROOT = tree.getHexRoot();
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
            await token
                .connect(account)
                .claimTokens(
                    airdrops[account.address],
                    deployer,
                    getProof(tree, airdrops, account.address)
                );
            expect(await token.balanceOf(account.address)).to.equal(balanceBefore.add(airdrops[account.address]))
        });

        it("should not allow multiple claims by the same user", async () => {
            const account = (await ethers.getSigners())[1];
            const token2 = token.connect(account);
            const balanceBefore = await token.balanceOf(account.address);
            await token2
                .claimTokens(
                    airdrops[account.address],
                    deployer,
                    getProof(tree, airdrops, account.address)
                );
            await expect(token2.claimTokens(airdrops[account.address], deployer, getProof(tree, airdrops, account.address)))
                .to.be.revertedWith("Tokens already claimed");
        });

        it("should not allow claims with incorrect amounts", async () => {
            await expect(token
                .claimTokens(
                    airdrops[deployer].add(1),
                    deployer,
                    getProof(tree, airdrops, deployer)
                )
            ).to.be.revertedWith("Valid proof required");
        });

        it("should not allow claims for a different addresses", async () => {
            const account = (await ethers.getSigners())[1];
            await expect(token
                .claimTokens(
                    airdrops[account.address].add(1),
                    deployer,
                    getProof(tree, airdrops, account.address)
                )
            ).to.be.revertedWith("Valid proof required");
        });

        it("should not allow claims with invalid proofs", async () => {
            const proof = getProof(tree, airdrops, deployer);
            proof[0] = proof[1];
            await expect(token
                .claimTokens(
                    airdrops[deployer],
                    deployer,
                    proof,
                )
            ).to.be.revertedWith("Valid proof required");
        });
    });
});
