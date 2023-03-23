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

    struct SourceTargetDelegatee {
        address source;
        address target;
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
    * @param delegateePairs The list of current delegatee addresses (from which the voting power is withdrawn) 
    * and target delegatee addresses (which the voting power will be delegated).
    */
    function reDeposit(SourceTargetDelegatee[] calldata delegateePairs) external {
        uint256 delegateePairsLength = delegateePairs.length;

        require(
            delegateePairsLength > 0,
            "ReDeposit: You should pick at least one source and target delegatee pair"
        );

        uint256[] memory sourceIds = new uint256[](delegateePairsLength);
        uint256[] memory targetIds = new uint256[](delegateePairsLength);
        uint256[] memory amounts = new uint256[](delegateePairsLength);

        for (uint index = 0; index < delegateePairsLength; index++) {
            address from = delegateePairs[index].source;
            address to = delegateePairs[index].target;

            uint256 amount = getBalanceForDelegatee(from);
            sourceIds[index] = uint256(uint160(from));
            targetIds[index] = uint256(uint160(to));
            amounts[index] = amount;

            transferBetweenDelegators(from, to, amount);

            deployProxyDelegatorIfNeeded(to);
        }

        burnBatch(msg.sender, sourceIds, amounts);
        mintBatch(msg.sender, targetIds, amounts);
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

            address proxyAddress = getProxyContractAddress(delegatee);
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
        address proxyAddressFrom = getProxyContractAddress(from);
        address proxyAddressTo = getProxyContractAddress(to);
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

    function getProxyContractAddress(
        address delegatee
    ) internal view returns (address) {
        (address proxyAddress, ) = retrieveProxyContractAddress(
            token,
            delegatee
        );
        return proxyAddress;
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

    function getAddress(
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
        return (getAddress(bytecode, uint256(salt)), salt);
    }
}
