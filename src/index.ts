import {readFileSync} from 'fs'
import {getDefaultProvider, Wallet} from 'ethers'
import {CryptoFreezerFactory} from '../build'

const WBTC_CONTRACTS_ADDRESS_RINKEBY="0x577D296678535e4903D59A4C929B718e1D575e0A"

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
    const factory = new CryptoFreezerFactory(deployer)
    await deployContract(factory, deployer)
}

async function deployContract(factory: CryptoFreezerFactory, deployer: Wallet) {
    const contract = await factory.deploy()
    await contract.deployed()
    console.log(`CryptoFreezer implementation deployed at ${contract.address}`)

    await contract.addSupportedToken(WBTC_CONTRACTS_ADDRESS_RINKEBY)
    console.log(`WBTC added to supported tokens (${WBTC_CONTRACTS_ADDRESS_RINKEBY})`)
}

run(process.argv.slice(2))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })