// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @dev A child contract which will be deployed by the ERC20MultiDelegate utility contract
 * This is a proxy delegator contract to vote given delegate on behalf of original delegator
 */
contract ERC20ProxyDelegator {
    constructor(ERC20Votes _token, address _delegate) payable {
        require(_token.approve(msg.sender, type(uint256).max));
        _token.delegate(_delegate);
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
    using Address for address;

    ERC20Votes public token;

    /** ### EVENTS ### */

    event MetadataURIUpdated(string uri);
    event ProxyDeployed(address indexed delegate, address proxyAddress);
    event DelegationProcessed(
        address indexed from,
        address indexed to,
        uint256 amount
    );

    /**
     * @dev Constructor.
     * @param _token The ERC20 token address
     * @param _metadata_uri ERC1155 metadata uri
     */
    constructor(
        ERC20Votes _token,
        string memory _metadata_uri
    ) ERC1155(_metadata_uri) {
        token = _token;
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
     */
    function delegateMulti(
        uint256[] calldata sources,
        uint256[] calldata targets,
        uint256[] calldata amounts
    ) external {
        _delegateMulti(sources, targets, amounts);
    }

    /**
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
    function _delegateMulti(
        uint256[] calldata sources,
        uint256[] calldata targets,
        uint256[] calldata amounts
    ) internal {
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

        // Iterate until all source and target delegates have been processed.
        for (
            uint transferIndex = 0;
            transferIndex < Math.max(sourcesLength, targetsLength);
            transferIndex++
        ) {
            address source = transferIndex < sourcesLength
                ? address(uint160(sources[transferIndex]))
                : address(0);
            address target = transferIndex < targetsLength
                ? address(uint160(targets[transferIndex]))
                : address(0);
            uint256 amount = amounts[transferIndex];

            if (transferIndex < Math.min(sourcesLength, targetsLength)) {
                // Process the delegation transfer between the current source and target delegate pair.
                _processDelegation(source, target, amount);
            } else if (transferIndex < sourcesLength) {
                // Handle any remaining source amounts after the transfer process.
                _reimburse(source, amount);
            } else if (transferIndex < targetsLength) {
                // Handle any remaining target amounts after the transfer process.
                createProxyDelegatorAndTransfer(target, amount);
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
        uint256 balance = getBalanceForDelegate(source);

        require(amount <= balance, "Insufficient balance");

        deployProxyDelegatorIfNeeded(target);
        transferBetweenDelegators(source, target, amount);

        emit DelegationProcessed(source, target, amount);
    }

    /**
     * @dev Reimburses any remaining source amounts back to the delegator after the delegation transfer process.
     * @param source The source delegate from which tokens are being withdrawn.
     * @param amount The amount of tokens to be withdrawn from the source delegate.
     */
    function _reimburse(address source, uint256 amount) internal {
        // Transfer the remaining source amount or the full source amount
        // (if no remaining amount) to the delegator
        address proxyAddressFrom = retrieveProxyContractAddress(token, source);
        require(token.transferFrom(proxyAddressFrom, msg.sender, amount));
    }

    function setUri(string memory uri) external onlyOwner {
        _setURI(uri);
        emit MetadataURIUpdated(uri);
    }

    function createProxyDelegatorAndTransfer(
        address target,
        uint256 amount
    ) internal {
        address proxyAddress = deployProxyDelegatorIfNeeded(target);
        require(token.transferFrom(msg.sender, proxyAddress, amount));
    }

    function transferBetweenDelegators(
        address from,
        address to,
        uint256 amount
    ) internal {
        address proxyAddressFrom = retrieveProxyContractAddress(token, from);
        address proxyAddressTo = retrieveProxyContractAddress(token, to);
        require(token.transferFrom(proxyAddressFrom, proxyAddressTo, amount));
    }

    function deployProxyDelegatorIfNeeded(
        address delegate
    ) internal returns (address) {
        address proxyAddress = retrieveProxyContractAddress(token, delegate);

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

    function getBalanceForDelegate(
        address delegate
    ) internal view returns (uint256) {
        return ERC1155(this).balanceOf(msg.sender, uint256(uint160(delegate)));
    }

    function retrieveProxyContractAddress(
        ERC20Votes _token,
        address _delegate
    ) private view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(ERC20ProxyDelegator).creationCode,
            abi.encode(_token, _delegate)
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
