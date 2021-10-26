// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
import "./ENSToken.sol";
import '@ensdomains/ens-contracts/contracts/registry/ENS.sol';
import '@ensdomains/ens-contracts/contracts/resolvers/PublicResolver.sol';

/**
 * @dev A utility contract that returns delegate info
 */
contract ENSDelegateLookup {
    ENS ens;
    ENSToken token;
    struct Delegate { // Struct
        address addr;
        uint256 votes;
        string avatar;
        string profile;
        string twitter;
        string discord;
    }
    /**
     * @dev Constructor.
     * @param _ens The ENS registry address
     * @param _token The ENS token address
     */
    constructor(ENS _ens, ENSToken _token){
        ens = _ens;
        token = _token;
    }

    function getDelegate(bytes32 node) internal view returns(Delegate memory) {
        PublicResolver resolver = PublicResolver(ens.resolver(node));
        address addr = resolver.addr(node);
        return Delegate(
            addr,
            token.getVotes(addr),
            resolver.text(node, 'avatar'),
            resolver.text(node, 'eth.ens.delegate'),
            resolver.text(node, 'com.twitter'),
            resolver.text(node, 'com.discord')
        );
    }

    /**
     * @dev get delegate detail.
     * @param nodes The list of ENS nodehash
     */
    function getDelegates(bytes32[] calldata nodes) external view returns(Delegate[] memory ret) {
        ret = new Delegate[](nodes.length);
        for(uint256 i = 0; i < nodes.length; i++) {
            ret[i] = getDelegate(nodes[i]);
        }
        return ret;
    }
}
