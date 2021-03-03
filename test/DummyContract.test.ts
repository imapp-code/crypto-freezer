import {expect, use} from 'chai';
import {BigNumber, Contract} from 'ethers';
import {deployContract, MockProvider, solidity} from 'ethereum-waffle';
import DummyContract from '../build/DummyContract.json';

use(solidity);

describe('TestDummyContract', () => {
    const [wallet, walletTo] = new MockProvider().getWallets();
    let token: Contract;
    beforeEach(async () => {
        token = await deployContract(wallet, DummyContract, ["Contract Name"]);
    });

    it('Mint token', async () => {
        await token.mint(walletTo.address)
        expect(await token.balanceOf(walletTo.address)).to.equal(BigNumber.from("1000000000000000000000"));
        expect(await token.totalSupply()).to.equal(BigNumber.from("1000000000000000000000"));

        await token.mint(walletTo.address)
        expect(await token.balanceOf(walletTo.address)).to.equal(BigNumber.from("2000000000000000000000"));
        expect(await token.totalSupply()).to.equal(BigNumber.from("2000000000000000000000"));
    });
});
