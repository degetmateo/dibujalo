import { myState } from './state.js';
import { socket } from './socket.js';

const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const sizePicker = document.getElementById('sizePicker');
const clearBtn = document.getElementById('clearBtn');
const undoBtn = document.getElementById('undoBtn');
const toolPencil = document.getElementById('toolPencil');
const toolBucket = document.getElementById('toolBucket');
const toolEraser = document.getElementById('toolEraser');

let currentTool = 'pencil';
export function initCanvas() {
    toolPencil.addEventListener('click', () => { currentTool = 'pencil'; updateToolUI(); });
    toolBucket.addEventListener('click', () => { currentTool = 'bucket'; updateToolUI(); });
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
    toolBucket.classList.toggle('active', currentTool === 'bucket');
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
        if (stroke.length > 0 && stroke[0].type === 'fill') {
            performFloodFill(stroke[0].x, stroke[0].y, stroke[0].color);
        } else {
            stroke.forEach(line => {
                drawLine(line.x0, line.y0, line.x1, line.y1, line.color, line.size, line.isEraser, false);
            });
        }
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

    if (currentTool === 'bucket') {
        const fillSuccess = performFloodFill(current.x, current.y, current.color);
        if (fillSuccess) {
            strokesHistory.push([{ type: 'fill', x: current.x, y: current.y, color: current.color }]);
            socket.emit('fill', {
                x: current.x / canvas.width,
                y: current.y / canvas.height,
                color: current.color
            });
        }
        isDrawing = false; // Don't track drag for bucket
        return;
    }

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

export function handleRemoteFill(data) {
    const ax = data.x * canvas.width;
    const ay = data.y * canvas.height;

    if (!myState.isPainter) {
        strokesHistory.push([{ type: 'fill', x: ax, y: ay, color: data.color }]);
    }
    performFloodFill(ax, ay, data.color);
}

// ---- FLOOD FILL ALGORITHM ----
function hexToRgba(hex) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
        c = hex.substring(1).split('');
        if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
        c = '0x' + c.join('');
        return [(c >> 16) & 255, (c >> 8) & 255, c & 255, 255];
    }
    return [0, 0, 0, 255];
}

function performFloodFill(startX, startY, fillColorHex) {
    const x = Math.floor(startX);
    const y = Math.floor(startY);
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) return false;

    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;

    const startPos = (y * canvasWidth + x) * 4;
    const startR = data[startPos];
    const startG = data[startPos + 1];
    const startB = data[startPos + 2];
    const startA = data[startPos + 3];

    const fillRgba = hexToRgba(fillColorHex);
    // Tolerance buffer for anti-aliasing edges (optional, strictly matching here)
    const matchTolerance = 5;

    // Check if target color is effectively the same as current color
    if (Math.abs(startR - fillRgba[0]) <= matchTolerance &&
        Math.abs(startG - fillRgba[1]) <= matchTolerance &&
        Math.abs(startB - fillRgba[2]) <= matchTolerance &&
        Math.abs(startA - fillRgba[3]) <= matchTolerance) {
        return false;
    }

    function matchStartColor(pos) {
        return Math.abs(data[pos] - startR) <= matchTolerance &&
            Math.abs(data[pos + 1] - startG) <= matchTolerance &&
            Math.abs(data[pos + 2] - startB) <= matchTolerance &&
            Math.abs(data[pos + 3] - startA) <= matchTolerance;
    }

    function colorPixel(pos) {
        data[pos] = fillRgba[0];
        data[pos + 1] = fillRgba[1];
        data[pos + 2] = fillRgba[2];
        data[pos + 3] = 255;
    }

    const pixelStack = [[x, y]];

    while (pixelStack.length) {
        const newPos = pixelStack.pop();
        let curX = newPos[0];
        let curY = newPos[1];
        let pixelPos = (curY * canvasWidth + curX) * 4;

        while (curY >= 0 && matchStartColor(pixelPos)) {
            curY--;
            pixelPos -= canvasWidth * 4;
        }
        pixelPos += canvasWidth * 4;
        curY++;

        let reachLeft = false;
        let reachRight = false;

        while (curY < canvasHeight && matchStartColor(pixelPos)) {
            colorPixel(pixelPos);

            if (curX > 0) {
                if (matchStartColor(pixelPos - 4)) {
                    if (!reachLeft) {
                        pixelStack.push([curX - 1, curY]);
                        reachLeft = true;
                    }
                } else if (reachLeft) {
                    reachLeft = false;
                }
            }

            if (curX < canvasWidth - 1) {
                if (matchStartColor(pixelPos + 4)) {
                    if (!reachRight) {
                        pixelStack.push([curX + 1, curY]);
                        reachRight = true;
                    }
                } else if (reachRight) {
                    reachRight = false;
                }
            }

            curY++;
            pixelPos += canvasWidth * 4;
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return true;
}
