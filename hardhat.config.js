const config = require('./config');

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require('hardhat-deploy');
require('@nomiclabs/hardhat-ethers');
require('@nomiclabs/hardhat-waffle');

// Load environment variables from .env file. Suppress warnings using silent
// if this file is missing. dotenv will never modify any environment variables
// that have already been set.
// https://github.com/motdotla/dotenv
require('dotenv').config({ silent: true });

// hardhat actions
require('./tasks/maketree');

real_accounts = undefined;
if (process.env.DEPLOYER_KEY) {
  real_accounts = [process.env.DEPLOYER_KEY];
}

module.exports = {
  solidity: '0.8.7',
  settings: {
    optimizer: {
      enabled: true // runs: 200 by default
    }
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    delegatee: {
      default: 1,
    },
  },
  networks: {
    hardhat: {
      initialDate: config.UNLOCK_BEGIN,
      tags: ['test'],
      allowUnlimitedContractSize: true,
    },
    mainnet: {
      url: "http://localhost:8545/",
      chainId: 1,
      accounts: real_accounts,
      maxPriorityFeePerGas: 1000000000
    },
    tenderly: {
      url: "https://rpc.tenderly.co/fork/bd704e15-7f2c-4f12-8c1a-9bedf536c336"
    }
  },
};
