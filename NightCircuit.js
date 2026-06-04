/* =========================================================
   NIGHTCIRCUIT.JS
   Terminal Arcade – Night Circuit
   Endless terminal racing. Lightweight. Fixed FPS.
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
   AUDIO  – tiny Web Audio synth, no files
--------------------------------------------------------- */

var AC = null;
function getAC() {
    if (!AC) {
        try {
            AC = new (window.AudioContext || window.webkitAudioContext)();
        } catch(e) {}
    }
    return AC;
}

function beep(freq, dur, type, vol) {
    var ac = getAC(); if (!ac) return;
    try {
        var o = ac.createOscillator();
        var g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type      = type  || "square";
        o.frequency.setValueAtTime(freq, ac.currentTime);
        g.gain.setValueAtTime((vol || 0.08), ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        o.start(ac.currentTime);
        o.stop(ac.currentTime + dur);
    } catch(e) {}
}

function sndStart() {
    beep(220, 0.08, "square", 0.07);
    setTimeout(function(){ beep(330, 0.08, "square", 0.07); }, 90);
    setTimeout(function(){ beep(440, 0.12, "square", 0.09); }, 180);
}

function sndCrash() {
    beep(80,  0.25, "sawtooth", 0.12);
    beep(55,  0.30, "sawtooth", 0.10);
}

function sndNearMiss() { beep(660, 0.06, "square", 0.06); }
function sndPause()    { beep(330, 0.08, "sine",   0.05); }
function sndHiScore()  {
    beep(440, 0.08, "square", 0.07);
    setTimeout(function(){ beep(550, 0.08, "square", 0.07); }, 100);
    setTimeout(function(){ beep(660, 0.12, "square", 0.09); }, 200);
}
function sndMove()     { beep(180, 0.03, "square", 0.03); }
function sndCoin()     { beep(880, 0.07, "sine",   0.06);
                         setTimeout(function(){ beep(1100, 0.07, "sine", 0.05); }, 70); }
function sndNitro()    { beep(200, 0.06, "sawtooth", 0.07);
                         setTimeout(function(){ beep(280, 0.10, "sawtooth", 0.08); }, 70); }
function sndTurbo()    { beep(300, 0.06, "sawtooth", 0.08);
                         setTimeout(function(){ beep(440, 0.06, "sawtooth", 0.08); }, 70);
                         setTimeout(function(){ beep(600, 0.12, "sawtooth", 0.09); }, 140); }
/* Engine tick – very quiet click every ~10 ticks while driving */
var engineTick = 0;
function tickEngine() {
    engineTick++;
    if (engineTick >= 10) {
        engineTick = 0;
        beep(55 + speedLevel * 8, 0.02, "sawtooth", 0.02);
    }
}

/* ---------------------------------------------------------
   LAYOUT
--------------------------------------------------------- */

var ROAD_X = 110;          /* road left edge  */
var ROAD_W = 420;          /* road width      */
var ROAD_R = ROAD_X + ROAD_W;
var LANES  = 4;
var LANE_W = ROAD_W / LANES;  /* 105px each */

/* ---------------------------------------------------------
   SCREENS
--------------------------------------------------------- */

var SC_MENU = 0;
var SC_PLAY = 1;
var SC_DEAD = 2;

var screen = SC_MENU;

/* ---------------------------------------------------------
   HIGH SCORE
--------------------------------------------------------- */

var hiScore = 0;
var newHi   = false;

try {
    hiScore = parseInt(
        localStorage.getItem("terminalarcade_nightcircuit_hi") || "0", 10
    );
} catch(e){}

function saveHi() {
    try {
        localStorage.setItem("terminalarcade_nightcircuit_hi", hiScore);
    } catch(e){}
}

/* ---------------------------------------------------------
   PLAYER
--------------------------------------------------------- */

var CAR_W  = 52;
var CAR_H  = 64;

var playerX;   /* centre x of player car */
var playerY;
var PLAYER_SPEED = 5;

/* ---------------------------------------------------------
   ROAD SCROLL
--------------------------------------------------------- */

var roadY      = 0;          /* lane marker scroll offset */
var MARKER_H   = 40;         /* dashed line segment height */
var MARKER_GAP = 30;

/* ---------------------------------------------------------
   TRAFFIC
--------------------------------------------------------- */

/* Pool of traffic objects – reuse to avoid GC */
var MAX_TRAFFIC = 12;
var traffic = [];

for (var ti = 0; ti < MAX_TRAFFIC; ti++) {
    traffic.push({ x:0, y:0, w:0, h:0, alive:false, col:"#888" });
}

var TRAFFIC_TYPES = [
    { w:58, h:44, col:"#aaa" },  /* small car – fills 55% of lane */
    { w:66, h:56, col:"#888" },  /* sedan                         */
    { w:74, h:64, col:"#777" },  /* SUV                           */
    { w:82, h:72, col:"#999" }   /* truck – nearly full lane      */
];

/* ---------------------------------------------------------
   GAME STATE
--------------------------------------------------------- */

var score      = 0;
var distance   = 0;
var gameSpeed  = 2.5;
var paused     = false;

var spawnTimer    = 0;
var spawnInterval = 60;   /* ticks between spawns – decreases over time */

var speedLevel    = 1;
var speedMsgTimer = 0;    /* show "SPEED LEVEL X" for N ticks */

/* Screen shake */
var shakeTick = 0;
var SHAKE_MAX = 8;

/* Near-miss tracking */
var nearMissTimer = 0;

/* Scan flash */
var scanTimer    = 0;
var SCAN_EVERY   = 1800;  /* ~60s */
var scanFlash    = 0;

/* ---------------------------------------------------------
   NITRO POWER-UP
   Appears every 20 seconds. Lasts 4s on road.
   Effect: 5s speed boost + ram traffic for points, no crash.
--------------------------------------------------------- */
var nitro = { alive: false, x: 0, y: 0 };
var nitroSpawnClock = 0;
var NITRO_SPAWN_EVERY = 600;  /* 20 seconds */
var nitroBlink = 0;

var nitroActive = false;
var nitroTicks  = 0;
var NITRO_EFFECT = 450;    /* 15 seconds at 30fps */
var nitroMsgTimer = 0;
var baseSpeed   = 2.5;     /* speed without any boost — updated on level-up only */

/* ---------------------------------------------------------
   COIN PICKUP  – every 8s, +20 score, no effect
--------------------------------------------------------- */
var coin = { alive: false, x: 0, y: 0 };
var coinSpawnClock = 0;
var COIN_SPAWN_EVERY = 240;  /* 8 seconds */
var coinBlink = 0;
var coinMsgTimer = 0;

/* ---------------------------------------------------------
   TURBO POWER-UP  – every 40s, 5s effect
   Faster than nitro + full invincibility + player blinks
--------------------------------------------------------- */
var turbo = { alive: false, x: 0, y: 0 };
var turboSpawnClock = 0;
var TURBO_SPAWN_EVERY = 1200;  /* 40 seconds */
var turboBlink = 0;

var turboActive = false;
var turboTicks  = 0;
var TURBO_EFFECT = 150;   /* 5 seconds */
var turboMsgTimer = 0;
var turboBlinkState = 0;  /* for player blink animation */

/* ---------------------------------------------------------
   IDLE LANE PUNISHMENT
   If player stays in same lane for 4s, a car spawns there
--------------------------------------------------------- */
var lastPlayerLane = -1;
var idleTicks      = 0;
var IDLE_LIMIT     = 120;  /* 4 seconds at 30fps */
var idleWarning    = 0;    /* countdown to show warning */

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */

function initGame() {
    playerX  = ROAD_X + ROAD_W / 2;
    playerY  = H - CAR_H - 20;

    /* Reset traffic pool */
    for (var i = 0; i < MAX_TRAFFIC; i++) traffic[i].alive = false;

    score         = 0;
    distance      = 0;
    gameSpeed     = 2.5;
    paused        = false;
    spawnTimer    = 0;
    spawnInterval = 60;
    speedLevel    = 1;
    speedMsgTimer = 0;
    shakeTick     = 0;
    nearMissTimer = 0;
    scanTimer     = 0;
    scanFlash     = 0;
    roadY         = 0;
    newHi         = false;
    nitro.alive   = false;
    nitroSpawnClock = 0;
    nitroActive   = false;
    nitroTicks    = 0;
    nitroMsgTimer = 0;
    baseSpeed     = 2.5;
    coin.alive    = false;
    coinSpawnClock = 0;
    coinBlink     = 0;
    coinMsgTimer  = 0;
    turbo.alive   = false;
    turboSpawnClock = 0;
    turboBlink    = 0;
    turboActive   = false;
    turboTicks    = 0;
    turboMsgTimer = 0;
    turboBlinkState = 0;
    lastPlayerLane = -1;
    idleTicks     = 0;
    idleWarning   = 0;

    screen = SC_PLAY;
    sndStart();
}

/* ---------------------------------------------------------
   SPAWN TRAFFIC
--------------------------------------------------------- */

function countActiveTraffic() {
    var n = 0;
    for (var i = 0; i < MAX_TRAFFIC; i++) {
        if (traffic[i].alive && traffic[i].y < H * 0.5) n++;
    }
    return n;
}

/* Returns true if no pickup or traffic car occupies the given lane */
function laneIsClearForPickup(lane) {
    var lx = ROAD_X + lane * LANE_W;
    var lr = lx + LANE_W;
    /* Check other pickups */
    if (nitro.alive && nitro.x + 14 > lx && nitro.x < lr) return false;
    if (coin.alive  && coin.x  + 12 > lx && coin.x  < lr) return false;
    if (turbo.alive && turbo.x + 16 > lx && turbo.x < lr) return false;
    /* Check traffic in top portion */
    for (var i = 0; i < MAX_TRAFFIC; i++) {
        var t = traffic[i];
        if (!t.alive || t.y > H * 0.6) continue;
        if (t.x + t.w > lx && t.x < lr) return false;
    }
    return true;
}

function spawnTraffic(forceLane) {
    /* Spawn cap: never more than 3 cars in top half of screen */
    if (countActiveTraffic() >= 3) return;

    for (var i = 0; i < MAX_TRAFFIC; i++) {
        if (!traffic[i].alive) {
            var t   = traffic[i];
            var tp  = TRAFFIC_TYPES[(Math.random() * TRAFFIC_TYPES.length) | 0];
            var lane = (forceLane !== undefined) ? forceLane :
                       ((Math.random() * LANES) | 0);
            t.x     = ROAD_X + lane * LANE_W + (LANE_W - tp.w) / 2;
            t.y     = -tp.h - 10;
            t.w     = tp.w;
            t.h     = tp.h;
            t.col   = tp.col;
            t.alive = true;
            return;
        }
    }
}

/* ---------------------------------------------------------
   COLLISION  (AABB)
--------------------------------------------------------- */

function collides(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx &&
           ay < by + bh && ay + ah > by;
}

/* ---------------------------------------------------------
   INPUT
--------------------------------------------------------- */

var keyLeft  = false;
var keyRight = false;

window.__currentKeydown = function (e) {

    var k = e.code;

    if (k === "ArrowLeft" || k === "ArrowRight" ||
        k === "ArrowUp"   || k === "ArrowDown"  || k === "Space") {
        e.preventDefault();
    }

    if (screen === SC_MENU && (k === "Enter" || k === "Space")) {
        initGame(); return;
    }
    if (screen === SC_DEAD && (k === "Enter" || k === "Space")) {
        initGame(); return;
    }

    if (k === "Escape") {
        if (screen === SC_PLAY) { screen = SC_MENU; return; }
    }
    if (k === "KeyP" && screen === SC_PLAY) {
        paused = !paused; sndPause(); return;
    }
    if (k === "KeyF") { toggleFS(); return; }

    if (k === "ArrowLeft"  || k === "KeyA") keyLeft  = true;
    if (k === "ArrowRight" || k === "KeyD") keyRight = true;
});

