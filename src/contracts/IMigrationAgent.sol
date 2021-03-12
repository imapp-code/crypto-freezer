// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

abstract contract IMigrationAgent {
    function makeMigration(address owner, uint256 depositIndex) external virtual;
    function migrationTarget() external virtual returns (address payable);
}
