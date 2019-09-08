import React from 'react';
require('semantic-ui-css/semantic.min.css');
import { Icon, Accordion, List, Checkbox, Label, Header, Segment, Divider, Button } from 'semantic-ui-react';
import { Bond, TransformBond } from 'oo7';
import { ReactiveComponent, If, Rspan } from 'oo7-react';
import {
	calls, runtime, chain, system, runtimeUp, ss58Decode, ss58Encode, pretty,
	addressBook, secretStore, metadata, nodeService, bytesToHex, hexToBytes, AccountId,decode,Balance, state
} from 'oo7-substrate';
import Identicon from 'polkadot-identicon';
import { AccountIdBond, SignerBond } from './AccountIdBond.jsx';
import { BalanceBond } from './BalanceBond.jsx';
import {EtherBond} from './EtherBond.jsx'
import { InputBond } from './InputBond.jsx';
import { TransactButton } from './TransactButton.jsx';
import { FileUploadBond } from './FileUploadBond.jsx';
import { StakingStatusLabel } from './StakingStatusLabel';
import { WalletList, SecretItem } from './WalletList';
import { AddressBookList } from './AddressBookList';
import { TransformBondButton } from './TransformBondButton';
import { Pretty } from './Pretty';
import { blake2AsHex } from '@polkadot/util-crypto';
import {ethereum_run,define_types,sleep} from './ethereum'
import * as Web3 from 'web3';
const Eth = require('web3-eth');
import ethereum_block from 'ethereumjs-block';
import {rlp} from 'ethereumjs-util';
import Ethash from 'ethashjs'
import levelup from 'levelup'
import memdown from 'memdown'

export class App extends ReactiveComponent {
	constructor() {
		super([], { ensureRuntime: runtimeUp });

		define_types();

		// For debug only.
		window.runtime = runtime;
		window.secretStore = secretStore;
		window.addressBook = addressBook;
		window.chain = chain;
		window.calls = calls;
		window.system = system;
		window.that = this;
		window.metadata = metadata;
	}

	readyRender() {
		return (<div>
			<Heading />
			<WalletSegment />
			<Divider hidden />
			<AddressBookSegment />
			<Divider hidden />
			<EthereumSegment />
			<Divider hidden />
			<UpgradeSegment />
			<Divider hidden />
			<FundingSegment />
			<Divider hidden />
			<PokeSegment />
			<Divider hidden />
			<TransactionsSegment />
		</div>);
	}
}

class Heading extends React.Component {
	render() {
		return <div>
			<If
				condition={nodeService().status.map(x => !!x.connected)}
				then={<Label>Connected <Label.Detail>
					<Pretty className="value" value={nodeService().status.sub('connected')} />
				</Label.Detail></Label>}
				else={<Label>Not connected</Label>}
			/>
			<Label>Name <Label.Detail>
				<Pretty className="value" value={system.name} /> v<Pretty className="value" value={system.version} />
			</Label.Detail></Label>
			<Label>Chain <Label.Detail>
				<Pretty className="value" value={system.chain} />
			</Label.Detail></Label>
			<Label>Runtime <Label.Detail>
				<Pretty className="value" value={runtime.version.specName} /> v<Pretty className="value" value={runtime.version.specVersion} /> (
					<Pretty className="value" value={runtime.version.implName} /> v<Pretty className="value" value={runtime.version.implVersion} />
				)
			</Label.Detail></Label>
			<Label>Height <Label.Detail>
				<Pretty className="value" value={chain.height} /> (with <Pretty className="value" value={chain.lag} /> lag)
			</Label.Detail></Label>
			<Label>Authorities <Label.Detail>
				<Rspan className="value">{
					runtime.core.authorities.mapEach((a, i) => <Identicon key={bytesToHex(a) + i} account={a} size={16} />)
				}</Rspan>
			</Label.Detail></Label>
			<Label>Total issuance <Label.Detail>
				<Pretty className="value" value={runtime.balances.totalIssuance} />
			</Label.Detail></Label>
		</div>
	}
}

