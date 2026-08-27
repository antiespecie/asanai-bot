const Anthropic = require("@anthropic-ai/sdk");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET = process.env.PAYPAL_SECRET;
const PAYPAL_PLAN_ID = process.env.PAYPAL_PLAN_ID;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const users = {};

function getUser(id) {
  if (!users[id]) {
    users[id] = {
      id, isPro: false, proExpiry: null,
      streak: 0, lastSession: null, sessions: 0,
      lang: null, joinedAt: new Date().toISOString(),
    };
  }
  return users[id];
}

function isProActive(user) {
  if (!user.isPro || !user.proExpiry) return false;
  return new Date(user.proExpiry) > new Date();
}

function updateStreak(user) {
  const now = new Date();
  const last = user.lastSession ? new Date(user.lastSession) : null;
  if (!last) { user.streak = 1; }
  else {
    const diff = Math.floor((now - last) / (1000 * 60 * 60 * 24));
    if (diff === 1) user.streak += 1;
    else if (diff > 1) user.streak = 1;
  }
  user.lastSession = new Date().toISOString();
  user.sessions += 1;
}

// ---------------------------------------------------------------------------
// PayPal
// ---------------------------------------------------------------------------
async function getPayPalToken() {
  const res = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token;
}

async function createPayPalSubscriptionLink(userId, lang) {
  try {
    const token = await getPayPalToken();
    const res = await fetch("https://api-m.paypal.com/v1/billing/subscriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `asanai-${userId}-${Date.now()}`,
      },
      body: JSON.stringify({
        plan_id: PAYPAL_PLAN_ID,
        subscriber: { name: { given_name: "Asanai", surname: "User" } },
        application_context: {
          brand_name: "Asanai",
          locale: lang === "es" ? "es-CR" : lang === "pt" ? "pt-BR" : "en-US",
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW",
          return_url: `https://asanai-bot.vercel.app/api/webhook?action=paypal_success&user=${userId}`,
          cancel_url: `https://asanai-bot.vercel.app/api/webhook?action=paypal_cancel&user=${userId}`,
        },
      }),
    });
    const data = await res.json();
    const approvalLink = data.links?.find(l => l.rel === "approve");
    return approvalLink?.href || null;
  } catch (err) {
    console.error("PayPal error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------
const T = {
  en: {
    welcome: (n) => `🧘 <b>Welcome to Asanai, ${n}!</b>\n\nYour AI-powered yoga & wellness companion — right here in Telegram.\n\n✨ Personalized AI yoga plans\n📚 Guided classes anytime\n🔥 Daily streak tracking\n⭐ Pro: unlimited access for $7.99/month\n\nWhat would you like to do today?`,
    chooseGoal: "🧘 <b>What do you need today?</b>\n\nChoose your goal and I'll generate a personalized yoga plan:",
    generating: "✨ <i>Generating your personalized plan...</i>",
    error: "Something went wrong. Please try again.",
    classesTextFree: "📚 <b>Classes</b>\n\nFree classes open. Upgrade to Pro to unlock everything.",
    classesTextPro: "📚 <b>All Classes</b>\n\nAll sessions unlocked. Enjoy your practice!",
    classLocked: "🔒 <b>Pro Class</b>\n\nUpgrade to Pro to unlock all classes, unlimited AI plans and full programs.",
    sessionDone: (s, sess) => `🎉 <b>Session complete!</b>\n\nGreat work!\n\n🔥 Streak: <b>${s} days</b>\n📊 Sessions: <b>${sess}</b>`,
    streakMsg: (user, pro) => {
      const s = user.streak;
      const msg = s >= 7 ? `🏆 <b>${s}-day streak!</b> You're on fire!` : s >= 3 ? `🔥 <b>${s}-day streak!</b> Keep it going!` : s === 1 ? `🌱 <b>1-day streak.</b> Come back tomorrow!` : `💪 Complete a session to start your streak!`;
      return `📊 <b>Your Progress</b>\n\n${msg}\n\n📅 Sessions: <b>${user.sessions}</b>\n⭐ Plan: <b>${pro ? "Pro ✅" : "Free"}</b>`;
    },
    upgradeText: "⭐ <b>Asanai Pro — $7.99/month</b>\n\nUnlock everything:\n\n✅ Unlimited daily AI yoga plans\n✅ All classes + new ones weekly\n✅ Full 30-day programs\n✅ Progress reports\n✅ Priority AI coaching\n\nCancel anytime. Less than a coffee per week. ☕",
    proActive: (d) => `⭐ <b>Pro Active</b>\n\nMembership active until <b>${d}</b>.\n\nEnjoy unlimited access! 🧘\n\n─────────────────\n❌ <b>Want to cancel?</b>\nManage your subscription anytime on PayPal:\npaypal.com/myaccount/autopay`,
    paymentLink: "👇 Tap below to complete your subscription securely via PayPal:",
    paymentSuccess: "🎉 <b>Welcome to Asanai Pro!</b>\n\nYour monthly membership is now active.\n\n✅ All classes unlocked\n✅ Unlimited AI plans\n✅ Full programs available\n\nLet's practice! 🧘",
    paymentError: "⚠️ Could not generate payment link. Please try again in a moment.",
    goals: { relax: "😌 Stretch & relax", energize: "⚡ Energize", backpain: "🦴 Back pain", sleep: "🌙 Better sleep", core: "💪 Core strength", flexible: "🤸 Flexibility" },
    btn: {
      plan: "🧘 Get my yoga plan", classes: "📚 Classes", streak: "🔥 My streak",
      goPro: "⭐ Go Pro — $7.99/mo", proActive: "⭐ Pro active ✅",
      lang: "🌐 Language", upgrade: "⭐ Subscribe via PayPal",
      back: "← Back", home: "← Home", allClasses: "← All classes",
      done: "✅ Mark as done", newSession: "🧘 Start a session",
      diffGoal: "🔄 Different goal", changeLang: "Choose your language:",
    },
    streakLabel: (s, sess) => `\n\n🔥 Streak: <b>${s} days</b> · Sessions: <b>${sess}</b>`,
    planLabel: "Your plan",
  },
  es: {
    welcome: (n) => `🧘 <b>¡Bienvenido a Asanai, ${n}!</b>\n\nTu compañero de yoga e bienestar con IA — aquí en Telegram.\n\n✨ Planes de yoga personalizados con IA\n📚 Clases guiadas cuando quieras\n🔥 Racha diaria\n⭐ Pro: acceso ilimitado por $7.99/mes\n\n¿Qué te gustaría hacer hoy?`,
    chooseGoal: "🧘 <b>¿Qué necesitas hoy?</b>\n\nElige tu objetivo y generaré un plan personalizado:",
    generating: "✨ <i>Generando tu plan personalizado...</i>",
    error: "Algo salió mal. Por favor intenta de nuevo.",
    classesTextFree: "📚 <b>Clases</b>\n\nClases gratuitas disponibles. Mejora a Pro para desbloquear todo.",
    classesTextPro: "📚 <b>Todas las Clases</b>\n\n¡Todas las sesiones desbloqueadas. Disfruta tu práctica!",
    classLocked: "🔒 <b>Clase Pro</b>\n\nMejora a Pro para desbloquear todas las clases, planes ilimitados y programas completos.",
    sessionDone: (s, sess) => `🎉 <b>¡Sesión completada!</b>\n\n¡Excelente trabajo!\n\n🔥 Racha: <b>${s} días</b>\n📊 Sesiones: <b>${sess}</b>`,
    streakMsg: (user, pro) => {
      const s = user.streak;
      const msg = s >= 7 ? `🏆 <b>¡Racha de ${s} días!</b> ¡Estás en llamas!` : s >= 3 ? `🔥 <b>¡Racha de ${s} días!</b> ¡Sigue así!` : s === 1 ? `🌱 <b>Racha de 1 día.</b> ¡Vuelve mañana!` : `💪 ¡Completa una sesión para comenzar tu racha!`;
      return `📊 <b>Tu Progreso</b>\n\n${msg}\n\n📅 Sesiones: <b>${user.sessions}</b>\n⭐ Plan: <b>${pro ? "Pro ✅" : "Gratis"}</b>`;
    },
    upgradeText: "⭐ <b>Asanai Pro — $7.99/mes</b>\n\nDesbloquea todo:\n\n✅ Planes de yoga ilimitados con IA\n✅ Todas las clases + nuevas cada semana\n✅ Programas completos de 30 días\n✅ Reportes de progreso\n✅ Coaching IA prioritario\n\nCancela cuando quieras. Menos que un café por semana. ☕",
    proActive: (d) => `⭐ <b>Pro Activo</b>\n\nMembresía activa hasta <b>${d}</b>.\n\n¡Disfruta acceso ilimitado! 🧘\n\n─────────────────\n❌ <b>¿Quieres cancelar?</b>\nAdministra tu suscripción cuando quieras en PayPal:\npaypal.com/myaccount/autopay`,
    paymentLink: "👇 Toca abajo para completar tu suscripción de forma segura vía PayPal:",
    paymentSuccess: "🎉 <b>¡Bienvenido a Asanai Pro!</b>\n\nTu membresía mensual está activa.\n\n✅ Todas las clases desbloqueadas\n✅ Planes IA ilimitados\n✅ Programas completos disponibles\n\n¡A practicar! 🧘",
    paymentError: "⚠️ No se pudo generar el enlace de pago. Intenta de nuevo en un momento.",
    goals: { relax: "😌 Estirar y relajar", energize: "⚡ Energizarme", backpain: "🦴 Dolor de espalda", sleep: "🌙 Dormir mejor", core: "💪 Fuerza de núcleo", flexible: "🤸 Flexibilidad" },
    btn: {
      plan: "🧘 Mi plan de yoga", classes: "📚 Clases", streak: "🔥 Mi racha",
      goPro: "⭐ Ir a Pro — $7.99/mes", proActive: "⭐ Pro activo ✅",
      lang: "🌐 Idioma", upgrade: "⭐ Suscribirse vía PayPal",
      back: "← Atrás", home: "← Inicio", allClasses: "← Todas las clases",
      done: "✅ Marcar como hecho", newSession: "🧘 Iniciar sesión",
      diffGoal: "🔄 Otro objetivo", changeLang: "Elige tu idioma:",
    },
    streakLabel: (s, sess) => `\n\n🔥 Racha: <b>${s} días</b> · Sesiones: <b>${sess}</b>`,
    planLabel: "Tu plan",
  },
  pt: {
    welcome: (n) => `🧘 <b>Bem-vindo ao Asanai, ${n}!</b>\n\nSeu companheiro de yoga e bem-estar com IA — aqui no Telegram.\n\n✨ Planos de yoga personalizados com IA\n📚 Aulas guiadas a qualquer hora\n🔥 Sequência diária\n⭐ Pro: acesso ilimitado por $7.99/mês\n\nO que você gostaria de fazer hoje?`,
    chooseGoal: "🧘 <b>O que você precisa hoje?</b>\n\nEscolha seu objetivo e vou gerar um plano personalizado:",
    generating: "✨ <i>Gerando seu plano personalizado...</i>",
    error: "Algo deu errado. Por favor tente novamente.",
    classesTextFree: "📚 <b>Aulas</b>\n\nAulas gratuitas disponíveis. Atualize para Pro para desbloquear tudo.",
    classesTextPro: "📚 <b>Todas as Aulas</b>\n\nTodas as sessões desbloqueadas. Aproveite sua prática!",
    classLocked: "🔒 <b>Aula Pro</b>\n\nAtualize para Pro para desbloquear todas as aulas, planos ilimitados e programas completos.",
    sessionDone: (s, sess) => `🎉 <b>Sessão completa!</b>\n\nÓtimo trabalho!\n\n🔥 Sequência: <b>${s} dias</b>\n📊 Sessões: <b>${sess}</b>`,
    streakMsg: (user, pro) => {
      const s = user.streak;
      const msg = s >= 7 ? `🏆 <b>Sequência de ${s} dias!</b> Você está arrasando!` : s >= 3 ? `🔥 <b>Sequência de ${s} dias!</b> Continue assim!` : s === 1 ? `🌱 <b>Sequência de 1 dia.</b> Volte amanhã!` : `💪 Complete uma sessão para começar sua sequência!`;
      return `📊 <b>Seu Progresso</b>\n\n${msg}\n\n📅 Sessões: <b>${user.sessions}</b>\n⭐ Plano: <b>${pro ? "Pro ✅" : "Grátis"}</b>`;
    },
    upgradeText: "⭐ <b>Asanai Pro — $7.99/mês</b>\n\nDesbloqueie tudo:\n\n✅ Planos de yoga ilimitados com IA\n✅ Todas as aulas + novas toda semana\n✅ Programas completos de 30 dias\n✅ Relatórios de progresso\n✅ Coaching IA prioritário\n\nCancele quando quiser. Menos que um café por semana. ☕",
    proActive: (d) => `⭐ <b>Pro Ativo</b>\n\nAssinatura ativa até <b>${d}</b>.\n\nAproveite o acesso ilimitado! 🧘\n\n─────────────────\n❌ <b>Quer cancelar?</b>\nGerencie sua assinatura a qualquer momento no PayPal:\npaypal.com/myaccount/autopay`,
    paymentLink: "👇 Toque abaixo para completar sua assinatura com segurança via PayPal:",
    paymentSuccess: "🎉 <b>Bem-vindo ao Asanai Pro!</b>\n\nSua assinatura mensal está ativa.\n\n✅ Todas as aulas desbloqueadas\n✅ Planos IA ilimitados\n✅ Programas completos disponíveis\n\nVamos praticar! 🧘",
    paymentError: "⚠️ Não foi possível gerar o link de pagamento. Tente novamente em instantes.",
    goals: { relax: "😌 Alongar e relaxar", energize: "⚡ Energizar", backpain: "🦴 Dor nas costas", sleep: "🌙 Dormir melhor", core: "💪 Força do core", flexible: "🤸 Flexibilidade" },
    btn: {
      plan: "🧘 Meu plano de yoga", classes: "📚 Aulas", streak: "🔥 Minha sequência",
      goPro: "⭐ Ir para Pro — $7.99/mês", proActive: "⭐ Pro ativo ✅",
      lang: "🌐 Idioma", upgrade: "⭐ Assinar via PayPal",
      back: "← Voltar", home: "← Início", allClasses: "← Todas as aulas",
      done: "✅ Marcar como concluído", newSession: "🧘 Iniciar sessão",
      diffGoal: "🔄 Outro objetivo", changeLang: "Escolha seu idioma:",
    },
    streakLabel: (s, sess) => `\n\n🔥 Sequência: <b>${s} dias</b> · Sessões: <b>${sess}</b>`,
    planLabel: "Seu plano",
  },
};

function tx(user) { return T[user.lang || "en"]; }

// ---------------------------------------------------------------------------
// Telegram helpers
// ---------------------------------------------------------------------------
async function callTelegram(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chatId, text, extra = {}) {
  return callTelegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

async function editMessage(chatId, msgId, text, extra = {}) {
  return callTelegram("editMessageText", { chat_id: chatId, message_id: msgId, text, parse_mode: "HTML", ...extra });
}

// ---------------------------------------------------------------------------
// Keyboards
// ---------------------------------------------------------------------------
function mainMenu(user) {
  const t = tx(user);
  const pro = isProActive(user);
  return {
    inline_keyboard: [
      [{ text: t.btn.plan, callback_data: "menu_plan" }, { text: t.btn.classes, callback_data: "menu_classes" }],
      [{ text: t.btn.streak, callback_data: "menu_streak" }, { text: pro ? t.btn.proActive : t.btn.goPro, callback_data: pro ? "menu_profile" : "menu_upgrade" }],
      [{ text: t.btn.lang, callback_data: "menu_lang" }],
    ],
  };
}

function goalMenu(user) {
  const t = tx(user);
  return {
    inline_keyboard: [
      [{ text: t.goals.relax, callback_data: "plan_relax" }, { text: t.goals.energize, callback_data: "plan_energize" }],
      [{ text: t.goals.backpain, callback_data: "plan_backpain" }, { text: t.goals.sleep, callback_data: "plan_sleep" }],
      [{ text: t.goals.core, callback_data: "plan_core" }, { text: t.goals.flexible, callback_data: "plan_flexible" }],
      [{ text: t.btn.back, callback_data: "back_main" }],
    ],
  };
}

function classesMenu(user) {
  const pro = isProActive(user);
  const t = tx(user);
  const lock = pro ? "" : " 🔒";
  return {
    inline_keyboard: [
      [{ text: "☀️ Sun Salutation — 25 min", callback_data: "class_sun" }],
      [{ text: "🧠 Guided Meditation — 15 min", callback_data: "class_med" }],
      [{ text: "💨 Pranayama Breathing — 20 min", callback_data: "class_breath" }],
      [{ text: `🔥 Power Vinyasa — 45 min${lock}`, callback_data: pro ? "class_vinyasa" : "class_locked" }],
      [{ text: `🌙 Sleep Yoga Nidra — 30 min${lock}`, callback_data: pro ? "class_nidra" : "class_locked" }],
      [{ text: `❤️ Yin & Restore — 60 min${lock}`, callback_data: pro ? "class_yin" : "class_locked" }],
      [{ text: t.btn.back, callback_data: "back_main" }],
    ],
  };
}

function langMenu() {
  return {
    inline_keyboard: [
      [{ text: "🇺🇸 English", callback_data: "lang_en" }],
      [{ text: "🇪🇸 Español", callback_data: "lang_es" }],
      [{ text: "🇧🇷 Português", callback_data: "lang_pt" }],
    ],
  };
}

// ---------------------------------------------------------------------------
// Class content
// ---------------------------------------------------------------------------
function getClassInfo(key, lang) {
  const data = {
    en: {
      class_sun: { title: "☀️ Sun Salutation Flow", body: `<b>25 min · Beginner · Free</b>\n\nA classic energizing sequence linking breath with movement.\n\n<b>Sequence:</b>\nMountain → Forward fold → Plank → Cobra → Downward dog → Warrior I\n\n💡 <i>Move slowly, let your breath lead.</i>` },
      class_med: { title: "🧠 Guided Meditation", body: `<b>15 min · All levels · Free</b>\n\nA calming body-scan meditation.\n\n<b>Sequence:</b>\nBreath awareness → Body scan → Visualization → Return\n\n💡 <i>Let thoughts pass like clouds.</i>` },
      class_breath: { title: "💨 Pranayama Breathing", body: `<b>20 min · Beginner · Free</b>\n\nFoundational yoga breathing techniques.\n\n<b>Sequence:</b>\nNadi Shodhana → Ujjayi → Box breathing → Kapalabhati\n\n💡 <i>Never force the breath.</i>` },
      class_vinyasa: { title: "🔥 Power Vinyasa", body: `<b>45 min · Intermediate · Pro</b>\n\nDynamic heat-building flow.\n\n<b>Sequence:</b>\nWarm-up → Standing → Arm balances → Core → Cool down\n\n💡 <i>Modify any pose — your edge is perfect.</i>` },
      class_nidra: { title: "🌙 Sleep Yoga Nidra", body: `<b>30 min · All levels · Pro</b>\n\nGuided sleep-based meditation.\n\n<b>Sequence:</b>\nBody scan → Breath → Visualization → Deep rest\n\n💡 <i>Let yourself fall asleep — that's the goal.</i>` },
      class_yin: { title: "❤️ Yin & Restore", body: `<b>60 min · All levels · Pro</b>\n\nLong-held poses for deep connective tissue.\n\n<b>Sequence:</b>\nButterfly → Dragon → Swan → Twist → Savasana\n\n💡 <i>Hold 3–5 min each. Surrender.</i>` },
    },
    es: {
      class_sun: { title: "☀️ Flujo Saludos al Sol", body: `<b>25 min · Principiante · Gratis</b>\n\nSecuencia clásica que une respiración y movimiento.\n\n<b>Secuencia:</b>\nMontaña → Flexión → Plancha → Cobra → Perro boca abajo → Guerrero I\n\n💡 <i>Muévete despacio, deja que tu respiración guíe.</i>` },
      class_med: { title: "🧠 Meditación Guiada", body: `<b>15 min · Todos los niveles · Gratis</b>\n\nMeditación de escaneo corporal.\n\n<b>Secuencia:</b>\nConciencia → Escaneo → Visualización → Retorno\n\n💡 <i>Deja que los pensamientos pasen como nubes.</i>` },
      class_breath: { title: "💨 Respiración Pranayama", body: `<b>20 min · Principiante · Gratis</b>\n\nTécnicas fundamentales de respiración.\n\n<b>Secuencia:</b>\nNadi Shodhana → Ujjayi → Cuadrada → Kapalabhati\n\n💡 <i>Nunca fuerces la respiración.</i>` },
      class_vinyasa: { title: "🔥 Vinyasa de Poder", body: `<b>45 min · Intermedio · Pro</b>\n\nFlujo dinámico que genera calor.\n\n<b>Secuencia:</b>\nCalentamiento → De pie → Equilibrios → Núcleo → Enfriamiento\n\n💡 <i>Modifica cualquier postura.</i>` },
      class_nidra: { title: "🌙 Yoga Nidra para Dormir", body: `<b>30 min · Todos · Pro</b>\n\nMeditación guiada basada en el sueño.\n\n<b>Secuencia:</b>\nEscaneo → Respiración → Visualización → Descanso\n\n💡 <i>Déjate quedar dormido — ese es el objetivo.</i>` },
      class_yin: { title: "❤️ Yin y Restauración", body: `<b>60 min · Todos · Pro</b>\n\nPosturas pasivas largas para tejido profundo.\n\n<b>Secuencia:</b>\nMariposa → Dragón → Cisne → Torsión → Savasana\n\n💡 <i>Mantén 3–5 min cada una. Ríndete.</i>` },
    },
    pt: {
      class_sun: { title: "☀️ Fluxo Saudação ao Sol", body: `<b>25 min · Iniciante · Grátis</b>\n\nSequência clássica unindo respiração e movimento.\n\n<b>Sequência:</b>\nMontanha → Flexão → Prancha → Cobra → Cão voltado → Guerreiro I\n\n💡 <i>Mova-se devagar, deixe sua respiração guiar.</i>` },
      class_med: { title: "🧠 Meditação Guiada", body: `<b>15 min · Todos os níveis · Grátis</b>\n\nMeditação de varredura corporal.\n\n<b>Sequência:</b>\nConsciência → Varredura → Visualização → Retorno\n\n💡 <i>Deixe os pensamentos passarem como nuvens.</i>` },
      class_breath: { title: "💨 Respiração Pranayama", body: `<b>20 min · Iniciante · Grátis</b>\n\nTécnicas fundamentais de respiração do yoga.\n\n<b>Sequência:</b>\nNadi Shodhana → Ujjayi → Respiração quadrada → Kapalabhati\n\n💡 <i>Nunca force a respiração.</i>` },
      class_vinyasa: { title: "🔥 Vinyasa de Poder", body: `<b>45 min · Intermediário · Pro</b>\n\nFluxo dinâmico que gera calor.\n\n<b>Sequência:</b>\nAquecimento → Em pé → Equilíbrios → Core → Resfriamento\n\n💡 <i>Modifique qualquer postura.</i>` },
      class_nidra: { title: "🌙 Yoga Nidra para Dormir", body: `<b>30 min · Todos · Pro</b>\n\nMeditação guiada baseada no sono.\n\n<b>Sequência:</b>\nVarredura → Respiração → Visualização → Descanso\n\n💡 <i>Deixe-se adormecer — esse é o objetivo.</i>` },
      class_yin: { title: "❤️ Yin & Restauração", body: `<b>60 min · Todos · Pro</b>\n\nPosturas passivas longas para tecido conjuntivo.\n\n<b>Sequência:</b>\nBorboleta → Dragão → Cisne → Torção → Savasana\n\n💡 <i>Mantenha 3–5 min cada. Entregue-se.</i>` },
    },
  };
  return data[lang || "en"][key];
}

// ---------------------------------------------------------------------------
// AI plan generator
// ---------------------------------------------------------------------------
async function generateYogaPlan(goal, lang) {
  const goals = {
    relax: { en: "gentle stretching and relaxation", es: "estiramiento suave y relajación", pt: "alongamento suave e relaxamento" },
    energize: { en: "energizing morning flow", es: "flujo matutino energizante", pt: "fluxo matinal energizante" },
    backpain: { en: "lower back pain relief", es: "alivio del dolor de espalda", pt: "alívio da dor lombar" },
    sleep: { en: "bedtime wind-down and sleep", es: "relajación nocturna para dormir", pt: "relaxamento noturno para dormir" },
    core: { en: "core strength and stability", es: "fuerza y estabilidad del núcleo", pt: "força e estabilidade do core" },
    flexible: { en: "deep flexibility and hip opening", es: "flexibilidad profunda y caderas", pt: "flexibilidade profunda e quadril" },
  };

  const focus = goals[goal]?.[lang] || goals.relax.en;

  const prompts = {
    en: `You are Asanai Yoga, an AI yoga coach for complete beginners. Create a yoga session for: ${focus}. Level: beginner.\n\nVERY IMPORTANT: For each pose, write a simple 1-sentence how-to in plain language that someone who has NEVER done yoga can follow. No jargon. Describe the body position clearly.\n\nFormat exactly:\nTITLE: [session name]\nDURATION: [X min]\nDESCRIPTION: [2 warm encouraging sentences]\nPOSES:\n1. [Pose name] — [duration] — [How to do it: simple plain English body position description] — [main benefit]\n2. [Pose name] — [duration] — [How to do it: simple plain English body position description] — [main benefit]\n3. [Pose name] — [duration] — [How to do it: simple plain English body position description] — [main benefit]\n4. [Pose name] — [duration] — [How to do it: simple plain English body position description] — [main benefit]\n5. [Pose name] — [duration] — [How to do it: simple plain English body position description] — [main benefit]\nTIP: [one simple beginner tip]\n\nExample of good pose format:\n1. Child's Pose — 2 min — Kneel on the floor, sit back on your heels, stretch your arms forward on the ground and rest your forehead down — releases back tension\n\nNo markdown, plain text only.`,
    es: `Eres Asanai Yoga, coach de yoga con IA para principiantes absolutos. Crea una sesión para: ${focus}. Nivel: principiante.\n\nMUY IMPORTANTE: Para cada postura, escribe una instrucción simple de 1 oración en lenguaje sencillo que alguien que NUNCA ha hecho yoga pueda seguir. Sin jerga. Describe la posición del cuerpo claramente.\n\nFormato exacto:\nTITULO: [nombre de sesión]\nDURACION: [X min]\nDESCRIPCION: [2 oraciones cálidas y alentadoras]\nPOSTURAS:\n1. [Nombre] — [duración] — [Cómo hacerlo: descripción simple de la posición del cuerpo] — [beneficio principal]\n2. [Nombre] — [duración] — [Cómo hacerlo: descripción simple de la posición del cuerpo] — [beneficio principal]\n3. [Nombre] — [duración] — [Cómo hacerlo: descripción simple de la posición del cuerpo] — [beneficio principal]\n4. [Nombre] — [duración] — [Cómo hacerlo: descripción simple de la posición del cuerpo] — [beneficio principal]\n5. [Nombre] — [duración] — [Cómo hacerlo: descripción simple de la posición del cuerpo] — [beneficio principal]\nCONSEJO: [un consejo simple para principiantes]\n\nEjemplo de formato correcto:\n1. Postura del Niño — 2 min — Arrodíllate, siéntate sobre los talones, estira los brazos hacia adelante en el suelo y apoya la frente — libera tensión de la espalda\n\nSin markdown, solo texto plano.`,
    pt: `Você é Asanai Yoga, coach de yoga com IA para iniciantes absolutos. Crie uma sessão para: ${focus}. Nível: iniciante.\n\nMUITO IMPORTANTE: Para cada postura, escreva uma instrução simples de 1 frase em linguagem simples que alguém que NUNCA fez yoga possa seguir. Sem jargão. Descreva a posição do corpo claramente.\n\nFormato exato:\nTITULO: [nome da sessão]\nDURACАО: [X min]\nDESCRICAO: [2 frases calorosas e encorajadoras]\nPOSTURAS:\n1. [Nome] — [duração] — [Como fazer: descrição simples da posição do corpo] — [benefício principal]\n2. [Nome] — [duração] — [Como fazer: descrição simples da posição do corpo] — [benefício principal]\n3. [Nome] — [duração] — [Como fazer: descrição simples da posição do corpo] — [benefício principal]\n4. [Nome] — [duração] — [Como fazer: descrição simples da posição do corpo] — [benefício principal]\n5. [Nome] — [duração] — [Como fazer: descrição simples da posição do corpo] — [benefício principal]\nDICA: [uma dica simples para iniciantes]\n\nExemplo de formato correto:\n1. Postura da Criança — 2 min — Ajoelhe-se, sente-se sobre os calcanhares, estique os braços para frente no chão e apoie a testa — libera tensão nas costas\n\nSem markdown, apenas texto simples.`,
  };

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-6", max_tokens: 1000,
    messages: [{ role: "user", content: prompts[lang] || prompts.en }],
  });
  return msg.content[0].text;
}

function formatPlan(raw, lang) {
  const keys = {
    en: ["TITLE:", "DURATION:", "DESCRIPTION:", "POSES:", "TIP:", "Your poses:", "Your Asanai Session"],
    es: ["TITULO:", "DURACION:", "DESCRIPCION:", "POSTURAS:", "CONSEJO:", "Tus posturas:", "Tu Sesión Asanai"],
    pt: ["TITULO:", "DURACAO:", "DESCRICAO:", "POSTURAS:", "DICA:", "Suas posturas:", "Sua Sessão Asanai"],
  };
  const k = keys[lang] || keys.en;
  const lines = raw.split("\n").filter(l => l.trim());
  let out = `🧘 <b>${k[6]}</b>\n\n`;
  for (const line of lines) {
    if (line.startsWith(k[0])) out += `<b>${line.replace(k[0], "").trim()}</b>\n`;
    else if (line.startsWith(k[1])) out += `⏱ ${line.replace(k[1], "").trim()}\n\n`;
    else if (line.startsWith(k[2])) out += `${line.replace(k[2], "").trim()}\n\n`;
    else if (line.startsWith(k[3])) out += `<b>${k[5]}</b>\n`;
    else if (/^\d\./.test(line)) out += `${line}\n`;
    else if (line.startsWith(k[4])) out += `\n💡 <i>${line.replace(k[4], "").trim()}</i>`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main handlers
// ---------------------------------------------------------------------------
async function handleStart(chatId, firstName) {
  const user = getUser(chatId);
  if (!user.lang) {
    await sendMessage(chatId, `🌐 <b>Welcome to Asanai!</b>\nBienvenido · Bem-vindo\n\nChoose your language / Elige tu idioma / Escolha seu idioma:`, { reply_markup: langMenu() });
    return;
  }
  await sendMessage(chatId, tx(user).welcome(firstName || "friend"), { reply_markup: mainMenu(user) });
}

async function handleCallback(query) {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;
  const user = getUser(chatId);
  const pro = isProActive(user);
  const t = tx(user);

  await callTelegram("answerCallbackQuery", { callback_query_id: query.id });

  // Language
  if (data === "menu_lang") {
    await editMessage(chatId, msgId, t.btn.changeLang, { reply_markup: langMenu() });
    return;
  }
  if (["lang_en", "lang_es", "lang_pt"].includes(data)) {
    user.lang = data.replace("lang_", "");
    const name = query.from?.first_name || "friend";
    await editMessage(chatId, msgId, tx(user).welcome(name), { reply_markup: mainMenu(user) });
    return;
  }

  // Main nav
  if (data === "back_main") {
    const txt = { en: "What would you like to do today?", es: "¿Qué te gustaría hacer hoy?", pt: "O que você gostaria de fazer hoje?" };
    await editMessage(chatId, msgId, txt[user.lang] || txt.en, { reply_markup: mainMenu(user) });
    return;
  }

  if (data === "menu_plan") {
    await editMessage(chatId, msgId, t.chooseGoal, { reply_markup: goalMenu(user) });
    return;
  }

  if (data.startsWith("plan_")) {
    const goal = data.replace("plan_", "");
    await editMessage(chatId, msgId, t.generating);
    try {
      const raw = await generateYogaPlan(goal, user.lang);
      const formatted = formatPlan(raw, user.lang);
      updateStreak(user);
      await editMessage(chatId, msgId, formatted + t.streakLabel(user.streak, user.sessions), {
        reply_markup: { inline_keyboard: [[{ text: t.btn.diffGoal, callback_data: "menu_plan" }], [{ text: t.btn.home, callback_data: "back_main" }]] },
      });
    } catch {
      await editMessage(chatId, msgId, t.error, { reply_markup: { inline_keyboard: [[{ text: t.btn.back, callback_data: "menu_plan" }]] } });
    }
    return;
  }

  if (data === "menu_classes") {
    await editMessage(chatId, msgId, pro ? t.classesTextPro : t.classesTextFree, { reply_markup: classesMenu(user) });
    return;
  }

  if (data.startsWith("class_") && data !== "class_locked") {
    const info = getClassInfo(data, user.lang);
    if (info) {
      await editMessage(chatId, msgId, `<b>${info.title}</b>\n\n${info.body}`, {
        reply_markup: { inline_keyboard: [[{ text: t.btn.done, callback_data: "class_done" }], [{ text: t.btn.allClasses, callback_data: "menu_classes" }]] },
      });
    }
    return;
  }

  if (data === "class_done") {
    updateStreak(user);
    await editMessage(chatId, msgId, t.sessionDone(user.streak, user.sessions), { reply_markup: { inline_keyboard: [[{ text: t.btn.home, callback_data: "back_main" }]] } });
    return;
  }

  if (data === "class_locked") {
    await editMessage(chatId, msgId, t.classLocked, {
      reply_markup: { inline_keyboard: [[{ text: t.btn.goPro, callback_data: "menu_upgrade" }], [{ text: t.btn.allClasses, callback_data: "menu_classes" }]] },
    });
    return;
  }

  if (data === "menu_streak") {
    await editMessage(chatId, msgId, t.streakMsg(user, pro), {
      reply_markup: { inline_keyboard: [[{ text: t.btn.newSession, callback_data: "menu_plan" }], [{ text: t.btn.home, callback_data: "back_main" }]] },
    });
    return;
  }

  if (data === "menu_upgrade") {
    await editMessage(chatId, msgId, t.upgradeText, {
      reply_markup: { inline_keyboard: [[{ text: t.btn.upgrade, callback_data: "do_upgrade" }], [{ text: t.btn.back, callback_data: "back_main" }]] },
    });
    return;
  }

  if (data === "do_upgrade") {
    const link = await createPayPalSubscriptionLink(chatId, user.lang);
    if (link) {
      await editMessage(chatId, msgId, t.paymentLink, {
        reply_markup: { inline_keyboard: [[{ text: "💳 PayPal — $7.99/month", url: link }], [{ text: t.btn.back, callback_data: "back_main" }]] },
      });
    } else {
      await editMessage(chatId, msgId, t.paymentError, { reply_markup: { inline_keyboard: [[{ text: t.btn.back, callback_data: "back_main" }]] } });
    }
    return;
  }

  if (data === "menu_profile") {
    await editMessage(chatId, msgId, t.proActive(new Date(user.proExpiry).toLocaleDateString()), { reply_markup: { inline_keyboard: [[{ text: t.btn.home, callback_data: "back_main" }]] } });
    return;
  }
}

// ---------------------------------------------------------------------------
// Vercel handler
// ---------------------------------------------------------------------------
module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const { action, user: userId } = req.query;
    if (action === "paypal_success" && userId) {
      const user = getUser(parseInt(userId));
      user.isPro = true;
      user.proExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await sendMessage(parseInt(userId), tx(user).paymentSuccess, { reply_markup: mainMenu(user) });
      return res.status(200).send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>🎉 Payment successful!</h2><p>Return to Telegram to enjoy Asanai Pro.</p></body></html>`);
    }
    if (action === "paypal_cancel" && userId) {
      return res.status(200).send(`<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>Payment cancelled</h2><p>Return to Telegram and try again anytime.</p></body></html>`);
    }
    return res.status(200).json({ ok: true, app: "Asanai", status: "running" });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const update = req.body;
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const text = msg.text || "";
      const firstName = msg.from?.first_name;
      const user = getUser(chatId);
      const t = tx(user);

      if (text === "/start") await handleStart(chatId, firstName);
      else if (text === "/lang") await sendMessage(chatId, t.btn.changeLang, { reply_markup: langMenu() });
      else if (text === "/plan") await sendMessage(chatId, t.chooseGoal, { reply_markup: goalMenu(user) });
      else if (text === "/classes") await sendMessage(chatId, isProActive(user) ? t.classesTextPro : t.classesTextFree, { reply_markup: classesMenu(user) });
      else if (text === "/streak") await sendMessage(chatId, t.streakMsg(user, isProActive(user)));
      else if (text === "/upgrade") await sendMessage(chatId, t.upgradeText, { reply_markup: { inline_keyboard: [[{ text: t.btn.upgrade, callback_data: "do_upgrade" }]] } });
      else if (text === "/help") {
        const help = { en: "/start — main menu\n/plan — yoga plan\n/classes — browse classes\n/streak — your progress\n/upgrade — go Pro\n/lang — change language", es: "/start — menú principal\n/plan — plan de yoga\n/classes — clases\n/streak — tu progreso\n/upgrade — ir a Pro\n/lang — cambiar idioma", pt: "/start — menu principal\n/plan — plano de yoga\n/classes — aulas\n/streak — seu progresso\n/upgrade — ir para Pro\n/lang — mudar idioma" };
        await sendMessage(chatId, help[user.lang] || help.en);
      }
      else await handleStart(chatId, firstName);
    }
    if (update.callback_query) await handleCallback(update.callback_query);
    if (update.pre_checkout_query) await callTelegram("answerPreCheckoutQuery", { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(200).json({ ok: true });
  }
};
