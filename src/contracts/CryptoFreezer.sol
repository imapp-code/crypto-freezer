pragma solidity 0.7.6;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "IPriceFetcher.sol";
import "IMigrationAgent.sol";

contract CryptoFreezer is Ownable {
    struct Deposit {
        address token;
        uint256 value;
        uint256 unlockTimeUTC;
        uint256 minPrice;
    }

    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeMath for uint256;

    uint256 maxTimeLockPeriod = 5 * 365 days;

    EnumerableSet.AddressSet private _supportedTokens;
    // user => deposits[]
    mapping(address => Deposit[]) public deposits;
    IPriceFetcher private _priceFetcher = IPriceFetcher(0x0);

    address public migrationAgent = address(0);

    event SupportedTokenAdded(IERC20 indexed token);
    event NewDeposit(
        address indexed token,
        address indexed owner,
        uint256 value,
        uint256 unlockTimeUTC,
        uint256 minPrice,
        uint256 index
    );
    event Withdraw(address indexed token, address indexed owner, uint256 value, uint256 unlockTimeUTC, uint256 minPrice);
    event AddToDeposit(address indexed token, address indexed owner, uint256 value, uint256 depositIndex);

    constructor()  {
    }

    function addSupportedToken(IERC20 token) onlyOwner public {
        require(!isTokenSupported(token), "Token already supported");

        _supportedTokens.add(address(token));
        emit SupportedTokenAdded(token);
    }

    function setPriceFetcher(IPriceFetcher fetcher) onlyOwner public {
        _priceFetcher = fetcher;
    }

    function setMaxTimeLockPeriod(uint256 newMaxTimeLockPeriod) onlyOwner public {
        maxTimeLockPeriod = newMaxTimeLockPeriod;
    }

    function isTokenSupported(IERC20 token) view public returns (bool) {
        return _supportedTokens.contains(address(token));
    }

    function isUnlocked(address owner, uint256 depositIndex) public view returns(bool) {
        Deposit memory deposit = deposits[owner][depositIndex];
        return _isUnlocked(deposit);
    }

    function _isUnlocked(Deposit memory deposit) internal view returns(bool) {
        if(block.timestamp < deposit.unlockTimeUTC) {
            return address(_priceFetcher) != address(0x0)
                && deposit.minPrice >= _priceFetcher.currentPrice(deposit.token);
        } else {
            return true;
        }
    }

    function depositERC20(IERC20 token, uint256 value, uint256 unlockTimeUTC, uint256 minPrice) public {
        depositERC20(token, value, unlockTimeUTC, minPrice, msg.sender);
    }

    function depositERC20(
        IERC20 token,
        uint256 value,
        uint256 unlockTimeUTC,
        uint256 minPrice,
        address owner
    ) public {
        require(unlockTimeUTC > block.timestamp, "Unlock time set in past");
        require(isTokenSupported(token), "Token not supported");
        require(unlockTimeUTC - block.timestamp <= maxTimeLockPeriod, "Time lock period too long");
        require(value > 0, "Values is 0");

        require(token.transferFrom(msg.sender, address(this), value), "Cannot transfer ERC20 (deposit)");
        deposits[owner].push(Deposit(address(token), value, unlockTimeUTC, minPrice));

        emit NewDeposit(address(token), owner, value, unlockTimeUTC, minPrice, deposits[owner].length - 1);
    }

    function withdrawERC20(
        address owner,
        uint256 depositIndex
    ) public {
        Deposit storage deposit = deposits[owner][depositIndex];
        require(deposit.value > 0, "Deposit does not exist");

        require(_isUnlocked(deposit), "Deposit is locked");

        IERC20 token = IERC20(deposits[owner][depositIndex].token);

        // Withdrawing
        delete deposits[owner][depositIndex];
        require(token.transfer(owner, deposit.value), "Cannot transfer ERC20 (withdraw)");

        emit Withdraw(address(token), owner, deposit.value, deposit.unlockTimeUTC, deposit.minPrice);
    }

    function depositETH(
        uint256 unlockTimeUTC,
        uint256 minPrice
    ) payable public {
        depositETH(unlockTimeUTC, minPrice, msg.sender);
    }

    function depositETH(
        uint256 unlockTimeUTC,
        uint256 minPrice,
        address owner
    ) payable public {
        require(unlockTimeUTC > block.timestamp, "Unlock time set in past");
        require(msg.value > 0, "Values is 0");

        deposits[owner].push(Deposit(address(0), msg.value, unlockTimeUTC, minPrice));

        emit NewDeposit(address(0), owner, msg.value, unlockTimeUTC, minPrice, deposits[owner].length - 1);
    }

    function withdrawETH(
        address payable owner,
        uint256 depositIndex
    ) public {
        Deposit storage deposit = deposits[owner][depositIndex];

        require(deposit.value > 0, "Deposit does not exist");
        require(_isUnlocked(deposit), "Deposit is locked");

        // Withdrawing
        delete deposits[owner][depositIndex];
        owner.transfer(deposit.value);

        emit Withdraw(address(0), owner, deposit.value, deposit.unlockTimeUTC, deposit.minPrice);
    }

    function addToDepositERC20(
        uint256 depositIndex,
        uint256 value
    ) public {
        addToDepositERC20(depositIndex, value, msg.sender);
    }

    function addToDepositERC20(
        uint256 depositIndex,
        uint256 value,
        address owner
    ) public {
        Deposit storage deposit = deposits[owner][depositIndex];
        require(deposit.value > 0, "Deposit does not exist");

        require(!_isUnlocked(deposit), "Deposit is unlocked");

        IERC20 token = IERC20(deposits[owner][depositIndex].token);

        require(token.transferFrom(msg.sender, address(this), value), "Cannot transfer ERC20 (deposit)");
        deposit.value = deposit.value.add(value);

        emit AddToDeposit(address(token), owner, value, depositIndex);
    }

    function setMigrationAgent(address newMigrationAgent) onlyOwner public {
        require(migrationAgent == address(0));
        migrationAgent = newMigrationAgent;
    }

    function migrate(uint256 depositIndex) public {
        require(migrationAgent != address(0));

        Deposit memory deposit = deposits[msg.sender][depositIndex];
        require(deposit.value > 0, "Deposit does not exist");

        IMigrationAgent agent = IMigrationAgent(migrationAgent);

        agent.makeMigration(deposit.token, deposit.value, deposit.unlockTimeUTC, deposit.minPrice);

        delete deposits[msg.sender][depositIndex];

        if(deposit.token != address(0)) {
            require(IERC20(deposit.token).transfer(agent.migrationTarget(), deposit.value));
        } else { // ETH case
            agent.migrationTarget().transfer(deposit.value);
        }

    }
}