class WalletSegment extends React.Component {
	constructor() {
		super()
		this.seed = new Bond;
		this.seedAccount = this.seed.map(s => s ? secretStore().accountFromPhrase(s) : undefined)
		this.seedAccount.use()
		this.name = new Bond;
	}
	render() {
		return <Segment style={{ margin: '1em' }}>
			<Header as='h2'>
				<Icon name='key' />
				<Header.Content>
					Wallet
					<Header.Subheader>Manage your secret keys</Header.Subheader>
				</Header.Content>
			</Header>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>seed</div>
				<InputBond
					bond={this.seed}
					reversible
					placeholder='Some seed for this key'
					validator={n => n || null}
					action={<Button content="Another" onClick={() => this.seed.trigger(secretStore().generateMnemonic())} />}
					iconPosition='left'
					icon={<i style={{ opacity: 1 }} className='icon'><Identicon account={this.seedAccount} size={28} style={{ marginTop: '5px' }} /></i>}
				/>
			</div>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>name</div>
				<InputBond
					bond={this.name}
					placeholder='A name for this key'
					validator={n => n ? secretStore().map(ss => ss.byName[n] ? null : n) : null}
					action={<TransformBondButton
						content='Create'
						transform={(name, seed) => secretStore().submit(seed, name)}
						args={[this.name, this.seed]}
						immediate
					/>}
				/>
			</div>
			<div style={{ paddingBottom: '1em' }}>
				<WalletList />
			</div>
		</Segment>
	}
}


class EthereumSegment extends React.Component {
	constructor() {
		super()
		this.token_id = blake2AsHex('ethereum',256);
		this.empty_token = {
			id:this.token_id,
			nonce:0,
			deposit:new Balance(0),
			issued:new Balance(0)
		};
		this.empty_state = {
			nonce:0,
			token:this.token_id,
			owner:'',//decode('',"Hash"),
			amount:new Balance(0)
		};
		this.last_data_nonce = new Bond().defaultTo(0);
		this.last_token_nonce = new Bond().defaultTo(0);
		this.token_issue = new Bond().defaultTo(0);
		this.source = new Bond;
		this.last_source_nonce = new Bond().default(0);
		this.source_amount = new Bond().defaultTo(0);
		this.destination = new Bond;
		this.last_destination_nonce = new Bond().default(0);
		this.destination_amount = new Bond().defaultTo(0);
		this.value = new Bond;
		this.eth_unlock_address = new Bond;
		this.burn_value = new Bond;
		this.web3 = new Web3(Eth.givenProvider);
		this.record = this.record.bind(this);
		this.get_token_state = this.get_token_state.bind(this);
		this.get_token_issued = this.get_token_issued.bind(this);
		this.get_state = this.get_state.bind(this);
		this.get_amount = this.get_amount.bind(this);
		this.ether2wei = this.ether2wei.bind(this);
		this.unlock_eth = this.unlock_eth.bind(this);
	}

	async componentDidMount() {

		runtime.ethereum.lastDataNonce.tie(nonce=>{
			this.last_data_nonce.changed(nonce);
		});
		runtime.ethereum.lastTokenNonce.tie((nonce)=>{
			this.last_token_nonce.changed(nonce);
			this.unlock_eth(nonce,this.source,this.eth_unlock_address);
		});
		this.last_token_nonce.tie(nonce=>{
			this.get_token_issued(nonce).then(amount=>{
				this.token_issue.changed(amount);
			});
		});

		this.source.tie((address)=>{
			runtime.ethereum.stateNonce([address]).tie(nonce=>{
				this.last_source_nonce.changed(nonce);
			});
			this.last_source_nonce.tie(nonce=>{
				this.get_amount(address,nonce).then(amount=>{
					this.source_amount.changed(amount);
				})
			})
		});

		this.destination.tie((address)=>{
			runtime.ethereum.stateNonce([address]).tie(nonce=>{
				this.last_destination_nonce.changed(nonce);
			});
			this.last_destination_nonce.tie(nonce=>{
				this.get_amount(address,nonce).then(amount=>{
					this.destination_amount.changed(amount);
				})
			})
		});

	}