window.__currentKeyup = function (e) {
    var k = e.code;
    if (k === "ArrowLeft"  || k === "KeyA") keyLeft  = false;
    if (k === "ArrowRight" || k === "KeyD") keyRight = false;
});

function toggleFS() {
    if (!document.fullscreenElement) {
        if (canvas.requestFullscreen) canvas.requestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

/* ---------------------------------------------------------
   TOUCH CONTROLS
--------------------------------------------------------- */

/* ---------------------------------------------------------
   INJECT PAUSE BUTTON into overlay topbar
--------------------------------------------------------- */
(function() {
    var topbar = document.getElementById("overlay-topbar");
    if (!topbar) return;
    if (document.getElementById("nc-pause-btn")) return;
    var pb = document.createElement("button");
    pb.id = "nc-pause-btn";
    pb.textContent = "II PAUSE";
    pb.style.cssText = [
        "font-family:monospace", "font-size:12px",
        "background:#111", "color:#aaa",
        "border:1px solid #333", "padding:4px 10px",
        "cursor:pointer", "margin-left:8px"
    ].join(";");
    pb.addEventListener("click", function() {
        if (screen !== SC_PLAY) return;
        paused = !paused;
        pb.textContent = paused ? "> RESUME" : "II PAUSE";
        sndPause();
    });
    topbar.appendChild(pb);
})();

var touchLeft  = false;
var touchRight = false;

var isTouchNC = (typeof window !== "undefined" &&
    window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

if (isTouchNC) {
    var ncdpad = document.createElement("div");
    ncdpad.id = "nc-dpad";
    ncdpad.style.cssText = [
        "display:flex", "gap:6px", "padding:8px",
        "background:#000", "justify-content:center",
        "width:640px", "max-width:100%", "box-sizing:border-box"
    ].join(";");

    function mkNCBtn(label, id) {
        var b = document.createElement("button");
        b.id = id;
        b.textContent = label;
        b.style.cssText = [
            "font-family:monospace", "font-size:20px",
            "background:#111", "color:#aaa",
            "border:1px solid #444",
            "width:50%", "height:64px",
            "cursor:pointer", "-webkit-tap-highlight-color:transparent",
            "user-select:none"
        ].join(";");
        return b;
    }

    var ncBtnLeft  = mkNCBtn("< LEFT",  "nc-left");
    var ncBtnRight = mkNCBtn("RIGHT >", "nc-right");
    ncdpad.appendChild(ncBtnLeft);
    ncdpad.appendChild(ncBtnRight);
    var _dw = document.getElementById('dpad-wrap'); if (_dw) _dw.appendChild(ncdpad);

    function ncHold(btn, setFlag) {
        btn.addEventListener("touchstart", function(e) {
            e.preventDefault();
            btn.style.background = "#333";
            setFlag(true);
        }, { passive: false });
        btn.addEventListener("touchend", function(e) {
            e.preventDefault();
            btn.style.background = "#111";
            setFlag(false);
        }, { passive: false });
        btn.addEventListener("touchcancel", function(e) {
            setFlag(false);
        }, { passive: false });
    }

    ncHold(ncBtnLeft,  function(v) { touchLeft  = v; });
    ncHold(ncBtnRight, function(v) { touchRight = v; });
}

function inBtn(tx, ty, b) {
    return tx >= b.x && tx <= b.x+b.w && ty >= b.y && ty <= b.y+b.h;
}

canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    if (screen === SC_MENU || screen === SC_DEAD) {
        if (typeof requestLandscape === "function") requestLandscape();
        initGame(); return;
    }
}, { passive: false });

canvas.addEventListener("touchend",   function (e) { e.preventDefault(); }, { passive: false });
canvas.addEventListener("touchcancel",function (e) { touchLeft = touchRight = false; }, { passive: false });

/* Mouse click for menu/dead */
canvas.addEventListener("click", function (e) {
    if (screen === SC_MENU || screen === SC_DEAD) { initGame(); }
});

/* ---------------------------------------------------------
   UPDATE
--------------------------------------------------------- */

function update() {

    if (screen !== SC_PLAY || paused) return;

    /* --- PLAYER MOVE --- */
    var moved = false;
    if (keyLeft || touchLeft) {
        playerX -= PLAYER_SPEED;
        moved = true;
    }
    if (keyRight || touchRight) {
        playerX += PLAYER_SPEED;
        moved = true;
    }

    /* Clamp to road */
    if (playerX - CAR_W/2 < ROAD_X)   playerX = ROAD_X  + CAR_W/2;
    if (playerX + CAR_W/2 > ROAD_R)   playerX = ROAD_R  - CAR_W/2;

    /* Move sound – every 6 ticks while moving */
    if (moved && (distance % 6 === 0)) sndMove();

    /* --- ROAD SCROLL --- */
    roadY = (roadY + gameSpeed) % (MARKER_H + MARKER_GAP);

    /* --- SCORE / DISTANCE --- */
    distance++;
    score = distance;
    tickEngine();

    /* --- SPEED RAMP --- */
    var newLevel = ((distance / 400) | 0) + 1;
    if (newLevel > speedLevel) {
        speedLevel    = newLevel;
        baseSpeed     = 2.5 + (speedLevel - 1) * 0.6;
        if (baseSpeed > 9) baseSpeed = 9;
        spawnInterval = 60 - speedLevel * 4;
        if (spawnInterval < 18) spawnInterval = 18;
        speedMsgTimer = 90;
        /* Only update gameSpeed if no boost active */
        if (!nitroActive && !turboActive) gameSpeed = baseSpeed;
    }

    /* --- SPAWN --- */
    spawnTimer++;
    if (spawnTimer >= spawnInterval) {
        spawnTimer = 0;
        spawnTraffic();
        /* Extra car at higher speeds */
        if (speedLevel >= 4 && Math.random() < 0.4) spawnTraffic();
    }

    /* --- NITRO SPAWN --- */
    nitroSpawnClock++;
    if (nitroSpawnClock >= NITRO_SPAWN_EVERY && !nitro.alive && !nitroActive) {
        /* Find a clear lane – try up to LANES times */
        var nl = -1;
        for (var nlt = 0; nlt < LANES; nlt++) {
            var nlc = ((Math.random() * LANES) | 0);
            if (laneIsClearForPickup(nlc)) { nl = nlc; break; }
        }
        if (nl >= 0) {
            nitroSpawnClock = 0;
            nitro.x = ROAD_X + nl * LANE_W + (LANE_W - 14) / 2;
            nitro.y = -20;
            nitro.alive = true;
            nitroBlink  = 0;
        }
    }

    /* --- NITRO MOVE + COLLECT --- */
    if (nitro.alive) {
        nitro.y += gameSpeed * 1.1;
        nitroBlink = (nitroBlink + 1) % 20;
        if (nitro.y > H + 10) { nitro.alive = false; }
        /* Collect */
        if (collides(playerX - CAR_W/2, playerY, CAR_W, CAR_H,
                     nitro.x, nitro.y, 14, 22)) {
            nitro.alive  = false;
            nitroActive  = true;
            nitroTicks   = NITRO_EFFECT;
            nitroMsgTimer = 60;
            gameSpeed   += 3;
            if (gameSpeed > 14) gameSpeed = 14;
            sndNitro();
        }
    }

    /* --- NITRO EFFECT COUNTDOWN --- */
    if (nitroActive) {
        nitroTicks--;
        if (nitroMsgTimer > 0) nitroMsgTimer--;
        if (nitroTicks <= 0) {
            nitroActive = false;
            if (!turboActive) gameSpeed = baseSpeed;
        }
    }

    /* --- COIN SPAWN + MOVE + COLLECT --- */
    coinSpawnClock++;
    if (coinSpawnClock >= COIN_SPAWN_EVERY && !coin.alive) {
        var cl = -1;
        for (var clt = 0; clt < LANES; clt++) {
            var clc = ((Math.random() * LANES) | 0);
            if (laneIsClearForPickup(clc)) { cl = clc; break; }
        }
        if (cl >= 0) {
            coinSpawnClock = 0;
            coin.x = ROAD_X + cl * LANE_W + (LANE_W - 12) / 2;
            coin.y = -16;
            coin.alive = true;
            coinBlink  = 0;
        }
    }
    if (coin.alive) {
        coin.y += gameSpeed * 1.1;
        coinBlink = (coinBlink + 1) % 16;
        if (coin.y > H + 10) { coin.alive = false; }
        if (collides(playerX - CAR_W/2, playerY, CAR_W, CAR_H,
                     coin.x, coin.y, 12, 12)) {
            coin.alive = false;
            score += 20;
            coinMsgTimer = 40;
            sndCoin();
            if (score > hiScore) { hiScore = score; saveHi(); }
        }
    }
    if (coinMsgTimer > 0) coinMsgTimer--;

    /* --- TURBO SPAWN + MOVE + COLLECT --- */
    turboSpawnClock++;
    if (turboSpawnClock >= TURBO_SPAWN_EVERY && !turbo.alive && !turboActive) {
        var tl2 = -1;
        for (var tlt = 0; tlt < LANES; tlt++) {
            var tlc = ((Math.random() * LANES) | 0);
            if (laneIsClearForPickup(tlc)) { tl2 = tlc; break; }
        }
        if (tl2 >= 0) {
            turboSpawnClock = 0;
            turbo.x = ROAD_X + tl2 * LANE_W + (LANE_W - 16) / 2;
            turbo.y = -24;
            turbo.alive = true;
            turboBlink  = 0;
        }
    }
    if (turbo.alive) {
        turbo.y += gameSpeed * 1.1;
        turboBlink = (turboBlink + 1) % 20;
        if (turbo.y > H + 10) { turbo.alive = false; }
        if (collides(playerX - CAR_W/2, playerY, CAR_W, CAR_H,
                     turbo.x, turbo.y, 16, 24)) {
            turbo.alive   = false;
            turboActive   = true;
            turboTicks    = TURBO_EFFECT;
            turboMsgTimer = 60;
            gameSpeed     = baseSpeed + 6;
            if (gameSpeed > 18) gameSpeed = 18;
            sndTurbo();
        }
    }

    /* --- TURBO EFFECT COUNTDOWN --- */
    if (turboActive) {
        turboTicks--;
        turboBlinkState = (turboBlinkState + 1) % 8;
        if (turboMsgTimer > 0) turboMsgTimer--;
        if (turboTicks <= 0) {
            turboActive = false;
            turboBlinkState = 0;
            if (!nitroActive) gameSpeed = baseSpeed;
        }
    }

    /* --- IDLE LANE PUNISHMENT --- */
    var curLane = ((playerX - ROAD_X) / LANE_W) | 0;
    if (curLane < 0) curLane = 0;
    if (curLane >= LANES) curLane = LANES - 1;
    if (curLane === lastPlayerLane) {
        idleTicks++;
        if (idleTicks === IDLE_LIMIT - 30) idleWarning = 30; /* warn 1s before */
        if (idleTicks >= IDLE_LIMIT) {
            idleTicks = 0;
            spawnTraffic(curLane);  /* force car into idle lane */
        }
    } else {
        lastPlayerLane = curLane;
        idleTicks      = 0;
        idleWarning    = 0;
    }
    if (idleWarning > 0) idleWarning--;

    /* --- TRAFFIC MOVE + COLLISION --- */
    var px = playerX - CAR_W/2;
    var py = playerY;
    var crashed = false;

    for (var i = 0; i < MAX_TRAFFIC; i++) {
        var t = traffic[i];
        if (!t.alive) continue;

        t.y += gameSpeed * 1.1;

        if (t.y > H + 10) { t.alive = false; continue; }

        /* Collision */
        if (collides(px, py, CAR_W, CAR_H, t.x, t.y, t.w, t.h)) {
            if (nitroActive || turboActive) {
                /* RAM: score points, kill the car, no crash */
                score += turboActive ? 30 : 20;
                t.alive = false;
                nearMissTimer = 30;
                sndNearMiss();
            } else {
                crashed = true; break;
            }
        }

        /* Near miss bonus */
        if (!crashed && t.y + t.h >= py - 10 && t.y + t.h <= py + 20) {
            var gap = Math.min(
                Math.abs(px - (t.x + t.w)),
                Math.abs(t.x - (px + CAR_W))
            );
            if (gap < 10 && gap >= 0) {
                score += 5;
                nearMissTimer = 40;
                sndNearMiss();
            }
        }
    }

    if (crashed) {
        sndCrash();
        shakeTick = SHAKE_MAX;
        if (score > hiScore) {
            hiScore = score; newHi = true; saveHi(); sndHiScore();
        }
        screen = SC_DEAD;
        return;
    }

    /* --- SHAKE COUNTDOWN --- */
    if (shakeTick > 0) shakeTick--;

    /* --- NEAR MISS TIMER --- */
    if (nearMissTimer > 0) nearMissTimer--;

    /* --- SPEED MSG TIMER --- */
    if (speedMsgTimer > 0) speedMsgTimer--;

    /* --- SCAN FLASH --- */
    scanTimer++;
    if (scanTimer >= SCAN_EVERY) { scanTimer = 0; scanFlash = 50; }
    if (scanFlash > 0) scanFlash--;
}

/* ---------------------------------------------------------
   DRAW HELPERS
--------------------------------------------------------- */

function centered(txt, y, size, col) {
    ctx.fillStyle = col || "#aaa";
    ctx.font = size + "px monospace";
    var tw = ctx.measureText(txt).width;
    ctx.fillText(txt, (W - tw) >> 1, y);
}

function fillBtn(x, y, w, h, label, active) {
    ctx.fillStyle = active ? "#333" : "#111";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = active ? "#aaa" : "#444";
    ctx.lineWidth = 1;
    ctx.strokeRect(x+0.5, y+0.5, w-1, h-1);
    ctx.fillStyle = active ? "#fff" : "#777";
    ctx.font = "11px monospace";
    var tw = ctx.measureText(label).width;
    ctx.fillText(label, x + ((w - tw) >> 1), y + h - 7);
}

/* Draw player car – vibrant, wide, distinctive */
function drawPlayerCar(cx, cy) {
    /* Blink every 4 ticks when turbo active */
    if (turboActive && turboBlinkState >= 4) return;

    var x = (cx - CAR_W/2) | 0;
    var y = cy | 0;

    /* Base colour: bright orange-red normally,
       green tint for nitro, cyan for turbo */
    var bodyCol  = turboActive ? "#00ddee" :
                   nitroActive ? "#00ee66" : "#ff4400";
    var darkCol  = turboActive ? "#004455" :
                   nitroActive ? "#004422" : "#882200";
    var trimCol  = turboActive ? "#88ffff" :
                   nitroActive ? "#88ffaa" : "#ff8833";

    /* ---- BODY ---- */
    /* Wide centre hull */
    ctx.fillStyle = bodyCol;
    ctx.fillRect(x + 4,  y + 8,  CAR_W - 8,  CAR_H - 10);
    /* Flared fenders – wider than hull */
    ctx.fillRect(x,      y + 18, CAR_W,       CAR_H - 36);
    /* Roof – narrower */
    ctx.fillRect(x + 10, y,      CAR_W - 20,  16);

    /* ---- WINDSCREEN ---- */
    ctx.fillStyle = darkCol;
    ctx.fillRect(x + 11, y + 2,  CAR_W - 22, 12);

    /* ---- SIDE VENTS ---- */
    ctx.fillStyle = darkCol;
    ctx.fillRect(x + 2,  y + 22, 6,  8);
    ctx.fillRect(x + CAR_W - 8, y + 22, 6, 8);

    /* ---- HOOD STRIPES ---- */
    ctx.fillStyle = trimCol;
    ctx.fillRect(x + (CAR_W>>1) - 3, y + 8,  3, 10);
    ctx.fillRect(x + (CAR_W>>1) + 1, y + 8,  3, 10);

    /* ---- REAR WINDOW ---- */
    ctx.fillStyle = darkCol;
    ctx.fillRect(x + 11, y + CAR_H - 18, CAR_W - 22, 10);

    /* ---- REAR DIFFUSER ---- */
    ctx.fillStyle = "#222";
    ctx.fillRect(x + 4,  y + CAR_H - 6, CAR_W - 8, 6);
    /* diffuser slots */
    ctx.fillStyle = darkCol;
    ctx.fillRect(x + 8,  y + CAR_H - 5, 6, 4);
    ctx.fillRect(x + 18, y + CAR_H - 5, 6, 4);
    ctx.fillRect(x + CAR_W - 24, y + CAR_H - 5, 6, 4);
    ctx.fillRect(x + CAR_W - 14, y + CAR_H - 5, 6, 4);

    /* ---- HEADLIGHTS (top = front going away from player) ---- */
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + 4,  y + 8,  10, 6);
    ctx.fillRect(x + CAR_W - 14, y + 8, 10, 6);
    /* Inner bright spot */
    ctx.fillStyle = "#ffffcc";
    ctx.fillRect(x + 6,  y + 9,  6, 4);
    ctx.fillRect(x + CAR_W - 12, y + 9, 6, 4);

    /* ---- TAILLIGHTS (bottom = facing player) ---- */
    ctx.fillStyle = turboActive ? "#ff2222" : "#dd1100";
    ctx.fillRect(x + 4,  y + CAR_H - 10, 12, 8);
    ctx.fillRect(x + CAR_W - 16, y + CAR_H - 10, 12, 8);
    /* Bright centre strip */
    ctx.fillStyle = "#ff6644";
    ctx.fillRect(x + 6,  y + CAR_H - 9, 8, 5);
    ctx.fillRect(x + CAR_W - 14, y + CAR_H - 9, 8, 5);

    /* ---- EXHAUST FLAMES ---- */
    if (turboActive) {
        ctx.fillStyle = turboBlinkState < 2 ? "#00ffff" : "#0088aa";
        ctx.fillRect(x + 10, y + CAR_H,     8, 6);
        ctx.fillRect(x + CAR_W - 18, y + CAR_H, 8, 6);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x + 12, y + CAR_H,     4, 3);
        ctx.fillRect(x + CAR_W - 16, y + CAR_H, 4, 3);
    } else if (nitroActive) {
        ctx.fillStyle = "#00ff44";
        ctx.fillRect(x + 10, y + CAR_H,     8, 5);
        ctx.fillRect(x + CAR_W - 18, y + CAR_H, 8, 5);
    }
}

