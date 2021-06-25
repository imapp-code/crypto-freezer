import {Contract, Wallet} from 'ethers'

export type AsWalletFunction = ReturnType<typeof asWalletFactory>

export function asWalletFactory(wallet: Wallet) {
    return <T extends Contract>(contract: T): T => contract.connect(wallet) as T
}
