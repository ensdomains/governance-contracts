const config = require('../config');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

module.exports = async ({getNamedAccounts, deployments}) => {
    const {deploy} = deployments;
    const {deployer} = await getNamedAccounts();
    await deploy('TimelockController', {
      from: deployer,
      args: [config.MIN_TIMELOCK_DELAY, [], [ZERO_ADDRESS]],
      log: true,
    });
    return true;
  };
  module.exports.tags = ['TimelockController'];
  module.exports.id = 'TimelockController';