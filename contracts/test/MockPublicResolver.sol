// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockPublicResolver {
    address public ens;
    mapping(bytes32 => mapping(string => string)) public texts;
    mapping(bytes32 => address) public addr;

    constructor(address _ens) {
        ens = _ens;
    }

    function setText(bytes32 node, string memory key, string memory value) public {
        texts[node][key] = value;
    }

    function setAddr(bytes32 node, address _addr) public {
        addr[node] = _addr;
    }

    function text(bytes32 node, string memory key) public view returns (string memory) {
        return texts[node][key];
    }
}
