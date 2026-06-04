/* =========================================================
   SLAPPYWORLD.JS
   Terminal Arcade – Terminal Flight Protocol
   Pixel-art Flappy-style. Lightweight. Fixed FPS.
   ========================================================= */
"use strict";

/* ---------------------------------------------------------
   CANVAS
--------------------------------------------------------- */
var canvas = document.getElementById("pong");
var ctx    = canvas.getContext("2d", { alpha: false });
var W = canvas.width;    /* 640 */
var H = canvas.height;   /* 360 */
ctx.imageSmoothingEnabled = false;

/* ---------------------------------------------------------
   COLOUR PALETTE
--------------------------------------------------------- */
var C = {
    bg:       "#05080d",
    bgLayer1: "#070c12",
    bgLayer2: "#0a1018",
    ground:   "#1a2030",
    gridLine: "#0d1018",
    wall:     "#2a3545",
    wallEdge: "#3a4860",
    wallDark: "#151e2a",
    cyan:     "#3dd0cc",
    cyanDim:  "#1a5f5c",
    amber:    "#d4a843",
    amberDim: "#5a3f10",
    green:    "#4caf70",
    greenDim: "#1a4428",
    red:      "#c03838",
    white:    "#e8e8e8",
    dimText:  "#445566",
    midText:  "#7a8a9a",
    hiText:   "#c8d8e8",
    hudBg:    "#020508",
    hudBord:  "#1a2535"
};

