require('dotenv').config();

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  await deploy('ENSToken', {
    from: deployer,
    args: [
      ethers.BigNumber.from(10).pow(18).mul(process.env.FREE_SUPPLY + process.env.TIMELOCKED_SUPPLY),
      ethers.BigNumber.from(10).pow(18).mul(process.env.AIRDROP_SUPPLY),
      process.env.AIRDROP_MERKLE_TREE_ROOT,
    ],
    log: true,
  });
};
module.exports.tags = ['ENSToken'];
