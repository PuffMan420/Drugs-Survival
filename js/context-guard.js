import { CONTEXT_RESTORE_WAIT } from "./constants.js";

// The browser can take the WebGL context away (driver reset, GPU busy, too
// many tabs). Three.js keeps its own listeners and rebuilds its GPU copies of
// the scene on restore. This guard pauses the game while the context is gone,
// covers the blank (often white) canvas with a short note, and offers a
// reload if the context never comes back.
export function createContextGuard(canvas) {
  let lost = false;
  let waitTimer = 0;

  const note = document.createElement("div");
  note.id = "context-note";
  note.style.cssText = [
    "position: fixed",
    "inset: 0",
    "z-index: 40",
    "display: none",
    "flex-direction: column",
    "align-items: center",
    "justify-content: center",
    "background: #000",
    "color: #fff",
    "font: 18px/1.4 ui-sans-serif, system-ui, sans-serif",
    "text-align: center",
  ].join(";");
  const text = document.createElement("p");
  text.style.margin = "0 0 12px";
  const reload = document.createElement("button");
  reload.type = "button";
  reload.id = "context-reload";
  reload.textContent = "Reload game";
  reload.hidden = true;
  reload.style.font = "inherit";
  reload.style.cursor = "pointer";
  reload.addEventListener("click", () => window.location.reload());
  note.append(text, reload);
  document.body.append(note);

  function giveUp() {
    if (!lost) return;
    text.textContent = "Graphics did not come back.";
    reload.hidden = false;
  }

  canvas.addEventListener("webglcontextlost", (event) => {
    // Without this the browser will not try to give the context back.
    event.preventDefault();
    lost = true;
    text.textContent = "Graphics reset, one moment...";
    reload.hidden = true;
    note.style.display = "flex";
    clearTimeout(waitTimer);
    waitTimer = setTimeout(giveUp, CONTEXT_RESTORE_WAIT * 1000);
  });

  canvas.addEventListener("webglcontextrestored", () => {
    lost = false;
    clearTimeout(waitTimer);
    note.style.display = "none";
    reload.hidden = true;
  });

  return {
    get lost() {
      return lost;
    },
  };
}
