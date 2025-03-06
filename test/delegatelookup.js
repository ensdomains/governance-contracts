const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployments, getNamedAccounts } = require('hardhat');
const namehash = require('@ensdomains/eth-ens-namehash');
const utils = ethers.utils;
const sha3 = require('web3-utils').sha3;

function increaseTime(secs) {
  return ethers.provider.send('evm_increaseTime', [secs]);
}
const label = 'eth';
const labelHash = utils.keccak256(utils.toUtf8Bytes(label));
const node = namehash.hash(label);
const ROOT_NODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000';
describe('ENS delegate', () => {
  let token;
  let deployer;
  let resolver;
  let registry;
  let delegate;
  let reverseRegistrar;

  before(async () => {
    ({ deployer } = await getNamedAccounts());
  });

  beforeEach(async () => {
    // Use fixture to deploy all contracts
    await deployments.fixture(['ENSToken', 'ens-contracts']);
    
    // Get deployed contracts
    token = await ethers.getContract('ENSToken');
    registry = await ethers.getContract('ENSRegistry');
    reverseRegistrar = await ethers.getContract('ReverseRegistrar');
    resolver = await ethers.getContract('PublicResolver');
    
    // Deploy ENSDelegateLookup contract
    const ENSDelegate = await ethers.getContractFactory('ENSDelegateLookup');
    delegate = await ENSDelegate.deploy(registry.address, token.address);
    
    // Set up ENS registry
    await registry.setSubnodeOwner(ROOT_NODE, sha3('reverse'), deployer);
    await registry.setSubnodeOwner(
      namehash.hash('reverse'),
      sha3('addr'),
      reverseRegistrar.address
    );

    await registry.setSubnodeOwner(ROOT_NODE, labelHash, deployer);
    await registry.setResolver(node, resolver.address);
  });

  describe('getDelegates', () => {
    it('returns the detail of the delegate', async () => {
      const avatar = 'some avatar';
      const profile = 'some profile';
      const twitter = 'some twitter';
      const discord = 'some discord';
      const tokenVotes = await token.getVotes(deployer);
      await resolver['setAddr(bytes32,address)'](node, deployer);
      await resolver.setText(node, 'avatar', avatar);
      await resolver.setText(node, 'eth.ens.delegate', profile);
      await resolver.setText(node, 'com.twitter', twitter);
      await resolver.setText(node, 'com.discord', discord);
      const d = (await delegate.getDelegates([node]))[0];
      expect(d.addr).to.equal(deployer);
      expect(d.votes).to.equal(tokenVotes);
      expect(d.avatar).to.equal(avatar);
      expect(d.profile).to.equal(profile);
      expect(d.twitter).to.equal(twitter);
      expect(d.discord).to.equal(discord);
    });
  });
});
