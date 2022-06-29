// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev Streams tokens at a fixed per-second rate.
 */
contract TokenStream is Ownable {
    ERC20 public immutable token;
    address public immutable tokenSender;
    uint256 public immutable startTime;
    uint256 public endTime;
    uint256 public immutable streamingRate;
    uint256 public totalClaimed;

    event Configured(address token, address tokenSender, uint256 startTime, uint256 endTime, uint256 streamingRate);
    event Claimed(address indexed recipient, uint256 amount);

    /**
     * @dev Constructor.
     * @param _token The token this contract will stream to its owner.
     * @param _tokenSender The account that owns the tokens being streamed
     * @param _startTime The time at which tokens will start being streamed.
     * @param _endTime The time at which the stream ends.
     * @param _streamingRate The rate of the stream in base tokens per second.
     */
    constructor(ERC20 _token, address _tokenSender, uint256 _startTime, uint256 _endTime, uint256 _streamingRate) {
        require(_endTime > _startTime, "_endTime must be after _startTime");
        token = _token;
        tokenSender = _tokenSender;
        startTime = _startTime;
        endTime = _endTime;
        streamingRate = _streamingRate;
        emit Configured(address(_token), _tokenSender, _startTime, _endTime, _streamingRate);
    }

    /**
     * @dev Returns the maximum number of tokens currently claimable.
     * @return The number of tokens currently claimable.
     */
    function claimableBalance() public view returns(uint256) {
        if(block.timestamp < startTime) {
            return 0;
        }

        uint256 end = endTime;
        if(end > block.timestamp) {
            end = block.timestamp;
        }

        return (end - startTime) * streamingRate - totalClaimed;
   }

    /**
     * @dev Claims tokens that have been unlocked, sending them to `recipient`.
     * @param recipient The account to transfer unlocked tokens to.
     * @param amount The amount to transfer. If greater than the claimable amount, the maximum is transferred.
     */
    function claim(address recipient, uint256 amount) external onlyOwner {
        uint256 claimable = claimableBalance();
        if(amount > claimable) {
            amount = claimable;
        }
        totalClaimed += amount;
        require(token.transferFrom(tokenSender, recipient, amount), "TokenStream: Transfer failed");
        emit Claimed(recipient, amount);
    }

    function setEndTime(uint256 _endTime) external {
        require(msg.sender == tokenSender, "Only token sender may change the end time");
        require(_endTime > startTime, "_endTime must be after startTime");
        endTime = _endTime;
        emit Configured(address(token), tokenSender, startTime, _endTime, streamingRate);
    }
}
