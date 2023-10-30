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

/**
 * @description executes the delegation transfer process for multiple source and target delegates.
 * @param _sourceAmounts the list of source delegates and their amounts, in the format [[address, amount], ...].
 * @param _targetAmounts the list of target delegates and their amounts, in the same format.
 * @returns the source addresses, the target addresses, and the transferred amounts.
 */
function reDistributeVotingPower(_sourceAmounts, _targetAmounts) {
  // deep copy of the input arrays to keep them immutable
  let sourceAmounts = [..._sourceAmounts.map((source) => [...source])];
  let targetAmounts = [..._targetAmounts.map((target) => [...target])];

  let fromAddresses = [];
  let toAddresses = [];
  let amounts = [];

  let sourceIndex = 0;
  let targetIndex = 0;

  // loop until we've gone through either all sources or all targets
  while (
    sourceIndex < sourceAmounts.length &&
    targetIndex < targetAmounts.length
  ) {
    let source = sourceAmounts[sourceIndex];
    let target = targetAmounts[targetIndex];

    // calculate the amount to transfer (the minimum of the source's and target's amounts)
    let transfer = ethers.BigNumber.from(source[1]).lt(target[1])
      ? source[1]
      : target[1];

    fromAddresses.push(source[0]);
    toAddresses.push(target[0]);
    amounts.push(transfer);

    // subtract the transferred amount from the source's and target's amounts
    source[1] = ethers.BigNumber.from(source[1]).sub(transfer);
    target[1] = ethers.BigNumber.from(target[1]).sub(transfer);

    // if the source's amount is now 0, move to the next source
    if (ethers.BigNumber.from(source[1]).isZero()) {
      sourceIndex += 1;
    }

    // if the target's amount is now 0, move to the next target
    if (ethers.BigNumber.from(target[1]).isZero()) {
      targetIndex += 1;
    }
  }

  // if there are remaining sources after going through all targets, add them to the output arrays
  while (sourceIndex < sourceAmounts.length) {
    fromAddresses.push(sourceAmounts[sourceIndex][0]);
    amounts.push(sourceAmounts[sourceIndex][1]);
    sourceIndex += 1;
  }

  // if there are remaining targets after going through all sources, add them to the output arrays
  while (targetIndex < targetAmounts.length) {
    toAddresses.push(targetAmounts[targetIndex][0]);
    amounts.push(targetAmounts[targetIndex][1]);
    targetIndex += 1;
  }

  return [fromAddresses, toAddresses, amounts];
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
  let reverseRegistrar;
  let universalResolver;

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

    const ReverseRegistrar = await ethers.getContractFactory('ReverseRegistrar');
    reverseRegistrar = await ReverseRegistrar.deploy(registry.address);
    await reverseRegistrar.deployed();

    const NameWrapper = await ethers.getContractFactory('DummyNameWrapper');
    nameWrapper = await NameWrapper.deploy();
    await nameWrapper.deployed();

    const Resolver = await ethers.getContractFactory('PublicResolver');
    resolver = await Resolver.deploy(
      registry.address,
      nameWrapper.address,
      ethers.constants.AddressZero,
      reverseRegistrar.address
    );
    await resolver.deployed();

    const UniversalResolver = await ethers.getContractFactory('UniversalResolver');
    universalResolver = await UniversalResolver.deploy(
      registry.address,
      ['http://localhost:8080/']
    );
    await universalResolver.deployed();

    const ENSMultiDelegate = await ethers.getContractFactory(
      'ERC20MultiDelegate'
    );
    multiDelegate = await ENSMultiDelegate.deploy(
      token.address,
      universalResolver.address
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
      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);

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

      await multiDelegate.delegateMulti(delegates, [], amounts);

      for (let delegateTokenId of delegates) {
        let balance = await multiDelegate.balanceOf(deployer, delegateTokenId);
        expect(balance.toString()).to.equal('0');
      }
    });

    it('should be able to delegate to already delegated delegates', async () => {
      const firstDelegatorBalance = await token.balanceOf(deployer);

      // Give allowance to multiDelegate contract
      await token.approve(multiDelegate.address, firstDelegatorBalance);

      const delegates = [alice, bob];
      const amounts = delegates.map(() =>
        firstDelegatorBalance.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);

      const [_, secondDelegator] = await ethers.getSigners();
      const secondDelegatorBalance = await token.balanceOf(
        secondDelegator.address
      );

      await token
        .connect(secondDelegator)
        .approve(multiDelegate.address, secondDelegatorBalance);

      const amountsForSecondary = delegates.map(() =>
        secondDelegatorBalance.div(delegates.length)
      );

      await multiDelegate
        .connect(secondDelegator)
        .delegateMulti([], delegates, amountsForSecondary);

      const secondDelegatorBalanceAfter = await token.balanceOf(
        secondDelegator.address
      );
      expect(secondDelegatorBalanceAfter.toString()).to.equal('0');

      const votesOfDelegator = await token.getVotes(alice);
      expect(votesOfDelegator.toString()).to.equal(
        firstDelegatorBalance
          .div(delegates.length)
          .add(secondDelegatorBalance.div(delegates.length))
          .toString()
      );
    });

    it('should revert if no source and target provided', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);

      await expect(multiDelegate.delegateMulti([], [], [])).to.be.revertedWith(
        'Delegate: You should provide at least one source or one target delegate'
      );
    });

    it('should revert if upper 96 bits of target uint256 is not zero', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);

      await expect(
        multiDelegate.delegateMulti(
          [],
          [
            '0xff0000000000000000000000f8a6016e243e63b6e8ee1178d6a717850b5d6103',
          ],
          [delegatorTokenAmount]
        )
      ).to.be.revertedWith('Upper 96 bits of target uint256 must be zero');
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

      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);

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
      const newAmounts = newDelegates.map(() =>
        delegatorTokenAmount.div(newDelegates.length)
      );

      await multiDelegate.delegateMulti(delegates, newDelegates, newAmounts);

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

      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);

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

      const [sources, targets, newAmounts] = reDistributeVotingPower(
        sourceDelegateArray,
        targetDelegateArray
      );

      await multiDelegate.delegateMulti(sources, targets, newAmounts);

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
      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);

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

      const [sources, targets, newAmounts] = reDistributeVotingPower(
        sourceDelegateArray,
        targetDelegateArray
      );

      await multiDelegate.delegateMulti(sources, targets, newAmounts);

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

      const [revertSources, revertTargets, revertAmounts] =
        reDistributeVotingPower(targetDelegateArray, sourceDelegateArray);

      // revert re-reposit
      await multiDelegate.delegateMulti(
        revertSources,
        revertTargets,
        revertAmounts
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
      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);

      const newDelegates = [bob, charlie, dave];

      const sourceDelegateArray = delegates.map((oldDelegate) => [
        oldDelegate,
        delegatorTokenAmount.div(delegates.length * 2),
      ]);

      const targetDelegateArray = newDelegates.map((newDelegate) => [
        newDelegate,
        delegatorTokenAmount.div(newDelegates.length),
      ]);

      const [sources, targets, newAmounts] = reDistributeVotingPower(
        sourceDelegateArray,
        targetDelegateArray
      );

      await expect(
        multiDelegate.delegateMulti(sources, targets, newAmounts)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });

    it('should revert if at least one source address is not delegate of the caller', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegates = [deployer, alice];
      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);

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

      const [sources, targets, newAmounts] = reDistributeVotingPower(
        sourceDelegateArray,
        targetDelegateArray
      );

      await expect(
        multiDelegate.delegateMulti(sources, targets, newAmounts)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });

    it('should revert if upper 96 bits of source uint256 is not zero', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegates = [deployer, alice];
      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);
      const brokenDelegateList = [
        ('0x' + deployer.slice(2).padStart(64, '0')).replace('0x00', '0xff'),
        alice,
      ];
      const newDelegateList = [bob];

      const sourceDelegateArray = brokenDelegateList.map((delegate) => [
        delegate,
        delegatorTokenAmount.div(brokenDelegateList.length),
      ]);

      const targetDelegateArray = newDelegateList.map((newDelegate) => [
        newDelegate,
        delegatorTokenAmount.div(newDelegateList.length),
      ]);

      const [sources, targets, newAmounts] = reDistributeVotingPower(
        sourceDelegateArray,
        targetDelegateArray
      );

      await expect(
        multiDelegate.delegateMulti(sources, targets, newAmounts)
      ).to.be.revertedWith('Upper 96 bits of source uint256 must be zero');
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
      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);

      const delegatorTokenAmountAfterDeposit = await token.balanceOf(deployer);
      expect(delegatorTokenAmountAfterDeposit.toString()).to.equal('0');

      await multiDelegate.delegateMulti(delegates, [], amounts);

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
      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);

      const newAmounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length * 2)
      );

      await multiDelegate.delegateMulti(delegates, [], newAmounts);

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
      const delegates = [deployer, alice, bob, charlie];
      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);

      const newAmounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length / 2)
      );

      await expect(
        multiDelegate.delegateMulti(delegates, [], newAmounts)
      ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
    });

    it('should fail to withdraw if delegate was not delegated', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      // const customAmount = ethers.utils.parseEther('10000000.0'); // ens

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, delegatorTokenAmount);
      // delegate multiple delegates
      const delegates = [deployer, alice, bob, charlie];
      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await multiDelegate.delegateMulti([], delegates, amounts);

      const wrongDelegates = [deployer, alice, bob, dave];
      const withdrawAmounts = wrongDelegates.map(() =>
        delegatorTokenAmount.div(wrongDelegates.length)
      );

      await expect(
        multiDelegate.delegateMulti(wrongDelegates, [], withdrawAmounts)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });
  });

  describe('allowance', () => {
    it('should revert if allowance is not provided', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);

      const delegates = [alice];
      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );

      await expect(
        multiDelegate.delegateMulti([], delegates, amounts)
      ).to.be.revertedWith('ERC20: insufficient allowance');
    });

    it('should revert if allowance is lesser than provided amount', async () => {
      const delegatorTokenAmount = await token.balanceOf(deployer);
      const customAmount = ethers.utils.parseEther('100000.0'); // total ens 77000000

      // give allowance to multi delegate contract
      await token.approve(multiDelegate.address, customAmount);

      const delegates = [bob];
      const amounts = delegates.map(() =>
        delegatorTokenAmount.div(delegates.length)
      );
      await expect(
        multiDelegate.delegateMulti([], delegates, amounts)
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

    // it('should retrieve onchain metadata for given tokenID', async () => {
    //   expect(
    //     await multiDelegate.tokenURI(alice),
    //     "test"
    //   );
    // });
  });
});
