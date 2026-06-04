/* =========================================================
   VOIDSERPENT.JS
   Terminal Snake – Void Serpent
   Lightweight. Fixed FPS. Old-PC safe.
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   CANVAS
--------------------------------------------------------- */

var canvas = document.getElementById("pong");
var ctx    = canvas.getContext("2d", { alpha: false });

var W = canvas.width;   /* 640 */
var H = canvas.height;  /* 360 */

ctx.imageSmoothingEnabled = false;

/* ---------------------------------------------------------
   GRID
--------------------------------------------------------- */

var CELL  = 16;                        /* px per cell       */
var COLS  = (W / CELL) | 0;           /* 40                */
var ROWS  = ((H - 32) / CELL) | 0;    /* 20  (top 32 = HUD)*/
var OY    = 32;                        /* y-offset for grid */

/* ---------------------------------------------------------
   SCREENS
--------------------------------------------------------- */

var SC_MENU = 0;
var SC_PLAY = 1;
var SC_DEAD = 2;

var screen = SC_MENU;

/* ---------------------------------------------------------
   SCORES
--------------------------------------------------------- */

var score  = 0;
var hiScore = 0;

/* Load high score */
try { hiScore = parseInt(localStorage.getItem("vs_hi") || "0", 10); } catch(e){}

function saveHi() {
    try { localStorage.setItem("vs_hi", hiScore); } catch(e){}
}

/* ---------------------------------------------------------
   SNAKE STATE
--------------------------------------------------------- */

var snake;      /* array of {x,y} head-first */
var dir;        /* {x,y} current direction   */
var nextDir;    /* queued direction           */
var food;       /* {x,y}                     */
var paused;
var newHi;

/* tongue */
var tongueTimer  = 0;
var tongueOn     = false;
var TONGUE_EVERY = 90;   /* ticks between shows */
var TONGUE_TICKS = 6;

/* food blink */
var foodBlink = 0;

/* power-ups
   type 1 = BONUS  – spawns every 5 apples, on screen 7s, collect = +5 pts, no growth
   type 2 = DOUBLE – spawns every 50 seconds, gives 20s effect: +2 pts per apple, grows by 1
*/
var pu          = null;
var puTimer     = 0;
var PU_TICKS    = 210;    /* 7 seconds on screen at 30fps */
var puBlink     = 0;

/* Bonus PU */
var applesEaten  = 0;
var nextBonusAt  = 5;

/* Double PU */
var doublePuClock   = 0;
var DOUBLE_PU_EVERY = 1500;   /* 50 seconds at 30fps */

/* Active double effect */
var doubleActive  = false;
var doubleTicks   = 0;
var DOUBLE_EFFECT = 600;      /* 20 seconds at 30fps */

/* speed: ticks per move (lower = faster) */
var BASE_SPEED  = 8;    /* ~3.75 moves/sec at 30fps */
var speed;              /* decreases as score grows  */
var moveTick;

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */

function initGame() {
    var sx = (COLS >> 1);
    var sy = (ROWS >> 1);
    snake    = [ {x:sx, y:sy}, {x:sx-1, y:sy}, {x:sx-2, y:sy} ];
    dir      = {x:1, y:0};
    nextDir  = {x:1, y:0};
    score    = 0;
    paused   = false;
    newHi    = false;
    speed    = BASE_SPEED;
    moveTick = 0;
    tongueTimer  = 0;
    tongueOn     = false;
    pu            = null;
    puTimer       = 0;
    puBlink       = 0;
    applesEaten   = 0;
    nextBonusAt   = 5;
    doublePuClock = 0;
    doubleActive  = false;
    doubleTicks   = 0;
    spawnFood();
}

function spawnFood() {
    var fx, fy, onSnake;
    do {
        fx = (Math.random() * COLS) | 0;
        fy = (Math.random() * ROWS) | 0;
        onSnake = false;
        for (var i = 0; i < snake.length; i++) {
            if (snake[i].x === fx && snake[i].y === fy) { onSnake = true; break; }
        }
    } while (onSnake);
    food = {x: fx, y: fy};
    foodBlink = 0;
}

