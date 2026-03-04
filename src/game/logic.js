const { users, rooms } = require('../state');
const { getRandomChoices, loadWords } = require('../utils/words');

const ROUND_TIME = 100;

module.exports = function (io) {

    function broadcastRoomUpdate(roomId) {
        const r = rooms[roomId];
        if (!r) return;
        const playersArr = Object.values(r.players);
        io.to(roomId).emit('roomUpdate', {
            id: r.id, name: r.name, maxRounds: r.maxRounds,
            players: playersArr,
            gameState: {
                status: r.gameState.status,
                currentRound: r.gameState.currentRound,
                painterId: r.gameState.painterId,
                guessedPlayers: r.gameState.guessedPlayers
            }
        });
    }

    function sendSystemMessage(roomId, msg, type = 'system') {
        io.to(roomId).emit('chatMessage', { sender: 'Sistema', message: msg, type });
    }

    async function startGame(roomId) {
        await loadWords();
        const r = rooms[roomId];
        if (!r || Object.keys(r.players).length < 1) return; // Allow 1 player to test/start

        Object.values(r.players).forEach(p => p.score = 0);
        r.gameState.currentRound = 1;
        r.painterQueue = Object.keys(r.players);

        startRound(roomId);
    }

    function startRound(roomId) {
        const r = rooms[roomId];
        if (!r) return;

        if (r.painterQueue.length === 0) {
            if (r.gameState.currentRound >= r.maxRounds) {
                return endGame(roomId);
            }
            r.gameState.currentRound++;
            r.painterQueue = Object.keys(r.players);
            // In case no players left to queue (alone and left)
            if (r.painterQueue.length === 0) return endGame(roomId);
        }

        r.gameState.status = 'selecting_word';
        r.gameState.painterId = r.painterQueue.shift();
        r.gameState.word = null;
        r.gameState.guessedPlayers = [];
        r.gameState.roundScores = {};
        Object.keys(r.players).forEach(pid => r.gameState.roundScores[pid] = 0);

        const painter = r.players[r.gameState.painterId];
        if (!painter) {
            return startRound(roomId);
        }

        broadcastRoomUpdate(roomId);
        sendSystemMessage(roomId, `Es el turno de dibujar de ${painter.nickname}.`);

        const choices = getRandomChoices(3);
        io.to(painter.id).emit('wordSelection', choices);

        let autoPickTimer = setTimeout(() => {
            if (r.gameState.status === 'selecting_word') {
                onWordChosen(roomId, choices[0]);
            }
        }, 15000);
        r.gameState.intervalId = autoPickTimer;
    }

    function onWordChosen(roomId, word) {
        const r = rooms[roomId];
        if (!r || r.gameState.status !== 'selecting_word') return;

        clearTimeout(r.gameState.intervalId);

        r.gameState.status = 'playing';
        r.gameState.word = word;
        r.gameState.timer = ROUND_TIME;

        const wordHint = word.replace(/[a-zA-Záéíóúüñ]/g, '_ ').trim();

        io.to(roomId).emit('roundStarted', {
            painterId: r.gameState.painterId,
            wordHint: wordHint,
            word: word
        });

        broadcastRoomUpdate(roomId);

        r.gameState.intervalId = setInterval(() => {
            r.gameState.timer--;
            io.to(roomId).emit('timerUpdate', r.gameState.timer);

            if (r.gameState.timer === Math.floor(ROUND_TIME / 2) && r.gameState.word) {
                let revealedHint = "";
                for (let i = 0; i < word.length; i++) {
                    if (word[i] === ' ') revealedHint += '  ';
                    else if (i === 0 || i === Math.floor(word.length / 2)) revealedHint += word[i] + ' ';
                    else revealedHint += '_ ';
                }
                io.to(roomId).emit('wordHintUpdate', revealedHint.trim());
            }

            if (r.gameState.timer <= 0) {
                endRound(roomId);
            }
        }, 1000);
    }

    function endRound(roomId) {
        const r = rooms[roomId];
        if (!r || r.gameState.status !== 'playing') return;

        clearInterval(r.gameState.intervalId);
        r.gameState.status = 'round_ended';

        let numGuesses = r.gameState.guessedPlayers.length;
        let painterPoints = numGuesses * 100;
        if (painterPoints > 0) {
            if (r.gameState.roundScores[r.gameState.painterId] === undefined) {
                r.gameState.roundScores[r.gameState.painterId] = 0;
            }
            r.gameState.roundScores[r.gameState.painterId] += painterPoints;
            if (r.players[r.gameState.painterId]) {
                r.players[r.gameState.painterId].score += painterPoints;
            }
        }

        const scoreArr = Object.keys(r.gameState.roundScores).map(pid => {
            const p = r.players[pid];
            return {
                id: pid,
                nickname: p ? p.nickname : 'Desconectado',
                points: r.gameState.roundScores[pid], // Round points
                totalScore: p ? p.score : 0 // Total game points
            };
        });

        io.to(roomId).emit('roundEnded', {
            word: r.gameState.word,
            roundScores: scoreArr
        });

        broadcastRoomUpdate(roomId);

        setTimeout(() => {
            startRound(roomId);
        }, 5000);
    }

    function endGame(roomId) {
        const r = rooms[roomId];
        if (!r) return;

        r.gameState.status = 'ended';
        let pList = Object.values(r.players);
        let winner = pList.reduce((max, p) => p.score > max.score ? p : max, { score: -1 });
        if (pList.length === 0) winner = { nickname: "Nadie" };

        io.to(roomId).emit('gameEnded', {
            players: pList,
            winner: winner
        });

        // Endless Loop: Instead of going to waiting, wait 10 seconds and start again if players remain
        setTimeout(() => {
            if (rooms[roomId]) {
                if (Object.keys(rooms[roomId].players).length > 0) {
                    startGame(roomId);
                } else {
                    // Reset to wait if everyone somehow left right at the end
                    rooms[roomId].gameState.status = 'waiting';
                    rooms[roomId].painterQueue = [];
                    Object.values(rooms[roomId].players).forEach(p => p.score = 0);
                    broadcastRoomUpdate(roomId);
                }
            }
        }, 10000);
    }

    return {
        broadcastRoomUpdate,
        sendSystemMessage,
        startGame,
        startRound,
        onWordChosen,
        endRound,
        endGame
    };
};
