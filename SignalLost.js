/* =========================================================
   SIGNALLOST.JS
   Terminal Arcade — A Terminal Survival Mystery
   Lightweight. Text-based. Fixed FPS. Old-PC safe.
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
   PALETTE
--------------------------------------------------------- */
var C = {
    bg:       "#0b0b0b",
    panel:    "#171717",
    panelBrd: "#2a2a2a",
    text:     "#d0d0d0",
    dimText:  "#555566",
    midText:  "#8899aa",
    cyan:     "#3dd0cc",
    cyanDim:  "#0d3533",
    amber:    "#d4a843",
    amberDim: "#3a2a05",
    green:    "#4caf70",
    greenDim: "#0d2a18",
    red:      "#c03838",
    redDim:   "#2a0808",
    white:    "#f0f0f0"
};

/* ---------------------------------------------------------
   AUDIO
--------------------------------------------------------- */
var SL_AC = null;
function getSLAC() {
    if (!SL_AC) try { SL_AC = new (window.AudioContext || window.webkitAudioContext)(); } catch(e){}
    return SL_AC;
}
function slBeep(freq, dur, type, vol) {
    var ac = getSLAC(); if (!ac) return;
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
function sndSignal()   { slBeep(440, 0.06, "sine",     0.05); }
function sndCorrect()  { slBeep(660, 0.07, "sine",     0.06);
                         setTimeout(function(){ slBeep(880, 0.07, "sine", 0.05); }, 70); }
function sndWrong()    { slBeep(180, 0.15, "sawtooth", 0.08); }
function sndWarning()  { slBeep(320, 0.08, "square",   0.06);
                         setTimeout(function(){ slBeep(280, 0.08, "square", 0.06); }, 90); }
function sndTimeout()  { slBeep(220, 0.12, "sawtooth", 0.07);
                         setTimeout(function(){ slBeep(160, 0.18, "sawtooth", 0.09); }, 120); }
function sndGameOver() {
    slBeep(300, 0.10, "sawtooth", 0.08);
    setTimeout(function(){ slBeep(240, 0.10, "sawtooth", 0.08); }, 110);
    setTimeout(function(){ slBeep(180, 0.18, "sawtooth", 0.10); }, 220);
}
function sndHiScore()  {
    slBeep(440, 0.07, "square", 0.06);
    setTimeout(function(){ slBeep(550, 0.07, "square", 0.06); }, 90);
    setTimeout(function(){ slBeep(660, 0.10, "square", 0.08); }, 180);
}
function sndStory()    { slBeep(280, 0.08, "sine", 0.04);
                         setTimeout(function(){ slBeep(320, 0.08, "sine", 0.04); }, 100); }

/* ---------------------------------------------------------
   SCREENS
--------------------------------------------------------- */
var SC_MENU = 0, SC_PLAY = 1, SC_DEAD = 2;
var screen  = SC_MENU;

/* ---------------------------------------------------------
   HIGH SCORE
--------------------------------------------------------- */
var hiScore = 0;
var newHi   = false;
try { hiScore = parseInt(localStorage.getItem("sl_hi") || "0", 10); } catch(e){}
function saveHi() { try { localStorage.setItem("sl_hi", hiScore); } catch(e){} }

/* ---------------------------------------------------------
   SIGNAL SYSTEM
   Each signal has:
     id     – 4-digit number
     type   – 0=route 1=classify 2=pattern-match 3=priority
     data   – display string
     answer – correct button index (0,1,2)
     timer  – seconds left
--------------------------------------------------------- */
var MAX_SIGNALS = 4;   /* max concurrent signals */
var signals = [];
for (var si = 0; si < MAX_SIGNALS; si++)
    signals.push({ active:false, id:0, type:0, data:"", answer:0, timer:0, timerF:0,
                   opts:[], slot:0, flash:0, flashCol:"" });

/* Signal layouts: up to MAX_SIGNALS slots on screen */
var SLOT_LAYOUT = [
    /* 1 signal  */ [{ x:180, y:60,  w:280, h:200 }],
    /* 2 signals */ [{ x:20,  y:60,  w:280, h:200 }, { x:340, y:60,  w:280, h:200 }],
    /* 3 signals */ [{ x:20,  y:60,  w:180, h:200 }, { x:230, y:60,  w:180, h:200 }, { x:440, y:60, w:180, h:200 }],
    /* 4 signals */ [{ x:10,  y:50,  w:145, h:170 }, { x:165, y:50,  w:145, h:170 }, { x:325, y:50, w:145, h:170 }, { x:485, y:50, w:145, h:170 }]
];

/* ---------------------------------------------------------
   STORY MESSAGES  – shown at milestones
--------------------------------------------------------- */
var STORY = [
    { at:5,   msg: "HELLO?" },
    { at:10,  msg: "IS ANYONE THERE?" },
    { at:15,  msg: "DO NOT ROUTE SIGNAL 77" },
    { at:20,  msg: "WHO ARE YOU?" },
    { at:30,  msg: "THE STATION IS NOT EMPTY" },
    { at:40,  msg: "THEY FOUND US" },
    { at:55,  msg: "SIGNAL 77 IS REAL" },
    { at:70,  msg: "DO NOT LOOK AT THE DATA" },
    { at:90,  msg: "YOU SHOULD LEAVE" },
    { at:120, msg: "IT IS TOO LATE" }
];
var storyShown = {};
var storyMsg   = "";
var storyTimer = 0;

/* ---------------------------------------------------------
   GAME STATE
--------------------------------------------------------- */
var score        = 0;
var processed    = 0;   /* total signals answered */
var correct      = 0;   /* correct answers */
var wrong        = 0;
var timeouts     = 0;
var startTime    = 0;
var timeSurvived = 0;
var lives        = 3;   /* 3 mistakes allowed */
var paused       = false;
var difficulty   = 1;   /* scales over time */

/* Spawn timer */
var spawnTick     = 0;
var SPAWN_FIRST   = 90;   /* first signal delay */
var spawnInterval = 150;  /* ticks between new signals */

/* Feedback message */
var feedMsg   = "";
var feedCol   = C.green;
var feedTimer = 0;

/* Ambient data stream (bg scrolling) */
var stream = [];
var STREAM_MAX = 8;
for (var i = 0; i < STREAM_MAX; i++)
    stream.push({ x: (Math.random() * W) | 0, y: (Math.random() * H) | 0,
                  txt: "", life: 0 });
var streamTick = 0;
var STREAM_MSGS = ["01001","10110","##ERR","LOST","NULL","ROUT","SCAN","ACK","SYN","DATA",
                   "0x4F","0xFF","VOID","PING","NODE","0101","FEED","LINK",">>>","<<<"];

/* Status lights */
var statusLights = [
    { col: C.green, label: "PWR",  blink: false },
    { col: C.cyan,  label: "SIG",  blink: false },
    { col: C.amber, label: "PROC", blink: false },
    { col: C.red,   label: "WARN", blink: true  }
];
var lightTick = 0;

/* Idle menu animation */
var idleTick = 0;
var idleStr  = "";

/* ---------------------------------------------------------
   SIGNAL GENERATION
--------------------------------------------------------- */
var nextID = 1000;

function randInt(a, b) { return a + ((Math.random() * (b - a + 1)) | 0); }

function makeRouteSignal() {
    var routes = ["ALPHA","BETA","GAMMA","DELTA","OMEGA"];
    var ans    = randInt(0, 2);
    var opts   = [];
    var pool   = routes.slice(); /* copy */
    for (var i = 0; i < 3; i++) {
        var idx = (Math.random() * pool.length) | 0;
        opts.push(pool.splice(idx, 1)[0]);
    }
    return {
        type: 0,
        data: "ROUTE TO:",
        opts: opts,
        answer: ans,
        hint: "SELECT ROUTE"
    };
}

function makeClassifySignal() {
    var classes = [
        { lbl:"PRIORITY", opts:["NORMAL","URGENT","JUNK"] },
        { lbl:"ENCRYPT",  opts:["CLEAR","ENCRYPT","BLOCK"] },
        { lbl:"SOURCE",   opts:["KNOWN","UNKNOWN","HOSTILE"] }
    ];
    var cls  = classes[randInt(0, classes.length - 1)];
    var ans  = randInt(0, 2);
    /* Make one option obviously correct based on signal data */
    var keys = ["CLEAR", "URGENT", "KNOWN", "HOSTILE", "JUNK", "ENCRYPT", "NORMAL"];
    var dataWord = cls.opts[ans];
    return {
        type: 1,
        data: "CLASSIFY: " + dataWord + "?",
        opts: cls.opts,
        answer: ans,
        hint: "IDENTIFY CLASS"
    };
}

function makePatternSignal() {
    /* Show a 5-cell binary pattern, ask which matches */
    var patterns = ["▣▣□▣□","▣□▣▣□","□▣▣□▣","▣▣▣□□","□□▣▣▣","▣□□▣▣","□▣□▣▣"];
    var target   = patterns[randInt(0, patterns.length - 1)];
    var ans      = randInt(0, 2);
    var opts     = [];
    var used     = [target];
    for (var i = 0; i < 3; i++) {
        if (i === ans) { opts.push(target); continue; }
        var p;
        do { p = patterns[randInt(0, patterns.length - 1)]; } while (used.indexOf(p) >= 0);
        used.push(p); opts.push(p);
    }
    return {
        type: 2,
        data: target,
        opts: opts,
        answer: ans,
        hint: "MATCH PATTERN"
    };
}

function makePrioritySignal() {
    var levels = ["LOW","MED","HIGH","CRIT"];
    /* Show a number-coded level, ask for text equivalent */
    var numMap = { "1":"LOW","2":"MED","3":"HIGH","4":"CRIT" };
    var num    = "" + randInt(1, 4);
    var correct_lbl = numMap[num];
    var ans    = randInt(0, 2);
    var opts   = [];
    var lvCopy = levels.slice();
    var ci     = lvCopy.indexOf(correct_lbl);
    lvCopy.splice(ci, 1);
    for (var i = 0; i < 3; i++) {
        if (i === ans) { opts.push(correct_lbl); continue; }
        var idx = (Math.random() * lvCopy.length) | 0;
        opts.push(lvCopy.splice(idx, 1)[0]);
    }
    return {
        type: 3,
        data: "LEVEL " + num + " SIGNAL",
        opts: opts,
        answer: ans,
        hint: "DECODE LEVEL"
    };
}

function generateSignal() {
    /* Find empty slot */
    var slot = -1;
    for (var i = 0; i < MAX_SIGNALS; i++) {
        if (!signals[i].active) { slot = i; break; }
    }
    if (slot < 0) return;

    /* Difficulty caps concurrent signals */
    var maxConcurrent = Math.min(difficulty, MAX_SIGNALS);
    var active = 0;
    for (var i = 0; i < MAX_SIGNALS; i++) if (signals[i].active) active++;
    if (active >= maxConcurrent) return;

    nextID++;
    var makers = [makeRouteSignal, makeClassifySignal, makePatternSignal, makePrioritySignal];
    var typeIdx = difficulty <= 1 ? 0 : randInt(0, Math.min(difficulty, makers.length) - 1);
    var def = makers[typeIdx]();

    /* Timer: starts at 8s, shrinks with difficulty */
    var secs = Math.max(3, 8 - difficulty);

    signals[slot].active  = true;
    signals[slot].id      = nextID;
    signals[slot].type    = def.type;
    signals[slot].data    = def.data;
    signals[slot].opts    = def.opts;
    signals[slot].answer  = def.answer;
    signals[slot].hint    = def.hint;
    signals[slot].timer   = secs;
    signals[slot].timerF  = secs * 30;  /* in ticks */
    signals[slot].slot    = slot;
    signals[slot].flash   = 0;
    signals[slot].flashCol = "";

    sndSignal();
}

/* ---------------------------------------------------------
   ANSWER  (button index 0,1,2)
--------------------------------------------------------- */
function answerSignal(sigIdx, btnIdx) {
    var s = signals[sigIdx];
    if (!s.active) return;
    processed++;

    if (btnIdx === s.answer) {
        /* Correct */
        score += 10 + (difficulty * 2);
        correct++;
        s.flash = 12; s.flashCol = C.green;
        sndCorrect();
        feedMsg = "CORRECT +" + (10 + difficulty * 2);
        feedCol = C.green; feedTimer = 50;
        if (score > hiScore) { hiScore = score; newHi = true; saveHi(); }
    } else {
        /* Wrong */
        lives--;
        wrong++;
        s.flash = 14; s.flashCol = C.red;
        sndWrong();
        feedMsg = "WRONG  -1 LIFE";
        feedCol = C.red; feedTimer = 50;
        statusLights[3].blink = true;
    }

    /* Deactivate after brief flash */
    setTimeout(function() {
        if (s.flash > 0) { s.active = false; s.flash = 0; }
    }, 400);

    /* Story trigger */
    checkStory();

    if (lives <= 0) { endGame(); }
}

/* ---------------------------------------------------------
   STORY CHECK
--------------------------------------------------------- */
function checkStory() {
    for (var i = 0; i < STORY.length; i++) {
        var st = STORY[i];
        if (!storyShown[st.at] && processed >= st.at) {
            storyShown[st.at] = true;
            storyMsg   = st.msg;
            storyTimer = 120;
            sndStory();
            break;
        }
    }
}

/* ---------------------------------------------------------
   INIT
--------------------------------------------------------- */
function initGame() {
    score = processed = correct = wrong = timeouts = 0;
    lives = 3; paused = false; newHi = false;
    difficulty = 1;
    spawnTick  = 0; spawnInterval = 150;
    feedMsg = ""; feedTimer = 0;
    storyMsg = ""; storyTimer = 0; storyShown = {};
    startTime = Date.now(); timeSurvived = 0;
    nextID    = 1000;
    for (var i = 0; i < MAX_SIGNALS; i++) signals[i].active = false;
    for (var i = 0; i < STREAM_MAX;  i++) stream[i].life = 0;
    statusLights[3].blink = false;
    screen = SC_PLAY;
    /* First signal comes quickly */
    spawnTick = SPAWN_FIRST - 30;
}

/* ---------------------------------------------------------
   END GAME
--------------------------------------------------------- */
function endGame() {
    if (score > hiScore) { hiScore = score; newHi = true; saveHi(); sndHiScore(); }
    else sndGameOver();
    try { if (navigator.vibrate) navigator.vibrate([30, 20, 40]); } catch(e){}
    screen = SC_DEAD;
}

/* ---------------------------------------------------------
   INPUT – keyboard
--------------------------------------------------------- */
window.__currentKeydown = function(e) {
    var k = e.code;
    if (screen === SC_MENU && (k === "Enter" || k === "Space")) { initGame(); return; }
    if (screen === SC_DEAD && (k === "Enter" || k === "Space")) { initGame(); return; }
    if (k === "Escape") { if (screen === SC_PLAY) screen = SC_MENU; return; }
    if (k === "KeyP" && screen === SC_PLAY) { paused = !paused; return; }
    if (k === "KeyF") {
        if (!document.fullscreenElement) { if (canvas.requestFullscreen) canvas.requestFullscreen(); }
        else { if (document.exitFullscreen) document.exitFullscreen(); }
        return;
    }
});

