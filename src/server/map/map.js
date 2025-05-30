"use strict";

const {isVisibleEntity} = require("../lib/entityUtils");

exports.foodUtils = require('./food');
exports.virusUtils = require('./virus');
exports.massFoodUtils = require('./massFood');
exports.playerUtils = require('./player');

exports.Map = class {
    constructor(config) {
        this.food = new exports.foodUtils.FoodManager(config.foodMass, config.foodUniformDisposition);
        this.viruses = new exports.virusUtils.VirusManager(config.virus);
        this.massFood = new exports.massFoodUtils.MassFoodManager();
        this.players = new exports.playerUtils.PlayerManager();
        this.leaderboard = [];
        this.leaderboardChanged = false;
        this.lobbies = new Map();
    }

    balanceMass(foodMass, gameMass, maxFood, maxVirus) {
        const totalMass = this.food.data.length * foodMass + this.players.getTotalMass();

        const massDiff = gameMass - totalMass;
        const foodFreeCapacity = maxFood - this.food.data.length;
        const foodDiff = Math.min(parseInt(massDiff / foodMass), foodFreeCapacity);
        if (foodDiff > 0) {
            console.debug('[DEBUG] Adding ' + foodDiff + ' food');
            this.food.addNew(foodDiff);
        } else if (foodDiff && foodFreeCapacity !== maxFood) {
            console.debug('[DEBUG] Removing ' + -foodDiff + ' food');
            this.food.removeExcess(-foodDiff);
        }
        //console.debug('[DEBUG] Mass rebalanced!');

        const virusesToAdd = maxVirus - this.viruses.data.length;
        if (virusesToAdd > 0) {
            this.viruses.addNew(virusesToAdd);
        }
    }

    enumerateWhatPlayersSee(callback) {
        for (let currentPlayer of this.players.data) {
            var visibleFood = this.food.data.filter(entity => isVisibleEntity(entity, currentPlayer, false));
            var visibleViruses = this.viruses.data.filter(entity => isVisibleEntity(entity, currentPlayer));
            var visibleMass = this.massFood.data.filter(entity => isVisibleEntity(entity, currentPlayer));

            const extractData = (player) => {
                return {
                    x: player.x,
                    y: player.y,
                    cells: player.cells,
                    massTotal: Math.round(player.massTotal),
                    hue: player.hue,
                    id: player.id,
                    name: player.name,
                    escrowBalance: player.escrowBalance,
                    walletBalance: player.walletBalance
                };
            };

            var visiblePlayers = [];
            for (let player of this.players.data) {
                if (player.depositOption !== currentPlayer.depositOption) continue;
                for (let cell of player.cells) {
                    if (isVisibleEntity(cell, currentPlayer)) {
                        visiblePlayers.push(extractData(player));
                        break;
                    }
                }
            }

            callback(extractData(currentPlayer), visiblePlayers, visibleFood, visibleMass, visibleViruses);
        }
    }

    addSocketToLobby(depositOption, socketId) {
        if (!this.lobbies.has(depositOption)) {
            this.lobbies.set(depositOption, new Set());
        }
        this.lobbies.get(depositOption).add(socketId);
    }

    removeSocketFromLobby(depositOption, socketId) {
        if (!this.lobbies.has(depositOption)) return;
        const lobby = this.lobbies.get(depositOption);
        lobby.delete(socketId);
        if (lobby.size === 0) {
            this.lobbies.delete(depositOption);
        }
    }

    getLobbySockets(depositOption) {
        return this.lobbies.get(depositOption) || new Set();
    }

    updateLeaderboard() {
        const topPlayers = this.players.getTopPlayers();
        if (this.leaderboard.length !== topPlayers.length) {
            this.leaderboard = topPlayers;
            this.leaderboardChanged = true;
        } else {
            for (let i = 0; i < this.leaderboard.length; i++) {
                if (this.leaderboard[i].id !== topPlayers[i].id) {
                    this.leaderboard = topPlayers;
                    this.leaderboardChanged = true;
                    return;
                }
            }
        }
        // no change
    }
};

exports.MapManager = class {
    constructor(config) {
        this.config = config;
        this.maps = {};
    }

    getMap(key) {
        if (!this.maps[key]) {
            this.maps[key] = new exports.Map(this.config);
        }
        return this.maps[key];
    }

    deleteMap(key) {
        delete this.maps[key];
    }

    forEach(callback) {
        for (let key in this.maps) {
            callback(this.maps[key], key);
        }
    }
};