function spawnPowerUp(type) {
    /* Don't spawn if one already on screen */
    if (pu) return;
    var px, py, blocked;
    do {
        px = (Math.random() * COLS) | 0;
        py = (Math.random() * ROWS) | 0;
        blocked = (px === food.x && py === food.y);
        for (var i = 0; i < snake.length; i++) {
            if (snake[i].x === px && snake[i].y === py) { blocked = true; break; }
        }
    } while (blocked);
    pu      = {x: px, y: py, type: type};
    puTimer = PU_TICKS;
    puBlink = 0;
}

/* ---------------------------------------------------------
   INPUT
--------------------------------------------------------- */

window.__currentKeydown = function (e) {

    var k = e.code;

    if (k === "ArrowUp" || k === "ArrowDown" ||
        k === "ArrowLeft" || k === "ArrowRight" || k === "Space") {
        e.preventDefault();
    }

    /* Pause */
    if (k === "KeyP" && screen === SC_PLAY) {
        paused = !paused; return;
    }

    /* Fullscreen */
    if (k === "KeyF") {
        if (!document.fullscreenElement) {
            if (canvas.requestFullscreen) canvas.requestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
        }
        return;
    }

    /* Menu start */
    if (screen === SC_MENU && (k === "Enter" || k === "Space")) {
        initGame(); screen = SC_PLAY; return;
    }

    /* Restart after death */
    if (screen === SC_DEAD && (k === "Enter" || k === "Space")) {
        initGame(); screen = SC_PLAY; return;
    }

    /* Direction */
    if (screen !== SC_PLAY) return;

    if ((k === "ArrowUp"    || k === "KeyW") && dir.y === 0) { nextDir = {x:0,  y:-1}; }
    if ((k === "ArrowDown"  || k === "KeyS") && dir.y === 0) { nextDir = {x:0,  y: 1}; }
    if ((k === "ArrowLeft"  || k === "KeyA") && dir.x === 0) { nextDir = {x:-1, y: 0}; }
    if ((k === "ArrowRight" || k === "KeyD") && dir.x === 0) { nextDir = {x: 1, y: 0}; }
});

/* Menu click */
canvas.addEventListener("click", function (e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var scaleY = H / rect.height;
    var mx = (e.clientX - rect.left) * scaleX;
    var my = (e.clientY - rect.top)  * scaleY;

    /* Pause button – top right during play */
    if (screen === SC_PLAY && !newHi) {
        if (mx >= W - 38 && mx <= W - 8 && my >= 5 && my <= 23) {
            paused = !paused; return;
        }
    }

    if (screen === SC_MENU) {
        if (mx >= 220 && mx <= 420 && my >= 160 && my <= 190) {
            initGame(); screen = SC_PLAY;
        }
    }
    if (screen === SC_DEAD) {
        if (mx >= 220 && mx <= 420 && my >= 200 && my <= 230) {
            initGame(); screen = SC_PLAY;
        }
    }
});

/* Touch swipe controls */
var touchStartX = 0;
var touchStartY = 0;

canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener("touchend", function (e) {
    e.preventDefault();
    var dx = e.changedTouches[0].clientX - touchStartX;
    var dy = e.changedTouches[0].clientY - touchStartY;
    var adx = dx < 0 ? -dx : dx;
    var ady = dy < 0 ? -dy : dy;

    var rect = canvas.getBoundingClientRect();
    var scaleX = W / rect.width;
    var scaleY = H / rect.height;
    var tx = (e.changedTouches[0].clientX - rect.left) * scaleX;
    var ty = (e.changedTouches[0].clientY - rect.top)  * scaleY;

    if (screen === SC_MENU || screen === SC_DEAD) {
        if (typeof requestLandscape === "function") requestLandscape();
        initGame(); screen = SC_PLAY; return;
    }

    if (screen !== SC_PLAY) return;

    /* Check D-pad tap first */
    var bsz = 36;
    var bx  = W - 130;
    var by  = H - 120;
    /* UP */
    if (tx >= bx+bsz && tx <= bx+bsz*2 && ty >= by && ty <= by+bsz) {
        if (dir.y === 0) { nextDir = {x:0, y:-1}; } return;
    }
    /* DOWN */
    if (tx >= bx+bsz && tx <= bx+bsz*2 && ty >= by+bsz*2 && ty <= by+bsz*3) {
        if (dir.y === 0) { nextDir = {x:0, y:1}; } return;
    }
    /* LEFT */
    if (tx >= bx && tx <= bx+bsz && ty >= by+bsz && ty <= by+bsz*2) {
        if (dir.x === 0) { nextDir = {x:-1, y:0}; } return;
    }
    /* RIGHT */
    if (tx >= bx+bsz*2 && tx <= bx+bsz*3 && ty >= by+bsz && ty <= by+bsz*2) {
        if (dir.x === 0) { nextDir = {x:1, y:0}; } return;
    }

    /* Swipe fallback (minimum distance) */
    if (adx < 10 && ady < 10) return;
    if (adx > ady) {
        if (dx > 0 && dir.x === 0) nextDir = {x: 1, y: 0};
        if (dx < 0 && dir.x === 0) nextDir = {x:-1, y: 0};
    } else {
        if (dy > 0 && dir.y === 0) nextDir = {x: 0, y: 1};
        if (dy < 0 && dir.y === 0) nextDir = {x: 0, y:-1};
    }
}, { passive: false });

/* ---------------------------------------------------------
   UPDATE
--------------------------------------------------------- */

function update() {

    if (screen !== SC_PLAY || paused) return;

    /* Tongue timer */
    tongueTimer++;
    if (tongueTimer >= TONGUE_EVERY) {
        tongueOn    = true;
        tongueTimer = 0;
    }
    if (tongueOn && tongueTimer >= TONGUE_TICKS) {
        tongueOn = false;
    }

    /* Food blink counter */
    foodBlink = (foodBlink + 1) % 30;

    /* Power-up blink + countdown */
    if (pu) {
        puBlink = (puBlink + 1) % 30;
        puTimer--;
        if (puTimer <= 0) { pu = null; }
    }

    /* Double PU clock – spawn type 2 every 50 seconds */
    doublePuClock++;
    if (doublePuClock >= DOUBLE_PU_EVERY) {
        doublePuClock = 0;
        spawnPowerUp(2);
    }

    /* Double effect countdown */
    if (doubleActive) {
        doubleTicks--;
        if (doubleTicks <= 0) { doubleActive = false; doubleTicks = 0; }
    }

    /* Move on tick */
    moveTick++;
    if (moveTick < speed) return;
    moveTick = 0;

    /* Apply queued direction */
    dir = nextDir;

    /* New head */
    var head = snake[0];
    var nx = head.x + dir.x;
    var ny = head.y + dir.y;

    /* Wall wrap – Nokia style */
    if (nx < 0)    nx = COLS - 1;
    if (nx >= COLS) nx = 0;
    if (ny < 0)    ny = ROWS - 1;
    if (ny >= ROWS) ny = 0;

    /* Self collision */
    for (var i = 0; i < snake.length - 1; i++) {
        if (snake[i].x === nx && snake[i].y === ny) { die(); return; }
    }

    /* Prepend new head */
    snake.unshift({x: nx, y: ny});

    /* Eat power-up? */
    if (pu && nx === pu.x && ny === pu.y) {
        if (pu.type === 1) {
            /* BONUS: flat +5 points, no growth */
            score += 5;
            if (score > hiScore) { hiScore = score; newHi = true; saveHi(); }
            snake.pop(); /* no growth */
        } else {
            /* DOUBLE: 20s effect, snake grows by 1 on collection */
            doubleActive = true;
            doubleTicks  = DOUBLE_EFFECT;
            /* tail stays – snake grows by 1 block on collection */
        }
        pu = null;
        return;
    }

    /* Eat food? */
    if (nx === food.x && ny === food.y) {
        /* Snake always grows (tail stays) */
        applesEaten++;
        var pts = doubleActive ? 2 : 1;
        score += pts;
        if (score > hiScore) { hiScore = score; newHi = true; saveHi(); }
        /* Speed up every 5 apples, min 3 ticks */
        if (applesEaten % 5 === 0 && speed > 3) speed--;
        /* Spawn bonus PU every 5 apples */
        if (applesEaten >= nextBonusAt) {
            nextBonusAt += 5;
            spawnPowerUp(1);
        }
        spawnFood();
    } else {
        snake.pop(); /* remove tail only when no food eaten */
    }
}

