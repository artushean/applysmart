const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ["pdf", "docx"];
const FIT_GATE_THRESHOLD = 60;
const PDF_WORKER_SRC = "https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";

const SECTION_REQUIRED_KEYWORDS = ["requirement", "required", "must", "minimum qualification", "qualifications", "experience with"];
const SECTION_OPTIONAL_KEYWORDS = ["preferred", "nice to have", "bonus", "plus", "good to have"];
const SECTION_IGNORE_KEYWORDS = ["about us", "about the company", "benefits", "equal opportunity", "eeo", "who we are", "our culture"];
const RESUME_SECTION_KEYWORDS = ["skills", "tools", "technology", "technologies", "certifications", "certificates"];

const SKILL_VARIANTS = {
  js: ["javascript", "java script", "js"],
  ts: ["typescript", "type script", "ts"],
  nodejs: ["node.js", "node js", "nodejs", "node"],
  react: ["react", "react.js", "reactjs"],
  python: ["python"],
  java: ["java"],
  sql: ["sql", "mysql", "mssql"],
  postgres: ["postgres", "postgresql"],
  mongodb: ["mongodb", "mongo db"],
  aws: ["aws", "amazon web services"],
  azure: ["azure", "microsoft azure"],
  gcp: ["gcp", "google cloud", "google cloud platform"],
  docker: ["docker"],
  kubernetes: ["kubernetes", "k8s"],
  terraform: ["terraform"],
  git: ["git", "github", "gitlab", "bitbucket"],
  excel: ["excel", "ms excel", "microsoft excel"],
  powerbi: ["power bi", "powerbi"],
  tableau: ["tableau"],
  salesforce: ["salesforce"],
  jira: ["jira"],
  figma: ["figma"],
  cissp: ["cissp"],
  ccna: ["ccna"],
  pmp: ["pmp"]
};

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

    const jdSkills = extractJobSkills(jdRaw);
    const resumeSkills = extractResumeSkills(resumeRaw);
    const comparison = compareSkillSets(jdSkills, resumeSkills);

    const hiring = calculateHiringScore(jdRaw);
    const effort = calculateApplicationEffort();

    renderResults({
      fitScore: comparison.fitScore,
      hiringScore: hiring.score,
      effort,
      fitLevel: getFitLevel(comparison.fitScore, comparison.requiredMatchPercent),
      hiringLevel: getHiringLevel(hiring.score),
      gaps: comparison.gaps,
      signals: [...comparison.notes, ...hiring.notes, ...effort.notes],
      recommendation: getRecommendation(comparison.fitScore, comparison.requiredMatchPercent, hiring.score, effort.score)
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

function extractJobSkills(jobText) {
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

    const extracted = extractSkillsFromLine(normalizedLine);
    if (!extracted.length) return;

    const target = mode === "optional" ? optional : required;
    extracted.forEach((skill) => target.add(skill));
  });

  return {
    required: [...required],
    optional: [...optional].filter((skill) => !required.has(skill))
  };
}

function extractResumeSkills(resume) {
  const lines = resume.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const found = new Set();
  let sectionBoost = false;

  lines.forEach((line) => {
    const normalizedLine = normalizeText(line);
    if (!normalizedLine) return;

    sectionBoost = RESUME_SECTION_KEYWORDS.some((keyword) => normalizedLine.includes(keyword)) || sectionBoost;

    const direct = extractSkillsFromLine(normalizedLine);
    direct.forEach((skill) => found.add(skill));

    if (/experience with|worked on|proficient in/.test(normalizedLine) || sectionBoost) {
      direct.forEach((skill) => found.add(skill));
    }
  });

  return [...found];
}

function extractSkillsFromLine(normalizedLine) {
  const skills = [];
  Object.entries(SKILL_VARIANTS).forEach(([canonical, variants]) => {
    const hasMatch = variants.some((variant) => normalizedLine.includes(normalizeText(variant)));
    if (hasMatch) skills.push(canonical);
  });
  return [...new Set(skills)];
}

