pragma solidity 0.7.6;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CryptoFreezer is Ownable {
    struct Deposit {
        IERC20 token;
        uint256 value;
        uint256 unlockTimeUTC;
        uint256 maxPrice;
    }

    using EnumerableSet for EnumerableSet.AddressSet;

    EnumerableSet.AddressSet private _supportedTokens;
    // user => deposits[]
    mapping(address => Deposit[]) private _deposits;

    event SupportedTokenAdded(IERC20 indexed token);
    event NewDeposit(IERC20 indexed token, address indexed owner, uint256 value, uint256 unlockTimeUTC, uint256 maxPrice);
    event Withdraw(IERC20 indexed token, address indexed owner, uint256 value, uint256 unlockTimeUTC, uint256 maxPrice);

    constructor()  {
    }

    function addSupportedToken(IERC20 token) onlyOwner public {
        require(!isTokenSupported(token), "Token already supported");

        _supportedTokens.add(address(token));
        emit SupportedTokenAdded(token);
    }

    function isTokenSupported(IERC20 token) view public returns (bool) {
        return _supportedTokens.contains(address(token));
    }

    function depositERC20(IERC20 token, uint256 value, uint256 unlockTimeUTC, uint256 maxPrice) public {
        depositERC20(token, value, unlockTimeUTC, maxPrice, msg.sender);
    }

    function depositERC20(
        IERC20 token,
        uint256 value,
        uint256 unlockTimeUTC,
        uint256 maxPrice,
        address owner
    ) public {
        require(unlockTimeUTC > block.timestamp);
        require(isTokenSupported(token));

        _deposits[owner].push(Deposit(token, value, unlockTimeUTC, maxPrice));

        token.transferFrom(owner, address(this), value);
        emit NewDeposit(token, owner, value, unlockTimeUTC, maxPrice);
    }

    function withdrawERC20(
        IERC20 token,
        address owner,
        uint256 depositIndex
    ) public {
        Deposit memory deposit = _deposits[owner][depositIndex];
        require(block.timestamp > deposit.unlockTimeUTC, "Deposit locked");

        delete _deposits[owner][depositIndex];
        token.transfer(owner, deposit.values);

        emit Withdraw(token, owner, deposit.value, deposit.unlockTimeUTC, deposit.maxPrice);
    }
}