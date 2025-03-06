// This file serves as a tag collector for test dependencies
// It doesn't need to deploy anything itself since the actual deployments
// are handled by the 01_deploy_ens_contracts.js script

module.exports = async ({getNamedAccounts, deployments, network}) => {
  // This is just a tag collector, no deployment logic needed
};

module.exports.tags = ['test-dependencies'];
module.exports.dependencies = ['ens-contracts'];
