// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/structs/BitMaps.sol";

/**
 * @dev A contract to allow users to claim tokens via a 'merkle airdrop'.
 */
contract MerkleAirdrop is Ownable {
    using BitMaps for BitMaps.BitMap;

    address sender;
    IERC20 public token;
    bytes32 public merkleRoot;
    BitMaps.BitMap private claimed;

    event MerkleRootChanged(bytes32 merkleRoot);
    event Claim(address indexed claimant, uint256 amount);

    /**
     * @dev Constructor.
     * @param _sender The account to send airdrop tokens from.
     * @param _token The token contract to send tokens with.
     */
    constructor(address _sender, IERC20 _token) {
        sender = _sender;
        token = _token;
    }

    /**
     * @dev Claims airdropped tokens.
     * @param recipient The account being claimed for.
     * @param amount The amount of the claim being made.
     * @param merkleProof A merkle proof proving the claim is valid.
     */
    function claimTokens(address recipient, uint256 amount, bytes32[] calldata merkleProof) external {
        bytes32 leaf = keccak256(abi.encodePacked(recipient, amount));
        (bool valid, uint256 index) = MerkleProof.verify(merkleProof, merkleRoot, leaf);
        require(valid, "MerkleAirdrop: Valid proof required.");
        require(!isClaimed(index), "MerkleAirdrop: Tokens already claimed.");
        
        claimed.set(index);
        emit Claim(recipient, amount);

        token.transferFrom(sender, recipient, amount);
    }

    /**
     * @dev Returns true if the claim at the given index in the merkle tree has already been made.
     * @param index The index into the merkle tree.
     */
    function isClaimed(uint256 index) public view returns (bool) {
        return claimed.get(index);
    }

    /**
     * @dev Sets the merkle root. Only callable if the root is not yet set.
     * @param _merkleRoot The merkle root to set.
     */
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        require(merkleRoot == bytes32(0), "ENS: Merkle root already set");
        merkleRoot = _merkleRoot;
        emit MerkleRootChanged(_merkleRoot);
    }
}
