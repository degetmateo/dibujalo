const socket = io();

// STATE
let myState = {
    nickname: '',
    roomId: null,
    isPainter: false,
    hasGuessed: false
};
let gameState = {
    status: 'waiting',
    painterId: null,
    wordLength: 0
};

// DOM ELEMENTS
const loginScreen = document.getElementById('loginScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');

const createRoomModal = document.getElementById('createRoomModal');
const passwordModal = document.getElementById('passwordModal');

const loginForm = document.getElementById('loginForm');
const nicknameInput = document.getElementById('nicknameInput');
const loginError = document.getElementById('loginError');

const roomListDiv = document.getElementById('roomList');
const searchRoomInput = document.getElementById('searchRoomInput');
const showCreateRoomBtn = document.getElementById('showCreateRoomBtn');
const cancelCreateRoom = document.getElementById('cancelCreateRoom');
const createRoomForm = document.getElementById('createRoomForm');
const roomPrivateCheckbox = document.getElementById('roomPrivate');
const passwordGroup = document.getElementById('passwordGroup');

let pendingJoinRoomId = null;
const passwordForm = document.getElementById('passwordForm');
const joinPasswordInput = document.getElementById('joinPasswordInput');
const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
const passwordError = document.getElementById('passwordError');

const playersListUl = document.getElementById('playersList');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');

const timerDisplay = document.getElementById('timerDisplay');
const wordDisplay = document.getElementById('wordDisplay');
const roundDisplay = document.getElementById('roundDisplay');
const drawingControls = document.getElementById('drawingControls');

const wordSelectionOverlay = document.getElementById('wordSelectionOverlay');
const wordOptionsDiv = document.getElementById('wordOptionsDiv');
const roundEndOverlay = document.getElementById('roundEndOverlay');
const roundEndMessage = document.getElementById('roundEndMessage');
const roundEndWordSpan = document.getElementById('roundEndWord');
const roundScoreboard = document.getElementById('roundScoreboard');
const startGameOverlay = document.getElementById('startGameOverlay');
const startGameBtn = document.getElementById('startGameBtn');

const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const sizePicker = document.getElementById('sizePicker');
const clearBtn = document.getElementById('clearBtn');
const undoBtn = document.getElementById('undoBtn');
const toolPencil = document.getElementById('toolPencil');
const toolEraser = document.getElementById('toolEraser');

const chatMessagesDiv = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

// AUDIO ELEMENTS
const sfXRing = new Audio('/sounds/start.mp3');
const sfXJoin = new Audio('/sounds/join.mp3');
const sfXLeave = new Audio('/sounds/leave.mp3');
const sfXCorrect = new Audio('/sounds/correct.mp3');
const sfXCorrectOther = new Audio('/sounds/correct_other.mp3');
const sfXTick = new Audio('/sounds/tick.mp3');
const sfXEnd = new Audio('/sounds/end.mp3');

function playSound(audio) {
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(e => console.log('Audio error:', e));
}

// UI NAVIGATION
function showScreen(screenEl) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('view-active'));
    screenEl.classList.add('view-active');
    if (screenEl === gameScreen) {
        setTimeout(resizeCanvas, 100);
    }
}

function showModal(modalEl) { modalEl.classList.add('active'); }
function hideModal(modalEl) { modalEl.classList.remove('active'); }
function showNotification(msg, isError = false) {
    const notif = document.createElement('div');
    notif.className = `notification ${isError ? 'error' : ''}`;
    notif.textContent = msg;
    document.getElementById('notificationArea').appendChild(notif);
    setTimeout(() => { notif.remove(); }, 3000);
}

// LOGIN LOGIC
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nickname = nicknameInput.value.trim();
    if (!nickname) return;
    socket.emit('setNickname', nickname);
});

socket.on('nicknameResponse', (res) => {
    if (res.success) {
        myState.nickname = nicknameInput.value.trim();
        showScreen(lobbyScreen);
    } else {
        loginError.textContent = res.message;
        loginError.classList.remove('hidden');
    }
});

// LOBBY LOGIC
let currentRooms = [];

socket.on('roomList', (rooms) => {
    currentRooms = rooms;
    renderRoomList();
});

