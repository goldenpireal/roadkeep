/*
 * music.js — quiet background music with an on/off toggle.
 *
 * Browsers block sound until the visitor interacts with the page, so music is OFF by
 * default. Once someone turns it on, the choice (and the place in the track) is
 * remembered, so it carries on from where it was when they open another page.
 */
(function () {
  "use strict";

  var button = document.getElementById("music-toggle");
  var dataEl = document.getElementById("music-data");
  if (!button || !dataEl) return;

  var tracks = JSON.parse(dataEl.textContent);
  if (!tracks.length) return;

  var KEY = "roadkeep.music";
  var VOLUME = 0.22; // subtle on purpose
  var audio = new Audio();
  audio.preload = "none";
  audio.volume = VOLUME;

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(patch) {
    try {
      var s = load();
      for (var k in patch) s[k] = patch[k];
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) { /* private mode: just don't remember */ }
  }

  var saved = load();
  var index = typeof saved.index === "number" && saved.index < tracks.length ? saved.index : 0;
  var resumeAt = typeof saved.time === "number" ? saved.time : 0;
  var on = false;

  function paint() {
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.querySelector(".music-label").textContent = on ? "Music on" : "Music off";
    button.title = on ? "Turn background music off" : "Turn background music on";
  }

  function start() {
    if (!audio.src) {
      audio.src = tracks[index].src;
      if (resumeAt > 0) {
        audio.addEventListener("loadedmetadata", function () {
          if (resumeAt < audio.duration) audio.currentTime = resumeAt;
          resumeAt = 0;
        }, { once: true });
      }
    }
    return audio.play();
  }

  function waitForGesture() {
    // The browser refused to start sound by itself; try again on the first click or key press.
    function retry() {
      document.removeEventListener("pointerdown", retry);
      document.removeEventListener("keydown", retry);
      if (on) start().catch(function () {});
    }
    document.addEventListener("pointerdown", retry);
    document.addEventListener("keydown", retry);
  }

  function setOn(value) {
    on = value;
    save({ on: on });
    paint();
    if (on) start().catch(waitForGesture); else audio.pause();
  }

  audio.addEventListener("ended", function () {
    index = (index + 1) % tracks.length;
    audio.src = tracks[index].src;
    save({ index: index, time: 0 });
    if (on) audio.play().catch(function () {});
  });

  audio.addEventListener("error", function () {
    // A missing or broken file: move on, but stop if every track is failing.
    if (tracks.length < 2) { on = false; paint(); return; }
    index = (index + 1) % tracks.length;
    audio.src = tracks[index].src;
    if (on) audio.play().catch(function () {});
  });

  var lastSave = 0;
  audio.addEventListener("timeupdate", function () {
    var now = Date.now();
    if (now - lastSave > 2000) { lastSave = now; save({ index: index, time: audio.currentTime }); }
  });
  window.addEventListener("pagehide", function () { if (audio.src) save({ index: index, time: audio.currentTime }); });

  button.addEventListener("click", function () { setOn(!on); });

  paint();
  if (saved.on) setOn(true);
})();
