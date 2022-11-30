// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "./ENSToken.sol";

/**
 * @dev A child contract which will be deployed by the ENSMultiDelegate utility contract
 * This is a proxy delegator contract to vote given delegatee on behalf of original delegator
 */
contract ENSProxyDelegator {
    ENSToken token;
    bool isInitialized = false;

    function initialize(ENSToken _token, address _delegatee) external {
        require(!isInitialized, "Contract already initialized");
        isInitialized = true;
        _token.delegate(_delegatee);
        _token.approve(msg.sender, 2**256 - 1);
    }
}

/**
 * @dev A utility contract to let delegators to pick multiple delegatee
 */
contract ENSMultiDelegate is ERC1155 {
    using Address for address;
    using Clones for address;

    ENSToken token;
    address sample = address(0);

    /**
     * @dev Constructor.
     * @param _token The ERC20 token address
     */
    constructor(ENSToken _token) ERC1155("http://some.metadata.url/{id}") {
        token = _token;
        sample = address(new ENSProxyDelegator());
    }

    /**
     * @dev Public method for the delegation of multiple delegatees.
     * @param delegatees List of delegatee addresses
     * @param amounts ERC20 voting power amount to be distributed among delegatees
     */
    function delegateMulti(
        address[] calldata delegatees,
        uint256[] calldata amounts
    ) external {
        require(
            delegatees.length > 0,
            "You should pick at least one delegatee"
        );
        require(
            delegatees.length == amounts.length,
            "Amounts should be defined for each delegatee"
        );

        ENSProxyDelegator proxyDelegator;
        uint256[] memory ids = new uint256[](delegatees.length);

        for (uint256 index = 0; index < delegatees.length; ) {
            address delegatee = delegatees[index];
            // clone the proxy delegator contract from the sample with deterministic address
            // salt occurs from delegatee address + sender address
            address clone = Clones.cloneDeterministic(
                sample,
                keccak256(abi.encodePacked(delegatee, msg.sender))
            );
            proxyDelegator = ENSProxyDelegator(clone);
            // transfer ENSToken for the proxy delegation
            token.transferFrom(msg.sender, clone, amounts[index]);
            // initialize the contract after clone
            proxyDelegator.initialize(token, delegatee);

            ids[index] = uint256(uint160(delegatee));
            unchecked {
                index++;
            }
        }
        _mintBatch(msg.sender, ids, amounts, "");
    }

    /**
     * @dev Public method to withdraw ERC20 voting power from proxy delegators to the actual delegator
     */
    function withdraw(address[] calldata delegatees) external {
        for (uint256 index = 0; index < delegatees.length; ) {
            // get the delegatee list from user
            address delegatee = delegatees[index];
            // PDT - proxy delegation token
            // check if user has the PDT for the provided delegatees
            uint256 amount = ERC1155(this).balanceOf(
                msg.sender,
                uint256(uint160(delegatee))
            );
            // burn PDT's
            _burn(msg.sender, uint256(uint160(delegatee)), amount);
            // recalculate deployed contracts for each delegatees
            address proxyDelegator = Clones.predictDeterministicAddress(
                sample,
                keccak256(abi.encodePacked(delegatee, msg.sender))
            );
            // transfer the ERC20 voting power back to user
            token.transferFrom(proxyDelegator, msg.sender, amount);
            unchecked {
                index++;
            }
        }
    }
}
