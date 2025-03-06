// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockReverseRegistrar {
    address public registry;
    address public defaultResolver;
    mapping(address => string) public names;

    constructor(address _registry) {
        registry = _registry;
    }

    function setDefaultResolver(address _resolver) public {
        defaultResolver = _resolver;
    }

    function claim(address owner) public returns (bytes32) {
        return bytes32(0);
    }
    
    function setName(string memory name) public {
        names[msg.sender] = name;
    }
}
