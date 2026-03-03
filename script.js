const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ["pdf", "docx"];
const PDF_WORKER_SRC = "https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
const ESCO_SKILL_DICTIONARY_URL = "data/esco-skill-dictionary.json";

const SKILL_NORMALIZATION_MAP = {
  "react.js": "react",
  "reactjs": "react",
  "node.js": "nodejs",
  "node js": "nodejs",
  "ms excel": "excel",
  "microsoft excel": "excel",
  "google analytics 4": "google analytics",
  "ga4": "google analytics",
  "c sharp": "c#",
  "power bi": "powerbi",
  "a b testing": "a/b testing"
};

const capabilityDomains = {
  analytical: ["excel", "sql", "python", "tableau", "powerbi", "forecasting", "financial modeling", "reporting"],
  technical: ["javascript", "react", "nodejs", "java", "c#", "aws", "docker", "devops"],
  marketing: ["seo", "sem", "google ads", "email marketing", "crm", "a/b testing", "content strategy"],
  sales: ["salesforce", "lead generation", "account management", "pipeline management", "b2b sales"],
  finance: ["gaap", "budgeting", "audit", "tax compliance", "sap", "quickbooks"],
  operations: ["logistics", "inventory management", "procurement", "lean", "six sigma", "erp"],
  project_management: ["agile", "scrum", "pmp", "jira", "risk management"],
  design: ["figma", "adobe", "ux research", "wireframing", "branding"],
  healthcare: ["emr", "hipaa", "patient care", "clinical trials"],
  hr: ["talent acquisition", "hris", "onboarding", "compensation planning"]
};

const DOMAIN_BY_SKILL = Object.entries(capabilityDomains).reduce((acc, [domain, skills]) => {
  skills.forEach((skill) => {
    acc[normalizeSkill(skill)] = domain;
  });
  return acc;
}, {});

const SOFT_SKILL_KEYWORDS = new Set([
  "communication",
  "teamwork",
  "leadership",
  "problem solving",
  "time management",
  "adaptability",
  "collaboration",
  "work ethic",
  "critical thinking"
]);

const SECTION_REQUIRED_KEYWORDS = ["requirement", "required", "must", "minimum qualification", "qualifications", "experience with"];
const SECTION_OPTIONAL_KEYWORDS = ["preferred", "nice to have", "bonus", "plus", "good to have"];
const SECTION_IGNORE_KEYWORDS = ["about us", "about the company", "benefits", "equal opportunity", "eeo", "who we are", "our culture"];
const RESUME_SECTION_KEYWORDS = ["skills", "tools", "technology", "technologies", "certifications", "certificates"];

const form = document.getElementById("analysis-form");
const jobDescription = document.getElementById("job-description");
const resumeText = document.getElementById("resume-text");
const resumeFile = document.getElementById("resume-file");
const clearJobBtn = document.getElementById("clear-job");
const clearResumeBtn = document.getElementById("clear-resume");
const uploadStatus = document.getElementById("upload-status");
const uploadError = document.getElementById("upload-error");
const loading = document.getElementById("loading");
const analyzeBtn = document.getElementById("analyze-btn");
const mainLayout = document.getElementById("main-layout");
const skillEnginePromise = loadSkillEngine();

clearJobBtn.addEventListener("click", () => {
  jobDescription.value = "";
});

clearResumeBtn.addEventListener("click", () => {
  resumeText.value = "";
  resumeFile.value = "";
  uploadStatus.textContent = "Accepted formats: PDF and Word (.docx) (max 5MB).";
  hideUploadError();
});

