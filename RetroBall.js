/* =========================================================
   RETROBALL.JS  v2
   Terminal Pong – Fixed & Improved
   - Arrow keys no longer scroll the page
   - Ball vibration / shake fixed
   - Fullscreen mode (F key or button)
   - P = Pause, Escape = exit fullscreen
   - Start menu with Help screen & difficulty picker
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   CANVAS
--------------------------------------------------------- */

var canvas = document.getElementById("pong");
var ctx    = canvas.getContext("2d", { alpha: false });

var W = canvas.width;
var H = canvas.height;

ctx.imageSmoothingEnabled = false;

/* ---------------------------------------------------------
   SETTINGS
--------------------------------------------------------- */

var WIN_SCORE  = 5;
var BALL_SIZE  = 8;
var PADDLE_W   = 6;
var PADDLE_H   = 70;
var PLAYER_X   = 14;
var CPU_X      = W - 20;

var DIFFICULTY = [
    { name: "EASY",   speed: 1, mistake: 0.55, deadzone: 30, ballspeed: 3 },
    { name: "MEDIUM", speed: 2, mistake: 0.30, deadzone: 14, ballspeed: 4 },
    { name: "HARD",   speed: 4, mistake: 0.05, deadzone: 2,  ballspeed: 5 }
];

/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */

var SCREEN_MENU = 0;
var SCREEN_HELP = 1;
var SCREEN_PLAY = 2;

var screen     = SCREEN_MENU;
var difficulty = 1;
var paused     = false;
var gameOver   = false;

/* ---------------------------------------------------------
   SCORES / POSITIONS
--------------------------------------------------------- */

var playerScore = 0;
var cpuScore    = 0;
var playerY = (H >> 1) - (PADDLE_H >> 1);
var cpuY    = (H >> 1) - (PADDLE_H >> 1);
var ballX = W >> 1;
var ballY = H >> 1;
var ballVX = 4;
var ballVY = 2;

/* ---------------------------------------------------------
   INPUT  – prevent default on arrow keys to stop page scroll
--------------------------------------------------------- */

var up   = 0;
var down = 0;

window.__currentKeydown = function (e) {

    var k = e.code;

    /* Stop arrow keys / space from scrolling the page */
    if (k === "ArrowUp"   || k === "ArrowDown" ||
        k === "ArrowLeft" || k === "ArrowRight" ||
        k === "Space") {
        e.preventDefault();
    }

    if (k === "ArrowUp"   || k === "KeyW") { up   = 1; return; }
    if (k === "ArrowDown" || k === "KeyS") { down = 1; return; }

    if (k === "KeyP" && screen === SCREEN_PLAY && !gameOver) {
        paused = !paused;
        return;
    }

    if (k === "KeyF") {
        toggleFullscreen();
        return;
    }

    /* Escape is handled by browser for fullscreen exit automatically */

    if (k === "Enter" || k === "Space") {

        if (screen === SCREEN_MENU) {
            startGame();
            return;
        }
        if (screen === SCREEN_HELP) {
            screen = SCREEN_MENU;
            return;
        }
        if (screen === SCREEN_PLAY && gameOver) {
            restartGame();
            return;
        }
        return;
    }

    if (k === "KeyD" && screen === SCREEN_MENU) {
        difficulty = (difficulty + 1) % 3;
        return;
    }

});

window.__currentKeyup = function (e) {
    var k = e.code;
    if (k === "ArrowUp"   || k === "KeyW") up   = 0;
    if (k === "ArrowDown" || k === "KeyS") down = 0;
});

/* ---------------------------------------------------------
   MOUSE – menu button clicks
--------------------------------------------------------- */

canvas.addEventListener("click", function (e) {

    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var scaleY = H / rect.height;
    var mx = (e.clientX - rect.left) * scaleX;
    var my = (e.clientY - rect.top)  * scaleY;

    if (screen === SCREEN_MENU) {
        /* START button */
        if (mx >= 220 && mx <= 420 && my >= 155 && my <= 185) {
            startGame(); return;
        }
        /* HELP button */
        if (mx >= 220 && mx <= 420 && my >= 200 && my <= 230) {
            screen = SCREEN_HELP; return;
        }
        /* EASY */
        if (mx >= 130 && mx <= 230 && my >= 270 && my <= 295) {
            difficulty = 0; return;
        }
        /* MEDIUM */
        if (mx >= 260 && mx <= 380 && my >= 270 && my <= 295) {
            difficulty = 1; return;
        }
        /* HARD */
        if (mx >= 410 && mx <= 510 && my >= 270 && my <= 295) {
            difficulty = 2; return;
        }
    }

    if (screen === SCREEN_HELP) {
        screen = SCREEN_MENU; return;
    }

    /* Pause button tap during play */
    if (screen === SCREEN_PLAY && !gameOver) {
        if (mx >= W - 36 && mx <= W - 8 && my >= 6 && my <= 24) {
            paused = !paused; return;
        }
    }
});

