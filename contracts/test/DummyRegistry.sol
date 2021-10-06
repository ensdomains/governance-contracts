pragma solidity ^0.8.2;

/**
* @dev Implements a dummy Registry
*/

contract DummyRegistry {
    address res;
    constructor(address _resolver){
        res = _resolver;
    }

    function resolver(bytes32 /* node */ ) external view returns(address) {
        return res;
    }
}
