// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    uint8 private _decimals;

    constructor (string memory name_, string memory symbol_, uint8 decimals) ERC20(name_, symbol_) {
        _decimals = decimals;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint() public {
        _mint(msg.sender, 2000*10**18);
    }
}