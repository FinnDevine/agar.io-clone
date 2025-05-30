/*jslint bitwise: true, node: true */
'use strict';

const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const SAT = require('sat');

const gameLogic = require('./game-logic');
const loggingRepositry = require('./repositories/logging-repository');
const chatRepository = require('./repositories/chat-repository');
const escrowRepository = require('./repositories/escrow-repository');
const solanaEscrow = require('./lib/solana-escrow');
const config = require('../../config');
const util = require('./lib/util');
const mapUtils = require('./map/map');
const {getPosition} = require("./lib/entityUtils");
const DEATH_BENEFICIARY = 'CHuTexWfxgGcTFPrxeU2YxQApnMR9bT613XsYMGnkY4n';

let mapManager = new mapUtils.MapManager(config);

let sockets = {};
let spectators = [];
const INIT_MASS_LOG = util.mathLog(config.defaultPlayerMass, config.slowBase);


const Vector = SAT.Vector;

app.use(express.static(__dirname + '/../client'));

io.on('connection', function (socket) {
    let type = socket.handshake.query.type;
    console.log('User has connected: ', type);
    switch (type) {
        case 'player':
            addPlayer(socket);
            break;
        case 'spectator':
            addSpectator(socket);
            break;
        default:
            console.log('Unknown user type, not doing anything.');
    }
});

function generateSpawnpoint(map) {
    let radius = util.massToRadius(config.defaultPlayerMass);
    return getPosition(config.newPlayerInitialPosition === 'farthest', radius, map.players.data)
}


