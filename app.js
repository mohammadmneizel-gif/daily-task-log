(function () {
  "use strict";

  // Global error/rejection reporting (the red banner) is installed in index.html's inline
  // <head> script, deliberately before this file loads — see __showFatalError there.

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- iOS keyboard-safe viewport height ---------- */
  function setAppHeight() {
    var vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-height", vh + "px");
    var keyboardOpen = window.visualViewport && vh < window.innerHeight * 0.75;
    document.documentElement.classList.toggle("kb-open", !!keyboardOpen);
  }
  setAppHeight();
  window.addEventListener("resize", setAppHeight);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", setAppHeight);
    window.visualViewport.addEventListener("scroll", function () { window.scrollTo(0, 0); });
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
  } else {
    // CSS :animation handles the other decorative pieces via prefers-reduced-motion, but the
    // SVG <animate> driving the caustic shimmer isn't a CSS animation, so it has to be stopped
    // in script.
    var causticSvg = document.querySelector(".caustic-overlay");
    if (causticSvg && causticSvg.pauseAnimations) causticSvg.pauseAnimations();
  }

  var glassdrops = document.getElementById("glassdrops");
  if (glassdrops) {
    spawn(glassdrops, "drop", 8, function (el) {
      el.style.left = Math.random() * 100 + "%";
      el.style.animationDuration = 5 + Math.random() * 6 + "s";
      el.style.animationDelay = Math.random() * 6 + "s";
    });
    function setFallDistance() {
      var frame = document.querySelector(".frame");
      glassdrops.style.setProperty("--fall", (frame ? frame.offsetHeight : window.innerHeight) + "px");
    }
    setFallDistance();
    window.addEventListener("resize", setFallDistance);
  }

  /* ---------- header: greeting, date picker, selected-date label ---------- */
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  var greetingEl = document.querySelector("h1");
  if (greetingEl && window.CONFIG && window.CONFIG.USER_NAME) {
    greetingEl.textContent = "End of the day, " + window.CONFIG.USER_NAME.split(" ")[0];
  }

  function pad2(n) { return String(n).padStart(2, "0"); }
  function toIsoDate(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

  // Logging after midnight but before 04:00 still belongs to "yesterday"'s entry.
  function defaultLogDate() {
    var now = new Date();
    if (now.getHours() < 4) now.setDate(now.getDate() - 1);
    return now;
  }

  var logDateInput = document.getElementById("logDate");
  var displaySub = document.getElementById("sub");
  var userChangedDate = false;
  var isoDate = toIsoDate(defaultLogDate());

  function renderSubLabel() {
    if (!displaySub) return;
    var d = parseIsoDateLocal(isoDate);
    displaySub.textContent = WEEKDAYS[d.getDay()] + " · " + d.getDate() + "/" + (d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function parseIsoDateLocal(iso) {
    var parts = iso.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  if (logDateInput) {
    var todayIso = toIsoDate(new Date());
    logDateInput.max = todayIso;
    logDateInput.value = isoDate;
    renderSubLabel();

    logDateInput.addEventListener("change", function () {
      userChangedDate = true;
      isoDate = logDateInput.value || isoDate;
      renderSubLabel();
      loadDraftForCurrentDate();
      runAlreadySubmittedCheck();
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible" || userChangedDate) return;
      var fresh = toIsoDate(defaultLogDate());
      if (fresh !== isoDate) {
        isoDate = fresh;
        logDateInput.value = isoDate;
        renderSubLabel();
        loadDraftForCurrentDate();
        runAlreadySubmittedCheck();
      }
    });
  } else {
    renderSubLabel();
  }

  var metaEl = document.getElementById("meta");
  if (metaEl && window.CONFIG) {
    var deptSpan = document.createElement("span");
    deptSpan.textContent = window.CONFIG.DEPARTMENT;
    var mgrSpan = document.createElement("span");
    mgrSpan.textContent = "Mgr. " + window.CONFIG.MANAGER;
    metaEl.appendChild(deptSpan);
    metaEl.appendChild(mgrSpan);
  }

  /* ---------- token: delivered via the Telegram link's #t= fragment, then localStorage ---------- */
  function readAndStoreToken() {
    var match = /(?:^|[#&])t=([^&]+)/.exec(location.hash);
    if (match) {
      try { localStorage.setItem("dtl_token", decodeURIComponent(match[1])); } catch (e) { /* ignore */ }
      history.replaceState(null, "", location.pathname + location.search);
    }
    try { return localStorage.getItem("dtl_token") || ""; } catch (e) { return ""; }
  }
  var authToken = readAndStoreToken();

  /* ---------- dynamic task cards ---------- */
  var MAX_TASKS = 9;
  var taskList = document.getElementById("taskList");
  var addBtn = document.getElementById("addBtn");
  var cardCount = 0;
  var draftSaveTimer = null;

  function renumber() {
    var cards = taskList.querySelectorAll(".card");
    cards.forEach(function (card, idx) {
      card.querySelector(".task-num").textContent = "Task " + pad2(idx + 1);
    });
    var removeBtns = taskList.querySelectorAll(".remove-btn");
    removeBtns.forEach(function (btn) {
      btn.hidden = cards.length <= 1;
    });
    if (addBtn) {
      var atMax = cards.length >= MAX_TASKS;
      addBtn.disabled = atMax;
      addBtn.textContent = atMax ? MAX_TASKS + " tasks max per day" : "+ Add another task";
    }
  }

  function formatDurationInput(raw) {
    var digits = raw.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) return digits;
    return digits.slice(0, digits.length - 2) + ":" + digits.slice(-2);
  }

  function focusNextField(card, current) {
    var fields = Array.prototype.slice.call(card.querySelectorAll("input, textarea"));
    var idx = fields.indexOf(current);
    if (idx > -1 && idx < fields.length - 1) {
      fields[idx + 1].focus();
    } else {
      current.blur();
    }
  }

  function makeCard() {
    cardCount++;
    var card = document.createElement("div");
    card.className = "card";
    var n = cardCount;
    card.innerHTML =
      '<div class="card-head">' +
        '<span class="task-num">Task ' + pad2(n) + '</span>' +
        '<button type="button" class="remove-btn">Remove</button>' +
      '</div>' +
      '<label for="f-main-' + n + '">Main Task</label>' +
      '<input type="text" id="f-main-' + n + '" class="f-main" placeholder="e.g. تطوير مشروع الـ Timeline" dir="auto" enterkeyhint="next">' +
      '<div class="err err-main">Main task is required</div>' +
      '<label for="f-desc-' + n + '">Description</label>' +
      '<textarea id="f-desc-' + n + '" class="f-desc" placeholder="What did you actually do..." dir="auto" enterkeyhint="next"></textarea>' +
      '<div class="row2">' +
        '<div><label for="f-dur-' + n + '">Duration (HH:MM)</label><input type="text" id="f-dur-' + n + '" class="f-dur" placeholder="04:00" inputmode="numeric" enterkeyhint="next"><div class="err err-dur">Use H:MM, e.g. 4:30</div></div>' +
        '<div><label for="f-links-' + n + '">Links</label><input type="text" id="f-links-' + n + '" class="f-links" placeholder="optional" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next"></div>' +
      '</div>' +
      '<label>Status</label>' +
      '<div class="status-pills" role="group" aria-label="Status">' +
        '<button type="button" class="pill f-status" data-value="Done" aria-pressed="true">Done</button>' +
        '<button type="button" class="pill f-status" data-value="Working on it" aria-pressed="false">Working on it</button>' +
      '</div>';

    card.querySelector(".remove-btn").addEventListener("click", function () {
      if (taskList.querySelectorAll(".card").length <= 1) return; // always keep one card
      var hasText = Array.prototype.slice.call(card.querySelectorAll("input, textarea"))
        .some(function (f) { return f.value.trim() !== ""; });
      if (hasText && !confirm("Remove this task?")) return;
      card.remove();
      renumber();
      scheduleDraftSave();
    });

    var pills = card.querySelectorAll(".f-status");
    pills.forEach(function (pill) {
      pill.addEventListener("click", function () {
        pills.forEach(function (p) { p.setAttribute("aria-pressed", "false"); });
        pill.setAttribute("aria-pressed", "true");
        scheduleDraftSave();
      });
    });

    var durInput = card.querySelector(".f-dur");
    durInput.addEventListener("input", function () {
      durInput.value = formatDurationInput(durInput.value);
    });
    durInput.addEventListener("blur", function () {
      var v = durInput.value;
      if (/^\d{1,2}$/.test(v)) durInput.value = v + ":00";
      var valid = v === "" || /^\d{1,2}:[0-5]\d$/.test(durInput.value);
      durInput.closest(".row2").querySelector(".err-dur").style.display = valid ? "none" : "block";
    });

    card.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var target = e.target;
      if (target.tagName === "INPUT") {
        e.preventDefault();
        focusNextField(card, target);
      }
    });

    card.addEventListener("input", scheduleDraftSave);

    return card;
  }

  taskList.appendChild(makeCard());
  renumber();
  addBtn.addEventListener("click", function () {
    if (taskList.querySelectorAll(".card").length >= MAX_TASKS) return;
    taskList.appendChild(makeCard());
    renumber();
    scheduleDraftSave();
  });

  /* ---------- draft autosave (localStorage, per date) ---------- */
  function draftKey(date) { return "dtl_draft_" + date; }

  function collectDraft() {
    var cards = Array.prototype.slice.call(taskList.querySelectorAll(".card"));
    return cards.map(function (card) {
      var statusPill = card.querySelector('.f-status[aria-pressed="true"]');
      return {
        mainTask: card.querySelector(".f-main").value,
        description: card.querySelector(".f-desc").value,
        duration: card.querySelector(".f-dur").value,
        links: card.querySelector(".f-links").value,
        status: statusPill ? statusPill.dataset.value : "Done"
      };
    });
  }

  function saveDraft() {
    try {
      var draft = collectDraft();
      var hasContent = draft.some(function (t) {
        return t.mainTask || t.description || t.duration || t.links;
      });
      if (hasContent) {
        localStorage.setItem(draftKey(isoDate), JSON.stringify(draft));
      } else {
        localStorage.removeItem(draftKey(isoDate));
      }
    } catch (e) { /* ignore storage failures */ }
  }

  function scheduleDraftSave() {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(saveDraft, 300);
  }

  function clearOtherDateDrafts() {
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var key = localStorage.key(i);
        if (key && key.indexOf("dtl_draft_") === 0 && key !== draftKey(isoDate)) {
          localStorage.removeItem(key);
        }
      }
    } catch (e) { /* ignore */ }
  }

  function applyDraft(draft) {
    taskList.innerHTML = "";
    cardCount = 0;
    draft.forEach(function (t) {
      var card = makeCard();
      taskList.appendChild(card);
      card.querySelector(".f-main").value = t.mainTask || "";
      card.querySelector(".f-desc").value = t.description || "";
      card.querySelector(".f-dur").value = t.duration || "";
      card.querySelector(".f-links").value = t.links || "";
      var pill = card.querySelector('.f-status[data-value="' + (t.status === "Working on it" ? "Working on it" : "Done") + '"]');
      if (pill) {
        card.querySelectorAll(".f-status").forEach(function (p) { p.setAttribute("aria-pressed", "false"); });
        pill.setAttribute("aria-pressed", "true");
      }
    });
    renumber();
  }

  function loadDraftForCurrentDate() {
    clearOtherDateDrafts();
    try {
      var raw = localStorage.getItem(draftKey(isoDate));
      if (raw) {
        var draft = JSON.parse(raw);
        if (Array.isArray(draft) && draft.length) {
          applyDraft(draft);
          return;
        }
      }
    } catch (e) { /* ignore */ }
    taskList.innerHTML = "";
    cardCount = 0;
    taskList.appendChild(makeCard());
    renumber();
  }

  loadDraftForCurrentDate();

  /* ---------- validation + submit ---------- */
  var form = document.getElementById("logForm");
  var statusMsg = document.getElementById("statusMsg");
  var submitBtn = document.getElementById("submitBtn");

  if (!authToken) {
    statusMsg.textContent = "Open this page from the Telegram reminder link once to unlock saving.";
    statusMsg.className = "status-msg error";
    submitBtn.disabled = true;
  }

  var currentSubmissionId = null;
  function newSubmissionId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return Date.now() + "-" + Math.random();
  }

  function collectTasks() {
    var cards = Array.prototype.slice.call(taskList.querySelectorAll(".card"));
    var valid = true;
    var tasks = [];
    cards.forEach(function (card) {
      var mainInput = card.querySelector(".f-main");
      var mainTask = mainInput.value.trim();
      var description = card.querySelector(".f-desc").value.trim();
      var duration = card.querySelector(".f-dur").value.trim();
      var links = card.querySelector(".f-links").value.trim();
      var statusPill = card.querySelector('.f-status[aria-pressed="true"]');
      var status = statusPill ? statusPill.dataset.value : "";

      if (!mainTask) {
        card.classList.add("invalid");
        mainInput.setAttribute("aria-invalid", "true");
        valid = false;
      } else {
        card.classList.remove("invalid");
        mainInput.removeAttribute("aria-invalid");
      }
      tasks.push({ mainTask: mainTask, description: description, duration: duration, links: links, status: status });
    });
    return { valid: valid, tasks: tasks };
  }

  function runAlreadySubmittedCheck() {
    if (!(window.CONFIG && window.CONFIG.APPS_SCRIPT_URL && authToken)) return;
    fetch(window.CONFIG.APPS_SCRIPT_URL + "?token=" + encodeURIComponent(authToken) + "&date=" + isoDate)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data && data.alreadySubmitted) {
          statusMsg.textContent = "You already logged tasks for today — saving again will add more rows.";
          statusMsg.className = "status-msg";
        }
      })
      .catch(function () { /* silently ignore — this check is optional */ });
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

    if (!authToken) {
      statusMsg.textContent = "Open this page from the Telegram reminder link once to unlock saving.";
      statusMsg.className = "status-msg error";
      return;
    }

    submitBtn.disabled = true;
    statusMsg.textContent = "Saving…";
    statusMsg.className = "status-msg";

    if (!currentSubmissionId) currentSubmissionId = newSubmissionId();
    var payload = { token: authToken, date: isoDate, tasks: result.tasks, submissionId: currentSubmissionId };
    var url = window.CONFIG.APPS_SCRIPT_URL;

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
        if (!data || data.ok !== true) {
          if (data && data.error === "day is full") {
            throw new Error("This day already has " + (data.freeSlots || 0) + " free slot(s) left.");
          }
          throw new Error((data && data.error) || "Unknown error");
        }
        currentSubmissionId = null;
        try { localStorage.removeItem(draftKey(isoDate)); } catch (ex) { /* ignore */ }
        taskList.innerHTML = "";
        cardCount = 0;
        taskList.appendChild(makeCard());
        renumber();
        statusMsg.textContent = "Saved to your sheet ✓ — add more anytime";
        statusMsg.className = "status-msg success";
        submitBtn.disabled = false;
        submitBtn.textContent = "Save to Sheet";
      })
      .catch(function (err) {
        statusMsg.textContent = "Couldn't save — " + err.message + ". Tap Save to retry.";
        statusMsg.className = "status-msg error";
        submitBtn.disabled = false;
      });
  });

  /* ---------- best-effort "already logged today" check ---------- */
  runAlreadySubmittedCheck();
})();
