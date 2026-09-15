(function () {
  var root = document.documentElement;
  var button = document.querySelector(".theme-toggle");
  if (!button) return;
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function current() {
    return root.getAttribute("data-theme") || (media.matches ? "dark" : "light");
  }

  function sync() {
    var theme = current();
    var label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    button.setAttribute("data-current", theme);
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  function notify() {
    sync();
    var event = document.createEvent("Event");
    event.initEvent("themechange", false, false);
    document.dispatchEvent(event);
  }

  button.addEventListener("click", function () {
    var next = current() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
    notify();
  });

  var onSystemChange = function () {
    if (!root.getAttribute("data-theme")) notify();
  };
  if (media.addEventListener) media.addEventListener("change", onSystemChange);
  else if (media.addListener) media.addListener(onSystemChange);

  sync();
  button.hidden = false;
})();
