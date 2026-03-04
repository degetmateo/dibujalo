const fs = require('fs');
const path = require('path');

let dictionary = [];

async function loadWords() {
    try {
        if (process.env.WORDS_API) {
            console.log('Fetching words from API:', process.env.WORDS_API);
            const response = await fetch(process.env.WORDS_API);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data && Array.isArray(data.words)) {
                dictionary = data.words;
                console.log(`Loaded ${dictionary.length} words from API`);
                return;
            }
        }
    } catch (err) {
        console.error('Error fetching words from API, fallback to local', err);
    }

    try {
        const rawWords = fs.readFileSync(path.join(__dirname, '../../words.json'), 'utf8');
        dictionary = JSON.parse(rawWords);
        console.log(`Loaded ${dictionary.length} words from local file`);
    } catch (err) {
        console.error('Error loading words.json, fallback to defaults:', err);
        dictionary = ["perro", "gato", "elefante"];
    }
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

module.exports = { dictionary, sanitizeWord, getRandomChoices, getLevenshtein, loadWords };
