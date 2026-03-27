// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {WorldMarket} from "../src/WorldMarket.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @notice Minimal registry mock that maps a wallet directly to itself (everyone is human).
contract MockRegistry {
    mapping(address => address) internal _humans;

    /// @notice Register `wallet` as a human, mapping it to itself.
    function setHuman(address wallet, address humanAddr) external {
        _humans[wallet] = humanAddr;
    }

    function humanOf(address wallet) external view returns (address) {
        return _humans[wallet];
    }
}

/// @title Market.t.sol — unit tests for WorldMarket
contract MarketTest is Test {
    WorldMarket public impl;
    WorldMarket public market;
    MockUSDC public usdc;
    MockRegistry public mockReg;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal constant PER_HUMAN_CAP = 1000e6; // 1 000 USDC
    uint256 internal constant DEADLINE_OFFSET = 1 days;

    function setUp() public {
        usdc = new MockUSDC();
        mockReg = new MockRegistry();

        // All three test users are registered humans.
        mockReg.setHuman(alice, alice);
        mockReg.setHuman(bob, bob);
        mockReg.setHuman(carol, carol);

        impl = new WorldMarket();
        bytes memory initData = abi.encodeCall(
            WorldMarket.initialize, (address(mockReg), address(usdc), PER_HUMAN_CAP, owner)
        );
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        market = WorldMarket(address(proxy));

        // Fund alice and bob with USDC and approve the market.
        usdc.mint(alice, 10_000e6);
        usdc.mint(bob, 10_000e6);
        usdc.mint(carol, 10_000e6);

        vm.prank(alice);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(market), type(uint256).max);
        vm.prank(carol);
        usdc.approve(address(market), type(uint256).max);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function _createOpenMarket() internal returns (uint256 marketId) {
        vm.prank(owner);
        marketId = market.createMarket("Will ETH reach $10k?", block.timestamp + DEADLINE_OFFSET);
    }

    // -------------------------------------------------------------------------
    // initialize
    // -------------------------------------------------------------------------

    function test_initialize_setsState() public view {
        assertEq(address(market.registry()), address(mockReg));
        assertEq(address(market.usdc()), address(usdc));
        assertEq(market.perHumanCap(), PER_HUMAN_CAP);
        assertEq(market.owner(), owner);
    }

    // -------------------------------------------------------------------------
    // createMarket
    // -------------------------------------------------------------------------

    function test_createMarket_success() public {
        uint256 deadline = block.timestamp + 1 days;
        vm.prank(owner);
        uint256 id = market.createMarket("Test?", deadline);

        assertEq(id, 0);
        assertEq(market.marketCount(), 1);

        (
            string memory question,
            uint256 dl,
            WorldMarket.MarketStatus status,
            ,
            ,
            uint256 yesPool,
            uint256 noPool
        ) = market.markets(0);

        assertEq(question, "Test?");
        assertEq(dl, deadline);
        assertEq(uint8(status), uint8(WorldMarket.MarketStatus.OPEN));
        assertEq(yesPool, 0);
        assertEq(noPool, 0);
    }

    function test_createMarket_incrementsCount() public {
        vm.startPrank(owner);
        market.createMarket("Q1?", block.timestamp + 1 days);
        market.createMarket("Q2?", block.timestamp + 2 days);
        vm.stopPrank();
        assertEq(market.marketCount(), 2);
    }

    function test_createMarket_revertsOnPastDeadline() public {
        vm.prank(owner);
        vm.expectRevert("deadline in past");
        market.createMarket("Too late?", block.timestamp);
    }

    function test_createMarket_revertsOnEmptyQuestion() public {
        vm.prank(owner);
        vm.expectRevert("empty question");
        market.createMarket("", block.timestamp + 1 days);
    }

    function test_createMarket_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        market.createMarket("Unauthorized?", block.timestamp + 1 days);
    }

    // -------------------------------------------------------------------------
    // bet
    // -------------------------------------------------------------------------

    function test_bet_yesSuccess() public {
        uint256 id = _createOpenMarket();
        uint256 amount = 100e6;

        vm.prank(alice);
        market.bet(id, true, amount);

        // First bet on an empty pool → shares = amount (1:1 bootstrap)
        assertEq(market.positions(id, true, alice), amount);

        (, , , , , uint256 yesPool, uint256 noPool) = market.markets(id);
        assertEq(yesPool, amount);
        assertEq(noPool, 0);
    }

    function test_bet_noSuccess() public {
        uint256 id = _createOpenMarket();
        uint256 amount = 200e6;

        vm.prank(alice);
        market.bet(id, false, amount);

        assertEq(market.positions(id, false, alice), amount);

        (, , , , , uint256 yesPool, uint256 noPool) = market.markets(id);
        assertEq(yesPool, 0);
        assertEq(noPool, amount);
    }

    function test_bet_ammShareCalculation() public {
        uint256 id = _createOpenMarket();

        // Bob bets YES first → 1:1 bootstrap
        vm.prank(bob);
        market.bet(id, true, 200e6);
        assertEq(market.positions(id, true, bob), 200e6);

        // Alice bets NO → 1:1 bootstrap (noPool is still 0)
        vm.prank(alice);
        market.bet(id, false, 100e6);
        assertEq(market.positions(id, false, alice), 100e6);

        // Carol bets YES with both pools non-zero
        // shares = yesPool * amount / (noPool + amount)
        //        = 200e6 * 50e6 / (100e6 + 50e6) = 10_000e12 / 150e6 ≈ 66666666
        vm.prank(carol);
        market.bet(id, true, 50e6);
        uint256 expectedShares = (uint256(200e6) * uint256(50e6)) / (uint256(100e6) + uint256(50e6));
        assertEq(market.positions(id, true, carol), expectedShares);
    }

    function test_bet_revertsZeroAmount() public {
        uint256 id = _createOpenMarket();
        vm.prank(alice);
        vm.expectRevert("zero amount");
        market.bet(id, true, 0);
    }

    function test_bet_revertsUnregisteredWallet() public {
        uint256 id = _createOpenMarket();
        address stranger = makeAddr("stranger");
        usdc.mint(stranger, 1000e6);
        vm.prank(stranger);
        usdc.approve(address(market), type(uint256).max);

        vm.prank(stranger);
        vm.expectRevert("unregistered wallet");
        market.bet(id, true, 100e6);
    }

    function test_bet_revertsMarketNotOpen() public {
        uint256 id = _createOpenMarket();

        // Warp past deadline and resolve.
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
        vm.prank(owner);
        market.resolve(id, true);

        vm.prank(alice);
        vm.expectRevert("market not open");
        market.bet(id, true, 100e6);
    }

    function test_bet_revertsAfterDeadline() public {
        uint256 id = _createOpenMarket();
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);

        vm.prank(alice);
        vm.expectRevert("market closed");
        market.bet(id, true, 100e6);
    }

    function test_bet_revertsHumanCapExceeded() public {
        uint256 id = _createOpenMarket();

        vm.prank(alice);
        market.bet(id, true, PER_HUMAN_CAP);

        vm.prank(alice);
        vm.expectRevert("human cap exceeded");
        market.bet(id, true, 1);
    }

    function test_bet_capTracksAcrossOutcomes() public {
        uint256 id = _createOpenMarket();
        uint256 half = PER_HUMAN_CAP / 2;

        vm.prank(alice);
        market.bet(id, true, half);

        vm.prank(alice);
        market.bet(id, false, half); // should succeed (exactly at cap)

        // One more wei must fail.
        vm.prank(alice);
        vm.expectRevert("human cap exceeded");
        market.bet(id, true, 1);
    }

    function test_bet_agentSharesCapWithPrincipal() public {
        // Register dave as an agent of alice (share the same human).
        address dave = makeAddr("dave");
        mockReg.setHuman(dave, alice); // dave maps to alice's human identity
        usdc.mint(dave, 10_000e6);
        vm.prank(dave);
        usdc.approve(address(market), type(uint256).max);

        uint256 id = _createOpenMarket();

        vm.prank(alice);
        market.bet(id, true, PER_HUMAN_CAP / 2);

        vm.prank(dave);
        market.bet(id, true, PER_HUMAN_CAP / 2); // combined = cap; should succeed

        // One more wei must fail for either alice or dave.
        vm.prank(alice);
        vm.expectRevert("human cap exceeded");
        market.bet(id, true, 1);
    }

    // -------------------------------------------------------------------------
    // resolve
    // -------------------------------------------------------------------------

    function test_resolve_success() public {
        uint256 id = _createOpenMarket();
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);

        vm.prank(owner);
        market.resolve(id, true);

        (, , WorldMarket.MarketStatus status, bool winOutcome, bool winOutcomeSet, , ) =
            market.markets(id);

        assertEq(uint8(status), uint8(WorldMarket.MarketStatus.RESOLVED));
        assertTrue(winOutcome);
        assertTrue(winOutcomeSet);
    }

    function test_resolve_revertsIfNotOpen() public {
        uint256 id = _createOpenMarket();
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
        vm.prank(owner);
        market.resolve(id, true);

        vm.prank(owner);
        vm.expectRevert("market not open");
        market.resolve(id, false);
    }

    function test_resolve_revertsBeforeDeadline() public {
        uint256 id = _createOpenMarket();

        vm.prank(owner);
        vm.expectRevert("market not yet closed");
        market.resolve(id, true);
    }

    function test_resolve_onlyOwner() public {
        uint256 id = _createOpenMarket();
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);

        vm.prank(alice);
        vm.expectRevert();
        market.resolve(id, true);
    }

    // -------------------------------------------------------------------------
    // claim
    // -------------------------------------------------------------------------

    function test_claim_winnerReceivesPayout() public {
        uint256 id = _createOpenMarket();

        // Alice bets YES 100 USDC (bootstrap → 100 shares)
        vm.prank(alice);
        market.bet(id, true, 100e6);

        // Bob bets NO 200 USDC (bootstrap → 200 shares)
        vm.prank(bob);
        market.bet(id, false, 200e6);

        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
        vm.prank(owner);
        market.resolve(id, true); // YES wins

        uint256 balBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        market.claim(id);

        // totalPool = 300e6, totalWinningShares = yesPool = 100e6, alice shares = 100e6
        // payout = 100e6 / 100e6 * 300e6 = 300e6
        assertEq(usdc.balanceOf(alice) - balBefore, 300e6);
    }

    function test_claim_multipleWinners() public {
        uint256 id = _createOpenMarket();

        // Alice and bob both bet YES.
        vm.prank(alice);
        market.bet(id, true, 100e6); // 100 shares (bootstrap)

        // Bob's YES bet: shares = 100e6 * 100e6 / (0 + 100e6) = 100e6 (counter still 0 at time of bob's bet)
        // Actually at this point noPool=0 so it falls back to 1:1
        vm.prank(bob);
        market.bet(id, true, 100e6); // 100 shares (1:1, no counter pool)

        // Carol bets NO.
        vm.prank(carol);
        market.bet(id, false, 200e6); // 200 shares (bootstrap for NO)

        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
        vm.prank(owner);
        market.resolve(id, true); // YES wins

        // totalPool = 400e6, yesPool = 200e6
        // alice shares = 100e6 → payout = 100/200 * 400 = 200e6
        // bob shares = 100e6  → payout = 100/200 * 400 = 200e6
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        market.claim(id);
        assertEq(usdc.balanceOf(alice) - aliceBefore, 200e6);

        uint256 bobBefore = usdc.balanceOf(bob);
        vm.prank(bob);
        market.claim(id);
        assertEq(usdc.balanceOf(bob) - bobBefore, 200e6);
    }

    function test_claim_revertsMarketNotResolved() public {
        uint256 id = _createOpenMarket();
        vm.prank(alice);
        market.bet(id, true, 100e6);

        vm.prank(alice);
        vm.expectRevert("market not resolved");
        market.claim(id);
    }

    function test_claim_revertsNoWinningPosition() public {
        uint256 id = _createOpenMarket();

        vm.prank(alice);
        market.bet(id, false, 100e6); // Alice bet NO

        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
        vm.prank(owner);
        market.resolve(id, true); // YES wins

        vm.prank(alice);
        vm.expectRevert("no winning position");
        market.claim(id);
    }

    function test_claim_revertsAlreadyClaimed() public {
        uint256 id = _createOpenMarket();

        vm.prank(alice);
        market.bet(id, true, 100e6);

        vm.prank(bob);
        market.bet(id, false, 100e6);

        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);
        vm.prank(owner);
        market.resolve(id, true);

        vm.prank(alice);
        market.claim(id);

        vm.prank(alice);
        vm.expectRevert("already claimed");
        market.claim(id);
    }

    // -------------------------------------------------------------------------
    // UUPS upgrade
    // -------------------------------------------------------------------------

    function test_upgrade_onlyOwner() public {
        WorldMarket newImpl = new WorldMarket();

        vm.prank(alice);
        vm.expectRevert();
        market.upgradeToAndCall(address(newImpl), "");

        vm.prank(owner);
        market.upgradeToAndCall(address(newImpl), "");
    }

    function test_upgrade_preservesState() public {
        uint256 id = _createOpenMarket();

        WorldMarket newImpl = new WorldMarket();
        vm.prank(owner);
        market.upgradeToAndCall(address(newImpl), "");

        // Market state must survive.
        assertEq(market.marketCount(), 1);
        (string memory q, , , , , , ) = market.markets(id);
        assertEq(q, "Will ETH reach $10k?");
    }
}
