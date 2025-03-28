// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Base64} from "@openzeppelin/contracts-v5/utils/Base64.sol";
import {ERC1155} from "@openzeppelin/contracts-v5/token/ERC1155/ERC1155.sol";
import {ERC20Votes} from "@openzeppelin/contracts-v5/token/ERC20/extensions/ERC20Votes.sol";
import {Math} from "@openzeppelin/contracts-v5/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts-v5/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts-v5/utils/Strings.sol";
import {IUniversalResolver} from "@ensdomains/ens-contracts/contracts/universalResolver/IUniversalResolver.sol";
import {NameEncoder} from "@ensdomains/ens-contracts/contracts/utils/NameEncoder.sol";

import {HexUtils} from "./utils/HexUtils.sol";
import {StringUtils} from "./utils/StringUtils.sol";

/**
 * @dev A child contract which will be deployed by the ERC20MultiDelegate utility contract
 * This is a proxy delegator contract to vote given delegate on behalf of original delegator
 */
contract ERC20ProxyDelegator {
    constructor(ERC20Votes _token, address _delegate) payable {
        require(_token.approve(msg.sender, type(uint256).max));
        _token.delegate(_delegate);
        // We don't actually require any runtime code for this contract.
        // This assembly snippet causes the constructor to return minimal bytecode for the contract, which saves gas.
        assembly ("memory-safe") {
            mstore8(0, 0xff)
            return(0, 1)
        }
    }
}

/**
 * @dev A utility contract to let delegators to pick multiple delegate
 */
