(function () {
  var filters = document.querySelector(".filters");
  if (!filters) return;

  var cards = Array.prototype.slice.call(document.querySelectorAll(".card"));
  var buttons = Array.prototype.slice.call(filters.querySelectorAll("button[data-filter]"));
  var statusText = filters.querySelector(".filter-status-text");
  var clearButton = filters.querySelector(".filter-clear");

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

  function render() {
    var shown = 0;
    cards.forEach(function (card) {
      var match =
        (!state.category || card.dataset.category === state.category) &&
        (!state.tag || card.dataset.tags.split(" ").indexOf(state.tag) !== -1);
      card.hidden = !match;
      if (match) shown++;
    });

    buttons.forEach(function (b) {
      b.setAttribute("aria-pressed", String(state[b.dataset.filter] === b.dataset.value));
    });

    var filtered = Boolean(state.category || state.tag);
    clearButton.hidden = !filtered;
    statusText.textContent = !filtered
      ? ""
      : shown === 0
        ? "No posts match these filters."
        : "Showing " + shown + " of " + cards.length + " posts";
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

  clearButton.addEventListener("click", function () {
    state.category = "";
    update("tag", "");
  });

  filters.hidden = false;
  render();
})();
