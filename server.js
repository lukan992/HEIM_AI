require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

// Use built-in fetch (Node 18+) or fall back to node-fetch on older versions.
if (typeof fetch === "undefined") {
  global.fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
}

const app = express();
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_IDS = [process.env.TELEGRAM_CHAT_ID_1, process.env.TELEGRAM_CHAT_ID_2].filter(Boolean);
const PORT = process.env.PORT || 3000;
const TELEGRAM_API = TELEGRAM_TOKEN ? `https://api.telegram.org/bot${TELEGRAM_TOKEN}` : "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const questions = [];
const userStates = new Map(); // chatId -> "awaiting_question"
const adminPendingAnswer = new Map(); // adminChatId -> questionId
const userLastQuestion = new Map(); // userChatId -> last question id
let questionCounter = questions.length;

app.use(cors());
app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname)));

// Отдаём главную страницу
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/notify", async (req, res) => {
  const { name, email, company, note } = req.body || {};

  if (!name || !email) {
    return res.status(400).json({ ok: false, error: "Missing name or email" });
  }

  if (!TELEGRAM_TOKEN || CHAT_IDS.length === 0) {
    return res.status(500).json({ ok: false, error: "Telegram bot is not configured" });
  }

  const messageLines = [
    "Новая заявка с сайта:",
    `Имя: ${name}`,
    `Email: ${email}`,
    company ? `Компания: ${company}` : null,
    note ? `Комментарий: ${note}` : null,
    `Источник: ${req.headers.origin || "неизвестно"}`
  ].filter(Boolean);

  const text = messageLines.join("\n");
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  try {
    for (const chatId of CHAT_IDS) {
      const tgResponse = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text })
      });

      if (!tgResponse.ok) {
        const errorText = await tgResponse.text();
        throw new Error(`Telegram error ${tgResponse.status}: ${errorText}`);
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Telegram send failed:", error);
    res.status(500).json({ ok: false, error: error.message || "Не удалось отправить сообщение в Telegram" });
  }
});

// --- Questions flow (site -> Telegram admins; admin replies -> user TG if chat_id указан) ---
function requireAdmin(req, res) {
  const key = req.headers["x-admin-key"];
  if (!ADMIN_KEY || key !== ADMIN_KEY) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return false;
  }
  return true;
}

function sendQuestionToAdmins(question) {
  const lines = [
    `Новый вопрос #${question.id}`,
    `Имя: ${question.name}`,
    `Email: ${question.email}`,
    question.company ? `Компания: ${question.company}` : null,
    question.telegramChatId ? `Telegram chat_id: ${question.telegramChatId}` : null,
    question.userChatId ? `Отправил: ${question.userLabel || ""} (chat_id: ${question.userChatId})` : null,
    `Вопрос: ${question.text}`,
    `Ответьте на этот вопрос в боте, используя кнопку`
  ].filter(Boolean);

  return Promise.all(
    CHAT_IDS.map((chatId) =>
      telegramRequest("sendMessage", {
        chat_id: chatId,
        text: lines.join("\n"),
        reply_markup: {
          inline_keyboard: [
            [{ text: `Ответить #${question.id}`, callback_data: `answer:${question.id}` }],
            [{ text: "Список открытых вопросов", callback_data: "admin_list" }]
          ]
        }
      }).catch((err) => {
        console.error("sendQuestionToAdmins error", err);
      })
    )
  );
}

function nextQuestionId() {
  questionCounter += 1;
  return questionCounter;
}

function addQuestion(payload) {
  const id = nextQuestionId();
  const question = {
    id,
    name: payload.name || "Без имени",
    email: payload.email || "",
    company: payload.company || "",
    telegramChatId: payload.telegramChatId || "",
    userChatId: payload.userChatId || "",
    userLabel: payload.userLabel || "",
    text: payload.text || "",
    status: "open",
    createdAt: new Date().toISOString(),
    answer: null,
    answeredAt: null,
    answeredBy: null
  };
  questions.unshift(question);
  if (payload.userChatId) {
    userLastQuestion.set(String(payload.userChatId), id);
  }
  return question;
}

app.post("/api/questions", async (req, res) => {
  const { name, email, company, text, telegramChatId } = req.body || {};
  if (!name || !email || !text) {
    return res.status(400).json({ ok: false, error: "Укажите имя, email и вопрос" });
  }

  const question = addQuestion({
    name,
    email,
    company,
    telegramChatId,
    userChatId: "",
    userLabel: "",
    text
  });

  if (CHAT_IDS.length > 0 && TELEGRAM_TOKEN) {
    sendQuestionToAdmins(question).catch((err) => console.error(err));
  }

  res.json({ ok: true, id: question.id });
});