	async unlock_eth(nonce,address,eth_address) {
		if(!await address.ready()||!await eth_address.ready()) return 0;
		nonce = await nonce;
		address = await address;
		eth_address = await eth_address;
		const pre_issued = BigInt(await this.get_token_issued(nonce-1));
		const now_issued = BigInt(await this.get_token_issued(nonce));
		if(pre_issued<=now_issued) return 0;
		const issued_sub = pre_issued - now_issued;
		const state_nonce = await runtime.ethereum.stateNonce([address]);
		const pre_amount = BigInt(await this.get_amount(address,state_nonce-1));
		const now_amount = BigInt(await this.get_amount(address,state_nonce));
		if(pre_amount<=now_amount) return 0;
		const amount_sub = pre_amount - now_amount;
		if(issued_sub===amount_sub){
			try{
				const privKey = '0x'+localStorage.getItem("privKey_for_ETH");
				//lock_address: "0xb81029F88AaBC3Ce76Dc029e11a4dd8CcE0DBdc0";
				const {rawTransaction} = await this.web3.eth.accounts.signTransaction({
					to:eth_address,
					value:issued_sub.toString(),
					gas: 200000,
				},privKey);
				this.web3.eth.sendSignedTransaction(rawTransaction).on('receipt', console.log).on('confirmation', console.log).on('error', console.error);
			}
			catch(e){console.log(e)}
		}
	}


	async get_token_state(nonce) {
		nonce = await nonce;
		const token_state = await runtime.ethereum.indexedToken(nonce);
		return token_state!=null ? token_state : this.empty_token;
	}

	async get_token_issued(nonce) {
		const token = await this.get_token_state(nonce);
		return token!=null ? token.issued.toJSON().data : 0;
	}

	async get_state(address,nonce) {
		address = await address;
		nonce = await nonce;
		const state = await runtime.ethereum.ownedState([address,nonce]);
		return state!=null ? state : this.empty_state;
	}

	async get_amount(address,nonce) {
		const state = await this.get_state(address,nonce);
		return state!=null ? state.amount.toJSON().data : 0;
	}

	async ether2wei(value) {
		const wei = await value;
		return this.web3.utils.toWei(wei.toJSON().data.toString(), 'ether')
	}

	async record() {
		this.last_data_nonce.tie((nonce)=>{
			ethereum_run(this.web3,this.source,this.last_data_nonce)
		});
	}

	render() {
		return <Segment style={{ margin: '1em' }} padded>
			<Header as ='h2'>
				<Icon name='ethereum' />
					<Header.Content>
						Ethereum
						<Header.Subheader>Manage your pETH</Header.Subheader>
					</Header.Content>
			</Header>

			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'large' }}>Ethereum Blockchain Information</div>
			</div>
			<div style={{ paddingBottom: '3em' }}>
				<Label>Recorded Height
					<Label.Detail>
						<Pretty value={this.last_data_nonce}/>
					</Label.Detail>
				</Label>
				<Label>Balance
					<Label.Detail>
						<Pretty value={this.token_issue}/>
						<span>wei</span>
					</Label.Detail>
				</Label>
				<If condition={this.source.ready()} then={<span>
					<Button onClick={this.record}>Start Recording</Button>
				</span>} />
			</div>


			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'large' }}>Remittance</div>
			</div>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>from</div>
				<SignerBond bond={this.source} />
				<If condition={this.source.ready()} then={<span>
					<Label>Balance
						<Label.Detail>
							<Pretty value={this.source_amount}/>
							<span>wei</span>
						</Label.Detail>
					</Label>
					<Label>Nonce
						<Label.Detail>
							<Pretty value={this.last_source_nonce} />
						</Label.Detail>
					</Label>
				</span>} />
			</div>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>to</div>
				<AccountIdBond bond={this.destination} />
				<If condition={this.destination.ready()} then={<span>
					<Label>Balance
						<Label.Detail>
							<Pretty value={this.destination_amount} />
							<span>wei</span>
						</Label.Detail>
					</Label>
					<Label>Balance
						<Label.Detail>
							<Pretty value={this.last_destination_nonce} />
						</Label.Detail>
					</Label>
				</span>} />
			</div>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>amount</div>
				<EtherBond bond={this.value} />
			</div>
			<div style={{ paddingBottom: '3em' }}>
				<TransactButton
					content="Send"
					icon='send'
					tx={{
						sender: this.source,
						call: calls.ethereum.remittance(this.destination,this.value),
						compact: false,
						longevity: true
					}}
				/>
			</div>

			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'large' }}>Unlock ETH</div>
			</div>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>ETH Address</div>
				<InputBond bond={this.eth_unlock_address} />
			</div>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>amount</div>
				<EtherBond bond={this.burn_value} />
			</div>
			<TransactButton
				content="Send"
				icon='send'
				tx={{
					sender: this.source,
					call: calls.ethereum.unlock(this.burn_value),
					compact: false,
					longevity: true
				}}
			/>
		</Segment>
	}
}

