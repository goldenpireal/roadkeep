/*
 * search.js — live suggestions under the search box.
 * Without JavaScript the box still works: pressing Search opens /roadmaps/?q=...
 */
(function () {
  "use strict";

  document.querySelectorAll("[data-search]").forEach(setup);

  function setup(form) {
    var input = form.querySelector('input[type="search"]');
    var list = form.querySelector(".suggest");
    var api = form.dataset.api;
    var contributeUrl = form.dataset.contribute;
    var timer = null, controller = null, active = -1;

    function options() { return Array.prototype.slice.call(list.querySelectorAll('li[role="option"]')); }
    function hide() { list.hidden = true; input.setAttribute("aria-expanded", "false"); active = -1; }
    function show() { list.hidden = false; input.setAttribute("aria-expanded", "true"); }
    function setActive(i) {
      options().forEach(function (li, k) { li.setAttribute("aria-selected", k === i ? "true" : "false"); });
      active = i;
    }

    function render(results, q) {
      list.replaceChildren();
      active = -1;
      if (!results.length) {
        var none = document.createElement("li");
        none.className = "suggest-empty";
        none.appendChild(document.createTextNode("No roadmap found for “" + q + "”. "));
        var link = document.createElement("a");
        link.href = contributeUrl;
        link.textContent = "Contribute one?";
        none.appendChild(link);
        list.appendChild(none);
        show();
        return;
      }
      results.forEach(function (r) {
        var li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", "false");
        var a = document.createElement("a");
        a.href = r.url;
        var strong = document.createElement("strong");
        strong.textContent = r.title;
        var small = document.createElement("small");
        small.textContent = r.snippet + "  ·  " + r.steps + " checkpoint" + (r.steps === 1 ? "" : "s");
        a.appendChild(strong);
        a.appendChild(small);
        li.appendChild(a);
        list.appendChild(li);
      });
      var all = document.createElement("li");
      all.className = "suggest-all";
      all.setAttribute("role", "option");
      all.setAttribute("aria-selected", "false");
      var allLink = document.createElement("a");
      allLink.href = form.getAttribute("action") + "?q=" + encodeURIComponent(q);
      allLink.textContent = "See all results";
      all.appendChild(allLink);
      list.appendChild(all);
      show();
    }

    function run() {
      var q = input.value.trim();
      if (q.length < 2) { hide(); return; }
      if (controller) controller.abort();
      controller = new AbortController();
      fetch(api + "?q=" + encodeURIComponent(q), { signal: controller.signal, headers: { Accept: "application/json" } })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (q === input.value.trim()) render(d.results, q); })
        .catch(function (err) { if (err.name !== "AbortError") hide(); });
    }

    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(run, 180); });

    input.addEventListener("keydown", function (e) {
      var opts = options();
      if (e.key === "ArrowDown" && opts.length) { e.preventDefault(); setActive((active + 1) % opts.length); }
      else if (e.key === "ArrowUp" && opts.length) { e.preventDefault(); setActive((active - 1 + opts.length) % opts.length); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); window.location.href = opts[active].querySelector("a").href; }
      else if (e.key === "Escape") { hide(); }
    });

    list.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep focus so the click lands
    document.addEventListener("click", function (e) { if (!form.contains(e.target)) hide(); });
  }
})();
