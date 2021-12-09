const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');
const { ethers } = require("ethers");

function hashLeaf([address, entry]) {
    return ethers.utils.solidityKeccak256(['address', 'uint256'], [address, entry.balance]);
}

class ShardedMerkleTree {
    constructor(fetcher, shardNybbles, root, total) {
        this.fetcher = fetcher;
        this.shardNybbles = shardNybbles;
        this.root = root;
        this.total = total;
        this.shards = {};
        this.trees = {};
    }

    getProof(address) {
        const shardid = address.slice(2, 2 + this.shardNybbles).toLowerCase();
        let shard = this.shards[shardid];
        if(shard === undefined) {
            shard = this.shards[shardid] = this.fetcher(shardid);
            this.trees[shardid] = new MerkleTree(Object.entries(shard.entries).map(hashLeaf), keccak256, {sort: true});
        }
        const entry = shard.entries[address];
        const leaf = hashLeaf([address, entry])
        const proof = this.trees[shardid].getProof(leaf).map((entry) => '0x' + entry.data.toString('hex'));
        return [entry, proof.concat(shard.proof)];
    }

    static build(entries, shardNybbles, directory) {
        const shards = {};
        let total = ethers.BigNumber.from(0);
        for(const [address, entry] of entries) {
            const shard = address.slice(2, 2 + shardNybbles).toLowerCase();
            if(shards[shard] === undefined) {
                shards[shard] = [];
            }
            shards[shard].push([address, entry]);
            total = total.add(entry.balance);
        }
        const roots = Object.fromEntries(Object.entries(shards)
            .map(([shard, entries]) => [shard, new MerkleTree(entries.map(hashLeaf), keccak256, {sort: true}).getRoot()]));
        const tree = new MerkleTree(Object.values(roots), keccak256, {sort: true});

        const fs = require('fs');
        const path = require('path');
        fs.mkdirSync(directory, {recursive: true});
        fs.writeFileSync(path.join(directory, 'root.json'), JSON.stringify({
            root: tree.getHexRoot(),
            shardNybbles,
            total: total.toString(),
        }));
        for(const [shard, entries] of Object.entries(shards)) {
            fs.writeFileSync(path.join(directory, shard + '.json'), JSON.stringify({
                proof: tree.getProof(roots[shard]).map((value) => '0x' + value.data.toString('hex')),
                entries: Object.fromEntries(entries),
            }));
        }
    }

    static fromFiles(directory) {
        const fs = require('fs');
        const path = require('path');
        const { root, shardNybbles, total } = JSON.parse(fs.readFileSync(path.join(directory, 'root.json'), {encoding: 'utf-8'}));
        return new ShardedMerkleTree((shard) => {
            return JSON.parse(fs.readFileSync(path.join(directory, `${shard}.json`), {encoding: 'utf-8'}));
        }, shardNybbles, root, ethers.BigNumber.from(total));
    }
}

module.exports = { ShardedMerkleTree };
