# Recorder prototype — README

This is the first real, working piece of the Express Your Surf app: the
video review/recording tool Amit asked for. Everything here actually works —
this is not a mockup like V0 was.

## What it does

1. Load any video from your computer (stand-in for a customer's uploaded clip).
2. Play it, slow it down (0.25x / 0.5x / 1x), or step frame by frame.
3. Draw on top of it — pen, line, arrow, circle — while it plays or is paused.
4. Press "Start recording feedback" — it records the video, your drawings,
   and your microphone into one file, live, exactly as you'd talk through it
   with a student.
5. Press stop, preview the result, download it.

## What's NOT here yet (on purpose)

- No login, no accounts
- No saving to a server — the recorded file only exists in your browser
  until you download it
- No connection to Cloudflare Stream, Stripe, or Supabase yet
- No customer flow, no submission queue, no admin

This one page proves the hardest technical piece works before we build
the rest of the app around it.

## How to run it yourself (no coding needed)

You'll need Node.js installed (the free, "LTS" version, from nodejs.org).
Then, in a terminal, inside this folder:

```
npm install
npm run dev
```

Open the link it gives you (usually http://localhost:3000) in Chrome.

## How to test it properly

- Use Chrome on a laptop (this uses browser APIs that are unreliable in
  Safari, and awkward on touch devices without a stylus).
- Allow microphone access when the browser asks.
- Try drawing with a mouse first -- if tracing a precise line feels clumsy,
  that's normal; a cheap USB drawing tablet (~$60) fixes this and is a
  known, expected upgrade, not a bug.

## Sharing this with Amit before it's on a real domain

The easiest way to get Amit testing this without him touching a terminal:
deploy it to Vercel's free tier (a few clicks, no payment needed) and send
him the link. Ask Claude when you're ready and it'll walk you through that
step by step.
