import {readFileSync} from 'fs'
import {getDefaultProvider, Wallet} from 'ethers'
import {CryptoFreezer__factory, TestERC20__factory, UniswapPriceFetcher__factory, CryptoFreezer} from '../build'

async function run(args: string[]) {
    if (args.length !== 1) {
        throw new Error('Invalid number of arguments')
    }

    const secretsFile = readFileSync(args[0], 'utf8')
    const secrets = JSON.parse(secretsFile)
    const provider = getDefaultProvider('rinkeby')
    const wallet = new Wallet(secrets.privateKey, provider)
    await deployContracts(wallet)
}

async function deployContracts(deployer: Wallet) {
    console.log('Starting deployment of freezer contract:')
    const factory = new CryptoFreezer__factory(deployer)

    const factoryERC20 = new TestERC20__factory(deployer)
    const USDCAddress = await deployERC20Contract(factoryERC20, deployer, 'USD Coin', 'USDC', 6)
    const WETHAddress = await deployERC20Contract(factoryERC20, deployer, 'Wrapped Ether', 'WETH', 18)
    const wbtcAddress = await deployERC20Contract(factoryERC20, deployer, 'Wrapped BTC', 'WBTC', 8)

    const freezer = await deployFreezerContract(factory, wbtcAddress)

    const factoryUniPF = new UniswapPriceFetcher__factory(deployer)

    const contractUniPF = await factoryUniPF.deploy('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f', USDCAddress, WETHAddress)
    await contractUniPF.deployed()
    console.log(`Uni price fetcher implementation deployed at ${contractUniPF.address}`)

    await freezer.setPriceFetcher(contractUniPF.address)
}

async function deployERC20Contract(
    factory: TestERC20__factory,
    deployer: Wallet,
    name: string,
    symbol: string,
    decimals: number)
    : Promise<string> {
    const contract = await factory.deploy(name, symbol, decimals)
    await contract.deployed()
    console.log(`${name} implementation deployed at ${contract.address}`)
    return contract.address
}

async function deployFreezerContract(factory: CryptoFreezer__factory, wbtcAddress: string) : Promise<CryptoFreezer> {
    const contract = await factory.deploy()
    await contract.deployed()
    console.log(`CryptoFreezer implementation deployed at ${contract.address}`)

    await contract.addSupportedToken(wbtcAddress)
    console.log(`WBTC added to supported tokens (${wbtcAddress})`)

    return contract
}

run(process.argv.slice(2))
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
