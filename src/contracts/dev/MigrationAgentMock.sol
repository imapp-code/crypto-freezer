// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../CryptoFreezer.sol";

contract MigrationAgentMock is  IMigrationAgent, ReentrancyGuard {
    CryptoFreezer private _freezerSource;
    CryptoFreezer private _freezerTarget;

    constructor (CryptoFreezer freezerSource, CryptoFreezer freezerTarget) {
        _freezerSource = freezerSource;
        _freezerTarget = freezerTarget;
    }

    function makeMigration(address owner, uint256 depositIndex) external nonReentrant override {
        (address token, uint256 value, uint256 unlockTimeUTC, uint256 minPrice) =
            _freezerSource.deposits(owner, depositIndex);
        require(value > 0);

        if(token == address(0)) {
            _freezerTarget.depositETH{value: value}(unlockTimeUTC, minPrice, owner);
        } else {
            IERC20(token).approve(address(_freezerTarget), uint256(-1));
            _freezerTarget.depositERC20(IERC20(token), value, unlockTimeUTC, minPrice, owner);
        }
    }

    function migrationTarget() external override view returns (address payable) {
        return payable(address(this));
    }
}
