const web3 = require('@solana/web3.js');

class WalletManager {
    constructor() {
        this.connectedWallet = null;
        this.gameWallet = null;
        this.amount = 0;
    }

    async connect() {
        if (window.solana && window.solana.isPhantom) {
            const resp = await window.solana.connect();
            this.connectedWallet = resp.publicKey;
            document.getElementById('walletAddress').textContent = this.connectedWallet.toString();
            document.getElementById('generateWalletButton').disabled = false;
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
        const amountInput = document.getElementById('depositAmount');
        const lamports = parseInt(amountInput.value);
        if (!lamports || !this.connectedWallet || !this.gameWallet) return;
        const connection = new web3.Connection(web3.clusterApiUrl('mainnet-beta'), 'confirmed');
        const tx = new web3.Transaction().add(
            web3.SystemProgram.transfer({
                fromPubkey: this.connectedWallet,
                toPubkey: this.gameWallet.publicKey,
                lamports,
            })
        );
        const { signature } = await window.solana.signAndSendTransaction(tx);
        await connection.confirmTransaction(signature);
        this.amount = lamports;
        alert('Deposit sent');
    }

    getPlayerData() {
        if (!this.gameWallet || !this.connectedWallet || !this.amount) return {};
        return {
            depositSecret: JSON.stringify(Array.from(this.gameWallet.secretKey)),
            wallet: this.connectedWallet.toString(),
            amount: this.amount,
        };
    }
}

module.exports = new WalletManager();
