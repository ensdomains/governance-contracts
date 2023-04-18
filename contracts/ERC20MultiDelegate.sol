// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

/**
 * @dev A child contract which will be deployed by the ERC20MultiDelegate utility contract
 * This is a proxy delegator contract to vote given delegatee on behalf of original delegator
 */
contract ERC20ProxyDelegator {
    constructor(ERC20Votes _token, address _delegatee) {
        _token.approve(msg.sender, type(uint256).max);
        _token.delegate(_delegatee);
    }
}

/**
 * @dev A utility contract to let delegators to pick multiple delegatee
 */
contract ERC20MultiDelegate is ERC1155, Ownable {
    using Address for address;

    ERC20Votes public token;

    struct DelegateeAmount {
        address delegatee;
        uint256 amount;
    }

    struct SourceAmount {
        address source;
        uint256 amount;
    }

    struct TargetAmount {
        address target;
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
     * @dev Deposits and delegates voting power to the multiple delegatees.
     * @param delegateeAmounts The list of delegatee addresses and corresponding list of ERC20 voting power amount amounts to delegate.
     */
    function depositMulti(
        DelegateeAmount[] calldata delegateeAmounts
    ) external {
        uint256 delegateesLength = delegateeAmounts.length;

        require(
            delegateesLength > 0,
            "DepositMulti: You should pick at least one delegatee"
        );

        uint256[] memory ids = new uint256[](delegateesLength);
        uint256[] memory amounts = new uint256[](delegateesLength);

        for (uint256 index = 0; index < delegateesLength; index++) {
            address delegatee = delegateeAmounts[index].delegatee;
            uint256 amount = delegateeAmounts[index].amount;

            createProxyDelegatorAndTransfer(delegatee, amount);

            ids[index] = uint256(uint160(delegatee));
            amounts[index] = amount;
        }

        mintBatch(msg.sender, ids, amounts);
    }

    /**
     * @dev Re-delegates voting power between delegatees.
     * @param sources The list of source delegatee addresses and amounts to withdraw.
     * @param targets The list of target delegatee addresses and amounts to redeposit.
     * The remaning part if any, will be withdrawn to the user account
     */
    function reDeposit(
        SourceAmount[] calldata sources,
        TargetAmount[] calldata targets
    ) external {
        uint256 sourcesLength = sources.length;
        uint256 targetsLength = targets.length;

        require(
            sourcesLength > 0 && targetsLength > 0,
            "ReDeposit: You should pick at least one source and one target delegatee"
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

        // Reimburse remaining amount to the owner
        if (record.remainingSourceAmount > 0) {
            transferBetweenDelegators(
                sources[sourcesLength - 1].source,
                msg.sender,
                record.remainingSourceAmount
            );
            record.totalRedepositedAmount += record.remainingSourceAmount;
            record.sourceIds[record.sourceIndex] = uint256(
                uint160(sources[record.sourceIndex].source)
            );
            record.withdrawnAmounts[record.sourceIndex] = sources[
                record.sourceIndex
            ].amount;
        }

        burnBatch(msg.sender, record.sourceIds, record.withdrawnAmounts);
        mintBatch(msg.sender, record.targetIds, record.redepositedAmounts);
    }

    /**
     * @dev Executes the re-deposit process for multiple source and target delegatees.
     * @param sources The list of source delegatees with the amounts to withdraw.
     * @param targets The list of target delegatees with the amounts to re-deposit.
     * @param record The current state of the re-deposit process.
     */
    function _reDeposit(
        SourceAmount[] calldata sources,
        TargetAmount[] calldata targets,
        ReDepositRecord memory record
    ) internal {
        uint256 sourcesLength = sources.length;
        uint256 targetsLength = targets.length;

        // Iterate until all source and target delegatees have been processed.
        while (
            record.sourceIndex < sourcesLength &&
            record.targetIndex < targetsLength
        ) {
            // Process the re-deposit between the current source and target delegatee pair.
            uint256 transferAmount = _processReDeposit(
                sources,
                targets,
                record
            );

            // Update the remaining amounts for the current source and target delegatees.
            record.remainingSourceAmount -= transferAmount;
            record.remainingTargetAmount -= transferAmount;

            // Update the total amounts for withdrawn and redeposited tokens.
            record.totalRedepositedAmount += transferAmount;

            // If the current source delegatee has no remaining amount to withdraw,
            // store its ID and the withdrawn amount, and move to the next source delegatee.
            if (record.remainingSourceAmount == 0) {
                record.sourceIds[record.sourceIndex] = uint256(
                    uint160(sources[record.sourceIndex].source)
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

            // If the current target delegatee has no remaining amount to re-deposit,
            // store its ID and the redeposited amount, and move to the next target delegatee.
            if (record.remainingTargetAmount == 0) {
                record.targetIds[record.targetIndex] = uint256(
                    uint160(targets[record.targetIndex].target)
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
     * @param sources The list of source delegatees with the amounts to withdraw.
     * @param targets The list of target delegatees with the amounts to re-deposit.
     * @param record The current state of the re-deposit process.
     * @return transferAmount The amount of tokens transferred between the current source and target delegatees.
     */
    function _processReDeposit(
        SourceAmount[] calldata sources,
        TargetAmount[] calldata targets,
        ReDepositRecord memory record
    ) internal returns (uint256 transferAmount) {
        // Get the balance of the current source delegatee.
        uint256 balance = getBalanceForDelegatee(
            sources[record.sourceIndex].source
        );

        // Ensure that the remaining amount to withdraw from the source delegatee is not greater than the balance.
        require(
            record.remainingSourceAmount <= balance,
            "ReDeposit: Insufficient balance in the source delegatee"
        );

        // Determine the transfer amount as the minimum between the remaining amounts of source and target delegatees.
        transferAmount = (record.remainingSourceAmount <
            record.remainingTargetAmount)
            ? record.remainingSourceAmount
            : record.remainingTargetAmount;

        // Transfer the determined amount between the current source and target delegatees.
        transferBetweenDelegators(
            sources[record.sourceIndex].source,
            targets[record.targetIndex].target,
            transferAmount
        );

        // Deploy a proxy delegator for the target delegatee if it does not already exist.
        deployProxyDelegatorIfNeeded(targets[record.targetIndex].target);

        // Return the transfer amount.
        return transferAmount;
    }

    /**
     * @dev Withdraws delegated ERC20 voting power from proxy delegators to the actual delegator
     * @param delegatees List of delegatee addresses
     */
    function withdrawMulti(address[] calldata delegatees) external {
        uint256 delegateesLength = delegatees.length;

        require(
            delegateesLength > 0,
            "WithdrawMulti: You should pick at least one delegatee"
        );

        uint256[] memory delegates = new uint256[](delegateesLength);
        uint256[] memory amounts = new uint256[](delegateesLength);

        for (uint256 index = 0; index < delegateesLength; index++) {
            address delegatee = delegatees[index];
            uint256 amount = getBalanceForDelegatee(delegatee);
            delegates[index] = uint256(uint160(delegatee));
            amounts[index] = amount;

            (address proxyAddress, ) = retrieveProxyContractAddress(
                token,
                delegatee
            );
            transferVotingPower(proxyAddress, msg.sender, amount);
        }

        burnBatch(msg.sender, delegates, amounts);
    }

    function setUri(string memory uri) external onlyOwner {
        _setURI(uri);
    }

    function createProxyDelegatorAndTransfer(
        address delegatee,
        uint256 amount
    ) internal {
        address proxyAddress = deployProxyDelegatorIfNeeded(delegatee);
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
        address delegatee
    ) internal returns (address) {
        (address proxyAddress, bytes32 salt) = retrieveProxyContractAddress(
            token,
            delegatee
        );
        new ERC20ProxyDelegator{salt: salt}(token, delegatee);
        return proxyAddress;
    }

    function getBalanceForDelegatee(
        address delegatee
    ) internal view returns (uint256) {
        return ERC1155(this).balanceOf(msg.sender, uint256(uint160(delegatee)));
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
        address _delegatee
    ) private pure returns (bytes memory) {
        bytes memory bytecode = type(ERC20ProxyDelegator).creationCode;
        return abi.encodePacked(bytecode, abi.encode(_token, _delegatee));
    }

    function retrieveProxyContractAddress(
        ERC20Votes _token,
        address _delegatee
    ) private view returns (address, bytes32) {
        bytes memory bytecode = getBytecode(_token, _delegatee);
        bytes32 salt = keccak256(abi.encode(_delegatee));
        return (getContractAddress(bytecode, uint256(salt)), salt);
    }
}
