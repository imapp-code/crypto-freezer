pragma solidity 0.7.6;

abstract contract IPriceFetcher {
    constructor () {}

    function decimals() public view virtual returns (uint8);
    function currentPrice(address tokenAddress) view external virtual returns (uint256);
}