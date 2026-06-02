/* =========================================================
   STARTRAIL.JS
   Terminal Arcade – Endless Runner Protocol
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
   AUDIO
--------------------------------------------------------- */
var ST_AC = null;
function getSTAC() {
    if (!ST_AC) {
        try { ST_AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
    }
    return ST_AC;
}
function stBeep(freq, dur, type, vol) {
    var ac = getSTAC(); if (!ac) return;
    try {
        var o = ac.createOscillator();
        var g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = type || "square";
        o.frequency.setValueAtTime(freq, ac.currentTime);
        g.gain.setValueAtTime(vol || 0.06, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        o.start(ac.currentTime); o.stop(ac.currentTime + dur);
    } catch(e){}
}
function sndJump()     { stBeep(440, 0.06, "square",   0.05); }
function sndNearMiss() { stBeep(660, 0.05, "square",   0.05); }
function sndGameOver() {
    stBeep(220, 0.10, "sawtooth", 0.08);
    setTimeout(function(){ stBeep(180, 0.10, "sawtooth", 0.08); }, 110);
    setTimeout(function(){ stBeep(140, 0.18, "sawtooth", 0.10); }, 220);
}
function sndHiScore()  {
    stBeep(440, 0.07, "square", 0.06);
    setTimeout(function(){ stBeep(550, 0.07, "square", 0.06); }, 90);
    setTimeout(function(){ stBeep(660, 0.10, "square", 0.08); }, 180);
}
function sndSpeedUp()  { stBeep(330, 0.05, "square", 0.05);
                         setTimeout(function(){ stBeep(440, 0.08, "square", 0.06); }, 60); }
function sndBonus()    { stBeep(550, 0.06, "sine", 0.05); }

/* ---------------------------------------------------------
   SCREENS
--------------------------------------------------------- */
var SC_MENU = 0;
var SC_PLAY = 1;
var SC_DEAD = 2;
var screen  = SC_MENU;

/* ---------------------------------------------------------
   HIGH SCORE
--------------------------------------------------------- */
var hiScore = 0;
var newHi   = false;
try { hiScore = parseInt(localStorage.getItem("terminalarcade_startrail_hi") || "0", 10); } catch(e){}
function saveHi() { try { localStorage.setItem("terminalarcade_startrail_hi", hiScore); } catch(e){} }

/* ---------------------------------------------------------
   CONSTANTS
--------------------------------------------------------- */
var GROUND_Y    = H - 60;   /* y of ground line            */
var PLAYER_X    = 90;       /* player fixed x              */
var PLAYER_W    = 18;
var PLAYER_H    = 32;

/* Obstacle pool */
var MAX_OBS     = 8;

/* ---------------------------------------------------------
   STATE
--------------------------------------------------------- */
var score       = 0;
var distance    = 0;
var gameSpeed   = 3.5;
var baseSpeed   = 3.5;
var paused      = false;
var startTime   = 0;
var timeSurvived = 0;  /* seconds */
var obstaclesAvoided = 0;
var speedLevel  = 1;
var speedMsgTimer = 0;

/* Player physics */
var playerY     = GROUND_Y - PLAYER_H;
var velY        = 0;
var onGround    = true;
var GRAVITY     = 0.7;
var JUMP_VY     = -13;
var jumpQueued  = false;

/* Double jump */
var jumpsLeft   = 2;

/* Near miss */
var nearMissTimer = 0;

/* Survival bonus */
var bonusTick   = 0;
var BONUS_EVERY = 900;  /* 30s at 30fps */
var bonusMsg    = 0;

/* Obstacles pool – reused, no GC */
var obs = [];
for (var oi = 0; oi < MAX_OBS; oi++) {
    obs.push({ x:0, y:0, w:0, h:0, alive:false, type:0 });
}

/* Obstacle spawn */
var spawnTimer    = 0;
var spawnInterval = 80;
var lastObsX      = W + 200;  /* prevent instant double-spawn */

/* Background stars – static array, computed once */
var STAR_COUNT = 40;
var stars = [];
for (var si = 0; si < STAR_COUNT; si++) {
    stars.push({
        x: (Math.random() * W) | 0,
        y: (Math.random() * (GROUND_Y - 20)) | 0,
        s: Math.random() < 0.3 ? 2 : 1
    });
}

/* Obstacle types */
var OBS_TYPES = [
    /* spike   */ { w:14, h:28, col:"#ccc" },
    /* wall    */ { w:18, h:48, col:"#aaa" },
    /* low bar */ { w:36, h:14, col:"#bbb" },
    /* block   */ { w:22, h:22, col:"#999" },
    /* tall    */ { w:12, h:56, col:"#ddd" }
];

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
function initGame() {
    score          = 0;
    distance       = 0;
    gameSpeed      = 3.5;
    baseSpeed      = 3.5;
    paused         = false;
    newHi          = false;
    playerY        = GROUND_Y - PLAYER_H;
    velY           = 0;
    onGround       = true;
    jumpsLeft      = 2;
    jumpQueued     = false;
    speedLevel     = 1;
    speedMsgTimer  = 0;
    spawnTimer     = 0;
    spawnInterval  = 80;
    lastObsX       = W + 200;
    nearMissTimer  = 0;
    bonusTick      = 0;
    bonusMsg       = 0;
    obstaclesAvoided = 0;
    startTime      = Date.now();
    timeSurvived   = 0;
    for (var i = 0; i < MAX_OBS; i++) obs[i].alive = false;
    screen = SC_PLAY;
}

/* ---------------------------------------------------------
   SPAWN OBSTACLE
--------------------------------------------------------- */
function spawnObs() {
    /* Don't spawn too close to last obstacle */
    for (var i = 0; i < MAX_OBS; i++) {
        if (obs[i].alive && obs[i].x > W - 80) return;
    }
    for (var i = 0; i < MAX_OBS; i++) {
        if (!obs[i].alive) {
            var tp = OBS_TYPES[(Math.random() * OBS_TYPES.length) | 0];
            obs[i].w     = tp.w;
            obs[i].h     = tp.h;
            obs[i].col   = tp.col;
            obs[i].x     = W + 10;
            obs[i].y     = GROUND_Y - tp.h;
            obs[i].alive = true;
            return;
        }
    }
}

/* ---------------------------------------------------------
   INPUT
--------------------------------------------------------- */
var jumpKeys = false;

function doJump() {
    if (jumpsLeft > 0) {
        velY = JUMP_VY;
        jumpsLeft--;
        onGround = false;
        sndJump();
    }
}

document.addEventListener("keydown", function(e) {
    var k = e.code;
    if (k === "Space" || k === "ArrowUp") e.preventDefault();

    if (screen === SC_MENU && (k === "Enter" || k === "Space" || k === "KeyW" || k === "ArrowUp")) {
        initGame(); return;
    }
    if (screen === SC_DEAD && (k === "Enter" || k === "Space" || k === "KeyW" || k === "ArrowUp")) {
        initGame(); return;
    }
    if (k === "Escape") { if (screen === SC_PLAY) screen = SC_MENU; return; }
    if (k === "KeyP" && screen === SC_PLAY) { paused = !paused; return; }
    if (k === "KeyF") { toggleSTFS(); return; }

    if (screen !== SC_PLAY || paused) return;
    if (k === "Space" || k === "KeyW" || k === "ArrowUp") { doJump(); }
});

function toggleSTFS() {
    if (!document.fullscreenElement) {
        if (canvas.requestFullscreen) canvas.requestFullscreen();
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
    }
}

/* ---------------------------------------------------------
   TOUCH CONTROLS – external DOM buttons
--------------------------------------------------------- */
var isTouchST = (typeof window !== "undefined" &&
    window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

if (isTouchST) {
    var stDpad = document.createElement("div");
    stDpad.id = "st-dpad";
    stDpad.style.cssText = [
        "display:flex", "gap:6px", "padding:8px",
        "background:#000", "justify-content:center",
        "width:640px", "max-width:100%", "box-sizing:border-box"
    ].join(";");

    function mkSTBtn(label, id) {
        var b = document.createElement("button");
        b.id = id;
        b.textContent = label;
        b.style.cssText = [
            "font-family:monospace", "font-size:20px",
            "background:#111", "color:#aaa",
            "border:1px solid #444",
            "flex:1", "height:64px",
            "cursor:pointer",
            "-webkit-tap-highlight-color:transparent",
            "user-select:none"
        ].join(";");
        return b;
    }

    var stBtnJump  = mkSTBtn("JUMP ↑",  "st-jump");
    var stBtnPause = mkSTBtn("II",       "st-pause");
    stBtnPause.style.flex = "0 0 64px";
    stDpad.appendChild(stBtnJump);
    stDpad.appendChild(stBtnPause);
    canvas.parentNode.insertBefore(stDpad, canvas.nextSibling);

    stBtnJump.addEventListener("touchstart", function(e) {
        e.preventDefault();
        stBtnJump.style.background = "#333";
        if (screen === SC_MENU || screen === SC_DEAD) {
            if (typeof requestLandscape === "function") requestLandscape();
            initGame(); return;
        }
        if (screen === SC_PLAY && !paused) doJump();
    }, { passive: false });
    stBtnJump.addEventListener("touchend", function(e) {
        e.preventDefault();
        stBtnJump.style.background = "#111";
    }, { passive: false });

    stBtnPause.addEventListener("touchstart", function(e) {
        e.preventDefault();
        if (screen === SC_PLAY) {
            paused = !paused;
            stBtnPause.textContent = paused ? "▶" : "II";
        }
    }, { passive: false });
}

/* Canvas tap for menu/dead */
canvas.addEventListener("touchstart", function(e) {
    e.preventDefault();
    if (screen === SC_MENU || screen === SC_DEAD) {
        if (typeof requestLandscape === "function") requestLandscape();
        initGame();
    } else if (screen === SC_PLAY && !paused) {
        doJump();
    }
}, { passive: false });

canvas.addEventListener("click", function(e) {
    if (screen === SC_MENU || screen === SC_DEAD) { initGame(); }
});

/* ---------------------------------------------------------
   INJECT PAUSE BUTTON into overlay topbar
--------------------------------------------------------- */
(function() {
    var topbar = document.getElementById("overlay-topbar");
    if (!topbar || document.getElementById("st-pause-top")) return;
    var pb = document.createElement("button");
    pb.id = "st-pause-top";
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
        pb.textContent = paused ? "▶ RESUME" : "II PAUSE";
    });
    topbar.appendChild(pb);
})();

/* ---------------------------------------------------------
   UPDATE
--------------------------------------------------------- */
function update() {
    if (screen !== SC_PLAY || paused) return;

    /* Time */
    timeSurvived = ((Date.now() - startTime) / 1000) | 0;

    /* Survival bonus every 30s */
    bonusTick++;
    if (bonusTick >= BONUS_EVERY) {
        bonusTick = 0;
        score += 50;
        bonusMsg = 60;
        sndBonus();
    }
    if (bonusMsg > 0) bonusMsg--;

    /* Distance + score */
    distance++;
    score = distance + (obstaclesAvoided * 2);

    /* Speed ramp every 300 distance */
    var newLevel = ((distance / 300) | 0) + 1;
    if (newLevel > speedLevel) {
        speedLevel    = newLevel;
        baseSpeed     = 3.5 + (speedLevel - 1) * 0.5;
        if (baseSpeed > 12) baseSpeed = 12;
        gameSpeed     = baseSpeed;
        spawnInterval = 80 - speedLevel * 5;
        if (spawnInterval < 28) spawnInterval = 28;
        speedMsgTimer = 75;
        sndSpeedUp();
    }
    if (speedMsgTimer > 0) speedMsgTimer--;

    /* Player physics */
    velY += GRAVITY;
    playerY += velY;

    if (playerY >= GROUND_Y - PLAYER_H) {
        playerY  = GROUND_Y - PLAYER_H;
        velY     = 0;
        onGround = true;
        jumpsLeft = 2;
    } else {
        onGround = false;
    }

    /* Spawn */
    spawnTimer++;
    if (spawnTimer >= spawnInterval) {
        spawnTimer = 0;
        spawnObs();
    }

    /* Move obstacles + collision */
    var px = PLAYER_X;
    var py = playerY | 0;
    var crashed = false;

    for (var i = 0; i < MAX_OBS; i++) {
        var o = obs[i];
        if (!o.alive) continue;
        o.x -= gameSpeed;

        /* Off screen */
        if (o.x + o.w < 0) {
            o.alive = false;
            obstaclesAvoided++;
            continue;
        }

        /* AABB collision – tight hitbox (2px shrink) */
        if (px + 2         < o.x + o.w &&
            px + PLAYER_W - 2 > o.x     &&
            py + 2         < o.y + o.h  &&
            py + PLAYER_H - 2 > o.y) {
            crashed = true; break;
        }

        /* Near miss: passed within 10px horizontally */
        if (o.x + o.w >= px - 10 && o.x + o.w < px + 2) {
            var vertGap = Math.min(
                Math.abs(py - (o.y + o.h)),
                Math.abs((py + PLAYER_H) - o.y)
            );
            if (vertGap < 16) {
                score += 3;
                nearMissTimer = 35;
                sndNearMiss();
            }
        }
    }

    if (nearMissTimer > 0) nearMissTimer--;

    if (crashed) {
        if (score > hiScore) { hiScore = score; newHi = true; saveHi(); sndHiScore(); }
        else sndGameOver();
        try { if (navigator.vibrate) navigator.vibrate([30, 20, 30]); } catch(e){}
        screen = SC_DEAD;
    }
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

/* Draw the runner character */
function drawRunner(x, y) {
    var cx = (x + PLAYER_W / 2) | 0;
    /* Head */
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - 5, y,      10, 10);
    /* Body */
    ctx.fillRect(cx - 3, y + 10, 6,  12);
    /* Arms */
    ctx.fillRect(cx - 9, y + 12, 7,  3);
    ctx.fillRect(cx + 2,  y + 12, 7,  3);
    /* Legs – alternate based on distance for run animation */
    var frame = (distance >> 2) % 2;
    if (frame === 0) {
        ctx.fillRect(cx - 5, y + 22, 4, 10);
        ctx.fillRect(cx + 1,  y + 22, 4,  7);
        ctx.fillRect(cx + 1,  y + 29, 7,  3);
    } else {
        ctx.fillRect(cx - 5, y + 22, 4,  7);
        ctx.fillRect(cx - 9, y + 29, 7,  3);
        ctx.fillRect(cx + 1,  y + 22, 4, 10);
    }
    /* Eye */
    ctx.fillStyle = "#000";
    ctx.fillRect(cx + 2, y + 3, 2, 2);
}

/* Draw one obstacle */
function drawObs(o) {
    var x = o.x | 0;
    var y = o.y | 0;
    ctx.fillStyle = o.col;

    if (o.h > o.w * 2) {
        /* Tall spike / firewall */
        ctx.fillRect(x + 3, y,      o.w - 6, o.h);
        ctx.fillRect(x,     y + 6,  o.w,     o.h - 6);
        /* Top point */
        ctx.fillRect(x + 5, y - 6,  o.w - 10, 6);
    } else if (o.w > o.h * 2) {
        /* Low bar / corrupted data block */
        ctx.fillRect(x,     y,      o.w, o.h);
        /* Glitch lines */
        ctx.fillStyle = "#333";
        ctx.fillRect(x + 4, y + 2,  o.w - 8, 2);
        ctx.fillRect(x + 4, y + 6,  o.w - 8, 2);
    } else {
        /* Regular block */
        ctx.fillRect(x, y, o.w, o.h);
        /* Inner shading */
        ctx.fillStyle = "#333";
        ctx.fillRect(x + 2, y + 2, 4, 4);
        ctx.fillRect(x + o.w - 6, y + 2, 4, 4);
    }
}

/* ---------------------------------------------------------
   DRAW
--------------------------------------------------------- */
function draw() {
    /* BG */
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    /* Stars */
    ctx.fillStyle = "#222";
    for (var si = 0; si < STAR_COUNT; si++) {
        var st = stars[si];
        ctx.fillRect(st.x, st.y, st.s, st.s);
    }

    /* ---- MENU ---- */
    if (screen === SC_MENU) {
        centered("TERMINAL ARCADE",          50,  13, "#444");
        centered("STARTRAIL",                95,  28, "#ccc");
        centered("ENDLESS RUNNER PROTOCOL",  128, 12, "#555");

        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(220, 155, 200, 28);
        ctx.strokeStyle = "#444"; ctx.lineWidth = 1;
        ctx.strokeRect(220.5, 155.5, 199, 27);
        centered("ENTER / SPACE = START",    170, 12, "#bbb");

        centered("HIGH SCORE: " + hiScore,   212, 13, "#444");
        centered("SPACE / W / ↑ = JUMP",     248, 10, "#333");
        centered("P = PAUSE   F = FULLSCREEN   ESC = EXIT", 263, 10, "#333");
        return;
    }

    /* ---- GROUND ---- */
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, GROUND_Y, W, 2);

    /* Scrolling ground detail */
    ctx.fillStyle = "#111";
    var goff = distance % 40;
    for (var gx = -goff; gx < W; gx += 40) {
        ctx.fillRect(gx | 0, GROUND_Y + 4, 20, 1);
    }

    /* ---- OBSTACLES ---- */
    for (var i = 0; i < MAX_OBS; i++) {
        if (obs[i].alive) drawObs(obs[i]);
    }

    /* ---- RUNNER ---- */
    drawRunner(PLAYER_X, playerY | 0);

    /* ---- HUD ---- */
    ctx.fillStyle = "#555";
    ctx.font = "10px monospace";
    ctx.fillText("DIST", 10, 18);
    ctx.fillStyle = "#ccc";
    ctx.font = "13px monospace";
    ctx.fillText(score, 10, 32);

    ctx.fillStyle = "#444";
    ctx.font = "10px monospace";
    ctx.fillText("HIGH", 10, 50);
    ctx.fillStyle = "#888";
    ctx.font = "12px monospace";
    ctx.fillText(hiScore, 10, 64);

    ctx.fillStyle = "#333";
    ctx.font = "10px monospace";
    ctx.fillText("SPD:" + speedLevel, 10, 80);

    /* Time */
    var mm = ((timeSurvived / 60) | 0);
    var ss = timeSurvived % 60;
    var timeStr = (mm > 0 ? mm + "m " : "") + ss + "s";
    ctx.fillStyle = "#333";
    ctx.font = "10px monospace";
    ctx.fillText(timeStr, W - 60, 18);

    /* Near miss flash */
    if (nearMissTimer > 0) {
        ctx.fillStyle = "#aaaa00";
        ctx.font = "10px monospace";
        ctx.fillText("+3", PLAYER_X + 20, playerY - 4);
    }

    /* Speed level message */
    if (speedMsgTimer > 0) {
        centered("SPEED LEVEL " + speedLevel, H / 2 - 20, 15, "#666");
    }

    /* Survival bonus message */
    if (bonusMsg > 0) {
        centered("SURVIVAL BONUS +50", H / 2 - 4, 13, "#558855");
    }

    /* Double jump indicator */
    ctx.fillStyle = jumpsLeft >= 2 ? "#333" : (jumpsLeft === 1 ? "#555" : "#111");
    ctx.fillRect(W - 22, H - GROUND_Y + 2, 12, 6);
    ctx.fillStyle = "#222";
    ctx.font = "8px monospace";
    ctx.fillText("JMP", W - 24, H - GROUND_Y + 18);

    /* Paused */
    if (paused) {
        ctx.fillStyle = "#000";
        for (var pi = 0; pi < H; pi += 2) ctx.fillRect(0, pi, W, 1);
        centered("PAUSED",       H/2 - 10, 18, "#aaa");
        centered("P = RESUME",   H/2 + 16, 11, "#555");
    }

    /* ---- DEATH SCREEN ---- */
    if (screen === SC_DEAD) {
        ctx.fillStyle = "#000";
        for (var di = 0; di < H; di += 2) ctx.fillRect(0, di, W, 1);

        centered("SYSTEM FAILURE",                  115, 20, "#ccc");
        centered("DISTANCE: "  + score,             148, 13, "#aaa");
        centered("TIME: "      + timeSurvived + "s",168, 12, "#888");
        centered("AVOIDED: "   + obstaclesAvoided,  186, 12, "#777");
        if (newHi) centered("*** NEW HIGH SCORE ***", 208, 12, "#999");

        ctx.fillStyle = "#111";
        ctx.fillRect(220, 222, 200, 28);
        ctx.strokeStyle = "#444"; ctx.lineWidth = 1;
        ctx.strokeRect(220.5, 222.5, 199, 27);
        centered("ENTER = PLAY AGAIN", 241, 13, "#bbb");
    }
}

/* ---------------------------------------------------------
   LOOP
--------------------------------------------------------- */
window.__gameInterval = setInterval(function() {
    update();
    draw();
}, 33);
