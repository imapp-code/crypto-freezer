pragma solidity 0.7.6;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "IPriceFetcher.sol";

contract UniswapPriceFetcher is IPriceFetcher {
    IUniswapV2Factory private _uniswapFactory;

    uint8 constant public DECIMAL = 8;
    IERC20  private _usdStableContract = IERC20(0x0);

    constructor (IUniswapV2Factory uniswapFactory, IERC20 usdStableContract) {
        _uniswapFactory = uniswapFactory;
        _usdStableContract = usdStableContract;
    }

    function decimals() pure public override returns (uint8) {
        return DECIMAL;
    }

    function currentPrice(address tokenAddress) view external override returns (uint256) {
        IUniswapV2Pair pair = IUniswapV2Pair(_uniswapFactory.getPair(tokenAddress, address(_usdStableContract)));
        if(address(pair) != address(0)) {
            uint112 reserve0; uint112 reserve1;
            (reserve0, reserve1,) = pair.getReserves();
            return (reserve1 * (10**decimals())) / reserve0;
        } else {
            return uint256(-1);
        }
    }
}