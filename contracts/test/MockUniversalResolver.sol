// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";
import "@ensdomains/ens-contracts/contracts/universalResolver/IUniversalResolver.sol";
import {NameCoder} from "@ensdomains/ens-contracts/contracts/utils/NameCoder.sol";

/**
 * A simplified mock of the UniversalResolver contract for testing purposes.
 * This mock implements only the methods needed for the ERC20MultiDelegate contract.
 */
contract MockUniversalResolver is IExtendedResolver, ERC165 {
    mapping(address => string) public names;
    mapping(bytes => string) public avatars;

    function setName(address addr, string memory name) public {
        names[addr] = name;
    }

    function setAvatar(string memory name, string memory avatar) public {
        bytes memory nameBytes = NameCoder.encode(name);
        avatars[nameBytes] = avatar;
    }

    /**
     * Mock implementation of reverse resolution
     * This method is called by ERC20MultiDelegate.tokenURI to resolve an address to a name
     */
    function reverse(
        bytes calldata addressBytes,
        uint256 coinType
    )
        external
        view
        returns (
            string memory resolvedName,
            address resolvedAddress,
            address reverseResolver
        )
    {
        resolvedAddress = address(bytes20(addressBytes));
        resolvedName = names[resolvedAddress];
        reverseResolver = address(0);
    }

    /**
     * Implementation of the IExtendedResolver interface
     * This method is called by ERC20MultiDelegate.tokenURI to resolve a name to avatar data
     */
    function resolve(
        bytes memory name,
        bytes memory data
    ) external view override returns (bytes memory) {
        string memory avatar = avatars[name];
        if (bytes(avatar).length > 0) {
            return abi.encode(avatar);
        }
        return abi.encode("");
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
