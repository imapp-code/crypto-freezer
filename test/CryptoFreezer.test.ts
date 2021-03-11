import {expect, use} from 'chai';
import {BigNumber, Contract, getDefaultProvider, utils} from 'ethers';
import {deployContract, MockProvider, solidity} from 'ethereum-waffle';
import CryptoFreezer from '../build/CryptoFreezer.json';
import PriceFetcherMock from '../build/PriceFetcherMock.json';
import TestERC20 from '../build/TestERC20.json';
import {AsWalletFunction, asWalletFactory} from './helpers/asWalletFactory';
import sinon from 'sinon'

use(solidity);

function now() : number {
    return Math.round(Date.now() / 1000)
}

function infinity() : BigNumber {
    return BigNumber.from("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
}

function zeroAddress() : string {
    return "0x0000000000000000000000000000000000000000"
}

describe('TestCryptoFreezer', () => {
    const provider = new MockProvider()
    const [deployer, user] = provider.getWallets();
    let freezer : Contract;
    let token: Contract;
    let asUser: AsWalletFunction = asWalletFactory(user);
    let asDeployer: AsWalletFunction = asWalletFactory(deployer);
    beforeEach(async () => {
        freezer = await deployContract(deployer, CryptoFreezer, []);
        token = await deployContract(deployer, TestERC20, []);
        await asUser(token).mint()
        await asUser(token).approve(freezer.address, infinity())
    });

    it('Deposits ERC20', async () => {
        const balanceUser = await token.balanceOf(user.address)
        const balanceFreezer = await token.balanceOf(freezer.address)
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
        await expect(deposit.token).to.eq(token.address)
        await expect(deposit.value).to.eq(value);
        await expect(deposit.unlockTimeUTC).to.eq(unlockTimeUTC);
        await expect(deposit.minPrice).to.eq(0);

        const newBalanceUser = await token.balanceOf(user.address)
        const newBalanceFreezer = await token.balanceOf(freezer.address)

        expect(newBalanceUser).to.eq(balanceUser.sub(value))
        expect(newBalanceFreezer).to.eq(balanceFreezer.add(value))
    });

    it('Deposits ETH', async () => {
        const balanceFreezer = await provider.getBalance(freezer.address)
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

        const newBalanceFreezer = await provider.getBalance(freezer.address)

        await expect(newBalanceFreezer).to.eq(balanceFreezer.add(value))
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
        const balanceUser = await token.balanceOf(user.address)
        const balanceFreezer = await token.balanceOf(freezer.address)

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

        const newBalanceUser = await token.balanceOf(user.address)
        const newBalanceFreezer = await token.balanceOf(freezer.address)

        expect(newBalanceUser).to.eq(balanceUser.sub(value).sub(value))
        expect(newBalanceFreezer).to.eq(balanceFreezer.add(value).add(value))
    });

    it('Adds to ETH deposit', async () => {
        const balanceFreezer = await provider.getBalance(freezer.address)

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

        const newBalanceFreezer = await provider.getBalance(freezer.address)

        await expect(newBalanceFreezer).to.eq(balanceFreezer.add(value).add(value))
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

    describe('withdrawERC20', () => {
        const unlockTimeUTC = now() + 3600
        const value = utils.parseEther("10")
        let sinonClock: sinon.SinonFakeTimers

        beforeEach(async () => {
            await freezer.addSupportedToken(token.address)
            await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
                (token.address, value, unlockTimeUTC, 0)).to.emit(freezer, "NewDeposit").withArgs(
                token.address, user.address, value, unlockTimeUTC, 0, 0
            )
        })

        describe('using simon', () => {
            beforeEach(async () => {
                const date = new Date()
                const forwardDays = 1
                date.setDate(date.getDate() + forwardDays)
                sinonClock = sinon.useFakeTimers({
                    now: date,
                    toFake: ['Date'],
                })
            })
            afterEach(async () => {
                sinonClock.restore()
            })

            it('Withdraws ERC20 deposit', async () => {
                const balance = await token.balanceOf(user.address)

                await expect(asUser(freezer)['withdrawERC20(address,uint256)']
                    (user.address, 0)).to.emit(freezer, "Withdraw")
                    .withArgs(token.address, user.address, value, unlockTimeUTC, 0)

                const deposit = await freezer.deposits(user.address, 0)
                await expect(deposit.token).to.eq(zeroAddress());
                await expect(deposit.value).to.eq(0);
                await expect(deposit.unlockTimeUTC).to.eq(0);
                await expect(deposit.minPrice).to.eq(0);

                const newBalance = await token.balanceOf(user.address)
                await expect(newBalance).to.eq(balance.add(value))
            })

            it('Cannot withdraw twice', async () => {
                await expect(asUser(freezer)['withdrawERC20(address,uint256)']
                    (user.address, 0)).to.emit(freezer, "Withdraw")
                    .withArgs(token.address, user.address, value, unlockTimeUTC, 0)

                await expect(asUser(freezer)['withdrawERC20(address,uint256)']
                    (user.address, 0)).to.be.revertedWith("Deposit does not exist")
            })

            it('Cannot withdraw using wrong function', async () => {
                await expect(asUser(freezer)['withdrawETH(address,uint256)']
                    (user.address, 0)).to.be.revertedWith("Withdrawing wrong deposit type (ETH)")
            })

            it('Cannot withdraw using wrong deposit index', async () => {
                await expect(asUser(freezer)['withdrawERC20(address,uint256)']
                    (user.address, 1)).to.be.revertedWith("Invalid deposit index")
            })

            it('Cannot withdraw when owner address is 0', async () => {
                await expect(asUser(freezer)['withdrawERC20(address,uint256)']
                    (zeroAddress(), 0)).to.be.revertedWith("Owner address is 0")
            })
        })
    })

    describe('withdrawETH', () => {
        const unlockTimeUTC = now() + 3600
        const value = utils.parseEther("10")
        let sinonClock: sinon.SinonFakeTimers

        beforeEach(async () => {
            await expect(asUser(freezer)['depositETH(uint256,uint256)']
                (unlockTimeUTC, 0, {value: value})).to.emit(freezer, "NewDeposit").withArgs(
                zeroAddress(), user.address, value, unlockTimeUTC, 0, 0
            )
        })

        describe('using simon', () => {
            beforeEach(async () => {
                const date = new Date()
                const forwardDays = 1
                date.setDate(date.getDate() + forwardDays)
                sinonClock = sinon.useFakeTimers({
                    now: date,
                    toFake: ['Date'],
                })
            })
            afterEach(async () => {
                sinonClock.restore()
            })

            it('Withdraws ETH deposit', async () => {
                await expect(asUser(freezer)['withdrawETH(address,uint256)']
                    (user.address, 0)).to.emit(freezer, "Withdraw")
                    .withArgs(zeroAddress(), user.address, value, unlockTimeUTC, 0)

                const deposit = await freezer.deposits(user.address, 0)
                await expect(deposit.token).to.eq(zeroAddress());
                await expect(deposit.value).to.eq(0);
                await expect(deposit.unlockTimeUTC).to.eq(0);
                await expect(deposit.minPrice).to.eq(0);
            })

            it('Cannot withdraw twice', async () => {
                await expect(asUser(freezer)['withdrawETH(address,uint256)']
                    (user.address, 0)).to.emit(freezer, "Withdraw")
                    .withArgs(zeroAddress(), user.address, value, unlockTimeUTC, 0)

                await expect(asUser(freezer)['withdrawETH(address,uint256)']
                    (user.address, 0)).to.be.revertedWith("Deposit does not exist")
            })

            it('Cannot withdraw using wrong function', async () => {
                await expect(asUser(freezer)['withdrawERC20(address,uint256)']
                    (user.address, 0)).to.be.revertedWith("Withdrawing wrong deposit type (ERC20)")
            })

            it('Cannot withdraw using wrong deposit index', async () => {
                await expect(asUser(freezer)['withdrawETH(address,uint256)']
                    (user.address, 1)).to.be.revertedWith("Invalid deposit index")
            })

            it('Cannot withdraw whe owner address is 0', async () => {
                await expect(asUser(freezer)['withdrawETH(address,uint256)']
                    (zeroAddress(), 0)).to.be.revertedWith("Owner address is 0")
            })
        })
    })

    describe('with price fetcher', () => {
        const unlockTimeUTC = now() + 3600
        const value = utils.parseEther("10")
        let priceFetcher: Contract;
        let minPrice: number

        beforeEach(async () => {
            await freezer.addSupportedToken(token.address)
            priceFetcher = await deployContract(deployer, PriceFetcherMock, []);
            await freezer.setPriceFetcher(priceFetcher.address);
            const priceFetcherDecimals = await priceFetcher.decimals()
            await priceFetcher.setPrice(token.address, 100*10**priceFetcherDecimals)

            const priceDecimals = await freezer.priceDecimals()

            minPrice = 250*10**priceDecimals
            await expect(asUser(freezer)['depositERC20(address,uint256,uint256,uint256)']
                (token.address, value, unlockTimeUTC, minPrice)).to.emit(freezer, "NewDeposit").withArgs(
                token.address, user.address, value, unlockTimeUTC, minPrice, 0
            )
        })

        it("Withdraws when price is above min limit", async () => {
            const currentPrice = 251*10**(await freezer.priceDecimals())
            await priceFetcher.setPrice(token.address, BigNumber.from(currentPrice))

            await expect(asUser(freezer)['withdrawERC20(address,uint256)']
                (user.address, 0)).to.emit(freezer, "Withdraw")
                .withArgs(token.address, user.address, value, unlockTimeUTC, minPrice)
        })

        it("Withdraws when price is  equal min limit", async () => {
            const currentPrice = 250*10**(await freezer.priceDecimals())
            await priceFetcher.setPrice(token.address, BigNumber.from(currentPrice))

            await expect(asUser(freezer)['withdrawERC20(address,uint256)']
                (user.address, 0)).to.emit(freezer, "Withdraw")
                .withArgs(token.address, user.address, value, unlockTimeUTC, minPrice)
        })

        it("does not withdraw when price is below min limit", async () => {
            const currentPrice = 249*10**(await freezer.priceDecimals())
            await priceFetcher.setPrice(token.address, BigNumber.from(currentPrice))

            await expect(asUser(freezer)['withdrawERC20(address,uint256)']
                (user.address, 0)).to.be.revertedWith("Deposit is locked")
        })

    })

});