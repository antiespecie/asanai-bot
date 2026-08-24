# Asanai — AI Yoga & Wellness Telegram Bot

Your AI-powered yoga companion, right inside Telegram.

## Features

- AI-generated personalized yoga plans (powered by Claude)
- 6 guided classes (3 free, 3 Pro)
- Daily streak tracking
- Weekly Pro membership via Telegram Stars (299 Stars/week)
- Full inline keyboard UI — no external app needed

## Setup

### 1. Environment variables (set in Vercel dashboard)

```
BOT_TOKEN=your_botfather_token
ANTHROPIC_API_KEY=your_anthropic_key
```

### 2. Deploy to Vercel

Push this repo to GitHub and connect to Vercel. It auto-deploys on every push.

### 3. Register the webhook

After deploying, open this URL in your browser (replace YOUR_TOKEN):

```
https://api.telegram.org/botYOUR_TOKEN/setWebhook?url=https://asanai-bot.vercel.app/api/webhook
```

You should see: `{"ok":true,"result":true}`

### 4. Enable Stars payments

In BotFather: `/mybots` → AsanaiBot → Payments → Telegram Stars → Enable

### 5. Set bot commands

In BotFather: `/setcommands` → paste this:

```
start - Open Asanai
plan - Get your yoga plan
classes - Browse all classes
streak - See your progress
upgrade - Go Pro
help - Help
```

## Bot commands

| Command | Description |
|---------|-------------|
| /start | Main menu |
| /plan | AI yoga plan generator |
| /classes | Browse classes |
| /streak | Progress tracker |
| /upgrade | Pro membership |
| /help | Command list |

## Monetization

- Free tier: 3 classes, streak tracking
- Pro tier: 299 Stars/week (~$7.99) — unlimited everything + AI coaching
- Telegram takes 30% of Stars revenue

## Tech stack

- Node.js (Vercel serverless functions)
- Telegram Bot API
- Anthropic Claude API (claude-sonnet-4-6)
- Vercel hosting (free tier)
