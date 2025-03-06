// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";

/**
 * A simplified mock of the UniversalResolver contract for testing purposes.
 * This mock implements only the methods needed for the ERC20MultiDelegate contract.
 */
contract MockUniversalResolver is IExtendedResolver, ERC165 {
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
    
    /**
     * Mock implementation of reverse resolution
     * This method is called by ERC20MultiDelegate.tokenURI to resolve an address to a name
     */
    function reverse(bytes calldata) external view returns (
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
    
    /**
     * Implementation of the IExtendedResolver interface
     * This method is called by ERC20MultiDelegate.tokenURI to resolve a name to avatar data
     */
    function resolve(
        bytes memory name,
        bytes memory data
    ) external view override returns (bytes memory) {
        if (shouldReturnEmptyName) {
            // Return empty avatar for the "should handle unresolved names" test
            return abi.encode("");
        } else {
            // Return avatar URL for the "should return the correct token URI" test
            return abi.encode("https://example.com/avatar.png");
        }
    }
    
    /**
     * Mock implementation of supportsInterface
     * This method is used to check if the contract supports specific interfaces
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IExtendedResolver).interfaceId || 
               interfaceId == 0x9061b923 || // IExtendedResolver
               super.supportsInterface(interfaceId);
    }
}
