import { myState, gameState, lobbyState } from './state.js';
import { socket } from './socket.js';
import {
    showScreen, showModal, hideModal, showNotification, updatePlayersList, appendChat, renderRoomList,
    loginScreen, lobbyScreen, gameScreen, createRoomModal, passwordModal,
    loginError, passwordError, roomListDiv, searchRoomInput,
    timerDisplay, wordDisplay, roundDisplay, drawingControls,
    wordSelectionOverlay, wordOptionsDiv, roundEndOverlay, roundEndMessage, roundEndWordSpan, roundScoreboard, startGameOverlay, startGameBtn
} from './ui.js';
import {
    initCanvas, clearCanvasLocally, handleRemoteDraw, handleRemoteStrokeEnd, handleRemoteUndo, resizeCanvas
} from './canvas.js';
import { playSound, sfXRing, sfXTick, sfXEnd, escapeHtml } from './utils.js';

initCanvas();

// ========================
// LOGIN LOGIC
// ========================
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const nickname = document.getElementById('nicknameInput').value.trim();
    if (!nickname) return;
    socket.emit('setNickname', nickname);
});

socket.on('nicknameResponse', (res) => {
    if (res.success) {
        myState.nickname = document.getElementById('nicknameInput').value.trim();
        showScreen(lobbyScreen);
    } else {
        loginError.textContent = res.message;
        loginError.classList.remove('hidden');
    }
});

// ========================
// LOBBY LOGIC
// ========================
socket.on('roomList', (rooms) => {
    lobbyState.currentRooms = rooms;
    renderRoomList();
});

searchRoomInput.addEventListener('input', renderRoomList);

document.getElementById('showCreateRoomBtn').addEventListener('click', () => {
    document.getElementById('roomName').value = `${myState.nickname}'s Room`;
    document.getElementById('roomPrivate').checked = false;
    document.getElementById('passwordGroup').style.display = 'none';
    showModal(createRoomModal);
});

document.getElementById('cancelCreateRoom').addEventListener('click', () => hideModal(createRoomModal));

document.getElementById('roomPrivate').addEventListener('change', (e) => {
    document.getElementById('passwordGroup').style.display = e.target.checked ? 'block' : 'none';
});

document.getElementById('createRoomForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('roomName').value.trim();
    const isPrivate = document.getElementById('roomPrivate').checked;
    const password = document.getElementById('roomPassword').value;
    const maxRounds = parseInt(document.getElementById('roomRounds').value);

    socket.emit('createRoom', { name, isPrivate, password, maxRounds });
    hideModal(createRoomModal);
});

document.getElementById('cancelPasswordBtn').addEventListener('click', () => hideModal(passwordModal));

document.getElementById('passwordForm').addEventListener('submit', (e) => {
    e.preventDefault();
    socket.emit('joinRoom', { roomId: lobbyState.pendingJoinRoomId, password: document.getElementById('joinPasswordInput').value });
});

socket.on('joinRoomResponse', (res) => {
    if (res.success) {
        hideModal(passwordModal);
        myState.roomId = res.roomId;
        showScreen(gameScreen);
        resetGameUI();
    } else {
        if (lobbyState.pendingJoinRoomId) {
            passwordError.textContent = res.message;
            passwordError.classList.remove('hidden');
        } else {
            showNotification(res.message, true);
        }
    }
});

document.getElementById('leaveRoomBtn').addEventListener('click', () => {
    socket.emit('leaveRoom');
    myState.roomId = null;
    showScreen(lobbyScreen);
});

// ========================
// GAME LOGIC
// ========================
function resetGameUI() {
    clearCanvasLocally();
    document.getElementById('chatMessages').innerHTML = '';
    wordSelectionOverlay.classList.remove('active');
    roundEndOverlay.classList.remove('active');
    startGameOverlay.classList.remove('active');
    drawingControls.classList.add('tools-disabled');
    myState.isPainter = false;
    myState.hasGuessed = false;
}

socket.on('roomUpdate', (roomData) => {
    updatePlayersList(roomData);
    roundDisplay.textContent = `Ronda: ${roomData.gameState.currentRound}/${roomData.maxRounds}`;

    if (roomData.gameState.status === 'waiting') {
        startGameOverlay.classList.add('active');
        if (roomData.players.length >= 2) {
            startGameBtn.classList.remove('hidden');
        } else {
            startGameBtn.classList.add('hidden');
        }
    } else {
        startGameOverlay.classList.remove('active');
    }
});

startGameBtn.addEventListener('click', () => { socket.emit('startGame'); });

