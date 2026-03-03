const phraseTaxonomy = {
  cultureFluff: {
    weight: 8,
    cap: 8,
    phrases: [
      "fast-paced environment",
      "dynamic team",
      "growth-oriented company",
      "exciting opportunity",
      "industry-leading"
    ]
  },
  personalityOveremphasis: {
    weight: 14,
    cap: 14,
    phrases: [
      "self-starter",
      "go-getter",
      "highly motivated",
      "team player",
      "strong communication skills",
      "detail-oriented"
    ]
  },
  responsibilityBlur: {
    weight: 22,
    cap: 22,
    phrases: [
      "various responsibilities",
      "assist as needed",
      "other duties as assigned",
      "support initiatives",
      "contribute to efforts"
    ]
  },
  evergreenPipeline: {
    weight: 28,
    cap: 28,
    phrases: [
      "always hiring",
      "continuous hiring",
      "talent pipeline",
      "future opportunities",
      "anticipated growth",
      "general application"
    ]
  },
  commitmentSignals: {
    weight: -26,
    cap: -26,
    phrases: [
      "reports to",
      "base salary range",
      "compensation range",
      "within 90 days",
      "quarterly target",
      "hiring for q2 launch",
      "replacing a departing employee"
    ]
  }
};

const structuralWeights = {
  postingAge: 24,
  repostFrequency: 16,
  salaryPresence: 10,
  multiLocation: 10,
  experienceMatch: 12,
  skillOverload: 10,
  specificityGap: 18
};

const techTerms = [
  "javascript",
  "typescript",
  "python",
  "java",
  "react",
  "angular",
  "vue",
  "aws",
  "azure",
  "gcp",
  "docker",
  "kubernetes",
  "sql",
  "nosql",
  "terraform",
  "node",
  "go",
  "rust",
  "c#",
  "php"
];

const form = document.getElementById("risk-form");
const resultsSection = document.getElementById("results");
const scoreElement = document.getElementById("score");
const bandElement = document.getElementById("band");
const reasonsElement = document.getElementById("reasons");

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const description = document.getElementById("description").value.trim().toLowerCase();
  const words = description.split(/\s+/).filter(Boolean);
  const wordCount = words.length || 1;

  let risk = 0;
  const reasons = [];

  const postingAge = Number(document.getElementById("posting-age").value);
  const repostFrequency = Number(document.getElementById("repost-frequency").value);
  const salaryPresence = Number(document.getElementById("salary-presence").value);
  const multiLocation = Number(document.getElementById("multi-location").value);
  const experienceMatch = Number(document.getElementById("experience-match").value);

  risk += postingAge + repostFrequency + salaryPresence + multiLocation + experienceMatch;

  if (postingAge >= 16) reasons.push("Older posting age suggests lower hiring urgency.");
  if (repostFrequency >= 16) reasons.push("Multiple reposts can indicate low-priority backfill or pipeline behavior.");
  if (salaryPresence > 0) reasons.push("No salary range provided, reducing transparency.");
  if (multiLocation >= 10) reasons.push("High multi-location duplication may signal broad evergreen distribution.");
  if (experienceMatch >= 12) reasons.push("Strong title/experience mismatch can indicate weak listing precision.");

  const techMatches = techTerms.filter((term) => description.includes(term)).length;
  const skillOverloadDensity = techMatches / Math.max(1, wordCount / 120);
  if (skillOverloadDensity > 10) {
    risk += structuralWeights.skillOverload;
    reasons.push("High technology stack density suggests possible skill overload.");
  }

  const hasDeliverables = /(kpi|okr|deadline|deliverable|target|reports to|within \d+ days)/.test(description);
  const hasBlurPhrases = /(other duties as assigned|assist as needed|various responsibilities|support initiatives|contribute to efforts)/.test(description);
  if (hasBlurPhrases && !hasDeliverables) {
    risk += structuralWeights.specificityGap;
    reasons.push("Responsibilities are broad without measurable outcomes or reporting structure.");
  }

  for (const [category, config] of Object.entries(phraseTaxonomy)) {
    const hits = config.phrases.reduce((sum, phrase) => sum + (description.includes(phrase) ? 1 : 0), 0);
    if (hits === 0) continue;

    const density = hits / Math.max(1, wordCount / 200);
    const normalized = Math.min(1, density / 3);
    const categoryScore = config.weight * normalized;
    const capped = config.weight > 0
      ? Math.min(categoryScore, config.cap)
      : Math.max(categoryScore, config.cap);

    risk += capped;

    const messageMap = {
      cultureFluff: "Heavy culture-fluff language contributes slight additional risk.",
      personalityOveremphasis: "High density of personality-fit language adds moderate risk.",
      responsibilityBlur: "Blurred responsibilities increase uncertainty about active role scope.",
      evergreenPipeline: "Evergreen or pipeline wording strongly increases low-priority risk.",
      commitmentSignals: "Concrete commitment signals lower risk."
    };

    reasons.push(messageMap[category]);
  }

  risk = Math.max(0, Math.min(100, Math.round(risk)));

  const { label, className } = getRiskBand(risk);
  scoreElement.textContent = `${risk}/100`;
  scoreElement.className = `score ${className}`;
  bandElement.textContent = label;

  reasonsElement.innerHTML = "";
  (reasons.length ? reasons : ["No major risk indicators found from the provided inputs."]).forEach((reason) => {
    const li = document.createElement("li");
    li.textContent = reason;
    reasonsElement.appendChild(li);
  });

  resultsSection.hidden = false;
});

function getRiskBand(score) {
  if (score < 34) {
    return {
      label: "Lower listing engagement risk — reasonable to invest normal application effort.",
      className: "risk-low"
    };
  }

  if (score < 67) {
    return {
      label: "Moderate listing engagement risk — apply selectively and timebox effort.",
      className: "risk-medium"
    };
  }

  return {
    label: "Higher listing engagement risk — consider minimal-effort application strategy.",
    className: "risk-high"
  };
}
