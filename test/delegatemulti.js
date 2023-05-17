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
    it('contract should be able to delegate multiple delegates in behalf of user', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegates = [deployer, alice, bob, charlie];

      const delegateAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      await multiDelegate.depositMulti(delegateAmountArray);

      const delegatorTokenAmountAfter = await token.balanceOf(deployer);
      expect(delegatorTokenAmountAfter.toString()).to.equal('0');

      // delegator must have 1/4 of the votes the delegator delegated
      const votesOfDelegator = await token.getVotes(deployer);
      expect(votesOfDelegator.toString()).to.equal(
        delegatorTokenAmount.div(delegates.length).toString()
      );

      // delegate must have 1/4 of the votes the delegator delegated
      const votesOfDelegate = await token.getVotes(alice);
      expect(votesOfDelegate.toString()).to.equal(
        delegatorTokenAmount.div(delegates.length).toString()
      );

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegates.length).toString()
        );
      }

      await multiDelegate.withdrawMulti(delegateAmountArray);

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal('0');
      }
    });

    it('contract should be able to delegate to already delegated delegates', async () => {
      const firstDelegatorBalance = await token.balanceOf(deployer);

      // Give allowance to multiDelegate contract
      await token.approve(multiDelegate.address, firstDelegatorBalance);

      const delegateList = [alice, bob];
      const delegateAmounts = delegateList.map((delegate) => [
        delegate,
        firstDelegatorBalance.div(delegateList.length),
      ]);

      await multiDelegate.depositMulti(delegateAmounts);

      const [_, secondDelegator] = await ethers.getSigners();
      const secondDelegatorBalance = await token.balanceOf(
        secondDelegator.address
      );

      await token
        .connect(secondDelegator)
        .approve(multiDelegate.address, secondDelegatorBalance);

      const delegateAmountsForSecondary = delegateList.map((delegate) => [
        delegate,
        secondDelegatorBalance.div(delegateList.length),
      ]);

      await multiDelegate
        .connect(secondDelegator)
        .depositMulti(delegateAmountsForSecondary);

      const secondDelegatorBalanceAfter = await token.balanceOf(
        secondDelegator.address
      );
      expect(secondDelegatorBalanceAfter.toString()).to.equal('0');

      const votesOfDelegator = await token.getVotes(alice);
      expect(votesOfDelegator.toString()).to.equal(
        firstDelegatorBalance
          .div(delegateList.length)
          .add(secondDelegatorBalance.div(delegateList.length))
          .toString()
      );
    });

    it('contract should revert if no delegate provided', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);

      const delegates = [];
      const delegateAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);
      await expect(
        multiDelegate.depositMulti(delegateAmountArray)
      ).to.be.revertedWith('You should pick at least one delegate');
    });
  });

  describe('re-deposit', () => {
    it('contract should be able to re-delegate multiple delegates in behalf of user 1:1', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegates = [deployer, alice];

      const delegateAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      await multiDelegate.depositMulti(delegateAmountArray);

      const delegatorTokenAmountAfter = await token.balanceOf(deployer);
      expect(delegatorTokenAmountAfter.toString()).to.equal('0');

      // delegate must have 1/2 of the votes the delegator delegated
      const votesOfDelegate = await token.getVotes(alice);
      expect(votesOfDelegate.toString()).to.equal(
        delegatorTokenAmount.div(delegates.length).toString()
      );

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegates.length).toString()
        );
      }

      const newDelegates = [bob, charlie];

      const sourceDelegateArray = delegates.map((oldDelegate, index) => [
        oldDelegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      const targetDelegateArray = newDelegates.map((newDelegate, index) => [
        newDelegate,
        delegatorTokenAmount.div(newDelegates.length),
      ]);

      await multiDelegate.reDeposit(sourceDelegateArray, targetDelegateArray);

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal('0');
      }

      for (let delegateTokenId of newDelegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegates.length).toString()
        );
      }

      // delegate must have 1/2 of the votes the delegator delegated
      const votesOfNewDelegate = await token.getVotes(charlie);
      expect(votesOfNewDelegate.toString()).to.equal(
        delegatorTokenAmount.div(newDelegates.length).toString()
      );
    });

    it('contract should be able to re-delegate multiple delegates in behalf of user many:many', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegates = [deployer, alice];

      const delegateAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      await multiDelegate.depositMulti(delegateAmountArray);

      const delegatorTokenAmountAfter = await token.balanceOf(deployer);
      expect(delegatorTokenAmountAfter.toString()).to.equal('0');

      // delegate must have 1/2 of the votes the delegator delegated
      const votesOfDelegate = await token.getVotes(alice);
      expect(votesOfDelegate.toString()).to.equal(
        delegatorTokenAmount.div(delegates.length).toString()
      );

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegates.length).toString()
        );
      }

      const newDelegates = [bob, charlie, dave];

      const sourceDelegateArray = delegates.map((oldDelegate) => [
        oldDelegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      const targetDelegateArray = newDelegates.map((newDelegate) => [
        newDelegate,
        delegatorTokenAmount.div(newDelegates.length),
      ]);

      await multiDelegate.reDeposit(sourceDelegateArray, targetDelegateArray);

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal('0');
      }

      for (let delegateTokenId of newDelegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(newDelegates.length).toString()
        );
      }

      const votesOfNewDelegate = await token.getVotes(charlie);
      expect(votesOfNewDelegate.toString()).to.equal(
        delegatorTokenAmount.div(newDelegates.length).toString()
      );
    });

    it('contract should be able to re-delegate to already delegated delegates', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegates = [deployer, alice];

      const delegateAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      await multiDelegate.depositMulti(delegateAmountArray);

      const delegatorTokenAmountAfter = await token.balanceOf(deployer);
      expect(delegatorTokenAmountAfter.toString()).to.equal('0');

      // delegate must have 1/2 of the votes the delegator delegated
      const votesOfDelegate = await token.getVotes(alice);
      expect(votesOfDelegate.toString()).to.equal(
        delegatorTokenAmount.div(delegates.length).toString()
      );

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegates.length).toString()
        );
      }

      const newDelegates = [bob, charlie];

      const sourceDelegateArray = delegates.map((oldDelegate, index) => [
        oldDelegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      const targetDelegateArray = newDelegates.map((newDelegate, index) => [
        newDelegate,
        delegatorTokenAmount.div(newDelegates.length),
      ]);

      await multiDelegate.reDeposit(sourceDelegateArray, targetDelegateArray);

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal('0');
      }

      for (let delegateTokenId of newDelegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegates.length).toString()
        );
      }

      // delegate must have 1/2 of the votes the delegator delegated
      const votesOfNewDelegate = await token.getVotes(charlie);
      expect(votesOfNewDelegate.toString()).to.equal(
        delegatorTokenAmount.div(newDelegates.length).toString()
      );

      // revert re-reposit
      await multiDelegate.reDeposit(targetDelegateArray, sourceDelegateArray);

      // delegate must have 1/2 of the votes the delegator delegated
      const votesOfOldDelegate = await token.getVotes(alice);
      expect(votesOfOldDelegate.toString()).to.equal(
        delegatorTokenAmount.div(delegates.length).toString()
      );
    });

    it('contract should revert if target amount is higher than source amount', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegates = [deployer, alice];

      const delegateAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      await multiDelegate.depositMulti(delegateAmountArray);

      const newDelegates = [bob, charlie, dave];

      const sourceDelegateArray = delegates.map((oldDelegate) => [
        oldDelegate,
        delegatorTokenAmount.div(delegates.length * 2),
      ]);

      const targetDelegateArray = newDelegates.map((newDelegate) => [
        newDelegate,
        delegatorTokenAmount.div(newDelegates.length),
      ]);

      await expect(
        multiDelegate.reDeposit(sourceDelegateArray, targetDelegateArray)
      ).to.be.revertedWith(
        'ReDeposit: Total target amount cannot be greater than source amount'
      );
    });

    it('contract should revert if at least one source address is not delegate of the caller', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegateList = [deployer, alice];

      const delegateAmountArray = delegateList.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegateList.length),
      ]);

      await multiDelegate.depositMulti(delegateAmountArray);

      const wrongDelegateList = [charlie, alice];
      const newDelegateList = [bob];

      const sourceDelegateArray = wrongDelegateList.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(wrongDelegateList.length),
      ]);

      const targetDelegateArray = newDelegateList.map((newDelegate) => [
        newDelegate,
        delegatorTokenAmount.div(newDelegateList.length),
      ]);

      await expect(
        multiDelegate.reDeposit(sourceDelegateArray, targetDelegateArray)
      ).to.be.revertedWith(
        'ReDeposit: Insufficient balance in the source delegate'
      );
    });

    it('contract should revert if no source provided', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      const sourceDelegateList = [];
      const targetDelegateList = [bob];

      const sourceDelegateArray = sourceDelegateList.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(sourceDelegateList.length),
      ]);

      const targetDelegateArray = targetDelegateList.map((newDelegate) => [
        newDelegate,
        delegatorTokenAmount.div(targetDelegateList.length),
      ]);

      await expect(
        multiDelegate.reDeposit(sourceDelegateArray, targetDelegateArray)
      ).to.be.revertedWith(
        'ReDeposit: You should pick at least one source and one target delegate'
      );
    });

    it('contract should revert if no target provided', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      const sourceDelegateList = [bob];
      const targetDelegateList = [];

      const sourceDelegateArray = sourceDelegateList.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(sourceDelegateList.length),
      ]);

      const targetDelegateArray = targetDelegateList.map((newDelegate) => [
        newDelegate,
        delegatorTokenAmount.div(targetDelegateList.length),
      ]);

      await expect(
        multiDelegate.reDeposit(sourceDelegateArray, targetDelegateArray)
      ).to.be.revertedWith(
        'ReDeposit: You should pick at least one source and one target delegate'
      );
    });
  });

  describe('withdraw', () => {
    it('contract should be able to withdraw partially', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegates = [deployer, alice, bob, charlie];

      const delegateDepositAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      await multiDelegate.depositMulti(delegateDepositAmountArray);

      const delegateWithdrawAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length * 2),
      ]);

      await multiDelegate.withdrawMulti(delegateWithdrawAmountArray);

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegates.length * 2).toString()
        );
      }
    });

    it('contract should fail to withdraw if amount exceeds', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegateList = [deployer, alice, bob, charlie];

      const delegateDepositAmountArray = delegateList.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegateList.length),
      ]);

      await multiDelegate.depositMulti(delegateDepositAmountArray);

      const delegateWithdrawAmountArray = delegateList.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegateList.length / 2),
      ]);

      await expect(
        multiDelegate.withdrawMulti(delegateWithdrawAmountArray)
      ).to.be.revertedWith(
        'WithdrawMulti: Requested amount exceeds delegate balance'
      );
    });

    it('contract should fail to withdraw if delegate was not delegated', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegateList = [deployer, alice, bob, charlie];

      const delegateDepositAmountArray = delegateList.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegateList.length),
      ]);

      await multiDelegate.depositMulti(delegateDepositAmountArray);

      const wrongDelegateList = [deployer, alice, bob, dave];

      const delegateWithdrawAmountArray = wrongDelegateList.map(
        (delegate) => [
          delegate,
          delegatorTokenAmount.div(wrongDelegateList.length),
        ]
      );

      await expect(
        multiDelegate.withdrawMulti(delegateWithdrawAmountArray)
      ).to.be.revertedWith(
        'WithdrawMulti: Requested amount exceeds delegate balance'
      );
    });

    it('contract should revert if no withdrawal request provided', async () => {

      await expect(
        multiDelegate.withdrawMulti([])
      ).to.be.revertedWith(
        'WithdrawMulti: You should provide at least one withdrawal request'
      );
    });
  });

  describe('allowance', () => {
    it('contract should revert if allowance is not provided', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      const delegates = [alice];

      const delegateAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      await expect(
        multiDelegate.depositMulti(delegateAmountArray)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });

    it('contract should revert if allowance is lesser than provided amount', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      const customAmount = ethers.utils.parseEther('100000.0'); // total ens 77000000

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, customAmount);

      const delegates = [bob];
      const delegateAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);
      await expect(
        multiDelegate.depositMulti(delegateAmountArray)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });
  });

  describe('metadata uri', () => {
    it('deployer should be able to update metadata uri', async () => {
      const newURI = 'http://localhost:8081';
      await multiDelegate.setUri(newURI);
      expect(multiDelegate.uri, newURI);
    });

    it('others should not be able to update metadata uri', async () => {
      const newURI = 'http://localhost:8081';
      const [_, secondDelegator] = await ethers.getSigners();
      await expect(multiDelegate.connect(secondDelegator).setUri(newURI)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      );
    });
  });
});
