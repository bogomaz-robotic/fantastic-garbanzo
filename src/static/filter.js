(function () {
  var filters = document.querySelector(".filters");
  if (!filters) return;

  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  var buttons = Array.prototype.slice.call(filters.querySelectorAll("button[data-filter]"));
  var statusText = filters.querySelector(".filter-status-text");
  var clearButton = filters.querySelector(".filter-clear:not(.filter-restore)");
  var restoreButton = filters.querySelector(".filter-restore");

  var tray = filters.querySelector(".card-tray");
  var ids = cards.map(function (card) { return card.dataset.id; });

  // A per-browser list of post ids, persisted in localStorage.
  function storedList(key) {
    var items = [];
    try {
      items = JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {}
    items = ids.filter(function (id) { return items.indexOf(id) !== -1; });
    return {
      items: items,
      has: function (card) { return items.indexOf(card.dataset.id) !== -1; },
      add: function (card) { if (!this.has(card)) items.push(card.dataset.id); this.save(); },
      remove: function (card) { items.splice(items.indexOf(card.dataset.id), 1); this.save(); },
      clear: function () { items.length = 0; this.save(); },
      save: function () {
        try {
          if (items.length) localStorage.setItem(key, JSON.stringify(items));
          else localStorage.removeItem(key);
        } catch (e) {}
      }
    };
  }

  var closed = storedList("closedPosts");
  var minimized = storedList("minimizedPosts");

  function knownValue(key, value) {
    return buttons.some(function (b) {
      return b.dataset.filter === key && b.dataset.value === value;
    }) ? value : "";
  }

  var params = new URLSearchParams(location.search);
  var state = {
    category: knownValue("category", params.get("category") || ""),
    tag: knownValue("tag", params.get("tag") || "")
  };

  function plural(n) {
    return n + (n === 1 ? " post" : " posts");
  }

  function renderTray() {
    tray.innerHTML = "";
    cards.forEach(function (card) {
      if (!minimized.has(card)) return;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "tray-item";
      button.dataset.id = card.dataset.id;
      button.textContent = card.querySelector(".card-title").textContent;
      button.title = "Restore “" + button.textContent + "”";
      tray.appendChild(button);
    });
    tray.hidden = minimized.items.length === 0;
  }

  function render() {
    var shown = 0;
    cards.forEach(function (card) {
      var match =
        (!state.category || card.dataset.category === state.category) &&
        (!state.tag || card.dataset.tags.split(" ").indexOf(state.tag) !== -1);
      if (closed.has(card) || minimized.has(card)) match = false;
      card.hidden = !match;
      if (match) shown++;
    });

    buttons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(state[b.dataset.filter] === b.dataset.value));
    });

    var filtered = Boolean(state.category || state.tag);
    clearButton.hidden = !filtered;
    restoreButton.hidden = closed.items.length === 0;
    renderTray();

    var parts = [];
    if (filtered) {
      parts.push(shown === 0 ? "No posts match these filters." : "Showing " + shown + " of " + cards.length + " posts");
    }
    if (closed.items.length) parts.push(plural(closed.items.length) + " closed");
    if (minimized.items.length) parts.push(plural(minimized.items.length) + " minimized");
    statusText.textContent = parts.join(" · ");
  }

  function update(key, value) {
    if (key === "tag" && state.tag === value) value = "";
    state[key] = value;

    var query = new URLSearchParams();
    if (state.category) query.set("category", state.category);
    if (state.tag) query.set("tag", state.tag);
    var search = query.toString();
    history.replaceState(null, "", search ? "?" + search : location.pathname);
    render();
  }

  document.addEventListener("click", function (event) {
    var target = event.target.closest("[data-filter]");
    if (!target || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    update(target.dataset.filter, target.dataset.value);
    if (target.classList.contains("card-tag")) filters.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Keep keyboard focus nearby after a card leaves the grid:
  // the next visible card, else the previous one, else the fallback.
  function focusNear(index, fallback) {
    var next = cards.slice(index + 1).concat(cards.slice(0, index).reverse()).filter(function (c) {
      return !c.hidden;
    })[0];
    (next ? next.querySelector(".card-close") : fallback).focus();
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".card-close, .card-minimize");
    if (!button) return;
    var card = button.closest(".card");
    var closing = button.classList.contains("card-close");
    (closing ? closed : minimized).add(card);
    render();
    focusNear(cards.indexOf(card), closing ? restoreButton : tray.lastChild);
  });

  tray.addEventListener("click", function (event) {
    var button = event.target.closest(".tray-item");
    if (!button) return;
    var card = cards[ids.indexOf(button.dataset.id)];
    minimized.remove(card);
    render();
    if (!card.hidden) card.querySelector(".card-minimize").focus();
  });

  restoreButton.addEventListener("click", function () {
    closed.clear();
    render();
  });

  clearButton.addEventListener("click", function () {
    state.category = "";
    update("tag", "");
  });

  filters.hidden = false;
  render();
})();