/* Draw a traffic car */
function drawTrafficCar(t) {
    var x = t.x | 0;
    var y = t.y | 0;

    ctx.fillStyle = t.col;
    ctx.fillRect(x + 2, y,       t.w - 4, t.h);
    ctx.fillRect(x,     y + 8,   t.w,     t.h - 20);

    /* Windscreen */
    ctx.fillStyle = "#222";
    ctx.fillRect(x + 4, y + 4, t.w - 8, 10);

    /* Headlights (bottom = approaching) */
    ctx.fillStyle = "#ddd";
    ctx.fillRect(x + 2,       y + t.h - 6, 5, 4);
    ctx.fillRect(x + t.w - 7, y + t.h - 6, 5, 4);
}

/* ---------------------------------------------------------
   DRAW
--------------------------------------------------------- */

function draw() {
    if (window.__removeSkeleton) window.__removeSkeleton();

    /* Shake offset */
    var sx = 0, sy = 0;
    if (shakeTick > 0) {
        sx = ((Math.random() * 6) | 0) - 3;
        sy = ((Math.random() * 4) | 0) - 2;
    }

    ctx.save();
    if (shakeTick > 0) ctx.translate(sx, sy);

    /* BG */
    ctx.fillStyle = "#000";
    ctx.fillRect(-4, -4, W + 8, H + 8);

    /* ---- MENU ---- */
    if (screen === SC_MENU) {
        ctx.restore();

        centered("TERMINAL ARCADE", 55,  13, "#444");
        centered("NIGHT CIRCUIT",   98,  26, "#ccc");
        centered("LOW-LIGHT TRAFFIC SIMULATION", 126, 11, "#555");

        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(220, 152, 200, 28);
        ctx.strokeStyle = "#444"; ctx.lineWidth = 1;
        ctx.strokeRect(220.5, 152.5, 199, 27);
        centered("ENTER = START", 171, 13, "#bbb");

        centered("HIGH SCORE: " + hiScore, 212, 13, "#444");

        centered("A/D or ARROWS = DRIVE   P = PAUSE", 248, 10, "#333");
        centered("F = FULLSCREEN   ESC = EXIT",        262, 10, "#333");
        return;
    }

    /* ---- ROAD ---- */

    /* Road surface */
    ctx.fillStyle = "#111";
    ctx.fillRect(ROAD_X, 0, ROAD_W, H);

    /* Shoulder lines */
    ctx.fillStyle = "#444";
    ctx.fillRect(ROAD_X,     0, 3, H);
    ctx.fillRect(ROAD_R - 3, 0, 3, H);

    /* Scrolling lane markers */
    ctx.fillStyle = "#2a2a2a";
    for (var lane = 1; lane < LANES; lane++) {
        var lx = (ROAD_X + lane * LANE_W) | 0;
        var my = (-roadY | 0);
        while (my < H) {
            ctx.fillRect(lx - 1, my, 2, MARKER_H);
            my += MARKER_H + MARKER_GAP;
        }
    }

    /* Side scenery – tiny buildings */
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0,       0, ROAD_X - 2,       H);
    ctx.fillRect(ROAD_R + 3, 0, W - ROAD_R - 3, H);

    /* Simple building silhouettes left */
    ctx.fillStyle = "#141414";
    ctx.fillRect(8,  60,  30, H - 60);
    ctx.fillRect(44, 90,  20, H - 90);
    ctx.fillRect(70, 40,  25, H - 40);
    /* Right */
    ctx.fillRect(W - 38, 50,  30, H - 50);
    ctx.fillRect(W - 65, 80,  20, H - 80);
    ctx.fillRect(W - 90, 30,  22, H - 30);

    /* ---- TRAFFIC ---- */
    for (var i = 0; i < MAX_TRAFFIC; i++) {
        if (traffic[i].alive) drawTrafficCar(traffic[i]);
    }

    /* ---- NITRO PICKUP ---- */
    if (nitro.alive && nitroBlink < 16) {
        var nx2 = nitro.x | 0;
        var ny2 = nitro.y | 0;
        ctx.fillStyle = "#446644";
        ctx.fillRect(nx2,     ny2 + 4,  14, 14);
        ctx.fillStyle = "#66aa66";
        ctx.fillRect(nx2 + 3, ny2,       8,  5);
        ctx.fillStyle = "#88cc88";
        ctx.fillRect(nx2 + 5, ny2 - 3,   4,  4);
        ctx.fillStyle = "#335533";
        ctx.fillRect(nx2 + 1, ny2 + 9,  12,  3);
        ctx.fillStyle = "#aaffaa";
        ctx.font = "6px monospace";
        ctx.fillText("NOS", nx2 + 1, ny2 + 20);
    }

    /* ---- COIN PICKUP ---- */
    if (coin.alive && coinBlink < 13) {
        var cnx = coin.x | 0;
        var cny = coin.y | 0;
        /* Coin: yellow circle-ish using rects */
        ctx.fillStyle = "#aaaa00";
        ctx.fillRect(cnx + 2, cny,      8,  12);
        ctx.fillRect(cnx,     cny + 2,  12, 8);
        ctx.fillStyle = "#888800";
        ctx.fillRect(cnx + 3, cny + 2,  6,  8);
        ctx.fillStyle = "#dddd00";
        ctx.fillRect(cnx + 4, cny + 1,  4,  2);
        ctx.font = "6px monospace";
        ctx.fillStyle = "#ffff44";
        ctx.fillText("$", cnx + 4, cny + 9);
    }

    /* ---- TURBO PICKUP ---- */
    if (turbo.alive && turboBlink < 16) {
        var tbx = turbo.x | 0;
        var tby = turbo.y | 0;
        /* Turbo: cyan lightning bolt shape */
        ctx.fillStyle = "#006688";
        ctx.fillRect(tbx,      tby + 6,  16, 12);
        ctx.fillStyle = "#00aacc";
        ctx.fillRect(tbx + 2,  tby,       8,  8);
        ctx.fillRect(tbx + 6,  tby + 8,   8,  8);
        ctx.fillStyle = "#00eeff";
        ctx.fillRect(tbx + 4,  tby + 3,   4,  4);
        ctx.fillRect(tbx + 8,  tby + 11,  4,  4);
        ctx.font = "6px monospace";
        ctx.fillStyle = "#88ffff";
        ctx.fillText("T", tbx + 6, tby + 22);
    }

    /* ---- PLAYER ---- */
    drawPlayerCar(playerX, playerY);

    /* Idle lane warning */
    if (idleWarning > 0) {
        ctx.fillStyle = "#aa4400";
        ctx.font = "10px monospace";
        var wt = ctx.measureText("MOVE!").width;
        ctx.fillText("MOVE!", (playerX | 0) - (wt >> 1), playerY - 8);
    }

    /* ---- HUD ---- */
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, ROAD_X - 3, 80);

    ctx.fillStyle = "#555";
    ctx.font = "10px monospace";
    ctx.fillText("DIST",  8, 16);
    ctx.fillStyle = "#ccc";
    ctx.font = "13px monospace";
    ctx.fillText(score,   8, 30);

    ctx.fillStyle = "#444";
    ctx.font = "10px monospace";
    ctx.fillText("HIGH",  8, 48);
    ctx.fillStyle = "#888";
    ctx.font = "12px monospace";
    ctx.fillText(hiScore, 8, 62);

    ctx.fillStyle = "#333";
    ctx.font = "10px monospace";
    ctx.fillText("SPD:" + speedLevel, 8, 78);

    /* Nitro bar */
    if (nitroActive) {
        ctx.fillStyle = "#224422";
        ctx.fillRect(8, 86, 100, 8);
        ctx.fillStyle = "#44aa44";
        ctx.fillRect(8, 86, ((nitroTicks / NITRO_EFFECT) * 100) | 0, 8);
        ctx.fillStyle = "#88ff88";
        ctx.font = "9px monospace";
        ctx.fillText("NITRO", 8, 104);
    }

    /* Turbo bar */
    if (turboActive) {
        ctx.fillStyle = "#003344";
        ctx.fillRect(8, 86, 100, 8);
        ctx.fillStyle = "#00aacc";
        ctx.fillRect(8, 86, ((turboTicks / TURBO_EFFECT) * 100) | 0, 8);
        ctx.fillStyle = "#00eeff";
        ctx.font = "9px monospace";
        ctx.fillText("TURBO", 8, 104);
    }

    /* Nitro activated message */
    if (nitroMsgTimer > 0) {
        centered("NITRO BOOST!", H / 2 - 28, 16, "#44cc44");
        centered("RAM TRAFFIC = +20", H / 2 - 8, 11, "#336633");
    }

    /* Turbo activated message */
    if (turboMsgTimer > 0) {
        centered("TURBO!", H / 2 - 28, 20, "#00eeff");
        centered("INVINCIBLE + RAM = +30", H / 2 - 4, 11, "#005566");
    }

    /* Coin collect message */
    if (coinMsgTimer > 0) {
        ctx.fillStyle = "#dddd00";
        ctx.font = "12px monospace";
        var ct = "+20";
        var ctw = ctx.measureText(ct).width;
        ctx.fillText(ct, (playerX | 0) - (ctw >> 1), playerY - 10);
    }

    /* Near miss flash */
    if (nearMissTimer > 0) {
        ctx.fillStyle = "#aaaa00";
        ctx.font = "10px monospace";
        ctx.fillText("+5", ROAD_X + 4, playerY - 6);
    }

    /* Speed level message */
    if (speedMsgTimer > 0) {
        centered("SPEED LEVEL " + speedLevel, H / 2 - 10, 14, "#666");
    }

    /* Scan flash */
    if (scanFlash > 30) {
        centered("SYSTEM SCAN...", H / 2, 13, "#335533");
    }

    /* Paused overlay – drawn BEFORE restore so it covers road */
    if (paused && screen === SC_PLAY) {
        ctx.fillStyle = "#000";
        for (var pi = 0; pi < H; pi += 2) ctx.fillRect(0, pi, W, 1);
        centered("PAUSED",     H/2 - 10, 18, "#aaa");
        centered("P = RESUME", H/2 + 16, 11, "#555");
    }

    ctx.restore();

    /* ---- DEATH SCREEN (no shake) ---- */
    if (screen === SC_DEAD) {
        ctx.fillStyle = "#000";
        for (var di = 0; di < H; di += 2) ctx.fillRect(0, di, W, 1);

        centered("CONNECTION LOST",     122, 20, "#ccc");
        centered("DISTANCE: " + score,  158, 14, "#aaa");
        centered("HIGH: "    + hiScore, 180, 12, "#666");
        if (newHi) centered("*** NEW HIGH SCORE ***", 202, 12, "#888");

        ctx.fillStyle = "#111";
        ctx.fillRect(220, 220, 200, 28);
        ctx.strokeStyle = "#444"; ctx.lineWidth = 1;
        ctx.strokeRect(220.5, 220.5, 199, 27);
        centered("ENTER = PLAY AGAIN", 239, 13, "#bbb");
    }
}

/* ---------------------------------------------------------
   LOOP  – fixed ~30 FPS
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
