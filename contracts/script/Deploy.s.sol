// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {HumanRegistry} from "../src/HumanRegistry.sol";
import {WorldMarket} from "../src/WorldMarket.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// @title Deploy
/// @notice Deploys HumanRegistry and WorldMarket as UUPS proxies to Base Sepolia.
///
/// Usage:
///   forge script script/Deploy.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC \
///     --private-key $DEPLOYER_KEY \
///     --broadcast \
///     --verify
///
/// Required env vars:
///   DEPLOYER_KEY          — private key of the deploying account
///   INITIAL_OWNER         — address that will own both proxy contracts
///   WORLD_ID_ROUTER       — WorldIDRouter address (Base Sepolia: 0x42FF98C4E85212a5D31358ACbFe76a621b50fC02)
///   USDC_ADDRESS          — USDC token address (or leave empty to deploy MockUSDC)
///   PER_HUMAN_CAP         — max USDC per human per market (e.g. 1000000000 for 1 000 USDC)
contract Deploy is Script {
    /// @notice WorldIDRouter on Base Sepolia (World ID v3 legacy path).
    address public constant WORLD_ID_ROUTER_BASE_SEPOLIA =
        0x42FF98C4E85212a5D31358ACbFe76a621b50fC02;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_KEY");
        address initialOwner = vm.envOr("INITIAL_OWNER", vm.addr(deployerKey));
        address worldIdRouter =
            vm.envOr("WORLD_ID_ROUTER", WORLD_ID_ROUTER_BASE_SEPOLIA);
        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        uint256 perHumanCap = vm.envOr("PER_HUMAN_CAP", uint256(1_000e6)); // default 1 000 USDC

        vm.startBroadcast(deployerKey);

        // -----------------------------------------------------------------------
        // 1. Deploy MockUSDC if no USDC address was provided (e.g. testnet).
        // -----------------------------------------------------------------------
        if (usdcAddress == address(0)) {
            MockUSDC mockUsdc = new MockUSDC();
            usdcAddress = address(mockUsdc);
            console2.log("MockUSDC deployed at:", usdcAddress);
        }

        // -----------------------------------------------------------------------
        // 2. Deploy HumanRegistry as a UUPS proxy.
        // -----------------------------------------------------------------------
        HumanRegistry registryImpl = new HumanRegistry();
        bytes memory registryInit =
            abi.encodeCall(HumanRegistry.initialize, (worldIdRouter, initialOwner));
        ERC1967Proxy registryProxy = new ERC1967Proxy(address(registryImpl), registryInit);
        console2.log("HumanRegistry proxy deployed at:", address(registryProxy));
        console2.log("HumanRegistry impl  deployed at:", address(registryImpl));

        // -----------------------------------------------------------------------
        // 3. Deploy WorldMarket as a UUPS proxy.
        // -----------------------------------------------------------------------
        WorldMarket marketImpl = new WorldMarket();
        bytes memory marketInit = abi.encodeCall(
            WorldMarket.initialize,
            (address(registryProxy), usdcAddress, perHumanCap, initialOwner)
        );
        ERC1967Proxy marketProxy = new ERC1967Proxy(address(marketImpl), marketInit);
        console2.log("WorldMarket proxy deployed at:", address(marketProxy));
        console2.log("WorldMarket impl  deployed at:", address(marketImpl));

        vm.stopBroadcast();
    }
}
