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
    `Вопрос: ${question.text}`,
    `Ответьте на этот вопрос в админ-панели или в боте, указав #${question.id}`
  ].filter(Boolean);

  return Promise.all(
    CHAT_IDS.map((chatId) =>
      telegramRequest("sendMessage", {
        chat_id: chatId,
        text: lines.join("\n")
      }).catch((err) => {
        console.error("sendQuestionToAdmins error", err);
      })
    )
  );
}

app.post("/api/questions", async (req, res) => {
  const { name, email, company, text, telegramChatId } = req.body || {};
  if (!name || !email || !text) {
    return res.status(400).json({ ok: false, error: "Укажите имя, email и вопрос" });
  }
  const id = questions.length + 1;
  const question = {
    id,
    name,
    email,
    company: company || "",
    telegramChatId: telegramChatId || "",
    text,
    status: "open",
    createdAt: new Date().toISOString(),
    answer: null,
    answeredAt: null
  };
  questions.unshift(question); // newest first

  if (CHAT_IDS.length > 0 && TELEGRAM_TOKEN) {
    sendQuestionToAdmins(question).catch((err) => console.error(err));
  }

  res.json({ ok: true, id });
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

// --- Telegram bridge: пересылка вопросов и ответов ---

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

async function handleUserMessage(message) {
  const { chat, text, message_id: messageId, from } = message;
  const userLabel = `${from?.first_name || ""} ${from?.last_name || ""}`.trim() || "Без имени";
  const userTag = from?.username ? `@${from.username}` : "";
  const header = `Новый вопрос от ${userLabel} ${userTag}\nchat_id: ${chat.id}\n\n${text || "без текста"}`;

  for (const adminChat of CHAT_IDS) {
    // Пересылаем оригинал, чтобы можно было отвечать reply'ем
    await telegramRequest("forwardMessage", {
      chat_id: adminChat,
      from_chat_id: chat.id,
      message_id: messageId
    });
    // Добавляем подсказку
    await telegramRequest("sendMessage", {
      chat_id: adminChat,
      text: `${header}\n\nОтветьте на это сообщение реплаем, чтобы переслать ответ пользователю.`
    });
  }
}

async function handleAdminReply(message) {
  const reply = message.reply_to_message;
  if (!reply || !reply.forward_from) {
    return;
  }
  const targetChatId = reply.forward_from.id;
  const text = message.text || "";
  if (!text.trim()) {
    return;
  }
  const answer = `Ответ от команды:\n${text}`;
  await telegramRequest("sendMessage", {
    chat_id: targetChatId,
    text: answer
  });
}

function startTelegramBridge() {
  if (!TELEGRAM_TOKEN || CHAT_IDS.length === 0) {
    console.warn("Telegram bridge is not started (missing token or admin chat ids).");
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
        const msg = update.message;
        if (!msg || !msg.chat || !msg.from) continue;

        const chatId = msg.chat.id;
        const isAdmin = isAdminChat(chatId);

        // Если сообщение от админа и это ответ на пересланное — отправляем пользователю
        if (isAdmin && msg.reply_to_message && msg.reply_to_message.forward_from) {
          await handleAdminReply(msg);
          continue;
        }

        // Если сообщение от админа, но без реплая — пропускаем
        if (isAdmin) continue;

        // Сообщение от пользователя — пересылаем админам
        await handleUserMessage(msg);
      }
    } catch (err) {
      console.error("Telegram polling error:", err.message || err);
    } finally {
      setTimeout(poll, 2000);
    }
  };

  poll();
  console.log("Telegram bridge started (getUpdates polling).");
}

startTelegramBridge();
