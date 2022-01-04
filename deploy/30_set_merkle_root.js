const config = require('../config');
const { ShardedMerkleTree } = require('../src/merkle');

module.exports = async ({getNamedAccounts, deployments, network}) => {
  const tree = ShardedMerkleTree.fromFiles(`airdrops/${network.name}`);
  const ensToken = await ethers.getContract('ENSToken');

  await ensToken.setMerkleRoot(tree.root);
  return true;
};
module.exports.dependencies = ['ENSToken'];
module.exports.tags = ['merkle'];
module.exports.id = 'merkle';