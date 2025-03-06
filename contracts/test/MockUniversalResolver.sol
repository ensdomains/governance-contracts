// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockUniversalResolver {
    mapping(address => string) public names;
    mapping(string => string) public avatars;
    bool public shouldReturnEmptyName = false;

    function setName(address addr, string memory name) public {
        names[addr] = name;
    }

    function setAvatar(string memory name, string memory avatar) public {
        avatars[name] = avatar;
    }
    
    function setShouldReturnEmptyName(bool value) public {
        shouldReturnEmptyName = value;
    }
    
    function reverse(bytes memory) public view returns (
        string memory resolvedName,
        address resolvedAddress,
        address reverseResolver,
        address contractAddress
    ) {
        if (shouldReturnEmptyName) {
            // Return empty name for the "should handle unresolved names" test
            return ("", address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8), address(0), address(0));
        } else {
            // Return "test.eth" for the "should return the correct token URI" test
            return ("test.eth", address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8), address(0), address(0));
        }
    }
    
    function resolve(bytes memory, bytes memory) public view returns (
        bytes memory result,
        address resolverAddress
    ) {
        if (shouldReturnEmptyName) {
            // Return empty avatar for the "should handle unresolved names" test
            return (abi.encode(""), address(0));
        } else {
            // Return avatar URL for the "should return the correct token URI" test
            return (abi.encode("https://example.com/avatar.png"), address(0));
        }
    }
}
