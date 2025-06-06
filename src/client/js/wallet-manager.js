const web3 = require('@solana/web3.js');
const global = require('./global');

const RPC_ENDPOINT = window.SOLANA_RPC_ENDPOINT ||
    'https://intensive-radial-frost.solana-mainnet.quiknode.pro/95b1f7a5066ab128943099999903a657c16f838a/';

class WalletManager {
    constructor() {
        this.connectedWallet = null;
        this.gameWallet = null;
        this.amount = 0;
        this.solAmount = 0;
    }

    async connect() {
        if (window.solana && window.solana.isPhantom) {
            const resp = await window.solana.connect({ onlyIfTrusted: false });
            this.connectedWallet = resp.publicKey;
            document.getElementById('walletAddress').textContent = this.connectedWallet.toString();
            document.getElementById('generateWalletButton').disabled = false;
            document.getElementById('depositButton').disabled = false;
        } else {
            alert('No Solana wallet found');
        }
    }

    generateGameWallet() {
        this.gameWallet = web3.Keypair.generate();
        document.getElementById('gameWalletAddress').textContent = this.gameWallet.publicKey.toString();
        document.getElementById('depositButton').disabled = false;
    }

    async deposit() {
        if (!this.connectedWallet) {
            await this.connect();
        }
        if (!this.gameWallet) {
            this.generateGameWallet();
        }
        const amountInput = document.getElementById('depositAmount');
        const solAmount = parseFloat(amountInput.value);
        if (!solAmount || solAmount <= 0) {
            alert('Enter a valid amount');
            return;
        }
        if (!this.connectedWallet || !this.gameWallet) {
            alert('Wallet not ready');
            return;
        }
        const lamports = Math.round(solAmount * web3.LAMPORTS_PER_SOL);
        const endpoint = window.SOLANA_RPC_ENDPOINT ||
            'https://intensive-radial-frost.solana-mainnet.quiknode.pro/95b1f7a5066ab128943099999903a657c16f838a/';
        const connection = new web3.Connection(endpoint, 'confirmed');

        const feeBuffer = 10000;
        const minBalance = await connection.getMinimumBalanceForRentExemption(0);
        const depositLamports = lamports + minBalance + feeBuffer;


        const tx = new web3.Transaction().add(
            web3.SystemProgram.createAccount({
                fromPubkey: this.connectedWallet,
                newAccountPubkey: this.gameWallet.publicKey,
                lamports: depositLamports,
                space: 0,
                programId: web3.SystemProgram.programId,
            })
        );
        tx.feePayer = this.connectedWallet;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        tx.partialSign(this.gameWallet);

        try {
            const signedTx = await window.solana.signTransaction(tx);
            const signature = await connection.sendRawTransaction(signedTx.serialize());
            await connection.confirmTransaction(signature);
            this.amount = lamports;
            this.solAmount = solAmount;
            global.depositData = this.getPlayerData();
            alert('Deposit sent');
        } catch (e) {
            console.error('Deposit failed', e);
            alert('Deposit failed');
        }
    }

    getPlayerData() {
        if (!this.gameWallet || !this.connectedWallet || !this.amount) return {};
        return {
            depositSecret: JSON.stringify(Array.from(this.gameWallet.secretKey)),
            wallet: this.connectedWallet.toString(),
            amount: this.amount,
            depositSol: this.solAmount,
        };
    }
}

module.exports = new WalletManager();