app.get("/api/questions", (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, items: questions });
});

app.post("/api/questions/:id/reply", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const { id } = req.params;
  const { answer } = req.body || {};
  if (!answer) {
    return res.status(400).json({ ok: false, error: "Пустой ответ" });
  }
  const q = questions.find((item) => String(item.id) === String(id));
  if (!q) {
    return res.status(404).json({ ok: false, error: "Вопрос не найден" });
  }

  q.answer = answer;
  q.answeredAt = new Date().toISOString();
  q.status = "answered";
  q.answeredBy = "api";

  const tasks = [];
  if (q.telegramChatId && TELEGRAM_TOKEN) {
    tasks.push(
      telegramRequest("sendMessage", {
        chat_id: q.telegramChatId,
        text: `Ответ на ваш вопрос #${q.id}:\n${answer}`
      }).catch((err) => {
        console.error("send answer to user failed", err);
      })
    );
  }

  if (CHAT_IDS.length > 0 && TELEGRAM_TOKEN) {
    tasks.push(
      Promise.all(
        CHAT_IDS.map((chatId) =>
          telegramRequest("sendMessage", {
            chat_id: chatId,
            text: `Ответ на вопрос #${q.id} (${q.name}):\n${answer}`
          }).catch((err) => console.error("send answer to admin failed", err))
        )
      )
    );
  }

  await Promise.all(tasks);

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// --- Telegram bot: кнопки "задать вопрос" и ответы админов ---

async function telegramRequest(method, payload) {
  if (!TELEGRAM_API) throw new Error("Telegram token is missing");
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.ok === false) {
    throw new Error(`Telegram ${method} failed: ${res.status} ${res.statusText} ${JSON.stringify(data)}`);
  }
  return data.result;
}

function isAdminChat(chatId) {
  return CHAT_IDS.includes(String(chatId));
}

async function sendUserWelcome(chatId) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text: "Привет! Нажмите кнопку, чтобы задать вопрос команде.",
    reply_markup: {
      inline_keyboard: [[{ text: "Задать вопрос", callback_data: "ask" }]]
    }
  });
}

async function sendAdminMenu(chatId) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text: "Админ-панель",
    reply_markup: {
      inline_keyboard: [
        [{ text: "Список открытых вопросов", callback_data: "admin_list" }]
      ]
    }
  });
}

function formatQuestion(q) {
  return [
    `#${q.id} — ${q.name}`,
    q.email ? `Email: ${q.email}` : null,
    q.company ? `Компания: ${q.company}` : null,
    q.userChatId ? `chat_id: ${q.userChatId}` : null,
    `Вопрос: ${q.text}`,
    `Статус: ${q.status}`
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendOpenQuestionsList(chatId) {
  const open = questions.filter((q) => q.status === "open").slice(0, 10);
  if (!open.length) {
    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: "Открытых вопросов нет."
    });
    return;
  }

  for (const q of open) {
    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: formatQuestion(q),
      reply_markup: {
        inline_keyboard: [[{ text: `Ответить #${q.id}`, callback_data: `answer:${q.id}` }]]
      }
    });
  }
}

async function answerQuestion(questionId, answerText, adminChatId) {
  const q = questions.find((item) => String(item.id) === String(questionId));
  if (!q) {
    throw new Error("Вопрос не найден");
  }
  q.answer = answerText;
  q.answeredAt = new Date().toISOString();
  q.status = "answered";
  q.answeredBy = String(adminChatId);

  if (q.userChatId) {
    await telegramRequest("sendMessage", {
      chat_id: q.userChatId,
      text: `Ответ на ваш вопрос #${q.id}:\n${answerText}`
    });
  }

  await telegramRequest("sendMessage", {
    chat_id: adminChatId,
    text: `Ответ отправлен пользователю для вопроса #${q.id}.`
  });
}

