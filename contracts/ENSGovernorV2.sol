// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorProposalThreshold.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";

import "./EnsCounting.sol";
import "./ENSGovernor.sol";

/**
 * @title ENSGovernorV2
 * @dev Enhanced ENS Governor with bonding functionality.
 */
contract ENSGovernorV2 is ENSGovernor {
    uint256 public availableBondsBalance;
    uint256 public lockedBondsBalance;
    uint256 public ensPerTarget = 1 ether; // we can add setter

    /**
     * @dev ProposalBond represents the bond associated with a proposal.
     */
    struct ProposalBond {
        uint256 amount; // The amount of bond deposited.
        bool refunded; // Flag indicating if the bond has been refunded.
        address proposer; // The address of the proposer who deposited the bond.
    }

    /**
     * @dev Mapping to store ProposalBond objects associated with proposal IDs.
     */
    mapping(uint256 => ProposalBond) private _proposalBonds;

    /**
     * @dev Emitted when a bond is created.
     * @param proposer The address of the proposer.
     * @param amount The amount of bond.
     */
    event BondCreated(address indexed proposer, uint256 amount);

    constructor(
        ENSToken _token,
        TimelockController _timelock
    ) ENSGovernor(_token, _timelock) {}

    /**
     * @dev Propose a governance action with a bond.
     * @param targets The addresses to call.
     * @param values The values to send.
     * @param calldatas The calldata to send.
     * @param description The description of the proposal.
     * @return proposalId The ID of the proposal.
     */
    function proposeWithBond(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public returns (uint256 proposalId) {
        // Transfer bond to the contract
        uint256 bondAmount = calculateBond(targets.length);
        require(
            token.transferFrom(msg.sender, address(this), bondAmount),
            "ERC20: transferFrom failed"
        );
        lockedBondsBalance += bondAmount;

        // Create the proposal
        proposalId = propose(targets, values, calldatas, description);

        // Store the bond details
        _proposalBonds[proposalId] = ProposalBond({
            amount: bondAmount,
            refunded: false,
            proposer: msg.sender
        });

        emit BondCreated(msg.sender, bondAmount);
    }

    /**
     * @dev Calculate the bond amount based on the count of targets.
     * @param countOfTargets The number of targets in the proposal.
     * @return The calculated bond amount.
     */
    function calculateBond(
        uint256 countOfTargets
    ) public view returns (uint256) {
        return countOfTargets * ensPerTarget;
    }

    /**
     * @dev Cancel a proposal and refund the bond if necessary.
     * @param targets The addresses to call.
     * @param values The values to send.
     * @param calldatas The calldata to send.
     * @param descriptionHash The hash of the proposal description.
     * @return proposalId The ID of the proposal.
     */
    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(ENSGovernor) returns (uint256) {
        uint256 proposalId = super._cancel(
            targets,
            values,
            calldatas,
            descriptionHash
        );
        (
            uint256 againstVotesWithoutBond,
            uint256 againstVotes, // votesLength
            ,

        ) = proposalVotes(proposalId);

        ProposalBond storage bond = _proposalBonds[proposalId];

        if (againstVotes >= againstVotesWithoutBond) {
            require(
                token.transfer(bond.proposer, bond.amount),
                "ERC20: transferFrom failed"
            );
        } else {
            availableBondsBalance += bond.amount;
        }
        lockedBondsBalance -= bond.amount;
        return proposalId;
    }

    /**
     * @dev Internal function to execute a proposal.
     * Overrides the _execute function in ENSGovernor.
     * Transfers the bond amount back to the proposer upon successful execution.
     * @param proposalId The ID of the proposal to execute.
     * @param targets The list of addresses the proposal calls.
     * @param values The list of values to send with the calls.
     * @param calldatas The list of call data to send with the calls.
     * @param descriptionHash The hash of the proposal description.
     */
    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(ENSGovernor) {
        ProposalBond storage bond = _proposalBonds[proposalId];

        require(
            token.transfer(bond.proposer, bond.amount),
            "ERC20: transferFrom failed"
        );
        lockedBondsBalance -= bond.amount;
    }

    /**
     * @dev Cancel a proposal and refund the bond if necessary (for testing purposes).
     * @param targets The addresses to call.
     * @param values The values to send.
     * @param calldatas The calldata to send.
     * @param descriptionHash The hash of the proposal description.
     * @return proposalId The ID of the proposal.
     */
    function cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string calldata descriptionHash
    ) public returns (uint256) {
        uint256 proposalId = _cancel(
            targets,
            values,
            calldatas,
            keccak256(bytes(descriptionHash))
        );
        require(
            msg.sender == _proposalBonds[proposalId].proposer,
            "only proposer"
        );
        return proposalId;
    }
}