/* ---------------------------------------------------------
   MOUSE / TOUCH – button hit detection
--------------------------------------------------------- */
function getActiveCount() {
    var n = 0;
    for (var i = 0; i < MAX_SIGNALS; i++) if (signals[i].active) n++;
    return n;
}

function getSlotRect(slot) {
    var n = getActiveCount();
    if (n < 1) n = 1; if (n > 4) n = 4;
    var layout = SLOT_LAYOUT[n - 1];
    /* Map active signal slot index to layout index */
    var activeIdx = 0;
    for (var i = 0; i < MAX_SIGNALS; i++) {
        if (!signals[i].active) continue;
        if (i === slot) return layout[activeIdx];
        activeIdx++;
    }
    return null;
}

function handleClick(mx, my) {
    if (screen === SC_MENU) { initGame(); return; }
    if (screen === SC_DEAD) { initGame(); return; }
    if (screen !== SC_PLAY || paused) return;

    /* Check each active signal's buttons */
    for (var i = 0; i < MAX_SIGNALS; i++) {
        var s = signals[i];
        if (!s.active || s.flash > 0) continue;
        var r = getSlotRect(i);
        if (!r) continue;

        /* Button positions within slot */
        var btnH = 24, btnY0 = r.y + r.h - 90, gap = 28;
        for (var b = 0; b < 3; b++) {
            var by = btnY0 + b * gap;
            if (mx >= r.x + 4 && mx <= r.x + r.w - 4 &&
                my >= by       && my <= by + btnH) {
                answerSignal(i, b);
                return;
            }
        }
    }
}

