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
    if (!universalResolver) {
      throw new Error('UniversalResolver not deployed. Make sure to run the test dependencies deployment first.');
    }
    universalResolverAddress = universalResolver.address;
  } else {
    try {
      // For non-test networks, get the universal resolver address from @ensdomains/ens-contracts
      const networkName = network.name === 'hardhat' ? 'mainnet' : network.name;
      
      // Try to get from deployments directory
      try {
        const universalResolverDeployment = require(`@ensdomains/ens-contracts/deployments/${networkName}/UniversalResolver.json`);
        universalResolverAddress = universalResolverDeployment.address;
      } catch (deploymentError) {
        console.log(`No UniversalResolver deployment found for network ${networkName}`);
        throw deploymentError; // Re-throw the error to halt the deployment
      }
    } catch (error) {
      console.log(`Error fetching UniversalResolver address: ${error.message}`);
      throw error; // Re-throw the error to halt the deployment
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
module.exports.dependencies = ['ENSToken', 'ens-contracts'];
