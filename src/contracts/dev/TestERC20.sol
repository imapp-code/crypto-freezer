// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    constructor () ERC20("CFERC30Test", "CFT") {}

    function mint() public {
        _mint(msg.sender, 2000*10**18);
    }
}