/* ---------------------------------------------------------
   AUDIO
--------------------------------------------------------- */
var SW_AC = null;
function getSWAC() {
    if (!SW_AC) try { SW_AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
    return SW_AC;
}
function swBeep(freq, dur, type, vol) {
    var ac = getSWAC(); if (!ac) return;
    try {
        var o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = type || "square";
        o.frequency.setValueAtTime(freq, ac.currentTime);
        g.gain.setValueAtTime(vol || 0.05, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        o.start(ac.currentTime); o.stop(ac.currentTime + dur);
    } catch(e){}
}
function sndFlap()      { swBeep(320, 0.05, "square",   0.05); }
function sndScore()     { swBeep(660, 0.06, "sine",     0.06);
                          setTimeout(function(){ swBeep(880, 0.06, "sine", 0.05); }, 60); }
function sndCollect()   { swBeep(770, 0.05, "sine",     0.06);
                          setTimeout(function(){ swBeep(990, 0.06, "sine", 0.05); }, 55); }
function sndNearMiss()  { swBeep(500, 0.05, "square",   0.04); }
function sndAchieve()   { swBeep(440, 0.05, "square",   0.05);
                          setTimeout(function(){ swBeep(660, 0.08, "square", 0.06); }, 80); }
function sndGameOver()  {
    swBeep(300, 0.10, "sawtooth", 0.07);
    setTimeout(function(){ swBeep(240, 0.10, "sawtooth", 0.07); }, 110);
    setTimeout(function(){ swBeep(180, 0.18, "sawtooth", 0.09); }, 220);
}
function sndHiScore()   {
    swBeep(440, 0.07, "square", 0.06);
    setTimeout(function(){ swBeep(550, 0.07, "square", 0.06); }, 90);
    setTimeout(function(){ swBeep(660, 0.07, "square", 0.07); }, 180);
    setTimeout(function(){ swBeep(880, 0.10, "square", 0.07); }, 270);
}
function sndMenuSel()   { swBeep(440, 0.05, "square", 0.04); }

/* ---------------------------------------------------------
   SCREENS
--------------------------------------------------------- */
var SC_MENU = 0, SC_PLAY = 1, SC_DEAD = 2;
var screen  = SC_MENU;

/* ---------------------------------------------------------
   HIGH SCORE
--------------------------------------------------------- */
var hiScore   = 0;
var newHi     = false;
var bestDist  = 0;
try {
    hiScore  = parseInt(localStorage.getItem("sw_hi")   || "0", 10);
    bestDist = parseInt(localStorage.getItem("sw_dist") || "0", 10);
} catch(e){}
function saveHi() {
    try {
        localStorage.setItem("sw_hi",   hiScore);
        localStorage.setItem("sw_dist", bestDist);
    } catch(e){}
}

/* ---------------------------------------------------------
   CONSTANTS
--------------------------------------------------------- */
var GRAVITY      = 0.38;
var FLAP_VY      = -6.8;
var BIRD_X       = 110;
var BIRD_R       = 9;          /* collision radius */
var PIPE_W       = 38;
var GAP_H        = 110;        /* gap between top/bottom pipe */
var GAP_MIN      = 55;         /* min dist from edge for gap centre */
var PIPE_SPEED   = 2.6;        /* base pipe speed */
var MAX_PIPES    = 6;
var MAX_COLS     = 5;
var GROUND_H     = 28;
var GROUND_Y     = H - GROUND_H;
var HUD_H        = 24;         /* top HUD bar height */

/* ---------------------------------------------------------
   PARALLAX LAYERS  – static, drawn each frame efficiently
--------------------------------------------------------- */
/* Layer 1: distant grid lines (very slow) */
var L1_SPEED = 0.2;
var l1Off    = 0;
/* Layer 2: terminal structures (medium) */
var L2_SPEED = 0.6;
var l2Off    = 0;
/* Structures: array of {x, h, w} computed once */
var STRUCT_COUNT = 14;
var structs = [];
for (var si2 = 0; si2 < STRUCT_COUNT; si2++) {
    structs.push({
        x: (Math.random() * W * 2) | 0,
        h: (30 + Math.random() * 60)  | 0,
        w: (8  + Math.random() * 20)  | 0
    });
}

/* ---------------------------------------------------------
   GAME STATE
--------------------------------------------------------- */
var score       = 0;
var distance    = 0;
var level       = 1;
var pipeSpeed   = PIPE_SPEED;
var paused      = false;
var startTime   = 0;
var timeSurvived= 0;
var collectCount= 0;
var nearMissCount = 0;

/* Bird physics */
var birdY   = H / 2;
var birdVY  = 0;
var flapCooldown = 0;
var wingFrame    = 0;
var wingTick     = 0;
var WING_EVERY   = 6;

/* Death animation */
var deadVY  = 0;
var deadY   = 0;
var deadTick = 0;

/* Feedback popups */
var popups = [];   /* {txt, x, y, life, col} – max 4 kept */
var MAX_POPUP = 4;
function addPopup(txt, x, y, col) {
    if (popups.length >= MAX_POPUP) popups.shift();
    popups.push({ txt:txt, x:x, y:y, life:45, col:col || C.amber });
}

/* Pipes */
var pipes = [];
for (var pi2 = 0; pi2 < MAX_PIPES; pi2++)
    pipes.push({ x:0, gapY:0, alive:false, scored:false, nearMissed:false });

/* Collectibles */
var cols2 = [];
for (var ci2 = 0; ci2 < MAX_COLS; ci2++)
    cols2.push({ x:0, y:0, alive:false, type:0, blink:0 });
/* type: 0=crystal(+5) 1=energy(+10) 2=archive(+25 rare) */

/* Spawn timers */
var pipeTimer    = 0;
var PIPE_INTERVAL = 88;
var colTimer2    = 0;
var COL_INTERVAL2 = 140;

/* Near miss */
var nearMissTimer = 0;

/* Achievements */
var achMsg   = "";
var achTimer = 0;
var achGiven = {};

/* Score popup above bird */
var scorePop = 0;

/* Level message */
var lvlMsg   = 0;

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
function initGame() {
    score = distance = 0;
    level = 1; pipeSpeed = PIPE_SPEED;
    paused = false; newHi = false;
    birdY  = H / 2; birdVY = 0;
    flapCooldown = 0; wingFrame = 0; wingTick = 0;
    deadVY = 0; deadY = 0; deadTick = 0;
    pipeTimer = 0; colTimer2 = 0;
    nearMissTimer = 0; nearMissCount = 0;
    collectCount = 0; timeSurvived = 0;
    startTime = Date.now();
    scorePop = 0; lvlMsg = 0;
    popups.length = 0;
    achMsg = ""; achTimer = 0; achGiven = {};
    for (var i = 0; i < MAX_PIPES; i++) pipes[i].alive = false;
    for (var i = 0; i < MAX_COLS;  i++) cols2[i].alive = false;
    screen = SC_PLAY;
}

/* ---------------------------------------------------------
   ACHIEVEMENT HELPER
--------------------------------------------------------- */
function giveAch(key, msg) {
    if (achGiven[key]) return;
    achGiven[key] = true;
    achMsg = msg; achTimer = 65;
    sndAchieve();
}

/* ---------------------------------------------------------
   FLAP
--------------------------------------------------------- */
function doFlap() {
    if (flapCooldown > 0) return;
    birdVY = FLAP_VY;
    flapCooldown = 7;
    wingFrame = 1;
    wingTick  = 0;
    sndFlap();
    try { if (navigator.vibrate) navigator.vibrate(12); } catch(e){}
}

/* ---------------------------------------------------------
   SPAWN
--------------------------------------------------------- */
function spawnPipe() {
    for (var i = 0; i < MAX_PIPES; i++) {
        if (!pipes[i].alive) {
            var gapCentre = GAP_MIN + ((Math.random() * (GROUND_Y - HUD_H - GAP_MIN*2 - GAP_H)) | 0) + GAP_H/2;
            pipes[i].x          = W + PIPE_W;
            pipes[i].gapY       = gapCentre;
            pipes[i].alive      = true;
            pipes[i].scored     = false;
            pipes[i].nearMissed = false;
            return;
        }
    }
}

function spawnCol2() {
    for (var i = 0; i < MAX_COLS; i++) {
        if (!cols2[i].alive) {
            var t = Math.random() < 0.6 ? 0 : (Math.random() < 0.8 ? 1 : 2);
            cols2[i].x     = W + 10;
            cols2[i].y     = HUD_H + 20 + ((Math.random() * (GROUND_Y - HUD_H - 40)) | 0);
            cols2[i].alive = true;
            cols2[i].type  = t;
            cols2[i].blink = 0;
            return;
        }
    }
}

/* ---------------------------------------------------------
   INPUT
--------------------------------------------------------- */
window.__currentKeydown = function(e) {
    var k = e.code;
    if (k === "Space" || k === "ArrowUp") e.preventDefault();

    if (screen === SC_MENU) {
        if (k === "Enter" || k === "Space" || k === "ArrowUp" || k === "KeyW") {
            sndMenuSel(); initGame();
        }
        return;
    }
    if (screen === SC_DEAD) {
        if (k === "Enter" || k === "Space" || k === "ArrowUp" || k === "KeyW") {
            sndMenuSel(); initGame();
        }
        if (k === "Escape") screen = SC_MENU;
        return;
    }
    if (k === "Escape") { screen = SC_MENU; return; }
    if (k === "KeyP")   { paused = !paused; return; }
    if (k === "KeyF")   { toggleSWFS(); return; }
    if (!paused && (k === "Space" || k === "ArrowUp" || k === "KeyW")) doFlap();
});

function toggleSWFS() {
    if (!document.fullscreenElement) { if (canvas.requestFullscreen) canvas.requestFullscreen(); }
    else { if (document.exitFullscreen) document.exitFullscreen(); }
}

/* ---------------------------------------------------------
   TOUCH & MOUSE CONTROLS
--------------------------------------------------------- */
var isTouchSW = typeof window !== "undefined" &&
    window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

/* Canvas tap = flap */
canvas.addEventListener("touchstart", function(e) {
    e.preventDefault();
    if (screen === SC_MENU || screen === SC_DEAD) {
        if (typeof requestLandscape === "function") requestLandscape();
        sndMenuSel(); initGame();
    } else if (screen === SC_PLAY && !paused) { doFlap(); }
}, { passive: false });

canvas.addEventListener("click", function() {
    if (screen === SC_MENU || screen === SC_DEAD) { sndMenuSel(); initGame(); }
    else if (screen === SC_PLAY && !paused) doFlap();
});

/* Mobile D-pad */
if (isTouchSW) {
    var swDpad = document.createElement("div");
    swDpad.id = "sw-dpad";
    swDpad.style.cssText = "display:flex;gap:6px;padding:8px;background:#000;" +
                           "justify-content:center;width:640px;max-width:100%;box-sizing:border-box;";
    function mkSWBtn(lbl, id) {
        var b = document.createElement("button");
        b.id = id; b.textContent = lbl;
        b.style.cssText = "font-family:monospace;font-size:20px;background:#0a0a0a;color:#aaa;" +
                          "border:1px solid #222;flex:1;height:64px;cursor:pointer;" +
                          "-webkit-tap-highlight-color:transparent;user-select:none;";
        return b;
    }
    var swBtnFlap  = mkSWBtn("FLAP ↑",   "sw-flap");
    var swBtnPause = mkSWBtn("II",        "sw-pause");
    swBtnPause.style.flex = "0 0 64px";
    swDpad.appendChild(swBtnFlap);
    swDpad.appendChild(swBtnPause);
    var _dw = document.getElementById('dpad-wrap'); if (_dw) _dw.appendChild(swDpad);

    swBtnFlap.addEventListener("touchstart", function(e) {
        e.preventDefault();
        swBtnFlap.style.background = "#1a1a1a";
        if (screen === SC_MENU || screen === SC_DEAD) { sndMenuSel(); initGame(); return; }
        if (screen === SC_PLAY && !paused) doFlap();
    }, { passive: false });
    swBtnFlap.addEventListener("touchend", function(e) {
        e.preventDefault(); swBtnFlap.style.background = "#0a0a0a";
    }, { passive: false });
    swBtnPause.addEventListener("touchstart", function(e) {
        e.preventDefault();
        if (screen === SC_PLAY) { paused = !paused; swBtnPause.textContent = paused ? "▶" : "II"; }
    }, { passive: false });
}

/* Pause button in overlay topbar */
(function() {
    var topbar = document.getElementById("overlay-topbar");
    if (!topbar || document.getElementById("sw-pause-top")) return;
    var pb = document.createElement("button");
    pb.id = "sw-pause-top"; pb.textContent = "II PAUSE";
    pb.style.cssText = "font-family:monospace;font-size:12px;background:#111;color:#aaa;" +
                       "border:1px solid #333;padding:4px 10px;cursor:pointer;margin-left:8px;";
    pb.addEventListener("click", function() {
        if (screen !== SC_PLAY) return;
        paused = !paused; pb.textContent = paused ? "▶ RESUME" : "II PAUSE";
    });
    topbar.appendChild(pb);
})();

/* ---------------------------------------------------------
   COLLISION  circle vs rect
--------------------------------------------------------- */
function circleRect(cx, cy, r, rx, ry, rw, rh) {
    var nx = Math.max(rx, Math.min(cx, rx + rw));
    var ny = Math.max(ry, Math.min(cy, ry + rh));
    var dx = cx - nx, dy = cy - ny;
    return dx*dx + dy*dy < r*r;
}

/* ---------------------------------------------------------
   UPDATE
--------------------------------------------------------- */
function update() {
    if (screen !== SC_PLAY || paused) return;

    timeSurvived = ((Date.now() - startTime) / 1000) | 0;
    distance++;

    /* Level ramp every 8 pipes passed */
    var newLvl = ((score / 8) | 0) + 1;
    if (newLvl > level) {
        level = newLvl;
        pipeSpeed = PIPE_SPEED + (level - 1) * 0.28;
        if (pipeSpeed > 7) pipeSpeed = 7;
        PIPE_INTERVAL = 88 - (level - 1) * 4;
        if (PIPE_INTERVAL < 52) PIPE_INTERVAL = 52;
        lvlMsg = 75;
        swBeep(440, 0.06, "square", 0.05);
        setTimeout(function(){ swBeep(550, 0.08, "square", 0.06); }, 70);
    }
    if (lvlMsg > 0) lvlMsg--;

    /* Wing animation */
    if (flapCooldown > 0) flapCooldown--;
    wingTick++;
    if (wingTick >= WING_EVERY) { wingTick = 0; wingFrame = wingFrame === 0 ? 1 : 0; }

    /* Parallax scroll */
    l1Off = (l1Off + L1_SPEED) % 40;
    l2Off = (l2Off + L2_SPEED) % W;

    /* Bird physics */
    birdVY += GRAVITY;
    if (birdVY >  9) birdVY = 9;
    birdY  += birdVY;

    /* Popup tick */
    for (var i = popups.length - 1; i >= 0; i--) {
        popups[i].life--;
        popups[i].y -= 0.4;
        if (popups[i].life <= 0) popups.splice(i, 1);
    }
    if (achTimer > 0) achTimer--;
    if (scorePop > 0) scorePop--;
    if (nearMissTimer > 0) nearMissTimer--;

    /* Ground collision */
    if (birdY + BIRD_R >= GROUND_Y) { die(); return; }
    /* Ceiling */
    if (birdY - BIRD_R <= HUD_H)    { birdY = HUD_H + BIRD_R; birdVY = 0; }

    /* Spawn pipes */
    pipeTimer++;
    if (pipeTimer >= PIPE_INTERVAL) { pipeTimer = 0; spawnPipe(); }

    /* Spawn collectibles */
    colTimer2++;
    if (colTimer2 >= COL_INTERVAL2) { colTimer2 = 0; spawnCol2(); }

    /* Move pipes */
    for (var i = 0; i < MAX_PIPES; i++) {
        var p = pipes[i]; if (!p.alive) continue;
        p.x -= pipeSpeed;
        if (p.x + PIPE_W < 0) { p.alive = false; continue; }

        /* Score: passed centre of pipe */
        if (!p.scored && p.x + PIPE_W/2 < BIRD_X) {
            p.scored = true;
            score++;
            scorePop = 35;
            sndScore();
            if (score > hiScore) { hiScore = score; newHi = true; saveHi(); }
            /* Achievements */
            if (score >= 1   && !achGiven["ff"])   giveAch("ff",   "FIRST FLIGHT");
            if (score >= 10  && !achGiven["s10"])  giveAch("s10",  "10 SCORE");
            if (score >= 50  && !achGiven["s50"])  giveAch("s50",  "50 SCORE");
            if (score >= 100 && !achGiven["s100"]) giveAch("s100", "100 SCORE");
        }

        /* Collision with pipes */
        var topH  = p.gapY - GAP_H/2 - HUD_H;
        var botY  = p.gapY + GAP_H/2;
        var botH  = GROUND_Y - botY;
        if (circleRect(BIRD_X, birdY, BIRD_R - 2, p.x, HUD_H, PIPE_W, topH) ||
            circleRect(BIRD_X, birdY, BIRD_R - 2, p.x, botY,  PIPE_W, botH)) {
            die(); return;
        }

        /* Near miss: passed within 14px of pipe edge without hitting */
        if (!p.nearMissed && p.x + PIPE_W < BIRD_X && p.x + PIPE_W > BIRD_X - 14) {
            var gapTop = p.gapY - GAP_H/2;
            var gapBot = p.gapY + GAP_H/2;
            var clearance = Math.min(Math.abs(birdY - gapTop), Math.abs(birdY - gapBot));
            if (clearance < 22) {
                p.nearMissed = true;
                nearMissCount++;
                score += 3;
                nearMissTimer = 40;
                addPopup("NEAR MISS +3", BIRD_X + 16, birdY - 16, C.amber);
                sndNearMiss();
                if (score > hiScore) { hiScore = score; newHi = true; saveHi(); }
            }
        }
    }

    /* Move collectibles */
    for (var i = 0; i < MAX_COLS; i++) {
        var c = cols2[i]; if (!c.alive) continue;
        c.x -= pipeSpeed * 0.9;
        c.blink = (c.blink + 1) % 20;
        if (c.x + 14 < 0) { c.alive = false; continue; }
        if (circleRect(BIRD_X, birdY, BIRD_R, c.x, c.y, 14, 14)) {
            c.alive = false;
            collectCount++;
            var pts = c.type === 2 ? 25 : (c.type === 1 ? 10 : 5);
            score += pts;
            if (score > hiScore) { hiScore = score; newHi = true; saveHi(); }
            addPopup("+" + pts, c.x, c.y - 4, c.type === 2 ? C.green : C.cyan);
            sndCollect();
            if (collectCount >= 5  && !achGiven["dh"])  giveAch("dh",  "DATA HUNTER");
            if (collectCount >= 20 && !achGiven["dh20"]) giveAch("dh20","COLLECTOR");
            if (c.type === 2)                            giveAch("arc", "ARCHIVE FOUND");
        }
    }

    /* Survival achievement */
    if (timeSurvived >= 30 && !achGiven["surv"]) giveAch("surv", "SURVIVOR");
    if (level >= 5         && !achGiven["spd5"]) giveAch("spd5", "SPEED DEMON");
}

/* ---------------------------------------------------------
   DIE
--------------------------------------------------------- */
function die() {
    deadY  = birdY;
    deadVY = -4;
    deadTick = 0;
    if (score > hiScore) { hiScore = score; newHi = true; }
    if (distance > bestDist) { bestDist = distance; }
    saveHi();
    if (newHi) sndHiScore(); else sndGameOver();
    try { if (navigator.vibrate) navigator.vibrate([30, 20, 40]); } catch(e){}
    screen = SC_DEAD;
}

/* ---------------------------------------------------------
   DRAW BIRD  – pixel-art Void Sparrow  (16×14)
   A small dark terminal bird with glowing eyes.
   All drawn with fillRect – no images.
--------------------------------------------------------- */
function drawBird(cx, cy, frame, dead) {
    cx = cx | 0; cy = (cy - 7) | 0;
    var bodyCol  = dead ? "#444" : "#d8e0e8";
    var wingCol  = dead ? "#333" : "#8899aa";
    var eyeCol   = dead ? "#555" : C.cyan;
    var beakCol  = dead ? "#555" : C.amber;
    var detailCol = dead ? "#222" : "#3a4a5a";

    /* WING – frame 0 = up, frame 1 = down */
    ctx.fillStyle = wingCol;
    if (frame === 0) {
        /* Wing up */
        ctx.fillRect(cx - 8, cy - 2, 6, 4);
        ctx.fillRect(cx - 6, cy - 5, 4, 3);
    } else {
        /* Wing down */
        ctx.fillRect(cx - 8, cy + 4, 6, 4);
        ctx.fillRect(cx - 6, cy + 6, 4, 3);
    }

    /* BODY – rounded rectangle feel using multiple rects */
    ctx.fillStyle = bodyCol;
    ctx.fillRect(cx - 6, cy,      12, 10);  /* core */
    ctx.fillRect(cx - 4, cy - 2,  8,  2);   /* top round */
    ctx.fillRect(cx - 4, cy + 10, 8,  2);   /* bottom round */
    ctx.fillRect(cx - 7, cy + 2,  2,  6);   /* left bulge */
    ctx.fillRect(cx + 5, cy + 2,  2,  6);   /* right bulge */

    /* DETAIL stripe */
    ctx.fillStyle = detailCol;
    ctx.fillRect(cx - 3, cy + 1, 6, 2);

    /* TAIL */
    ctx.fillStyle = wingCol;
    ctx.fillRect(cx + 5, cy + 4, 5, 2);
    ctx.fillRect(cx + 6, cy + 7, 4, 2);

    /* EYE */
    ctx.fillStyle = eyeCol;
    ctx.fillRect(cx + 1, cy + 2, 4, 4);
    ctx.fillStyle = "#000";
    ctx.fillRect(cx + 2, cy + 3, 2, 2);
    /* Eye glint */
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx + 3, cy + 3, 1, 1);

    /* BEAK */
    ctx.fillStyle = beakCol;
    ctx.fillRect(cx + 5, cy + 5, 5, 2);
    ctx.fillRect(cx + 8, cy + 4, 2, 1);
}

