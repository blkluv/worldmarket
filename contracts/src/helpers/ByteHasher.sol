// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ByteHasher
/// @notice Hashes bytes to a field element compatible with the Semaphore zk-circuit.
library ByteHasher {
    /// @notice Hash arbitrary bytes to a value in the Semaphore field.
    /// @dev Reduces keccak256 output by right-shifting 8 bits, ensuring the result fits
    ///      within the BN254 scalar field used by World ID's Semaphore circuit.
    /// @param value The bytes to hash.
    /// @return The hash reduced into the Semaphore scalar field.
    function hashToField(bytes memory value) internal pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(value))) >> 8;
    }
}
