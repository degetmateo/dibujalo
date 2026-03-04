import { escapeHtml, playSound, sfXCorrect, sfXCorrectOther, sfXJoin, sfXLeave } from './utils.js';
import { myState, gameState, lobbyState } from './state.js';
import { socket } from './socket.js';
import { resizeCanvas } from './canvas.js';

// DOM ELEMENTS
export const loginScreen = document.getElementById('loginScreen');
export const lobbyScreen = document.getElementById('lobbyScreen');
export const gameScreen = document.getElementById('gameScreen');

export const createRoomModal = document.getElementById('createRoomModal');
export const passwordModal = document.getElementById('passwordModal');

export const loginError = document.getElementById('loginError');
export const passwordError = document.getElementById('passwordError');
export const roomListDiv = document.getElementById('roomList');
export const searchRoomInput = document.getElementById('searchRoomInput');

export const playersListUl = document.getElementById('playersList');
export const chatMessagesDiv = document.getElementById('chatMessages');

export const timerDisplay = document.getElementById('timerDisplay');
export const wordDisplay = document.getElementById('wordDisplay');
export const roundDisplay = document.getElementById('roundDisplay');
export const drawingControls = document.getElementById('drawingControls');

export const wordSelectionOverlay = document.getElementById('wordSelectionOverlay');
export const wordOptionsDiv = document.getElementById('wordOptionsDiv');
export const roundEndOverlay = document.getElementById('roundEndOverlay');
export const roundEndMessage = document.getElementById('roundEndMessage');
export const roundEndWordSpan = document.getElementById('roundEndWord');
export const roundScoreboard = document.getElementById('roundScoreboard');

export function showScreen(screenEl) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('view-active'));
    screenEl.classList.add('view-active');
    if (screenEl === gameScreen) {
        setTimeout(resizeCanvas, 100);
    }
}

export function showModal(modalEl) { modalEl.classList.add('active'); }
export function hideModal(modalEl) { modalEl.classList.remove('active'); }

export function showNotification(msg, isError = false) {
    const notif = document.createElement('div');
    notif.className = `notification ${isError ? 'error' : ''}`;
    notif.textContent = msg;
    document.getElementById('notificationArea').appendChild(notif);
    setTimeout(() => { notif.remove(); }, 3000);
}

export function renderRoomList() {
    roomListDiv.innerHTML = '';
    const filter = searchRoomInput.value.toLowerCase();
    const filtered = lobbyState.currentRooms.filter(r => r.name.toLowerCase().includes(filter));

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
                lobbyState.pendingJoinRoomId = room.id;
                document.getElementById('joinPasswordInput').value = '';
                passwordError.classList.add('hidden');
                showModal(passwordModal);
                document.getElementById('joinPasswordInput').focus();
            } else {
                socket.emit('joinRoom', { roomId: room.id, password: null });
            }
        });
        roomListDiv.appendChild(card);
    });
}

export function updatePlayersList(roomData) {
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
}

export function appendChat(sender, msg, type = 'normal', isPainter = false) {
    const div = document.createElement('div');
    div.className = `chat-msg ${type}`;
    if (type === 'normal') {
        if (isPainter) div.classList.add('is-painter-msg');
        div.innerHTML = `<span class="sender">${escapeHtml(sender)}:</span><span>${escapeHtml(msg)}</span>`;
    } else {
        div.textContent = msg;
        if (type === 'success') {
            if (msg.includes(myState.nickname)) playSound(sfXCorrect);
            else playSound(sfXCorrectOther);
        }
        else if (type === 'system' && msg.includes('se ha unido')) playSound(sfXJoin);
        else if (type === 'system' && msg.includes('ha salido')) playSound(sfXLeave);
    }
    chatMessagesDiv.appendChild(div);
    chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
}