/* ---------------------------------------------------------
   DRAW PIPE  – Firewall Tower
--------------------------------------------------------- */
function drawPipe(p) {
    var x    = p.x | 0;
    var topH = (p.gapY - GAP_H/2 - HUD_H) | 0;
    var botY = (p.gapY + GAP_H/2) | 0;
    var botH = (GROUND_Y - botY) | 0;

    /* Top pipe */
    ctx.fillStyle = C.wall;
    ctx.fillRect(x, HUD_H, PIPE_W, topH);
    /* Top cap */
    ctx.fillStyle = C.wallEdge;
    ctx.fillRect(x - 3, HUD_H + topH - 8, PIPE_W + 6, 8);
    /* Dark inner line */
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(x + 6, HUD_H, 4, topH - 8);
    /* Edge highlight */
    ctx.fillStyle = "#3a5060";
    ctx.fillRect(x, HUD_H, 2, topH);

    /* Bottom pipe */
    ctx.fillStyle = C.wall;
    ctx.fillRect(x, botY, PIPE_W, botH);
    /* Bottom cap */
    ctx.fillStyle = C.wallEdge;
    ctx.fillRect(x - 3, botY, PIPE_W + 6, 8);
    /* Dark inner line */
    ctx.fillStyle = C.wallDark;
    ctx.fillRect(x + 6, botY + 8, 4, botH - 8);
    /* Edge highlight */
    ctx.fillStyle = "#3a5060";
    ctx.fillRect(x, botY, 2, botH);

    /* Gap zone subtle tint */
    ctx.fillStyle = "#050a0e";
    ctx.fillRect(x, p.gapY - GAP_H/2, PIPE_W, GAP_H);
}

