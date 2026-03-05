const { users, rooms } = require('../state');
const { sanitizeWord, getLevenshtein } = require('../utils/words');

const ROUND_TIME = 100;

function generateRoomId() { return Math.random().toString(36).substring(2, 9); }

function getPublicRoomList() {
    return Object.values(rooms).map(r => ({
        id: r.id, name: r.name, isPrivate: r.isPrivate,
        maxRounds: r.maxRounds, playerCount: Object.keys(r.players).length
    }));
}

module.exports = function (io, gameLogic) {
    const {
        broadcastRoomUpdate, sendSystemMessage,
        startGame, onWordChosen, endRound
    } = gameLogic;

    function broadcastRoomList() { io.emit('roomList', getPublicRoomList()); }

    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);
        users[socket.id] = { id: socket.id, nickname: '', roomId: null };

        socket.on('setNickname', (nickname) => {
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
            joinRoomLogic(socket, roomId, true); // true = host just created
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
            joinRoomLogic(socket, r.id, false);
            broadcastRoomList();
        });

        function joinRoomLogic(sock, roomId, isCreated) {
            const r = rooms[roomId];
            const u = users[sock.id];
            sock.join(roomId);
            u.roomId = roomId;
            r.players[sock.id] = { id: sock.id, nickname: u.nickname, score: 0 };
            broadcastRoomUpdate(roomId);
            sendSystemMessage(roomId, `${u.nickname} se ha unido a la sala.`);

            if (isCreated) {
                // Instantly auto-start the match
                startGame(roomId);
            } else {
                // LATE JOINER SYNC
                if (r.gameState.status === 'playing') {
                    // Send them the active round data right now
                    const wordHint = r.gameState.word.replace(/[a-zA-Záéíóúüñ]/g, '_ ').trim();
                    sock.emit('roundStarted', {
                        painterId: r.gameState.painterId,
                        wordHint: wordHint,
                        word: r.gameState.word // Only frontend knows if it's painter
                    });
                } else if (r.gameState.status === 'selecting_word') {
                    // they just see waiting / choosing
                    // no specific action purely for them
                }
            }
        }

        socket.on('leaveRoom', () => {
            handleLeaveRoom(socket);
        });

        function handleLeaveRoom(sock) {
            const u = users[sock.id];
            if (!u || !u.roomId) return;

            const roomId = u.roomId;
            const r = rooms[roomId];
            if (r) {
                delete r.players[sock.id];
                u.roomId = null;
                sock.leave(roomId);

                if (Object.keys(r.players).length === 0) {
                    if (r.gameState.intervalId) clearInterval(r.gameState.intervalId);
                    if (r.gameState.intervalId) clearTimeout(r.gameState.intervalId);
                    delete rooms[roomId];
                } else {
                    sendSystemMessage(roomId, `${u.nickname} ha salido de la sala.`);
                    if (r.gameState.status === 'playing' || r.gameState.status === 'selecting_word') {
                        if (r.gameState.painterId === sock.id) {
                            sendSystemMessage(roomId, `El pintor se desconectó. Terminando ronda...`, 'error');
                            endRound(roomId);
                        } else {
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

        // Removed manual startGame event

        socket.on('wordChosen', (word) => {
            const u = users[socket.id];
            const r = rooms[u?.roomId];
            if (r && r.gameState.painterId === socket.id && r.gameState.status === 'selecting_word') {
                onWordChosen(r.id, word);
            }
        });

        socket.on('chatMessage', (msg) => {
            const u = users[socket.id];
            if (!u || !u.roomId) return;
            const r = rooms[u.roomId];
            if (!r) return;

            if (r.gameState.status === 'playing' && r.gameState.painterId !== socket.id && !r.gameState.guessedPlayers.includes(socket.id)) {
                let guess = sanitizeWord(msg);
                let target = sanitizeWord(r.gameState.word);

                if (guess === target) {
                    r.gameState.guessedPlayers.push(socket.id);
                    let pts = Math.ceil((r.gameState.timer / ROUND_TIME) * 100) * 10;
                    if (pts < 50) pts = 50;

                    if (r.gameState.roundScores[socket.id] === undefined) r.gameState.roundScores[socket.id] = 0;
                    r.gameState.roundScores[socket.id] += pts;
                    r.players[socket.id].score += pts;

                    sendSystemMessage(r.id, `¡${u.nickname} ha acertado la palabra! (+${pts})`, 'success');
                    broadcastRoomUpdate(r.id);

                    let nonPainters = Object.keys(r.players).filter(id => id !== r.gameState.painterId);
                    let allGuessed = nonPainters.every(id => r.gameState.guessedPlayers.includes(id));
                    if (nonPainters.length > 0 && allGuessed) {
                        endRound(r.id);
                    }
                    return;
                } else if (target.length > 3 && guess.length >= 3 && (target.includes(guess) || guess.includes(target) || getLevenshtein(target, guess) <= 2)) {
                    socket.emit('chatMessage', { sender: 'Sistema', message: `¡Estás muy cerca!`, type: 'system' });
                }
            }
            io.to(r.id).emit('chatMessage', { sender: u.nickname, message: msg, type: 'normal' });
        });

        socket.on('draw', (data) => {
            const u = users[socket.id];
            if (!u || !u.roomId) return;
            const r = rooms[u.roomId];
            if (r && r.gameState.painterId === socket.id && r.gameState.status === 'playing') {
                socket.to(r.id).emit('draw', data);
            }
        });

        socket.on('strokeEnd', () => {
            const u = users[socket.id];
            if (!u || !u.roomId) return;
            const r = rooms[u.roomId];
            if (r && r.gameState.painterId === socket.id && r.gameState.status === 'playing') {
                socket.to(r.id).emit('strokeEnd');
            }
        });

        socket.on('undo', () => {
            const u = users[socket.id];
            if (!u || !u.roomId) return;
            const r = rooms[u.roomId];
            if (r && r.gameState.painterId === socket.id && r.gameState.status === 'playing') {
                socket.to(r.id).emit('undo');
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

        socket.on('fill', (data) => {
            const u = users[socket.id];
            if (!u || !u.roomId) return;
            const r = rooms[u.roomId];
            if (r && r.gameState.painterId === socket.id && r.gameState.status === 'playing') {
                socket.to(r.id).emit('fill', data);
            }
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
            handleLeaveRoom(socket);
            delete users[socket.id];
        });
    });
};
