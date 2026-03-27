// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {HumanRegistry, IWorldID} from "../src/HumanRegistry.sol";

/// @notice Accept-all mock: verifyProof is a no-op so any proof passes.
contract MockWorldIDRouter is IWorldID {
    function verifyProof(
        uint256, /*root*/
        uint256, /*groupId*/
        uint256, /*signalHash*/
        uint256, /*nullifierHash*/
        uint256, /*externalNullifierHash*/
        uint256[8] calldata /*proof*/
    ) external pure override {}
}

/// @notice Revert-all mock used to test that invalid proofs are rejected.
contract RevertWorldIDRouter is IWorldID {
    function verifyProof(
        uint256, /*root*/
        uint256, /*groupId*/
        uint256, /*signalHash*/
        uint256, /*nullifierHash*/
        uint256, /*externalNullifierHash*/
        uint256[8] calldata /*proof*/
    ) external pure override {
        revert("invalid proof");
    }
}

/// @title Registry.t.sol — unit tests for HumanRegistry
contract RegistryTest is Test {
    HumanRegistry public impl;
    HumanRegistry public registry;
    MockWorldIDRouter public mockRouter;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant NULLIFIER_1 = 111;
    uint256 internal constant NULLIFIER_2 = 222;
    uint256 internal constant EXT_NULLIFIER = 999;

    uint256[8] internal emptyProof;

    function setUp() public {
        mockRouter = new MockWorldIDRouter();

        impl = new HumanRegistry();
        bytes memory initData =
            abi.encodeCall(HumanRegistry.initialize, (address(mockRouter), owner));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        registry = HumanRegistry(address(proxy));
    }

    // -------------------------------------------------------------------------
    // initialize
    // -------------------------------------------------------------------------

    function test_initialize_setsWorldIdRouter() public view {
        assertEq(address(registry.worldIdRouter()), address(mockRouter));
    }

    function test_initialize_setsOwner() public view {
        assertEq(registry.owner(), owner);
    }

    function test_initialize_revertsOnZeroRouter() public {
        HumanRegistry fresh = new HumanRegistry();
        bytes memory initData = abi.encodeCall(HumanRegistry.initialize, (address(0), owner));
        vm.expectRevert("zero worldIdRouter");
        new ERC1967Proxy(address(fresh), initData);
    }

    function test_initialize_revertsOnZeroOwner() public {
        HumanRegistry fresh = new HumanRegistry();
        bytes memory initData =
            abi.encodeCall(HumanRegistry.initialize, (address(mockRouter), address(0)));
        vm.expectRevert("zero owner");
        new ERC1967Proxy(address(fresh), initData);
    }

    // -------------------------------------------------------------------------
    // registerHuman
    // -------------------------------------------------------------------------

    function test_registerHuman_success() public {
        vm.prank(alice);
        registry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);

        assertEq(registry.nullifierOf(alice), NULLIFIER_1);
        assertEq(registry.principalOf(NULLIFIER_1), alice);
        assertTrue(registry.usedNullifiers(NULLIFIER_1));
    }

    function test_registerHuman_revertsIfAlreadyRegistered() public {
        vm.prank(alice);
        registry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);

        vm.prank(bob);
        vm.expectRevert("already registered");
        registry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);
    }

    function test_registerHuman_revertsIfCallerIsAgent() public {
        // Register alice as human and set carol as alice's agent.
        vm.prank(alice);
        registry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);
        vm.prank(alice);
        registry.registerAgent(carol);

        // carol tries to register as a human — must be rejected.
        vm.prank(carol);
        vm.expectRevert("caller is already an agent");
        registry.registerHuman(1, NULLIFIER_2, EXT_NULLIFIER, emptyProof);
    }

    function test_registerHuman_revertsOnBadProof() public {
        RevertWorldIDRouter revertRouter = new RevertWorldIDRouter();
        HumanRegistry strictImpl = new HumanRegistry();
        bytes memory initData =
            abi.encodeCall(HumanRegistry.initialize, (address(revertRouter), owner));
        ERC1967Proxy proxy = new ERC1967Proxy(address(strictImpl), initData);
        HumanRegistry strictRegistry = HumanRegistry(address(proxy));

        vm.prank(alice);
        vm.expectRevert("invalid proof");
        strictRegistry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);
    }

    // -------------------------------------------------------------------------
    // registerAgent
    // -------------------------------------------------------------------------

    function test_registerAgent_success() public {
        vm.prank(alice);
        registry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);

        vm.prank(alice);
        registry.registerAgent(bob);

        assertEq(registry.principalForAgent(bob), alice);
        assertEq(registry.agentsOf(alice, 0), bob);
    }

    function test_registerAgent_revertsIfNotHuman() public {
        vm.prank(bob);
        vm.expectRevert("not a registered human");
        registry.registerAgent(carol);
    }

    function test_registerAgent_revertsOnZeroAddress() public {
        vm.prank(alice);
        registry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);

        vm.prank(alice);
        vm.expectRevert("zero address");
        registry.registerAgent(address(0));
    }

    function test_registerAgent_revertsIfAgentAlreadyRegistered() public {
        vm.prank(alice);
        registry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);

        vm.prank(alice);
        registry.registerAgent(carol);

        vm.prank(alice);
        vm.expectRevert("agent already registered");
        registry.registerAgent(carol);
    }

    function test_registerAgent_revertsIfAgentIsAHuman() public {
        // Register both alice and bob as humans.
        vm.prank(alice);
        registry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);

        vm.prank(bob);
        registry.registerHuman(1, NULLIFIER_2, EXT_NULLIFIER, emptyProof);

        // Alice cannot register an existing human as her agent.
        vm.prank(alice);
        vm.expectRevert("wallet is a registered human");
        registry.registerAgent(bob);
    }

    // -------------------------------------------------------------------------
    // humanOf
    // -------------------------------------------------------------------------

    function test_humanOf_forRegisteredHuman() public {
        vm.prank(alice);
        registry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);

        assertEq(registry.humanOf(alice), alice);
    }

    function test_humanOf_forAgent() public {
        vm.prank(alice);
        registry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);

        vm.prank(alice);
        registry.registerAgent(bob);

        assertEq(registry.humanOf(bob), alice);
    }

    function test_humanOf_forUnknownAddress() public view {
        assertEq(registry.humanOf(carol), address(0));
    }

    // -------------------------------------------------------------------------
    // UUPS upgrade
    // -------------------------------------------------------------------------

    function test_upgrade_onlyOwner() public {
        HumanRegistry newImpl = new HumanRegistry();

        // Non-owner should be rejected.
        vm.prank(alice);
        vm.expectRevert();
        registry.upgradeToAndCall(address(newImpl), "");

        // Owner should succeed.
        vm.prank(owner);
        registry.upgradeToAndCall(address(newImpl), "");
    }

    function test_upgrade_preservesState() public {
        vm.prank(alice);
        registry.registerHuman(1, NULLIFIER_1, EXT_NULLIFIER, emptyProof);

        HumanRegistry newImpl = new HumanRegistry();
        vm.prank(owner);
        registry.upgradeToAndCall(address(newImpl), "");

        // State must survive the upgrade.
        assertEq(registry.nullifierOf(alice), NULLIFIER_1);
        assertEq(registry.humanOf(alice), alice);
    }
}
