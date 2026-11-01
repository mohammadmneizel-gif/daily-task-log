(function () {
  "use strict";

  /* ---------- iOS keyboard-safe viewport height ---------- */
  function setAppHeight() {
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-height", vh + "px");
  }
  setAppHeight();
  window.addEventListener("resize", setAppHeight);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", setAppHeight);
  }

  /* ---------- decorative scene (non-interactive, best-effort) ---------- */
  function spawn(container, className, count, build) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var el = document.createElement("div");
      el.className = className;
      build(el, i);
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reducedMotion) {
    var stars = document.getElementById("stars");
    if (stars) {
      spawn(stars, "star", 50, function (el) {
        el.style.left = Math.random() * 100 + "%";
        el.style.top = Math.random() * 100 + "%";
        el.style.animationDuration = 2 + Math.random() * 4 + "s";
        el.style.animationDelay = Math.random() * 4 + "s";
      });
    }
    var rainfield = document.getElementById("rainfield");
    if (rainfield) {
      spawn(rainfield, "streak", 18, function (el) {
        el.style.left = Math.random() * 100 + "%";
        el.style.animationDuration = 1.1 + Math.random() * 1.3 + "s";
        el.style.animationDelay = Math.random() * 3 + "s";
        el.style.opacity = 0.12 + Math.random() * 0.22;
      });
    }
    var glassdrops = document.getElementById("glassdrops");
    if (glassdrops) {
      spawn(glassdrops, "drop", 8, function (el) {
        el.style.left = Math.random() * 100 + "%";
        el.style.animationDuration = 5 + Math.random() * 6 + "s";
        el.style.animationDelay = Math.random() * 6 + "s";
      });
    }
  }

  /* ---------- header date ---------- */
  var today = new Date();
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var displaySub = document.getElementById("sub");
  if (displaySub) {
    var dd = today.getDate();
    var mm = today.getMonth() + 1;
    var yyyy = today.getFullYear();
    displaySub.textContent = WEEKDAYS[today.getDay()] + " · " + dd + "/" + mm + "/" + yyyy;
  }
  // ISO date sent to the backend. The exact "Day/Date" text format used inside the sheet
  // (e.g. "Thursday     1/10") is produced server-side by Apps Script, not duplicated here,
  // so the formatting rule lives in exactly one place.
  var isoDate = today.getFullYear() + "-" +
    String(today.getMonth() + 1).padStart(2, "0") + "-" +
    String(today.getDate()).padStart(2, "0");

  var metaEl = document.getElementById("meta");
  if (metaEl && window.CONFIG) {
    metaEl.innerHTML =
      "<span>" + window.CONFIG.DEPARTMENT + "</span><span>Mgr. " + window.CONFIG.MANAGER + "</span>";
  }

  /* ---------- dynamic task cards ---------- */
  var taskList = document.getElementById("taskList");
  var addBtn = document.getElementById("addBtn");
  var cardCount = 0;

  function renumber() {
    var cards = taskList.querySelectorAll(".card");
    cards.forEach(function (card, idx) {
      card.querySelector(".task-num").textContent = "Task " + String(idx + 1).padStart(2, "0");
    });
  }

  function makeCard() {
    cardCount++;
    var card = document.createElement("div");
    card.className = "card";
    card.innerHTML =
      '<div class="card-head">' +
        '<span class="task-num">Task ' + String(cardCount).padStart(2, "0") + '</span>' +
        '<button type="button" class="remove-btn">Remove</button>' +
      '</div>' +
      '<label>Main Task</label>' +
      '<input type="text" class="f-main" placeholder="e.g. تطوير مشروع الـ Timeline" dir="auto">' +
      '<div class="err">Main task is required</div>' +
      '<label>Description</label>' +
      '<textarea class="f-desc" placeholder="What did you actually do..." dir="auto"></textarea>' +
      '<div class="row2">' +
        '<div><label>Duration (HH:MM)</label><input type="text" class="f-dur" placeholder="04:00" inputmode="numeric"></div>' +
        '<div><label>Links</label><input type="url" class="f-links" placeholder="optional"></div>' +
      '</div>' +
      '<label>Status</label>' +
      '<div class="status-pills" role="group" aria-label="Status">' +
        '<button type="button" class="pill f-status" data-value="Done" aria-pressed="true">Done</button>' +
        '<button type="button" class="pill f-status" data-value="Working on it" aria-pressed="false">Working on it</button>' +
      '</div>';

    card.querySelector(".remove-btn").addEventListener("click", function () {
      if (taskList.querySelectorAll(".card").length <= 1) return; // always keep one card
      card.remove();
      renumber();
    });

    var pills = card.querySelectorAll(".f-status");
    pills.forEach(function (pill) {
      pill.addEventListener("click", function () {
        pills.forEach(function (p) { p.setAttribute("aria-pressed", "false"); });
        pill.setAttribute("aria-pressed", "true");
      });
    });

    return card;
  }

  taskList.appendChild(makeCard());
  addBtn.addEventListener("click", function () {
    taskList.appendChild(makeCard());
    renumber();
  });

  /* ---------- validation + submit ---------- */
  var form = document.getElementById("logForm");
  var statusMsg = document.getElementById("statusMsg");
  var submitBtn = document.getElementById("submitBtn");

  function collectTasks() {
    var cards = Array.prototype.slice.call(taskList.querySelectorAll(".card"));
    var valid = true;
    var tasks = [];
    cards.forEach(function (card) {
      var mainTask = card.querySelector(".f-main").value.trim();
      var description = card.querySelector(".f-desc").value.trim();
      var duration = card.querySelector(".f-dur").value.trim();
      var links = card.querySelector(".f-links").value.trim();
      var statusPill = card.querySelector('.f-status[aria-pressed="true"]');
      var status = statusPill ? statusPill.dataset.value : "";

      if (!mainTask) {
        card.classList.add("invalid");
        valid = false;
      } else {
        card.classList.remove("invalid");
      }
      tasks.push({ mainTask: mainTask, description: description, duration: duration, links: links, status: status });
    });
    return { valid: valid, tasks: tasks };
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var result = collectTasks();
    if (!result.valid) {
      statusMsg.textContent = "Please fill in every task's main title before saving.";
      statusMsg.className = "status-msg error";
      var firstInvalid = taskList.querySelector(".card.invalid");
      if (firstInvalid) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!window.CONFIG || !window.CONFIG.APPS_SCRIPT_URL) {
      statusMsg.textContent = "Backend not connected yet — set APPS_SCRIPT_URL in config.js.";
      statusMsg.className = "status-msg error";
      return;
    }

    submitBtn.disabled = true;
    statusMsg.textContent = "Saving…";
    statusMsg.className = "status-msg";

    var payload = { date: isoDate, tasks: result.tasks };
    var url = window.CONFIG.APPS_SCRIPT_URL + "?token=" + encodeURIComponent(window.CONFIG.SECRET_TOKEN);

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids a CORS preflight to Apps Script
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Request failed: " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error((data && data.error) || "Unknown error");
        statusMsg.textContent = "Saved to your sheet ✓";
        statusMsg.className = "status-msg success";
        submitBtn.textContent = "Saved";
      })
      .catch(function (err) {
        statusMsg.textContent = "Couldn't save — " + err.message + ". Tap Save to retry.";
        statusMsg.className = "status-msg error";
        submitBtn.disabled = false;
      });
  });

  /* ---------- best-effort "already logged today" check ---------- */
  if (window.CONFIG && window.CONFIG.APPS_SCRIPT_URL) {
    fetch(window.CONFIG.APPS_SCRIPT_URL + "?token=" + encodeURIComponent(window.CONFIG.SECRET_TOKEN) + "&date=" + isoDate)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.alreadySubmitted) {
          statusMsg.textContent = "You already logged tasks for today — saving again will add more rows.";
          statusMsg.className = "status-msg";
        }
      })
      .catch(function () { /* silently ignore — this check is optional */ });
  }
})();
