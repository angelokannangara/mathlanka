# MathLanka

Static site (HTML + Tailwind CDN) on Firebase Hosting, with Firebase Auth + Firestore for student accounts and scores.

## Structure
- `index.html` – home page · `learn.html` – choose medium · `login.html` – login / sign up / guest
- `dashboard.html` – student dashboard (XP, streak, progress, skills, badges, history)
- `practice.html` – topic practice and 60-second Speed Math
- `assets/ml.js` – everything shared: auth + storage (Firebase, with local fallback), quiz engine, question generators
- `English Medium/`, `Sinhala Medium/` – lessons (Grades 1–5). Every lesson page loads `assets/ml.js`, which adds the quiz card automatically.
- `tools_fix_pages.py` – the repair script used on the legacy lessons (idempotent; run `python3 tools_fix_pages.py` after adding pages)

## Deploy
1. Firebase console → Authentication → enable **Email/Password** and **Google**; add your domain under Authorized domains.
2. `firebase deploy --only firestore:rules,hosting`
   (the GitHub Action deploys hosting only – rules must be deployed with the CLI).

## Data model
`users/{uid}` → `{name, grade, medium}`; `users/{uid}/attempts/{id}` → `{kind, key, topic, grade, lesson, medium, score, total, pct, secs, ts}`.
Attempts are append-only and only readable by their owner (see `firestore.rules`).

## Adding a lesson
Create `Grade{n}/grade{n}_lesson{k}.html` (copy any existing lesson), add its card to `grade{n}.html`, and update the lesson count in `ML.lessons` (`assets/ml.js`).
The quiz topic is chosen from the lesson's `<h1>` title (see `RULES` in `ml.js`). A title like "Numbers up to 500" also sets the number range.

## Known gaps
- Sinhala Medium lesson text is mostly untranslated English.
- Quizzes are generated per topic, not hand-written per lesson.
- The chatbot in `index.html` has an API key in client code – rotate it and move the call to a backend.
