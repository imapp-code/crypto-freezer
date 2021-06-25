// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

abstract contract IPriceFetcher {
    function decimals() public view virtual returns (uint8);
    function currentPrice(address tokenAddress) external view virtual returns (uint256);
}