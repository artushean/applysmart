const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ["pdf", "docx", "txt"];

const DOMAIN_KEYWORDS = [
  "fintech", "healthcare", "edtech", "ecommerce", "saas", "cybersecurity", "cloud", "ai", "machine learning", "data", "mobile", "payments", "compliance", "devops", "product"
];

const TOOLS = [
  "javascript", "typescript", "python", "java", "react", "node", "sql", "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "tableau", "power bi", "salesforce", "jira", "figma", "excel", "git"
];

const SENIORITY_LEVELS = ["intern", "junior", "mid", "senior", "lead", "staff", "principal", "manager", "director", "vp", "head"];
const LEADERSHIP_VERBS = ["lead", "manage", "oversee", "supervise", "direct", "mentor", "own"];
const HARD_SKILLS = [...TOOLS, ...DOMAIN_KEYWORDS, "sql", "python", "java", "aws", "azure", "gcp", "docker", "kubernetes", "cpa", "pmp", "rn", "pe", "security+", "cissp", "ccna"];
const SOFT_SKILLS = ["communication", "team player", "detail oriented", "collaborative", "adaptable", "proactive", "organized"];
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

clearJobBtn.addEventListener("click", () => {
  jobDescription.value = "";
});

clearResumeBtn.addEventListener("click", () => {
  resumeText.value = "";
  resumeFile.value = "";
  uploadStatus.textContent = "Accepted formats: PDF, DOCX, TXT (max 5MB).";
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

    if (!extractedText.trim()) {
      throw new Error("No readable text found in the uploaded file.");
    }

    resumeText.value = extractedText.trim();
    uploadStatus.textContent = `Loaded ${file.name} into the Resume box.`;
  } catch (error) {
    showUploadError(`Text extraction failed: ${error.message}`);
  } finally {
    resumeFile.value = "";
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  hideUploadError();

  const jdRaw = jobDescription.value.trim();
  const resumeRaw = resumeText.value.trim();

  if (!jdRaw) return;
  if (!resumeRaw) {
    showUploadError("Add resume text or upload a resume before analyzing.");
    return;
  }

  const jdSignals = extractJobSignals(jdRaw);
  const resumeSignals = extractResumeSignals(resumeRaw);

  const comparison = compareSignals(jdSignals, resumeSignals);
  const momentum = calculateMomentumScore(jdRaw, resumeSignals);
  const finalScore = Math.round((comparison.fitScore * 0.7) + (momentum.score * 0.3));

  renderResults({
    fitScore: comparison.fitScore,
    momentumScore: momentum.score,
    finalScore,
    fitLevel: getFitLevel(comparison.fitScore),
    momentumLevel: getMomentumLevel(momentum.score),
    gaps: comparison.gaps,
    signals: [...comparison.notes, ...momentum.notes],
    recommendation: getRecommendation(finalScore, comparison.gaps)
  });
});

function validateFile(file) {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "File is too large. Maximum allowed size is 5MB.";
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    return "Unsupported file type. Please upload a PDF, DOCX, or TXT file.";
  }

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
  const keywords = extractKeywordProfile(normalized);
  return {
    requiredYears: extractMaxYearsRequirement(normalized),
    domainKeywords: extractMatches(normalized, DOMAIN_KEYWORDS),
    tools: extractMatches(normalized, TOOLS),
    seniority: extractSeniority(normalized),
    leadershipVerbs: extractMatches(normalized, LEADERSHIP_VERBS),
    mandatoryRequirements: extractMandatoryRequirements(text),
    requiredCertifications: extractCertifications(text),
    keywordProfile: keywords,
    hardRequirements: extractHardRequirements(normalized),
    softRequirements: extractMatches(normalized, SOFT_SKILLS)
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
    certifications: extractCertifications(text),
    keywordProfile: extractKeywordProfile(normalized),
    hardSkills: extractHardRequirements(normalized)
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

  const confidence = determineConfidence(job, resume, gaps);
  notes.push(`Confidence: ${confidence}.`);
  notes.push(`Hard requirements considered: years, mandatory skills, certifications, and seniority responsibilities.`);
  if (job.softRequirements.length) {
    notes.push(`Soft requirements detected (${job.softRequirements.join(", ")}) are informational and lightly weighted.`);
  }

  return { fitScore, gaps, notes };
}

