module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const ensToken = await ethers.getContract('ENSToken');
  await deploy('ERC20MultiDelegate', {
    from: deployer,
    args: [
        ensToken.address,
    ],
    log: true,
  });
};
module.exports.tags = ['ERC20MultiDelegate'];
module.exports.dependencies = ['ENSToken'];