searchRoomInput.addEventListener('input', renderRoomList);

function renderRoomList() {
    roomListDiv.innerHTML = '';
    const filter = searchRoomInput.value.toLowerCase();
    const filtered = currentRooms.filter(r => r.name.toLowerCase().includes(filter));

    if (filtered.length === 0) {
        roomListDiv.innerHTML = '<div class="empty-lobby">No se encontraron salas. ¡Crea una!</div>';
        return;
    }

    filtered.forEach(room => {
        const card = document.createElement('div');
        card.className = 'room-card';
        card.innerHTML = `
            <div class="room-card-header">
                <h3>${escapeHtml(room.name)}</h3>
                ${room.isPrivate ? '<span class="room-badge private">🔒 Privada</span>' : '<span class="room-badge">Pública</span>'}
            </div>
            <div class="room-info">
                <span>Jugadores: ${room.playerCount}</span>
                <span>Rondas: ${room.maxRounds}</span>
            </div>
        `;
        card.addEventListener('click', () => {
            if (room.isPrivate) {
                pendingJoinRoomId = room.id;
                joinPasswordInput.value = '';
                passwordError.classList.add('hidden');
                showModal(passwordModal);
                joinPasswordInput.focus();
            } else {
                joinRoom(room.id);
            }
        });
        roomListDiv.appendChild(card);
    });
}

// Create Room Form
showCreateRoomBtn.addEventListener('click', () => {
    document.getElementById('roomName').value = `${myState.nickname}'s Room`;
    roomPrivateCheckbox.checked = false;
    passwordGroup.style.display = 'none';
    showModal(createRoomModal);
});
cancelCreateRoom.addEventListener('click', () => hideModal(createRoomModal));

roomPrivateCheckbox.addEventListener('change', (e) => {
    passwordGroup.style.display = e.target.checked ? 'block' : 'none';
});

createRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('roomName').value.trim();
    const isPrivate = roomPrivateCheckbox.checked;
    const password = document.getElementById('roomPassword').value;
    const maxRounds = parseInt(document.getElementById('roomRounds').value);

    socket.emit('createRoom', { name, isPrivate, password, maxRounds });
    hideModal(createRoomModal);
});

// Join Room Password Form
cancelPasswordBtn.addEventListener('click', () => hideModal(passwordModal));
passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    joinRoom(pendingJoinRoomId, joinPasswordInput.value);
});

function joinRoom(id, password = null) {
    socket.emit('joinRoom', { roomId: id, password });
}

socket.on('joinRoomResponse', (res) => {
    if (res.success) {
        hideModal(passwordModal);
        myState.roomId = res.roomId;
        showScreen(gameScreen);
        resetGameUI();
    } else {
        if (pendingJoinRoomId) { // It was from password modal
            passwordError.textContent = res.message;
            passwordError.classList.remove('hidden');
        } else {
            showNotification(res.message, true);
        }
    }
});

leaveRoomBtn.addEventListener('click', () => {
    socket.emit('leaveRoom');
    myState.roomId = null;
    showScreen(lobbyScreen);
});

// GAME LOGIC

function resetGameUI() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    chatMessagesDiv.innerHTML = '';
    wordSelectionOverlay.classList.remove('active');
    roundEndOverlay.classList.remove('active');
    startGameOverlay.classList.remove('active');
    drawingControls.classList.add('tools-disabled');
    myState.isPainter = false;
    myState.hasGuessed = false;
}

