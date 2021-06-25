// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../IPriceFetcher.sol";

contract PriceFetcherMock is IPriceFetcher {

    mapping (address => uint256) private _prices;

    function setPrice(address tokenAddress, uint256 price) public {
        _prices[tokenAddress] = price;
    }

    function decimals() public pure override returns (uint8) {
        return 8;
    }

    function currentPrice(address tokenAddress) external view override returns (uint256) {
        return _prices[tokenAddress];
    }
}