/* ---------------------------------------------------------
   TOUCH – drag finger up/down to move paddle
--------------------------------------------------------- */

var touchLastY = -1;

canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    touchLastY = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener("touchmove", function (e) {
    e.preventDefault();
    if (touchLastY < 0) return;
    var dy = e.touches[0].clientY - touchLastY;
    touchLastY = e.touches[0].clientY;
    /* Scale touch delta to canvas coords */
    var rect = canvas.getBoundingClientRect();
    var scale = H / rect.height;
    playerY += (dy * scale) | 0;
    if (playerY < 0)            playerY = 0;
    if (playerY > H - PADDLE_H) playerY = H - PADDLE_H;
}, { passive: false });

canvas.addEventListener("touchend", function (e) {
    e.preventDefault();
    touchLastY = -1;
    /* Tap to start / restart / pause */
    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var scaleY = H / rect.height;
    var tx = (e.changedTouches[0].clientX - rect.left) * scaleX;
    var ty = (e.changedTouches[0].clientY - rect.top)  * scaleY;
    if (screen === SCREEN_MENU) {
        if (tx >= 220 && tx <= 420 && ty >= 155 && ty <= 185) { startGame(); return; }
        if (tx >= 220 && tx <= 420 && ty >= 200 && ty <= 230) { screen = SCREEN_HELP; return; }
        if (tx >= 130 && tx <= 230 && ty >= 270 && ty <= 295) { difficulty = 0; return; }
        if (tx >= 260 && tx <= 380 && ty >= 270 && ty <= 295) { difficulty = 1; return; }
        if (tx >= 410 && tx <= 510 && ty >= 270 && ty <= 295) { difficulty = 2; return; }
    }
    if (screen === SCREEN_HELP)  { screen = SCREEN_MENU; return; }
    if (screen === SCREEN_PLAY && !gameOver) { paused = !paused; return; }
    if (screen === SCREEN_PLAY &&  gameOver) { restartGame(); return; }
}, { passive: false });

/* ---------------------------------------------------------
   FULLSCREEN
--------------------------------------------------------- */

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        if (canvas.requestFullscreen) canvas.requestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

/* ---------------------------------------------------------
   GAME FUNCTIONS
--------------------------------------------------------- */

function startGame() {
    playerScore = 0;
    cpuScore    = 0;
    gameOver    = false;
    paused      = false;
    playerY     = (H >> 1) - (PADDLE_H >> 1);
    cpuY        = (H >> 1) - (PADDLE_H >> 1);
    screen      = SCREEN_PLAY;
    resetBall();
}

function resetBall() {
    ballX  = W >> 1;
    ballY  = H >> 1;
    var spd = DIFFICULTY[difficulty].ballspeed;
    ballVX = (Math.random() < 0.5) ? spd : -spd;
    ballVY = ((Math.random() * 4) | 0) - 2;
    if (ballVY === 0) ballVY = 1;
}

function restartGame() {
    playerScore = 0;
    cpuScore    = 0;
    gameOver    = false;
    paused      = false;
    resetBall();
}

/* ---------------------------------------------------------
   UPDATE
--------------------------------------------------------- */

