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
    address private owner;
    address private delegatee = address(0);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only contract owner can interact");
        _;
    }

    /**
     * @dev Constructor.
     * @param _token The ENS token address
     * @param _owner The address of the factory contract, in this case ENSMultiDelegate
     * @param _delegatee Selected delegatee
     */
    constructor(
        ENSToken _token,
        address _owner,
        address _delegatee
    ) {
        token = _token;
        owner = _owner;
        delegatee = _delegatee;
    }

    function initialize(
        ENSToken _token,
        address _owner,
        address _delegatee
    ) external {
        require(delegatee == address(0), "Contract already initialized");
        token = _token;
        owner = _owner;
        delegatee = _delegatee;
    }

    /**
     * @dev Public method for the proxy delegation.
     */
    function delegate() external onlyOwner {
        token.delegate(delegatee);
    }

    function withdraw(address deployer, uint256 amount) external onlyOwner {
        token.transfer(deployer, amount);
    }

    function balance() public view returns (uint256) {
        return token.balanceOf(address(this));
    }
}

/**
 * @dev A utility contract to let delegators to pick multiple delegatee
 */
contract ENSMultiDelegate is ERC1155 {
    using Address for address;
    using Clones for address;

    ENSToken token;
    mapping(address => ENSProxyDelegator) private proxyList;
    address sample = address(0);

    /**
     * @dev Constructor.
     * @param _token The ERC20 token address
     */
    constructor(ENSToken _token) ERC1155("http://some.metadata.url/{id}") {
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

        ENSProxyDelegator proxyDelegator;
        uint256[] memory ids = new uint256[](delegatees.length);

        for (uint256 index = 0; index < delegatees.length; ) {
            proxyDelegator = proxyList[delegatees[index]];
            if (address(proxyDelegator) == address(0)) {
                if (sample != address(0)) {
                    address clone = Clones.clone(sample);
                    proxyDelegator = ENSProxyDelegator(clone);
                    proxyDelegator.initialize(
                        token,
                        address(this),
                        delegatees[index]
                    );
                } else {
                    proxyDelegator = new ENSProxyDelegator(
                        token,
                        address(this),
                        delegatees[index]
                    );
                    sample = address(proxyDelegator);
                }
                proxyList[delegatees[index]] = proxyDelegator;
            }
            token.transferFrom(
                msg.sender,
                address(proxyDelegator),
                amounts[index]
            );
            proxyDelegator.delegate();
            ids[index] = uint256(uint160(delegatees[index]));
            unchecked {
                index++;
            }
        }
        _mintBatch(msg.sender, ids, amounts, "");
    }

    /**
     * @dev Public method to withdraw ERC20 voting power from proxy delegators to the actual delegator
     */
    function withdraw(address[] calldata delegatees, uint256[] calldata amounts)
        external
    {
        for (uint256 index = 0; index < delegatees.length; ) {
            uint256 id = uint256(uint160(delegatees[index]));
            // first burn given tokens and amounts, this will ensure that user has the amount to withdraw
            _burn(msg.sender, id, amounts[index]);
            ENSProxyDelegator proxyDelegator = proxyList[delegatees[index]];
            proxyDelegator.withdraw(msg.sender, amounts[index]);

            unchecked {
                index++;
            }
        }
    }
}