async function handleCallback(callback) {
  const data = callback.data || "";
  const chatId = callback.message?.chat?.id;
  const fromId = callback.from?.id;

  if (!chatId || !fromId) return;

  if (data === "ask") {
    userStates.set(String(fromId), "awaiting_question");
    await telegramRequest("answerCallbackQuery", { callback_query_id: callback.id });
    await telegramRequest("sendMessage", {
      chat_id: fromId,
      text: "Опишите ваш вопрос одним сообщением. Мы ответим сюда."
    });
    return;
  }

  if (data === "admin_list") {
    if (!isAdminChat(fromId)) {
      await telegramRequest("answerCallbackQuery", { callback_query_id: callback.id, text: "Нет доступа", show_alert: true });
      return;
    }
    await telegramRequest("answerCallbackQuery", { callback_query_id: callback.id });
    await sendOpenQuestionsList(fromId);
    return;
  }

  if (data.startsWith("answer:")) {
    if (!isAdminChat(fromId)) {
      await telegramRequest("answerCallbackQuery", { callback_query_id: callback.id, text: "Нет доступа", show_alert: true });
      return;
    }
    const questionId = data.split(":")[1];
    adminPendingAnswer.set(String(fromId), questionId);
    await telegramRequest("answerCallbackQuery", { callback_query_id: callback.id });
    await telegramRequest("sendMessage", {
      chat_id: fromId,
      text: `Введите ответ для вопроса #${questionId} одним сообщением.`
    });
    return;
  }

  await telegramRequest("answerCallbackQuery", { callback_query_id: callback.id });
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const fromId = message.from?.id;
  const text = (message.text || "").trim();
  const isAdmin = isAdminChat(chatId);

  // Админ ожидает ответ
  if (isAdmin && adminPendingAnswer.has(String(chatId)) && text) {
    const questionId = adminPendingAnswer.get(String(chatId));
    adminPendingAnswer.delete(String(chatId));
    try {
      await answerQuestion(questionId, text, chatId);
    } catch (err) {
      await telegramRequest("sendMessage", { chat_id: chatId, text: err.message || "Ошибка отправки ответа" });
    }
    return;
  }

  // Команды
  if (text === "/start" || text === "/ask") {
    await sendUserWelcome(chatId);
    return;
  }

  if (text === "/admin" && isAdmin) {
    await sendAdminMenu(chatId);
    return;
  }

  // Пользователь в режиме ввода вопроса
  if (userStates.get(String(chatId)) === "awaiting_question" && text) {
    userStates.delete(String(chatId));
    const question = addQuestion({
      name: `${message.from?.first_name || ""} ${message.from?.last_name || ""}`.trim() || "Без имени",
      email: "",
      company: "",
      telegramChatId: String(chatId),
      userChatId: String(chatId),
      userLabel: message.from?.username ? `@${message.from.username}` : "",
      text
    });

    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: `Ваш вопрос #${question.id} принят. Мы скоро ответим.`
    });

    if (CHAT_IDS.length > 0) {
      await sendQuestionToAdmins(question);
    }
    return;
  }

  // Прочие сообщения — подсказка
  if (!isAdmin) {
    // Любое сообщение пользователя вне режима — считаем новым вопросом/уточнением и отправляем админам
    const question = addQuestion({
      name: `${message.from?.first_name || ""} ${message.from?.last_name || ""}`.trim() || "Без имени",
      email: "",
      company: "",
      telegramChatId: String(chatId),
      userChatId: String(chatId),
      userLabel: message.from?.username ? `@${message.from.username}` : "",
      text
    });

    await telegramRequest("sendMessage", {
      chat_id: chatId,
      text: `Ваше сообщение принято как вопрос #${question.id}. Мы ответим здесь.`,
      reply_markup: {
        inline_keyboard: [[{ text: "Задать новый вопрос", callback_data: "ask" }]]
      }
    });

    if (CHAT_IDS.length > 0) {
      await sendQuestionToAdmins(question);
    }
  }
}

function startTelegramBridge() {
  if (!TELEGRAM_TOKEN) {
    console.warn("Telegram bridge is not started (missing token).");
    return;
  }

  let offset = 0;
  const poll = async () => {
    try {
      const updates = await telegramRequest("getUpdates", {
        timeout: 20,
        offset
      });

      for (const update of updates || []) {
        offset = update.update_id + 1;
        if (update.callback_query) {
          await handleCallback(update.callback_query);
          continue;
        }
        const msg = update.message;
        if (!msg || !msg.chat || !msg.from) continue;
        await handleMessage(msg);
      }
    } catch (err) {
      console.error("Telegram polling error:", err.message || err);
    } finally {
      setTimeout(poll, 1500);
    }
  };

  poll();
  console.log("Telegram bot started (getUpdates polling).");
}

startTelegramBridge();
