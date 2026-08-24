const Anthropic = require("@anthropic-ai/sdk");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const WEBHOOK_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}/api/webhook`
  : "https://asanai-bot.vercel.app/api/webhook";

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ---------------------------------------------------------------------------
// In-memory store (resets on cold start — good enough for launch)
// For production, replace with Vercel KV or PlanetScale
// ---------------------------------------------------------------------------
const users = {};

function getUser(id) {
  if (!users[id]) {
    users[id] = {
      id,
      isPro: false,
      proExpiry: null,
      streak: 0,
      lastSession: null,
      sessions: 0,
      joinedAt: new Date().toISOString(),
    };
  }
  return users[id];
}

function isProActive(user) {
  if (!user.isPro) return false;
  if (!user.proExpiry) return false;
  return new Date(user.proExpiry) > new Date();
}

function updateStreak(user) {
  const now = new Date();
  const last = user.lastSession ? new Date(user.lastSession) : null;
  if (!last) {
    user.streak = 1;
  } else {
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      user.streak += 1;
    } else if (diffDays > 1) {
      user.streak = 1;
    }
  }
  user.lastSession = now.toISOString();
  user.sessions += 1;
}

// ---------------------------------------------------------------------------
// Telegram API helpers
// ---------------------------------------------------------------------------
async function callTelegram(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chatId, text, extra = {}) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

async function sendInvoice(chatId) {
  return callTelegram("sendInvoice", {
    chat_id: chatId,
    title: "Asanai Pro — Weekly",
    description:
      "Unlimited AI yoga plans, all classes, full programs & daily coaching. Cancel anytime.",
    payload: "pro_weekly",
    currency: "XTR",
    prices: [{ label: "Pro weekly membership", amount: 299 }],
    photo_url:
      "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80",
    photo_width: 800,
    photo_height: 534,
  });
}

// ---------------------------------------------------------------------------
// AI yoga plan generator
// ---------------------------------------------------------------------------
async function generateYogaPlan(goal, level = "beginner") {
  const goals = {
    relax: "gentle stretching and relaxation, releasing tension",
    energize: "energizing morning flow with dynamic sun salutations",
    backpain: "lower back pain relief and core strengthening",
    sleep: "bedtime wind-down with calming breathwork",
    core: "core strength and stability building",
    flexible: "deep flexibility and hip opening",
  };

  const focus = goals[goal] || goals.relax;

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are Asanai, an AI yoga coach. Create a short, friendly yoga session plan for someone who wants: ${focus}. Level: ${level}.

Respond in this exact format:
TITLE: [session name]
DURATION: [X min]
DESCRIPTION: [2 sentences max, warm and motivating]
POSES:
1. [Pose name] — [duration] — [one-line benefit]
2. [Pose name] — [duration] — [one-line benefit]
3. [Pose name] — [duration] — [one-line benefit]
4. [Pose name] — [duration] — [one-line benefit]
5. [Pose name] — [duration] — [one-line benefit]
TIP: [one practical tip for today's session]

Keep it warm, encouraging, and simple. No markdown, just plain text.`,
      },
    ],
  });

  return msg.content[0].text;
}

