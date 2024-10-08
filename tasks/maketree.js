const { task } = require('hardhat/config');
const { ShardedMerkleTree } = require('../src/merkle');

task('maketree', 'Generates a merkle airdrop tree')
  .addParam('file', 'File to read airdrop data from')
  .addOptionalParam('name', 'Output filename for the airdrop', undefined)
  .addOptionalParam(
    'shardnybbles',
    'Number of nybbles to use for sharding',
    2,
    types.int
  )
  .setAction(async ({ file, name, shardnybbles }, hre) => {
    if (name === undefined) {
      name = hre.network.name;
    }
    let airdrops;
    if (hre.network.tags.test) {
      shardnybbles = 1;
      const signers = await hre.ethers.getSigners();
      airdrops = signers.slice(0, 20).map((signer, index) => [
        signer.address,
        {
          past_tokens: '625000000000000000000000',
          future_tokens: '625000000000000000000000',
          longest_owned_name:
            '0x04f740db81dc36c853ab4205bddd785f46e79ccedca351fc6dfcbd8cc9a33dd6', // keccak256('test')
          last_expiring_name:
            '0x04f740db81dc36c853ab4205bddd785f46e79ccedca351fc6dfcbd8cc9a33dd6',
          balance: '1250000000000000000000000',
          has_reverse_record: index % 2 == 0,
        },
      ]);
    } else {
      const fs = require('fs');
      airdrops = fs
        .readFileSync(file, { encoding: 'utf-8' })
        .split('\n')
        .filter((x) => x.length > 0)
        .map((line) => {
          const data = JSON.parse(line);
          const owner = data.owner;
          delete data.owner;
          data.balance = hre.ethers.BigNumber.from(
            data.past_tokens.toString().split('.')[0]
          )
            .add(
              hre.ethers.BigNumber.from(
                data.future_tokens.toString().split('.')[0]
              )
            )
            .toString();
          return [owner, data];
        });
    }
    ShardedMerkleTree.build(airdrops, shardnybbles, `airdrops/${name}`);
  });
