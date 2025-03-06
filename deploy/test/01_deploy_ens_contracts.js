const { ethers } = require('hardhat');

module.exports = async ({getNamedAccounts, deployments, network}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  
  // Only deploy ENS contracts on test networks
  if (!network.tags.test) {
    return;
  }
  
  // Deploy ENSRegistry (using the real contract)
  await deploy('ENSRegistry', {
    from: deployer,
    contract: 'ENSRegistry',
    args: [],
    log: true,
  });
  
  const registry = await ethers.getContract('ENSRegistry');
  
  // Deploy ReverseRegistrar (using the real contract)
  await deploy('ReverseRegistrar', {
    from: deployer,
    contract: 'ReverseRegistrar',
    args: [registry.address],
    log: true,
  });
  
  // Deploy PublicResolver (using mock for tests)
  // We use the mock because the real PublicResolver has complex dependencies
  // including ReverseClaimer which causes issues in the test environment
  await deploy('PublicResolver', {
    from: deployer,
    contract: 'contracts/test/MockPublicResolver.sol:MockPublicResolver',
    args: [registry.address],
    log: true,
  });
  
  // Deploy UniversalResolver (still using mock for tests)
  await deploy('UniversalResolver', {
    from: deployer,
    contract: 'contracts/test/MockUniversalResolver.sol:MockUniversalResolver',
    args: [],
    log: true,
  });
};

module.exports.tags = ['ens-contracts'];
module.exports.dependencies = [];
