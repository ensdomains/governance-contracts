module.exports = async ({getNamedAccounts, deployments, network}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const ensToken = await ethers.getContract('ENSToken');
  
  // For test networks, use the address from our test deployment
  // For other networks, try to get address from @ensdomains/ens-contracts
  let universalResolverAddress = '';
  
  if (network.tags.test) {
    const universalResolver = await deployments.getOrNull('UniversalResolver');
    if (universalResolver) {
      universalResolverAddress = universalResolver.address;
    }
  }

  await deploy('ERC20MultiDelegate', {
    from: deployer,
    args: [
      ensToken.address,
      universalResolverAddress
    ],
    log: true,
  });
};
module.exports.tags = ['ERC20MultiDelegate'];
module.exports.dependencies = ['ENSToken', 'test-dependencies'];