function die() {
    screen = SC_DEAD;
}

/* ---------------------------------------------------------
   DRAW HELPERS
--------------------------------------------------------- */

function gx(cx) { return cx * CELL; }
function gy(cy) { return OY + cy * CELL; }

function fillBtn(x, y, w, h) {
    ctx.fillStyle = "#111";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function centered(txt, y, size, col) {
    ctx.fillStyle = col || "#aaa";
    ctx.font = size + "px monospace";
    var tw = ctx.measureText(txt).width;
    ctx.fillText(txt, (W - tw) >> 1, y);
}

/* ---------------------------------------------------------
   DRAW
--------------------------------------------------------- */

function draw() {

    /* BG */
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    /* ---- MENU ---- */
    if (screen === SC_MENU) {
        ctx.fillStyle = "#444";
        centered("TERMINAL ARCADE", 55, 13, "#444");
        centered("VOID SERPENT", 95, 24, "#ccc");
        ctx.fillStyle = "#555";
        centered("TERMINAL SNAKE SURVIVAL SYSTEM", 125, 11, "#555");

        fillBtn(220, 160, 200, 30);
        centered("START GAME", 181, 14, "#bbb");

        ctx.font = "11px monospace";
        centered("WASD / ARROWS = MOVE   P = PAUSE   F = FULLSCREEN", 230, 11, "#333");

        /* HI score */
        centered("HIGH SCORE: " + hiScore, 270, 13, "#444");

        return;
    }

    /* ---- HUD (both play and dead) ---- */
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, W, OY);

    ctx.fillStyle = "#aaa";
    ctx.font = "13px monospace";
    ctx.fillText("SCORE: " + score, 10, 20);

    ctx.fillStyle = "#555";
    ctx.fillText("HIGH: " + hiScore, 10, 34 - 2);

    ctx.fillStyle = "#333";
    ctx.font = "11px monospace";
    var spd_label = "SPD:" + (BASE_SPEED - speed + 1);
    ctx.fillText(spd_label, W - 60, 20);

    /* Pause button – top right corner, clickable */
    ctx.fillStyle = paused ? "#444" : "#1a1a1a";
    ctx.fillRect(W - 38, 5, 30, 18);
    ctx.fillStyle = paused ? "#ccc" : "#555";
    ctx.font = "10px monospace";
    ctx.fillText(paused ? "GO" : "II", W - 30, 18);

    if (paused) {
        ctx.fillStyle = "#666";
        ctx.font = "13px monospace";
        centered("[ PAUSED ]", 22, 13, "#666");
    }

    /* ---- GRID ---- */
    ctx.fillStyle = "#080808";
    ctx.fillRect(0, OY, W, H - OY);

    /* Subtle grid lines */
    ctx.fillStyle = "#0d0d0d";
    for (var gxi = 0; gxi <= COLS; gxi++) {
        ctx.fillRect(gxi * CELL, OY, 1, H - OY);
    }
    for (var gyi = 0; gyi <= ROWS; gyi++) {
        ctx.fillRect(0, OY + gyi * CELL, W, 1);
    }

    /* ---- FOOD  – apple with green stem ---- */
    var fx2 = gx(food.x);
    var fy2 = gy(food.y);
    if (foodBlink < 22) {
        ctx.fillStyle = foodBlink < 11 ? "#993333" : "#772222";
    } else {
        ctx.fillStyle = "#441111";
    }
    /* Apple body */
    ctx.fillRect(fx2 + 3, fy2 + 5, CELL - 6, CELL - 7);
    /* Stem – green */
    ctx.fillStyle = "#336633";
    ctx.fillRect(fx2 + (CELL >> 1) - 1, fy2 + 2, 2, 4);
    /* Leaf – tiny green dot */
    ctx.fillRect(fx2 + (CELL >> 1) + 1, fy2 + 3, 3, 2);

    /* ---- POWER-UP ---- */
    if (pu) {
        var px2  = gx(pu.x);
        var py2  = gy(pu.y);
        /* Blink faster in last 60 ticks */
        var vis = (puTimer > 60) ? (puBlink < 22) : (puBlink < 15);
        if (vis) {
            if (pu.type === 1) {
                /* BONUS – bright yellow-ish star shape (just a cross) */
                ctx.fillStyle = "#aaaa00";
                ctx.fillRect(px2 + (CELL >> 1) - 1, py2 + 2,  2, CELL - 4);
                ctx.fillRect(px2 + 2, py2 + (CELL >> 1) - 1,  CELL - 4, 2);
            } else {
                /* DOUBLE – cyan-ish diamond */
                ctx.fillStyle = "#007777";
                ctx.fillRect(px2 + (CELL >> 1) - 1, py2 + 2,  2, CELL - 4);
                ctx.fillRect(px2 + 2, py2 + (CELL >> 1) - 1,  CELL - 4, 2);
                ctx.fillRect(px2 + 4, py2 + 4, CELL - 8, CELL - 8);
            }
        }

        /* Power-up timer bar in HUD center */
        var secsLeft2 = ((puTimer / PU_TICKS) * 100) | 0;
        var barW = ((secsLeft2 / 100) * 120) | 0;
        var barX = (W - 120) >> 1;
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(barX, 4, 120, 10);
        ctx.fillStyle = pu.type === 1 ? "#888800" : "#006666";
        ctx.fillRect(barX, 4, barW, 10);
        /* Label */
        ctx.fillStyle = pu.type === 1 ? "#cccc00" : "#00aaaa";
        ctx.font = "9px monospace";
        var lbl = pu.type === 1 ? "BONUS x2/sec" : "DOUBLE SCORE";
        var ltw = ctx.measureText(lbl).width;
        ctx.fillText(lbl, (W - ltw) >> 1, 22);

        /* Seconds remaining number */
        var secNum = ((puTimer / 30) | 0) + 1;
        ctx.fillStyle = "#888";
        ctx.font = "9px monospace";
        ctx.fillText(secNum + "s", barX + 124, 13);
    }

    /* Double-score active indicator */
    if (doubleActive) {
        var dsec = ((doubleTicks / 30) | 0) + 1;
        ctx.fillStyle = "#00aaaa";
        ctx.font = "9px monospace";
        ctx.fillText("x2 " + dsec + "s", W - 55, 32);
    }

    /* ---- SNAKE ---- */
    for (var si = snake.length - 1; si >= 0; si--) {
        var seg = snake[si];
        var sx  = gx(seg.x);
        var sy2 = gy(seg.y);

        if (si === 0) {
            /* Head – white */
            ctx.fillStyle = "#ddd";
            ctx.fillRect(sx + 1, sy2 + 1, CELL - 2, CELL - 2);

            /* Eyes – tiny dark dots */
            ctx.fillStyle = "#000";
            var ex = (dir.x === -1) ? sx + 2  : sx + CELL - 6;
            var ey = sy2 + 4;
            ctx.fillRect(ex, ey,     2, 2);
            ctx.fillRect(ex, ey + 6, 2, 2);

            /* Tongue – red, appears randomly */
            if (tongueOn) {
                ctx.fillStyle = "#cc0000";
                var tx = sx + (CELL >> 1) - 1;
                var ty = sy2 + (CELL >> 1) - 1;
                if      (dir.x ===  1) { ctx.fillRect(sx + CELL - 1, ty, 5, 1); ctx.fillRect(sx + CELL + 2, ty - 1, 2, 1); ctx.fillRect(sx + CELL + 2, ty + 2, 2, 1); }
                else if (dir.x === -1) { ctx.fillRect(sx - 5,        ty, 5, 1); ctx.fillRect(sx - 7, ty - 1, 2, 1); ctx.fillRect(sx - 7, ty + 2, 2, 1); }
                else if (dir.y === -1) { ctx.fillRect(tx, sy2 - 5,   1, 5); ctx.fillRect(tx - 1, sy2 - 7, 1, 2); ctx.fillRect(tx + 2, sy2 - 7, 1, 2); }
                else                   { ctx.fillRect(tx, sy2 + CELL - 1, 1, 5); ctx.fillRect(tx - 1, sy2 + CELL + 2, 1, 2); ctx.fillRect(tx + 2, sy2 + CELL + 2, 1, 2); }
            }

        } else {
            /* Body – slightly dimmer, with texture lines */
            var bright = si < 4 ? "#bbb" : si < 10 ? "#999" : "#777";
            ctx.fillStyle = bright;
            ctx.fillRect(sx + 2, sy2 + 2, CELL - 4, CELL - 4);

            /* Single texture stripe */
            ctx.fillStyle = "#333";
            if (si % 2 === 0) {
                ctx.fillRect(sx + 4, sy2 + (CELL >> 1) - 1, CELL - 8, 2);
            } else {
                ctx.fillRect(sx + (CELL >> 1) - 1, sy2 + 4, 2, CELL - 8);
            }
        }
    }

    /* ---- MOBILE D-PAD – only on touch devices ---- */
    if (window.matchMedia("(pointer: coarse)").matches) {
        var bsz = 36;
        var bx  = W - 130;
        var by  = H - 120;
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(bx + bsz, by, bsz, bsz);
        ctx.fillStyle = "#555";
        ctx.font = "14px monospace";
        ctx.fillText("^", bx + bsz + 12, by + 24);
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(bx + bsz, by + bsz * 2, bsz, bsz);
        ctx.fillStyle = "#555";
        ctx.fillText("v", bx + bsz + 12, by + bsz * 2 + 24);
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(bx, by + bsz, bsz, bsz);
        ctx.fillStyle = "#555";
        ctx.fillText("<", bx + 10, by + bsz + 24);
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(bx + bsz * 2, by + bsz, bsz, bsz);
        ctx.fillStyle = "#555";
        ctx.fillText(">", bx + bsz * 2 + 10, by + bsz + 24);
    }

    /* ---- PAUSE OVERLAY ---- */
    if (paused && screen === SC_PLAY) {
        ctx.fillStyle = "#000";
        for (var pi = OY; pi < H; pi += 2) {
            ctx.fillRect(0, pi, W, 1);
        }
        centered("PAUSED", (H + OY) >> 1, 20, "#aaa");
        centered("P = RESUME", ((H + OY) >> 1) + 24, 12, "#555");
    }

    /* ---- DEATH SCREEN ---- */
    if (screen === SC_DEAD) {
        /* Dark overlay – draw manually without alpha */
        /* Stripe every 2 rows to fake semi-dark overlay, lightweight */
        ctx.fillStyle = "#000";
        for (var di = 0; di < H; di += 2) {
            ctx.fillRect(0, di, W, 1);
        }

        ctx.fillStyle = "#ccc";
        centered("VOID SERPENT", 120, 18, "#ccc");
        centered("-- SYSTEM FAILURE --", 148, 12, "#555");
        centered("SCORE: " + score, 175, 14, "#aaa");

        if (newHi) centered("*** NEW HIGH SCORE ***", 200, 13, "#888");

        fillBtn(220, 215, 200, 30);
        centered("PLAY AGAIN", 236, 14, "#bbb");

        centered("ENTER / SPACE / CLICK", 270, 11, "#333");
    }
}

/* ---------------------------------------------------------
   LOOP – expose interval so index.html can kill it on back
--------------------------------------------------------- */

document.addEventListener("keydown", window.__currentKeydown);


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
