import { myState } from './state.js';
import { socket } from './socket.js';

const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const sizePicker = document.getElementById('sizePicker');
const clearBtn = document.getElementById('clearBtn');
const undoBtn = document.getElementById('undoBtn');
const toolPencil = document.getElementById('toolPencil');
const toolEraser = document.getElementById('toolEraser');

let currentTool = 'pencil';
export function initCanvas() {
    toolPencil.addEventListener('click', () => { currentTool = 'pencil'; updateToolUI(); });
    toolEraser.addEventListener('click', () => { currentTool = 'eraser'; updateToolUI(); });

    colorPicker.addEventListener('input', (e) => current.color = e.target.value);
    sizePicker.addEventListener('input', (e) => current.size = e.target.value);

    clearBtn.addEventListener('click', () => {
        if (!myState.isPainter) return;
        clearCanvasLocally();
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

    window.addEventListener('resize', resizeCanvas);

    canvas.addEventListener('mousedown', onDrawStart);
    canvas.addEventListener('mouseup', onDrawEnd);
    canvas.addEventListener('mouseout', onDrawEnd);
    canvas.addEventListener('mousemove', onDrawMove);

    canvas.addEventListener('touchstart', onDrawStart, { passive: true });
    canvas.addEventListener('touchend', onDrawEnd, { passive: true });
    canvas.addEventListener('touchmove', onDrawMove, { passive: true });
}

export function updateToolUI() {
    toolPencil.classList.toggle('active', currentTool === 'pencil');
    toolEraser.classList.toggle('active', currentTool === 'eraser');
}

export function resizeCanvas() {
    const parent = canvas.parentElement;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
    if (canvas.width > 0 && canvas.height > 0) tempCanvas.getContext('2d').drawImage(canvas, 0, 0);

    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;

    if (tempCanvas.width > 0 && tempCanvas.height > 0) ctx.drawImage(tempCanvas, 0, 0);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
}

let isDrawing = false;
let current = { x: 0, y: 0, color: '#000000', size: 5 };
export let strokesHistory = [];
let currentStroke = [];

export function redrawHistory() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesHistory.forEach(stroke => {
        stroke.forEach(line => {
            drawLine(line.x0, line.y0, line.x1, line.y1, line.color, line.size, line.isEraser, false);
        });
    });
}

export function clearCanvasLocally() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesHistory = [];
}

export function drawLine(x0, y0, x1, y1, color, size, isEraser, emit) {
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
    ctx.globalCompositeOperation = 'source-over';

    if (emit && myState.isPainter) {
        currentStroke.push({ x0, y0, x1, y1, color, size, isEraser });
        socket.emit('draw', {
            x0: x0 / canvas.width, y0: y0 / canvas.height,
            x1: x1 / canvas.width, y1: y1 / canvas.height,
            color, size, isEraser
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
    current.color = colorPicker.value;
    current.size = sizePicker.value;
    const pos = getPos(e);
    current.x = pos.x; current.y = pos.y;
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

export function handleRemoteDraw(data) {
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
    drawLine(ax0, ay0, ax1, ay1, data.color, data.size, data.isEraser, false);
}

export function handleRemoteStrokeEnd() {
    if (!myState.isPainter) {
        strokesHistory.push([...currentStroke]);
        currentStroke = [];
    }
}

export function handleRemoteUndo() {
    if (!myState.isPainter) {
        if (strokesHistory.length > 0) strokesHistory.pop();
        redrawHistory();
    }
}
