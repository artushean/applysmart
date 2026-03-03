const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ["pdf", "docx", "txt"];
const FIT_GATE_THRESHOLD = 50;

const DOMAIN_KEYWORDS = [
  "fintech", "healthcare", "edtech", "ecommerce", "saas", "cybersecurity", "cloud", "ai", "machine learning", "data", "mobile", "payments", "compliance", "devops", "product"
];

const TOOLS = [
  "javascript", "typescript", "python", "java", "react", "node", "sql", "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "tableau", "power bi", "salesforce", "jira", "figma", "excel", "git"
];

const SENIORITY_LEVELS = ["intern", "junior", "mid", "senior", "lead", "staff", "principal", "manager", "director", "vp", "head"];
const LEADERSHIP_VERBS = ["lead", "manage", "oversee", "supervise", "direct", "mentor", "own"];
const HARD_SKILLS = [...TOOLS, ...DOMAIN_KEYWORDS, "cpa", "pmp", "rn", "pe", "security+", "cissp", "ccna"];
const MANDATORY_PHRASES = ["must have", "required", "essential", "minimum", "mandatory", "must"];
const CERTIFICATION_TERMS = ["certification", "certificate", "license", "licensed", "cpa", "pmp", "rn", "pe", "cissp", "ccna", "security+"];

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

clearJobBtn.addEventListener("click", () => {
  jobDescription.value = "";
});

clearResumeBtn.addEventListener("click", () => {
  resumeText.value = "";
  resumeFile.value = "";
  uploadStatus.textContent = "Accepted formats: PDF, DOCX, TXT (max 5MB).";
  hideUploadError();
});

document.querySelectorAll(".tooltip").forEach((tooltipBtn) => {
  tooltipBtn.addEventListener("click", () => {
    tooltipBtn.setAttribute("title", tooltipBtn.dataset.tip || "");
  });
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

  await new Promise((resolve) => setTimeout(resolve, 750));

  const jdSignals = extractJobSignals(jdRaw);
  const resumeSignals = extractResumeSignals(resumeRaw);
  const comparison = compareSignals(jdSignals, resumeSignals);

  const hiring = calculateHiringScore(jdRaw);
  const competition = calculateCompetitionScore();

  renderResults({
    fitScore: comparison.fitScore,
    hiringScore: hiring.score,
    competitionScore: competition.score,
    fitLevel: getFitLevel(comparison.fitScore),
    hiringLevel: getHiringLevel(hiring.score),
    competitionLevel: getCompetitionLevel(competition.score),
    gaps: comparison.gaps,
    signals: [...comparison.notes, ...hiring.notes, ...competition.notes],
    recommendation: getRecommendation(comparison.fitScore, hiring.score, competition.score, comparison.gaps)
  });

  loading.hidden = true;
  analyzeBtn.disabled = false;
});

function validateFile(file) {
  if (file.size > MAX_FILE_SIZE_BYTES) return "File is too large. Maximum allowed size is 5MB.";
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!SUPPORTED_EXTENSIONS.includes(extension)) return "Unsupported file type. Please upload a PDF, DOCX, or TXT file.";
  return "";
}

async function extractTextFromFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "txt") return file.text();
  if (extension === "docx") {
    if (typeof mammoth === "undefined") throw new Error("DOCX parser is unavailable.");
    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    return value;
  }
  if (extension === "pdf") {
    const parser = await getPdfParser();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await parser.getDocument({ data: bytes }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += `${content.items.map((item) => item.str).join(" ")}\n`;
    }
    return text;
  }
  throw new Error("Unsupported file type.");
}

