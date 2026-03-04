/**
 * Global application state for the client.
 */

export const myState = {
    nickname: '',
    roomId: null,
    isPainter: false,
    hasGuessed: false
};

export const gameState = {
    status: 'waiting',
    painterId: null,
    wordLength: 0
};

export const lobbyState = {
    currentRooms: [],
    pendingJoinRoomId: null
};
