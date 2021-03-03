pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DummyContract is ERC20 {
    uint256 private constant _MINT_AMOUNT = 1000*10**18;

    constructor(string memory name_) ERC20(name_, name_) {
    }

    function mint(address to) public {
        _mint(to, _MINT_AMOUNT);
    }
}