/* ---------------------------------------------------------
   DRAW COLLECTIBLE
--------------------------------------------------------- */
function drawCol2(c) {
    var x = c.x | 0, y = c.y | 0;
    if (c.blink > 16) return;   /* brief blink */
    if (c.type === 0) {
        /* Data Crystal – cyan diamond */
        ctx.fillStyle = C.cyanDim;
        ctx.fillRect(x + 4, y,      6,  4);
        ctx.fillRect(x,     y + 4,  14, 6);
        ctx.fillRect(x + 4, y + 10, 6,  4);
        ctx.fillStyle = C.cyan;
        ctx.fillRect(x + 5, y + 1,  4,  2);
        ctx.fillRect(x + 1, y + 5,  4,  4);
    } else if (c.type === 1) {
        /* Energy Cell – amber */
        ctx.fillStyle = C.amberDim;
        ctx.fillRect(x + 3, y,      8,  14);
        ctx.fillStyle = C.amber;
        ctx.fillRect(x + 4, y + 1,  6,  4);
        ctx.fillRect(x + 5, y + 9,  4,  3);
        ctx.fillStyle = "#000";
        ctx.fillRect(x + 5, y + 5,  4,  4);
    } else {
        /* Archive Chip – rare green */
        ctx.fillStyle = C.greenDim;
        ctx.fillRect(x, y, 14, 14);
        ctx.fillStyle = C.green;
        ctx.fillRect(x + 2, y + 2, 10, 10);
        ctx.fillStyle = "#000";
        ctx.fillRect(x + 4, y + 4,  6,  6);
        ctx.fillStyle = C.green;
        ctx.fillRect(x + 5, y + 5,  4,  4);
        ctx.fillStyle = "#000";
        ctx.fillRect(x + 6, y + 6,  2,  2);
    }
}

