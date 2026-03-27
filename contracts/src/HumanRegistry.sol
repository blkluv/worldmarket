// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ByteHasher} from "./helpers/ByteHasher.sol";

/// @notice Minimal interface for the World ID router used by this registry.
interface IWorldID {
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}

/// @title HumanRegistry
/// @notice Maps World ID nullifiers to Ethereum addresses and allows each
///         human to register one or more agent wallets.  Deployed as a UUPS
///         proxy so it can be upgraded by the owner.
contract HumanRegistry is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    using ByteHasher for bytes;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice World ID group for Orb-verified humans.
    uint256 public constant GROUP_ID = 1;

    // -------------------------------------------------------------------------
    // Storage  (no immutables — UUPS proxies cannot use immutables)
    // -------------------------------------------------------------------------

    /// @notice The World ID router contract on Base Sepolia.
    IWorldID public worldIdRouter;

    /// @notice Maps nullifierHash → the human address that registered it.
    mapping(uint256 => address) public principalOf;

    /// @notice Maps human address → their World ID nullifier hash.
    mapping(address => uint256) public nullifierOf;

    /// @notice Maps human address → list of registered agent wallets.
    mapping(address => address[]) public agentsOf;

    /// @notice Maps agent wallet → the human (principal) that owns it.
    mapping(address => address) public principalForAgent;

    /// @notice Tracks nullifiers that have already been used to prevent double-registration.
    mapping(uint256 => bool) public usedNullifiers;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event HumanRegistered(address indexed principal, uint256 indexed nullifierHash);
    event AgentRegistered(address indexed principal, address indexed agentWallet);

    // -------------------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------------------

    /// @notice Initializes the proxy implementation.
    /// @param _worldIdRouter Address of the World ID router (must be non-zero).
    /// @param initialOwner    Address that will own this contract (must be non-zero).
    function initialize(address _worldIdRouter, address initialOwner) external initializer {
        require(_worldIdRouter != address(0), "zero worldIdRouter");
        require(initialOwner != address(0), "zero owner");

        __Ownable_init(initialOwner);

        worldIdRouter = IWorldID(_worldIdRouter);
    }

    // -------------------------------------------------------------------------
    // Public functions
    // -------------------------------------------------------------------------

    /// @notice Register the caller as a World ID-verified human.
    /// @dev Calls the World ID router to verify the zero-knowledge proof.
    ///      Each nullifier may only be used once; each address may only be a
    ///      principal (not an existing agent).
    /// @param root                  Merkle root passed to the World ID router.
    /// @param nullifierHash         The Semaphore nullifier for this action.
    /// @param externalNullifierHash The app-scoped external nullifier hash.
    /// @param proof                 The 8-element Groth16 proof.
    function registerHuman(
        uint256 root,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external {
        require(!usedNullifiers[nullifierHash], "already registered");
        require(principalForAgent[msg.sender] == address(0), "caller is already an agent");

        worldIdRouter.verifyProof(
            root,
            GROUP_ID,
            abi.encodePacked(msg.sender).hashToField(),
            nullifierHash,
            externalNullifierHash,
            proof
        );

        usedNullifiers[nullifierHash] = true;
        principalOf[nullifierHash] = msg.sender;
        nullifierOf[msg.sender] = nullifierHash;

        emit HumanRegistered(msg.sender, nullifierHash);
    }

    /// @notice Register an agent wallet on behalf of the calling human.
    /// @dev The caller must already be a registered human.  The agent wallet
    ///      must not yet be a registered human or an agent of another human.
    /// @param agentWallet The wallet address to register as an agent.
    function registerAgent(address agentWallet) external {
        require(nullifierOf[msg.sender] != 0, "not a registered human");
        require(agentWallet != address(0), "zero address");
        require(principalForAgent[agentWallet] == address(0), "agent already registered");
        require(nullifierOf[agentWallet] == 0, "wallet is a registered human");

        principalForAgent[agentWallet] = msg.sender;
        agentsOf[msg.sender].push(agentWallet);

        emit AgentRegistered(msg.sender, agentWallet);
    }

    /// @notice Resolve any wallet (human or agent) to its canonical human address.
    /// @param wallet The address to look up.
    /// @return The human address, or address(0) if not registered.
    function humanOf(address wallet) public view returns (address) {
        if (nullifierOf[wallet] != 0) {
            return wallet;
        }
        address principal = principalForAgent[wallet];
        if (principal != address(0)) {
            return principal;
        }
        return address(0);
    }

    // -------------------------------------------------------------------------
    // UUPS upgrade authorisation
    // -------------------------------------------------------------------------

    /// @dev Only the owner may authorise an upgrade.
    function _authorizeUpgrade(address /*newImplementation*/) internal override onlyOwner {}
}
