const { expect } = require('chai');
const { ethers, deployments, getNamedAccounts } = require('hardhat');
const namehash = require('@ensdomains/eth-ens-namehash');
const { utils, BigNumber } = ethers;

const label = 'eth';
const labelHash = utils.keccak256(utils.toUtf8Bytes(label));
const node = namehash.hash(label);
const ROOT_NODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

function increaseTime(secs) {
  return ethers.provider.send('evm_increaseTime', [secs]);
}

describe('ENS Multi Delegate', () => {
  let token;
  let deployer;
  let delegatee;
  let resolver;
  let registry;
  let snapshot;
  let multiDelegate;

  before(async () => {
    ({ deployer, delegatee } = await getNamedAccounts());
  });

  beforeEach(async () => {
    snapshot = await ethers.provider.send('evm_snapshot', []);

    await deployments.fixture(['ENSToken']);
    token = await ethers.getContract('ENSToken');

    const Registry = await ethers.getContractFactory('ENSRegistry');
    registry = await Registry.deploy();
    await registry.deployed();

    const Resolver = await ethers.getContractFactory('PublicResolver');
    resolver = await Resolver.deploy(
      registry.address,
      ethers.constants.AddressZero
    );
    await resolver.deployed();

    const ENSMultiDelegate = await ethers.getContractFactory(
      'ENSMultiDelegate'
    );
    multiDelegate = await ENSMultiDelegate.deploy(token.address);
    await multiDelegate.deployed();

    await registry.setSubnodeOwner(ROOT_NODE, labelHash, deployer);
    await registry.setResolver(node, resolver.address);

    await increaseTime(365 * 24 * 60 * 60);
    const mintAmount = (await token.totalSupply()).div(50);
    await token.mint(deployer, mintAmount);
    const avatar = 'some avatar';
    const profile = 'some profile';
    const twitter = 'some twitter';
    const discord = 'some discord';
    await resolver['setAddr(bytes32,address)'](node, deployer);
    await resolver.setText(node, 'avatar', avatar);
    await resolver.setText(node, 'eth.ens.delegate', profile);
    await resolver.setText(node, 'com.twitter', twitter);
    await resolver.setText(node, 'com.discord', discord);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshot]);
  });

  it('contract should be able to delegate multiple delegatees in behalf of user', async () => {
    const delegatorTokenAmount = await token.balanceOf(deployer);
    // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

    // give allowance to multi delegate contract
    await token.approve(multiDelegate.address, delegatorTokenAmount);

    // delegate multiple delegatees
    const delegatees = [deployer, delegatee, delegatee];
    await multiDelegate.delegateMulti(delegatees, delegatorTokenAmount);

    // retrieve proxy delegator contracts
    const proxyDelegators = await multiDelegate.delegators();
    // there must be 2 proxy delegators
    expect(proxyDelegators.length).to.equal(delegatees.length);

    const pxd0balance = await token.balanceOf(proxyDelegators[0]);
    // check if proxy delegator balance is half of what delegator sent
    expect(pxd0balance.toString()).to.equal(
      delegatorTokenAmount.div(proxyDelegators.length).toString()
    );

    const delegatorTokenAmount2 = await token.balanceOf(deployer);
    // delegator now must have at most the remainder amonut
    expect(delegatorTokenAmount2.toString()).to.equal(
      BigNumber.from(delegatorTokenAmount)
        .sub(BigNumber.from(pxd0balance).mul(delegatees.length))
        .toString()
    );

    // delegatee must have 2/3 of the votes the delegator delegated
    const votesOfDelegatee = await token.getVotes(delegatee);
    expect(votesOfDelegatee.toString()).to.equal(
      BigNumber.from(pxd0balance).mul(2).toString()
    );

    // withdraw tokens from proxy contracts back
    await multiDelegate.withdraw();
    const delegatorTokenAmount3 = await token.balanceOf(deployer);
    // delegator now must have all tokens withdrawn
    expect(delegatorTokenAmount3.toString()).to.equal(
      delegatorTokenAmount.toString()
    );

    // delegatee must not have any voting power after withdrawal
    const votesOfDelegatee2 = await token.getVotes(delegatee);
    expect(votesOfDelegatee2.toString()).to.equal('0');
  });

  it('contract should revert if allowance is not provided', async () => {
    const delegatorTokenAmount = await token.balanceOf(deployer);

    const delegatees = [delegatee];
    await expect(
      multiDelegate.delegateMulti(delegatees, delegatorTokenAmount)
    ).to.be.revertedWith('Check the token allowance');
  });

  it('contract should revert if allowance is lesser than provided amount', async () => {
    const delegatorTokenAmount = await token.balanceOf(deployer);
    const customAmount = ethers.utils.parseEther('100000.0'); // total ens 77000000

    // give allowance to multi delegate contract
    await token.approve(multiDelegate.address, customAmount);

    const delegatees = [delegatee];
    await expect(
      multiDelegate.delegateMulti(delegatees, delegatorTokenAmount)
    ).to.be.revertedWith('Check the token allowance');
  });

  it('contract should revert if no delegatee provided', async () => {
    const delegatorTokenAmount = await token.balanceOf(deployer);

    // give allowance to multi delegate contract
    await token.approve(multiDelegate.address, delegatorTokenAmount);

    const delegatees = [];
    await expect(
      multiDelegate.delegateMulti(delegatees, delegatorTokenAmount)
    ).to.be.revertedWith('You should pick at least one delegatee');
  });

});