function update() {

    if (screen !== SCREEN_PLAY || paused || gameOver) return;

    /* PLAYER */
    playerY += (down - up) * 5;
    if (playerY < 0)            playerY = 0;
    if (playerY > H - PADDLE_H) playerY = H - PADDLE_H;

    /* CPU AI – deadzone stops perfect tracking; mistake skips reaction entirely */
    var ai  = DIFFICULTY[difficulty];
    var mid = cpuY + (PADDLE_H >> 1);
    if (Math.random() > ai.mistake) {
        if (mid < ballY - ai.deadzone) cpuY += ai.speed;
        else if (mid > ballY + ai.deadzone) cpuY -= ai.speed;
    }
    if (cpuY < 0)            cpuY = 0;
    if (cpuY > H - PADDLE_H) cpuY = H - PADDLE_H;

    /* BALL MOVE */
    ballX += ballVX;
    ballY += ballVY;

    /* WALL BOUNCE – use abs() to guarantee correct direction, fixes vibration */
    if (ballY <= 0) {
        ballY  = 0;
        ballVY = Math.abs(ballVY);
    } else if (ballY >= H - BALL_SIZE) {
        ballY  = H - BALL_SIZE;
        ballVY = -Math.abs(ballVY);
    }

    /* PLAYER PADDLE COLLISION */
    if (ballVX < 0 &&
        ballX       <= PLAYER_X + PADDLE_W &&
        ballX       >= PLAYER_X - 2 &&
        ballY + BALL_SIZE >= playerY &&
        ballY             <= playerY + PADDLE_H) {

        ballX  = PLAYER_X + PADDLE_W + 1;
        ballVX = DIFFICULTY[difficulty].ballspeed;
        ballVY = ((ballY - (playerY + (PADDLE_H >> 1))) / 10) | 0;
        if (ballVY === 0) ballVY = (Math.random() < 0.5) ? 1 : -1;
    }

    /* CPU PADDLE COLLISION */
    else if (ballVX > 0 &&
             ballX + BALL_SIZE >= CPU_X - 1 &&
             ballX             <= CPU_X + PADDLE_W &&
             ballY + BALL_SIZE >= cpuY &&
             ballY             <= cpuY + PADDLE_H) {

        ballX  = CPU_X - BALL_SIZE - 1;
        ballVX = -DIFFICULTY[difficulty].ballspeed;
        ballVY = ((ballY - (cpuY + (PADDLE_H >> 1))) / 10) | 0;
        if (ballVY === 0) ballVY = (Math.random() < 0.5) ? 1 : -1;
    }

    /* SCORING */
    if (ballX < -BALL_SIZE) {
        cpuScore++;
        if (cpuScore >= WIN_SCORE) gameOver = true;
        else resetBall();
    } else if (ballX > W + BALL_SIZE) {
        playerScore++;
        if (playerScore >= WIN_SCORE) gameOver = true;
        else resetBall();
    }
}

/* ---------------------------------------------------------
   DRAW HELPERS
--------------------------------------------------------- */

