const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

// --- GAME DATA ---
const dictionary = [
    "perro", "gato", "elefante", "computadora", "teclado", "raton",
    "monitor", "paraguas", "arcoiris", "hamburguesa", "pizza", "coche",
    "bicicleta", "avion", "tren", "guitarra", "piano", "bateria",
    "reloj", "telefono", "pantalon", "camisa", "sombrero", "gafas",
    "sol", "luna", "estrella", "nube", "montaña", "rio", "oceano",
    "arbol", "flor", "manzana", "platano", "cereza", "sandia",
    "pinguino", "jirafa", "leon", "tigre", "oso", "conejo", "zorro",
    "castillo", "espada", "escudo", "corona", "fantasma", "bruja",
    "calabaza", "murcielago", "arania", "esqueleto", "vampiro",
    "zombie", "extraterrestre", "cohete", "astronauta", "planeta",
    "telescopio", "microscopio", "libelula", "mariposa", "cangrejo",
    "tiburon", "ballena", "delfin", "pulpo", "medusa", "caracol"
];

const ROUND_TIME = 100; // 100 seconds per drawing phase

const users = {}; // map socket.id -> { id, nickname, roomId }
const rooms = {}; /* map roomId -> {
    id, name, isPrivate, password, maxRounds, 
    players: { socketId: { id, nickname, score } },
    painterQueue: [],
    gameState: { status, currentRound, painterId, word, timer, guessedPlayers: [], roundScores: {}, intervalId }
} */

