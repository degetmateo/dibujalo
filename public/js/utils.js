/**
 * Escapes HTML characters to prevent XSS.
 * @param {string} unsafe 
 * @returns {string} escaped string
 */
export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* Audio Objects */
export const sfXRing = new Audio('/sounds/start.mp3');
export const sfXJoin = new Audio('/sounds/join.mp3');
export const sfXLeave = new Audio('/sounds/leave.mp3');
export const sfXCorrect = new Audio('/sounds/correct.mp3');
export const sfXCorrectOther = new Audio('/sounds/correct_other.mp3');
export const sfXTick = new Audio('/sounds/tick.mp3');
export const sfXEnd = new Audio('/sounds/end.mp3');

/**
 * Plays an audio element from the beginning.
 * @param {HTMLAudioElement} audio 
 */
export function playSound(audio) {
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(e => console.log('Audio error:', e));
}