canvas.addEventListener("click", function(e) {
    var rect = canvas.getBoundingClientRect();
    handleClick(
        ((e.clientX - rect.left) * W / rect.width)  | 0,
        ((e.clientY - rect.top)  * H / rect.height) | 0
    );
});

canvas.addEventListener("touchstart", function(e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    for (var t = 0; t < e.changedTouches.length; t++) {
        handleClick(
            ((e.changedTouches[t].clientX - rect.left) * W / rect.width)  | 0,
            ((e.changedTouches[t].clientY - rect.top)  * H / rect.height) | 0
        );
    }
}, { passive: false });

/* Pause button in overlay topbar */
(function() {
    var topbar = document.getElementById("overlay-topbar");
    if (!topbar || document.getElementById("sl-pause-top")) return;
    var pb = document.createElement("button");
    pb.id = "sl-pause-top"; pb.textContent = "II PAUSE";
    pb.style.cssText = "font-family:monospace;font-size:12px;background:#111;color:#aaa;" +
                       "border:1px solid #333;padding:4px 10px;cursor:pointer;margin-left:8px;";
    pb.addEventListener("click", function() {
        if (screen !== SC_PLAY) return;
        paused = !paused; pb.textContent = paused ? "▶ RESUME" : "II PAUSE";
    });
    topbar.appendChild(pb);
})();