function compareSkillSets(jobSkills, resumeSkills) {
  const resumeSet = new Set(resumeSkills);
  const requiredMatched = jobSkills.required.filter((skill) => resumeSet.has(skill));
  const optionalMatched = jobSkills.optional.filter((skill) => resumeSet.has(skill));
  const missingRequired = jobSkills.required.filter((skill) => !resumeSet.has(skill));

  const requiredWeight = jobSkills.required.length * 2;
  const optionalWeight = jobSkills.optional.length;
  const possible = requiredWeight + optionalWeight;
  const points = requiredMatched.length * 2 + optionalMatched.length;
  const fitScore = possible > 0 ? Math.round((points / possible) * 100) : 65;

  const requiredMatchPercent = jobSkills.required.length
    ? Math.round((requiredMatched.length / jobSkills.required.length) * 100)
    : 100;
  const optionalMatchPercent = jobSkills.optional.length
    ? Math.round((optionalMatched.length / jobSkills.optional.length) * 100)
    : 100;

  const gaps = missingRequired.length
    ? [`Critical Gap: Missing required skills: ${missingRequired.join(", ")}.`]
    : ["No critical required-skill gaps detected."];

  return {
    fitScore,
    requiredMatchPercent,
    optionalMatchPercent,
    gaps,
    notes: [
      `Required skill match: ${requiredMatched.length}/${jobSkills.required.length || 0} (${requiredMatchPercent}%).`,
      `Optional skill match: ${optionalMatched.length}/${jobSkills.optional.length || 0} (${optionalMatchPercent}%).`,
      "Fit uses weighted scoring: required skills have 2x weight vs optional skills.",
      "Normalized skill aliases (e.g., Node.js/node js → nodejs, React.js → react, MS Excel → excel)."
    ]
  };
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

function calculateApplicationEffort() {
  const notes = [];
  const easyApply = Number(document.getElementById("easy-apply").value);
  const coverLetter = Number(document.getElementById("cover-letter").value);
  const accountRequired = Number(document.getElementById("account-required").value);
  const resumeReentry = Number(document.getElementById("resume-reentry").value);
  const externalRedirect = Number(document.getElementById("external-redirect").value);

  const score = Math.min(100, easyApply + coverLetter + accountRequired + resumeReentry + externalRedirect);

  if (easyApply) notes.push("Easy Apply usually increases crowding and lowers visibility.");
  if (coverLetter) notes.push("Mandatory cover letter increases application time.");
  if (accountRequired) notes.push("Account creation adds friction before submission.");
  if (resumeReentry) notes.push("Manual resume re-entry adds substantial effort.");
  if (externalRedirect) notes.push("External redirect introduces extra steps.");

  return {
    score,
    label: getEffortLabel(score),
    notes
  };
}

function getFitLevel(score, requiredMatchPercent) {
  if (requiredMatchPercent < 50 || score < 60) {
    return "Low fit: required skill coverage is below threshold; not recommended.";
  }
  if (requiredMatchPercent >= 70 && score >= 70) {
    return "Strong fit: required skill coverage is high and aligned.";
  }
  return "Moderate fit: tailor your resume to close remaining required skill gaps.";
}

function getHiringLevel(score) {
  if (score >= 75) return "High hiring activity: posting appears active and timely.";
  if (score >= 50) return "Moderate hiring activity: still viable, but timing may be mixed.";
  return "Low hiring activity: older or weaker posting signals.";
}

function getEffortLabel(score) {
  if (score >= 60) return "High";
  if (score >= 30) return "Medium";
  return "Low";
}

function getRecommendation(fitScore, requiredMatchPercent, hiringScore, effortScore) {
  if (fitScore < FIT_GATE_THRESHOLD || requiredMatchPercent < 50) {
    return { label: "Not Recommended", tone: "low" };
  }
  if (fitScore >= 70 && requiredMatchPercent >= 70 && hiringScore >= 65 && effortScore < 60) {
    return { label: "Strong Apply", tone: "high" };
  }
  if (hiringScore >= 55) {
    return { label: "Apply Fast", tone: "med" };
  }
  return { label: "Lower Priority", tone: "low" };
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

function renderResults({ fitScore, hiringScore, effort, fitLevel, hiringLevel, gaps, signals, recommendation }) {
  document.getElementById("fit-score").textContent = `${fitScore}/100`;
  document.getElementById("hiring-score").textContent = `${hiringScore}/100`;
  document.getElementById("effort-level").textContent = effort.label;
  document.getElementById("effort-note").textContent = `Application effort is ${effort.label.toLowerCase()} (${effort.score}/100 internal score).`;
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

  const signalsList = document.getElementById("signals");
  signalsList.innerHTML = "";
  signals.forEach((signal) => {
    const li = document.createElement("li");
    li.textContent = signal;
    signalsList.appendChild(li);
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
