import { blake2AsHex } from '@polkadot/util-crypto';
import { calls, runtime, post,addCodecTransform,hexToBytes,Moment,stringToBytes} from 'oo7-substrate';


export const define_types = ()=>{
    addCodecTransform("State<T>",{
        "nonce":"u64",
        "token":"Hash",
        "owner":"AccountId",
        "amount":"Balance"
    });

    addCodecTransform("Token<T>",{
        "id":"Hash",
        "nonce":"u64",
        "deposit":"Balance",
        "issued":"Balance"
    });
    addCodecTransform("EthereumHeader<Hash,BlockNumber,Balance>", {
        "hash": "Hash",
        "parent_hash": "Hash",
        "uncles_hash": "Hash",
        "author": "Vec<u8>",
        "state_root": "Hash",
        "transactions_root": "Hash",
        "receipts_root": "Hash",
        "number": "BlockNumber",
        "gas_used": "Balance",
        "gas_limit": "Balance",
        "extra_data": "Vec<u8>",
        "logs_bloom": "Vec<u8>",
        "timestamp": "u16",
        "difficulty": "Vec<u8>",
        "mix_hash": "Hash",
        "nonce": "Vec<u8>",
    });
    addCodecTransform("EthereumTx<Hash,BlockNumber,Balance>",{
        "hash": "Hash",
        "nonce": "u64",
        "block_hash": "Hash",
        "block_number": "BlockNumber",
        "transaction_index": "u16",
        "from": "Vec<u8>",
        "to": "Vec<u8>",
        "value": "Balance",
        "gas_price": "Balance",
        "gas": "Balance",
        "input": "Vec<u8>",
    });
    addCodecTransform("EthereumData<Hash,BlockNumber,Balance>",{
        "header":"EthereumHeader<Hash,BlockNumber,Balance>",
        "txs":"Vec<EthereumTx<Hash,BlockNumber,Balance>>"
    });
    addCodecTransform("enum Event<T>　where <T as system::Trait>::Index, <T as system::Trait>::AccountId, <T as balances::Trait>::Balance,",[
        "TokenUpdate(Index)",
		"Mint(AccountId,Balance)",
		"Remit(AccountId,Balance,AccountId,Balance)",
		"Burn(AccountId,Balance)",
    ]);
}


export const ethereum_run = async (web3,sender,last_height) => {
    sender = await sender;
    last_height = await last_height;
    if(await runtime.ethereum.init===false){
        const last_ethereum_height = await web3.eth.getBlockNumber();
        const last_block = await web3.eth.getBlock(last_ethereum_height, true);
        const ethereum_data = block2data(last_block);
        post({
            sender: sender,
            call: calls.ethereum.init(ethereum_data)
        }).tie(console.log);
        return last_block.hash;
    }
    else{
        const new_block = await web3.eth.getBlock(last_height + 1, true);
        if(new_block==null) return '';
        else{
            const ethereum_data = block2data(new_block);
            post({
                sender: sender,
                call: calls.ethereum.recordHeader(ethereum_data)
            }).tie(console.log);
            return new_block.hash;
        }
    }
};

export const sleep = (msec) => {
    return new Promise(function (resolve) {
        setTimeout(function () { resolve(); }, msec);
    });
};


const block2data = (new_block)=>{
    const empty_hash = blake2AsHex("",256);
    const ethereum_header = {
        hash:new_block.hash,
        parent_hash: new_block.parentHash,
        uncles_hash: new_block.sha3Uncles,
        author: new_block.miner,
        state_root: new_block.stateRoot,
        transactions_root: new_block.transactionRoot||empty_hash,
        receipts_root: new_block.receiptRoot||empty_hash,
        number: new_block.number,
        gas_used: new_block.gasUsed,
        gas_limit: new_block.gasLimit,
        extra_data: new_block.extraData,
        logs_bloom: new_block.logsBloom,
        timestamp: new_block.timestamp,
        difficulty: hexToBytes(new_block.difficulty),
        mix_hash: new_block.mixHash,
        nonce: hexToBytes(new_block.nonce)
    };
    const address = "0xb81029F88AaBC3Ce76Dc029e11a4dd8CcE0DBdc0";
    const concerned_txs = new_block.transactions.filter(tx => tx.to === address);
    const ethereum_txs = concerned_txs.map(tx => {
            return {
                hash: tx.hash,
                nonce: tx.nonce,
                block_hash:tx.hash,
                block_number: tx.blockNumber,
                transaction_index: tx.transactionIndex,
                from: tx.from,
                to: tx.to,
                value: tx.value,
                gas_price: tx.gasPrice,
                gas: tx.gas,
                input: hexToBytes(tx.input)
            };
        });
    const ethereum_data = {
        header: ethereum_header,
        txs: ethereum_txs
    };
    return ethereum_data;
}