socket.on('roomUpdate', (roomData) => {
    // Update players list
    playersListUl.innerHTML = '';
    roomData.players.forEach(p => {
        const li = document.createElement('li');
        li.className = `player-item ${p.id === socket.id ? 'is-me' : ''} ${p.id === roomData.gameState.painterId ? 'is-painter' : ''} ${roomData.gameState.guessedPlayers.includes(p.id) ? 'has-guessed' : ''}`;

        let icon = '';
        if (p.id === roomData.gameState.painterId) icon = '🖌️';
        else if (roomData.gameState.guessedPlayers.includes(p.id)) icon = '✔️';

        li.innerHTML = `
            <div class="player-info">
                <span class="player-name">${escapeHtml(p.nickname)} <span class="status-icon">${icon}</span></span>
                <span class="player-score">${p.score || 0} pts</span>
            </div>
        `;
        playersListUl.appendChild(li);
    });

    roundDisplay.textContent = `Ronda: ${roomData.gameState.currentRound}/${roomData.maxRounds}`;

    // Manage waiting overlay
    if (roomData.gameState.status === 'waiting') {
        startGameOverlay.classList.add('active');
        // If has 2 or more players, let them start
        if (roomData.players.length >= 2) {
            startGameBtn.classList.remove('hidden');
        } else {
            startGameBtn.classList.add('hidden');
        }
    } else {
        startGameOverlay.classList.remove('active');
    }
});

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

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

    // Hide other overlays so the word selection is visible
    roundEndOverlay.classList.remove('active');
    startGameOverlay.classList.remove('active');

    wordSelectionOverlay.classList.add('active');
});

socket.on('roundStarted', (data) => {
    playSound(sfXRing);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    wordSelectionOverlay.classList.remove('active');
    roundEndOverlay.classList.remove('active');
    startGameOverlay.classList.remove('active');

    myState.isPainter = (data.painterId === socket.id);
    myState.hasGuessed = false;
    gameState.painterId = data.painterId;

    if (myState.isPainter) {
        drawingControls.classList.remove('tools-disabled');
        wordDisplay.textContent = data.word; // Show actual word to painter
    } else {
        drawingControls.classList.add('tools-disabled');
        // Create blank display _ _ _
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
    if (!myState.isPainter) {
        wordDisplay.textContent = hint;
    }
});

socket.on('roundEnded', (data) => {
    roundEndWordSpan.textContent = data.word;
    roundScoreboard.innerHTML = '';
    // display sorted by round points earned
    data.roundScores.sort((a, b) => b.points - a.points).forEach(s => {
        if (s.points > 0) {
            roundScoreboard.innerHTML += `<div class="score-line"><span>${escapeHtml(s.nickname)}</span><span class="pts">+${s.points}</span></div>`;
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
    roundEndWordSpan.parentElement.style.display = 'none'; // hide word span
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


// CHAT LOGIC
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = chatInput.value.trim();
    if (!msg) return;

    socket.emit('chatMessage', msg);
    chatInput.value = '';
});

socket.on('chatMessage', (data) => {
    appendChat(data.sender, data.message, data.type);
});

function appendChat(sender, msg, type = 'normal') {
    const div = document.createElement('div');
    div.className = `chat-msg ${type}`;
    if (type === 'normal') {
        const isPainter = (gameState.painterId === Object.values(currentRooms.find(r => r.id === myState.roomId)?.players || []).find(p => p.nickname === sender)?.id);
        if (isPainter) div.classList.add('is-painter-msg');
        div.innerHTML = `<span class="sender">${escapeHtml(sender)}:</span><span>${escapeHtml(msg)}</span>`;
    } else {
        div.textContent = msg;
        if (type === 'success') {
            // Check if it's me
            if (msg.includes(myState.nickname)) {
                playSound(sfXCorrect);
            } else {
                playSound(sfXCorrectOther);
            }
        }
        else if (type === 'system' && msg.includes('se ha unido')) playSound(sfXJoin);
        else if (type === 'system' && msg.includes('ha salido')) playSound(sfXLeave);
    }
    chatMessagesDiv.appendChild(div);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}

// CANVAS & DRAWING LOGIC

function resizeCanvas() {
    const parent = canvas.parentElement;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
    if (canvas.width > 0 && canvas.height > 0) tempCanvas.getContext('2d').drawImage(canvas, 0, 0);

    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;

    if (tempCanvas.width > 0 && tempCanvas.height > 0) ctx.drawImage(tempCanvas, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
}
window.addEventListener('resize', resizeCanvas);

// Tool state
let currentTool = 'pencil';
toolPencil.addEventListener('click', () => { currentTool = 'pencil'; updateToolUI(); });
toolEraser.addEventListener('click', () => { currentTool = 'eraser'; updateToolUI(); });
function updateToolUI() {
    toolPencil.classList.toggle('active', currentTool === 'pencil');
    toolEraser.classList.toggle('active', currentTool === 'eraser');
}

let isDrawing = false;
let current = { x: 0, y: 0, color: colorPicker.value, size: sizePicker.value };

colorPicker.addEventListener('input', (e) => current.color = e.target.value);
sizePicker.addEventListener('input', (e) => current.size = e.target.value);

let strokesHistory = [];
let currentStroke = [];

function redrawHistory() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesHistory.forEach(stroke => {
        stroke.forEach(line => {
            drawLine(line.x0, line.y0, line.x1, line.y1, line.color, line.size, line.isEraser, false);
        });
    });
}

clearBtn.addEventListener('click', () => {
    if (!myState.isPainter) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesHistory = [];
    socket.emit('clear');
});

undoBtn.addEventListener('click', () => {
    if (!myState.isPainter) return;
    if (strokesHistory.length > 0) {
        strokesHistory.pop();
        redrawHistory();
        socket.emit('undo');
    }
});

function drawLine(x0, y0, x1, y1, color, size, isEraser, emit) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);

    if (isEraser) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = color;
    }

    ctx.lineWidth = size;
    ctx.stroke();
    ctx.closePath();
    ctx.closePath();
    ctx.globalCompositeOperation = 'source-over'; // reset

    // Always store absolute coords if we are drawing locally
    if (emit && myState.isPainter) {
        currentStroke.push({
            x0: x0, y0: y0, x1: x1, y1: y1,
            color: color, size: size, isEraser: isEraser
        });

        socket.emit('draw', {
            x0: x0 / canvas.width, y0: y0 / canvas.height,
            x1: x1 / canvas.width, y1: y1 / canvas.height,
            color: color, size: size, isEraser: isEraser
        });
    }
}

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
        return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onDrawStart(e) {
    if (!myState.isPainter) return;
    isDrawing = true;
    currentStroke = [];
    const pos = getPos(e);
    current.x = pos.x; current.y = pos.y;
    // Draw a dot when clicking
    drawLine(current.x, current.y, current.x + 0.1, current.y + 0.1, current.color, current.size, currentTool === 'eraser', true);
}

function onDrawEnd(e) {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentStroke.length > 0) {
        strokesHistory.push([...currentStroke]);
        if (myState.isPainter) {
            socket.emit('strokeEnd');
        }
    }
}

