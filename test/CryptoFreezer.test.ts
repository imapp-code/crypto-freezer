import {expect, use} from 'chai';
import {BigNumber, Contract, utils} from 'ethers';
import {deployContract, MockProvider, solidity} from 'ethereum-waffle';
import CryptoFreezer from '../build/CryptoFreezer.json';
import TestERC20 from '../build/TestERC20.json';
import {AsWalletFunction, asWalletFactory} from './helpers/asWalletFactory';

use(solidity);

function now() : number {
    return Math.round(Date.now() / 1000)
}

function infinity() : BigNumber {
    return BigNumber.from("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
}

function zeroAddress() : BigNumber {
    return BigNumber.from("0x0000000000000000000000000000000000000000000000000000000000000000")
}

describe('TestCryptoFreezer', () => {
    const [deployer, user] = new MockProvider().getWallets();
    let freezer, token: Contract;
    let asUser: AsWalletFunction = asWalletFactory(user);
    let asDeployer: AsWalletFunction = asWalletFactory(deployer);
    beforeEach(async () => {
        freezer = await deployContract(deployer, CryptoFreezer, []);
        token = await deployContract(deployer, TestERC20, []);
        await asUser(token).mint()
        await asUser(token).approve(freezer.address, infinity())
    });

    it('Deposits ERC20', async () => {
        await freezer.addSupportedToken(token.address)
        const unlockTimeUTC = now() + 3600
        const value = utils.parseEther("10")
        await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
            (token.address, value, unlockTimeUTC, 0)).to.emit(freezer, "NewDeposit").withArgs(
                token.address, user.address, value, unlockTimeUTC, 0, 0
        )

        await expect(asUser(freezer)['withdrawERC20(address,uint256)'](user.address, 0))
            .to.be.revertedWith("Deposit is locked")
        await expect(asUser(freezer)['withdrawERC20(address,uint256)'](user.address, 1))
            .to.be.revertedWith("Invalid deposit index")

        const unlocked = await freezer.isUnlocked(user.address, 0);
        await expect(unlocked).to.eq(false);

        const deposit = await freezer.deposits(user.address, 0)
        await expect(deposit.token).to.eq(token.address);
        await expect(deposit.value).to.eq(value);
        await expect(deposit.unlockTimeUTC).to.eq(unlockTimeUTC);
        await expect(deposit.minPrice).to.eq(0);
    });

    it('Deposits ETH', async () => {
        const unlockTimeUTC = now() + 3600
        const value = utils.parseEther("10")
        await expect(asUser(freezer)['depositETH(uint256,uint256)']
            (unlockTimeUTC, 0, {value: value})).to.emit(freezer, "NewDeposit").withArgs(
                zeroAddress(), user.address, value, unlockTimeUTC, 0, 0
        )

        await expect(asUser(freezer)['withdrawETH(address,uint256)'](user.address, 0))
            .to.be.revertedWith("Deposit is locked")
        await expect(asUser(freezer)['withdrawETH(address,uint256)'](user.address, 1))
            .to.be.revertedWith("Invalid deposit index")

        const unlocked = await freezer.isUnlocked(user.address, 0);
        await expect(unlocked).to.eq(false);

        const deposit = await freezer.deposits(user.address, 0)
        await expect(deposit.token).to.eq(zeroAddress());
        await expect(deposit.value).to.eq(value);
        await expect(deposit.unlockTimeUTC).to.eq(unlockTimeUTC);
        await expect(deposit.minPrice).to.eq(0);
    });

    it("Allows to deposit ERC20 using different address", async () => {
        await freezer.addSupportedToken(token.address)
        await asDeployer(token).mint()
        await asDeployer(token).approve(freezer.address, infinity())
        const unlockTimeUTC = now() + 3600
        const value = utils.parseEther("10")
        await expect(asDeployer(freezer)['depositERC20(address,uint256,uint256,uint256,address)']
            (token.address, utils.parseEther("10"), unlockTimeUTC, 0, user.address))
            .to.emit(freezer, "NewDeposit").withArgs(
                token.address, user.address, value, unlockTimeUTC, 0, 0
            )

        const deposit = await freezer.deposits(user.address, 0)
        await expect(deposit.token).to.eq(token.address);
        await expect(deposit.value).to.eq(value);
        await expect(deposit.unlockTimeUTC).to.eq(unlockTimeUTC);
        await expect(deposit.minPrice).to.eq(0);
    });

    it("Doesn't allow to deposit for longer period than max time lock period", async () => {
        await freezer.addSupportedToken(token.address)
        const maxTimelockPeriod = await freezer.maxTimeLockPeriod()
        const unlockTimeUTC = now() + maxTimelockPeriod + 3600
        await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
            (token.address, utils.parseEther("10"), unlockTimeUTC, 0))
            .to.be.revertedWith("Time lock period too long");

        await expect(asUser(freezer)['depositETH(uint256,uint256)']
             (unlockTimeUTC, 0, {value: utils.parseEther("10")})).to.be.revertedWith("Time lock period too long")
    });

    it("Doesn't allow to deposit for unlock time set in the past", async () => {
        await freezer.addSupportedToken(token.address)
        const unlockTimeUTC = now()
        const value = utils.parseEther("10")
        await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
            (token.address, value, unlockTimeUTC, 0))
            .to.be.revertedWith("Unlock time set in the past");

        await expect(asUser(freezer)['depositETH(uint256,uint256)']
             (unlockTimeUTC, 0, {value: value})).to.be.revertedWith("Unlock time set in the past")
    });

    it("Doesn't allow to deposit for zero value", async () => {
        await freezer.addSupportedToken(token.address)
        const unlockTimeUTC = now() + 3600;
        const value = 0
        await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
            (token.address, value, unlockTimeUTC, 0))
            .to.be.revertedWith("Values is 0");

        await expect(asUser(freezer)['depositETH(uint256,uint256)']
             (unlockTimeUTC, 0, {value: value})).to.be.revertedWith("Values is 0")
    });

    it("Reverts when cannot ERC20 transfer not allowed (no allowance)", async () => {
        await freezer.addSupportedToken(token.address)
        const unlockTimeUTC = now() + 3600;
        const value = utils.parseEther("10")

        await asUser(token).decreaseAllowance(freezer.address, infinity())
        await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
            (token.address, value, unlockTimeUTC, 0))
            .to.be.revertedWith("ERC20: transfer amount exceeds allowance");
    });

    it("Reverts when cannot ERC20 transfer not allowed (no funds)", async () => {
        await freezer.addSupportedToken(token.address)
        const unlockTimeUTC = now() + 3600;
        const value = utils.parseEther("10")

        await asUser(token).transfer(deployer.address, await token.balanceOf(user.address))
        await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
            (token.address, value, unlockTimeUTC, 0))
            .to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("Doesn't allow to deposit not supported token", async () => {
        const unlockTimeUTC = now() + 3600
        await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
            (token.address, utils.parseEther("10"), unlockTimeUTC, 0))
            .to.be.revertedWith("Token not supported");
    });

    it('Adds to ERC20 deposit', async () => {
        await freezer.addSupportedToken(token.address)
        const unlockTimeUTC = now() + 3600
        const value = utils.parseEther("10")
        await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
            (token.address, value, unlockTimeUTC, 0)).to.emit(freezer, "NewDeposit").withArgs(
                token.address, user.address, value, unlockTimeUTC, 0, 0
        )

        await expect(asUser(freezer)['addToDepositERC20(uint256,uint256)']
            (0, value)).to.emit(freezer, "AddToDeposit").withArgs(
                user.address, 0, value
        )

        const deposit = await freezer.deposits(user.address, 0)
        await expect(deposit.token).to.eq(token.address);
        await expect(deposit.value).to.eq(value.add(value));
        await expect(deposit.unlockTimeUTC).to.eq(unlockTimeUTC);
        await expect(deposit.minPrice).to.eq(0);
    });

    it('Adds to ETH deposit', async () => {
        const unlockTimeUTC = now() + 3600
        const value = utils.parseEther("10")
        await expect(asUser(freezer)['depositETH(uint256,uint256)']
            (unlockTimeUTC, 0, {value: value})).to.emit(freezer, "NewDeposit").withArgs(
                zeroAddress(), user.address, value, unlockTimeUTC, 0, 0
        )

        await expect(asUser(freezer)['addToDepositETH(uint256)']
            (0, {value: value})).to.emit(freezer, "AddToDeposit").withArgs(
                user.address, 0, value
        )

        const deposit = await freezer.deposits(user.address, 0)
        await expect(deposit.token).to.eq(zeroAddress());
        await expect(deposit.value).to.eq(value.add(value));
        await expect(deposit.unlockTimeUTC).to.eq(unlockTimeUTC);
        await expect(deposit.minPrice).to.eq(0);
    });

    it('Does not allow to add to deposit if requirements not satisfied (ERC20)', async () => {
        await freezer.addSupportedToken(token.address)
        const unlockTimeUTC = now() + 3600
        const value = utils.parseEther("10")
        await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
            (token.address, value, unlockTimeUTC, 0)).to.emit(freezer, "NewDeposit").withArgs(
                token.address, user.address, value, unlockTimeUTC, 0, 0
        )

        await expect(asUser(freezer)['addToDepositERC20(uint256,uint256)']
            (0, 0)).to.be.revertedWith("Values is 0")

        await expect(asUser(freezer)['addToDepositERC20(uint256,uint256)']
            (1, value)).to.be.revertedWith("Invalid deposit index")

        await expect(asUser(freezer)['depositETH(uint256,uint256)']
            (unlockTimeUTC, 0, {value: value})).to.emit(freezer, "NewDeposit").withArgs(
                zeroAddress(), user.address, value, unlockTimeUTC, 0, 1
        )

        await expect(asUser(freezer)['addToDepositERC20(uint256,uint256)']
            (1, value)).to.be.revertedWith("Adding to wrong deposit type (ERC20)")
    });

    it('Does not allow to add to deposit if requirements not satisfied (ETH)', async () => {
        const unlockTimeUTC = now() + 3600
        const value = utils.parseEther("10")
        await expect(asUser(freezer)['depositETH(uint256,uint256)']
            (unlockTimeUTC, 0, {value: value})).to.emit(freezer, "NewDeposit").withArgs(
                zeroAddress(), user.address, value, unlockTimeUTC, 0, 0
        )

        await expect(asUser(freezer)['addToDepositETH(uint256)']
            (0, {value: 0})).to.be.revertedWith("Values is 0")

        await expect(asUser(freezer)['addToDepositETH(uint256)']
            (1, {value: value})).to.be.revertedWith("Invalid deposit index")

        await freezer.addSupportedToken(token.address)
        await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
            (token.address, value, unlockTimeUTC, 0)).to.emit(freezer, "NewDeposit").withArgs(
                token.address, user.address, value, unlockTimeUTC, 0, 1
        )

        await expect(asUser(freezer)['addToDepositETH(uint256)']
            (1, {value: value})).to.be.revertedWith("Adding to wrong deposit type (ETH)")
    });
});