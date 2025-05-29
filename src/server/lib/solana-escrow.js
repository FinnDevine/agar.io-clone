const {Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction} = require('@solana/web3.js');

const RPC_ENDPOINT = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const ESCROW_SECRET = process.env.ESCROW_SECRET_KEY;
const ESCROW_PUBLIC = process.env.ESCROW_PUBLIC_KEY;

const connection = new Connection(RPC_ENDPOINT, 'confirmed');

const escrowKeypair = ESCROW_SECRET ? Keypair.fromSecretKey(Buffer.from(JSON.parse(ESCROW_SECRET))) : null;
const escrowPublicKey = ESCROW_PUBLIC ? new PublicKey(ESCROW_PUBLIC) : (escrowKeypair ? escrowKeypair.publicKey : null);

async function deposit(fromSecret, amountLamports) {
    const from = Keypair.fromSecretKey(Buffer.from(JSON.parse(fromSecret)));
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