function onDrawMove(e) {
    if (!isDrawing || !myState.isPainter) return;
    const pos = getPos(e);
    drawLine(current.x, current.y, pos.x, pos.y, current.color, current.size, currentTool === 'eraser', true);
    current.x = pos.x; current.y = pos.y;
}

canvas.addEventListener('mousedown', onDrawStart);
canvas.addEventListener('mouseup', onDrawEnd);
canvas.addEventListener('mouseout', onDrawEnd);
canvas.addEventListener('mousemove', onDrawMove);

canvas.addEventListener('touchstart', onDrawStart, { passive: true });
canvas.addEventListener('touchend', onDrawEnd, { passive: true });
canvas.addEventListener('touchmove', onDrawMove, { passive: true });

// Listen for remote draw events
socket.on('draw', (data) => {
    // Only remote lines are drawn, and pushed to history for spectators so they can clear/undo them when events arrive
    const ax0 = data.x0 * canvas.width;
    const ay0 = data.y0 * canvas.height;
    const ax1 = data.x1 * canvas.width;
    const ay1 = data.y1 * canvas.height;

    if (!myState.isPainter) {
        currentStroke.push({
            x0: ax0, y0: ay0, x1: ax1, y1: ay1,
            color: data.color, size: data.size, isEraser: data.isEraser
        });
    }

    // Try to group remote strokes simply (this is basic sync logic for spectators)
    drawLine(ax0, ay0, ax1, ay1, data.color, data.size, data.isEraser, false);
});

socket.on('strokeEnd', () => {
    if (!myState.isPainter) {
        strokesHistory.push([...currentStroke]);
        currentStroke = [];
    }
});

socket.on('undo', () => {
    if (!myState.isPainter) {
        if (strokesHistory.length > 0) strokesHistory.pop();
        redrawHistory();
    }
});

socket.on('clear', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesHistory = [];
});

// Utils
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
