// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
import "./ENSToken.sol";

interface ENS {
    function resolver(bytes32 node) external view returns(address);
}

interface Resolver{
    function addr(bytes32 node) external view returns (address);
    function text(bytes32 node, string calldata key) external view returns (string memory);
}

/**
 * @dev A utility contract that returns delegate info
 */
contract ENSDelegate{
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

    /**
     * @dev get delegate detail.
     */
    function getDelegate(bytes32 node) internal view returns(Delegate memory) {
        Resolver resolver = Resolver(ens.resolver(node));
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

    function getDelegates(bytes32[] calldata nodes) external view returns(Delegate[] memory ret) {
        ret = new Delegate[](nodes.length);
        for(uint256 i = 0; i < nodes.length; i++) {
            Delegate memory d = getDelegate(nodes[i]);
            ret[i] = d;
        }
        return ret;
    }
}