resumeFile.addEventListener("change", async (event) => {
  hideUploadError();
  const file = event.target.files?.[0];
  if (!file) return;

  const validationError = validateFile(file);
  if (validationError) {
    showUploadError(validationError);
    resumeFile.value = "";
    return;
  }

  try {
    uploadStatus.textContent = `Extracting text from ${file.name}...`;
    const extractedText = await extractTextFromFile(file);
    if (!extractedText.trim()) throw new Error("No readable text found in the uploaded file.");
    resumeText.value = extractedText.trim();
    uploadStatus.textContent = `Loaded ${file.name} into the Resume box.`;
  } catch (error) {
    showUploadError(`Text extraction failed: ${error.message}`);
  } finally {
    resumeFile.value = "";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideUploadError();

  const jdRaw = jobDescription.value.trim();
  const resumeRaw = resumeText.value.trim();

  if (!jdRaw) return;
  if (!resumeRaw) {
    showUploadError("Add resume text or upload a resume before analyzing.");
    return;
  }

  loading.hidden = false;
  analyzeBtn.disabled = true;

  try {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const skillEngine = await skillEnginePromise;

    const jdSkills = extractJobSkills(jdRaw, skillEngine);
    const resumeSkills = extractResumeSkills(resumeRaw, skillEngine);
    const userYears = Number(document.getElementById("user-years").value);
    console.debug("[FitScore] Extracted required skills:", jdSkills.required, "count:", jdSkills.required.length);
    console.debug("[FitScore] Extracted optional skills:", jdSkills.optional, "count:", jdSkills.optional.length);
    console.debug("[FitScore] Detected resume skills:", resumeSkills, "count:", resumeSkills.length);
    const comparison = compareSkillSets(jdRaw, resumeRaw, jdSkills, resumeSkills, userYears);
    const resumeStrength = calculateResumeStrength(comparison);

    const hiring = calculateHiringScore(jdRaw);
    const opportunity = calculateOpportunityStrength(jdRaw);

    renderResults({
      fitScore: comparison.fitScore,
      hiringScore: hiring.score,
      opportunity,
      fitLevel: getFitLevel(comparison.fitScore, comparison.requiredMatchPercent),
      hiringLevel: getHiringLevel(hiring.score),
      gaps: comparison.gaps,
      resumeStrength,
      recommendation: getRecommendation(comparison.fitScore, comparison.requiredMatchPercent, hiring.score, opportunity.score)
    });

    mainLayout.classList.remove("results-hidden");
  } finally {
    loading.hidden = true;
    analyzeBtn.disabled = false;
  }
});

function validateFile(file) {
  if (file.size > MAX_FILE_SIZE_BYTES) return "File is too large. Maximum allowed size is 5MB.";
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!SUPPORTED_EXTENSIONS.includes(extension)) return "Unsupported file type. Please upload a PDF or Word (.docx) file.";
  return "";
}

async function extractTextFromFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "docx") {
    if (typeof mammoth === "undefined") throw new Error("DOCX parser is unavailable.");
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    return value;
  }
  if (extension === "pdf") {
    const parser = await getPdfParser();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let pdf;
    try {
      pdf = await parser.getDocument({ data: bytes }).promise;
    } catch (_error) {
      pdf = await parser.getDocument({ data: bytes, disableWorker: true }).promise;
    }
    let text = "";
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += `${content.items.map((item) => item.str).join(" ")}\n`;
    }
    return text;
  }
  throw new Error("Unsupported file format.");
}

async function getPdfParser() {
  const pdfjs = window.pdfjsLib || await import("https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.min.mjs");
  if (pdfjs?.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  }
  return pdfjs;
}

