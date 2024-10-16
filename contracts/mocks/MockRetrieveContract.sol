// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import { ERC20ProxyDelegator } from "../ERC20MultiDelegate.sol";

contract MockRetrieveContract {

    function retrieveProxyContractAddress(
        address token,
        address multiDelegate,
        address delegate
    ) public pure returns (address) {
        bytes memory bytecode = bytes.concat(
            type(ERC20ProxyDelegator).creationCode,
            abi.encode(token, delegate)
        );
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                multiDelegate,
                uint256(0), // salt
                keccak256(bytecode)
            )
        );
        return address(uint160(uint256(hash)));
    }
}
