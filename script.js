"use strict";

// ---------- Sozlamalar ----------
const DEFAULTS = [
  { name: "Sho‘rva", seconds: 90 },
  { name: "Guruch", seconds: 60 },
  { name: "Salat", seconds: 30 },
];
const PRESETS = [[30, "30 soniya"], [60, "1 daqiqa"], [300, "5 daqiqa"], [600, "10 daqiqa"]];
const MAX_TIMERS = 6;
const MAX_SECONDS = 86399; // 23:59:59
const STORE_KEY = "oshxona-taymerlari-v2";
const CIRCUMFERENCE = 2 * Math.PI * 54;
const BASE_TITLE = document.title;

const STATUS_TEXT = {
  idle: "Tayyor",
  running: "Ishlayapti",
  paused: "To‘xtatilgan",
  done: "Vaqt tugadi!",
};

const container = document.getElementById("timers");
const addBtn = document.getElementById("addTimer");
const startAllBtn = document.getElementById("startAll");
const pauseAllBtn = document.getElementById("pauseAll");
const soundBtn = document.getElementById("soundBtn");

const timers = [];
let soundOn = true;
let nextId = 1;

// ---------- Saqlash (3-afzallik) ----------
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY));
    if (data && Array.isArray(data.timers) && data.timers.length) {
      soundOn = data.sound !== false;
      return data.timers.slice(0, MAX_TIMERS).map((x) => ({
        name: String(x.name || ""),
        seconds: Math.min(MAX_SECONDS, Math.max(0, Number(x.seconds) || 0)),
      }));
    }
  } catch (e) { /* saqlangan ma’lumot yo‘q */ }
  return DEFAULTS;
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      sound: soundOn,
      timers: timers.map((t) => ({ name: t.nameInput.value, seconds: getSeconds(t) })),
    }));
  } catch (e) { /* saqlash imkoni bo‘lmasa, sayt baribir ishlaydi */ }
}

// ---------- Vaqt yordamchilari ----------
const num = (el) => Math.max(0, Math.floor(Number(el.value)) || 0);

function getSeconds(t) {
  return Math.min(MAX_SECONDS, num(t.h) * 3600 + num(t.m) * 60 + num(t.s));
}

function setInputs(t, total) {
  t.h.value = Math.floor(total / 3600);
  t.m.value = Math.floor((total % 3600) / 60);
  t.s.value = total % 60;
}