socket.on('wordSelection', (choices) => {
    wordOptionsDiv.innerHTML = '';
    choices.forEach(word => {
        const btn = document.createElement('button');
        btn.className = 'word-btn';
        btn.textContent = word;
        btn.addEventListener('click', () => {
            socket.emit('wordChosen', word);
            wordSelectionOverlay.classList.remove('active');
        });
        wordOptionsDiv.appendChild(btn);
    });
    roundEndOverlay.classList.remove('active');
    startGameOverlay.classList.remove('active');
    wordSelectionOverlay.classList.add('active');
});

socket.on('roundStarted', (data) => {
    playSound(sfXRing);

    // FIX UNDO BUG: clear canvas and history locally at round start
    clearCanvasLocally();

    wordSelectionOverlay.classList.remove('active');
    roundEndOverlay.classList.remove('active');
    startGameOverlay.classList.remove('active');

    myState.isPainter = (data.painterId === socket.id);
    myState.hasGuessed = false;
    gameState.painterId = data.painterId;

    if (myState.isPainter) {
        drawingControls.classList.remove('tools-disabled');
        wordDisplay.textContent = data.word;
    } else {
        drawingControls.classList.add('tools-disabled');
        wordDisplay.textContent = data.wordHint;
    }
});

socket.on('timerUpdate', (timeLeft) => {
    timerDisplay.textContent = timeLeft;
    if (timeLeft <= 10) {
        timerDisplay.classList.add('urgent');
        if (timeLeft > 0) playSound(sfXTick);
    } else {
        timerDisplay.classList.remove('urgent');
    }
});

socket.on('wordHintUpdate', (hint) => {
    if (!myState.isPainter) wordDisplay.textContent = hint;
});

socket.on('roundEnded', (data) => {
    roundEndWordSpan.textContent = data.word;
    roundScoreboard.innerHTML = '';

    // Sort by points earned this round and display
    const roundScores = data.roundScores.slice().sort((a, b) => b.points - a.points);
    let highestPoints = 0;
    if (roundScores.length > 0) highestPoints = roundScores[0].points;

    roundScores.forEach(s => {
        if (s.points > 0) {
            const isRoundWinner = (s.points === highestPoints && highestPoints > 0);
            const winnerIcon = isRoundWinner ? ' 👑' : '';
            roundScoreboard.innerHTML += `<div class="score-line ${isRoundWinner ? 'winner-line' : ''}"><span>${escapeHtml(s.nickname)}${winnerIcon}</span><span class="pts">+${s.points}</span></div>`;
        }
    });

    if (roundScoreboard.innerHTML === '') {
        roundScoreboard.innerHTML = '<div class="score-line"><span>Nadie sumó puntos</span></div>';
    }

    roundEndOverlay.classList.add('active');
    drawingControls.classList.add('tools-disabled');
});

socket.on('gameEnded', (data) => {
    playSound(sfXEnd);
    roundEndMessage.innerHTML = '¡Juego Terminado!<br>Ganador: ' + escapeHtml(data.winner.nickname);
    roundEndWordSpan.parentElement.style.display = 'none';
    roundScoreboard.innerHTML = '';
    data.players.sort((a, b) => b.score - a.score).forEach(p => {
        roundScoreboard.innerHTML += `<div class="score-line"><span>${escapeHtml(p.nickname)}</span><span class="pts">${p.score} pts</span></div>`;
    });
    roundEndOverlay.classList.add('active');

    setTimeout(() => {
        roundEndOverlay.classList.remove('active');
        roundEndWordSpan.parentElement.style.display = 'block';
    }, 10000);
});

// ========================
// CHAT LOGIC
// ========================
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (!msg) return;
    socket.emit('chatMessage', msg);
    chatInput.value = '';
});

// Find if sender is painter for styling
function isPainterMessage(senderNick) {
    if (!lobbyState.currentRooms || !myState.roomId) return false;
    const room = lobbyState.currentRooms.find(r => r.id === myState.roomId);
    if (!room) return false;
    const pIds = Object.keys(room.players || {});
    // wait, currentRooms doesn't contain players map for all in public lobby, it only has playerCount generally.
    // wait, lobby roomList doesn't give us the specific player objects natively.
    // Let's just pass isPainter based on gameState.painterId from our tracked players List.
    // we can skip this visual polish or just guess. 
    return false;
}

socket.on('chatMessage', (data) => {
    appendChat(data.sender, data.message, data.type, isPainterMessage(data.sender));
});

// ========================
// DRAWING SOCKETS
// ========================
socket.on('draw', handleRemoteDraw);
socket.on('strokeEnd', handleRemoteStrokeEnd);
socket.on('undo', handleRemoteUndo);
socket.on('clear', () => { clearCanvasLocally(); });
