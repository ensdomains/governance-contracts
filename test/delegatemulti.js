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
    it('should be able to delegate multiple delegates in behalf of user', async () => {
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

      await multiDelegate.delegateMulti([], delegateAmountArray);

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

      await multiDelegate.delegateMulti(delegateAmountArray, []);

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal('0');
      }
    });

    it('should be able to delegate to already delegated delegates', async () => {
      const firstDelegatorBalance = await token.balanceOf(deployer);

      // Give allowance to multiDelegate contract
      await token.approve(multiDelegate.address, firstDelegatorBalance);

      const delegateList = [alice, bob];
      const delegateAmounts = delegateList.map((delegate) => [
        delegate,
        firstDelegatorBalance.div(delegateList.length),
      ]);

      await multiDelegate.delegateMulti([], delegateAmounts);

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
        .delegateMulti([], delegateAmountsForSecondary);

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

    it('should revert if no source and target provided', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);

      await expect(multiDelegate.delegateMulti([], [])).to.be.revertedWith(
        'Delegate: You should provide at least one source or one target delegate'
      );
    });
  });

  describe('re-deposit', () => {
    it('should be able to re-delegate multiple delegates in behalf of user (1:1)', async () => {
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

      await multiDelegate.delegateMulti([], delegateAmountArray);

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

      await multiDelegate.delegateMulti(
        sourceDelegateArray,
        targetDelegateArray
      );

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

    it('should be able to re-delegate multiple delegates in behalf of user (many:many)', async () => {
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

      await multiDelegate.delegateMulti([], delegateAmountArray);

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

      await multiDelegate.delegateMulti(
        sourceDelegateArray,
        targetDelegateArray
      );

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

    it('should be able to re-delegate to already delegated delegates', async () => {
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

      await multiDelegate.delegateMulti([], delegateAmountArray);

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

      await multiDelegate.delegateMulti(
        sourceDelegateArray,
        targetDelegateArray
      );

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
      await multiDelegate.delegateMulti(
        targetDelegateArray,
        sourceDelegateArray
      );

      // delegate must have 1/2 of the votes the delegator delegated
      const votesOfOldDelegate = await token.getVotes(alice);
      expect(votesOfOldDelegate.toString()).to.equal(
        delegatorTokenAmount.div(delegates.length).toString()
      );
    });

    it('should revert if target amount is higher than source amount + caller allowance', async () => {
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

      await multiDelegate.delegateMulti([], delegateAmountArray);

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
        multiDelegate.delegateMulti(sourceDelegateArray, targetDelegateArray)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });

    it('should revert if at least one source address is not delegate of the caller', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegateList = [deployer, alice];

      const delegateAmountArray = delegateList.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegateList.length),
      ]);

      await multiDelegate.delegateMulti([], delegateAmountArray);

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
        multiDelegate.delegateMulti(sourceDelegateArray, targetDelegateArray)
      ).to.be.revertedWith(
        'Delegate: Insufficient balance in the source delegate'
      );
    });
  });

  describe('withdraw', () => {
    it('should be able to withdraw fully', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegates = [bob, charlie];

      const delegateDepositAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      await multiDelegate.delegateMulti([], delegateDepositAmountArray);

      const delegatorTokenAmountAfterDeposit = await token.balanceOf(deployer);
      expect(delegatorTokenAmountAfterDeposit.toString()).to.equal(
        "0"
      );

      const delegateWithdrawAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      await multiDelegate.delegateMulti(delegateWithdrawAmountArray, []);

      const delegatorTokenAmountAfterWithdraw = await token.balanceOf(deployer);
      expect(delegatorTokenAmountAfterWithdraw.toString()).to.equal(
        delegatorTokenAmount.toString()
      );
    });

    it('should be able to withdraw partially', async () => {
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

      await multiDelegate.delegateMulti([], delegateDepositAmountArray);

      const delegateWithdrawAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length * 2),
      ]);

      await multiDelegate.delegateMulti(delegateWithdrawAmountArray, []);

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal(
          delegatorTokenAmount.div(delegates.length * 2).toString()
        );
      }
    });

    it('should fail to withdraw if amount exceeds', async () => {
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

      await multiDelegate.delegateMulti([], delegateDepositAmountArray);

      const delegateWithdrawAmountArray = delegateList.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegateList.length / 2),
      ]);

      await expect(
        multiDelegate.delegateMulti(delegateWithdrawAmountArray, [])
      ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
    });

    it('should fail to withdraw if delegate was not delegated', async () => {
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

      await multiDelegate.delegateMulti([], delegateDepositAmountArray);

      const wrongDelegateList = [deployer, alice, bob, dave];

      const delegateWithdrawAmountArray = wrongDelegateList.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(wrongDelegateList.length),
      ]);

      await expect(
        multiDelegate.delegateMulti(delegateWithdrawAmountArray, [])
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });
  });

  describe('allowance', () => {
    it('should revert if allowance is not provided', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      const delegates = [alice];

      const delegateAmountArray = delegates.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(delegates.length),
      ]);

      await expect(
        multiDelegate.delegateMulti([], delegateAmountArray)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });

    it('should revert if allowance is lesser than provided amount', async () => {
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
        multiDelegate.delegateMulti([], delegateAmountArray)
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
      await expect(
        multiDelegate.connect(secondDelegator).setUri(newURI)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