// ---------------------------------------------------------------------------
// Format yoga plan into a nice Telegram message
// ---------------------------------------------------------------------------
function formatPlan(raw) {
  const lines = raw.split("\n").filter((l) => l.trim());
  let out = "🧘 <b>Your Asanai Session</b>\n\n";

  for (const line of lines) {
    if (line.startsWith("TITLE:")) {
      out += `<b>${line.replace("TITLE:", "").trim()}</b>\n`;
    } else if (line.startsWith("DURATION:")) {
      out += `⏱ ${line.replace("DURATION:", "").trim()}\n\n`;
    } else if (line.startsWith("DESCRIPTION:")) {
      out += `${line.replace("DESCRIPTION:", "").trim()}\n\n`;
    } else if (line.startsWith("POSES:")) {
      out += `<b>Your poses:</b>\n`;
    } else if (/^\d\./.test(line)) {
      out += `${line}\n`;
    } else if (line.startsWith("TIP:")) {
      out += `\n💡 <i>${line.replace("TIP:", "").trim()}</i>`;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Keyboard builders
// ---------------------------------------------------------------------------
function mainMenu(isPro) {
  return {
    inline_keyboard: [
      [
        { text: "🧘 Get my yoga plan", callback_data: "menu_plan" },
        { text: "📚 Classes", callback_data: "menu_classes" },
      ],
      [
        { text: "🔥 My streak", callback_data: "menu_streak" },
        { text: isPro ? "⭐ Pro active" : "⭐ Go Pro", callback_data: isPro ? "menu_profile" : "menu_upgrade" },
      ],
    ],
  };
}

function goalMenu() {
  return {
    inline_keyboard: [
      [
        { text: "😌 Stretch & relax", callback_data: "plan_relax" },
        { text: "⚡ Energize", callback_data: "plan_energize" },
      ],
      [
        { text: "🦴 Back pain relief", callback_data: "plan_backpain" },
        { text: "🌙 Better sleep", callback_data: "plan_sleep" },
      ],
      [
        { text: "💪 Core strength", callback_data: "plan_core" },
        { text: "🤸 Flexibility", callback_data: "plan_flexible" },
      ],
      [{ text: "← Back", callback_data: "back_main" }],
    ],
  };
}

function classesMenu(isPro) {
  const lock = isPro ? "" : " 🔒";
  return {
    inline_keyboard: [
      [{ text: "☀️ Sun Salutation — 25 min (free)", callback_data: "class_sun" }],
      [{ text: "🧠 Guided Meditation — 15 min (free)", callback_data: "class_med" }],
      [{ text: "💨 Pranayama Breathing — 20 min (free)", callback_data: "class_breath" }],
      [{ text: `🔥 Power Vinyasa — 45 min${lock}`, callback_data: isPro ? "class_vinyasa" : "class_locked" }],
      [{ text: `🌙 Sleep Yoga Nidra — 30 min${lock}`, callback_data: isPro ? "class_nidra" : "class_locked" }],
      [{ text: `❤️ Yin & Restore — 60 min${lock}`, callback_data: isPro ? "class_yin" : "class_locked" }],
      [{ text: "← Back", callback_data: "back_main" }],
    ],
  };
}

// ---------------------------------------------------------------------------
// Class descriptions
// ---------------------------------------------------------------------------
const CLASS_INFO = {
  class_sun: {
    title: "☀️ Sun Salutation Flow",
    body: `<b>25 min · Beginner · Free</b>\n\nA classic energizing sequence linking breath with movement. Perfect for mornings or anytime you need a reset.\n\n<b>What you'll do:</b>\nMountain pose → Forward fold → Plank → Cobra → Downward dog → Warrior I → repeat\n\n💡 <i>Move slowly at first, let your breath lead.</i>`,
  },
  class_med: {
    title: "🧠 Guided Meditation",
    body: `<b>15 min · All levels · Free</b>\n\nA calming body-scan meditation to quiet the mind and reduce stress. No experience needed.\n\n<b>What you'll do:</b>\nBreath awareness → Body scan → Visualization → Return to presence\n\n💡 <i>Find a comfortable seat or lie down. Let thoughts pass like clouds.</i>`,
  },
  class_breath: {
    title: "💨 Pranayama Breathing",
    body: `<b>20 min · Beginner · Free</b>\n\nLearn the foundational breathing techniques of yoga. Instantly calming and energizing.\n\n<b>What you'll do:</b>\nNadi Shodhana (alternate nostril) → Ujjayi breath → Box breathing → Kapalabhati\n\n💡 <i>Never force the breath. Ease and steadiness come first.</i>`,
  },
  class_vinyasa: {
    title: "🔥 Power Vinyasa",
    body: `<b>45 min · Intermediate · Pro</b>\n\nA dynamic, heat-building flow that challenges strength, balance, and focus.\n\n<b>What you'll do:</b>\nWarm-up flow → Standing sequence → Arm balances → Core work → Cool down\n\n💡 <i>Modify any pose — your edge today is perfect for today.</i>`,
  },
  class_nidra: {
    title: "🌙 Sleep Yoga Nidra",
    body: `<b>30 min · All levels · Pro</b>\n\nYoga Nidra is a guided sleep-based meditation — deeply restorative, done lying down.\n\n<b>What you'll do:</b>\nBody scan → Breath awareness → Visualization journey → Deep rest\n\n💡 <i>Do this right before bed. Let yourself fall asleep — that's the goal.</i>`,
  },
  class_yin: {
    title: "❤️ Yin & Restore",
    body: `<b>60 min · All levels · Pro</b>\n\nLong-held passive poses targeting deep connective tissue. The antidote to a stressful week.\n\n<b>What you'll do:</b>\nButterly → Dragon → Sleeping swan → Spinal twist → Savasana\n\n💡 <i>Hold each pose 3–5 min. Surrender into the discomfort — it transforms.</i>`,
  },
};

// ---------------------------------------------------------------------------
// Handle /start
// ---------------------------------------------------------------------------
async function handleStart(chatId, firstName) {
  const user = getUser(chatId);
  const name = firstName || "friend";

  await sendMessage(
    chatId,
    `🧘 <b>Welcome to Asanai, ${name}!</b>\n\nYour AI-powered yoga and wellness companion — right here in Telegram.\n\n✨ Get personalized yoga plans generated by AI\n📚 Access guided classes anytime\n🔥 Build your daily streak\n⭐ Upgrade to Pro for unlimited access\n\nWhat would you like to do today?`,
    { reply_markup: mainMenu(isProActive(user)) }
  );
}

// ---------------------------------------------------------------------------
// Handle callback queries
// ---------------------------------------------------------------------------
async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;
  const user = getUser(chatId);
  const pro = isProActive(user);

  await callTelegram("answerCallbackQuery", { callback_query_id: query.id });

  if (data === "back_main") {
    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: "What would you like to do today?",
      parse_mode: "HTML",
      reply_markup: mainMenu(pro),
    });
    return;
  }

  if (data === "menu_plan") {
    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: "🧘 <b>What do you need today?</b>\n\nChoose your goal and I'll generate a personalized yoga plan for you:",
      parse_mode: "HTML",
      reply_markup: goalMenu(),
    });
    return;
  }

  if (data.startsWith("plan_")) {
    const goal = data.replace("plan_", "");

    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: "✨ <i>Generating your personalized plan...</i>",
      parse_mode: "HTML",
    });

    try {
      const raw = await generateYogaPlan(goal);
      const formatted = formatPlan(raw);
      updateStreak(user);

      await callTelegram("editMessageText", {
        chat_id: chatId,
        message_id: msgId,
        text: formatted + `\n\n🔥 Streak: <b>${user.streak} days</b> · Sessions: <b>${user.sessions}</b>`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔄 Different goal", callback_data: "menu_plan" }],
            [{ text: "← Home", callback_data: "back_main" }],
          ],
        },
      });
    } catch (err) {
      await callTelegram("editMessageText", {
        chat_id: chatId,
        message_id: msgId,
        text: "Something went wrong generating your plan. Please try again.",
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "← Back", callback_data: "menu_plan" }]] },
      });
    }
    return;
  }

  if (data === "menu_classes") {
    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: pro
        ? "📚 <b>All classes</b>\n\nAll sessions unlocked. Enjoy your practice!"
        : "📚 <b>Classes</b>\n\nFree classes are open. Upgrade to Pro to unlock everything.",
      parse_mode: "HTML",
      reply_markup: classesMenu(pro),
    });
    return;
  }

  if (data.startsWith("class_") && data !== "class_locked") {
    const info = CLASS_INFO[data];
    if (info) {
      await callTelegram("editMessageText", {
        chat_id: chatId,
        message_id: msgId,
        text: `<b>${info.title}</b>\n\n${info.body}`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Mark as done", callback_data: "class_done" }],
            [{ text: "← All classes", callback_data: "menu_classes" }],
          ],
        },
      });
    }
    return;
  }

  if (data === "class_done") {
    updateStreak(user);
    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: `🎉 <b>Session complete!</b>\n\nGreat work. Your body thanks you.\n\n🔥 Streak: <b>${user.streak} days</b>\n📊 Total sessions: <b>${user.sessions}</b>`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "← Home", callback_data: "back_main" }]] },
    });
    return;
  }

  if (data === "class_locked") {
    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: "🔒 <b>Pro class</b>\n\nThis class is available to Pro members. Upgrade to unlock unlimited classes, AI plans, and full programs.",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⭐ Upgrade to Pro — 299 Stars/week", callback_data: "menu_upgrade" }],
          [{ text: "← Classes", callback_data: "menu_classes" }],
        ],
      },
    });
    return;
  }

  if (data === "menu_streak") {
    const streakMsg = user.streak >= 7
      ? `🏆 <b>${user.streak}-day streak!</b> You're on fire.`
      : user.streak >= 3
      ? `🔥 <b>${user.streak}-day streak!</b> Keep it going!`
      : user.streak === 1
      ? `🌱 <b>1-day streak.</b> Great start — come back tomorrow!`
      : `💪 Start your streak today — complete any session!`;

    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: `📊 <b>Your progress</b>\n\n${streakMsg}\n\n📅 Total sessions: <b>${user.sessions}</b>\n⭐ Plan: <b>${pro ? "Pro" : "Free"}</b>${pro ? `\n📆 Pro expires: <b>${new Date(user.proExpiry).toLocaleDateString()}</b>` : ""}`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🧘 Start a session", callback_data: "menu_plan" }],
          [{ text: "← Home", callback_data: "back_main" }],
        ],
      },
    });
    return;
  }

  if (data === "menu_upgrade") {
    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: "⭐ <b>Asanai Pro</b>\n\nUnlock everything for 299 Stars/week (~$7.99):\n\n✅ Unlimited AI yoga plans\n✅ All 6 classes + new ones weekly\n✅ Full 30-day programs\n✅ Progress reports\n✅ Priority AI coaching\n\nCancel anytime. First week is risk-free.",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⭐ Subscribe — 299 Stars/week", callback_data: "do_upgrade" }],
          [{ text: "← Back", callback_data: "back_main" }],
        ],
      },
    });
    return;
  }

  if (data === "do_upgrade") {
    await sendInvoice(chatId);
    return;
  }

  if (data === "menu_profile") {
    await callTelegram("editMessageText", {
      chat_id: chatId,
      message_id: msgId,
      text: `⭐ <b>Pro active</b>\n\nYour membership is active until <b>${new Date(user.proExpiry).toLocaleDateString()}</b>.\n\nEnjoy unlimited access to all classes and AI coaching!`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "← Home", callback_data: "back_main" }]] },
    });
    return;
  }
}

