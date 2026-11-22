/*
 * contribute.js — the form where the community adds a roadmap.
 *
 * The page has a list of checkpoints; each checkpoint has a list of resources.
 * Field names are assigned just before sending, in on-screen order, e.g.
 *     cp-0-title      cp-0-r-0-kind      cp-0-r-0-url      cp-0-r-1-pdf
 * The server (roadmaps/services/submissions.py) reads exactly those names and answers
 * with JSON: either {ok: true, redirect} or {ok: false, errors: {fieldName: message}}.
 */
(function () {
  "use strict";

  var form = document.getElementById("contribute-form");
  if (!form) return;

  var root = document.getElementById("checkpoints");
  var tplCp = document.getElementById("tpl-checkpoint");
  var tplRes = document.getElementById("tpl-resource");
  var formError = document.getElementById("form-error");
  var submitBtn = document.getElementById("submit-btn");
  var status = document.getElementById("submit-status");

  var MAX_CP = parseInt(form.dataset.maxCheckpoints, 10);
  var MAX_RES = parseInt(form.dataset.maxResources, 10);
  var MAX_PDFS = parseInt(form.dataset.maxPdfs, 10);
  var MAX_PDF_BYTES = 10 * 1024 * 1024;

  function clone(tpl) { return document.importNode(tpl.content, true).firstElementChild; }
  function checkpoints() { return Array.prototype.slice.call(root.querySelectorAll("[data-cp]")); }
  function resourcesOf(cp) { return Array.prototype.slice.call(cp.querySelectorAll("[data-res]")); }

  /* ---------- Adding and removing -------------------------------------------- */

  function addCheckpoint() {
    if (checkpoints().length >= MAX_CP) { showFormError("A roadmap can have at most " + MAX_CP + " checkpoints."); return; }
    var cp = clone(tplCp);
    root.appendChild(cp);
    addResource(cp);
    refresh();
    return cp;
  }

  function addResource(cp) {
    if (resourcesOf(cp).length >= MAX_RES) { showFormError("At most " + MAX_RES + " resources per checkpoint."); return; }
    var res = clone(tplRes);
    cp.querySelector("[data-resources]").appendChild(res);
    setKind(res);
    refresh();
  }

  // Show the link box or the file box depending on the Link/PDF choice.
  function setKind(res) {
    var kind = res.querySelector('[data-r-field="kind"]').value;
    var url = res.querySelector('[data-r-field="url"]');
    var pdf = res.querySelector('[data-r-field="pdf"]');
    url.hidden = kind !== "url"; url.disabled = kind !== "url";
    pdf.hidden = kind !== "pdf"; pdf.disabled = kind !== "pdf"; // disabled inputs are not sent
  }

  // Numbers, branch hints and arrow buttons.
  function refresh() {
    var cps = checkpoints();
    cps.forEach(function (cp, i) {
      cp.querySelector("[data-badge]").textContent = String(i + 1);
      var n = resourcesOf(cp).length;
      cp.querySelector("[data-fork]").textContent = n === 1
        ? "One resource: a single straight path."
        : n + " resources: the road forks into " + n + " branches and rejoins at the next checkpoint.";
      cp.querySelector('[data-act="up"]').disabled = i === 0;
      cp.querySelector('[data-act="down"]').disabled = i === cps.length - 1;
      cp.querySelector('[data-act="remove-cp"]').hidden = cps.length === 1;
      resourcesOf(cp).forEach(function (res) {
        res.querySelector('[data-act="remove-res"]').hidden = n === 1;
      });
    });
  }

  root.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) return;
    var cp = btn.closest("[data-cp]");
    var act = btn.dataset.act;
    clearFormError();
    if (act === "add-resource") addResource(cp);
    else if (act === "remove-res") { btn.closest("[data-res]").remove(); refresh(); }
    else if (act === "remove-cp") { cp.remove(); refresh(); }
    else if (act === "up" && cp.previousElementSibling) { root.insertBefore(cp, cp.previousElementSibling); refresh(); }
    else if (act === "down" && cp.nextElementSibling) { root.insertBefore(cp.nextElementSibling, cp); refresh(); }
  });

  root.addEventListener("change", function (e) {
    if (e.target.matches('[data-r-field="kind"]')) setKind(e.target.closest("[data-res]"));
  });

  document.getElementById("add-checkpoint").addEventListener("click", function () {
    clearFormError();
    var cp = addCheckpoint();
    if (cp) cp.querySelector('[data-cp-field="title"]').focus();
  });

  /* ---------- Sending --------------------------------------------------------- */

  function renumber() {
    checkpoints().forEach(function (cp, i) {
      cp.querySelectorAll("[data-cp-field]").forEach(function (el) { el.name = "cp-" + i + "-" + el.dataset.cpField; });
      resourcesOf(cp).forEach(function (res, j) {
        res.querySelectorAll("[data-r-field]").forEach(function (el) {
          el.name = "cp-" + i + "-r-" + j + "-" + el.dataset.rField;
        });
      });
    });
  }

  function clearFormError() { formError.hidden = true; formError.textContent = ""; }
  function showFormError(msg) { formError.textContent = msg; formError.hidden = false; formError.scrollIntoView({ block: "center" }); }

  function clearErrors() {
    clearFormError();
    form.querySelectorAll(".has-error").forEach(function (el) { el.classList.remove("has-error"); });
    form.querySelectorAll(".error-msg").forEach(function (el) { el.remove(); });
  }

  function showErrors(errors) {
    var first = null;
    Object.keys(errors).forEach(function (key) {
      if (key === "__all__") { showFormError(errors[key]); return; }
      var target = form.querySelector('[name="' + CSS.escape(key) + '"]');
      var msg = document.createElement("p");
      msg.className = "error-msg";
      msg.textContent = errors[key];
      if (target) {
        target.classList.add("has-error");
        target.insertAdjacentElement("afterend", msg);
        if (!first) first = target;
      } else {
        // A checkpoint-level message such as "needs at least one resource": key is "cp-<n>".
        var m = /^cp-(\d+)$/.exec(key);
        var card = m ? checkpoints()[parseInt(m[1], 10)] : null;
        if (card) { card.insertBefore(msg, card.firstChild); if (!first) first = card; }
      }
    });
    if (first) first.scrollIntoView({ block: "center" });
  }

  function checkPdfSizes() {
    var pdfs = form.querySelectorAll('input[type="file"]:not(:disabled)');
    var count = 0, problems = {};
    pdfs.forEach(function (input) {
      if (input.files.length) {
        count++;
        if (input.files[0].size > MAX_PDF_BYTES) problems[input.name] = "PDF files must be 10 MB or smaller.";
      }
    });
    if (count > MAX_PDFS) problems.__all__ = "At most " + MAX_PDFS + " PDFs per roadmap.";
    return problems;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();
    renumber();

    var early = checkPdfSizes();
    if (Object.keys(early).length) { showErrors(early); return; }

    submitBtn.disabled = true;
    status.textContent = "Sending…";

    fetch(window.location.href, {
      method: "POST",
      body: new FormData(form), // includes the CSRF token and any chosen PDFs
      credentials: "same-origin",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
      .then(function (r) { return r.json().then(function (body) { return { status: r.status, body: body }; }); })
      .then(function (res) {
        if (res.body.ok) { window.location.href = res.body.redirect; return; }
        showErrors(res.body.errors || { __all__: "Something went wrong. Please try again." });
        submitBtn.disabled = false;
        status.textContent = "";
      })
      .catch(function () {
        showFormError("Could not reach the server. Check your connection and try again.");
        submitBtn.disabled = false;
        status.textContent = "";
      });
  });

  addCheckpoint();
})();