function scoreYearsAlignment(requiredYears, resumeYears, gaps, notes) {
  if (!requiredYears) {
    notes.push("Years requirement is unclear in the job description; marked as uncertain.");
    return 60;
  }

  if (!resumeYears) {
    gaps.push(`Uncertain Gap: Job asks for ${requiredYears}+ years but resume years are unclear (No textual evidence detected).`);
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
  const matched = [];
  const missing = [];

  requirements.forEach((req) => {
    if (resumeCombined.includes(req)) matched.push(req);
    else missing.push(req);
  });

  if (missing.length) {
    gaps.push(`Moderate Gap: Mandatory requirement coverage missing for ${missing.join(", ")} (No textual evidence detected).`);
  }

  notes.push(`Mandatory requirement coverage: ${matched.length}/${requirements.length}.`);
  return Math.round((matched.length / requirements.length) * 100);
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

  if (missing.length) {
    gaps.push(`Critical Gap: Missing required certifications/licenses: ${missing.join(", ")} (No textual evidence detected).`);
  }

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

function determineConfidence(job, resume, gaps) {
  const jdEvidence = job.keywordProfile.terms.length + job.mandatoryRequirements.length + job.requiredCertifications.length;
  const resumeEvidence = resume.keywordProfile.terms.length + resume.hardSkills.length + resume.certifications.length;
  if (gaps.some((gap) => gap.startsWith("Critical Gap"))) return "Medium";
  if (jdEvidence < 5 || resumeEvidence < 5) return "Low";
  return "High";
}

function calculateMomentumScore(jobText, resumeSignals) {
  const notes = [];
  const postingAge = Number(document.getElementById("posting-age").value);
  const repostStatus = Number(document.getElementById("repost-status").value);
  const applicationPath = Number(document.getElementById("application-path").value);
  const salaryWidth = Number(document.getElementById("salary-width").value);

  let deductions = postingAge + repostStatus + applicationPath + salaryWidth;

  if (postingAge >= 24) notes.push("Strong posting-age penalty applied after 14 days.");
  if (repostStatus >= 12) notes.push("Repost penalty applied.");
  if (applicationPath >= 8) notes.push("Easy Apply introduces a slight momentum penalty.");
  if (applicationPath <= -8) notes.push("Direct company careers page improved momentum.");
  if (salaryWidth >= 8) notes.push("Very wide salary range slightly reduced momentum.");

  const requirementCount = (normalize(jobText).match(/\b(required|must|need to|minimum|at least|preferred)\b/g) || []).length;
  if (requirementCount > 10 && resumeSignals.hardSkills.length < 4) {
    deductions += 10;
    notes.push("High requirement density with low hard-skill evidence reduced momentum.");
  }

  const score = Math.max(0, Math.min(100, 100 - deductions));
  return { score, notes };
}

function getRecommendation(finalScore, gaps) {
  const hasCritical = gaps.some((gap) => gap.startsWith("Critical Gap"));
  if (hasCritical || finalScore < 45) return "Low Priority";
  if (finalScore < 70) return "Apply If Strong Fit";
  return "Apply Now";
}

function getFitLevel(score) {
  if (score >= 75) return "Fit Level: Strong";
  if (score >= 50) return "Fit Level: Moderate";
  return "Fit Level: Weak";
}

function getMomentumLevel(score) {
  if (score >= 75) return "Momentum Level: High";
  if (score >= 50) return "Momentum Level: Medium";
  return "Momentum Level: Low";
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

  return {
    terms: sorted,
    topTerms: sorted.slice(0, 8)
  };
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

function renderResults({ fitScore, momentumScore, finalScore, fitLevel, momentumLevel, gaps, signals, recommendation }) {
  document.getElementById("fit-score").textContent = `${fitScore}/100`;
  document.getElementById("momentum-score").textContent = `${momentumScore}/100`;
  document.getElementById("final-score").textContent = `${finalScore}/100`;
  document.getElementById("fit-level").textContent = fitLevel;
  document.getElementById("momentum-level").textContent = momentumLevel;
  document.getElementById("recommendation").textContent = `Final Recommendation: ${recommendation}`;

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