function humanize(sec) {
  if (sec < 1) return "Vaqtni kiriting";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h} soat`);
  if (m) parts.push(`${m} daqiqa`);
  if (s) parts.push(`${s} soniya`);
  return "Jami: " + parts.join(" ");
}

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const isLocked = (t) => t.state === "running" || t.state === "paused";

// ---------- Taymer kartasi ----------
function createTimer(data) {
  const id = nextId++;
  const card = document.createElement("article");
  card.className = "timer";
  card.innerHTML = `
    <div class="fields__top">
      <div class="field">
        <label for="name-${id}">Jarayon nomi</label>
        <input id="name-${id}" type="text" maxlength="30">
      </div>
      <button type="button" class="icon-btn remove-btn" aria-label="Taymerni o‘chirish" title="O‘chirish">×</button>
    </div>

    <div class="time-inputs" role="group" aria-label="Davomiylik">
      <div class="field"><label for="h-${id}">Soat</label>
        <input id="h-${id}" type="number" min="0" max="23" inputmode="numeric"></div>
      <div class="field"><label for="m-${id}">Daqiqa</label>
        <input id="m-${id}" type="number" min="0" inputmode="numeric"></div>
      <div class="field"><label for="s-${id}">Soniya</label>
        <input id="s-${id}" type="number" min="0" inputmode="numeric"></div>
    </div>
    <p class="total"></p>

    <div class="presets" role="group" aria-label="Tez tanlash">
      ${PRESETS.map(([sec, label]) => `<button type="button" class="chip" data-sec="${sec}">${label}</button>`).join("")}
    </div>

    <div class="ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="ring__track" cx="60" cy="60" r="54"></circle>
        <circle class="ring__bar" cx="60" cy="60" r="54" stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="0"></circle>
      </svg>
      <div class="ring__time"><span class="time">00:00</span><small class="sub"></small></div>
    </div>

    <p class="status" role="status" aria-live="polite"></p>
    <p class="error" role="alert"></p>

    <div class="actions">
      <button type="button" class="btn btn--primary main-btn">Boshlash</button>
      <button type="button" class="btn btn--ghost reset-btn">Boshidan</button>
    </div>
  `;
  container.appendChild(card);

  const t = {
    card,
    nameInput: card.querySelector(`#name-${id}`),
    h: card.querySelector(`#h-${id}`),
    m: card.querySelector(`#m-${id}`),
    s: card.querySelector(`#s-${id}`),
    chips: card.querySelectorAll(".chip"),
    totalText: card.querySelector(".total"),
    bar: card.querySelector(".ring__bar"),
    time: card.querySelector(".time"),
    sub: card.querySelector(".sub"),
    status: card.querySelector(".status"),
    error: card.querySelector(".error"),
    mainBtn: card.querySelector(".main-btn"),
    resetBtn: card.querySelector(".reset-btn"),
    state: "idle",
    total: 0,
    remaining: 0,
    endAt: 0,
    tickSec: 0, // oxirgi signal berilgan soniya (5..1)
  };

  t.nameInput.value = data.name;
  setInputs(t, data.seconds);

  t.mainBtn.addEventListener("click", () => onMainClick(t));
  t.resetBtn.addEventListener("click", () => reset(t));
  card.querySelector(".remove-btn").addEventListener("click", () => removeTimer(t));

  [t.h, t.m, t.s].forEach((el) => {
    el.addEventListener("input", () => { if (!isLocked(t)) { reset(t); save(); } });
    // 90 soniya yozilsa, avtomatik 1 daqiqa 30 soniyaga aylanadi
    el.addEventListener("change", () => { if (!isLocked(t)) { setInputs(t, getSeconds(t)); reset(t); save(); } });
  });
  t.nameInput.addEventListener("input", () => { t.error.textContent = ""; save(); });
  t.chips.forEach((chip) => chip.addEventListener("click", () => {
    setInputs(t, Number(chip.dataset.sec));
    reset(t);
    save();
  }));

  reset(t);
  return t;
}

function render(t) {
  const fraction = t.total > 0 ? t.remaining / t.total : 0;
  t.bar.style.strokeDashoffset = CIRCUMFERENCE * (1 - fraction);
  t.time.textContent = formatTime(t.remaining);
  t.sub.textContent = t.state === "done" ? "" : "qoldi";
  t.card.dataset.state = t.state;
  t.status.textContent = STATUS_TEXT[t.state];
  t.totalText.textContent = humanize(getSeconds(t));

  const locked = isLocked(t);
  [t.nameInput, t.h, t.m, t.s].forEach((el) => (el.disabled = locked));
  t.chips.forEach((c) => (c.disabled = locked));
  t.resetBtn.disabled = t.state === "idle";
  t.mainBtn.textContent =
    { idle: "Boshlash", running: "To‘xtatish", paused: "Davom ettirish", done: "Qayta boshlash" }[t.state];
}

function reset(t) {
  t.state = "idle";
  t.total = getSeconds(t) * 1000;
  t.remaining = t.total;
  t.tickSec = 0;
  t.error.textContent = "";
  render(t);
}

// ---------- Boshqaruv ----------
function onMainClick(t) {
  if (t.state === "idle") start(t);
  else if (t.state === "running") pause(t);
  else if (t.state === "paused") resume(t);
  else { reset(t); start(t); }
}

function start(t) {
  const seconds = getSeconds(t);
  if (seconds < 1) {
    t.error.textContent = "Kamida 1 soniya kiriting.";
    t.s.focus();
    return;
  }
  if (!t.nameInput.value.trim()) t.nameInput.value = `Jarayon ${timers.indexOf(t) + 1}`;
  setInputs(t, seconds);
  t.total = seconds * 1000;
  t.remaining = t.total;
  t.tickSec = 0;
  t.error.textContent = "";
  save();
  resume(t);
}

