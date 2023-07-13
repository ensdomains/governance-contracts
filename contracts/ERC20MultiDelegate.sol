// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

/**
 * @dev A child contract which will be deployed by the ERC20MultiDelegate utility contract
 * This is a proxy delegator contract to vote given delegate on behalf of original delegator
 */
contract ERC20ProxyDelegator {
    constructor(ERC20Votes _token, address _delegate) {
        _token.approve(msg.sender, type(uint256).max);
        _token.delegate(_delegate);
    }
}

/**
 * @dev A utility contract to let delegators to pick multiple delegate
 */
contract ERC20MultiDelegate is ERC1155, Ownable {
    using Address for address;

    ERC20Votes public token;

    /** ### EVENTS ### */

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
     */
    function delegateMulti(
        address[] calldata sources,
        address[] calldata targets,
        uint256[] calldata amounts
    ) external {
        _delegateMulti(sources, targets, amounts);
    }

    function _delegateMulti(
        address[] calldata sources,
        address[] calldata targets,
        uint256[] calldata amounts
    ) internal {
        uint256 sourcesLength = sources.length;
        uint256 targetsLength = targets.length;

        require(
            sourcesLength > 0 || targetsLength > 0,
            "Delegate: You should provide at least one source or one target delegate"
        );

        uint256 transferIndex = 0;
        uint256[] memory sourceIds = new uint256[](sourcesLength);
        uint256[] memory targetIds = new uint256[](targetsLength);
        uint256[] memory withdrawnAmounts = new uint256[](sourcesLength);
        uint256[] memory depositedAmounts = new uint256[](targetsLength);

        // Iterate until all source and target delegates have been processed.
        while (transferIndex < sourcesLength || transferIndex < targetsLength) {
            if (
                transferIndex < sourcesLength && transferIndex < targetsLength
            ) {
                // Process the delegation transfer between the current source and target delegate pair.
                _processDelegation(
                    sources[transferIndex],
                    targets[transferIndex],
                    amounts[transferIndex]
                );
                sourceIds[transferIndex] = uint256(
                    uint160(sources[transferIndex])
                );
                withdrawnAmounts[transferIndex] = amounts[transferIndex];

                targetIds[transferIndex] = uint256(
                    uint160(targets[transferIndex])
                );
                depositedAmounts[transferIndex] = amounts[transferIndex];
            } else if (transferIndex < sourcesLength) {
                // Handle any remaining source amounts after the transfer process.
                _reimburse(sources[transferIndex], amounts[transferIndex]);
                sourceIds[transferIndex] = uint256(
                    uint160(sources[transferIndex])
                );
                withdrawnAmounts[transferIndex] = amounts[transferIndex];
            } else if (transferIndex < targetsLength) {
                // Handle any remaining target amounts after the transfer process.
                createProxyDelegatorAndTransfer(
                    targets[transferIndex],
                    amounts[transferIndex]
                );
                targetIds[transferIndex] = uint256(
                    uint160(targets[transferIndex])
                );
                depositedAmounts[transferIndex] = amounts[transferIndex];
            }
            transferIndex++;
        }

        if (sourcesLength > 0) {
            _burnBatch(msg.sender, sourceIds, withdrawnAmounts);
        }
        if (targetsLength > 0) {
            _mintBatch(msg.sender, targetIds, depositedAmounts, "");
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
        uint256 balance = getBalanceForDelegatee(source);

        require(
            amount <= balance,
            "Delegate: Insufficient balance in the source delegate"
        );

        transferBetweenDelegators(source, target, amount);

        deployProxyDelegatorIfNeeded(target);

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
        token.transferFrom(proxyAddressFrom, msg.sender, amount);
    }

    function setUri(string memory uri) external onlyOwner {
        _setURI(uri);
    }

    function createProxyDelegatorAndTransfer(
        address target,
        uint256 amount
    ) internal {
        address proxyAddress = deployProxyDelegatorIfNeeded(target);
        token.transferFrom(msg.sender, proxyAddress, amount);
    }

    function transferBetweenDelegators(
        address from,
        address to,
        uint256 amount
    ) internal {
        address proxyAddressFrom = retrieveProxyContractAddress(token, from);
        address proxyAddressTo = retrieveProxyContractAddress(token, to);
        token.transferFrom(proxyAddressFrom, proxyAddressTo, amount);
    }

    function deployProxyDelegatorIfNeeded(
        address delegate
    ) internal returns (address) {
        address proxyAddress = retrieveProxyContractAddress(token, delegate);

        // check if the proxy contract has already been deployed
        bytes memory bytecode;
        assembly {
            bytecode := extcodesize(proxyAddress)
        }

        // if the proxy contract has not been deployed, deploy it
        if (bytecode.length == 0) {
            new ERC20ProxyDelegator{salt: 0}(token, delegate);
            emit ProxyDeployed(delegate, proxyAddress);
        }
        return proxyAddress;
    }

    function getBalanceForDelegatee(
        address delegate
    ) internal view returns (uint256) {
        return ERC1155(this).balanceOf(msg.sender, uint256(uint160(delegate)));
    }

    function getContractAddress(
        bytes memory bytecode
    ) private view returns (address) {
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

    function getBytecode(
        ERC20Votes _token,
        address _delegate
    ) private pure returns (bytes memory) {
        bytes memory bytecode = type(ERC20ProxyDelegator).creationCode;
        return abi.encodePacked(bytecode, abi.encode(_token, _delegate));
    }

    function retrieveProxyContractAddress(
        ERC20Votes _token,
        address _delegate
    ) private view returns (address) {
        bytes memory bytecode = getBytecode(_token, _delegate);
        return getContractAddress(bytecode);
    }
}
