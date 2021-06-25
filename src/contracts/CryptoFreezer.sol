// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "IPriceFetcher.sol";
import "IMigrationAgent.sol";

contract CryptoFreezer is Ownable, ReentrancyGuard {
    struct Deposit {
        address token;
        uint256 value;
        uint256 unlockTimeUTC;
        uint256 minPrice;
    }

    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeMath for uint256;

    uint256 public maxTimeLockPeriod = 5 * 365 days;

    EnumerableSet.AddressSet private _supportedTokens;
    // user => deposits[]
    mapping(address => Deposit[]) public deposits;
    IPriceFetcher public priceFetcher = IPriceFetcher(0x0);

    address payable public migrationAgent = address(0);

    event SupportedTokenAdded(IERC20 indexed token);
    event NewDeposit(
        address indexed token,
        address indexed owner,
        uint256 value,
        uint256 unlockTimeUTC,
        uint256 minPrice,
        uint256 index
    );
    event Withdraw(address indexed token, address indexed owner, uint256 depositIndex, uint256 value, uint256 unlockTimeUTC, uint256 minPrice);
    event AddToDeposit(address indexed owner, uint256 depositIndex, uint256 value);
    event Migrated(address indexed token, address indexed owner, uint256 depositIndex, uint256 value, uint256 unlockTimeUTC, uint256 minPrice, address indexed target);

    function priceDecimals() public view returns (uint8) {
        return priceFetcher.decimals();
    }

    function addSupportedToken(IERC20 token) public onlyOwner {
        require(!isTokenSupported(token), "Token already supported");

        _supportedTokens.add(address(token));
        emit SupportedTokenAdded(token);
    }

    function setPriceFetcher(IPriceFetcher fetcher) public onlyOwner {
        priceFetcher = fetcher;
    }

    function setMaxTimeLockPeriod(uint256 newMaxTimeLockPeriod) public onlyOwner {
        maxTimeLockPeriod = newMaxTimeLockPeriod;
    }

    function isTokenSupported(IERC20 token) public view returns (bool) {
        return _supportedTokens.contains(address(token));
    }

    function isUnlocked(address owner, uint256 depositIndex) public view returns(bool) {
        return _isUnlocked(deposits[owner][depositIndex]);
    }

    function nextDepositIndex(address owner) public view returns (uint256) {
        return deposits[owner].length;
    }

    function _isUnlocked(Deposit memory deposit) internal view returns(bool) {
        if(block.timestamp < deposit.unlockTimeUTC) {
            return address(priceFetcher) != address(0x0)
                && deposit.minPrice <= priceFetcher.currentPrice(deposit.token);
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
    ) public nonReentrant {
        require(value > 0, "Value is 0");
        require(unlockTimeUTC > block.timestamp, "Unlock time set in the past");
        require(isTokenSupported(token), "Token not supported");
        require(unlockTimeUTC - block.timestamp <= maxTimeLockPeriod, "Time lock period too long");
        require(owner != address(0));

        deposits[owner].push(Deposit(address(token), value, unlockTimeUTC, minPrice));
        require(token.transferFrom(msg.sender, address(this), value), "Cannot transfer ERC20 (deposit)");

        emit NewDeposit(address(token), owner, value, unlockTimeUTC, minPrice, deposits[owner].length - 1);
    }

    function withdrawERC20(
        address owner,
        uint256 depositIndex
    ) public nonReentrant {
        require(owner != address(0), "Owner address is 0");
        require(deposits[owner].length > depositIndex, "Invalid deposit index");
        Deposit memory deposit = deposits[owner][depositIndex];
        require(deposit.value > 0, "Deposit does not exist");

        require(_isUnlocked(deposit), "Deposit is locked");
        require(deposit.token != address(0), "Withdrawing wrong deposit type (ERC20)");

        IERC20 token = IERC20(deposit.token);

        // Withdrawing
        delete deposits[owner][depositIndex];
        require(token.transfer(owner, deposit.value), "Cannot transfer ERC20 (withdraw)");

        emit Withdraw(address(token), owner, deposit.value, depositIndex, deposit.unlockTimeUTC, deposit.minPrice);
    }

    function depositETH(
        uint256 unlockTimeUTC,
        uint256 minPrice
    ) public payable {
        depositETH(unlockTimeUTC, minPrice, msg.sender);
    }

    function depositETH(
        uint256 unlockTimeUTC,
        uint256 minPrice,
        address owner
    ) public payable nonReentrant {
        require(msg.value > 0, "Value is 0");
        require(unlockTimeUTC > block.timestamp, "Unlock time set in the past");
        require(unlockTimeUTC - block.timestamp <= maxTimeLockPeriod, "Time lock period too long");
        require(owner != address(0));

        deposits[owner].push(Deposit(address(0), msg.value, unlockTimeUTC, minPrice));

        emit NewDeposit(address(0), owner, msg.value, unlockTimeUTC, minPrice, deposits[owner].length - 1);
    }

    function withdrawETH(
        address payable owner,
        uint256 depositIndex
    ) public nonReentrant {
        require(owner != address(0), "Owner address is 0");
        require(deposits[owner].length > depositIndex, "Invalid deposit index");
        Deposit memory deposit = deposits[owner][depositIndex];

        require(deposit.value > 0, "Deposit does not exist");
        require(_isUnlocked(deposit), "Deposit is locked");
        require(deposit.token == address(0), "Withdrawing wrong deposit type (ETH)");

        // Withdrawing
        delete deposits[owner][depositIndex];
        owner.transfer(deposit.value);

        emit Withdraw(address(0), owner, deposit.value, depositIndex, deposit.unlockTimeUTC, deposit.minPrice);
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
    ) public nonReentrant {
        require(value > 0, "Value is 0");
        require(deposits[owner].length > depositIndex, "Invalid deposit index");
        Deposit storage deposit = deposits[owner][depositIndex];
        require(deposit.value > 0, "Deposit does not exist");

        require(!_isUnlocked(deposit), "Deposit is unlocked");

        require(deposits[owner][depositIndex].token != address(0), "Adding to wrong deposit type (ERC20)");
        IERC20 token = IERC20(deposit.token);

        deposit.value = deposit.value.add(value);
        require(token.transferFrom(msg.sender, address(this), value), "Cannot transfer ERC20 (deposit)");

        emit AddToDeposit(owner, depositIndex, value);
    }

    function addToDepositETH(
        uint256 depositIndex
    ) public payable {
        addToDepositETH(depositIndex, msg.sender);
    }

    function addToDepositETH(
        uint256 depositIndex,
        address owner
    ) public payable nonReentrant {
        require(msg.value > 0, "Value is 0");
        require(deposits[owner].length > depositIndex, "Invalid deposit index");
        Deposit storage deposit = deposits[owner][depositIndex];
        require(deposit.value > 0, "Deposit does not exist");

        require(!_isUnlocked(deposit), "Deposit is unlocked");

        require(deposits[owner][depositIndex].token == address(0), "Adding to wrong deposit type (ETH)");

        deposit.value = deposit.value.add(msg.value);

        emit AddToDeposit(owner, depositIndex, msg.value);
    }

    function setMigrationAgent(address payable newMigrationAgent) public onlyOwner {
        migrationAgent = newMigrationAgent;
    }

    function migrate(uint256 depositIndex) public nonReentrant {
        require(migrationAgent != address(0));

        Deposit memory deposit = deposits[msg.sender][depositIndex];
        require(deposit.value > 0, "Deposit does not exist");

        IMigrationAgent agent = IMigrationAgent(migrationAgent);

        if(deposit.token != address(0)) {
            require(IERC20(deposit.token).transfer(agent.migrationTarget(), deposit.value));
        } else { // ETH case
            agent.migrationTarget().transfer(deposit.value);
        }

        agent.makeMigration(msg.sender, depositIndex);

        delete deposits[msg.sender][depositIndex];

        emit Migrated(
            deposit.token,
            msg.sender,
            deposit.value,
            deposit.unlockTimeUTC,
            deposit.minPrice,
            depositIndex,
            agent.migrationTarget()
        );
    }
}