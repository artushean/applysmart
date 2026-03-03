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


## ESCO-based skill dictionary

The skill matcher now uses an ESCO-based dictionary rather than a hard-coded synonym map.

- Runtime dictionary file: `data/esco-skill-dictionary.json`
- Builder script: `scripts/build-esco-skill-dictionary.mjs`

To regenerate from an ESCO skills JSON download:

```bash
node scripts/build-esco-skill-dictionary.mjs --source-file /path/to/esco-skills.json
```

The builder extracts only:

- `preferredLabel.en` as canonical skill names
- `alternativeLabel.en` as skill variations/synonyms

It then normalizes all terms (lowercase, punctuation removal, space collapsing) and writes both:

- `canonicalToVariations`
- `variationToCanonical` (optimized lookup map)

## Minimal Python Fit Scoring backend

A small backend implementation now exists under `app/`:

- `app/main.py` - tiny HTTP server with `POST /score`
- `app/scoring.py` - deterministic weighted scoring logic
- `app/clusters.py` - small skill cluster adjacency map

Install dependencies:

```bash
pip install -r app/requirements.txt
python -m spacy download en_core_web_sm
```

Run the backend:

```bash
python app/main.py
```

Request payload example:

```json
{
  "job_description": "Develop automation using Python and Playwright",
  "resume_text": "Built automation testing frameworks in Python"
}
```
