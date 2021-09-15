const config = require('../config');

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const ensToken = await ethers.getContract('ENSToken');
  const timelockController = await ethers.getContract('TimelockController');
  const tokenLock = await ethers.getContract('TokenLock');

  // Transfer ownership of the token to the timelock controller
  await ensToken.transferOwnership(timelockController.address);

  // Transfer locked tokens to the tokenlock
  const timelockedSupply = ethers.BigNumber.from(10).pow(18).mul(config.TIMELOCKED_SUPPLY);
  await ensToken.approve(tokenLock.address, timelockedSupply);
  await tokenLock.lock(timelockController.address, timelockedSupply);

  // Transfer free tokens to the timelock controller
  await ensToken.transfer(timelockController.address, ethers.BigNumber.from(10).pow(18).mul(config.FREE_SUPPLY));
};
module.exports.tags = ['distribute'];
module.exports.dependencies = ['ENSToken', 'TimelockController', 'TokenLock'];
