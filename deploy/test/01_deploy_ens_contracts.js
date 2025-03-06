const { ethers } = require('hardhat');

module.exports = async ({getNamedAccounts, deployments, network}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  
  // Only deploy mock ENS contracts on test networks
  if (!network.tags.test) {
    return;
  }
  
  // Deploy MockENSRegistry
  await deploy('ENSRegistry', {
    from: deployer,
    contract: 'MockENSRegistry',
    args: [],
    log: true,
  });
  
  const registry = await ethers.getContract('ENSRegistry');
  
  // Deploy MockReverseRegistrar
  await deploy('ReverseRegistrar', {
    from: deployer,
    contract: 'MockReverseRegistrar',
    args: [registry.address],
    log: true,
  });
  
  // Deploy MockPublicResolver
  await deploy('PublicResolver', {
    from: deployer,
    contract: 'MockPublicResolver',
    args: [registry.address],
    log: true,
  });
  
  // Deploy MockUniversalResolver
  await deploy('UniversalResolver', {
    from: deployer,
    contract: 'contracts/test/MockUniversalResolver.sol:MockUniversalResolver',
    args: [],
    log: true,
  });
};

module.exports.tags = ['ens-contracts'];
module.exports.dependencies = [];
