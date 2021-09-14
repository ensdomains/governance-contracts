require('dotenv').config();

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const ensToken = await ethers.getContract('ENSToken');
  const timelockController = await ethers.getContract('TimelockController');
  await deploy('ENSGovernor', {
    from: deployer,
    args: [ensToken.address, timelockController.address],
    log: true,
  });
  const governor = await ethers.getContract('ENSGovernor');
  await timelockController.grantRole(await timelockController.PROPOSER_ROLE(), governor.address);
  await timelockController.revokeRole(await timelockController.TIMELOCK_ADMIN_ROLE(), deployer);
};
module.exports.tags = ['ENSGovernor'];
module.exports.dependencies = ['ENSToken', 'TimelockController'];
