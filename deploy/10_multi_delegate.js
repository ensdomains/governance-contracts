module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const ensToken = await ethers.getContract('ENSToken');
  const UNIVERSAL_RESOLVER = '';

  await deploy('ERC20MultiDelegate', {
    from: deployer,
    args: [
      ensToken.address,
      UNIVERSAL_RESOLVER
    ],
    log: true,
  });
};
module.exports.tags = ['ERC20MultiDelegate'];
module.exports.dependencies = ['ENSToken'];
