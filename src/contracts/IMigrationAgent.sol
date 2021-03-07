pragma solidity 0.7.6;

abstract contract IMigrationAgent {
    function makeMigration(address token, uint256 value, uint256 unlockTimeUTC, uint256 minPrice) external virtual;
    function migrationTarget() external virtual returns (address payable);
}
