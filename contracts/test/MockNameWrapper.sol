// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockNameWrapper {
    function ownerOf(uint256) public pure returns (address) {
        return address(0);
    }
    
    function getData(uint256) public pure returns (address, uint32, uint64) {
        return (address(0), 0, 0);
    }
}
