(function () {
  var root = document.documentElement;
  var button = document.querySelector(".width-toggle");
  if (!button) return;

  function sync() {
    var wide = root.classList.contains("wide");
    var label = wide ? "Narrow width" : "Full width";
    button.setAttribute("aria-pressed", String(wide));
    button.setAttribute("aria-label", label);
    button.title = label;
  }

  button.addEventListener("click", function () {
    var wide = root.classList.toggle("wide");
    try {
      localStorage.setItem("layout", wide ? "wide" : "narrow");
    } catch (e) {}
    sync();
  });

  sync();
  button.hidden = false;
})();
