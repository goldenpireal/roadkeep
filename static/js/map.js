/*
 * map.js — the roadmap viewer.
 *
 * Works like a node-graph canvas (think the Fusion page in DaVinci Resolve):
 *   drag          move around
 *   scroll/pinch  zoom toward the cursor
 *   minimap       bird's-eye view; click or drag it to jump
 *   click a box   open its details on the right
 *
 * No libraries. Everything is built with the DOM API and textContent, so text that
 * contributors type can never turn into HTML.
 */
(function () {
  "use strict";

  var data = JSON.parse(document.getElementById("map-data").textContent);
  var L = RoadmapLayout.layout(data.checkpoints);

  var viewport = document.getElementById("viewport");
  var stage = document.getElementById("stage");
  var wires = document.getElementById("wires");
  var panel = document.getElementById("panel");
  var mini = document.getElementById("minimap");
  var SVG_NS = "http://www.w3.org/2000/svg";

  function make(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function svg(tag, attrs) {
    var el = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function kindLabel(kind) { return kind === "pdf" ? "PDF" : "Link"; }

  /* ---------- Build the boxes ---------------------------------------------- */

  var nodeEls = {};
  L.nodes.forEach(function (n) {
    var el;
    if (n.type === "gate" || n.type === "keep") {
      el = make("div", "node terminal", n.type === "gate" ? "The Gate" : "The Keep");
    } else if (n.type === "checkpoint") {
      el = make("button", "node checkpoint");
      el.type = "button";
      el.appendChild(make("span", "badge", String(n.number)));
      var text = make("span", "text");
      text.appendChild(make("span", "title", n.payload.title));
      if (n.payload.description) text.appendChild(make("span", "desc", n.payload.description));
      el.appendChild(text);
    } else {
      el = make("button", "node resource " + (n.payload.kind === "pdf" ? "pdf" : "link"));
      el.type = "button";
      el.appendChild(make("span", "tag", kindLabel(n.payload.kind)));
      el.appendChild(make("span", "title", n.payload.title));
      if (n.payload.description) el.appendChild(make("span", "desc", n.payload.description));
    }
    el.style.left = n.x + "px";
    el.style.top = n.y + "px";
    el.style.width = n.w + "px";
    el.style.height = n.h + "px";
    el.dataset.id = n.id;
    stage.appendChild(el);
    nodeEls[n.id] = el;
  });

  /* ---------- Draw the roads (curved wires between boxes) ------------------- */

  function wirePath(a, b) {
    var x1 = a.x + a.w, y1 = a.y + a.h / 2;
    var x2 = b.x, y2 = b.y + b.h / 2;
    var dx = (x2 - x1) * 0.5;
    return "M" + x1 + " " + y1 + " C" + (x1 + dx) + " " + y1 + ", " + (x2 - dx) + " " + y2 + ", " + x2 + " " + y2;
  }
  L.edges.forEach(function (pair) {
    var a = L.byId[pair[0]], b = L.byId[pair[1]];
    wires.appendChild(svg("path", { d: wirePath(a, b) }));
    wires.appendChild(svg("circle", { cx: a.x + a.w, cy: a.y + a.h / 2, r: 4 }));
    wires.appendChild(svg("circle", { cx: b.x, cy: b.y + b.h / 2, r: 4 }));
  });

  /* ---------- Camera: pan and zoom ------------------------------------------ */

  var MIN = 0.1, MAX = 2.2, PAD = 90;
  var s = 1, tx = 0, ty = 0; // scale, translate-x, translate-y

  function size() { return { w: viewport.clientWidth, h: viewport.clientHeight }; }

  function apply() {
    stage.style.transform = "translate(" + tx + "px, " + ty + "px) scale(" + s + ")";
    var g = 28 * s; // the dot grid moves and scales with the map
    viewport.style.backgroundSize = g + "px " + g + "px";
    viewport.style.backgroundPosition = tx + "px " + ty + "px";
    viewport.style.backgroundImage = g < 8 ? "none" : "";
    updateMini();
  }

  function zoomAt(px, py, factor) {
    var ns = clamp(s * factor, MIN, MAX);
    var k = ns / s;
    tx = px - (px - tx) * k;
    ty = py - (py - ty) * k;
    s = ns;
    apply();
  }
  function zoomCentre(factor) { var v = size(); zoomAt(v.w / 2, v.h / 2, factor); }

  function fitAll() {
    var v = size(), b = L.bounds;
    s = clamp(Math.min((v.w - 2 * PAD) / b.w, (v.h - 2 * PAD) / b.h), MIN, 1.2);
    tx = (v.w - b.w * s) / 2 - b.minX * s;
    ty = (v.h - b.h * s) / 2 - b.minY * s;
    apply();
  }
  function showStart() {
    var v = size();
    s = 0.85;
    tx = PAD - L.bounds.minX * s;
    ty = v.h / 2;
    apply();
  }
  function resetView() {
    var v = size(), b = L.bounds;
    var fit = Math.min((v.w - 2 * PAD) / b.w, (v.h - 2 * PAD) / b.h);
    if (fit >= 0.75) fitAll(); else showStart(); // long roadmaps open at the gate, readable
  }
  function centreOn(n) {
    var v = size();
    var usable = panel.hidden ? v.w : v.w - panel.offsetWidth;
    tx = usable / 2 - (n.x + n.w / 2) * s;
    ty = v.h / 2 - (n.y + n.h / 2) * s;
    apply();
  }

  var pointers = {};   // active pointers by id (for pinch)
  var pointerCount = 0;
  var moved = false, downX = 0, downY = 0, downNodeId = null, lastPinch = 0;

  function pinchInfo() {
    var ids = Object.keys(pointers);
    var a = pointers[ids[0]], b = pointers[ids[1]];
    var r = viewport.getBoundingClientRect();
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      cx: (a.x + b.x) / 2 - r.left,
      cy: (a.y + b.y) / 2 - r.top,
    };
  }

  viewport.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    pointerCount++;
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add("grabbing");
    if (pointerCount === 1) {
      moved = false;
      downX = e.clientX; downY = e.clientY;
      var nodeEl = e.target.closest(".node");
      downNodeId = nodeEl ? nodeEl.dataset.id : null;
    }
    if (pointerCount === 2) { lastPinch = pinchInfo().dist; moved = true; }
  });

  viewport.addEventListener("pointermove", function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    if (pointerCount === 1) {
      tx += e.clientX - p.x;
      ty += e.clientY - p.y;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) moved = true;
      p.x = e.clientX; p.y = e.clientY;
      apply();
    } else if (pointerCount === 2) {
      p.x = e.clientX; p.y = e.clientY;
      var info = pinchInfo();
      if (lastPinch > 0) zoomAt(info.cx, info.cy, info.dist / lastPinch);
      lastPinch = info.dist;
    }
  });

  function endPointer(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    pointerCount = Object.keys(pointers).length;
    if (pointerCount < 2) lastPinch = 0;
    if (pointerCount === 0) {
      viewport.classList.remove("grabbing");
      if (e.type === "pointerup" && !moved) {
        // A tap or click, not a drag: select the box under the pointer, or clear.
        var n = downNodeId ? L.byId[downNodeId] : null;
        if (n && (n.type === "checkpoint" || n.type === "resource")) select(n); else clearSelection();
      }
    }
  }
  viewport.addEventListener("pointerup", endPointer);
  viewport.addEventListener("pointercancel", endPointer);

  viewport.addEventListener("wheel", function (e) {
    e.preventDefault();
    var r = viewport.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  // A focused box must never scroll the clipped viewport itself; move the camera instead.
  viewport.addEventListener("scroll", function () { viewport.scrollLeft = 0; viewport.scrollTop = 0; });
  stage.addEventListener("focusin", function (e) {
    var el = e.target.closest(".node");
    if (!el) return;
    var n = L.byId[el.dataset.id], v = size();
    var left = n.x * s + tx, top = n.y * s + ty;
    if (left < 0 || top < 0 || left + n.w * s > v.w || top + n.h * s > v.h) centreOn(n);
  });

  /* ---------- Selecting a box and the details panel -------------------------- */

  var selectedId = null;

  function select(n) {
    if (selectedId) nodeEls[selectedId].classList.remove("selected");
    selectedId = n.id;
    nodeEls[n.id].classList.add("selected");
    renderPanel(n);
    panel.hidden = false;
  }
  function clearSelection() {
    if (selectedId) nodeEls[selectedId].classList.remove("selected");
    selectedId = null;
    panel.hidden = true;
    panel.replaceChildren();
  }

  function safeLink(href, kind) {
    if (!href) return null;
    try {
      var u = new URL(href, window.location.href);
      if (kind !== "pdf" && u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u;
    } catch (err) { return null; }
  }

  function renderPanel(n) {
    panel.replaceChildren();
    var close = make("button", "icon-btn close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close details");
    close.addEventListener("click", clearSelection);
    panel.appendChild(close);

    if (n.type === "checkpoint") {
      var cp = n.payload;
      panel.appendChild(make("p", "kind", "Checkpoint " + n.number));
      panel.appendChild(make("h2", null, cp.title));
      panel.appendChild(make("p", "body", cp.description || "No description for this checkpoint."));
      if (n.resourceIds.length) {
        panel.appendChild(make("p", "kind", n.resourceIds.length > 1
          ? n.resourceIds.length + " resources · the road forks here"
          : "1 resource"));
        var ul = make("ul");
        n.resourceIds.forEach(function (id) {
          var r = L.byId[id];
          var li = make("li");
          var b = make("button", null, "[" + kindLabel(r.payload.kind) + "] " + r.payload.title);
          b.type = "button";
          b.addEventListener("click", function () { select(r); centreOn(r); });
          li.appendChild(b);
          ul.appendChild(li);
        });
        panel.appendChild(ul);
      }
    } else {
      var res = n.payload;
      panel.appendChild(make("p", "kind", kindLabel(res.kind) + " · Checkpoint " + n.number));
      panel.appendChild(make("h2", null, res.title));
      var u = safeLink(res.href, res.kind);
      if (u && res.kind !== "pdf") panel.appendChild(make("p", "host", u.hostname));
      panel.appendChild(make("p", "body", res.description || "No description for this resource."));
      if (u) {
        var a = make("a", "btn", res.kind === "pdf" ? "Open PDF" : "Open link");
        a.href = u.href;
        a.target = "_blank";
        a.rel = "noopener noreferrer nofollow";
        panel.appendChild(a);
      }
    }
  }

  /* ---------- Minimap (bird's-eye view) -------------------------------------- */

  var b = L.bounds, MPAD = 60;
  mini.setAttribute("viewBox", (b.minX - MPAD) + " " + (b.minY - MPAD) + " " + (b.w + 2 * MPAD) + " " + (b.h + 2 * MPAD));
  mini.setAttribute("preserveAspectRatio", "xMidYMid meet");
  L.edges.forEach(function (pair) {
    var p = L.byId[pair[0]], q = L.byId[pair[1]];
    mini.appendChild(svg("line", {
      "class": "m-wire", x1: p.x + p.w, y1: p.y + p.h / 2, x2: q.x, y2: q.y + q.h / 2,
    }));
  });
  L.nodes.forEach(function (n) {
    mini.appendChild(svg("rect", {
      "class": n.type === "resource" ? "m-node" : "m-node m-cp",
      x: n.x, y: n.y, width: n.w, height: n.h,
    }));
  });
  var viewRect = svg("rect", { "class": "m-view" });
  mini.appendChild(viewRect);

  function updateMini() {
    var v = size();
    viewRect.setAttribute("x", -tx / s);
    viewRect.setAttribute("y", -ty / s);
    viewRect.setAttribute("width", v.w / s);
    viewRect.setAttribute("height", v.h / s);
  }
  function miniTo(e) {
    var pt = mini.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    var p = pt.matrixTransform(mini.getScreenCTM().inverse());
    var v = size();
    tx = v.w / 2 - p.x * s;
    ty = v.h / 2 - p.y * s;
    apply();
  }
  var miniDown = false;
  mini.addEventListener("pointerdown", function (e) { miniDown = true; mini.setPointerCapture(e.pointerId); miniTo(e); });
  mini.addEventListener("pointermove", function (e) { if (miniDown) miniTo(e); });
  mini.addEventListener("pointerup", function () { miniDown = false; });
  mini.addEventListener("pointercancel", function () { miniDown = false; });

  /* ---------- Buttons and keyboard ------------------------------------------- */

  document.getElementById("btn-in").addEventListener("click", function () { zoomCentre(1.25); });
  document.getElementById("btn-out").addEventListener("click", function () { zoomCentre(1 / 1.25); });
  document.getElementById("btn-fit").addEventListener("click", fitAll);
  document.getElementById("btn-start").addEventListener("click", showStart);

  // Pressing Enter or Space on a focused box fires a click with detail 0.
  stage.addEventListener("click", function (e) {
    if (e.detail !== 0) return;
    var el = e.target.closest(".node");
    if (el) { var n = L.byId[el.dataset.id]; if (n.type === "checkpoint" || n.type === "resource") select(n); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var step = 80;
    switch (e.key) {
      case "ArrowLeft": tx += step; break;
      case "ArrowRight": tx -= step; break;
      case "ArrowUp": ty += step; break;
      case "ArrowDown": ty -= step; break;
      case "+": case "=": zoomCentre(1.25); e.preventDefault(); return;
      case "-": case "_": zoomCentre(1 / 1.25); e.preventDefault(); return;
      case "0": fitAll(); e.preventDefault(); return;
      case "Escape": clearSelection(); return;
      default: return;
    }
    e.preventDefault();
    apply();
  });

  window.addEventListener("resize", apply);
  resetView();
})();
