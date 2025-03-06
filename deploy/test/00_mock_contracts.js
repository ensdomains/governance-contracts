module.exports = async ({getNamedAccounts, deployments, network}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  
  // Only deploy mock contracts on test networks
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
  
  // Deploy MockReverseRegistrar
  const registry = await deployments.get('ENSRegistry');
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

module.exports.tags = ['mock-contracts'];
module.exports.dependencies = [];