function generateRoomId() { return Math.random().toString(36).substring(2, 9); }
function sanitizeWord(w) { return w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function getPublicRoomList() {
    return Object.values(rooms).map(r => ({
        id: r.id, name: r.name, isPrivate: r.isPrivate,
        maxRounds: r.maxRounds, playerCount: Object.keys(r.players).length
    }));
}
function broadcastRoomList() { io.emit('roomList', getPublicRoomList()); }
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

// --- GAME LOGIC FUNCTIONS ---

function startGame(roomId) {
    const r = rooms[roomId];
    if (!r || Object.keys(r.players).length < 2) return;

    // Reset scores
    Object.values(r.players).forEach(p => p.score = 0);
    r.gameState.currentRound = 1;
    r.painterQueue = Object.keys(r.players); // Initial rotation

    startRound(roomId);
}

function startRound(roomId) {
    const r = rooms[roomId];
    if (!r) return;

    // Check if we need to refill queue & advance round
    if (r.painterQueue.length === 0) {
        if (r.gameState.currentRound >= r.maxRounds) {
            return endGame(roomId);
        }
        r.gameState.currentRound++;
        r.painterQueue = Object.keys(r.players); // Refill queue
    }

    r.gameState.status = 'selecting_word';
    r.gameState.painterId = r.painterQueue.shift(); // take next player
    r.gameState.word = null;
    r.gameState.guessedPlayers = [];
    r.gameState.roundScores = {};
    Object.keys(r.players).forEach(pid => r.gameState.roundScores[pid] = 0);

    const painter = r.players[r.gameState.painterId];
    if (!painter) {
        // If the painter disconnected since we queued them, just skip
        return startRound(roomId);
    }

    broadcastRoomUpdate(roomId);
    sendSystemMessage(roomId, `Es el turno de dibujar de ${painter.nickname}.`);

    // Pick 3 random words
    let choices = [];
    let dictCopy = [...dictionary];
    for (let i = 0; i < 3; i++) {
        const idx = Math.floor(Math.random() * dictCopy.length);
        choices.push(dictCopy.splice(idx, 1)[0]);
    }

    io.to(painter.id).emit('wordSelection', choices);

    // Auto-pick if they take too long (> 15s)
    let autoPickTimer = setTimeout(() => {
        if (r.gameState.status === 'selecting_word') {
            onWordChosen(roomId, choices[0]);
        }
    }, 15000);
    r.gameState.intervalId = autoPickTimer; // temp store timer
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
        word: word // The client will hide it if not painter
    });

    broadcastRoomUpdate(roomId);

    r.gameState.intervalId = setInterval(() => {
        r.gameState.timer--;
        io.to(roomId).emit('timerUpdate', r.gameState.timer);

        // Show a hint at half time
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
    r.gameState.status = 'round_ended'; // transition status

    // Calculate painter points (100 pts per guess, max 500)
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

    // Prepare arrays for client
    const scoreArr = Object.keys(r.gameState.roundScores).map(pid => {
        const p = r.players[pid];
        return { nickname: p ? p.nickname : 'Desconectado', points: r.gameState.roundScores[pid] };
    });

    io.to(roomId).emit('roundEnded', {
        word: r.gameState.word,
        roundScores: scoreArr
    });

    broadcastRoomUpdate(roomId);

    // Wait 5 seconds, then next round
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

    // Reset to waiting after a while
    setTimeout(() => {
        if (rooms[roomId]) {
            rooms[roomId].gameState.status = 'waiting';
            rooms[roomId].painterQueue = []; // reset
            Object.values(rooms[roomId].players).forEach(p => p.score = 0);
            broadcastRoomUpdate(roomId);
        }
    }, 15000);
}


// --- SOCKET ENDPOINTS ---

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    users[socket.id] = { id: socket.id, nickname: '', roomId: null };

    socket.on('setNickname', (nickname) => {
        // Validate uniqueness in lobby (simple check)
        const inUse = Object.values(users).some(u => u.nickname.toLowerCase() === nickname.toLowerCase());
        if (inUse) {
            socket.emit('nicknameResponse', { success: false, message: 'El apodo ya está en uso' });
        } else {
            users[socket.id].nickname = nickname;
            socket.emit('nicknameResponse', { success: true });
            socket.emit('roomList', getPublicRoomList());
        }
    });

    socket.on('createRoom', (data) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            id: roomId,
            name: data.name || roomId,
            isPrivate: data.isPrivate,
            password: data.password || '',
            maxRounds: data.maxRounds || 3,
            players: {},
            painterQueue: [],
            gameState: { status: 'waiting', currentRound: 0, painterId: null, word: null, timer: 0, guessedPlayers: [], roundScores: {} }
        };
        socket.emit('joinRoomResponse', { success: true, roomId });
        joinRoomLogic(socket, roomId);
        broadcastRoomList();
    });

    socket.on('joinRoom', (data) => {
        const r = rooms[data.roomId];
        if (!r) {
            return socket.emit('joinRoomResponse', { success: false, message: 'Sala no encontrada' });
        }
        if (r.isPrivate && r.password !== data.password) {
            return socket.emit('joinRoomResponse', { success: false, message: 'Contraseña incorrecta' });
        }
        socket.emit('joinRoomResponse', { success: true, roomId: r.id });
        joinRoomLogic(socket, r.id);
        broadcastRoomList(); // Update player count in lobby
    });

    function joinRoomLogic(socket, roomId) {
        const r = rooms[roomId];
        const u = users[socket.id];

        socket.join(roomId);
        u.roomId = roomId;
        r.players[socket.id] = { id: socket.id, nickname: u.nickname, score: 0 };

        broadcastRoomUpdate(roomId);
        sendSystemMessage(roomId, `${u.nickname} se ha unido a la sala.`);
    }

    socket.on('leaveRoom', () => {
        handleLeaveRoom(socket);
    });

    function handleLeaveRoom(socket) {
        const u = users[socket.id];
        if (!u || !u.roomId) return;

        const roomId = u.roomId;
        const r = rooms[roomId];
        if (r) {
            delete r.players[socket.id];
            u.roomId = null;
            socket.leave(roomId);

            // If room is empty, delete it
            if (Object.keys(r.players).length === 0) {
                if (r.gameState.intervalId) clearInterval(r.gameState.intervalId);
                if (r.gameState.intervalId) clearTimeout(r.gameState.intervalId);
                delete rooms[roomId];
            } else {
                sendSystemMessage(roomId, `${u.nickname} ha salido de la sala.`);

                // If the painter left!
                if (r.gameState.status === 'playing' || r.gameState.status === 'selecting_word') {
                    if (r.gameState.painterId === socket.id) {
                        sendSystemMessage(roomId, `El pintor se desconectó. Terminando ronda...`, 'error');
                        endRound(roomId);
                    } else {
                        // Check if all remaining players have guessed
                        let nonPainters = Object.keys(r.players).filter(id => id !== r.gameState.painterId);
                        let allGuessed = nonPainters.every(id => r.gameState.guessedPlayers.includes(id));
                        if (nonPainters.length > 0 && allGuessed) {
                            endRound(roomId);
                        }
                    }
                }
                broadcastRoomUpdate(roomId);
            }
            broadcastRoomList();
        }
    }

    // GAME FLOW
    socket.on('startGame', () => {
        const r = rooms[users[socket.id].roomId];
        if (r && r.gameState.status === 'waiting') {
            startGame(r.id);
        }
    });

    socket.on('wordChosen', (word) => {
        const u = users[socket.id];
        const r = rooms[u.roomId];
        if (r && r.gameState.painterId === socket.id && r.gameState.status === 'selecting_word') {
            onWordChosen(r.id, word);
        }
    });

    // CHAT & GUESSING
    socket.on('chatMessage', (msg) => {
        const u = users[socket.id];
        if (!u || !u.roomId) return;
        const r = rooms[u.roomId];
        if (!r) return;

        // Is it a guess during play?
        if (r.gameState.status === 'playing' && r.gameState.painterId !== socket.id && !r.gameState.guessedPlayers.includes(socket.id)) {
            let guess = sanitizeWord(msg);
            let target = sanitizeWord(r.gameState.word);

            if (guess === target) {
                // Correct guess!
                r.gameState.guessedPlayers.push(socket.id);

                // Calculate points: 10 * remaining seconds (up to 1000)
                let pts = Math.ceil((r.gameState.timer / ROUND_TIME) * 100) * 10;
                if (pts < 50) pts = 50;

                if (r.gameState.roundScores[socket.id] === undefined) r.gameState.roundScores[socket.id] = 0;
                r.gameState.roundScores[socket.id] += pts;
                r.players[socket.id].score += pts;

                sendSystemMessage(r.id, `¡${u.nickname} ha acertado la palabra! (+${pts})`, 'success');
                broadcastRoomUpdate(r.id);

                // Check if everyone guessed
                let nonPainters = Object.keys(r.players).filter(id => id !== r.gameState.painterId);
                let allGuessed = nonPainters.every(id => r.gameState.guessedPlayers.includes(id));
                if (nonPainters.length > 0 && allGuessed) {
                    endRound(r.id);
                }
                return; // Do not broadcast the word
            } else if (target.length > 3 && guess.length >= 3 && (target.includes(guess) || guess.includes(target) || getLevenshtein(target, guess) <= 2)) {
                // Close! (send only to the sender)
                socket.emit('chatMessage', { sender: 'Sistema', message: `¡Estás muy cerca!`, type: 'system' });
            }
        }

        // Normal message
        io.to(r.id).emit('chatMessage', { sender: u.nickname, message: msg, type: 'normal' });
    });

    // CANVAS DRAWING (Authorized)
    socket.on('draw', (data) => {
        const u = users[socket.id];
        if (!u || !u.roomId) return;
        const r = rooms[u.roomId];
        if (r && r.gameState.painterId === socket.id && r.gameState.status === 'playing') {
            // Forward back to others in room
            socket.to(r.id).emit('draw', data);
        }
    });

    socket.on('clear', () => {
        const u = users[socket.id];
        if (!u || !u.roomId) return;
        const r = rooms[u.roomId];
        if (r && r.gameState.painterId === socket.id && r.gameState.status === 'playing') {
            socket.to(r.id).emit('clear');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        handleLeaveRoom(socket);
        delete users[socket.id];
    });
});

// Levenshtein distance roughly for "Estás cerca" validation
function getLevenshtein(a, b) {
    if (!a || !b) return (a || b).length;
    let m = [];
    for (let i = 0; i <= b.length; i++) {
        m[i] = [i]; if (i === 0) continue;
        for (let j = 0; j <= a.length; j++) {
            m[0][j] = j; if (j === 0) continue;
            m[i][j] = b.charAt(i - 1) === a.charAt(j - 1) ? m[i - 1][j - 1] : Math.min(
                m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1
            );
        }
    }
    return m[b.length][a.length];
}


server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
