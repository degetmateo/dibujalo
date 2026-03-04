/**
 * Global game state module.
 */

// map socket.id -> { id, nickname, roomId }
const users = {}; 

/* map roomId -> {
    id, name, isPrivate, password, maxRounds, 
    players: { socketId: { id, nickname, score } },
    painterQueue: [],
    gameState: { status, currentRound, painterId, word, timer, guessedPlayers: [], roundScores: {}, intervalId }
} */
const rooms = {};

module.exports = { users, rooms };