class AddressBookSegment extends React.Component {
	constructor() {
		super()
		this.nick = new Bond
		this.lookup = new Bond
	}
	render() {
		return <Segment style={{ margin: '1em' }} padded>
			<Header as='h2'>
				<Icon name='search' />
				<Header.Content>
					Address Book
					<Header.Subheader>Inspect the status of any account and name it for later use</Header.Subheader>
				</Header.Content>
			</Header>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>lookup account</div>
				<AccountIdBond bond={this.lookup} />
				<If condition={this.lookup.ready()} then={<div>
					<Label>Balance
						<Label.Detail>
							<Pretty value={runtime.balances.balance(this.lookup)} />
						</Label.Detail>
					</Label>
					<Label>Nonce
						<Label.Detail>
							<Pretty value={runtime.system.accountNonce(this.lookup)} />
						</Label.Detail>
					</Label>
					<If condition={runtime.indices.tryIndex(this.lookup, null).map(x => x !== null)} then={
						<Label>Short-form
							<Label.Detail>
								<Rspan>{runtime.indices.tryIndex(this.lookup).map(i => ss58Encode(i) + ` (index ${i})`)}</Rspan>
							</Label.Detail>
						</Label>
					} />
					<Label>Address
						<Label.Detail>
							<Pretty value={this.lookup} />
						</Label.Detail>
					</Label>
				</div>} />
			</div>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>name</div>
				<InputBond
					bond={this.nick}
					placeholder='A name for this address'
					validator={n => n ? addressBook().map(ss => ss.byName[n] ? null : n) : null}
					action={<TransformBondButton
						content='Add'
						transform={(name, account) => { addressBook().submit(account, name); return true }}
						args={[this.nick, this.lookup]}
						immediate
					/>}
				/>
			</div>
			<div style={{ paddingBottom: '1em' }}>
				<AddressBookList />
			</div>
		</Segment>
	}
}

class FundingSegment extends React.Component {
	constructor() {
		super()

		this.source = new Bond;
		this.amount = new Bond;
		this.destination = new Bond;
	}
	render() {
		return <Segment style={{ margin: '1em' }} padded>
			<Header as='h2'>
				<Icon name='send' />
				<Header.Content>
					Send Funds
					<Header.Subheader>Send funds from your account to another</Header.Subheader>
				</Header.Content>
			</Header>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>from</div>
				<SignerBond bond={this.source} />
				<If condition={this.source.ready()} then={<span>
					<Label>Balance
						<Label.Detail>
							<Pretty value={runtime.balances.balance(this.source)} />
						</Label.Detail>
					</Label>
					<Label>Nonce
						<Label.Detail>
							<Pretty value={runtime.system.accountNonce(this.source)} />
						</Label.Detail>
					</Label>
				</span>} />
			</div>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>to</div>
				<AccountIdBond bond={this.destination} />
				<If condition={this.destination.ready()} then={
					<Label>Balance
						<Label.Detail>
							<Pretty value={runtime.balances.balance(this.destination)} />
						</Label.Detail>
					</Label>
				} />
			</div>
			<div style={{ paddingBottom: '1em' }}>
				<div style={{ fontSize: 'small' }}>amount</div>
				<BalanceBond bond={this.amount} />
			</div>
			<TransactButton
				content="Send"
				icon='send'
				tx={{
					sender: runtime.indices.tryIndex(this.source),
					call: calls.balances.transfer(runtime.indices.tryIndex(this.destination), this.amount),
					compact: false,
					longevity: true
				}}
			/>
		</Segment>
	}
}

