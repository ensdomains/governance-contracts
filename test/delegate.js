const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployments, getNamedAccounts } = require("hardhat");
const namehash = require('@ensdomains/eth-ens-namehash')

function increaseTime(secs) {
    return ethers.provider.send('evm_increaseTime', [secs]);
}

describe("ENS delegate", () => {
    let token;
    let deployer;
    let resolver;
    let registry;

    before(async () => {
        ({deployer} = await getNamedAccounts());
    });

    beforeEach(async () => {
        await deployments.fixture(['ENSToken']);
        token = await ethers.getContract("ENSToken");
        const Resolver = await ethers.getContractFactory("DummyResolver");
        resolver = await Resolver.deploy(deployer);
        await resolver.deployed();
        const Registry = await ethers.getContractFactory("DummyRegistry");
        registry = await Registry.deploy(resolver.address);
        await registry.deployed();
        const ENSDelegate = await ethers.getContractFactory("ENSDelegate");
        delegate = await ENSDelegate.deploy(registry.address, token.address);
        await registry.deployed();
    });

    describe("getDelegates", () => {
        it("returns the detail of the delegate", async () => {
            const value = 'value'
            const node = namehash.hash('matoken.eth')
            const tokenVotes = await token.getVotes(deployer)
            const d = (await delegate.getDelegates([node]))[0];
            expect(d.addr).to.equal(deployer)
            expect(d.votes).to.equal(tokenVotes)
            expect(d.avatar).to.equal(value)
            expect(d.profile).to.equal(value)
            expect(d.twitter).to.equal(value)
            expect(d.discord).to.equal(value)
        });
    });
});
