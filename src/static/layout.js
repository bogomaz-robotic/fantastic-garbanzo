(function () {
  var root = document.documentElement;
  var buttons = Array.prototype.slice.call(document.querySelectorAll(".width-toggle, .width-toggle-alt"));
  if (!buttons.length) return;

  function sync() {
    var wide = root.classList.contains("wide");
    var label = wide ? "Narrow width" : "Full width";
    buttons.forEach(function (button) {
      button.setAttribute("aria-pressed", String(wide));
      button.setAttribute("aria-label", label);
      button.title = label;
    });
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      var wide = root.classList.toggle("wide");
      try {
        localStorage.setItem("layout", wide ? "wide" : "narrow");
      } catch (e) {}
      sync();
    });
    button.hidden = false;
  });

  sync();
})();
