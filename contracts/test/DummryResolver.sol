pragma solidity ^0.8.2;

/**
* @dev Implements a dummy Registry
*/

contract DummyResolver {
    address dummyAddr;
    constructor(address _addr){
        dummyAddr = _addr;
    }

    function addr(bytes32 /* node */) external view returns (address){
        return dummyAddr;
    }
    function text(bytes32 /* node */, string calldata /* key */) external pure returns (string memory){
        return 'value';
    }
}
