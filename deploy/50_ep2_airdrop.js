const config = require('../config');
const { ShardedMerkleTree } = require('../src/merkle');

module.exports = async ({getNamedAccounts, deployments, network}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const ensToken = await ethers.getContract('ENSToken');
  const timelockController = await ethers.getContract('TimelockController');
  const tree = ShardedMerkleTree.fromFiles(`airdrops/ep2`);
  await deploy('MerkleAirdrop', {
    from: deployer,
    args: [
      timelockController.address,
      ensToken.address,
      tree.root
    ],
    log: true,
  });
  return true;
};
module.exports.dependencies = ['ENSToken', 'TimelockController'];
module.exports.id = 'ep2';
module.exports.tags = ['ep2'];
