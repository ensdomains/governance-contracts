const config = require('../config');
const { ShardedMerkleTree } = require('../src/merkle');

module.exports = async ({getNamedAccounts, deployments, network}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const tree = ShardedMerkleTree.fromFiles(`airdrops/${network.name}`);
  const totalSupply = ethers.BigNumber.from(10).pow(18).mul(config.TOTAL_SUPPLY);
  await deploy('ENSToken', {
    from: deployer,
    args: [
      totalSupply.sub(tree.total),
      tree.total,
      tree.root,
    ],
    log: true,
  });
};
module.exports.tags = ['ENSToken'];
