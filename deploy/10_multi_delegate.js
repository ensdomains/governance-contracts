module.exports = async ({getNamedAccounts, deployments, network}) => {
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();
  const ensToken = await ethers.getContract('ENSToken');
  
  // For test networks, use the address from our test deployment
  // For other networks, get address from @ensdomains/ens-contracts
  let universalResolverAddress = '';
  
  if (network.tags.test) {
    // For test networks, use our mock UniversalResolver
    const universalResolver = await deployments.getOrNull('UniversalResolver');
    if (universalResolver) {
      universalResolverAddress = universalResolver.address;
    }
  } else {
    try {
      // For non-test networks, get the universal resolver address from @ensdomains/ens-contracts
      const networkName = network.name === 'hardhat' ? 'mainnet' : network.name;
      
      // First try to get from deployments directory
      try {
        const universalResolverDeployment = require(`@ensdomains/ens-contracts/deployments/${networkName}/UniversalResolver.json`);
        universalResolverAddress = universalResolverDeployment.address;
      } catch (deploymentError) {
        console.log(`No UniversalResolver deployment found for network ${networkName}, trying addresses...`);
        
        // If deployment not found, try addresses directory
        try {
          const addresses = require('@ensdomains/ens-contracts/addresses/' + networkName + '.json');
          if (addresses.UniversalResolver) {
            universalResolverAddress = addresses.UniversalResolver;
          }
        } catch (addressesError) {
          console.log(`No UniversalResolver address found for network ${networkName}`);
        }
      }
    } catch (error) {
      console.log(`Error fetching UniversalResolver address: ${error.message}`);
    }
  }

  console.log(`Deploying ERC20MultiDelegate with UniversalResolver address: ${universalResolverAddress || 'empty'}`);

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