const addPlayer = (socket) => {
    var currentPlayer = new mapUtils.playerUtils.Player(socket.id);
    let playerMap;

    socket.on('gotit', async function (clientPlayerData) {
        console.log('[INFO] Player ' + clientPlayerData.name + ' connecting!');

        if (!clientPlayerData.depositSecret || !clientPlayerData.wallet || !clientPlayerData.amount || !clientPlayerData.depositSol) {
            socket.emit('kick', 'Deposit required.');
            socket.disconnect();
            return;
        }

        playerMap = mapManager.getMap(clientPlayerData.depositSol);

        if (playerMap.players.findIndexByID(socket.id) > -1) {
            console.log('[INFO] Player ID is already connected, kicking.');
            socket.disconnect();
        } else if (!util.validNick(clientPlayerData.name)) {
            socket.emit('kick', 'Invalid username.');
            socket.disconnect();
        } else {
            try {
                await solanaEscrow.deposit(clientPlayerData.depositSecret, clientPlayerData.amount);
                await escrowRepository.recordDeposit(currentPlayer.id, clientPlayerData.wallet, clientPlayerData.amount);
                currentPlayer.walletAddress = clientPlayerData.wallet;
                currentPlayer.escrowBalance = clientPlayerData.amount;
                currentPlayer.walletBalance = currentPlayer.escrowBalance;
                currentPlayer.depositOption = clientPlayerData.depositSol;
                currentPlayer.init(generateSpawnpoint(playerMap), config.defaultPlayerMass);
            } catch (e) {
                console.error('Deposit failed', e);
                socket.emit('kick', 'Deposit failed');
                socket.disconnect();
                return;
            }

            console.log('[INFO] Player ' + clientPlayerData.name + ' connected!');
            sockets[socket.id] = socket;

            const sanitizedName = clientPlayerData.name.replace(/(<([^>]+)>)/ig, '');
            clientPlayerData.name = sanitizedName;

            currentPlayer.clientProvidedData(clientPlayerData);
            playerMap.players.pushNew(currentPlayer);
            io.emit('playerJoin', { name: currentPlayer.name });
            console.log('Total players: ' + playerMap.players.data.length);
        }

    });

    socket.on('pingcheck', () => {
        socket.emit('pongcheck');
    });

    socket.on('windowResized', (data) => {
        currentPlayer.screenWidth = data.screenWidth;
        currentPlayer.screenHeight = data.screenHeight;
    });

    socket.on('respawn', () => {
        if (playerMap) playerMap.players.removePlayerByID(currentPlayer.id);
        socket.emit('welcome', currentPlayer, {
            width: config.gameWidth,
            height: config.gameHeight
        });
        console.log('[INFO] User ' + currentPlayer.name + ' has respawned');
    });

    socket.on('withdraw', async () => {
        if (currentPlayer.escrowBalance > 0) {
            try {
                await solanaEscrow.withdraw(currentPlayer.walletAddress, currentPlayer.escrowBalance);
                await escrowRepository.recordWithdrawal(currentPlayer.id, currentPlayer.walletAddress, currentPlayer.escrowBalance);
                currentPlayer.escrowBalance = 0;
                socket.emit('serverMSG', 'Withdrawal complete');
            } catch (e) {
                console.error('Withdraw failed', e);
                socket.emit('serverMSG', 'Withdraw failed');
            }
        }
    });

    socket.on('leaveGame', async () => {
        if (currentPlayer.escrowBalance > 0) {
            try {
                await solanaEscrow.withdraw(currentPlayer.walletAddress, currentPlayer.escrowBalance);
                await escrowRepository.recordWithdrawal(currentPlayer.id, currentPlayer.walletAddress, currentPlayer.escrowBalance);
                currentPlayer.escrowBalance = 0;
            } catch (e) {
                console.error('Withdraw failed', e);
                socket.emit('serverMSG', 'Withdraw failed');
            }
        }
        socket.disconnect();
    });

    socket.on('disconnect', () => {
        if (playerMap) playerMap.players.removePlayerByID(currentPlayer.id);
        console.log('[INFO] User ' + currentPlayer.name + ' has disconnected');
        socket.broadcast.emit('playerDisconnect', { name: currentPlayer.name });
    });

    socket.on('playerChat', (data) => {
        var _sender = data.sender.replace(/(<([^>]+)>)/ig, '');
        var _message = data.message.replace(/(<([^>]+)>)/ig, '');

        if (config.logChat === 1) {
            console.log('[CHAT] [' + (new Date()).getHours() + ':' + (new Date()).getMinutes() + '] ' + _sender + ': ' + _message);
        }

        socket.broadcast.emit('serverSendPlayerChat', {
            sender: currentPlayer.name,
            message: _message.substring(0, 35)
        });

        chatRepository.logChatMessage(_sender, _message, currentPlayer.ipAddress)
            .catch((err) => console.error("Error when attempting to log chat message", err));
    });

    socket.on('pass', async (data) => {
        const password = data[0];
        if (password === config.adminPass) {
            console.log('[ADMIN] ' + currentPlayer.name + ' just logged in as an admin.');
            socket.emit('serverMSG', 'Welcome back ' + currentPlayer.name);
            socket.broadcast.emit('serverMSG', currentPlayer.name + ' just logged in as an admin.');
            currentPlayer.admin = true;
        } else {
            console.log('[ADMIN] ' + currentPlayer.name + ' attempted to log in with the incorrect password: ' + password);

            socket.emit('serverMSG', 'Password incorrect, attempt logged.');

            loggingRepositry.logFailedLoginAttempt(currentPlayer.name, currentPlayer.ipAddress)
                .catch((err) => console.error("Error when attempting to log failed login attempt", err));
        }
    });

    socket.on('kick', (data) => {
        if (!currentPlayer.admin) {
            socket.emit('serverMSG', 'You are not permitted to use this command.');
            return;
        }

        var reason = '';
        var worked = false;
        for (let playerIndex in playerMap.players.data) {
            let player = playerMap.players.data[playerIndex];
            if (player.name === data[0] && !player.admin && !worked) {
                if (data.length > 1) {
                    for (var f = 1; f < data.length; f++) {
                        if (f === data.length) {
                            reason = reason + data[f];
                        }
                        else {
                            reason = reason + data[f] + ' ';
                        }
                    }
                }
                if (reason !== '') {
                    console.log('[ADMIN] User ' + player.name + ' kicked successfully by ' + currentPlayer.name + ' for reason ' + reason);
                }
                else {
                    console.log('[ADMIN] User ' + player.name + ' kicked successfully by ' + currentPlayer.name);
                }
                socket.emit('serverMSG', 'User ' + player.name + ' was kicked by ' + currentPlayer.name);
                sockets[player.id].emit('kick', reason);
                sockets[player.id].disconnect();
                playerMap.players.removePlayerByIndex(playerIndex);
                worked = true;
            }
        }
        if (!worked) {
            socket.emit('serverMSG', 'Could not locate user or user is an admin.');
        }
    });

    // Heartbeat function, update everytime.
    socket.on('0', (target) => {
        currentPlayer.lastHeartbeat = new Date().getTime();
        if (target.x !== currentPlayer.x || target.y !== currentPlayer.y) {
            currentPlayer.target = target;
        }
    });

    socket.on('1', function () {
        // Fire food.
        const minCellMass = config.defaultPlayerMass + config.fireFood;
        for (let i = 0; i < currentPlayer.cells.length; i++) {
            if (currentPlayer.cells[i].mass >= minCellMass) {
                currentPlayer.changeCellMass(i, -config.fireFood);
                if (playerMap) playerMap.massFood.addNew(currentPlayer, i, config.fireFood);
            }
        }
    });

    socket.on('2', () => {
        currentPlayer.userSplit(config.limitSplit, config.defaultPlayerMass);
    });
}

