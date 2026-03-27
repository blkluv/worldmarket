// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Minimal interface consumed by WorldMarket.
interface IHumanRegistry {
    function humanOf(address wallet) external view returns (address);
}

/// @title WorldMarket
/// @notice Prediction market with per-human betting caps enforced via World ID.
///         Deployed as a UUPS proxy so it can be upgraded by the owner.
contract WorldMarket is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum MarketStatus {
        OPEN,
        RESOLVED
    }

    struct Market {
        string question;
        uint256 deadline;
        MarketStatus status;
        bool winningOutcome;
        bool winningOutcomeSet;
        uint256 yesPool;
        uint256 noPool;
    }

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice The human registry used for Sybil resistance checks.
    IHumanRegistry public registry;

    /// @notice The USDC token used for betting and payouts.
    IERC20 public usdc;

    /// @notice Maximum USDC a single human (across all their wallets) may bet on one market.
    uint256 public perHumanCap;

    /// @notice Total number of markets created (also the next market ID).
    uint256 public marketCount;

    /// @notice marketId → Market data.
    mapping(uint256 => Market) public markets;

    /// @notice marketId → outcome → bettor address → shares held.
    mapping(uint256 => mapping(bool => mapping(address => uint256))) public positions;

    /// @notice marketId → human address → total USDC wagered (for cap enforcement).
    mapping(uint256 => mapping(address => uint256)) public humanExposure;

    /// @notice marketId → bettor address → whether they have already claimed winnings.
    mapping(uint256 => mapping(address => bool)) public claimed;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event MarketCreated(uint256 indexed marketId, string question, uint256 deadline);
    event BetPlaced(
        uint256 indexed marketId,
        address indexed bettor,
        bool outcome,
        uint256 amount,
        uint256 shares
    );
    event MarketResolved(uint256 indexed marketId, bool winningOutcome);
    event WinningsClaimed(uint256 indexed marketId, address indexed bettor, uint256 payout);

    // -------------------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------------------

    /// @notice Initializes the proxy implementation.
    /// @param _registry     Address of the HumanRegistry.
    /// @param _usdc         Address of the USDC token.
    /// @param _perHumanCap  Maximum USDC a human may bet per market (in token units).
    /// @param initialOwner  Address that will own this contract.
    function initialize(
        address _registry,
        address _usdc,
        uint256 _perHumanCap,
        address initialOwner
    ) external initializer {
        require(_registry != address(0), "zero registry");
        require(_usdc != address(0), "zero usdc");
        require(initialOwner != address(0), "zero owner");

        __Ownable_init(initialOwner);

        registry = IHumanRegistry(_registry);
        usdc = IERC20(_usdc);
        perHumanCap = _perHumanCap;
    }

    // -------------------------------------------------------------------------
    // Owner-only actions
    // -------------------------------------------------------------------------

    /// @notice Create a new prediction market.
    /// @param question  Human-readable question for the market.
    /// @param deadline  UNIX timestamp after which no new bets are accepted.
    /// @return marketId The ID of the newly created market.
    function createMarket(string calldata question, uint256 deadline)
        external
        onlyOwner
        returns (uint256 marketId)
    {
        require(deadline > block.timestamp, "deadline in past");
        require(bytes(question).length > 0, "empty question");

        marketId = marketCount;
        markets[marketId] = Market({
            question: question,
            deadline: deadline,
            status: MarketStatus.OPEN,
            winningOutcome: false,
            winningOutcomeSet: false,
            yesPool: 0,
            noPool: 0
        });
        marketCount++;

        emit MarketCreated(marketId, question, deadline);
    }

    /// @notice Resolve a market by declaring the winning outcome.
    /// @param marketId The ID of the market to resolve.
    /// @param outcome  The winning outcome: true = YES, false = NO.
    function resolve(uint256 marketId, bool outcome) external onlyOwner {
        Market storage m = markets[marketId];
        require(m.status == MarketStatus.OPEN, "market not open");
        require(block.timestamp >= m.deadline, "market not yet closed");

        m.status = MarketStatus.RESOLVED;
        m.winningOutcome = outcome;
        m.winningOutcomeSet = true;

        emit MarketResolved(marketId, outcome);
    }

    // -------------------------------------------------------------------------
    // Public betting and claiming
    // -------------------------------------------------------------------------

    /// @notice Place a bet on a market outcome.
    /// @dev Uses a constant-product AMM to calculate shares:
    ///      shares = outcomePool * amount / (counterPool + amount)
    ///      where outcomePool is the pool for the chosen outcome and
    ///      counterPool is the opposing pool.  Both pools start at 0; when
    ///      both pools are zero the caller receives shares 1:1 (amount shares).
    /// @param marketId The ID of the market to bet on.
    /// @param outcome  The outcome to bet on: true = YES, false = NO.
    /// @param amount   USDC amount to wager (in token units, must be > 0).
    function bet(uint256 marketId, bool outcome, uint256 amount) external {
        require(amount > 0, "zero amount");

        address human = registry.humanOf(msg.sender);
        require(human != address(0), "unregistered wallet");

        Market storage m = markets[marketId];
        require(m.status == MarketStatus.OPEN, "market not open");
        require(block.timestamp < m.deadline, "market closed");
        require(humanExposure[marketId][human] + amount <= perHumanCap, "human cap exceeded");

        // Transfer USDC from the bettor.
        require(usdc.transferFrom(msg.sender, address(this), amount), "usdc transfer failed");

        // Calculate shares via constant-product AMM.
        // When one or both pools are zero we fall back to 1:1 to bootstrap liquidity.
        uint256 shares;
        if (outcome) {
            // Betting YES: pool = yesPool, counter = noPool
            shares = _calcShares(m.yesPool, m.noPool, amount);
            m.yesPool += amount;
        } else {
            // Betting NO: pool = noPool, counter = yesPool
            shares = _calcShares(m.noPool, m.yesPool, amount);
            m.noPool += amount;
        }

        positions[marketId][outcome][msg.sender] += shares;
        humanExposure[marketId][human] += amount;

        emit BetPlaced(marketId, msg.sender, outcome, amount, shares);
    }

    /// @notice Claim pro-rated USDC winnings for a resolved market.
    /// @param marketId The ID of the resolved market.
    function claim(uint256 marketId) external {
        Market storage m = markets[marketId];
        require(m.status == MarketStatus.RESOLVED, "market not resolved");

        bool winning = m.winningOutcome;
        uint256 userShares = positions[marketId][winning][msg.sender];
        require(userShares > 0, "no winning position");
        require(!claimed[marketId][msg.sender], "already claimed");

        claimed[marketId][msg.sender] = true;

        // Total pool = yesPool + noPool (all USDC in this market).
        uint256 totalPool = m.yesPool + m.noPool;

        // Total winning shares = sum of all positions on the winning side.
        // We proxy this by the winning pool itself (each bettor's shares are
        // proportional to their contribution to the pool, keeping the invariant).
        uint256 totalWinningShares = winning ? m.yesPool : m.noPool;

        // Pro-rata payout: userShares / totalWinningShares * totalPool
        uint256 payout = (userShares * totalPool) / totalWinningShares;

        require(usdc.transfer(msg.sender, payout), "usdc payout failed");

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Constant-product AMM share calculation.
    ///      shares = pool * amount / (counterPool + amount)
    ///      Falls back to 1:1 when either pool is zero (market bootstrap or
    ///      first bet on an outcome).
    function _calcShares(uint256 pool, uint256 counterPool, uint256 amount)
        internal
        pure
        returns (uint256)
    {
        // Bootstrap: award 1:1 shares whenever the outcome pool is empty or
        // no counter-pool has formed yet.
        if (pool == 0 || counterPool == 0) {
            return amount;
        }
        // Standard constant-product: shares = pool * amount / (counterPool + amount)
        return (pool * amount) / (counterPool + amount);
    }

    // -------------------------------------------------------------------------
    // UUPS upgrade authorisation
    // -------------------------------------------------------------------------

    /// @dev Only the owner may authorise an upgrade.
    function _authorizeUpgrade(address /*newImplementation*/) internal override onlyOwner {}
}
