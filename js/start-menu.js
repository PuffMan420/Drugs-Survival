// Menu shown after the intro. Play stays locked until main.js says the world is ready.

const menu = document.getElementById("start-menu");
const home = document.getElementById("menu-home");
const settings = document.getElementById("menu-settings-page");
const play = document.getElementById("menu-play");
const note = document.getElementById("menu-note");
const intro = document.getElementById("intro");

let revealed = false;

function showHome() {
  home.hidden = false;
  settings.hidden = true;
}

function showSettings() {
  home.hidden = true;
  settings.hidden = false;
}

export function openMenu() {
  if (revealed) return;
  revealed = true;
  if (intro) intro.hidden = true;
  menu.hidden = false;
}

export function menuRevealed() {
  return revealed;
}

document.getElementById("menu-settings").addEventListener("click", showSettings);
document.getElementById("menu-back").addEventListener("click", showHome);

const skip = document.getElementById("intro-skip");
if (skip) skip.addEventListener("click", openMenu);

play.addEventListener("click", () => {
  if (play.disabled) return;
  document.body.classList.remove("is-menu");
  menu.hidden = true;
  const canvas = document.getElementById("view");
  canvas.focus({ preventScroll: true });
});

export function menuIsOpen() {
  return document.body.classList.contains("is-menu");
}

export function markMenuReady() {
  play.disabled = false;
  play.textContent = "Play";
  note.textContent = "";
}

export function markMenuFailed(message) {
  play.disabled = true;
  play.textContent = "Play";
  note.textContent = message;
}