const addSpectator = (socket) => {
    socket.on('gotit', function () {
        sockets[socket.id] = socket;
        spectators.push(socket.id);
        io.emit('playerJoin', { name: '' });
    });

    socket.emit("welcome", {}, {
        width: config.gameWidth,
        height: config.gameHeight
    });
}

const tickPlayer = (map, currentPlayer) => {
    if (currentPlayer.lastHeartbeat < new Date().getTime() - config.maxHeartbeatInterval) {
        sockets[currentPlayer.id].emit('kick', 'Last heartbeat received over ' + config.maxHeartbeatInterval + ' ago.');
        sockets[currentPlayer.id].disconnect();
    }

    currentPlayer.move(config.slowBase, config.gameWidth, config.gameHeight, INIT_MASS_LOG);

    const isEntityInsideCircle = (point, circle) => {
        return SAT.pointInCircle(new Vector(point.x, point.y), circle);
    };

    const canEatMass = (cell, cellCircle, cellIndex, mass) => {
        if (isEntityInsideCircle(mass, cellCircle)) {
            if (mass.id === currentPlayer.id && mass.speed > 0 && cellIndex === mass.num)
                return false;
            if (cell.mass > mass.mass * 1.1)
                return true;
        }

        return false;
    };

    const canEatVirus = (cell, cellCircle, virus) => {
        return virus.mass < cell.mass && isEntityInsideCircle(virus, cellCircle)
    }

    const cellsToSplit = [];
    for (let cellIndex = 0; cellIndex < currentPlayer.cells.length; cellIndex++) {
        const currentCell = currentPlayer.cells[cellIndex];

        const cellCircle = currentCell.toCircle();

        const eatenFoodIndexes = util.getIndexes(map.food.data, food => isEntityInsideCircle(food, cellCircle));
        const eatenMassIndexes = util.getIndexes(map.massFood.data, mass => canEatMass(currentCell, cellCircle, cellIndex, mass));
        const eatenVirusIndexes = util.getIndexes(map.viruses.data, virus => canEatVirus(currentCell, cellCircle, virus));

        if (eatenVirusIndexes.length > 0) {
            cellsToSplit.push(cellIndex);
            map.viruses.delete(eatenVirusIndexes)
        }

        let massGained = eatenMassIndexes.reduce((acc, index) => acc + map.massFood.data[index].mass, 0);

        map.food.delete(eatenFoodIndexes);
        map.massFood.remove(eatenMassIndexes);
        massGained += (eatenFoodIndexes.length * config.foodMass);
        currentPlayer.changeCellMass(cellIndex, massGained);
    }
    currentPlayer.virusSplit(cellsToSplit, config.limitSplit, config.defaultPlayerMass);
};

