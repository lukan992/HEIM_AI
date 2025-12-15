
const prefersReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false, addEventListener: () => {} };

document.addEventListener("DOMContentLoaded", () => {
  const burger = document.getElementById("burger");
  const mobileNav = document.getElementById("mobile-nav");
  const navOverlay = document.getElementById("nav-overlay");

  function closeMobileNav() {
    if (mobileNav) {
      mobileNav.classList.remove("open");
      mobileNav.hidden = true;
    }
    if (navOverlay) {
      navOverlay.classList.remove("active");
      navOverlay.hidden = true;
    }
    if (burger) {
      burger.setAttribute("aria-expanded", "false");
    }
    document.body.classList.remove("nav-open");
  }

  function openMobileNav() {
    if (mobileNav) {
      mobileNav.hidden = false;
      mobileNav.classList.add("open");
    }
    if (navOverlay) {
      navOverlay.hidden = false;
      navOverlay.classList.add("active");
    }
    if (burger) {
      burger.setAttribute("aria-expanded", "true");
    }
    document.body.classList.add("nav-open");
  }

  if (burger && mobileNav) {
    burger.addEventListener("click", () => {
      const isOpen = mobileNav.classList.contains("open");
      if (isOpen) {
        closeMobileNav();
      } else {
        openMobileNav();
      }
    });
  }

  if (mobileNav) {
    mobileNav.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof HTMLAnchorElement) {
        closeMobileNav();
      }
    });
  }

  if (navOverlay) {
    navOverlay.addEventListener("click", closeMobileNav);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMobileNav();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 900) {
      closeMobileNav();
    }
  });

  // Калькулятор
  const nInput = document.getElementById("input-n");
  const sInput = document.getElementById("input-s");
  const tInput = document.getElementById("input-t");
  const mInput = document.getElementById("input-m");
  const aInput = document.getElementById("input-a");
  const protoInput = document.getElementById("input-proto");
  const implInput = document.getElementById("input-impl");

  const costNowEl = document.getElementById("cost-now");
  const costNewEl = document.getElementById("cost-new");
  const savingMonthEl = document.getElementById("saving-month");
  const paybackEl = document.getElementById("payback");

  const btn = document.getElementById("calc-button");

  const calcInputs = [nInput, sInput, tInput, mInput, aInput, protoInput, implInput];

  function updateFieldStates() {
    calcInputs.forEach((input) => {
      if (!input) return;
      const wrapper = input.closest(".field");
      if (!wrapper) return;

      const value = Number(input.value);
      const allowZero = input.id === "input-proto" || input.id === "input-impl";
      const isEmpty = input.value === "";
      const isInvalid = !allowZero && (!isFinite(value) || value <= 0);

      wrapper.classList.remove("field-error", "field-valid");

      if (isEmpty) {
        return;
      }

      if (isInvalid) {
        wrapper.classList.add("field-error");
      } else {
        wrapper.classList.add("field-valid");
      }
    });
  }

  function formatCurrency(value) {
    if (!isFinite(value)) return "—";
    return value.toLocaleString("ru-RU", {
      maximumFractionDigits: 0
    }) + " ₽";
  }

  function formatMonths(value) {
    if (!isFinite(value)) return "—";
    if (value <= 0) return "< 1";
    return value.toFixed(1);
  }

  function calculate() {
    updateFieldStates();
    const N = Number(nInput.value) || 0;
    const S = Number(sInput.value) || 0;
    const T = Number(tInput.value) || 0;
    const M = Number(mInput.value) || 0;
    const A = Math.min(100, Math.max(0, Number(aInput.value) || 0));
    const proto = Number(protoInput.value) || 0;
    const impl = Number(implInput.value) || 0;

    const costNow = N * S * (T / 60) * M;
    const costNew = costNow * (1 - A / 100);
    const saving = costNow - costNew;
    const invest = proto + impl;
    const payback = saving > 0 ? invest / saving : Infinity;

    costNowEl.textContent = costNow > 0 ? formatCurrency(costNow) : "—";
    costNewEl.textContent = costNew > 0 ? formatCurrency(costNew) : "—";
    savingMonthEl.textContent = saving > 0 ? formatCurrency(saving) : "—";
    paybackEl.textContent = isFinite(payback) ? formatMonths(payback) : "—";
  }

  if (btn) {
    btn.addEventListener("click", calculate);
  }

  calcInputs.forEach((input) => {
    if (input) {
      input.addEventListener("input", updateFieldStates);
    }
  });

  // Автоподсчёт при загрузке
  calculate();
  updateFieldStates();

  // Переключатели в карточках услуг
  const serviceCards = document.querySelectorAll(".service-card");
  serviceCards.forEach((card) => {
    const toggle = card.querySelector(".service-toggle");
    if (toggle) {
      toggle.addEventListener("click", () => {
        card.classList.toggle("open");
      });
    }
  });

  // DNA-анимация
  const dnaCanvas = document.getElementById("dnaCanvas");
  const dnaBar = document.getElementById("dna-bar");
  let mouseXNorm = 0.5;

  document.addEventListener("mousemove", (e) => {
    mouseXNorm = e.clientX / window.innerWidth;
  });

  if (dnaCanvas && dnaCanvas.getContext) {
    const ctx = dnaCanvas.getContext("2d");

    function resizeCanvas() {
      dnaCanvas.width = dnaCanvas.offsetWidth;
      dnaCanvas.height = dnaCanvas.offsetHeight;
    }

    resizeCanvas();
    window.addEventListener("resize", () => {
      resizeCanvas();
      ensureDNAAnimation();
    });

    let t = 0;
    let dnaAnimId = null;

    const shouldAnimateDNA = () => !prefersReduce.matches && window.innerWidth >= 640;

    function drawDNA() {
      if (!shouldAnimateDNA()) {
        dnaAnimId = null;
        return;
      }

      const w = dnaCanvas.width;
      const h = dnaCanvas.height;
      if (!w || !h) {
        dnaAnimId = requestAnimationFrame(drawDNA);
        return;
      }

      ctx.clearRect(0, 0, w, h);

      const midBase = h / 2;
      const midShift = (mouseXNorm - 0.5) * 4;
      const mid = midBase + midShift;
      const amp = h * 0.35;
      const freq = 0.015;

      // первая нить
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(99,255,161,0.9)";
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const base = Math.sin(x * freq + t);
        const noise = Math.sin(x * 0.05 + t * 1.7) * 0.18;
        const y = mid + (base + noise) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // вторая нить (в противофазе)
      ctx.beginPath();
      for (let x = 0; x <= w; x++) {
        const base = Math.sin(x * freq + t + Math.PI);
        const noise = Math.sin(x * 0.05 + t * 1.7) * 0.18;
        const y = mid + (base + noise) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // поперечные "перемычки" и узлы
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "rgba(99,255,161,0.4)";
      const step = 22;
      for (let x = 0; x <= w; x += step) {
        const base1 = Math.sin(x * freq + t);
        const base2 = Math.sin(x * freq + t + Math.PI);
        const noise = Math.sin(x * 0.05 + t * 1.7) * 0.18;
        const y1 = mid + (base1 + noise) * amp;
        const y2 = mid + (base2 + noise) * amp;
        const ym = (y1 + y2) / 2;

        ctx.beginPath();
        ctx.moveTo(x, y1);
        ctx.lineTo(x, y2);
        ctx.stroke();

        // узел-точка
        ctx.beginPath();
        ctx.fillStyle = "rgba(99,255,161,0.9)";
        ctx.arc(x, ym, 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      t += 0.018;
      dnaAnimId = requestAnimationFrame(drawDNA);
    }

    function ensureDNAAnimation() {
      if (!shouldAnimateDNA()) {
        if (dnaAnimId) {
          cancelAnimationFrame(dnaAnimId);
          dnaAnimId = null;
        }
        return;
      }
      if (!dnaAnimId) {
        dnaAnimId = requestAnimationFrame(drawDNA);
      }
    }

    ensureDNAAnimation();

    if (prefersReduce && prefersReduce.addEventListener) {
      prefersReduce.addEventListener("change", ensureDNAAnimation);
    }

    // Плавное появление через IntersectionObserver
    if (dnaBar && "IntersectionObserver" in window) {
      const hero = document.querySelector(".hero");
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              dnaBar.classList.add("visible", "dna-pulse");
              setTimeout(() => dnaBar.classList.remove("dna-pulse"), 3200);
            }
          });
        },
        {
          root: null,
          threshold: 0.1
        }
      );
      if (hero) observer.observe(hero);
    } else if (dnaBar) {
      // fallback
      dnaBar.classList.add("visible", "dna-pulse");
      setTimeout(() => dnaBar.classList.remove("dna-pulse"), 3200);
    }
  }

  // Reveal on scroll
  const revealElements = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      {
        root: null,
        threshold: 0.2
      }
    );

    revealElements.forEach((el) => revealObserver.observe(el));
  } else {
    revealElements.forEach((el) => el.classList.add("visible"));
  }
});


  // Отправка формы контактов на сервер для уведомления в Telegram
  const contactForm = document.getElementById("contact-form");
  const contactStatus = document.getElementById("cf-status");
  const cfSubmit = document.getElementById("cf-submit");
  const CONTACT_ENDPOINT = "/api/notify";

  function setContactStatus(message, isError = false) {
    if (contactStatus) {
      contactStatus.textContent = message;
      contactStatus.classList.toggle("error", isError);
      contactStatus.classList.toggle("success", !isError && Boolean(message));
    }
  }

  async function handleContactSubmit(event) {
    event.preventDefault();
    if (!contactForm) return;

    const formData = new FormData(contactForm);
    const payload = {
      name: (formData.get("name") || "").toString().trim(),
      email: (formData.get("email") || "").toString().trim(),
      company: (formData.get("company") || "").toString().trim(),
      note: (formData.get("note") || "").toString().trim()
    };

    if (!payload.name || !payload.email) {
      setContactStatus("Укажите имя и email, чтобы мы могли ответить.", true);
      return;
    }

    setContactStatus("Отправляем...", false);
    if (cfSubmit) {
      cfSubmit.disabled = true;
      cfSubmit.classList.add("is-loading");
    }

    try {
      const response = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || (data && data.ok === false)) {
        const errMessage = (data && data.error) || "Не удалось отправить заявку.";
        throw new Error(errMessage);
      }

      contactForm.reset();
      setContactStatus("Готово! Заявка отправлена, мы свяжемся в Telegram/email.", false);
    } catch (error) {
      console.error("Contact form submit failed:", error);
      const msg = (error && error.message) || "Не удалось отправить. Попробуйте позже или напишите в Telegram.";
      setContactStatus(msg, true);
    } finally {
      if (cfSubmit) {
        cfSubmit.disabled = false;
        cfSubmit.classList.remove("is-loading");
      }
    }
  }

  if (contactForm) {
    contactForm.addEventListener("submit", handleContactSubmit);
  }

  // --- Модалка "Задать вопрос" ---
  const questionModal = document.getElementById("question-modal");
  const openQuestionBtn = document.getElementById("open-question");
  const questionForm = document.getElementById("question-form");
  const qStatus = document.getElementById("q-status");
  const qSubmit = document.getElementById("q-submit");

  function setQStatus(msg, isError = false) {
    if (qStatus) {
      qStatus.textContent = msg;
      qStatus.classList.toggle("error", isError);
      qStatus.classList.toggle("success", !isError && Boolean(msg));
    }
  }

  function openModal(modal) {
    if (modal) modal.hidden = false;
  }
  function closeModal(modal) {
    if (modal) modal.hidden = true;
  }

  if (openQuestionBtn) {
    openQuestionBtn.addEventListener("click", () => openModal(questionModal));
  }

  if (questionModal) {
    questionModal.addEventListener("click", (e) => {
      const target = e.target;
      if (target instanceof HTMLElement && target.hasAttribute("data-close-modal")) {
        closeModal(questionModal);
      }
    });
  }

  if (questionForm) {
    questionForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      setQStatus("Отправляем...", false);
      if (qSubmit) {
        qSubmit.disabled = true;
      }
      const payload = {
        name: (document.getElementById("q-name") || {}).value || "",
        email: (document.getElementById("q-email") || {}).value || "",
        company: (document.getElementById("q-company") || {}).value || "",
        telegramChatId: (document.getElementById("q-telegram") || {}).value || "",
        text: (document.getElementById("q-text") || {}).value || ""
      };

      try {
        const resp = await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data.ok === false) {
          throw new Error(data.error || "Не удалось отправить вопрос");
        }
        questionForm.reset();
        setQStatus("Вопрос отправлен! Мы ответим как можно скорее.", false);
        setTimeout(() => closeModal(questionModal), 1200);
      } catch (err) {
        setQStatus(err.message || "Не удалось отправить вопрос", true);
      } finally {
        if (qSubmit) qSubmit.disabled = false;
      }
    });
  }

  // --- Админ-панель для ответов ---
  const adminBtn = document.getElementById("open-admin");
  const adminModal = document.getElementById("admin-modal");
  const adminList = document.getElementById("admin-list");
  const adminStatus = document.getElementById("admin-status");
  const adminRefresh = document.getElementById("admin-refresh");
  const adminMode = new URLSearchParams(window.location.search).get("admin") === "1";
  const ADMIN_KEY_KEY = "heimAdminKey";

  function setAdminStatus(msg, isError = false) {
    if (adminStatus) {
      adminStatus.textContent = msg;
      adminStatus.classList.toggle("error", isError);
      adminStatus.classList.toggle("success", !isError && Boolean(msg));
    }
  }

  function getAdminKey() {
    let key = sessionStorage.getItem(ADMIN_KEY_KEY) || "";
    if (!key) {
      key = window.prompt("Введите admin key") || "";
      if (key) sessionStorage.setItem(ADMIN_KEY_KEY, key);
    }
    return key;
  }

  async function fetchQuestions() {
    const key = getAdminKey();
    if (!key) {
      setAdminStatus("Admin key не задан", true);
      return;
    }
    setAdminStatus("Загружаем...", false);
    try {
      const resp = await fetch("/api/questions", {
        headers: { "x-admin-key": key }
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || "Ошибка загрузки");
      renderQuestions(data.items || []);
      setAdminStatus("Список обновлен", false);
    } catch (err) {
      setAdminStatus(err.message || "Не удалось загрузить вопросы", true);
    }
  }

  async function sendAnswer(id, answer) {
    const key = getAdminKey();
    if (!key) {
      setAdminStatus("Admin key не задан", true);
      return;
    }
    setAdminStatus("Отправляем ответ...", false);
    try {
      const resp = await fetch(`/api/questions/${id}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": key
        },
        body: JSON.stringify({ answer })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) throw new Error(data.error || "Ошибка отправки ответа");
      setAdminStatus("Ответ отправлен", false);
      fetchQuestions();
    } catch (err) {
      setAdminStatus(err.message || "Не удалось отправить ответ", true);
    }
  }

  function renderQuestions(items) {
    if (!adminList) return;
    if (!items.length) {
      adminList.innerHTML = "<p class='muted'>Вопросов нет</p>";
      return;
    }
    adminList.innerHTML = "";
    items.forEach((q) => {
      const card = document.createElement("div");
      card.className = "admin-card";
      card.innerHTML = `
        <h4>#${q.id} — ${q.name}</h4>
        <div class="admin-meta">Email: ${q.email}${q.company ? " · " + q.company : ""}${q.telegramChatId ? " · chat_id: " + q.telegramChatId : ""}</div>
        <p>${q.text}</p>
        <div class="admin-meta">Статус: ${q.status}${q.answeredAt ? " · " + new Date(q.answeredAt).toLocaleString() : ""}</div>
        <div class="admin-actions">
          <button class="btn btn-primary btn-sm" data-answer="${q.id}">Ответить</button>
        </div>
      `;
      adminList.appendChild(card);
    });
  }

  if (adminMode && adminBtn) {
    adminBtn.hidden = false;
  }

  if (adminBtn) {
    adminBtn.addEventListener("click", () => {
      openModal(adminModal);
      fetchQuestions();
    });
  }

  if (adminModal) {
    adminModal.addEventListener("click", (e) => {
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (target.hasAttribute("data-close-admin")) {
          closeModal(adminModal);
        }
        if (target.dataset && target.dataset.answer) {
          const id = target.dataset.answer;
          const ans = window.prompt("Введите ответ для пользователя") || "";
          if (ans.trim()) {
            sendAnswer(id, ans.trim());
          }
        }
      }
    });
  }

  if (adminRefresh) {
    adminRefresh.addEventListener("click", fetchQuestions);
  }


// Локальный фон-ДНК только внутри калькулятора (вариант из точек)
(function () {
  const canvas = document.getElementById("dnaLinesBg");
  const section = document.getElementById("calculator");
  if (!canvas || !section || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");

  function resizeCanvas() {
    const rect = section.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = section.clientWidth || rect.width || window.innerWidth;
    const height = section.clientHeight || rect.height || 320;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas._cssWidth = width;
    canvas._cssHeight = height;
    const ctx2 = canvas.getContext("2d");
    ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", () => {
    resizeCanvas();
    ensureCalcAnimation();
  });
  resizeCanvas();

  let start = null;
  let visible = true;
  let calcAnimId = null;

  const shouldAnimateCalc = () => visible && !prefersReduce.matches && window.innerWidth >= 640;

  if ("IntersectionObserver" in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visible = entry.isIntersecting;
          ensureCalcAnimation();
        });
      },
      { threshold: 0.1 }
    );
    obs.observe(section);
  }

  function render(timestamp) {
    if (!shouldAnimateCalc()) {
      calcAnimId = null;
      return;
    }

    if (!start) start = timestamp;
    const t = (timestamp - start) / 1000;

    const w = canvas._cssWidth || canvas.width;
    const h = canvas._cssHeight || canvas.height;
    if (!w || !h) {
      calcAnimId = requestAnimationFrame(render);
      return;
    }

    ctx.clearRect(0, 0, w, h);

    // Диагональная ось внутри калькулятора
    const x0 = -w * 0.05;
    const y0 = h * 0.75;
    const x1 = w * 1.05;
    const y1 = h * 0.15;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.sqrt(dx * dx + dy * dy) || 1;

    const nx = -dy / length;
    const ny = dx / length;

    const segments = 80;
    const amplitude = Math.min(w, h) * 0.04;
    const speed = 1.0;

    // Много точек вместо линий
    for (let i = 0; i <= segments; i++) {
      const f = i / segments;

      const baseX = x0 + dx * f;
      const baseY = y0 + dy * f;

      const wobble1 = Math.sin(f * 10 + t * speed) * amplitude;
      const wobble2 = Math.sin(f * 10 + t * speed + Math.PI) * amplitude;

      const xA = baseX + nx * wobble1;
      const yA = baseY + ny * wobble1;
      const xB = baseX + nx * wobble2;
      const yB = baseY + ny * wobble2;

      // точки нитей
      const alphaMain = 0.45 + 0.2 * Math.sin(t + f * 6);
      ctx.beginPath();
      ctx.fillStyle = "rgba(99,255,161," + alphaMain.toFixed(3) + ")";
      ctx.arc(xA, yA, 2.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = "rgba(99,255,161," + (alphaMain * 0.9).toFixed(3) + ")";
      ctx.arc(xB, yB, 2.1, 0, Math.PI * 2);
      ctx.fill();

      // точка-перемычка между нитями
      if (i % 2 === 0) {
        const xm = (xA + xB) / 2;
        const ym = (yA + yB) / 2;
        const alphaMid = 0.3 + 0.2 * Math.sin(t * 1.3 + f * 10);
        ctx.beginPath();
        ctx.fillStyle = "rgba(99,255,161," + alphaMid.toFixed(3) + ")";
        ctx.arc(xm, ym, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    calcAnimId = requestAnimationFrame(render);
  }

  function ensureCalcAnimation() {
    if (!shouldAnimateCalc()) {
      if (calcAnimId) {
        cancelAnimationFrame(calcAnimId);
        calcAnimId = null;
      }
      return;
    }
    if (!calcAnimId) {
      calcAnimId = requestAnimationFrame(render);
    }
  }

  if (prefersReduce && prefersReduce.addEventListener) {
    prefersReduce.addEventListener("change", ensureCalcAnimation);
  }

  window.addEventListener("resize", ensureCalcAnimation);
  ensureCalcAnimation();
})();
