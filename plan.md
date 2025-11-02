# 🗺️ Plan: Mimic Google Maps’ Smooth Double-Tap-and-Drag Zoom (React-Leaflet)

## 🎯 Goal

Recreate Google Maps–style smooth zooming when the user double-taps and drags up/down, without jerky tile reloads.

---

## 🧩 Phase 1 – Prepare the Map

1. Disable default double-click zoom and allow fractional zooms:
   `<MapContainer doubleClickZoom={false} zoomSnap={0.1} zoomDelta={0.1} ...>`

2. Keep references:
   `const mapRef = useRef<L.Map | null>(null);`
   `const containerRef = useRef<HTMLDivElement | null>(null);`

---

## 🧠 Phase 2 – Detect Gesture

Detect a “double-tap and hold” gesture manually.

```
let lastTap = 0;
let isDraggingZoom = false;
let startY = 0;

function onPointerDown(e: PointerEvent) {
  const now = Date.now();
  if (now - lastTap < 300) {
    isDraggingZoom = true;
    startY = e.clientY;
    e.preventDefault();
  }
  lastTap = now;
}

function onPointerMove(e: PointerEvent) {
  if (!isDraggingZoom) return;
  const deltaY = e.clientY - startY;
  handleZoomDrag(deltaY);
}

function onPointerUp() {
  if (isDraggingZoom) finishZoom();
  isDraggingZoom = false;
}
```

Attach these listeners to the map container (`containerRef.current`) inside a `useEffect`.

---

## 🪄 Phase 3 – Apply Smooth Visual Zoom (CSS Transform)

Use CSS transforms to scale the map smoothly.

```
let scale = 1;

function handleZoomDrag(deltaY: number) {
  scale = 1 - deltaY / 400;
  const el = containerRef.current;
  if (!el) return;
  el.style.transition = 'none';
  el.style.transformOrigin = 'center center';
  el.style.transform = `scale(${scale})`;
}
```

---

## 🎚️ Phase 4 – Commit Final Zoom

```
function finishZoom() {
  const el = containerRef.current;
  const map = mapRef.current;
  if (!el || !map) return;

  el.style.transition = 'transform 0.3s ease';
  el.style.transform = '';

  const targetZoom = map.getZoom() + Math.log2(scale);
  map.setZoom(targetZoom, { animate: true });
}
```

---

## 🧪 Phase 5 – Polish & Tune

| Feature       | Description                                                           |
| ------------- | --------------------------------------------------------------------- |
| Debounce      | Ignore tiny vertical movements (`if (Math.abs(deltaY) < 5) return;`). |
| Clamp zoom    | `Math.max(minZoom, Math.min(maxZoom, targetZoom))`.                   |
| Cursor hint   | Change cursor to indicate zoom mode.                                  |
| Haptics       | Vibrate lightly on zoom commit (mobile).                              |
| Smooth return | Short easing transition when releasing finger.                        |

---

## 🧰 Phase 6 – Integration Checklist

* Add `mapRef` and `containerRef` to `MapView.tsx`.
* Disable default double-click zoom.
* Add pointer listeners in `useEffect`:

```
useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
  };
}, []);
```

* Implement `handleZoomDrag` and `finishZoom`.
* Test on touch and mouse.
* Adjust drag sensitivity and easing.

---

## ✅ Expected Result

• Double-tap, hold, and drag → smooth zoom in/out.
• Map scales smoothly with finger movement.
• Release applies final zoom seamlessly.
• No tile flicker or snapping between zoom levels.

*(End of plan)*

---

Copy **everything above**, save it as `plan.md`, and you’ll have a single, continuous file.
