# Listing Engagement Risk Analyzer (MVP)

A free public, privacy-first tool to help job seekers decide how much time to invest in an application.

## Positioning

This is **not** a ghost/fake job detector. It is a **Listing Engagement Risk Analyzer**.

- It estimates probability using listing patterns.
- It does **not** determine employer intent.
- It does **not** collect company names.
- It does **not** scrape job boards.

## MVP model

1. User pastes a job description.
2. User answers quick structural questions:
   - posting age
   - repost frequency
   - salary presence
   - multi-location duplication
   - experience/title alignment
3. Tool computes a rule-based risk score from:
   - structural signals (weighted highest)
   - phrase taxonomy (density-based + category caps)
   - commitment signals (subtract risk)

## Phrase taxonomy categories

- Culture fluff (low weight)
- Personality overemphasis (moderate)
- Responsibility blur (strong)
- Evergreen/pipeline language (highest)
- Commitment signals (risk-reducing)

## Local run

Open `index.html` directly, or run:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Set source to **Deploy from a branch**.
4. Pick branch `main` (or your default branch) and folder `/ (root)`.
5. Save and wait for deployment URL.