/* ---------------------------------------------------------
   UPDATE
--------------------------------------------------------- */
function update() {
    if (screen !== SC_PLAY || paused) return;

    timeSurvived = ((Date.now() - startTime) / 1000) | 0;

    /* Difficulty ramp every 10 correct answers */
    var newDiff = Math.min(4, ((correct / 10) | 0) + 1);
    if (newDiff > difficulty) {
        difficulty = newDiff;
        spawnInterval = Math.max(60, 150 - difficulty * 20);
        sndWarning();
    }

    /* Ambient stream */
    streamTick++;
    if (streamTick % 18 === 0) {
        var si2 = (Math.random() * STREAM_MAX) | 0;
        stream[si2].x   = (Math.random() * (W - 60)) | 0;
        stream[si2].y   = (20 + Math.random() * (H - 40)) | 0;
        stream[si2].txt = STREAM_MSGS[(Math.random() * STREAM_MSGS.length) | 0];
        stream[si2].life = 40;
    }
    for (var i = 0; i < STREAM_MAX; i++) if (stream[i].life > 0) stream[i].life--;

    /* Status light blink */
    lightTick++;

    /* Spawn */
    spawnTick++;
    if (spawnTick >= spawnInterval) { spawnTick = 0; generateSignal(); }

    /* Tick signal timers */
    for (var i = 0; i < MAX_SIGNALS; i++) {
        var s = signals[i];
        if (!s.active) continue;
        if (s.flash > 0) { s.flash--; if (s.flash === 0) s.active = false; continue; }
        s.timerF--;
        s.timer = (s.timerF / 30) | 0;
        if (s.timerF <= 0) {
            /* Timeout */
            s.active = false;
            lives--;
            timeouts++;
            sndTimeout();
            feedMsg = "TIMEOUT  -1 LIFE";
            feedCol = C.amber; feedTimer = 55;
            statusLights[3].blink = true;
            checkStory();
            if (lives <= 0) { endGame(); return; }
        }
    }

    if (feedTimer > 0) feedTimer--;
    if (storyTimer > 0) storyTimer--;
    idleTick++;
}

