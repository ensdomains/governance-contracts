const { expect } = require('chai');
const { ethers, deployments, getNamedAccounts } = require('hardhat');
const namehash = require('@ensdomains/eth-ens-namehash');
const { utils } = ethers;

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
  let alice;
  let bob;
  let charlie;
  let dave;
  let resolver;
  let registry;
  let snapshot;
  let multiDelegate;

  before(async () => {
    ({ deployer, alice, bob, charlie, dave } = await getNamedAccounts());
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
      'ERC20MultiDelegate'
    );
    multiDelegate = await ENSMultiDelegate.deploy(
      token.address,
      'http://localhost:8080/{id}'
    );
    await multiDelegate.deployed();

    await registry.setSubnodeOwner(ROOT_NODE, labelHash, deployer);
    await registry.setResolver(node, resolver.address);

    await increaseTime(365 * 24 * 60 * 60);
    const mintAmount = (await token.totalSupply()).div(50);
    await token.mint(deployer, mintAmount);
  });

  afterEach(async () => {
    await ethers.provider.send('evm_revert', [snapshot]);
  });

  describe('deposit', () => {
    it('contract should be able to delegate multiple delegatees in behalf of user', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegatees
      const delegatees = [deployer, alice, bob, charlie];

      const delegateeAmountArray = delegatees.map((delegatee) => [
        delegatee,
        delegatorTokenAmount.div(delegatees.length),
      ]);

      await multiDelegate.depositMulti(delegateeAmountArray);

      const delegatorTokenAmountAfter = await token.balanceOf(deployer);
      expect(delegatorTokenAmountAfter.toString()).to.equal('0');

      // delegator must have 1/4 of the votes the delegator delegated
      const votesOfDelegator = await token.getVotes(deployer);
      expect(votesOfDelegator.toString()).to.equal(
        delegatorTokenAmount.div(delegatees.length).toString()
      );

      // delegatee must have 1/4 of the votes the delegator delegated
      const votesOfDelegatee = await token.getVotes(alice);
      expect(votesOfDelegatee.toString()).to.equal(
        delegatorTokenAmount.div(delegatees.length).toString()
      );

      for (let delegateTokenId of delegatees) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegatees.length).toString()
        );
      }

      await multiDelegate.withdrawMulti(delegatees);

      for (let delegateTokenId of delegatees) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal('0');
      }
    });

    it('contract should be able to delegate to already delegated delegatees', async () => {
      const firstDelegatorBalance = await token.balanceOf(deployer);

      // Give allowance to multiDelegate contract
      await token.approve(multiDelegate.address, firstDelegatorBalance);

      const delegateeList = [alice, bob];
      const delegateeAmounts = delegateeList.map((delegatee) => [
        delegatee,
        firstDelegatorBalance.div(delegateeList.length),
      ]);

      await multiDelegate.depositMulti(delegateeAmounts);

      const [_, secondDelegator] = await ethers.getSigners();
      const secondDelegatorBalance = await token.balanceOf(
        secondDelegator.address
      );

      await token
        .connect(secondDelegator)
        .approve(multiDelegate.address, secondDelegatorBalance);

      const delegateeAmountsForSecondary = delegateeList.map((delegatee) => [
        delegatee,
        secondDelegatorBalance.div(delegateeList.length),
      ]);

      await multiDelegate
        .connect(secondDelegator)
        .depositMulti(delegateeAmountsForSecondary);

      const secondDelegatorBalanceAfter = await token.balanceOf(
        secondDelegator.address
      );
      expect(secondDelegatorBalanceAfter.toString()).to.equal('0');

      const votesOfDelegator = await token.getVotes(alice);
      expect(votesOfDelegator.toString()).to.equal(
        firstDelegatorBalance
          .div(delegateeList.length)
          .add(secondDelegatorBalance.div(delegateeList.length))
          .toString()
      );
    });

    it('contract should revert if no delegatee provided', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);

      const delegatees = [];
      const delegateeAmountArray = delegatees.map((delegatee) => [
        delegatee,
        delegatorTokenAmount.div(delegatees.length),
      ]);
      await expect(
        multiDelegate.depositMulti(delegateeAmountArray)
      ).to.be.revertedWith('You should pick at least one delegatee');
    });
  });

  describe('re-deposit', () => {
    it('contract should be able to re-delegate multiple delegatees in behalf of user 1:1', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegatees
      const delegatees = [deployer, alice];

      const delegateeAmountArray = delegatees.map((delegatee) => [
        delegatee,
        delegatorTokenAmount.div(delegatees.length),
      ]);

      await multiDelegate.depositMulti(delegateeAmountArray);

      const delegatorTokenAmountAfter = await token.balanceOf(deployer);
      expect(delegatorTokenAmountAfter.toString()).to.equal('0');

      // delegatee must have 1/2 of the votes the delegator delegated
      const votesOfDelegatee = await token.getVotes(alice);
      expect(votesOfDelegatee.toString()).to.equal(
        delegatorTokenAmount.div(delegatees.length).toString()
      );

      for (let delegateTokenId of delegatees) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegatees.length).toString()
        );
      }

      const newDelegatees = [bob, charlie];

      const sourceDelegateeArray = delegatees.map((oldDelegatee, index) => [
        oldDelegatee,
        delegatorTokenAmount.div(delegatees.length),
      ]);

      const targetDelegateeArray = newDelegatees.map((newDelegatee, index) => [
        newDelegatee,
        delegatorTokenAmount.div(newDelegatees.length),
      ]);

      await multiDelegate.reDeposit(sourceDelegateeArray, targetDelegateeArray);

      for (let delegateTokenId of delegatees) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal('0');
      }

      for (let delegateTokenId of newDelegatees) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegatees.length).toString()
        );
      }

      // delegatee must have 1/2 of the votes the delegator delegated
      const votesOfNewDelegatee = await token.getVotes(charlie);
      expect(votesOfNewDelegatee.toString()).to.equal(
        delegatorTokenAmount.div(newDelegatees.length).toString()
      );
    });

    it('contract should be able to re-delegate multiple delegatees in behalf of user many:many', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegatees
      const delegatees = [deployer, alice];

      const delegateeAmountArray = delegatees.map((delegatee) => [
        delegatee,
        delegatorTokenAmount.div(delegatees.length),
      ]);

      await multiDelegate.depositMulti(delegateeAmountArray);

      const delegatorTokenAmountAfter = await token.balanceOf(deployer);
      expect(delegatorTokenAmountAfter.toString()).to.equal('0');

      // delegatee must have 1/2 of the votes the delegator delegated
      const votesOfDelegatee = await token.getVotes(alice);
      expect(votesOfDelegatee.toString()).to.equal(
        delegatorTokenAmount.div(delegatees.length).toString()
      );

      for (let delegateTokenId of delegatees) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegatees.length).toString()
        );
      }

      const newDelegatees = [bob, charlie, dave];

      const sourceDelegateeArray = delegatees.map((oldDelegatee) => [
        oldDelegatee,
        delegatorTokenAmount.div(delegatees.length),
      ]);

      const targetDelegateeArray = newDelegatees.map((newDelegatee) => [
        newDelegatee,
        delegatorTokenAmount.div(newDelegatees.length),
      ]);

      await multiDelegate.reDeposit(sourceDelegateeArray, targetDelegateeArray);

      for (let delegateTokenId of delegatees) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        console.log('old balance', balance.toString());
        // expect(balance.toString()).to.equal('0');
      }

      for (let delegateTokenId of newDelegatees) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        console.log('new balance', balance.toString());
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(newDelegatees.length).toString()
        );
      }

      const votesOfNewDelegatee = await token.getVotes(charlie);
      expect(votesOfNewDelegatee.toString()).to.equal(
        delegatorTokenAmount.div(newDelegatees.length).toString()
      );
    });
  });

  describe('allowance', () => {
    it('contract should revert if allowance is not provided', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      const delegatees = [alice];

      const delegateeAmountArray = delegatees.map((delegatee) => [
        delegatee,
        delegatorTokenAmount.div(delegatees.length),
      ]);

      await expect(
        multiDelegate.depositMulti(delegateeAmountArray)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });

    it('contract should revert if allowance is lesser than provided amount', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      const customAmount = ethers.utils.parseEther('100000.0'); // total ens 77000000

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, customAmount);

      const delegatees = [bob];
      const delegateeAmountArray = delegatees.map((delegatee) => [
        delegatee,
        delegatorTokenAmount.div(delegatees.length),
      ]);
      await expect(
        multiDelegate.depositMulti(delegateeAmountArray)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });
  });
});
