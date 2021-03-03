import {readFileSync} from 'fs'
import {getDefaultProvider, Wallet} from 'ethers'
import {DummyContractFactory} from '../build'

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
    console.log('Starting deployment of pawnshop test contracts:')
    const factory = new DummyContractFactory(deployer)
    await deployContract(factory, deployer, "Contract Name")
}

async function deployContract(factory: DummyContractFactory, deployer: Wallet, name: string) {
    const contract = await factory.deploy(name)
    await contract.deployed()
    console.log(`${name} implementation deployed at ${contract.address}`)
}

run(process.argv.slice(2))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })