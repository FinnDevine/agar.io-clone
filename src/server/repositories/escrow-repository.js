const db = require("../sql.js");

const recordDeposit = async (playerId, wallet, amount) => {
    const timestamp = Date.now();
    return new Promise((resolve) => {
        db.run(
            "INSERT INTO escrow_records (player_id, wallet, amount, type, timestamp) VALUES (?, ?, ?, 'deposit', ?)",
            [playerId, wallet, amount, timestamp],
            (err) => {
                if (err) console.error(err);
                resolve();
            }
        );
    });
};

const recordWithdrawal = async (playerId, wallet, amount) => {
    const timestamp = Date.now();
    return new Promise((resolve) => {
        db.run(
            "INSERT INTO escrow_records (player_id, wallet, amount, type, timestamp) VALUES (?, ?, ?, 'withdraw', ?)",
            [playerId, wallet, amount, timestamp],
            (err) => {
                if (err) console.error(err);
                resolve();
            }
        );
    });
};

module.exports = {
    recordDeposit,
    recordWithdrawal,
};

