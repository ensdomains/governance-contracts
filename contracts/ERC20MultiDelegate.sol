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

    struct DelegateAmount {
        address delegate;
        uint256 amount;
    }

    struct ReDepositRecord {
        uint256[] sourceIds;
        uint256[] targetIds;
        uint256[] withdrawnAmounts;
        uint256[] redepositedAmounts;
        uint256 sourceIndex;
        uint256 targetIndex;
        uint256 remainingSourceAmount;
        uint256 remainingTargetAmount;
        uint256 totalRedepositedAmount;
    }

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
     * @dev Deposits and delegates voting power to the multiple delegates.
     * @param delegateAmounts The list of delegate addresses and corresponding list of ERC20 voting power amount amounts to delegate.
     */
    function depositMulti(
        DelegateAmount[] calldata delegateAmounts
    ) external {
        uint256 delegatesLength = delegateAmounts.length;

        require(
            delegatesLength > 0,
            "DepositMulti: You should pick at least one delegate"
        );

        uint256[] memory ids = new uint256[](delegatesLength);
        uint256[] memory amounts = new uint256[](delegatesLength);

        for (uint256 index = 0; index < delegatesLength; index++) {
            address delegate = delegateAmounts[index].delegate;
            uint256 amount = delegateAmounts[index].amount;

            createProxyDelegatorAndTransfer(delegate, amount);

            ids[index] = uint256(uint160(delegate));
            amounts[index] = amount;
        }

        mintBatch(msg.sender, ids, amounts);
    }

    /**
     * @dev Re-delegates voting power between delegates.
     * @param sources The list of source delegate addresses and amounts to withdraw.
     * @param targets The list of target delegate addresses and amounts to redeposit.
     * The remaning part if any, will be withdrawn to the user account
     */
    function reDeposit(
        DelegateAmount[] calldata sources,
        DelegateAmount[] calldata targets
    ) external {
        uint256 sourcesLength = sources.length;
        uint256 targetsLength = targets.length;

        require(
            sourcesLength > 0 && targetsLength > 0,
            "ReDeposit: You should pick at least one source and one target delegate"
        );

        ReDepositRecord memory record = ReDepositRecord({
            sourceIds: new uint256[](sourcesLength),
            targetIds: new uint256[](targetsLength),
            withdrawnAmounts: new uint256[](sourcesLength),
            redepositedAmounts: new uint256[](targetsLength),
            sourceIndex: 0,
            targetIndex: 0,
            remainingSourceAmount: sources[0].amount,
            remainingTargetAmount: targets[0].amount,
            totalRedepositedAmount: 0
        });

        _reDeposit(sources, targets, record);

        require(
            record.remainingTargetAmount == 0,
            "ReDeposit: Total target amount cannot be greater than source amount"
        );

        // Reimburses any remaining source amounts back to the delegator after the re-deposit process.
        if (record.remainingSourceAmount > 0) {
            _reimburse(record, sources, sourcesLength, msg.sender);
        }

        burnBatch(msg.sender, record.sourceIds, record.withdrawnAmounts);
        mintBatch(msg.sender, record.targetIds, record.redepositedAmounts);
    }

    /**
     * @dev Executes the re-deposit process for multiple source and target delegates.
     * @param sources The list of source delegates with the amounts to withdraw.
     * @param targets The list of target delegates with the amounts to re-deposit.
     * @param record The current state of the re-deposit process.
     */
    function _reDeposit(
        DelegateAmount[] calldata sources,
        DelegateAmount[] calldata targets,
        ReDepositRecord memory record
    ) internal {
        uint256 sourcesLength = sources.length;
        uint256 targetsLength = targets.length;

        // Iterate until all source and target delegates have been processed.
        while (
            record.sourceIndex < sourcesLength &&
            record.targetIndex < targetsLength
        ) {
            // Process the re-deposit between the current source and target delegate pair.
            uint256 transferAmount = _processReDeposit(
                sources,
                targets,
                record
            );

            // Update the remaining amounts for the current source and target delegates.
            record.remainingSourceAmount -= transferAmount;
            record.remainingTargetAmount -= transferAmount;

            // Update the total amounts for withdrawn and redeposited tokens.
            record.totalRedepositedAmount += transferAmount;

            // If the current source delegate has no remaining amount to withdraw,
            // store its ID and the withdrawn amount, and move to the next source delegate.
            if (record.remainingSourceAmount == 0) {
                record.sourceIds[record.sourceIndex] = uint256(
                    uint160(sources[record.sourceIndex].delegate)
                );
                record.withdrawnAmounts[record.sourceIndex] = sources[
                    record.sourceIndex
                ].amount;
                record.sourceIndex++;

                if (record.sourceIndex < sourcesLength) {
                    record.remainingSourceAmount = sources[record.sourceIndex]
                        .amount;
                }
            }

            // If the current target delegate has no remaining amount to re-deposit,
            // store its ID and the redeposited amount, and move to the next target delegate.
            if (record.remainingTargetAmount == 0) {
                record.targetIds[record.targetIndex] = uint256(
                    uint160(targets[record.targetIndex].delegate)
                );
                record.redepositedAmounts[record.targetIndex] = targets[
                    record.targetIndex
                ].amount;
                record.targetIndex++;

                if (record.targetIndex < targetsLength) {
                    record.remainingTargetAmount = targets[record.targetIndex]
                        .amount;
                }
            }
        }
    }

    /**
     * @dev Processes the re-deposit between a source and a target.
     * @param sources The list of source delegates with the amounts to withdraw.
     * @param targets The list of target delegates with the amounts to re-deposit.
     * @param record The current state of the re-deposit process.
     * @return transferAmount The amount of tokens transferred between the current source and target delegates.
     */
    function _processReDeposit(
        DelegateAmount[] calldata sources,
        DelegateAmount[] calldata targets,
        ReDepositRecord memory record
    ) internal returns (uint256 transferAmount) {
        // Get the balance of the current source delegate.
        uint256 balance = getBalanceForDelegatee(
            sources[record.sourceIndex].delegate
        );

        // Ensure that the remaining amount to withdraw from the source delegate is not greater than the balance.
        require(
            record.remainingSourceAmount <= balance,
            "ReDeposit: Insufficient balance in the source delegate"
        );

        // Determine the transfer amount as the minimum between the remaining amounts of source and target delegates.
        transferAmount = (record.remainingSourceAmount <
            record.remainingTargetAmount)
            ? record.remainingSourceAmount
            : record.remainingTargetAmount;

        // Transfer the determined amount between the current source and target delegates.
        transferBetweenDelegators(
            sources[record.sourceIndex].delegate,
            targets[record.targetIndex].delegate,
            transferAmount
        );

        // Deploy a proxy delegator for the target delegate if it does not already exist.
        deployProxyDelegatorIfNeeded(targets[record.targetIndex].delegate);

        // Return the transfer amount.
        return transferAmount;
    }

    /**
     * @dev Reimburses any remaining source amounts back to the delegator after the re-deposit process.
     * @param record The current state of the re-deposit process.
     * @param sources The list of source delegate addresses and amounts to withdraw.
     * @param sourcesLength The length of the sources array.
     * @param delegator The address of the delegator.
     */
    function _reimburse(
        ReDepositRecord memory record,
        DelegateAmount[] memory sources,
        uint256 sourcesLength,
        address delegator
    ) internal {
        // Iterate through the remaining source delegates
        while (record.sourceIndex < sourcesLength) {
            // Transfer the remaining source amount or the full source amount 
            // (if no remaining amount) to the delegator
            transferBetweenDelegators(
                sources[record.sourceIndex].delegate,
                delegator,
                record.remainingSourceAmount > 0
                    ? record.remainingSourceAmount
                    : sources[record.sourceIndex].amount
            );

            // Add the source delegate ID to the record for burning and minting processes
            record.sourceIds[record.sourceIndex] = uint256(
                uint160(sources[record.sourceIndex].delegate)
            );

            // Add the withdrawn amount for the current source delegate in the record for burning and minting processes
            record.withdrawnAmounts[record.sourceIndex] = sources[
                record.sourceIndex
            ].amount;

            // Move to the next source delegate
            record.sourceIndex++;
        }
    }

    /**
     * @dev Withdraws delegated ERC20 voting power from proxy delegators to the actual delegator
     * @param withdrawals List of DelegateAmount structs containing delegate addresses and withdrawal amounts
     */
    function withdrawMulti(DelegateAmount[] calldata withdrawals) external {
        uint256 withdrawalsLength = withdrawals.length;

        require(
            withdrawalsLength > 0,
            "WithdrawMulti: You should provide at least one withdrawal request"
        );

        uint256[] memory delegates = new uint256[](withdrawalsLength);
        uint256[] memory amounts = new uint256[](withdrawalsLength);

        for (uint256 index = 0; index < withdrawalsLength; index++) {
            address delegate = withdrawals[index].delegate;
            uint256 requestedAmount = withdrawals[index].amount;
            uint256 delegateBalance = getBalanceForDelegatee(delegate);

            require(
                requestedAmount <= delegateBalance,
                "WithdrawMulti: Requested amount exceeds delegate balance"
            );

            delegates[index] = uint256(uint160(delegate));
            amounts[index] = requestedAmount;

            (address proxyAddress, ) = retrieveProxyContractAddress(
                token,
                delegate
            );
            transferVotingPower(proxyAddress, msg.sender, requestedAmount);
        }

        burnBatch(msg.sender, delegates, amounts);
    }

    function setUri(string memory uri) external onlyOwner {
        _setURI(uri);
    }

    function createProxyDelegatorAndTransfer(
        address delegate,
        uint256 amount
    ) internal {
        address proxyAddress = deployProxyDelegatorIfNeeded(delegate);
        token.transferFrom(msg.sender, proxyAddress, amount);
    }

    function transferBetweenDelegators(
        address from,
        address to,
        uint256 amount
    ) internal {
        (address proxyAddressFrom, ) = retrieveProxyContractAddress(
            token,
            from
        );
        (address proxyAddressTo, ) = retrieveProxyContractAddress(token, to);
        token.transferFrom(proxyAddressFrom, proxyAddressTo, amount);
    }

    function deployProxyDelegatorIfNeeded(
        address delegate
    ) internal returns (address) {
        (address proxyAddress, bytes32 salt) = retrieveProxyContractAddress(
            token,
            delegate
        );

        // check if the proxy contract has already been deployed
        bytes memory bytecode;
        assembly {
            bytecode := extcodesize(proxyAddress)
        }

        // if the proxy contract has not been deployed, deploy it
        if (bytecode.length == 0) {
            new ERC20ProxyDelegator{salt: salt}(token, delegate);
        }
        return proxyAddress;
    }

    function getBalanceForDelegatee(
        address delegate
    ) internal view returns (uint256) {
        return ERC1155(this).balanceOf(msg.sender, uint256(uint160(delegate)));
    }

    function transferVotingPower(
        address from,
        address to,
        uint256 amount
    ) internal {
        require(
            token.transferFrom(from, to, amount),
            "Failed to transfer voting power"
        );
    }

    function mintBatch(
        address account,
        uint256[] memory ids,
        uint256[] memory amounts
    ) internal {
        _mintBatch(account, ids, amounts, "");
    }

    function burnBatch(
        address account,
        uint256[] memory ids,
        uint256[] memory amounts
    ) internal {
        _burnBatch(account, ids, amounts);
    }

    function getContractAddress(
        bytes memory bytecode,
        uint256 _salt
    ) private view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                _salt,
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
    ) private view returns (address, bytes32) {
        bytes memory bytecode = getBytecode(_token, _delegate);
        bytes32 salt = 0;
        return (getContractAddress(bytecode, uint256(salt)), salt);
    }
}
