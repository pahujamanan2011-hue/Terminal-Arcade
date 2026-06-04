/* =========================================================
   STARTRAIL.JS  v2
   Terminal Arcade – Endless Runner Protocol
   Polished. Lightweight. Fixed FPS. Old-PC safe.
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
   COLOURS
--------------------------------------------------------- */
var C = {
    bg:      "#000",
    ground:  "#1a1a1a",
    star:    "#1e1e1e",
    runner:  "#e8e8e8",
    cyan:    "#3dd6d0",
    amber:   "#d4a843",
    green:   "#4caf70",
    red:     "#c03030",
    dimText: "#555",
    midText: "#888",
    hiText:  "#ccc",
    white:   "#fff"
};

/* ---------------------------------------------------------
   AUDIO
--------------------------------------------------------- */
var ST_AC = null;
function getSTAC() {
    if (!ST_AC) try { ST_AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
    return ST_AC;
}
function stBeep(freq, dur, type, vol) {
    var ac = getSTAC(); if (!ac) return;
    try {
        var o = ac.createOscillator(), g = ac.createGain();
        o.connect(g); g.connect(ac.destination);
        o.type = type || "square";
        o.frequency.setValueAtTime(freq, ac.currentTime);
        g.gain.setValueAtTime(vol || 0.06, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
        o.start(ac.currentTime); o.stop(ac.currentTime + dur);
    } catch(e){}
}
function sndJump()       { stBeep(380, 0.06, "square",   0.05); }
function sndLand()       { stBeep(180, 0.04, "sawtooth", 0.04); }
function sndCollect()    { stBeep(660, 0.06, "sine",     0.05);
                           setTimeout(function(){ stBeep(880, 0.06, "sine", 0.04); }, 60); }
function sndNearMiss()   { stBeep(550, 0.05, "square",   0.05); }
function sndSpeedUp()    { stBeep(330, 0.05, "square",   0.05);
                           setTimeout(function(){ stBeep(440, 0.08, "square", 0.06); }, 70); }
function sndShield()     { stBeep(440, 0.08, "sine",     0.06);
                           setTimeout(function(){ stBeep(550, 0.08, "sine",   0.06); }, 90); }
function sndShieldHit()  { stBeep(220, 0.10, "sawtooth", 0.08); }
function sndDoubleScore(){ stBeep(550, 0.06, "square",   0.06);
                           setTimeout(function(){ stBeep(660, 0.06, "square", 0.06); }, 80); }
function sndAchieve()    { stBeep(440, 0.05, "square",   0.05);
                           setTimeout(function(){ stBeep(660, 0.08, "square", 0.06); }, 80); }
function sndBonus()      { stBeep(500, 0.06, "sine",     0.05); }
function sndGameOver()   {
    stBeep(220, 0.10, "sawtooth", 0.08);
    setTimeout(function(){ stBeep(180, 0.10, "sawtooth", 0.08); }, 120);
    setTimeout(function(){ stBeep(140, 0.18, "sawtooth", 0.10); }, 240);
}
function sndHiScore()    {
    stBeep(440, 0.07, "square", 0.06);
    setTimeout(function(){ stBeep(550, 0.07, "square", 0.06); }, 90);
    setTimeout(function(){ stBeep(660, 0.10, "square", 0.08); }, 180);
}

/* ---------------------------------------------------------
   SCREENS
--------------------------------------------------------- */
var SC_MENU = 0, SC_PLAY = 1, SC_DEAD = 2;
var screen  = SC_MENU;

/* ---------------------------------------------------------
   HIGH SCORE  &  SESSION
--------------------------------------------------------- */
var hiScore    = 0;
var newHi      = false;
var bestSpeed  = 1;
var totalCollectibles = 0;
var totalNearMisses   = 0;
try { hiScore = parseInt(localStorage.getItem("terminalarcade_startrail_hi") || "0", 10); } catch(e){}
function saveHi() { try { localStorage.setItem("terminalarcade_startrail_hi", hiScore); } catch(e){} }

/* ---------------------------------------------------------
   CONSTANTS
--------------------------------------------------------- */
var GROUND_Y  = H - 64;
var PLAYER_X  = 90;
var PLAYER_W  = 18;
var PLAYER_H  = 32;
var GRAVITY   = 0.72;
var JUMP_VY   = -13.5;
var MAX_OBS   = 10;
var MAX_COL   = 6;   /* collectible pool */
var MAX_PU    = 3;   /* powerup pool     */

/* ---------------------------------------------------------
   GAME STATE
--------------------------------------------------------- */
var score       = 0;
var distance    = 0;
var gameSpeed   = 3.5;
var baseSpeed   = 3.5;
var paused      = false;
var startTime   = 0;
var timeSurvived = 0;
var obstaclesAvoided = 0;
var nearMissCount    = 0;
var collectCount     = 0;
var speedLevel  = 1;
var speedMsgTimer = 0;

/* Player */
var playerY   = GROUND_Y - PLAYER_H;
var velY      = 0;
var onGround  = true;
var jumpsLeft = 1;          /* only 1 jump by default */
var landTick  = 0;          /* impact line timer */
var jumpCooldown = 0;       /* prevent touch spam */

/* Near miss */
var nearMissTimer = 0;
var nearMissVal   = 0;

/* Survival bonus */
var bonusTick  = 0;
var BONUS_EVERY = 900;
var bonusMsg   = 0;

/* Double score power-up */
var dblScore   = false;
var dblTicks   = 0;
var DBL_EFFECT = 300;

/* Shield power-up */
var shieldOn   = false;
var shieldTicks = 0;
var SHIELD_EFFECT = 240;

/* Magnet power-up */
var magnetOn   = false;
var magnetTicks = 0;
var MAGNET_EFFECT = 240;

/* Environment zone */
var ZONE_NORMAL  = 0;
var ZONE_GRID    = 1;
var ZONE_STORM   = 2;
var ZONE_CORRUPT = 3;
var zone         = ZONE_NORMAL;
var zoneTick     = 0;
var ZONE_EVERY   = 1500;   /* ~50s */
var zoneMsg      = 0;
var ZONE_NAMES   = ["TERMINAL NORMAL","GRID SECTOR","DATA STORM","CORRUPT ZONE"];

/* Bg scrolling text */
var BG_MSGS = ["SYSTEM ONLINE","SCANNING...","UPLINK ACTIVE","DATA STREAM","PROTOCOL RUN",
               "ACCESS GRANTED","SECTOR CLEAR","LINK OPEN","TRACE ACTIVE","NODE 7F"];
var bgMsgX   = W + 20;
var bgMsgIdx = 0;
var bgMsgY   = 0;

/* Achievement popup */
var achMsg   = "";
var achTimer = 0;
var achGiven = {};   /* track given achievements */

/* Daily objective */
var OBJ_TYPES = [
    { desc: "Collect 8 fragments",   check: function(){ return collectCount >= 8; },  bonus: 80  },
    { desc: "Survive 45 seconds",    check: function(){ return timeSurvived >= 45; }, bonus: 100 },
    { desc: "Reach Speed Level 4",   check: function(){ return speedLevel >= 4; },    bonus: 120 },
    { desc: "Avoid 20 obstacles",    check: function(){ return obstaclesAvoided >= 20; }, bonus: 60 },
    { desc: "Get 3 near misses",     check: function(){ return nearMissCount >= 3; }, bonus: 50  }
];
var objIdx      = 0;
var objDone     = false;
var objBonusMsg = 0;

/* Pools */
var obs = [];
for (var oi = 0; oi < MAX_OBS; oi++)
    obs.push({ x:0, y:0, w:0, h:0, alive:false, vx:0 });

var cols = [];
for (var ci = 0; ci < MAX_COL; ci++)
    cols.push({ x:0, y:0, alive:false, type:0 });   /* 0=fragment 1=energy */

var pus = [];
for (var pi = 0; pi < MAX_PU; pi++)
    pus.push({ x:0, y:0, alive:false, type:0 });   /* 0=shield 1=double 2=magnet */

/* Spawn timers */
var spawnTimer    = 0;
var spawnInterval = 78;
var colTimer      = 0;
var COL_INTERVAL  = 120;
var puTimer       = 0;
var PU_INTERVAL   = 600;   /* 20s */

/* Stars – static, computed once */
var STAR_COUNT = 45;
var stars = [];
for (var si = 0; si < STAR_COUNT; si++)
    stars.push({ x:(Math.random()*W)|0, y:(Math.random()*(GROUND_Y-20))|0,
                 s: Math.random() < 0.3 ? 2 : 1 });

/* Obstacle types */
var OBS_TYPES = [
    { w:14, h:28, col:"#bbb" },   /* spike      */
    { w:18, h:48, col:"#999" },   /* wall       */
    { w:40, h:14, col:"#aaa" },   /* low bar    */
    { w:22, h:22, col:"#ccc" },   /* block      */
    { w:12, h:56, col:"#ddd" }    /* tall wall  */
];

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
function initGame() {
    score = distance = 0;
    gameSpeed = baseSpeed = 3.5;
    paused = false; newHi = false;
    playerY  = GROUND_Y - PLAYER_H;
    velY     = 0; onGround = true;
    jumpsLeft = 1; landTick = 0; jumpCooldown = 0;
    speedLevel = 1; speedMsgTimer = 0;
    spawnTimer = 0; spawnInterval = 78;
    colTimer   = 0; puTimer = 0;
    nearMissTimer = 0; nearMissVal = 0; nearMissCount = 0;
    bonusTick  = 0; bonusMsg = 0;
    obstaclesAvoided = 0; collectCount = 0;
    dblScore = false; dblTicks = 0;
    shieldOn = false; shieldTicks = 0;
    magnetOn = false; magnetTicks = 0;
    zone = ZONE_NORMAL; zoneTick = 0; zoneMsg = 0;
    bgMsgX = W + 20; bgMsgIdx = (Math.random() * BG_MSGS.length) | 0;
    bgMsgY = (20 + Math.random() * (GROUND_Y - 40)) | 0;
    achMsg = ""; achTimer = 0; achGiven = {};
    objIdx  = (Math.random() * OBJ_TYPES.length) | 0;
    objDone = false; objBonusMsg = 0;
    startTime = Date.now(); timeSurvived = 0;
    bestSpeed = 1;
    for (var i = 0; i < MAX_OBS; i++) obs[i].alive = false;
    for (var i = 0; i < MAX_COL; i++) cols[i].alive = false;
    for (var i = 0; i < MAX_PU;  i++) pus[i].alive  = false;
    screen = SC_PLAY;
}

/* ---------------------------------------------------------
   ACHIEVEMENT HELPER
--------------------------------------------------------- */
function giveAch(key, msg) {
    if (achGiven[key]) return;
    achGiven[key] = true;
    achMsg   = msg;
    achTimer = 60;
    sndAchieve();
}

/* ---------------------------------------------------------
   SPAWN HELPERS
--------------------------------------------------------- */
function spawnObs() {
    for (var i = 0; i < MAX_OBS; i++) {
        if (obs[i].alive && obs[i].x > W - 90) return;
    }
    for (var i = 0; i < MAX_OBS; i++) {
        if (!obs[i].alive) {
            var tp = OBS_TYPES[(Math.random() * OBS_TYPES.length) | 0];
            obs[i].w = tp.w; obs[i].h = tp.h; obs[i].col = tp.col;
            obs[i].x = W + 10; obs[i].y = GROUND_Y - tp.h;
            obs[i].alive = true;
            /* Moving block at higher speeds */
            obs[i].vx = (speedLevel >= 5 && Math.random() < 0.25) ?
                        (Math.random() < 0.5 ? 0.5 : -0.5) : 0;
            return;
        }
    }
}

function spawnCol() {
    for (var i = 0; i < MAX_COL; i++) {
        if (!cols[i].alive) {
            var type = Math.random() < 0.75 ? 0 : 1;  /* 0=fragment 1=energy */
            cols[i].x     = W + 10;
            cols[i].y     = GROUND_Y - PLAYER_H - 10 - (Math.random() * 28 | 0);
            cols[i].alive = true;
            cols[i].type  = type;
            return;
        }
    }
}

function spawnPU() {
    for (var i = 0; i < MAX_PU; i++) {
        if (!pus[i].alive) {
            pus[i].x     = W + 10;
            pus[i].y     = GROUND_Y - PLAYER_H - 14;
            pus[i].alive = true;
            pus[i].type  = (Math.random() * 3) | 0;  /* 0=shield 1=double 2=magnet */
            return;
        }
    }
}

/* ---------------------------------------------------------
   INPUT
--------------------------------------------------------- */
function doJump() {
    if (jumpCooldown > 0) return;
    if (jumpsLeft > 0) {
        velY = JUMP_VY;
        jumpsLeft--;
        onGround = false;
        jumpCooldown = 8;
        sndJump();
    }
}

window.__currentKeydown = function(e) {
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
    if (k === "Space" || k === "KeyW" || k === "ArrowUp") doJump();
});

function toggleSTFS() {
    if (!document.fullscreenElement) { if (canvas.requestFullscreen) canvas.requestFullscreen(); }
    else { if (document.exitFullscreen) document.exitFullscreen(); }
}

/* ---------------------------------------------------------
   TOUCH CONTROLS
--------------------------------------------------------- */
var isTouchST = typeof window !== "undefined" &&
    window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

if (isTouchST) {
    var stDpad = document.createElement("div");
    stDpad.id = "st-dpad";
    stDpad.style.cssText = "display:flex;gap:6px;padding:8px;background:#000;" +
                           "justify-content:center;width:640px;max-width:100%;box-sizing:border-box;";
    function mkSTBtn(lbl, id) {
        var b = document.createElement("button");
        b.id = id; b.textContent = lbl;
        b.style.cssText = "font-family:monospace;font-size:20px;background:#111;color:#aaa;" +
                          "border:1px solid #444;flex:1;height:64px;cursor:pointer;" +
                          "-webkit-tap-highlight-color:transparent;user-select:none;";
        return b;
    }
    var stBtnJump  = mkSTBtn("JUMP ↑", "st-jump");
    var stBtnPause = mkSTBtn("II",     "st-pause");
    stBtnPause.style.flex = "0 0 64px";
    stDpad.appendChild(stBtnJump);
    stDpad.appendChild(stBtnPause);
    var _dw = document.getElementById('dpad-wrap'); if (_dw) _dw.appendChild(stDpad);

    stBtnJump.addEventListener("touchstart", function(e) {
        e.preventDefault();
        stBtnJump.style.background = "#222";
        if (screen === SC_MENU || screen === SC_DEAD) {
            if (typeof requestLandscape === "function") requestLandscape();
            initGame(); return;
        }
        if (screen === SC_PLAY && !paused) doJump();
    }, { passive: false });
    stBtnJump.addEventListener("touchend", function(e) {
        e.preventDefault(); stBtnJump.style.background = "#111";
    }, { passive: false });
    stBtnPause.addEventListener("touchstart", function(e) {
        e.preventDefault();
        if (screen === SC_PLAY) {
            paused = !paused;
            stBtnPause.textContent = paused ? "▶" : "II";
        }
    }, { passive: false });
}

canvas.addEventListener("touchstart", function(e) {
    e.preventDefault();
    if (screen === SC_MENU || screen === SC_DEAD) {
        if (typeof requestLandscape === "function") requestLandscape();
        initGame();
    } else if (screen === SC_PLAY && !paused) { doJump(); }
}, { passive: false });

canvas.addEventListener("click", function() {
    if (screen === SC_MENU || screen === SC_DEAD) initGame();
});

/* Pause button in overlay topbar */
(function() {
    var topbar = document.getElementById("overlay-topbar");
    if (!topbar || document.getElementById("st-pause-top")) return;
    var pb = document.createElement("button");
    pb.id = "st-pause-top"; pb.textContent = "II PAUSE";
    pb.style.cssText = "font-family:monospace;font-size:12px;background:#111;color:#aaa;" +
                       "border:1px solid #333;padding:4px 10px;cursor:pointer;margin-left:8px;";
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

    if (jumpCooldown > 0) jumpCooldown--;

    timeSurvived = ((Date.now() - startTime) / 1000) | 0;

    /* Survival bonus */
    bonusTick++;
    if (bonusTick >= BONUS_EVERY) {
        bonusTick = 0;
        var pts = dblScore ? 100 : 50;
        score += pts; bonusMsg = 55; sndBonus();
    }
    if (bonusMsg > 0) bonusMsg--;

    /* Distance + score */
    distance++;
    var add = dblScore ? 2 : 1;
    score += add;

    /* Speed ramp */
    var newLevel = ((distance / 280) | 0) + 1;
    if (newLevel > speedLevel) {
        speedLevel    = newLevel;
        baseSpeed     = 3.5 + (speedLevel - 1) * 0.55;
        if (baseSpeed > 14) baseSpeed = 14;
        if (!dblScore && !shieldOn && !magnetOn) gameSpeed = baseSpeed;
        spawnInterval = 78 - speedLevel * 5;
        if (spawnInterval < 24) spawnInterval = 24;
        speedMsgTimer = 80;
        sndSpeedUp();
        if (speedLevel > bestSpeed) bestSpeed = speedLevel;
    }
    if (speedMsgTimer > 0) speedMsgTimer--;

    /* Power-up countdowns */
    if (dblScore)  { dblTicks--;    if (dblTicks <= 0)    { dblScore = false; gameSpeed = baseSpeed; } }
    if (shieldOn)  { shieldTicks--; if (shieldTicks <= 0)  shieldOn  = false; }
    if (magnetOn)  { magnetTicks--; if (magnetTicks <= 0)  magnetOn  = false; }

    /* Zone rotation */
    zoneTick++;
    if (zoneTick >= ZONE_EVERY) {
        zoneTick = 0;
        zone = (zone + 1) % 4;
        zoneMsg = 80;
    }
    if (zoneMsg > 0) zoneMsg--;

    /* Background message scroll */
    bgMsgX -= 0.6;
    if (bgMsgX < -200) {
        bgMsgX   = W + 20;
        bgMsgIdx = ((bgMsgIdx + 1) % BG_MSGS.length);
        bgMsgY   = (20 + Math.random() * (GROUND_Y - 40)) | 0;
    }

    /* Player physics */
    velY += GRAVITY;
    playerY += velY;
    if (playerY >= GROUND_Y - PLAYER_H) {
        if (!onGround) { landTick = 5; sndLand(); }
        playerY  = GROUND_Y - PLAYER_H;
        velY     = 0; onGround = true;
        jumpsLeft = 1;
    } else { onGround = false; }
    if (landTick > 0) landTick--;

    /* Spawn */
    spawnTimer++; if (spawnTimer >= spawnInterval) { spawnTimer = 0; spawnObs(); }
    colTimer++;   if (colTimer   >= COL_INTERVAL)  { colTimer   = 0; spawnCol(); }
    puTimer++;    if (puTimer    >= PU_INTERVAL)    { puTimer    = 0; spawnPU();  }

    var px = PLAYER_X, py = playerY | 0;

    /* Collectibles */
    for (var i = 0; i < MAX_COL; i++) {
        var c = cols[i]; if (!c.alive) continue;
        c.x -= gameSpeed;
        /* Magnet pull */
        if (magnetOn) {
            var mdx = (px + PLAYER_W/2) - (c.x + 6);
            var mdy = (py + PLAYER_H/2) - (c.y + 6);
            var md  = Math.sqrt(mdx*mdx + mdy*mdy);
            if (md < 120) { c.x += mdx * 0.08; c.y += mdy * 0.08; }
        }
        if (c.x + 12 < 0) { c.alive = false; continue; }
        if (px + 2 < c.x + 12 && px + PLAYER_W - 2 > c.x &&
            py + 2 < c.y + 12 && py + PLAYER_H - 2 > c.y) {
            c.alive = false;
            collectCount++;
            totalCollectibles++;
            var pts2 = c.type === 1 ? 10 : 5;
            if (dblScore) pts2 *= 2;
            score += pts2;
            sndCollect();
            nearMissVal  = pts2;
            nearMissTimer = 40;
            if (score > hiScore) { hiScore = score; newHi = true; saveHi(); }
            /* Achievements */
            if (collectCount >= 10) giveAch("col10", "COLLECTOR");
            if (collectCount >= 1 && !achGiven["col1"]) giveAch("col1", "FIRST PICKUP");
        }
    }

    /* Power-ups */
    for (var i = 0; i < MAX_PU; i++) {
        var p = pus[i]; if (!p.alive) continue;
        p.x -= gameSpeed;
        if (p.x + 16 < 0) { p.alive = false; continue; }
        if (px + 2 < p.x + 16 && px + PLAYER_W - 2 > p.x &&
            py + 2 < p.y + 16 && py + PLAYER_H - 2 > p.y) {
            p.alive = false;
            if (p.type === 0) { shieldOn = true;  shieldTicks = SHIELD_EFFECT; sndShield(); }
            if (p.type === 1) { dblScore = true;  dblTicks    = DBL_EFFECT;    sndDoubleScore();
                                gameSpeed = baseSpeed * 0.85; }
            if (p.type === 2) { magnetOn = true;  magnetTicks = MAGNET_EFFECT; sndCollect(); }
            nearMissVal   = 0;
            nearMissTimer = 50;
        }
    }

    /* Obstacles */
    var crashed = false;
    for (var i = 0; i < MAX_OBS; i++) {
        var o = obs[i]; if (!o.alive) continue;
        o.x -= gameSpeed;
        if (o.vx !== 0) {
            o.y += o.vx;
            if (o.y < GROUND_Y - o.h - 30 || o.y > GROUND_Y - o.h) o.vx = -o.vx;
        }
        if (o.x + o.w < 0) { o.alive = false; obstaclesAvoided++; continue; }

        /* Collision */
        if (px + 3 < o.x + o.w && px + PLAYER_W - 3 > o.x &&
            py + 3 < o.y + o.h && py + PLAYER_H - 3 > o.y) {
            if (shieldOn) {
                shieldOn = false; o.alive = false;
                sndShieldHit();
                nearMissVal = 0; nearMissTimer = 50;
            } else { crashed = true; break; }
        }

        /* Near miss */
        if (o.x + o.w >= px - 12 && o.x + o.w < px + 3) {
            var vg = Math.min(Math.abs(py - (o.y + o.h)), Math.abs((py + PLAYER_H) - o.y));
            if (vg < 18) {
                var nm = dblScore ? 20 : 10;
                score += nm; nearMissCount++; totalNearMisses++;
                nearMissVal = nm; nearMissTimer = 40; sndNearMiss();
                if (score > hiScore) { hiScore = score; newHi = true; saveHi(); }
            }
        }
    }
    if (nearMissTimer > 0) nearMissTimer--;

    if (crashed) {
        if (score > hiScore) { hiScore = score; newHi = true; saveHi(); sndHiScore(); }
        else sndGameOver();
        try { if (navigator.vibrate) navigator.vibrate([30, 20, 30]); } catch(e){}
        screen = SC_DEAD;
        return;
    }

    /* Daily objective check */
    if (!objDone && OBJ_TYPES[objIdx].check()) {
        objDone = true; objBonusMsg = 100;
        score  += OBJ_TYPES[objIdx].bonus;
        if (score > hiScore) { hiScore = score; newHi = true; saveHi(); }
        giveAch("obj", "OBJECTIVE!");
    }
    if (objBonusMsg > 0) objBonusMsg--;

    /* Achievements */
    if (!achGiven["first"])  giveAch("first",  "FIRST RUN");
    if (score >= 100  && !achGiven["s100"])  giveAch("s100",  "100 SCORE");
    if (score >= 500  && !achGiven["s500"])  giveAch("s500",  "500 SCORE");
    if (distance >= 100 && !achGiven["m100"]) giveAch("m100", "100 METERS");
    if (speedLevel >= 5 && !achGiven["spd5"]) giveAch("spd5", "SPEED DEMON");
    if (achTimer > 0) achTimer--;
}

/* ---------------------------------------------------------
   DRAW HELPERS
--------------------------------------------------------- */
function centered(txt, y, size, col) {
    ctx.fillStyle = col || C.midText;
    ctx.font = size + "px monospace";
    var tw = ctx.measureText(txt).width;
    ctx.fillText(txt, (W - tw) >> 1, y);
}

function drawRunner(x, y, idle) {
    var cx = (x + PLAYER_W / 2) | 0;
    var yy = y | 0;
    var col = shieldOn ? C.cyan : C.runner;

    /* Shield ring */
    if (shieldOn) {
        ctx.fillStyle = "#0a2a2a";
        ctx.fillRect(cx - 14, yy - 4, 28, PLAYER_H + 8);
        ctx.fillStyle = C.cyan;
        ctx.fillRect(cx - 13, yy - 4, 2, PLAYER_H + 8);
        ctx.fillRect(cx + 11, yy - 4, 2, PLAYER_H + 8);
    }

    ctx.fillStyle = col;
    /* Head */
    ctx.fillRect(cx - 5, yy,      10, 10);
    /* Eye */
    ctx.fillStyle = "#000";
    ctx.fillRect(cx + 2, yy + 3, 2, 2);
    ctx.fillStyle = col;
    /* Body */
    ctx.fillRect(cx - 3, yy + 10, 6, 12);

    /* Arms – based on frame */
    var frame = idle ? ((Date.now() >> 7) & 1) : ((distance >> 2) & 1);
    if (frame === 0) {
        ctx.fillRect(cx - 9, yy + 11, 7, 3);
        ctx.fillRect(cx + 2,  yy + 13, 7, 3);
    } else {
        ctx.fillRect(cx - 9, yy + 13, 7, 3);
        ctx.fillRect(cx + 2,  yy + 11, 7, 3);
    }

    /* Legs */
    if (idle) {
        ctx.fillRect(cx - 5, yy + 22, 4, 10);
        ctx.fillRect(cx + 1,  yy + 22, 4, 10);
    } else if (frame === 0) {
        ctx.fillRect(cx - 5, yy + 22, 4, 10);
        ctx.fillRect(cx + 1,  yy + 22, 4,  6);
        ctx.fillRect(cx + 1,  yy + 28, 6,  3);
    } else {
        ctx.fillRect(cx - 5, yy + 22, 4,  6);
        ctx.fillRect(cx - 9, yy + 28, 6,  3);
        ctx.fillRect(cx + 1,  yy + 22, 4, 10);
    }

    /* Magnet glow */
    if (magnetOn) {
        ctx.fillStyle = C.amber;
        ctx.fillRect(cx - 6, yy - 2, 2, 2);
        ctx.fillRect(cx + 4, yy - 2, 2, 2);
    }
}

function drawObs(o) {
    var x = o.x | 0, y = o.y | 0;
    var col = zone === ZONE_CORRUPT ? "#bb3333" :
              zone === ZONE_STORM   ? "#888"    : o.col;
    ctx.fillStyle = col;
    if (o.h > o.w * 2) {
        ctx.fillRect(x + 3, y,     o.w - 6, o.h);
        ctx.fillRect(x,     y + 6, o.w,     o.h - 6);
        ctx.fillRect(x + 5, y - 6, o.w - 10, 6);
    } else if (o.w > o.h * 2) {
        ctx.fillRect(x, y, o.w, o.h);
        ctx.fillStyle = "#333";
        ctx.fillRect(x + 4, y + 2, o.w - 8, 2);
        ctx.fillRect(x + 4, y + 6, o.w - 8, 2);
    } else {
        ctx.fillRect(x, y, o.w, o.h);
        ctx.fillStyle = "#333";
        ctx.fillRect(x + 2, y + 2, 4, 4);
        ctx.fillRect(x + o.w - 6, y + 2, 4, 4);
    }
}

function drawCollectible(c) {
    var x = (c.x) | 0, y = (c.y) | 0;
    if (c.type === 0) {
        /* Data Fragment – cyan diamond */
        ctx.fillStyle = C.cyan;
        ctx.fillRect(x + 4, y,      4,  4);
        ctx.fillRect(x,     y + 4,  12, 4);
        ctx.fillRect(x + 4, y + 8,  4,  4);
        ctx.fillStyle = "#004444";
        ctx.fillRect(x + 5, y + 4,  2,  4);
    } else {
        /* Energy Cell – amber hex */
        ctx.fillStyle = C.amber;
        ctx.fillRect(x + 2, y,      8,  4);
        ctx.fillRect(x,     y + 4,  12, 4);
        ctx.fillRect(x + 2, y + 8,  8,  4);
        ctx.fillStyle = "#442200";
        ctx.fillRect(x + 4, y + 4,  4,  4);
    }
}

function drawPowerUp(p) {
    var x = (p.x) | 0, y = (p.y) | 0;
    var blink = (distance >> 2) & 1;
    if (p.type === 0) {
        /* Shield – cyan brackets */
        ctx.fillStyle = blink ? C.cyan : "#224444";
        ctx.fillRect(x,      y,      4, 16);
        ctx.fillRect(x + 12, y,      4, 16);
        ctx.fillRect(x + 4,  y,      8,  4);
        ctx.fillRect(x + 4,  y + 12, 8,  4);
        ctx.fillStyle = C.cyan;
        ctx.font = "7px monospace"; ctx.fillText("S", x + 5, y + 11);
    } else if (p.type === 1) {
        /* Double score – green x2 */
        ctx.fillStyle = blink ? C.green : "#224422";
        ctx.fillRect(x, y, 16, 16);
        ctx.fillStyle = "#000";
        ctx.font = "9px monospace"; ctx.fillText("x2", x + 2, y + 12);
    } else {
        /* Magnet – amber M */
        ctx.fillStyle = blink ? C.amber : "#442200";
        ctx.fillRect(x,     y,      4, 16);
        ctx.fillRect(x + 12,y,      4, 16);
        ctx.fillRect(x + 4, y,      8,  6);
        ctx.fillStyle = "#000";
        ctx.font = "8px monospace"; ctx.fillText("M", x + 4, y + 14);
    }
}

/* ---------------------------------------------------------
   DRAW
--------------------------------------------------------- */
function draw() {
    if (window.__removeSkeleton) window.__removeSkeleton();
    /* BG – zone tint */
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    if (zone === ZONE_CORRUPT) {
        ctx.fillStyle = "#0a0000";
        ctx.fillRect(0, 0, W, H);
    } else if (zone === ZONE_STORM) {
        ctx.fillStyle = "#00000a";
        ctx.fillRect(0, 0, W, H);
    }

    /* Stars */
    ctx.fillStyle = C.star;
    for (var si = 0; si < STAR_COUNT; si++) {
        var st = stars[si];
        ctx.fillRect(st.x, st.y, st.s, st.s);
    }

    /* Grid lines in grid zone */
    if (zone === ZONE_GRID) {
        ctx.fillStyle = "#0c0c0c";
        for (var gxi = 0; gxi < W; gxi += 32)
            ctx.fillRect(gxi, 0, 1, GROUND_Y);
        for (var gyi = 0; gyi < GROUND_Y; gyi += 32)
            ctx.fillRect(0, gyi, W, 1);
    }

    /* Scrolling bg message */
    if (screen === SC_PLAY) {
        ctx.fillStyle = "#111";
        ctx.font = "10px monospace";
        ctx.fillText(BG_MSGS[bgMsgIdx], bgMsgX | 0, bgMsgY);
    }

    /* ---- MENU ---- */
    if (screen === SC_MENU) {
        centered("TERMINAL ARCADE",         48,  13, C.dimText);
        centered("STARTRAIL",               94,  30, C.hiText);
        centered("ENDLESS RUNNER PROTOCOL", 128, 12, C.dimText);

        /* Idle runner */
        drawRunner(PLAYER_X + 220, GROUND_Y - PLAYER_H - 10, true);

        ctx.fillStyle = "#111";
        ctx.fillRect(220, 152, 200, 28);
        ctx.strokeStyle = "#444"; ctx.lineWidth = 1;
        ctx.strokeRect(220.5, 152.5, 199, 27);
        centered("ENTER / SPACE = START", 167, 12, C.hiText);

        centered("HIGH SCORE: " + hiScore,   206, 13, C.dimText);
        centered("TODAY: " + hiScore,        222, 10, "#333");

        centered("SPACE / W / ↑ = JUMP  |  P = PAUSE", 252, 10, "#333");
        centered("F = FULLSCREEN  |  ESC = EXIT",       266, 10, "#333");

        /* Version */
        ctx.fillStyle = "#222"; ctx.font = "9px monospace";
        ctx.fillText("v2.0", W - 30, H - 8);
        return;
    }

    /* ---- GROUND ---- */
    ctx.fillStyle = zone === ZONE_CORRUPT ? "#2a0000" : C.ground;
    ctx.fillRect(0, GROUND_Y, W, 2);
    ctx.fillStyle = "#111";
    var goff = distance % 40;
    for (var gx = (-(goff | 0)); gx < W; gx += 40)
        ctx.fillRect(gx, GROUND_Y + 4, 20, 1);

    /* Data storm extra symbols */
    if (zone === ZONE_STORM && (distance & 3) === 0) {
        ctx.fillStyle = "#1a1a1a";
        ctx.font = "10px monospace";
        var sym = ["0","1","#","@","$"][distance % 5];
        ctx.fillText(sym, (Math.random() * W) | 0, (Math.random() * GROUND_Y) | 0);
    }

    /* ---- COLLECTIBLES ---- */
    for (var i = 0; i < MAX_COL; i++)
        if (cols[i].alive) drawCollectible(cols[i]);

    /* ---- POWER-UPS ---- */
    for (var i = 0; i < MAX_PU; i++)
        if (pus[i].alive) drawPowerUp(pus[i]);

    /* ---- OBSTACLES ---- */
    for (var i = 0; i < MAX_OBS; i++)
        if (obs[i].alive) drawObs(obs[i]);

    /* ---- RUNNER ---- */
    drawRunner(PLAYER_X, playerY, false);

    /* Landing impact line */
    if (landTick > 0) {
        ctx.fillStyle = C.dimText;
        ctx.fillRect(PLAYER_X - 2, GROUND_Y, PLAYER_W + 4, 1);
    }

    /* ---- HUD BAR ---- */
    ctx.fillStyle = "#080808";
    ctx.fillRect(0, 0, W, 22);
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 22, W, 1);

    ctx.fillStyle = C.hiText;
    ctx.font = "10px monospace";
    ctx.fillText("SCR " + score, 8, 15);

    ctx.fillStyle = C.dimText;
    var sep = " | ";
    ctx.fillText("HIGH " + hiScore, 90, 15);
    ctx.fillText(sep, 148, 15);
    ctx.fillText("SPD " + speedLevel, 168, 15);
    ctx.fillText(sep, 208, 15);

    /* Time */
    var mm = ((timeSurvived / 60) | 0);
    var ss = timeSurvived % 60;
    ctx.fillText("TIME " + (mm > 0 ? mm + "m" : "") + ss + "s", 228, 15);

    /* Active power-up indicators right side */
    var puX = W - 8;
    if (dblScore)  {
        ctx.fillStyle = C.green;
        ctx.font = "9px monospace";
        var dl = "x2 " + ((dblTicks / 30) | 0) + "s";
        puX -= ctx.measureText(dl).width + 4;
        ctx.fillText(dl, puX, 15);
    }
    if (shieldOn)  {
        ctx.fillStyle = C.cyan;
        ctx.font = "9px monospace";
        var sl = "[S] " + ((shieldTicks / 30) | 0) + "s";
        puX -= ctx.measureText(sl).width + 4;
        ctx.fillText(sl, puX, 15);
    }
    if (magnetOn)  {
        ctx.fillStyle = C.amber;
        ctx.font = "9px monospace";
        var ml = "[M] " + ((magnetTicks / 30) | 0) + "s";
        puX -= ctx.measureText(ml).width + 4;
        ctx.fillText(ml, puX, 15);
    }

    /* Near miss / collect popup */
    if (nearMissTimer > 0) {
        var col2 = nearMissVal > 5 ? C.amber : C.cyan;
        ctx.fillStyle = col2;
        ctx.font = "11px monospace";
        var nm2 = nearMissVal > 0 ? "+" + nearMissVal : "SHIELD!";
        ctx.fillText(nm2, PLAYER_X + PLAYER_W + 4, (playerY - 6) | 0);
    }

    /* Speed level message */
    if (speedMsgTimer > 0)
        centered("SPEED LEVEL " + speedLevel, H / 2 - 22, 14, C.amber);

    /* Zone message */
    if (zoneMsg > 0)
        centered(ZONE_NAMES[zone], H / 2 - 4, 11, C.dimText);

    /* Survival bonus */
    if (bonusMsg > 0)
        centered("SURVIVAL BONUS +" + (dblScore ? 100 : 50), H / 2 + 14, 12, C.green);

    /* Objective banner */
    if (!objDone) {
        ctx.fillStyle = "#111";
        ctx.font = "9px monospace";
        ctx.fillText("OBJ: " + OBJ_TYPES[objIdx].desc, 8, H - 8);
    }
    if (objBonusMsg > 0) {
        centered("OBJECTIVE COMPLETE! +" + OBJ_TYPES[objIdx].bonus, H / 2 + 28, 12, C.green);
    }

    /* Achievement popup – top right corner */
    if (achTimer > 0) {
        var alpha = achTimer > 20 ? 1 : achTimer / 20;
        ctx.fillStyle = "#0d0d0d";
        ctx.fillRect(W - 145, 28, 137, 22);
        ctx.strokeStyle = C.amber; ctx.lineWidth = 1;
        ctx.strokeRect(W - 144.5, 28.5, 136, 21);
        ctx.fillStyle = C.amber;
        ctx.font = "9px monospace";
        var atw = ctx.measureText("✓ " + achMsg).width;
        ctx.fillText("✓ " + achMsg, W - 144 + ((136 - atw) >> 1), 43);
    }

    /* Paused */
    if (paused) {
        ctx.fillStyle = "#000";
        for (var pi = 0; pi < H; pi += 2) ctx.fillRect(0, pi, W, 1);
        centered("PAUSED",     H/2 - 10, 18, C.hiText);
        centered("P = RESUME", H/2 + 16, 11, C.dimText);
    }

    /* ---- DEATH SCREEN ---- */
    if (screen === SC_DEAD) {
        ctx.fillStyle = "#000";
        for (var di = 0; di < H; di += 2) ctx.fillRect(0, di, W, 1);

        centered("SYSTEM FAILURE",                     105, 20, C.hiText);
        if (newHi) centered("*** NEW HIGH SCORE ***",  128, 12, C.amber);

        /* Stats box */
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(180, 138, 280, 84);
        ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
        ctx.strokeRect(180.5, 138.5, 279, 83);

        ctx.fillStyle = C.dimText; ctx.font = "10px monospace";
        ctx.fillText("DISTANCE",    196, 154); ctx.fillStyle = C.hiText;
        ctx.font = "11px monospace"; ctx.fillText(score,          310, 154);
        ctx.fillStyle = C.dimText; ctx.font = "10px monospace";
        ctx.fillText("TIME",        196, 170); ctx.fillStyle = C.midText;
        ctx.fillText(timeSurvived + "s",       310, 170);
        ctx.fillStyle = C.dimText;
        ctx.fillText("COLLECTED",   196, 186); ctx.fillStyle = C.cyan;
        ctx.fillText(collectCount,             310, 186);
        ctx.fillStyle = C.dimText;
        ctx.fillText("NEAR MISSES", 196, 202); ctx.fillStyle = C.amber;
        ctx.fillText(nearMissCount,            310, 202);
        ctx.fillStyle = C.dimText;
        ctx.fillText("BEST SPEED",  196, 218); ctx.fillStyle = "#888";
        ctx.fillText(bestSpeed,                310, 218);

        ctx.fillStyle = "#111";
        ctx.fillRect(220, 232, 200, 28);
        ctx.strokeStyle = "#444"; ctx.lineWidth = 1;
        ctx.strokeRect(220.5, 232.5, 199, 27);
        centered("ENTER = PLAY AGAIN", 251, 13, C.hiText);
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