/* ---------------------------------------------------------
   DRAW HELPERS
--------------------------------------------------------- */
function centered(txt, y, size, col) {
    ctx.fillStyle = col; ctx.font = size + "px monospace";
    var tw = ctx.measureText(txt).width;
    ctx.fillText(txt, (W - tw) >> 1, y);
}

function drawPanel(x, y, w, h, title, brdCol) {
    ctx.fillStyle = C.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = brdCol || C.panelBrd;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (title) {
        ctx.fillStyle = C.panelBrd;
        ctx.fillRect(x, y, w, 14);
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 13);
        ctx.fillStyle = C.dimText;
        ctx.font = "8px monospace";
        ctx.fillText(title, x + 4, y + 10);
    }
}

/* ---------------------------------------------------------
   DRAW SIGNAL CARD
--------------------------------------------------------- */
function drawSignal(s, r) {
    if (!s.active) return;

    var flashOn = s.flash > 0 && (s.flash % 3 < 2);
    var brdCol  = flashOn ? s.flashCol : (s.timerF < 60 ? C.amber : C.panelBrd);

    drawPanel(r.x, r.y, r.w, r.h, "SIGNAL #" + s.id, brdCol);

    /* Hint */
    ctx.fillStyle = C.dimText; ctx.font = "8px monospace";
    ctx.fillText(s.hint, r.x + 4, r.y + 24);

    /* Data */
    ctx.fillStyle = flashOn ? s.flashCol : C.text;
    ctx.font = "11px monospace";
    /* Word-wrap data */
    var words = s.data.split(" ");
    var line = "", ly = r.y + 42;
    for (var wi = 0; wi < words.length; wi++) {
        var test = line + (line ? " " : "") + words[wi];
        if (ctx.measureText(test).width > r.w - 10) {
            ctx.fillText(line, r.x + 5, ly); ly += 14; line = words[wi];
        } else { line = test; }
    }
    if (line) { ctx.fillText(line, r.x + 5, ly); }

    /* Timer bar */
    var barY = r.y + r.h - 100;
    var pct  = s.timerF / (s.timer === 0 ? 1 : (Math.max(3, 8 - difficulty) * 30));
    if (pct < 0) pct = 0; if (pct > 1) pct = 1;
    var barW = r.w - 10;
    ctx.fillStyle = "#111"; ctx.fillRect(r.x + 5, barY, barW, 5);
    ctx.fillStyle = pct > 0.4 ? C.green : (pct > 0.2 ? C.amber : C.red);
    ctx.fillRect(r.x + 5, barY, (barW * pct) | 0, 5);
    ctx.fillStyle = C.dimText; ctx.font = "8px monospace";
    ctx.fillText(s.timer + "s", r.x + 5, barY + 16);

    /* Buttons */
    var btnH = 22, btnY0 = r.y + r.h - 88, gap = 27;
    for (var b = 0; b < 3; b++) {
        var by = btnY0 + b * gap;
        var hover = flashOn && b === s.answer;
        ctx.fillStyle = hover ? s.flashCol : "#0f0f0f";
        ctx.fillRect(r.x + 4, by, r.w - 8, btnH);
        ctx.strokeStyle = hover ? s.flashCol : C.panelBrd;
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 4.5, by + 0.5, r.w - 9, btnH - 1);
        ctx.fillStyle = hover ? "#000" : C.text;
        ctx.font = "10px monospace";
        var bw = ctx.measureText(s.opts[b]).width;
        ctx.fillText(s.opts[b], r.x + 4 + ((r.w - 8 - bw) >> 1), by + 15);
    }
}

