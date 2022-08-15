// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./ENSToken.sol";

/**
 * @dev A child contract which will be deployed by the ENSMultiDelegate utility contract
 * This is a proxy delegator contract to vote given delegatee on behalf of original delegator
 */
contract ENSProxyDelegator {
    ENSToken token;
    address private owner;
    address private delegator = address(0);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only contract owner can interact");
        _;
    }

    /**
     * @dev Constructor.
     * @param _token The ENS token address
     * @param _owner The address of the factory contract, in this case ENSMultiDelegate
     */
    constructor(ENSToken _token, address _owner) {
        token = _token;
        owner = _owner;
    }

    /**
     * @dev Public method for the proxy delegation.
     * @param _delegator The address of actual delegator
     * @param delegatee delegatee address
     */
    function delegate(address _delegator, address delegatee)
        external
        onlyOwner
    {
        require(delegator == address(0), "Proxy delegator is in use");
        require(_delegator != address(0), "Delegator cannot be empty address");
        token.delegate(delegatee);
        delegator = _delegator;
    }

    function balance() public view returns (uint256) {
        return token.balanceOf(address(this));
    }

    function withdraw() external onlyOwner {
        token.transfer(delegator, balance());
        delegator = address(0);
    }
}

/**
 * @dev A utility contract to let delegators to pick multiple delegatee
 */
contract ENSMultiDelegate {
    ENSToken token;
    mapping(address => ENSProxyDelegator[]) private proxyDelegators;
    ENSProxyDelegator[] private proxyPool; // lifo

    /**
     * @dev Constructor.
     * @param _token The ERC20 token address
     */
    constructor(ENSToken _token) {
        token = _token;
    }

    /**
     * @dev Public method for the delegation of multiple delegatees.
     * @param delegatees List of delegatee addresses
     * @param amount ERC20 voting power amount to be distributed among delegatees
     */
    function delegateMulti(address[] calldata delegatees, uint256 amount)
        external
    {
        require(amount > 0, "Amount should be greater than 0");
        require(
            delegatees.length > 0,
            "You should pick at least one delegatee"
        );
        uint256 allowance = token.allowance(msg.sender, address(this));
        require(allowance >= amount, "Check the token allowance");

        ENSProxyDelegator proxyDelegator;

        uint256 eachAmount = amount / delegatees.length;
        uint256 proxyPoolLength = proxyPool.length;

        for (uint256 index = 0; index < delegatees.length; index++) {
            if (proxyPoolLength > 0) {
                proxyDelegator = proxyPool[proxyPoolLength - 1];
                proxyPool.pop();
                proxyPoolLength = proxyPoolLength - 1;
            } else {
                proxyDelegator = new ENSProxyDelegator(token, address(this));
            }
            token.transferFrom(msg.sender, address(proxyDelegator), eachAmount);
            proxyDelegator.delegate(msg.sender, delegatees[index]);
            proxyDelegators[msg.sender].push(proxyDelegator);
        }
    }

    /**
     * @dev Public method to retrieve proxy delegators of the caller
     */
    function delegators() external view returns (ENSProxyDelegator[] memory) {
        return proxyDelegators[msg.sender];
    }

    /**
     * @dev Public method to withdraw ERC20 voting power from proxy delegators to the actual delegator
     */
    function withdraw() external {
        ENSProxyDelegator[] memory proxies = proxyDelegators[msg.sender];
        for (uint256 index = 0; index < proxies.length; index++) {
            proxies[index].withdraw();
            proxyPool.push(proxies[index]);
        }
        delete proxyDelegators[msg.sender];
    }
}
