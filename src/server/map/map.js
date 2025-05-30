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
        this.leaderboards = {};
        this.leaderboardChanged = {};
        this.lobbyPlayerCount = {};
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
                    walletBalance: player.walletBalance,
                    depositOption: player.depositOption
                };
            }

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

    calculateLeaderboards() {
        const topPlayers = this.players.getTopPlayersByLobby();

        const playerCounts = {};
        for (const player of this.players.data) {
            if (!playerCounts[player.depositOption]) playerCounts[player.depositOption] = 0;
            playerCounts[player.depositOption]++;
        }
        this.lobbyPlayerCount = playerCounts;

        const existingLobbies = new Set(Object.keys(this.leaderboards));
        for (const lobby in topPlayers) {
            existingLobbies.delete(lobby);
            const top = topPlayers[lobby];
            const current = this.leaderboards[lobby] || [];
            let changed = current.length !== top.length;
            if (!changed) {
                for (let i = 0; i < top.length; i++) {
                    if (current[i].id !== top[i].id) { changed = true; break; }
                }
            }
            if (changed) {
                this.leaderboards[lobby] = top;
                this.leaderboardChanged[lobby] = true;
            }
        }
        // remove leaderboards for empty lobbies
        for (const lobby of existingLobbies) {
            delete this.leaderboards[lobby];
            delete this.leaderboardChanged[lobby];
            delete this.lobbyPlayerCount[lobby];
        }
    }

    hasLeaderboardChanged(lobby) {
        return !!this.leaderboardChanged[lobby];
    }

    getLeaderboard(lobby) {
        return this.leaderboards[lobby] || [];
    }

    getLobbyPlayerCount(lobby) {
        return this.lobbyPlayerCount[lobby] || 0;
    }

    resetLeaderboardChanges() {
        this.leaderboardChanged = {};
    }
}