async function loadSkillEngine() {
  try {
    const response = await fetch(withCacheBusting(ESCO_SKILL_DICTIONARY_URL), { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const dictionary = await response.json();
    return hydrateSkillEngine(dictionary);
  } catch (error) {
    console.error("Failed to load ESCO skill dictionary.", error);
    return hydrateSkillEngine({ canonicalToVariations: {}, variationToCanonical: {} });
  }
}

function withCacheBusting(url) {
  const parsed = new URL(url, window.location.href);
  parsed.searchParams.set("v", Date.now().toString());
  return parsed.toString();
}

function hydrateSkillEngine(dictionary) {
  const variationToCanonical = dictionary.variationToCanonical || {};
  const maxVariationWords = Math.max(
    1,
    ...Object.keys(variationToCanonical).map((variation) => variation.split(" ").length)
  );

  return {
    canonicalToVariations: dictionary.canonicalToVariations || {},
    variationToCanonical,
    maxVariationWords
  };
}

function extractJobSkills(jobText, skillEngine) {
  const lines = jobText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const required = new Set();
  const optional = new Set();

  let mode = "neutral";
  lines.forEach((line) => {
    const normalizedLine = normalizeText(line);
    if (!normalizedLine) return;

    if (isSectionHeader(normalizedLine, SECTION_IGNORE_KEYWORDS)) {
      mode = "ignore";
      return;
    }
    if (isSectionHeader(normalizedLine, SECTION_REQUIRED_KEYWORDS)) {
      mode = "required";
      return;
    }
    if (isSectionHeader(normalizedLine, SECTION_OPTIONAL_KEYWORDS)) {
      mode = "optional";
      return;
    }

    if (mode === "ignore") return;

    const extracted = extractSkillsFromLine(normalizedLine, skillEngine).filter((skill) => !SOFT_SKILL_KEYWORDS.has(skill));
    if (!extracted.length) return;

    const isRequiredLine = /\b(required|must have|must|minimum|need to|at least)\b/.test(normalizedLine);
    const isOptionalLine = /\b(preferred|nice to have|bonus|plus|good to have)\b/.test(normalizedLine);
    const target = (mode === "optional" || isOptionalLine) && !isRequiredLine ? optional : required;
    extracted.forEach((skill) => target.add(skill));
  });

  // Fallback only when structured extraction finds nothing. Adding every skill to optional
  // can dilute the score and make strong resumes look capped around mid-range.
  if (!required.size && !optional.size) {
    extractSkillsFromLine(normalizeText(jobText), skillEngine).forEach((skill) => {
      optional.add(skill);
    });
  }

  return {
    required: [...required],
    optional: [...optional].filter((skill) => !required.has(skill))
  };
}

function extractResumeSkills(resume, skillEngine) {
  const lines = resume.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const found = new Set();
  let sectionBoost = false;

  lines.forEach((line) => {
    const normalizedLine = normalizeText(line);
    if (!normalizedLine) return;

    sectionBoost = RESUME_SECTION_KEYWORDS.some((keyword) => normalizedLine.includes(keyword)) || sectionBoost;

    const direct = extractSkillsFromLine(normalizedLine, skillEngine).filter((skill) => !SOFT_SKILL_KEYWORDS.has(skill));
    direct.forEach((skill) => found.add(skill));

    if (/experience with|worked on|proficient in/.test(normalizedLine) || sectionBoost) {
      direct.forEach((skill) => found.add(skill));
    }
  });

  extractSkillsFromLine(normalizeText(resume), skillEngine)
    .filter((skill) => !SOFT_SKILL_KEYWORDS.has(skill))
    .forEach((skill) => found.add(skill));

  return [...found];
}

function extractSkillsFromLine(normalizedLine, skillEngine) {
  if (!normalizedLine || !skillEngine?.variationToCanonical) return [];

  const tokens = normalizedLine.split(" ").filter(Boolean);
  const matched = new Set();
  const maxWords = skillEngine.maxVariationWords;

  for (let start = 0; start < tokens.length; start += 1) {
    for (let size = 1; size <= maxWords && start + size <= tokens.length; size += 1) {
      const variation = tokens.slice(start, start + size).join(" ");
      const canonical = skillEngine.variationToCanonical[variation];
      if (canonical) matched.add(normalizeSkill(canonical));
    }
  }

  return [...matched];
}

function compareSkillSets(jobText, resumeText, jobSkills, resumeSkills, userYears) {
  const resumeSet = new Set(resumeSkills.map((skill) => normalizeSkill(skill)));
  const requiredSkills = jobSkills.required.map((skill) => normalizeSkill(skill));

  const requiredSkillScores = requiredSkills.map((jobSkill) => {
    if (resumeSet.has(jobSkill)) return { skill: jobSkill, score: 1, matchType: "exact" };
    const domain = getSkillDomain(jobSkill);
    if (!domain) return { skill: jobSkill, score: 0, matchType: "none" };
    const hasDomainSkill = [...resumeSet].some((resumeSkill) => getSkillDomain(resumeSkill) === domain);
    if (hasDomainSkill) return { skill: jobSkill, score: 0.7, matchType: "domain" };
    return { skill: jobSkill, score: 0, matchType: "none" };
  });

  const baseCoreSkillScore = requiredSkills.length
    ? requiredSkillScores.reduce((sum, item) => sum + item.score, 0) / requiredSkills.length
    : 1;

  const requiredDomains = new Set(requiredSkills.map((skill) => getSkillDomain(skill)).filter(Boolean));
  const resumeDomainCounts = [...resumeSet].reduce((acc, skill) => {
    const domain = getSkillDomain(skill);
    if (domain) acc[domain] = (acc[domain] || 0) + 1;
    return acc;
  }, {});
  const eligibleDomainBonus = [...requiredDomains].reduce((bonus, domain) => (
    resumeDomainCounts[domain] >= 3 ? bonus + 0.05 : bonus
  ), 0);
  const domainBonus = Math.min(0.1, eligibleDomainBonus);
  const coreSkillScore = Math.min(baseCoreSkillScore + domainBonus, 1);

  const requiredYears = extractRequiredYears(jobText);
  const experienceScore = evaluateExperienceScore(userYears, requiredYears);
  const contextScore = evaluateContextRelevance(jobText, resumeText);

  const coreSkillContribution = coreSkillScore * 70;
  const experienceContribution = experienceScore * 20;
  const contextContribution = contextScore * 10;

  let fitScore = coreSkillContribution + experienceContribution + contextContribution;

  const exactOrDomainMatchPercent = requiredSkills.length
    ? (requiredSkillScores.filter((item) => item.score > 0).length / requiredSkills.length) * 100
    : 100;
  if (exactOrDomainMatchPercent >= 70 && experienceScore >= 0.7 && contextScore >= 0.7) {
    fitScore = Math.max(75, fitScore);
  }
  fitScore = Math.round(Math.min(100, fitScore));

  const missingRequired = requiredSkillScores.filter((item) => item.score === 0).map((item) => item.skill);
  const strongDomains = [...requiredDomains].filter((domain) => resumeDomainCounts[domain] >= 3);
  const requiredMatchPercent = Math.round((baseCoreSkillScore * 100));

  const gaps = missingRequired.length
    ? [`Missing required skills: ${missingRequired.join(", ")}.`]
    : ["No clearly missing required skills detected."];

  return {
    fitScore,
    requiredMatchPercent,
    optionalMatchPercent: 0,
    gaps,
    requiredMatchedCount: requiredSkillScores.filter((item) => item.score > 0).length,
    requiredTotalCount: requiredSkills.length,
    optionalMatchedCount: 0,
    optionalTotalCount: 0,
    coreSkillScore,
    domainBonus,
    strongDomains,
    experienceAligned: experienceScore >= 0.85,
    requiredYears,
    userYears,
    contextScore
  };
}

function extractRequiredYears(jobText) {
  const normalized = normalizeText(jobText);
  const matches = [...normalized.matchAll(/(\d+)\+?\s+years?/g)];
  if (!matches.length) return null;
  return Math.max(...matches.map((match) => Number(match[1]) || 0));
}

function evaluateExperienceScore(userYears, requiredYears) {
  if (!requiredYears) return 1;
  if (userYears >= requiredYears) return 1;
  if (userYears >= requiredYears * 0.8) return 0.85;
  if (userYears >= requiredYears * 0.6) return 0.7;
  return 0.4;
}

function evaluateContextRelevance(jobText, resumeText) {
  const jobTitleKeywords = extractTitleKeywords(jobText);
  const resumeTitleKeywords = extractTitleKeywords(resumeText);
  const industryOverlap = overlapRatio(extractIndustryKeywords(jobText), extractIndustryKeywords(resumeText));
  const verbOverlap = overlapRatio(extractResponsibilityVerbs(jobText), extractResponsibilityVerbs(resumeText));
  const titleOverlap = overlapRatio(jobTitleKeywords, resumeTitleKeywords);
  const similarity = (titleOverlap * 0.45) + (industryOverlap * 0.3) + (verbOverlap * 0.25);

  if (similarity >= 0.65) return 1;
  if (similarity >= 0.45) return 0.7;
  if (similarity >= 0.2) return 0.4;
  return 0.2;
}

function calculateResumeStrength(comparison) {
  const notes = [
    `${comparison.requiredMatchedCount}/${comparison.requiredTotalCount || 0} core skills matched (including partial domain credit).`
  ];

  if (comparison.strongDomains.length) {
    notes.push(`Strong domain alignment in ${comparison.strongDomains.join(", ")}.`);
  }

  if (comparison.requiredYears) {
    const alignmentLabel = comparison.experienceAligned ? "Experience aligned" : "Experience partially aligned";
    notes.push(`${alignmentLabel}: ${comparison.userYears} years provided vs ${comparison.requiredYears} years requested.`);
  } else {
    notes.push("No specific years requirement detected, so experience was treated as fully aligned.");
  }

  return notes;
}

function calculateHiringScore(jobText) {
  const notes = [];
  const postingAge = Number(document.getElementById("posting-age").value);
  const repostStatus = Number(document.getElementById("repost-status").value);
  const salaryTransparency = Number(document.getElementById("salary-transparency").value);

  let deductions = postingAge + repostStatus + salaryTransparency;
  const requirementCount = (normalizeText(jobText).match(/\b(required|must|need to|minimum|at least|preferred)\b/g) || []).length;

  if (postingAge >= 24) notes.push("Older posting age reduced Hiring Score.");
  if (repostStatus >= 12) notes.push("Repost signal reduced Hiring Score.");
  if (salaryTransparency >= 10) notes.push("No salary transparency lowered Hiring Score.");
  if (requirementCount < 5) {
    deductions -= 4;
    notes.push("Clear and concise requirements slightly improved Hiring Score.");
  }

  return { score: Math.max(0, Math.min(100, 100 - deductions)), notes };
}

function calculateOpportunityStrength(jobText) {
  const notes = [];
  const easyApply = Number(document.getElementById("easy-apply").value);
  const salaryTransparency = Number(document.getElementById("salary-transparency").value);
  const postingAge = Number(document.getElementById("posting-age").value);

  let score = 70;
  const normalizedJob = normalizeText(jobText);
  const requirementCount = (normalizedJob.match(/\b(required|must|need to|minimum|at least|preferred)\b/g) || []).length;
  const redFlagCount = (normalizedJob.match(/\bunpaid|commission only|urgent hire today|wire transfer|pay to apply|confidential salary\b/g) || []).length;

  if (easyApply) {
    score -= easyApply;
    notes.push("Easy Apply lowers opportunity strength because it typically increases applicant volume.");
  }

  if (salaryTransparency >= 10) {
    score -= 5;
    notes.push("Missing salary details slightly reduced Opportunity Strength.");
  }

  if (postingAge >= 24) {
    score -= 5;
    notes.push("Older posting age reduced Opportunity Strength.");
  }

  if (requirementCount >= 3 && requirementCount <= 20) {
    score += 8;
    notes.push("Reasonable requirement depth improved Opportunity Strength.");
  } else if (requirementCount > 35) {
    score -= 8;
    notes.push("Overly long requirement lists may indicate lower response likelihood.");
  }

  if (redFlagCount > 0) {
    score -= Math.min(30, redFlagCount * 12);
    notes.push("Potential red-flag language reduced Opportunity Strength.");
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    label: getOpportunityLabel(score),
    notes
  };
}

function getFitLevel(score, requiredMatchPercent) {
  if (score >= 80 || requiredMatchPercent >= 75) {
    return "Strong fit: high core-skill alignment with interview-ready potential.";
  }
  if (score >= 60) {
    return "Moderate fit: good alignment with room to tailor for missing requirements.";
  }
  return "Developing fit: improve core skill coverage to strengthen interview odds.";
}

function getHiringLevel(score) {
  if (score >= 75) return "High hiring activity: posting appears active and timely.";
  if (score >= 50) return "Moderate hiring activity: still viable, but timing may be mixed.";
  return "Low hiring activity: older or weaker posting signals.";
}

function getOpportunityLabel(score) {
  if (score >= 60) return "High";
  if (score >= 30) return "Medium";
  return "Low";
}

function getRecommendation(fitScore, requiredMatchPercent, hiringScore, effortScore) {
  if (fitScore >= 80 && requiredMatchPercent >= 70) {
    return { label: "Strong Apply", tone: "high" };
  }
  if (fitScore >= 65 && (hiringScore >= 55 || effortScore >= 50)) {
    return { label: "Apply", tone: "med" };
  }
  return { label: "Selective Apply", tone: "low" };
}

function isSectionHeader(line, keywords) {
  return keywords.some((keyword) => line.includes(keyword)) && line.length < 80;
}

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[•·]/g, " ")
    .replace(/[^a-z0-9+.#\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSkill(skill) {
  const cleaned = normalizeText(skill || "")
    .replace(/[.,;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return SKILL_NORMALIZATION_MAP[cleaned] || cleaned;
}

function getSkillDomain(skill) {
  return DOMAIN_BY_SKILL[normalizeSkill(skill)] || null;
}

function overlapRatio(leftValues, rightValues) {
  if (!leftValues.size || !rightValues.size) return 0;
  const overlap = [...leftValues].filter((value) => rightValues.has(value)).length;
  return overlap / Math.max(leftValues.size, rightValues.size);
}

function extractTitleKeywords(text) {
  const normalized = normalizeText(text);
  const titleLine = normalized.split(/\n|\./)[0] || "";
  return new Set(titleLine.split(" ").filter((token) => token.length > 2));
}

function extractIndustryKeywords(text) {
  const INDUSTRY_TERMS = ["saas", "healthcare", "finance", "retail", "b2b", "manufacturing", "education", "logistics", "marketing", "technology"];
  const normalized = normalizeText(text);
  return new Set(INDUSTRY_TERMS.filter((keyword) => normalized.includes(keyword)));
}

function extractResponsibilityVerbs(text) {
  const VERBS = ["manage", "lead", "develop", "design", "analyze", "build", "coordinate", "optimize", "implement", "execute"];
  const normalized = normalizeText(text);
  return new Set(VERBS.filter((verb) => normalized.includes(verb)));
}

function renderResults({ fitScore, hiringScore, opportunity, fitLevel, hiringLevel, gaps, resumeStrength, recommendation }) {
  document.getElementById("fit-score").textContent = `${fitScore}/100`;
  document.getElementById("hiring-score").textContent = `${hiringScore}/100`;
  document.getElementById("opportunity-level").textContent = `${opportunity.label} (${opportunity.score}/100)`;
  document.getElementById("opportunity-note").textContent = `Opportunity Strength is ${opportunity.label.toLowerCase()} based on job-quality and response-likelihood signals.`;
  document.getElementById("fit-progress").value = fitScore;
  document.getElementById("fit-level").textContent = fitLevel;
  document.getElementById("hiring-level").textContent = hiringLevel;

  const recommendationEl = document.getElementById("recommendation");
  recommendationEl.textContent = `Final Recommendation: ${recommendation.label}`;
  recommendationEl.style.background = recommendation.tone === "high" ? "var(--high)" : recommendation.tone === "med" ? "var(--med)" : "var(--low)";
  recommendationEl.style.color = "#1f2937";

  const gapsList = document.getElementById("gaps");
  gapsList.innerHTML = "";
  gaps.forEach((gap) => {
    const li = document.createElement("li");
    li.textContent = gap;
    gapsList.appendChild(li);
  });

  const resumeStrengthList = document.getElementById("resume-strength");
  resumeStrengthList.innerHTML = "";
  resumeStrength.forEach((signal) => {
    const li = document.createElement("li");
    li.textContent = signal;
    resumeStrengthList.appendChild(li);
  });

  document.getElementById("results").hidden = false;
}

function showUploadError(message) {
  uploadError.hidden = false;
  uploadError.textContent = message;
  uploadStatus.textContent = "Upload failed. Please try another file.";
}

function hideUploadError() {
  uploadError.hidden = true;
  uploadError.textContent = "";
}
