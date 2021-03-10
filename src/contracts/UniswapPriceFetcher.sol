pragma solidity 0.7.6;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "IPriceFetcher.sol";

contract UniswapPriceFetcher is IPriceFetcher {
    using SafeMath for uint256;
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

    function _alignValue(uint256 value, uint8 dec, uint8 targetDec) pure internal returns (uint256) {
        return targetDec > dec ?
            value.mul((10**(targetDec - dec))) :
            value.div((10**(dec - targetDec)));
    }

    function _getReserveAligned(IUniswapV2Pair pair) view internal returns (uint256, uint256) {
        uint112 reserve0; uint112 reserve1;
            (reserve0, reserve1,) = pair.getReserves();
        ERC20 usdToken;
        ERC20 token;
        uint256 reserveUSD; uint256 reserveToken;
        if (address(_usdStableContract) == pair.token0()) {
            usdToken = ERC20(pair.token0());
            token = ERC20(pair.token1());
            reserveUSD = reserve0;
            reserveToken = reserve1;
        } else if (address(_usdStableContract) == pair.token1()) {
            usdToken = ERC20(pair.token1());
            token = ERC20(pair.token0());
            reserveUSD = reserve1;
            reserveToken = reserve0;
        } else {
            require(false, "No usd stable token in pair");
        }

        return (_alignValue(reserveUSD, usdToken.decimals(), decimals()),
                _alignValue(reserveToken, token.decimals(), decimals()));
    }

    function currentPrice(address tokenAddress) view external override returns (uint256) {
        IUniswapV2Pair pair = IUniswapV2Pair(_uniswapFactory.getPair(tokenAddress, address(_usdStableContract)));

        if(address(pair) != address(0)) {
            uint256 reserveUSDAligned; uint256 reserveTokenAligned;
            (reserveUSDAligned, reserveTokenAligned) = _getReserveAligned(pair);
            return reserveUSDAligned.div(reserveTokenAligned);
        } else {
            return uint256(-1);
        }
    }
}