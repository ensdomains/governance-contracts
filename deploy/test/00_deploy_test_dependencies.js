module.exports = async ({getNamedAccounts, deployments, network}) => {
  // This script is now just a wrapper for the mock contracts deployment
  // Only deploy test dependencies on test networks
  if (!network.tags.test) {
    return;
  }
};

module.exports.tags = ['test-dependencies'];
module.exports.dependencies = ['mock-contracts'];
