const config = require('../config');

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const ensToken = await ethers.getContract('ENSToken');
  await deploy('ENSDelegate', {
    from: deployer,
    args: [
        config.REGISTRY_ADDRESS,
        ensToken.address,
    ],
    log: true,
  });
};
module.exports.tags = ['ENSDelegate'];
module.exports.dependencies = ['ENSToken'];
