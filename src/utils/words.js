const fs = require('fs');
const path = require('path');

let dictionary = [];
try {
    const rawWords = fs.readFileSync(path.join(__dirname, '../../words.json'), 'utf8');
    dictionary = JSON.parse(rawWords);
} catch (err) {
    console.error('Error loading words.json, fallback to defaults:', err);
    dictionary = ["perro", "gato", "elefante"];
}

/**
 * Normalizes a word by removing diacritics and converting to lowercase.
 */
function sanitizeWord(w) {
    return w.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Returns n random choices from the dictionary.
 */
function getRandomChoices(count = 3) {
    let choices = [];
    let dictCopy = [...dictionary];
    for (let i = 0; i < count; i++) {
        if (dictCopy.length === 0) break;
        const idx = Math.floor(Math.random() * dictCopy.length);
        choices.push(dictCopy.splice(idx, 1)[0]);
    }
    return choices;
}

/**
 * Calculates Levenshtein distance roughly for "Estás cerca" validation.
 */
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

module.exports = { dictionary, sanitizeWord, getRandomChoices, getLevenshtein };
