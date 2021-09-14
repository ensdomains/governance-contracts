require('dotenv').config();

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const ensToken = await ethers.getContract('ENSToken');
  await deploy('TokenLock', {
    from: deployer,
    args: [
        ensToken.address,
        Math.floor(new Date(process.env.UNLOCK_BEGIN).getTime() / 1000),
        Math.floor(new Date(process.env.UNLOCK_CLIFF).getTime() / 1000),
        Math.floor(new Date(process.env.UNLOCK_END).getTime() / 1000),
    ],
    log: true,
  });
};
module.exports.tags = ['TokenLock'];
module.exports.dependencies = ['ENSToken'];
