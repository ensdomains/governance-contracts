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

        uint256[] memory ids = new uint256[](delegatees.length);

        for (uint256 index = 0; index < delegatees.length; ) {
            address delegatee = delegatees[index];
            // creates a proxy delegator contract with deterministic address
            // salt occurs from delegatee address
            (
                address predeterminedProxyAddress,
                bytes32 salt
            ) = retrieveProxyContractAddress(token, delegatee);
            // transfer ERC20 for the proxy delegation
            // initialize the contract after with predetermined address
            token.transferFrom(
                msg.sender,
                predeterminedProxyAddress,
                amounts[index]
            );
            new ERC20ProxyDelegator{salt: salt}(token, delegatee);

            ids[index] = uint256(uint160(delegatee));
            unchecked {
                index++;
            }
        }
        _mintBatch(msg.sender, ids, amounts, "");
    }

    function reDelegate(
        address[] calldata source,
        address[] calldata target
    ) external {
        require(
            source.length == target.length,
            "source and target delegatee amounts must be equal"
        );
        uint256[] memory _source = new uint256[](source.length);
        uint256[] memory _target = new uint256[](source.length);
        uint256[] memory _amounts = new uint256[](source.length);

        for (uint index = 0; index < source.length; ) {

            // retrieve proxy delegotor address of source
            address from = source[index];
            (
                address proxyAddressFrom,

            ) = retrieveProxyContractAddress(token, from);

            // retrieve proxy delegotor address of target
            address to = target[index];
            (
                address proxyAddressTo,
                bytes32 salt
            ) = retrieveProxyContractAddress(token, to);

            // amount the user delegated for source will be re-delegated to the target
            uint256 amount = ERC1155(this).balanceOf(
                msg.sender,
                uint256(uint160(from))
            );

            _source[index] = uint256(uint160(from));
            _target[index] = uint256(uint160(to));
            _amounts[index] = amount;
            token.transferFrom(proxyAddressFrom, proxyAddressTo, amount);

            // in case re-delegated addresses does not have a ProxyDelegator contract deployed
            new ERC20ProxyDelegator{salt: salt}(token, to);

            unchecked {
                index++;
            }
        }
        _burnBatch(msg.sender, _source, _amounts);
        _mintBatch(msg.sender, _target, _amounts, "");
    }

    /**
     * @dev Public method to withdraw ERC20 voting power from proxy delegators to the actual delegator
     * @param delegatees List of delegatee addresses
     */
    function withdraw(address[] calldata delegatees) external {
        uint256[] memory _delegates = new uint256[](delegatees.length);
        uint256[] memory _amounts = new uint256[](delegatees.length);
        for (uint256 index = 0; index < delegatees.length; ) {
            // get the delegatee list from user
            address delegatee = delegatees[index];
            // PDT - proxy delegation token
            // check if user has the PDT for the provided delegatees
            uint256 amount = ERC1155(this).balanceOf(
                msg.sender,
                uint256(uint160(delegatee))
            );
            _delegates[index] = uint256(uint160(delegatee));
            _amounts[index] = amount;
            // recalculate deployed contract addresses for each delegatees
            (
                address predeterminedProxyAddress,

            ) = retrieveProxyContractAddress(token, delegatee);

            // transfer the ERC20 voting power back to user
            token.transferFrom(predeterminedProxyAddress, msg.sender, amount);
            unchecked {
                index++;
            }
        }
        // burn PDT's
        _burnBatch(msg.sender, _delegates, _amounts);
    }

    function setUri(string memory uri) external onlyOwner {
        _setURI(uri);
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
