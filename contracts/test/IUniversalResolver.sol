// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * Interface for the UniversalResolver contract
 * This interface defines the methods needed for the ERC20MultiDelegate contract
 */
interface IUniversalResolver {
    /**
     * Performs reverse resolution for an address
     * @param reverseName The reverse name to resolve in DNS-encoded form
     * @return resolvedName The resolved name
     * @return resolvedAddress The resolved address
     * @return reverseResolver The reverse resolver address
     * @return contractAddress The contract address
     */
    function reverse(bytes calldata reverseName) external view returns (
        string memory resolvedName,
        address resolvedAddress,
        address reverseResolver,
        address contractAddress
    );
    
    /**
     * Resolves a name with additional data
     * @param name The name to resolve in DNS-encoded form
     * @param data The additional data for resolution
     * @return result The resolution result
     * @return resolverAddress The resolver address
     */
    function resolve(bytes calldata name, bytes calldata data) external view returns (
        bytes memory result,
        address resolverAddress
    );
}
