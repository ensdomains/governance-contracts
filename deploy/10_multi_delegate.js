module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const ensToken = await ethers.getContract('ENSToken');
  await deploy('ENSMultiDelegate', {
    from: deployer,
    args: [
        ensToken.address,
    ],
    log: true,
  });
};
module.exports.tags = ['ENSMultiDelegate'];
module.exports.dependencies = ['ENSToken'];
