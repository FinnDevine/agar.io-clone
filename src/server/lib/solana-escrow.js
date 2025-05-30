const {Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction} = require('@solana/web3.js');

const RPC_ENDPOINT = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const ESCROW_SECRET = process.env.ESCROW_SECRET_KEY;
const ESCROW_PUBLIC = process.env.ESCROW_PUBLIC_KEY;

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

function decodeBase58(str) {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const ALPHABET_MAP = {};
    for (let i = 0; i < ALPHABET.length; i++) {
        ALPHABET_MAP[ALPHABET[i]] = i;
    }
    let bytes = [0];
    for (let i = 0; i < str.length; i++) {
        const value = ALPHABET_MAP[str[i]];
        if (value === undefined) throw new Error('Invalid base58 character');
        let carry = value;
        for (let j = 0; j < bytes.length; ++j) {
            carry += bytes[j] * 58;
            bytes[j] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    for (let k = 0; k < str.length && str[k] === '1'; k++) {
        bytes.push(0);
    }
    return Buffer.from(bytes.reverse());
}

function parseSecretKey(secret) {
    if (!secret) throw new Error('Secret key not provided');
    const trimmed = secret.trim();
    if (trimmed.startsWith('[')) {
        return Buffer.from(JSON.parse(trimmed));
    }
    return decodeBase58(trimmed);
}

const escrowKeypair = ESCROW_SECRET ? Keypair.fromSecretKey(parseSecretKey(ESCROW_SECRET)) : null;
const escrowPublicKey = ESCROW_PUBLIC ? new PublicKey(ESCROW_PUBLIC) : (escrowKeypair ? escrowKeypair.publicKey : null);

async function deposit(fromSecret, amountLamports) {
    if (!escrowPublicKey) throw new Error('Escrow public key not configured');
    const from = Keypair.fromSecretKey(parseSecretKey(fromSecret));

    const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: from.publicKey,
        toPubkey: escrowPublicKey,
        lamports: amountLamports,
    }));
    await sendAndConfirmTransaction(connection, tx, [from]);
}

async function withdraw(toPublic, amountLamports) {
    if (!escrowKeypair) throw new Error('Escrow secret not configured');
    const toPubkey = new PublicKey(toPublic);
    const tx = new Transaction().add(SystemProgram.transfer({
        fromPubkey: escrowKeypair.publicKey,
        toPubkey,
        lamports: amountLamports,
    }));
    await sendAndConfirmTransaction(connection, tx, [escrowKeypair]);
}

module.exports = {
    deposit,
    withdraw,
    escrowPublicKey,
};

