// Click a diagram or image in a post to open it in a zoomable, draggable viewer.
(function () {
  var content = document.querySelector(".post-content");
  if (!content || !window.PointerEvent) return;

  var SELECTOR = "figure.diagram svg, .post-hero svg, pre.mermaid svg, .post-content img, .nb-image";
  var MIN = 0.1;
  var MAX = 12;

  var overlay, stage, canvas, zoomLabel, opener;
  var scale = 1;
  var x = 0;
  var y = 0;
  var baseWidth = 0;
  var baseHeight = 0;
  var pointers = {};
  var raster = false;
  var pinchStart = null;

  function markZoomable() {
    var targets = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < targets.length; i++) {
      var node = targets[i];
      if (node.closest("a")) continue;
      node.classList.add("zoomable");
      if (!node.getAttribute("tabindex")) {
        node.setAttribute("tabindex", "0");
        node.setAttribute("role", "button");
        node.setAttribute("aria-label", "Open in viewer");
      }
    }
  }

  function build() {
    overlay = document.createElement("div");
    overlay.className = "zoom-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Image viewer");
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="zoom-window">' +
        '<div class="titlebar">' +
          '<span class="titlebar-text" aria-hidden="true">Viewer</span>' +
          '<span class="titlebar-buttons">' +
            '<button type="button" data-zoom="out" aria-label="Zoom out" title="Zoom out"></button>' +
            '<button type="button" data-zoom="in" aria-label="Zoom in" title="Zoom in"></button>' +
            '<button type="button" data-zoom="close" aria-label="Close viewer" title="Close"></button>' +
          "</span>" +
        "</div>" +
        '<div class="zoom-stage"><div class="zoom-canvas"></div></div>' +
        '<div class="zoom-bar">' +
          '<button type="button" class="chip" data-zoom="fit">Fit</button>' +
          '<button type="button" class="chip" data-zoom="reset">100%</button>' +
          '<span class="zoom-level" aria-live="polite"></span>' +
          '<span class="zoom-hint">Drag to pan · scroll to zoom · Esc to close</span>' +
        "</div>" +
      "</div>";
    document.body.appendChild(overlay);

    stage = overlay.querySelector(".zoom-stage");
    canvas = overlay.querySelector(".zoom-canvas");
    zoomLabel = overlay.querySelector(".zoom-level");

    overlay.addEventListener("click", function (event) {
      var button = event.target.closest("[data-zoom]");
      if (button) {
        var action = button.dataset.zoom;
        if (action === "close") close();
        else if (action === "fit") fit();
        else if (action === "reset") setScale(1, null);
        else zoomBy(action === "in" ? 1.3 : 1 / 1.3, null);
        return;
      }
      if (event.target === overlay) close();
    });

    stage.addEventListener("wheel", function (event) {
      event.preventDefault();
      zoomBy(Math.pow(0.999, event.deltaY), { x: event.clientX, y: event.clientY });
    }, { passive: false });

    stage.addEventListener("dblclick", function (event) {
      zoomBy(1.8, { x: event.clientX, y: event.clientY });
    });

    stage.addEventListener("pointerdown", function (event) {
      stage.setPointerCapture(event.pointerId);
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      stage.classList.add("dragging");
    });

    stage.addEventListener("pointermove", function (event) {
      var previous = pointers[event.pointerId];
      if (!previous) return;
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };

      var ids = Object.keys(pointers);
      if (ids.length >= 2) {
        pinch(ids);
        return;
      }
      x += event.clientX - previous.x;
      y += event.clientY - previous.y;
      apply();
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach(function (type) {
      stage.addEventListener(type, function (event) {
        delete pointers[event.pointerId];
        if (!Object.keys(pointers).length) {
          pinchStart = null;
          stage.classList.remove("dragging");
        }
      });
    });
  }

  function pinch(ids) {
    var a = pointers[ids[0]];
    var b = pointers[ids[1]];
    var distance = Math.hypot(a.x - b.x, a.y - b.y);
    var center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pinchStart) setScale(scale * (distance / pinchStart), center);
    pinchStart = distance;
  }

  function apply() {
    canvas.style.transform = "translate(" + x + "px, " + y + "px) scale(" + scale + ")";
    zoomLabel.textContent = Math.round(scale * 100) + "%";
  }

  // Zoom around a screen point (the cursor, a pinch centre, or the stage centre).
  function setScale(next, origin) {
    next = Math.min(MAX, Math.max(MIN, next));
    var box = stage.getBoundingClientRect();
    var point = origin || { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    var ratio = next / scale;
    x = point.x - box.left - ratio * (point.x - box.left - x);
    y = point.y - box.top - ratio * (point.y - box.top - y);
    scale = next;
    apply();
  }

  function zoomBy(factor, origin) {
    setScale(scale * factor, origin);
  }

  function fit() {
    var box = stage.getBoundingClientRect();
    var next = Math.min((box.width - 32) / baseWidth, (box.height - 32) / baseHeight);
    // SVG scales up cleanly; photos would only get blurry above their own size.
    if (raster) next = Math.min(next, 1);
    scale = Math.min(MAX, Math.max(MIN, next));
    x = (box.width - baseWidth * scale) / 2;
    y = (box.height - baseHeight * scale) / 2;
    apply();
  }

  function open(source) {
    if (!overlay) build();
    opener = source;

    var box = source.getBoundingClientRect();
    baseWidth = box.width || source.naturalWidth || 600;
    baseHeight = box.height || source.naturalHeight || 400;

    raster = source.tagName === "IMG";
    var clone = source.cloneNode(true);
    clone.removeAttribute("tabindex");
    clone.removeAttribute("role");
    clone.removeAttribute("aria-label");
    clone.classList.remove("zoomable");
    clone.style.width = baseWidth + "px";
    clone.style.height = baseHeight + "px";
    clone.style.maxWidth = "none";
    clone.style.display = "block";

    canvas.innerHTML = "";
    canvas.style.width = baseWidth + "px";
    canvas.style.height = baseHeight + "px";
    canvas.appendChild(clone);

    overlay.hidden = false;
    document.body.classList.add("zoom-open");
    fit();
    overlay.querySelector('[data-zoom="close"]').focus();
  }

  function close() {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    canvas.innerHTML = "";
    document.body.classList.remove("zoom-open");
    if (opener) opener.focus();
  }

  document.addEventListener("click", function (event) {
    var target = event.target.closest(SELECTOR);
    if (!target || target.closest("a") || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    open(target);
  });

  document.addEventListener("keydown", function (event) {
    if (overlay && !overlay.hidden) {
      if (event.key === "Escape") close();
      else if (event.key === "+" || event.key === "=") zoomBy(1.3, null);
      else if (event.key === "-") zoomBy(1 / 1.3, null);
      else if (event.key === "0") setScale(1, null);
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && event.target.matches &&
        event.target.matches(SELECTOR) && !event.target.closest("a")) {
      event.preventDefault();
      open(event.target);
    }
  });

  // Mermaid renders asynchronously, and re-renders when the theme changes,
  // so re-mark its diagrams whenever they may have been replaced.
  markZoomable();
  window.addEventListener("load", markZoomable);
  document.addEventListener("themechange", function () {
    setTimeout(markZoomable, 300);
  });
})();