async function getPdfParser() {
  if (window.pdfjsLib) return window.pdfjsLib;
  const pdfjs = await import("https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
  return pdfjs;
}

function extractJobSignals(text) {
  const normalized = normalize(text);
  return {
    requiredYears: extractMaxYearsRequirement(normalized),
    domainKeywords: extractMatches(normalized, DOMAIN_KEYWORDS),
    tools: extractMatches(normalized, TOOLS),
    seniority: extractSeniority(normalized),
    leadershipVerbs: extractMatches(normalized, LEADERSHIP_VERBS),
    mandatoryRequirements: extractMandatoryRequirements(normalized),
    requiredCertifications: extractCertifications(normalized),
    keywordProfile: extractKeywordProfile(normalized)
  };
}

function extractResumeSignals(text) {
  const normalized = normalize(text);
  return {
    years: extractMaxYearsMentioned(normalized),
    domainKeywords: extractMatches(normalized, DOMAIN_KEYWORDS),
    tools: extractMatches(normalized, TOOLS),
    seniority: extractSeniority(normalized),
    leadershipVerbs: extractMatches(normalized, LEADERSHIP_VERBS),
    hardSkills: extractHardRequirements(normalized),
    certifications: extractCertifications(normalized),
    keywordProfile: extractKeywordProfile(normalized)
  };
}

function compareSignals(job, resume) {
  const gaps = [];
  const notes = [];

  const yearsAlignment = scoreYearsAlignment(job.requiredYears, resume.years, gaps, notes);
  const mandatoryCoverage = scoreMandatoryCoverage(job.mandatoryRequirements, resume, gaps, notes);
  const keywordAlignment = scoreKeywordOverlap(job.keywordProfile, resume.keywordProfile, notes);
  const certAlignment = scoreCertificationAlignment(job.requiredCertifications, resume.certifications, gaps, notes);
  const seniorityAlignment = scoreSeniorityAlignment(job, resume, notes);

  const fitScore = Math.max(0, Math.min(100, Math.round(
    (yearsAlignment * 0.3) +
    (mandatoryCoverage * 0.25) +
    (keywordAlignment * 0.2) +
    (certAlignment * 0.15) +
    (seniorityAlignment * 0.1)
  )));

  if (keywordAlignment < 30) {
    gaps.push("Critical Gap: Domain mismatch risk due to low job/resume keyword overlap.");
  }

  notes.push("Fit is the primary gatekeeper score. If this is weak, the role is not recommended.");
  return { fitScore, gaps, notes };
}

function calculateHiringScore(jobText) {
  const notes = [];
  const postingAge = Number(document.getElementById("posting-age").value);
  const repostStatus = Number(document.getElementById("repost-status").value);
  const applicationPath = Number(document.getElementById("application-path").value);
  const salaryTransparency = Number(document.getElementById("salary-transparency").value);

  let deductions = postingAge + repostStatus + applicationPath + salaryTransparency;
  const requirementCount = (normalize(jobText).match(/\b(required|must|need to|minimum|at least|preferred)\b/g) || []).length;

  if (postingAge >= 24) notes.push("Older posting age reduced Hiring Score.");
  if (repostStatus >= 12) notes.push("Repost signal reduced Hiring Score.");
  if (applicationPath >= 10) notes.push("Easy Apply suggests broader funnel and lower responsiveness.");
  if (salaryTransparency >= 10) notes.push("No salary transparency lowered Hiring Score.");
  if (requirementCount < 5) {
    deductions -= 4;
    notes.push("Clear and concise requirements slightly improved Hiring Score.");
  }

  return { score: Math.max(0, Math.min(100, 100 - deductions)), notes };
}

function calculateCompetitionScore() {
  const notes = [];
  const workMode = Number(document.getElementById("work-mode").value);
  const experienceBand = Number(document.getElementById("experience-band").value);
  const titleSpecificity = Number(document.getElementById("title-specificity").value);
  const applicationPath = Number(document.getElementById("application-path").value);

  let score = workMode + experienceBand + titleSpecificity - applicationPath;
  if (workMode <= 12) notes.push("Remote role increased expected crowding.");
  if (experienceBand <= 12) notes.push("Entry-level band increased expected applicant volume.");
  if (titleSpecificity <= 10) notes.push("Generic role title increased expected competition.");
  if (applicationPath >= 10) notes.push("Easy Apply increased crowding pressure.");

  score = Math.max(0, Math.min(100, score));
  notes.push("Higher Competition Score means less crowding and easier odds.");
  return { score, notes };
}

function getRecommendation(fitScore, hiringScore, competitionScore, gaps) {
  const hasCritical = gaps.some((gap) => gap.startsWith("Critical Gap"));
  if (fitScore < FIT_GATE_THRESHOLD || hasCritical) {
    return { label: "Not Recommended", tone: "low" };
  }

  if (hiringScore >= 70 && competitionScore >= 60) {
    return { label: "Strong Apply", tone: "high" };
  }

  if (hiringScore >= 60) {
    return { label: "Apply Fast", tone: "med" };
  }

  return { label: "Lower Priority", tone: "low" };
}

function getFitLevel(score) {
  if (score >= 75) return "High fit: You likely qualify on skills and core requirements.";
  if (score >= 50) return "Moderate fit: Review requirements and tailor your resume before applying.";
  return "Low fit: Core match is weak; this role is likely not worth applying to now.";
}

function getHiringLevel(score) {
  if (score >= 75) return "High hiring activity: posting appears active and timely.";
  if (score >= 50) return "Moderate hiring activity: still viable, but timing may be mixed.";
  return "Low hiring activity: older or weaker posting signals.";
}

function getCompetitionLevel(score) {
  if (score >= 70) return "Lower crowding: applicant pool likely more manageable.";
  if (score >= 45) return "Moderate crowding: expect competition.";
  return "High crowding: likely a saturated applicant pool.";
}

function scoreYearsAlignment(requiredYears, resumeYears, gaps, notes) {
  if (!requiredYears) {
    notes.push("Years requirement is unclear in the job description; marked as uncertain.");
    return 60;
  }
  if (!resumeYears) {
    gaps.push(`Uncertain Gap: Job asks for ${requiredYears}+ years but resume years are unclear.`);
    return 45;
  }
  if (resumeYears < requiredYears) {
    gaps.push(`Critical Gap: Job asks for ${requiredYears}+ years; resume shows ${resumeYears} years.`);
    return 5;
  }
  notes.push(`Years alignment looks strong (${resumeYears} vs required ${requiredYears}).`);
  return 100;
}

function scoreMandatoryCoverage(requirements, resume, gaps, notes) {
  if (!requirements.length) {
    notes.push("No explicit mandatory requirement phrases were detected.");
    return 70;
  }

  const resumeCombined = `${resume.hardSkills.join(" ")} ${resume.keywordProfile.terms.join(" ")} ${resume.certifications.join(" ")}`;
  const missing = requirements.filter((req) => !resumeCombined.includes(req));
  const matched = requirements.length - missing.length;

  if (missing.length) gaps.push(`Moderate Gap: Mandatory requirement coverage missing for ${missing.join(", ")}.`);
  notes.push(`Mandatory requirement coverage: ${matched}/${requirements.length}.`);
  return Math.round((matched / requirements.length) * 100);
}

function scoreKeywordOverlap(jobKeywords, resumeKeywords, notes) {
  const required = jobKeywords.topTerms;
  if (!required.length) {
    notes.push("No strong repeated domain keywords detected in the job description.");
    return 60;
  }
  const resumeSet = new Set(resumeKeywords.terms);
  const overlap = required.filter((term) => resumeSet.has(term));
  const score = Math.round((overlap.length / required.length) * 100);
  notes.push(`Keyword overlap (high-frequency terms): ${overlap.length}/${required.length}.`);
  return score;
}

function scoreCertificationAlignment(requiredCertifications, resumeCertifications, gaps, notes) {
  if (!requiredCertifications.length) {
    notes.push("No required certifications/licenses detected in the job description.");
    return 80;
  }
  const resumeSet = new Set(resumeCertifications);
  const matched = requiredCertifications.filter((cert) => resumeSet.has(cert));
  const missing = requiredCertifications.filter((cert) => !resumeSet.has(cert));
  if (missing.length) gaps.push(`Critical Gap: Missing required certifications/licenses: ${missing.join(", ")}.`);
  notes.push(`Certification match: ${matched.length}/${requiredCertifications.length}.`);
  return Math.round((matched.length / requiredCertifications.length) * 100);
}

function scoreSeniorityAlignment(job, resume, notes) {
  const jobSignals = [...new Set([...job.seniority, ...job.leadershipVerbs])];
  if (!jobSignals.length) {
    notes.push("No clear seniority/responsibility verbs in the job description.");
    return 60;
  }
  const resumeSignals = new Set([...resume.seniority, ...resume.leadershipVerbs]);
  const overlap = jobSignals.filter((term) => resumeSignals.has(term));
  notes.push(`Seniority/responsibility alignment: ${overlap.length}/${jobSignals.length}.`);
  return Math.round((overlap.length / jobSignals.length) * 100);
}

function extractMaxYearsRequirement(text) {
  const matches = [...text.matchAll(/(\d+)\+?\s*(?:years|yrs)(?:\s+of)?\s+(?:experience|exp)/g)].map((m) => Number(m[1]));
  return matches.length ? Math.max(...matches) : 0;
}

function extractMaxYearsMentioned(text) {
  const matches = [...text.matchAll(/(\d+)\+?\s*(?:years|yrs)/g)].map((m) => Number(m[1]));
  return matches.length ? Math.max(...matches) : 0;
}

function extractMatches(text, dictionary) {
  return dictionary.filter((term) => text.includes(term));
}

function extractSeniority(text) {
  return SENIORITY_LEVELS.filter((level) => text.includes(level));
}

function extractMandatoryRequirements(text) {
  const lines = text.split(/\n|\./).map((line) => normalize(line)).filter(Boolean);
  const requirements = [];

  lines.forEach((line) => {
    MANDATORY_PHRASES.forEach((phrase) => {
      if (!line.includes(phrase)) return;
      const afterPhrase = line.split(phrase)[1] || "";
      const tokens = afterPhrase.split(/[,;]| and | or /).map((item) => item.trim()).filter(Boolean);
      if (tokens.length) requirements.push(cleanRequirement(tokens[0]));
    });
  });

  return [...new Set(requirements.filter(Boolean))].slice(0, 8);
}

function cleanRequirement(text) {
  return text.replace(/^(have|to|a|an|the|with|for)\s+/, "").replace(/[^a-z0-9+\-\s]/g, "").trim();
}

function extractKeywordProfile(text) {
  const nounLikePhrases = text.match(/\b[a-z]{3,}(?:\s+[a-z]{3,}){0,2}\b/g) || [];
  const frequencies = nounLikePhrases.reduce((acc, phrase) => {
    const cleaned = phrase.trim();
    if (cleaned.length < 4 || /^(with|from|that|this|will|your|have|must|required|minimum)$/.test(cleaned)) return acc;
    acc[cleaned] = (acc[cleaned] || 0) + 1;
    return acc;
  }, {});

  const sorted = Object.entries(frequencies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([term]) => term);

  return { terms: sorted, topTerms: sorted.slice(0, 8) };
}

function extractCertifications(text) {
  const normalized = normalize(text);
  const certs = CERTIFICATION_TERMS.filter((term) => normalized.includes(term));
  return [...new Set(certs)];
}

function extractHardRequirements(text) {
  return [...new Set(extractMatches(text, HARD_SKILLS))];
}

function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function renderResults({ fitScore, hiringScore, competitionScore, fitLevel, hiringLevel, competitionLevel, gaps, signals, recommendation }) {
  document.getElementById("fit-score").textContent = `${fitScore}/100`;
  document.getElementById("hiring-score").textContent = `${hiringScore}/100`;
  document.getElementById("competition-score").textContent = `${competitionScore}/100`;
  document.getElementById("fit-progress").value = fitScore;
  document.getElementById("fit-level").textContent = fitLevel;
  document.getElementById("hiring-level").textContent = hiringLevel;
  document.getElementById("competition-level").textContent = competitionLevel;

  const recommendationEl = document.getElementById("recommendation");
  recommendationEl.textContent = `Final Recommendation: ${recommendation.label}`;
  recommendationEl.style.background = recommendation.tone === "high" ? "var(--high)" : recommendation.tone === "med" ? "var(--med)" : "var(--low)";
  recommendationEl.style.color = "#1f2937";

  const gapsList = document.getElementById("gaps");
  gapsList.innerHTML = "";
  (gaps.length ? gaps : ["No major gaps detected from available textual evidence."]).forEach((gap) => {
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