function fillBtn(x, y, w, h, active) {
    ctx.fillStyle = active ? "#333" : "#111";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = active ? "#aaa" : "#444";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function centeredText(txt, y, size) {
    ctx.font = size + "px monospace";
    var tw = ctx.measureText(txt).width;
    ctx.fillText(txt, (W - tw) >> 1, y);
}

/* ---------------------------------------------------------
   DRAW
--------------------------------------------------------- */

function draw() {

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    /* ---- MENU ---- */
    if (screen === SCREEN_MENU) {

        ctx.fillStyle = "#666";
        centeredText("TERMINAL ARCADE", 58, 15);

        ctx.fillStyle = "#ccc";
        centeredText("RETRO BALL", 100, 24);

        /* START */
        fillBtn(220, 150, 200, 32, false);
        ctx.fillStyle = "#bbb";
        ctx.font = "14px monospace";
        var tw = ctx.measureText("START GAME").width;
        ctx.fillText("START GAME", 220 + ((200 - tw) >> 1), 172);

        /* HELP */
        fillBtn(220, 196, 200, 32, false);
        ctx.fillStyle = "#bbb";
        tw = ctx.measureText("HELP / KEYS").width;
        ctx.fillText("HELP / KEYS", 220 + ((200 - tw) >> 1), 218);

        /* Difficulty label */
        ctx.fillStyle = "#555";
        ctx.font = "12px monospace";
        centeredText("-- SELECT DIFFICULTY --", 258, 12);

        /* 3 diff buttons */
        var dnames = ["EASY", "MEDIUM", "HARD"];
        var dbx    = [130,    260,      410];
        var dbw    = [100,    120,      100];
        for (var i = 0; i < 3; i++) {
            fillBtn(dbx[i], 268, dbw[i], 26, difficulty === i);
            ctx.fillStyle = difficulty === i ? "#fff" : "#777";
            ctx.font = "12px monospace";
            tw = ctx.measureText(dnames[i]).width;
            ctx.fillText(dnames[i], dbx[i] + ((dbw[i] - tw) >> 1), 286);
        }

        ctx.fillStyle = "#333";
        ctx.font = "10px monospace";
        centeredText("D = CYCLE DIFFICULTY   ENTER = START   F = FULLSCREEN", 340, 10);

        return;
    }

    /* ---- HELP ---- */
    if (screen === SCREEN_HELP) {

        ctx.fillStyle = "#aaa";
        centeredText("-- CONTROLS --", 50, 15);

        var lines = [
            "W / UP ARROW    Move paddle up",
            "S / DOWN ARROW  Move paddle down",
            "P               Pause / Resume",
            "F               Toggle fullscreen",
            "ESC             Exit fullscreen",
            "D               Cycle difficulty (menu)",
            "ENTER / SPACE   Start / Restart"
        ];

        ctx.fillStyle = "#777";
        ctx.font = "13px monospace";
        for (var j = 0; j < lines.length; j++) {
            tw = ctx.measureText(lines[j]).width;
            ctx.fillText(lines[j], (W - tw) >> 1, 90 + j * 27);
        }

        ctx.fillStyle = "#444";
        centeredText("CLICK OR PRESS ENTER TO GO BACK", 330, 11);

        return;
    }

    /* ---- PLAY ---- */

    /* Center dashes */
    ctx.fillStyle = "#1e1e1e";
    for (var y = 0; y < H; y += 18) {
        ctx.fillRect((W >> 1) - 1, y, 2, 10);
    }

    /* Paddles */
    ctx.fillStyle = "#aaa";
    ctx.fillRect(PLAYER_X, playerY | 0, PADDLE_W, PADDLE_H);
    ctx.fillRect(CPU_X,    cpuY    | 0, PADDLE_W, PADDLE_H);

    /* Ball */
    ctx.fillStyle = "#fff";
    ctx.fillRect(ballX | 0, ballY | 0, BALL_SIZE, BALL_SIZE);

    /* Score */
    ctx.fillStyle = "#aaa";
    ctx.font = "16px monospace";
    ctx.fillText(playerScore, 140, 26);
    ctx.fillText(cpuScore,    W - 155, 26);

    /* Difficulty top-center */
    ctx.fillStyle = "#333";
    ctx.font = "11px monospace";
    tw = ctx.measureText(DIFFICULTY[difficulty].name).width;
    ctx.fillText(DIFFICULTY[difficulty].name, (W - tw) >> 1, 20);

    /* Pause button – top right, tap-friendly for mobile */
    ctx.fillStyle = paused ? "#555" : "#222";
    ctx.fillRect(W - 36, 6, 28, 18);
    ctx.fillStyle = paused ? "#ccc" : "#666";
    ctx.font = "10px monospace";
    ctx.fillText(paused ? "PLAY" : "II", W - 30, 19);

    /* PAUSED */
    if (paused) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#aaa";
        centeredText("PAUSED", 170, 20);
        ctx.fillStyle = "#555";
        centeredText("P = RESUME", 200, 13);
    }

    /* GAME OVER */
    if (gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff";
        centeredText(playerScore > cpuScore ? "YOU WIN!" : "CPU WINS", 145, 20);
        ctx.fillStyle = "#aaa";
        centeredText(playerScore + "  -  " + cpuScore, 180, 16);
        ctx.fillStyle = "#555";
        centeredText("ENTER = PLAY AGAIN", 225, 13);
    }
}

/* ---------------------------------------------------------
   MAIN LOOP – fixed ~30 FPS
--------------------------------------------------------- */

document.addEventListener("keydown", window.__currentKeydown);
document.addEventListener("keyup", window.__currentKeyup);


/* ---------------------------------------------------------
   CLEANUP – called by index.html goBack() to remove all
   listeners and injected DOM nodes, preventing blank screen
   bug when switching games.
--------------------------------------------------------- */
(function() {
    /* Named handler references stored so we can remove them */
    var _kd = window.__currentKeydown;
    var _ku = window.__currentKeyup;
    window.__gameCleanup = function() {
        if (_kd) document.removeEventListener("keydown", _kd);
        if (_ku) document.removeEventListener("keyup",   _ku);
        /* Remove D-pad */
        var dw = document.getElementById("dpad-wrap");
        if (dw) dw.innerHTML = "";
        /* Remove injected topbar buttons */
        var tb = document.getElementById("overlay-topbar");
        if (tb) {
            var extra = tb.querySelectorAll("button:not(#back-btn)");
            for (var i = 0; i < extra.length; i++) extra[i].remove();
        }
    };
})();

window.__gameInterval = setInterval(function () {
    update();
    draw();
}, 33);