// ---------------------------------------------------------------------------
// Handle successful payment
// ---------------------------------------------------------------------------
async function handlePayment(msg) {
  const chatId = msg.chat.id;
  const user = getUser(chatId);

  user.isPro = true;
  user.proExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await sendMessage(
    chatId,
    `🎉 <b>Welcome to Asanai Pro!</b>\n\nYour weekly membership is now active.\n\n✅ All classes unlocked\n✅ Unlimited AI plans\n✅ Full programs available\n\nYour Pro access is valid until <b>${new Date(user.proExpiry).toLocaleDateString()}</b>.\n\nLet's practice! 🧘`,
    { reply_markup: mainMenu(true) }
  );
}

// ---------------------------------------------------------------------------
// Vercel serverless handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, app: "Asanai Bot", status: "running" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const update = req.body;

    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = msg.text || "";
      const firstName = msg.from?.first_name;

      if (msg.successful_payment) {
        await handlePayment(msg);
      } else if (text === "/start") {
        await handleStart(chatId, firstName);
      } else if (text === "/plan") {
        const user = getUser(chatId);
        await sendMessage(chatId, "What do you need today?", {
          reply_markup: goalMenu(),
        });
      } else if (text === "/classes") {
        const user = getUser(chatId);
        await sendMessage(
          chatId,
          isProActive(user) ? "📚 All classes:" : "📚 Classes (Pro classes are locked):",
          { reply_markup: classesMenu(isProActive(user)) }
        );
      } else if (text === "/streak") {
        const user = getUser(chatId);
        await sendMessage(
          chatId,
          `🔥 Your streak: <b>${user.streak} days</b>\n📊 Total sessions: <b>${user.sessions}</b>`
        );
      } else if (text === "/upgrade") {
        await sendInvoice(chatId);
      } else if (text === "/help") {
        await sendMessage(
          chatId,
          `<b>Asanai commands:</b>\n\n/start — main menu\n/plan — get a yoga plan\n/classes — browse classes\n/streak — see your progress\n/upgrade — go Pro\n/help — this message`
        );
      } else {
        await handleStart(chatId, firstName);
      }
    }

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    }

    if (update.pre_checkout_query) {
      await callTelegram("answerPreCheckoutQuery", {
        pre_checkout_query_id: update.pre_checkout_query.id,
        ok: true,
      });
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(200).json({ ok: true });
  }
};
