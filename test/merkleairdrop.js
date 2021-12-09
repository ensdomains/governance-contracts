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

describe("Merkle Airdrop", () => {
    let token;
    let airdrop;
    let deployer;
    let tree;
    let snapshot;

    before(async () => {
        ({deployer} = await getNamedAccounts());
        const signers = await ethers.getSigners();
        tree = ShardedMerkleTree.fromFiles('airdrops/hardhat');
        await deployments.fixture(['ENSToken']);
        token = await ethers.getContract("ENSToken");
        const MerkleAirdrop = await ethers.getContractFactory("MerkleAirdrop");
        airdrop = await MerkleAirdrop.deploy(deployer, token.address, tree.root);
        await token.approve(airdrop.address, tree.total);
    });

    beforeEach(async () => {
        snapshot = await ethers.provider.send('evm_snapshot', []);
    })

    afterEach(async () => {
        await ethers.provider.send('evm_revert', [snapshot]);
    });

    it("should allow airdrop claims", async () => {
        const account = (await ethers.getSigners())[1];
        const balanceBefore = await token.balanceOf(account.address);
        const [entry, proof] = tree.getProof(account.address);
        await airdrop
            .connect(account)
            .claimTokens(
                account.address,
                entry.balance,
                proof
            );
        expect(await token.balanceOf(account.address)).to.equal(balanceBefore.add(entry.balance))
        const index = getIndex(account.address, entry.balance, proof);
        expect(await airdrop.isClaimed(index)).to.equal(true);
    });

    it("should not allow multiple claims by the same user", async () => {
        const account = (await ethers.getSigners())[1];
        const [entry, proof] = tree.getProof(account.address);
        await airdrop
            .connect(account)
            .claimTokens(
                account.address,
                entry.balance,
                proof
            );
        await expect(airdrop.connect(account).claimTokens(account.address, entry.balance, proof))
            .to.be.revertedWith("Tokens already claimed");
    });

    it("should not allow claims with incorrect amounts", async () => {
        const [entry, proof] = tree.getProof(deployer);
        await expect(airdrop
            .claimTokens(
                deployer,
                ethers.BigNumber.from(entry.balance).add(1),
                proof
            )
        ).to.be.revertedWith("Valid proof required");
    });

    it("should allow anyone to claim for an address", async () => {
        const account = (await ethers.getSigners())[1];
        const balanceBefore = await token.balanceOf(account.address);
        const [entry, proof] = tree.getProof(account.address);
        await airdrop.claimTokens(
            account.address,
            entry.balance,
            proof
        );
        expect(await token.balanceOf(account.address)).to.equal(balanceBefore.add(entry.balance))
        const index = getIndex(account.address, entry.balance, proof);
        expect(await airdrop.isClaimed(index)).to.equal(true);
    });

    it("should not allow claims with invalid proofs", async () => {
        const [entry, proof] = tree.getProof(deployer);
        proof[0] = proof[1];
        await expect(airdrop
            .claimTokens(
                deployer,
                entry.balance,
                proof,
            )
        ).to.be.revertedWith("Valid proof required");
    });
});
