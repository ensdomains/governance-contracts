const config = require('../config');

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  await deploy('ENSToken', {
    from: deployer,
    args: [
      ethers.BigNumber.from(10).pow(18).mul(config.FREE_SUPPLY + config.TIMELOCKED_SUPPLY),
      ethers.BigNumber.from(10).pow(18).mul(config.AIRDROP_SUPPLY),
      config.AIRDROP_MERKLE_ROOT,
    ],
    log: true,
  });
};
module.exports.tags = ['ENSToken'];
