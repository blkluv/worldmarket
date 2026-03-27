// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Minimal ERC-20 token that mimics USDC (6 decimals) for local testing.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USD Coin", "USDC") {}

    /// @notice Mint tokens to any address — only for testing.
    /// @param to     Recipient of the minted tokens.
    /// @param amount Amount to mint (in the smallest unit, i.e. 1e6 = 1 USDC).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice USDC uses 6 decimal places.
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