/* ---------------------------------------------------------
   DRAW
--------------------------------------------------------- */
function draw() {
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    /* Ambient stream text */
    ctx.font = "9px monospace";
    for (var i = 0; i < STREAM_MAX; i++) {
        var sm = stream[i];
        if (sm.life <= 0) continue;
        var a = sm.life / 40;
        /* Simulate low opacity by using a dark colour */
        ctx.fillStyle = sm.life > 20 ? "#1e2a1e" : "#151a15";
        ctx.fillText(sm.txt, sm.x, sm.y);
    }

    /* ---- MENU ---- */
    if (screen === SC_MENU) {
        /* Draw panels for atmosphere */
        drawPanel(20,  40,  180, 120, "SYSTEM STATUS");
        drawPanel(440, 40,  180, 120, "UPLINK FEED");
        drawPanel(20,  180, 180, 80,  "DIAGNOSTICS");
        drawPanel(440, 180, 180, 80,  "HISTORY");

        /* Idle blinking cursor */
        var cursor = ((idleTick >> 4) & 1) ? "_" : " ";

        ctx.fillStyle = C.text; ctx.font = "bold 22px monospace";
        var tw = ctx.measureText("SIGNAL LOST").width;
        ctx.fillText("SIGNAL LOST", (W - tw) >> 1, H/2 - 56);

        ctx.fillStyle = C.dimText; ctx.font = "11px monospace";
        tw = ctx.measureText("A TERMINAL SURVIVAL MYSTERY").width;
        ctx.fillText("A TERMINAL SURVIVAL MYSTERY", (W - tw) >> 1, H/2 - 36);

        /* Fake status lines in panels */
        ctx.font = "8px monospace";
        ctx.fillStyle = C.green;
        ctx.fillText("PWR:  ONLINE",   30, 70);
        ctx.fillText("SIG:  ACTIVE",   30, 83);
        ctx.fillStyle = C.amber;
        ctx.fillText("WARN: DETECTED", 30, 96);
        ctx.fillStyle = C.dimText;
        ctx.fillText("LOAD: 0.4%",     30, 109);

        ctx.fillStyle = C.cyan;
        ctx.fillText(">> FEED LIVE",   450, 70);
        ctx.fillStyle = C.dimText;
        ctx.fillText("SIG #" + (1000 + ((idleTick>>3) & 255)), 450, 83);
        ctx.fillText("ROUTING...",     450, 96);
        ctx.fillText("ACK PENDING",    450, 109);

        /* Start button */
        ctx.fillStyle = C.panel;
        ctx.fillRect(220, H/2 - 22, 200, 30);
        ctx.strokeStyle = C.cyanDim; ctx.lineWidth = 1;
        ctx.strokeRect(220.5, (H/2 - 22) + 0.5, 199, 29);
        ctx.fillStyle = C.white; ctx.font = "13px monospace";
        tw = ctx.measureText("ENTER / CLICK = START").width;
        ctx.fillText("ENTER / CLICK = START", 220 + ((200 - tw) >> 1), H/2 - 3);

        /* Stats */
        ctx.fillStyle = C.dimText; ctx.font = "10px monospace";
        tw = ctx.measureText("HIGH SCORE: " + hiScore).width;
        ctx.fillText("HIGH SCORE: " + hiScore, (W - tw) >> 1, H/2 + 20);

        ctx.fillStyle = "#222"; ctx.font = "9px monospace";
        ctx.fillText("CLICK SIGNALS TO ROUTE THEM BEFORE TIME RUNS OUT", 108, H/2 + 40);
        ctx.fillText("3 TIMEOUTS OR WRONG ANSWERS = GAME OVER", 140, H/2 + 54);
        ctx.fillText("ESC = EXIT   P = PAUSE   F = FULLSCREEN", 142, H - 10);
        return;
    }

    /* ---- PLAY ---- */

    /* Top HUD */
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, W, 22);
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, 21, W, 1);

    ctx.fillStyle = C.text; ctx.font = "10px monospace";
    ctx.fillText("SCORE " + score, 8, 15);
    ctx.fillStyle = C.dimText;
    ctx.fillText(" | HIGH " + hiScore, 80, 15);
    ctx.fillText(" | PROC " + processed, 168, 15);
    ctx.fillText(" | T " + timeSurvived + "s", 240, 15);

    /* Lives */
    ctx.fillStyle = C.red;
    ctx.font = "10px monospace";
    var livesStr = "";
    for (var i = 0; i < 3; i++) livesStr += (i < lives ? "♥ " : "♡ ");
    var lw = ctx.measureText(livesStr).width;
    ctx.fillText(livesStr, W - lw - 8, 15);

    /* Bottom status bar */
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, H - 20, W, 20);
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(0, H - 21, W, 1);

    /* Status lights */
    for (var i = 0; i < statusLights.length; i++) {
        var lt = statusLights[i];
        var on = !lt.blink || ((lightTick >> 3) & 1);
        ctx.fillStyle = on ? lt.col : "#222";
        ctx.fillRect(8 + i * 55, H - 15, 8, 8);
        ctx.fillStyle = C.dimText; ctx.font = "8px monospace";
        ctx.fillText(lt.label, 20 + i * 55, H - 8);
    }

    /* Difficulty label */
    var diffLabels = ["","EASY","MEDIUM","HARD","CRITICAL"];
    ctx.fillStyle = difficulty >= 4 ? C.red : (difficulty >= 3 ? C.amber : C.dimText);
    ctx.font = "9px monospace";
    ctx.fillText("LVL:" + diffLabels[difficulty], W - 90, H - 8);

    /* Feedback message */
    if (feedTimer > 0) {
        ctx.fillStyle = feedCol; ctx.font = "11px monospace";
        var fw = ctx.measureText(feedMsg).width;
        ctx.fillText(feedMsg, (W - fw) >> 1, H - 28);
    }

    /* Story message */
    if (storyTimer > 0) {
        var stAlpha = storyTimer > 30 ? 1 : storyTimer / 30;
        ctx.fillStyle = stAlpha > 0.5 ? C.amber : C.amberDim;
        ctx.font = "bold 13px monospace";
        var sw2 = ctx.measureText(storyMsg).width;
        /* Draw with a dark bg */
        ctx.fillStyle = "#0d0a00";
        ctx.fillRect((W - sw2) / 2 - 6, H/2 - 40, sw2 + 12, 18);
        ctx.fillStyle = C.amber;
        ctx.fillText(storyMsg, (W - sw2) / 2, H/2 - 26);
    }

    /* Active signal count */
    var active = getActiveCount();
    if (active === 0 && !paused) {
        ctx.fillStyle = C.dimText; ctx.font = "10px monospace";
        centered("AWAITING SIGNAL...", H/2, 10, C.dimText);
    }

    /* Draw signals */
    var layout = active >= 1 ? SLOT_LAYOUT[Math.min(active, 4) - 1] : [];
    var ai = 0;
    for (var i = 0; i < MAX_SIGNALS; i++) {
        if (!signals[i].active) continue;
        if (ai < layout.length) drawSignal(signals[i], layout[ai]);
        ai++;
    }

    /* Paused */
    if (paused) {
        ctx.fillStyle = "#000";
        for (var pi = 0; pi < H; pi += 2) ctx.fillRect(0, pi, W, 1);
        centered("PAUSED",     H/2 - 10, 18, C.text);
        centered("P = RESUME", H/2 + 14, 11, C.dimText);
    }

    /* ---- DEATH SCREEN ---- */
    if (screen === SC_DEAD) {
        ctx.fillStyle = "#000";
        for (var di = 0; di < H; di += 2) ctx.fillRect(0, di, W, 1);

        centered("CONNECTION LOST",    100, 20, C.text);
        if (newHi) centered("★ NEW HIGH SCORE ★", 124, 11, C.amber);

        drawPanel(185, 136, 270, 100, "SESSION REPORT", C.panelBrd);

        ctx.font = "10px monospace";
        function stat2(lbl, val, y, vc) {
            ctx.fillStyle = C.dimText; ctx.fillText(lbl, 198, y);
            ctx.fillStyle = vc || C.text; ctx.fillText("" + val, 340, y);
        }
        stat2("SCORE",     score,        154);
        stat2("HIGH",      hiScore,      168, C.amber);
        stat2("PROCESSED", processed,    182);
        stat2("CORRECT",   correct,      196, C.green);
        stat2("WRONG",     wrong,        210, C.red);
        stat2("TIMEOUTS",  timeouts,     224, C.amber);

        ctx.fillStyle = C.panel;
        ctx.fillRect(220, 248, 200, 28);
        ctx.strokeStyle = C.cyanDim; ctx.lineWidth = 1;
        ctx.strokeRect(220.5, 248.5, 199, 27);
        ctx.fillStyle = C.white; ctx.font = "12px monospace";
        var ew = ctx.measureText("ENTER = PLAY AGAIN").width;
        ctx.fillText("ENTER = PLAY AGAIN", 220 + ((200 - ew) >> 1), 267);
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
