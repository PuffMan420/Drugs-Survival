// Phone controls. Desktop never mounts this. Buttons send the same key
// events the keyboard listeners already handle. The stick fills the WASD
// set the walk and drive code already reads.

export const STICK_DEAD = 0.28;
// Past this much of the stick, the walk becomes the jog. A smaller push stays a walk.
export const STICK_JOG = 0.65;

const MOVE_CODES = ["KeyW", "KeyA", "KeyS", "KeyD"];

// Screen y grows downward, so a stick pushed up has a negative ny.
export function stickAxes(nx, ny, dead = STICK_DEAD) {
  return {
    KeyW: ny < -dead,
    KeyS: ny > dead,
    KeyA: nx < -dead,
    KeyD: nx > dead,
  };
}

// Screen y grows downward. World north is negative z, the same way KeyW moves.
// A short push walks. A full push jogs. The car still reads the WASD flags.
export function stickWish(nx, ny, dead = STICK_DEAD, jogAt = STICK_JOG) {
  const mag = Math.hypot(nx, ny);
  if (!(mag > dead)) return { x: 0, z: 0, gait: "idle", active: false };
  return {
    x: nx / mag,
    z: ny / mag,
    gait: mag >= jogAt ? "jog" : "walk",
    active: true,
  };
}

export function clampStick(dx, dy, radius) {
  const reach = Math.max(1, radius);
  const length = Math.hypot(dx, dy);
  if (length <= reach) {
    return { x: dx, y: dy, nx: dx / reach, ny: dy / reach };
  }
  const scale = reach / length;
  return { x: dx * scale, y: dy * scale, nx: dx / length, ny: dy / length };
}

// The desktop branch is the existing 16:9 letterbox. Touch fills the window
// and extends the ground frame on the long axis so the picture is not stretched.
export function displayFrame(viewW, viewH, coarse, groundW, groundH) {
  if (!coarse) {
    const unit = Math.min(viewW / 16, viewH / 9);
    const cssW = Math.max(1, Math.round(unit * 16));
    const cssH = Math.max(1, Math.round(cssW * 9 / 16));
    return { cssW, cssH, spanW: groundW, spanH: groundH };
  }
  const cssW = Math.max(1, Math.round(viewW));
  const cssH = Math.max(1, Math.round(viewH));
  const unit = Math.min(cssW / 16, cssH / 9);
  const fittedW = Math.max(1, unit * 16);
  const fittedH = Math.max(1, unit * 9);
  return {
    cssW,
    cssH,
    spanW: groundW * (cssW / fittedW),
    spanH: groundH * (cssH / fittedH),
  };
}

export function isTouchScreen() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
}

function press(code, key) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code, key, bubbles: true, cancelable: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { code, key, bubbles: true, cancelable: true }));
}

function keyButton(code, key, label, caption) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.code = code;
  button.dataset.key = key;
  button.setAttribute("aria-label", caption ? `${label} ${caption}` : label);
  const main = document.createElement("b");
  main.textContent = label;
  button.append(main);
  if (caption) {
    const sub = document.createElement("span");
    sub.textContent = caption;
    button.append(sub);
  }
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    press(code, key);
  });
  return button;
}

export function mountTouchUi(held, places = [], intent = null) {
  if (!isTouchScreen()) return;

  const root = document.createElement("div");
  root.id = "touch-ui";

  const stick = document.createElement("div");
  stick.id = "stick";
  stick.setAttribute("role", "application");
  stick.setAttribute("aria-label", "Move");
  const knob = document.createElement("div");
  knob.id = "stick-knob";
  stick.append(knob);

  const pad = document.createElement("div");
  pad.id = "touch-pad";

  const build = document.createElement("div");
  build.id = "touch-build";
  build.hidden = true;
  build.append(
    keyButton("KeyR", "r", "R", "Turn"),
    keyButton("KeyX", "x", "X", "Del"),
    keyButton("KeyF", "f", "F", "Flip"),
    keyButton("NumpadAdd", "+", "+", "Big"),
    keyButton("Digit0", "0", "0", "Small"),
    keyButton("KeyP", "p", "P", "Save"),
  );

  const placeRow = document.createElement("div");
  placeRow.id = "touch-places";
  places.forEach((place, index) => {
    const name = place?.name || String(index + 1);
    const button = keyButton(`Digit${index + 1}`, String(index + 1), String(index + 1), null);
    button.setAttribute("aria-label", `Place ${index + 1}, ${name}`);
    placeRow.append(button);
  });

  const actions = document.createElement("div");
  actions.id = "touch-actions";
  actions.append(
    keyButton("KeyE", "e", "E", "Car"),
    keyButton("KeyM", "m", "M", "Map"),
    keyButton("KeyB", "b", "B", "Build"),
  );

  pad.append(build, placeRow, actions);
  root.append(stick, pad);
  root.addEventListener("contextmenu", (event) => event.preventDefault());
  document.body.append(root);

  const fromStick = new Set();
  let active = null;

  function publish(nx, ny) {
    applyAxes(stickAxes(nx, ny));
    if (!intent) return;
    const wish = stickWish(nx, ny);
    intent.active = wish.active;
    intent.x = wish.x;
    intent.z = wish.z;
    intent.gait = wish.gait;
  }

  function applyAxes(axes) {
    for (const code of MOVE_CODES) {
      if (axes[code]) {
        fromStick.add(code);
        held.add(code);
      } else if (fromStick.delete(code)) {
        held.delete(code);
      }
    }
  }

  function center() {
    knob.style.transform = "translate(0px, 0px)";
    publish(0, 0);
  }

  function moveStick(event) {
    const rect = stick.getBoundingClientRect();
    const travel = Math.max(1, (rect.width - knob.offsetWidth) / 2 - 2);
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const next = clampStick(dx, dy, travel);
    knob.style.transform = `translate(${next.x}px, ${next.y}px)`;
    publish(next.nx, next.ny);
  }

  function endStick(event) {
    if (event.pointerId !== active) return;
    active = null;
    center();
  }

  stick.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    active = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    moveStick(event);
  });
  stick.addEventListener("pointermove", (event) => {
    if (event.pointerId !== active) return;
    moveStick(event);
  });
  stick.addEventListener("pointerup", endStick);
  stick.addEventListener("pointercancel", endStick);
  window.addEventListener("blur", () => {
    active = null;
    center();
  });

  function syncBuild() {
    const panel = document.getElementById("build-panel");
    const hide = !panel || panel.hidden;
    if (build.hidden === hide) return;
    build.hidden = hide;
  }

  const observer = new MutationObserver(syncBuild);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  syncBuild();
}
