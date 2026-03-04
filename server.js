require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Game Logic and Sockets
const { loadWords } = require('./src/utils/words');
const gameLogic = require('./src/game/logic')(io);
require('./src/socket/handler')(io, gameLogic);

loadWords().then(() => {
    server.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
});
