const config = require('../config');

const oneToken = ethers.BigNumber.from(10).pow(18);

module.exports = async ({getNamedAccounts, deployments}) => {
  const {deployer} = await getNamedAccounts();
  const ensToken = await ethers.getContract('ENSToken');
  const timelockController = await ethers.getContract('TimelockController');
  const tokenLock = await ethers.getContract('TokenLock');

  // Transfer locked tokens to the tokenlock
  const lockedDAOTokens = oneToken.mul(config.LOCKED_DAO_TOKENS);
  const totalContributorTokens = oneToken.mul(config.TOTAL_CONTRIBUTOR_TOKENS);
  await ensToken.approve(tokenLock.address, lockedDAOTokens.add(lockedContributorTokens));
  await tokenLock.lock(timelockController.address, lockedDAOTokens);

  // Transfer free contributor tokens to the contributor address
  await ensToken.transfer(config.CONTRIBUTOR_ADDRESS, totalContributorTokens);

  // Transfer free tokens to the timelock controller
  const balance = await ensToken.balanceOf(deployer);
  await ensToken.transfer(timelockController.address, balance);

  // Print out balances
  const daoBalance = await ensToken.balanceOf(timelockController.address);
  console.log(`Token balances:`);
  console.log(`  DAO: ${daoBalance.div(oneToken).toString()}`);
  const contributorBalance = await ensToken.balanceOf(config.CONTRIBUTOR_ADDRESS);
  console.log(`  Contributors: ${contributorBalance.div(oneToken).toString()}`);
  const airdropBalance = await ensToken.balanceOf(ensToken.address);
  console.log(`  Airdrop: ${airdropBalance.div(oneToken).toString()}`);
  const tokenlockBalance = await ensToken.balanceOf(tokenLock.address);
  console.log(`  TokenLock: ${tokenlockBalance.div(oneToken).toString()}`);
  const lockedDaoBalance = await tokenLock.lockedAmounts(timelockController.address);
  console.log(`    DAO: ${lockedDaoBalance.div(oneToken).toString()}`);
  const lockedContributorBalance = await tokenLock.lockedAmounts(config.CONTRIBUTOR_ADDRESS);
  console.log(`    Contributors: ${lockedContributorBalance.div(oneToken).toString()}`);
  console.log(`    TOTAL: ${lockedDaoBalance.add(lockedContributorBalance).div(oneToken).toString()}`);
  const total = daoBalance.add(contributorBalance).add(airdropBalance).add(tokenlockBalance);
  console.log(`  TOTAL: ${total.div(oneToken).toString()}`);
};
module.exports.tags = ['distribute'];
module.exports.dependencies = ['ENSToken', 'TimelockController', 'TokenLock'];