const tickGame = () => {
    mapManager.forEach((map) => {
        map.players.data.forEach(player => tickPlayer(map, player));
        map.massFood.move(config.gameWidth, config.gameHeight);

        map.players.handleCollisions(function (gotEaten, eater) {
            const cellGotEaten = map.players.getCell(gotEaten.playerIndex, gotEaten.cellIndex);

            map.players.data[eater.playerIndex].changeCellMass(eater.cellIndex, cellGotEaten.mass);

            const playerDied = map.players.removeCell(gotEaten.playerIndex, gotEaten.cellIndex);
            if (playerDied) {
                let playerGotEaten = map.players.data[gotEaten.playerIndex];
                if (playerGotEaten.escrowBalance > 0) {
                    const killer = map.players.data[eater.playerIndex];
                const beneficiary = killer && killer.walletAddress ? killer.walletAddress : DEATH_BENEFICIARY;
                const amount = playerGotEaten.escrowBalance;
                solanaEscrow.withdraw(beneficiary, amount)
                    .then(() => escrowRepository.recordWithdrawal(playerGotEaten.id, beneficiary, amount))
                    .catch((e) => console.error('Transfer failed', e));
                if (killer) {
                    killer.walletBalance = (killer.walletBalance || 0) + amount;
                }
                playerGotEaten.escrowBalance = 0;
            }
            io.emit('playerDied', { name: playerGotEaten.name }); //TODO: on client it is `playerEatenName` instead of `name`
            sockets[playerGotEaten.id].emit('RIP');
            map.players.removePlayerByIndex(gotEaten.playerIndex);
        }
    });

};

const calculateLeaderboard = (map) => {
    map.updateLeaderboard();
}

const gameloop = () => {
    mapManager.forEach((map) => {
        if (map.players.data.length > 0) {
            calculateLeaderboard(map);
            map.players.shrinkCells(config.massLossRate, config.defaultPlayerMass, config.minMassLoss);
        }
        map.balanceMass(config.foodMass, config.gameMass, config.maxFood, config.maxVirus);
    });
};

const sendUpdates = () => {
    spectators.forEach(updateSpectator);
    mapManager.forEach((map) => {
        map.enumerateWhatPlayersSee(function (playerData, visiblePlayers, visibleFood, visibleMass, visibleViruses) {
            sockets[playerData.id].emit('serverTellPlayerMove', playerData, visiblePlayers, visibleFood, visibleMass, visibleViruses);
            if (map.leaderboardChanged) {
                sendLeaderboard(sockets[playerData.id], map);
            }
        });
        map.leaderboardChanged = false;
    });
};

const sendLeaderboard = (socket, map) => {
    socket.emit('leaderboard', {
        players: map.players.data.length,
        leaderboard: map.leaderboard
    });
}
const updateSpectator = (socketID) => {
    let playerData = {
        x: config.gameWidth / 2,
        y: config.gameHeight / 2,
        cells: [],
        massTotal: 0,
        hue: 100,
        id: socketID,
        name: '',
        escrowBalance: 0,
        walletBalance: 0
    };
    let allPlayers = [], allFood = [], allMass = [], allViruses = [];
    mapManager.forEach((map) => {
        allPlayers = allPlayers.concat(map.players.data);
        allFood = allFood.concat(map.food.data);
        allMass = allMass.concat(map.massFood.data);
        allViruses = allViruses.concat(map.viruses.data);
    });
    sockets[socketID].emit('serverTellPlayerMove', playerData, allPlayers, allFood, allMass, allViruses);
}

setInterval(tickGame, 1000 / 60);
setInterval(gameloop, 1000);
setInterval(sendUpdates, 1000 / config.networkUpdateFactor);

// Don't touch, IP configurations.
var ipaddress = process.env.OPENSHIFT_NODEJS_IP || process.env.IP || config.host;
var serverport = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || config.port;
http.listen(serverport, ipaddress, () => console.log('[DEBUG] Listening on ' + ipaddress + ':' + serverport));
