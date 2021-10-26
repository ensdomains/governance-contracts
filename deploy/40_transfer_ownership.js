const config = require('../config');

module.exports = async ({getNamedAccounts, deployments, network}) => {
  const ensToken = await ethers.getContract('ENSToken');
  const timelockController = await ethers.getContract('TimelockController');

  // Transfer ownership of the token to the timelock controller
  await ensToken.transferOwnership(timelockController.address);
};
module.exports.dependencies = ['TimelockController', 'merkle'];
module.exports.tags = ['ownership'];