function resume(t) {
  t.state = "running";
  t.endAt = Date.now() + t.remaining;
  render(t);
}

function pause(t) {
  t.remaining = Math.max(0, t.endAt - Date.now());
  t.state = "paused";
  render(t);
}

function finish(t) {
  t.remaining = 0;
  t.state = "done";
  render(t);
  t.status.textContent = `${t.nameInput.value.trim() || "Jarayon"}: vaqt tugadi!`;
  beep();
}

// ---------- 2-afzallik: qo‘shish, o‘chirish, hammasini boshqarish ----------
function updateAddBtn() {
  addBtn.disabled = timers.length >= MAX_TIMERS;
  addBtn.textContent = timers.length >= MAX_TIMERS ? `Eng ko‘pi: ${MAX_TIMERS} ta` : "+ Taymer qo‘shish";
}

function addTimer() {
  if (timers.length >= MAX_TIMERS) return;
  timers.push(createTimer({ name: `Jarayon ${timers.length + 1}`, seconds: 60 }));
  updateAddBtn();
  save();
}

function removeTimer(t) {
  if (timers.length <= 1) {
    t.error.textContent = "Kamida bitta taymer qolishi kerak.";
    return;
  }
  timers.splice(timers.indexOf(t), 1);
  t.card.remove();
  updateAddBtn();
  save();
}

addBtn.addEventListener("click", addTimer);

startAllBtn.addEventListener("click", () => {
  timers.forEach((t) => {
    if (t.state === "idle") start(t);
    else if (t.state === "paused") resume(t);
    else if (t.state === "done") { reset(t); start(t); }
  });
});

pauseAllBtn.addEventListener("click", () => {
  timers.forEach((t) => { if (t.state === "running") pause(t); });
});

// ---------- 3-afzallik: ovoz tugmasi, sarlavhada qolgan vaqt ----------
function renderSoundBtn() {
  soundBtn.textContent = soundOn ? "Ovoz: yoqilgan" : "Ovoz: o‘chiq";
  soundBtn.setAttribute("aria-pressed", String(soundOn));
}

soundBtn.addEventListener("click", () => {
  soundOn = !soundOn;
  renderSoundBtn();
  save();
});

let audioCtx;
function beep() { playTones(880, [0, 0.25, 0.5]); } // vaqt tugadi: 3 ta signal
function warnBeep() { playTones(660, [0]); }         // oxirgi 5 soniya: har soniyada 1 ta qisqa signal

function playTones(freq, delays) {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    delays.forEach((delay) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + 0.2);
    });
  } catch (e) { /* ovoz ishlamasa, matnli holat baribir chiqadi */ }
}

// Boshqa oynada ishlayotganda ham brauzer tabida qolgan vaqt ko‘rinadi
function updateTitle() {
  const running = timers.filter((t) => t.state === "running");
  if (running.length) {
    const next = running.reduce((a, b) => (a.remaining < b.remaining ? a : b));
    document.title = `${formatTime(next.remaining)} · ${next.nameInput.value.trim() || "Taymer"}`;
  } else if (timers.some((t) => t.state === "done")) {
    document.title = "Vaqt tugadi! · " + BASE_TITLE;
  } else {
    document.title = BASE_TITLE;
  }
}

// ---------- Umumiy sanoq ----------
function tick() {
  const now = Date.now();
  timers.forEach((t) => {
    if (t.state !== "running") return;
    t.remaining = Math.max(0, t.endAt - now);
    if (t.remaining === 0) {
      finish(t);
    } else {
      render(t);
      // Oxirgi 5 soniyada har soniyada qisqa signal: 5, 4, 3, 2, 1 (taymer 5 soniyadan uzun bo‘lsa)
      if (t.total > 5000 && t.remaining <= 5000) {
        const sec = Math.ceil(t.remaining / 1000);
        if (sec !== t.tickSec) {
          t.tickSec = sec;
          warnBeep();
        }
      }
    }
  });
  updateTitle();
}

load().forEach((d) => timers.push(createTimer(d)));
renderSoundBtn();
updateAddBtn();
setInterval(tick, 100);