class UpgradeSegment extends React.Component {
	constructor() {
		super()
		this.conditionBond = runtime.metadata.map(m =>
			m.modules && m.modules.some(o => o.name === 'sudo')
			|| m.modules.some(o => o.name === 'upgrade_key')
		)
		this.runtime = new Bond
	}
	render() {
		return <If condition={this.conditionBond} then={
			<Segment style={{ margin: '1em' }} padded>
				<Header as='h2'>
					<Icon name='search' />
					<Header.Content>
						Runtime Upgrade
						<Header.Subheader>Upgrade the runtime using the UpgradeKey module</Header.Subheader>
					</Header.Content>
				</Header>
				<div style={{ paddingBottom: '1em' }}></div>
				<FileUploadBond bond={this.runtime} content='Select Runtime' />
				<TransactButton
					content="Upgrade"
					icon='warning'
					tx={{
						sender: runtime.sudo
							? runtime.sudo.key
							: runtime.upgrade_key.key,
						call: calls.sudo
							? calls.sudo.sudo(calls.consensus.setCode(this.runtime))
							: calls.upgrade_key.upgrade(this.runtime)
					}}
				/>
			</Segment>
		} />
	}
}

class PokeSegment extends React.Component {
	constructor () {
		super()
		this.storageKey = new Bond;
		this.storageValue = new Bond;
	}
	render () {
		return <If condition={runtime.metadata.map(m => m.modules && m.modules.some(o => o.name === 'sudo'))} then={
			<Segment style={{margin: '1em'}} padded>
				<Header as='h2'>
					<Icon name='search' />
					<Header.Content>
						Poke
						<Header.Subheader>Set a particular key of storage to a particular value</Header.Subheader>
					</Header.Content>
				</Header>
				<div style={{paddingBottom: '1em'}}></div>
				<InputBond bond={this.storageKey} placeholder='Storage key e.g. 0xf00baa' />
				<InputBond bond={this.storageValue} placeholder='Storage value e.g. 0xf00baa' />
				<TransactButton
					content="Poke"
					icon='warning'
					tx={{
						sender: runtime.sudo ? runtime.sudo.key : null,
						call: calls.sudo ? calls.sudo.sudo(calls.consensus.setStorage([[this.storageKey.map(hexToBytes), this.storageValue.map(hexToBytes)]])) : null
					}}
				/>
			</Segment>
		}/>		
	}
}

class TransactionsSegment extends React.Component {
	constructor () {
		super()

		this.txhex = new Bond
	}

	render () {
		return <Segment style={{margin: '1em'}} padded>
			<Header as='h2'>
				<Icon name='certificate' />
				<Header.Content>
					Transactions
					<Header.Subheader>Send custom transactions</Header.Subheader>
				</Header.Content>
			</Header>
			<div style={{paddingBottom: '1em'}}>
				<div style={{paddingBottom: '1em'}}>
					<div style={{fontSize: 'small'}}>Custom Transaction Data</div>
					<InputBond bond={this.txhex}/>
				</div>
				<TransactButton tx={this.txhex.map(hexToBytes)} content="Publish" icon="sign in" />
			</div>
		</Segment>
	}
}