contract ERC20MultiDelegate is ERC1155, Ownable {
    using NameEncoder for string;
    using HexUtils for address;
    using StringUtils for string;

    ERC20Votes public immutable token;
    IUniversalResolver public metadataResolver;

    error InvalidDelegateAddress();

    /** ### EVENTS ### */

    event MetadataURIUpdated(string uri);
    event ProxyDeployed(address indexed delegate, address proxyAddress);
    event DelegationProcessed(
        address indexed owner,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    /**
     * @dev Constructor.
     * @param _token The ERC20 token address
     * @param _metadataResolver The Universal Resolver address
     */
    constructor(
        ERC20Votes _token,
        IUniversalResolver _metadataResolver
    ) ERC1155("") Ownable(msg.sender) {
        token = _token;
        metadataResolver = _metadataResolver;
    }

    /**
     * @dev Executes the delegation transfer process for multiple source and target delegates.
     * @param sources The list of source delegates.
     * @param targets The list of target delegates.
     * @param amounts The list of amounts to deposit/withdraw.
     *
     *   When calling this function, ERC1155 tokens are minted to the caller for the targets.
     *   As per the ERC1155 standard, the recipient should either be an Externally Owned Account
     *   (EOA), or a contract that implements `ERC1155Holder`. Failure to meet these conditions
     *   will result in the transaction reverting. This may cause unintended reverts for multi-signature
     *   wallets or other interacting contracts.
     *
     * Limitations:
     * - The function performs `_burnBatch` before `_mintBatch`, which means that the function
     *   will revert if the total amount being removed from a source is greater than the amount
     *   being added to it within the same transaction.
     *
     * Example:
     * If Bob has delegated 100 tokens to Alice and 100 tokens to Charlie, and then attempts
     * to delegate by moving 100 from Alice to Charlie and then 200 from Charlie to Eve,
     * the transaction will revert. This is because `_burnBatch` will try to remove 200 tokens
     * from Charlie before adding the 100 tokens from Alice.
     *
     */
    function delegateMulti(
        uint256[] calldata sources,
        uint256[] calldata targets,
        uint256[] calldata amounts
    ) external {
        uint256 sourcesLength = sources.length;
        uint256 targetsLength = targets.length;
        uint256 amountsLength = amounts.length;

        require(
            sourcesLength > 0 || targetsLength > 0,
            "Delegate: You should provide at least one source or one target delegate"
        );

        require(
            Math.max(sourcesLength, targetsLength) == amountsLength,
            "Delegate: The number of amounts must be equal to the greater of the number of sources or targets"
        );

        uint256 minLength = Math.min(sourcesLength, targetsLength);
        // Iterate until all source and target delegates have been processed.
        for (uint transferIndex = 0; transferIndex < amountsLength; ) {
            address source = address(0);
            address target = address(0);
            if (transferIndex < sourcesLength) {
                if ((sources[transferIndex] >> 160) != 0) {
                    revert InvalidDelegateAddress();
                }
                source = address(uint160(sources[transferIndex]));
            }
            if (transferIndex < targetsLength) {
                if ((targets[transferIndex] >> 160) != 0) {
                    revert InvalidDelegateAddress();
                }
                target = address(uint160(targets[transferIndex]));
            }

            uint256 amount = amounts[transferIndex];

            if (transferIndex < minLength) {
                // Process the delegation transfer between the current source and target delegate pair.
                _processDelegation(source, target, amount);
            } else if (transferIndex < sourcesLength) {
                // Handle any remaining source amounts after the transfer process.
                _reimburse(source, amount);
            } else if (transferIndex < targetsLength) {
                // Handle any remaining target amounts after the transfer process.
                _createProxyDelegatorAndTransfer(target, amount);
            }

            unchecked {
                transferIndex++;
            }
        }

        if (sourcesLength > 0) {
            _burnBatch(msg.sender, sources, amounts[:sourcesLength]);
        }
        if (targetsLength > 0) {
            _mintBatch(msg.sender, targets, amounts[:targetsLength], "");
        }
    }

    /**
     * @dev Processes the delegation transfer between a source delegate and a target delegate.
     * @param source The source delegate from which tokens are being withdrawn.
     * @param target The target delegate to which tokens are being transferred.
     * @param amount The amount of tokens transferred between the source and target delegates.
     */
    function _processDelegation(
        address source,
        address target,
        uint256 amount
    ) internal {
        _transferBetweenDelegators(source, target, amount);

        emit DelegationProcessed(msg.sender, source, target, amount);
    }

    /**
     * @dev Reimburses any remaining source amounts back to the delegator after the delegation transfer process.
     * @param source The source delegate from which tokens are being withdrawn.
     * @param amount The amount of tokens to be withdrawn from the source delegate.
     */
    function _reimburse(address source, uint256 amount) internal {
        // Transfer the remaining source amount or the full source amount
        // (if no remaining amount) to the delegator
        address proxyAddressFrom = _retrieveProxyContractAddress(source);
        require(token.transferFrom(proxyAddressFrom, msg.sender, amount));
        emit DelegationProcessed(msg.sender, source, address(0), amount);
    }

    /**
     * @dev Generates an onchain metadata for a given tokenId.
     *
     * @param tokenId The token ID (address) of the delegate.
     * @return Onchain metadata in base64 format "data:application/json;base64,<encoded-json>".
     */
    function tokenURI(uint256 tokenId) public view returns (string memory) {
        address targetAddress = address(uint160(tokenId));
        string memory resolvedName;
        // attempt to resolve the reversed name using the metadataResolver
        try
            metadataResolver.reverse(abi.encodePacked(targetAddress), 60)
        returns (string memory _resolvedName, address, address) {
            resolvedName = _resolvedName;
        } catch {}

        string memory imageUri = "";

        if (bytes(resolvedName).length > 0) {
            (bytes memory encodedName, bytes32 namehash) = resolvedName
                .dnsEncodeName();
            bytes memory data = abi.encodeWithSignature(
                "text(bytes32,string)",
                namehash,
                "avatar"
            );

            // attempt to resolve the avatar using the universal resolver
            try metadataResolver.resolve(encodedName, data) returns (
                bytes memory _imageUri,
                address
            ) {
                imageUri = _imageUri.length == 0
                    ? ""
                    : abi.decode(_imageUri, (string));
            } catch {}
        } else {
            resolvedName = string.concat("0x", targetAddress.addressToHex());
        }

        string memory json;

        if (bytes(imageUri).length > 0) {
            json = string.concat(
                    '{"name": "',
                    resolvedName.escape(),
                    " Delegate Token",
                    '", "token_id": "',
                    Strings.toString(tokenId),
                    '", "description": "This NFT represents an ENS token delegated to ',
                    resolvedName.escape(),
                    '", "image": "',
                    imageUri.escape(),
                    '"}'
                );
        } else {
            json = string.concat(
                    '{"name": "',
                    resolvedName.escape(),
                    " Delegate Token",
                    '", "token_id": "',
                    Strings.toString(tokenId),
                    '", "description": "This NFT represents an ENS token delegated to ',
                    resolvedName.escape(),
                    '"}'
                );
        }

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function setMetadataResolver(
        IUniversalResolver _newResolver
    ) external onlyOwner {
        metadataResolver = _newResolver;
    }

    function _createProxyDelegatorAndTransfer(
        address target,
        uint256 amount
    ) internal {
        address proxyAddress = _deployProxyDelegatorIfNeeded(target);
        require(token.transferFrom(msg.sender, proxyAddress, amount));
        emit DelegationProcessed(msg.sender, address(0), target, amount);
    }

    function _transferBetweenDelegators(
        address from,
        address to,
        uint256 amount
    ) internal {
        address proxyAddressFrom = _retrieveProxyContractAddress(from);
        address proxyAddressTo = _deployProxyDelegatorIfNeeded(to);
        require(token.transferFrom(proxyAddressFrom, proxyAddressTo, amount));
    }

    function _deployProxyDelegatorIfNeeded(
        address delegate
    ) internal returns (address) {
        address proxyAddress = _retrieveProxyContractAddress(delegate);

        // check if the proxy contract has already been deployed
        uint bytecodeSize;
        assembly {
            bytecodeSize := extcodesize(proxyAddress)
        }

        // if the proxy contract has not been deployed, deploy it
        if (bytecodeSize == 0) {
            new ERC20ProxyDelegator{salt: 0}(token, delegate);
            emit ProxyDeployed(delegate, proxyAddress);
        }
        return proxyAddress;
    }

    function _retrieveProxyContractAddress(
        address _delegate
    ) private view returns (address) {
        bytes memory bytecode = bytes.concat(
            type(ERC20ProxyDelegator).creationCode,
            abi.encode(token, _delegate)
        );
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                uint256(0), // salt
                keccak256(bytecode)
            )
        );
        return address(uint160(uint256(hash)));
    }
}