/* ---------------------------------------------------------
   DRAW
--------------------------------------------------------- */
function draw() {
    if (window.__removeSkeleton) window.__removeSkeleton();
    /* ---- BACKGROUND ---- */
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    /* Layer 1: distant grid */
    ctx.fillStyle = C.gridLine;
    for (var gxi = (-l1Off | 0); gxi < W; gxi += 40)
        ctx.fillRect(gxi, HUD_H, 1, GROUND_Y - HUD_H);
    for (var gyi = HUD_H; gyi < GROUND_Y; gyi += 40)
        ctx.fillRect(0, gyi, W, 1);

    /* Layer 2: terminal structures */
    ctx.fillStyle = C.bgLayer2;
    for (var i = 0; i < STRUCT_COUNT; i++) {
        var sx = ((structs[i].x - l2Off * 0.4) % (W + 60) + W + 60) % (W + 60) - 60;
        ctx.fillRect(sx | 0, GROUND_Y - structs[i].h, structs[i].w, structs[i].h);
    }

    /* ---- MENU ---- */
    if (screen === SC_MENU) {
        /* Idle bird */
        var idleFrame = ((Date.now() / 300) | 0) & 1;
        var idleY     = H/2 - 10 + ((Date.now() / 400 | 0) % 2 === 0 ? 1 : -1);
        drawBird(W/2 - 40, idleY, idleFrame, false);

        ctx.fillStyle = C.hiText;
        ctx.font = "bold 28px monospace";
        var tw = ctx.measureText("SLAPPY WORLD").width;
        ctx.fillText("SLAPPY WORLD", (W - tw) >> 1, H/2 - 60);

        ctx.fillStyle = C.dimText;
        ctx.font = "11px monospace";
        tw = ctx.measureText("TERMINAL FLIGHT PROTOCOL").width;
        ctx.fillText("TERMINAL FLIGHT PROTOCOL", (W - tw) >> 1, H/2 - 38);

        /* Start button */
        ctx.fillStyle = "#0a1018";
        ctx.fillRect(220, H/2 - 20, 200, 30);
        ctx.strokeStyle = C.cyanDim; ctx.lineWidth = 1;
        ctx.strokeRect(220.5, (H/2 - 20) + 0.5, 199, 29);
        ctx.fillStyle = C.hiText; ctx.font = "13px monospace";
        tw = ctx.measureText("SPACE / TAP = START").width;
        ctx.fillText("SPACE / TAP = START", 220 + ((200 - tw) >> 1), H/2 - 1);

        /* Stats */
        ctx.fillStyle = C.dimText; ctx.font = "11px monospace";
        tw = ctx.measureText("HIGH: " + hiScore + "   BEST DIST: " + bestDist).width;
        ctx.fillText("HIGH: " + hiScore + "   BEST DIST: " + bestDist, (W - tw) >> 1, H/2 + 24);
        ctx.fillStyle = "#222"; ctx.font = "9px monospace";
        ctx.fillText("v1.0  P=PAUSE  F=FULLSCREEN  ESC=EXIT", 10, H - 8);
        return;
    }

    /* ---- GROUND ---- */
    ctx.fillStyle = C.ground;
    ctx.fillRect(0, GROUND_Y, W, GROUND_H);
    /* Ground detail */
    ctx.fillStyle = "#222a38";
    var gOff = distance % 24;
    for (var gx2 = (-gOff | 0); gx2 < W; gx2 += 24)
        ctx.fillRect(gx2, GROUND_Y + 4, 12, 2);

    /* ---- PIPES ---- */
    for (var i = 0; i < MAX_PIPES; i++)
        if (pipes[i].alive) drawPipe(pipes[i]);

    /* ---- COLLECTIBLES ---- */
    for (var i = 0; i < MAX_COLS; i++)
        if (cols2[i].alive) drawCol2(cols2[i]);

    /* ---- BIRD ---- */
    if (screen === SC_PLAY) {
        drawBird(BIRD_X, birdY, wingFrame, false);
    }

    /* ---- HUD BAR ---- */
    ctx.fillStyle = C.hudBg;
    ctx.fillRect(0, 0, W, HUD_H);
    ctx.fillStyle = C.hudBord;
    ctx.fillRect(0, HUD_H - 1, W, 1);

    ctx.fillStyle = C.hiText; ctx.font = "11px monospace";
    ctx.fillText("SCORE " + score, 8, 16);
    ctx.fillStyle = C.dimText;
    ctx.fillText(" | ", 82, 16);
    ctx.fillText("HIGH " + hiScore, 98, 16);
    ctx.fillText(" | ", 162, 16);
    ctx.fillText("LVL " + level, 178, 16);
    ctx.fillText(" | ", 214, 16);
    ctx.fillText("TIME " + timeSurvived + "s", 230, 16);

    /* Score +1 popup above bird */
    if (scorePop > 0) {
        ctx.fillStyle = C.amber;
        ctx.font = "12px monospace";
        ctx.fillText("+1", BIRD_X + 14, birdY - 14);
    }

    /* Near miss indicator */
    if (nearMissTimer > 0) {
        ctx.fillStyle = C.amber; ctx.font = "10px monospace";
        ctx.fillText("NEAR MISS", BIRD_X + 16, birdY - 28);
    }

    /* Floating popups */
    for (var i = 0; i < popups.length; i++) {
        var pp = popups[i];
        var alpha = pp.life > 20 ? 1 : pp.life / 20;
        ctx.fillStyle = pp.col; ctx.font = "10px monospace";
        ctx.fillText(pp.txt, pp.x | 0, pp.y | 0);
    }

    /* Level message */
    if (lvlMsg > 0) {
        ctx.fillStyle = C.dimText; ctx.font = "12px monospace";
        var lw = ctx.measureText("LEVEL " + level).width;
        ctx.fillText("LEVEL " + level, (W - lw) >> 1, H/2 - 8);
    }

    /* Achievement popup */
    if (achTimer > 0) {
        ctx.fillStyle = C.hudBg;
        ctx.fillRect(W - 148, HUD_H + 4, 140, 20);
        ctx.strokeStyle = C.amber; ctx.lineWidth = 1;
        ctx.strokeRect(W - 147.5, HUD_H + 4.5, 139, 19);
        ctx.fillStyle = C.amber; ctx.font = "9px monospace";
        var aw = ctx.measureText("✓ " + achMsg).width;
        ctx.fillText("✓ " + achMsg, W - 147 + ((139 - aw) >> 1), HUD_H + 17);
    }

    /* Paused */
    if (paused) {
        ctx.fillStyle = "#000";
        for (var pi3 = 0; pi3 < H; pi3 += 2) ctx.fillRect(0, pi3, W, 1);
        ctx.fillStyle = C.hiText; ctx.font = "18px monospace";
        var pw = ctx.measureText("PAUSED").width;
        ctx.fillText("PAUSED", (W - pw) >> 1, H/2 - 8);
        ctx.fillStyle = C.dimText; ctx.font = "11px monospace";
        pw = ctx.measureText("P = RESUME").width;
        ctx.fillText("P = RESUME", (W - pw) >> 1, H/2 + 14);
    }

    /* ---- DEATH SCREEN ---- */
    if (screen === SC_DEAD) {
        /* Falling bird animation */
        deadVY  += 0.5;
        deadY   += deadVY;
        deadTick++;
        var showBird = deadY < GROUND_Y;
        if (showBird) drawBird(BIRD_X, deadY, 1, true);

        if (deadTick > 30) {
            /* Dark overlay */
            ctx.fillStyle = "#000";
            for (var di = 0; di < H; di += 2) ctx.fillRect(0, di, W, 1);

            ctx.fillStyle = C.hiText; ctx.font = "20px monospace";
            var dw = ctx.measureText("SYSTEM FAILURE").width;
            ctx.fillText("SYSTEM FAILURE", (W - dw) >> 1, 100);
            if (newHi) {
                ctx.fillStyle = C.amber; ctx.font = "11px monospace";
                dw = ctx.measureText("★ NEW HIGH SCORE ★").width;
                ctx.fillText("★ NEW HIGH SCORE ★", (W - dw) >> 1, 122);
            }

            /* Stats panel */
            ctx.fillStyle = "#080c12";
            ctx.fillRect(180, 132, 280, 92);
            ctx.strokeStyle = C.hudBord; ctx.lineWidth = 1;
            ctx.strokeRect(180.5, 132.5, 279, 91);

            var col3 = C.dimText; ctx.font = "10px monospace";
            function stat(label, val, y3, vc) {
                ctx.fillStyle = col3; ctx.fillText(label, 196, y3);
                ctx.fillStyle = vc || C.hiText; ctx.fillText(val, 330, y3);
            }
            stat("SCORE",       score,              150);
            stat("HIGH SCORE",  hiScore,            166, C.amber);
            stat("DISTANCE",    distance,           182);
            stat("TIME",        timeSurvived + "s", 198);
            stat("COLLECTED",   collectCount,       214, C.cyan);
            stat("NEAR MISSES", nearMissCount,      230, C.amber);

            /* Restart button */
            ctx.fillStyle = "#080c12";
            ctx.fillRect(220, 236, 200, 28);
            ctx.strokeStyle = C.cyanDim; ctx.lineWidth = 1;
            ctx.strokeRect(220.5, 236.5, 199, 27);
            ctx.fillStyle = C.hiText; ctx.font = "12px monospace";
            dw = ctx.measureText("ENTER = PLAY AGAIN").width;
            ctx.fillText("ENTER = PLAY AGAIN", 220 + ((200 - dw) >> 1), 255);
        }
    }
}

/* ---------------------------------------------------------
   LOOP
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

window.__gameInterval = setInterval(function() {
    update();
    draw();
}, 33);
