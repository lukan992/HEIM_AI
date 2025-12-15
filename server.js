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

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
