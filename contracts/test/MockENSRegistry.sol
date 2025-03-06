// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockENSRegistry {
    mapping(bytes32 => address) public owner;
    mapping(bytes32 => address) public resolver;

    function setSubnodeOwner(bytes32 node, bytes32 label, address _owner) public {
        bytes32 subnode = keccak256(abi.encodePacked(node, label));
        owner[subnode] = _owner;
    }

    function setResolver(bytes32 node, address _resolver) public {
        resolver[node] = _resolver;
    }
}
