const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ["pdf", "docx", "txt"];

const DOMAIN_KEYWORDS = [
  "fintech", "healthcare", "edtech", "ecommerce", "saas", "cybersecurity", "cloud", "ai", "machine learning", "data", "mobile", "payments", "compliance", "devops", "product"
];

const TOOLS = [
  "javascript", "typescript", "python", "java", "react", "node", "sql", "aws", "azure", "gcp", "docker", "kubernetes", "terraform", "tableau", "power bi", "salesforce", "jira", "figma", "excel", "git"
];

const SENIORITY_LEVELS = ["intern", "junior", "mid", "senior", "lead", "staff", "principal", "manager", "director", "vp", "head"];

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
  if (!jdRaw || !resumeRaw) return;

  const jdSignals = extractJobSignals(jdRaw);
  const resumeSignals = extractResumeSignals(resumeRaw);

  const comparison = compareSignals(jdSignals, resumeSignals);
  const momentum = calculateMomentumScore(jdRaw);
  const finalScore = Math.round((comparison.fitScore * 0.65) + (momentum.score * 0.35));

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
  if (extension === "txt") {
    return file.text();
  }

  if (extension === "docx") {
    if (typeof mammoth === "undefined") {
      throw new Error("DOCX parser is unavailable.");
    }

    const arrayBuffer = await file.arrayBuffer();
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    return value;
  }

  if (extension === "pdf") {
    const pdfjs = await import("https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";

    const bytes = new Uint8Array(await file.arrayBuffer());
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;

    let text = "";
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(" ");
      text += `${pageText}\n`;
    }

    return text;
  }

  throw new Error("Unsupported file type.");
}

function extractJobSignals(text) {
  const normalized = normalize(text);
  return {
    requiredYears: extractMaxYearsRequirement(normalized),
    domainKeywords: extractMatches(normalized, DOMAIN_KEYWORDS),
    tools: extractMatches(normalized, TOOLS),
    seniority: extractSeniority(normalized),
    mandatoryWords: extractMandatoryLines(text)
  };
}

function extractResumeSignals(text) {
  const normalized = normalize(text);
  return {
    years: extractMaxYearsMentioned(normalized),
    domainKeywords: extractMatches(normalized, DOMAIN_KEYWORDS),
    tools: extractMatches(normalized, TOOLS),
    seniority: extractSeniority(normalized)
  };
}

function compareSignals(job, resume) {
  const gaps = [];
  const notes = [];

  const yearsAlignment = scoreYearsAlignment(job.requiredYears, resume.years, gaps, notes);
  const domainAlignment = scoreOverlap(job.domainKeywords, resume.domainKeywords, "domain", notes);
  const toolAlignment = scoreOverlap(job.tools, resume.tools, "tool", notes);
  const seniorityAlignment = scoreSeniority(job.seniority, resume.seniority, notes);

  const fitScore = Math.max(0, Math.min(100, Math.round(
    (yearsAlignment * 0.35) +
    (domainAlignment * 0.25) +
    (toolAlignment * 0.25) +
    (seniorityAlignment * 0.15)
  )));

  const missingMandatory = job.mandatoryWords.filter((phrase) => !normalize(resumeText.value).includes(phrase));
  if (missingMandatory.length > 0) {
    gaps.push(`Moderate Gap: No textual evidence detected for mandatory wording/skills: ${missingMandatory.join(", ")}.`);
  }

  return {
    fitScore,
    gaps,
    notes
  };
}

function scoreYearsAlignment(requiredYears, resumeYears, gaps, notes) {
  if (!requiredYears) {
    notes.push("Job description does not clearly state required years.");
    return 60;
  }

  if (!resumeYears) {
    gaps.push(`Critical Gap: Job asks for ${requiredYears}+ years, but no textual evidence detected for years of experience.`);
    return 20;
  }

  if (resumeYears < requiredYears) {
    gaps.push(`Critical Gap: Job asks for ${requiredYears}+ years; resume shows ${resumeYears} years. No textual evidence detected for full alignment.`);
    return 10;
  }

  notes.push(`Years alignment looks strong (${resumeYears} vs required ${requiredYears}).`);
  return 100;
}

function scoreOverlap(required, present, label, notes) {
  if (required.length === 0) {
    notes.push(`No explicit ${label} keywords required in the job description.`);
    return 65;
  }

  const overlap = required.filter((term) => present.includes(term));
  const ratio = overlap.length / required.length;
  notes.push(`${label[0].toUpperCase() + label.slice(1)} overlap: ${overlap.length}/${required.length}.`);
  return Math.round(ratio * 100);
}

function scoreSeniority(jobSeniority, resumeSeniority, notes) {
  if (!jobSeniority.length) {
    notes.push("No clear seniority level in the job description.");
    return 60;
  }

  const overlap = jobSeniority.filter((level) => resumeSeniority.includes(level));
  if (overlap.length > 0) {
    notes.push(`Seniority alignment signals found: ${overlap.join(", ")}.`);
    return 100;
  }

  notes.push("No textual evidence detected for direct seniority alignment.");
  return 30;
}

function calculateMomentumScore(jobText) {
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
  const resumeSkillCount = extractMatches(normalize(resumeText.value), TOOLS).length;
  if (requirementCount > 10 && resumeSkillCount < 4) {
    deductions += 10;
    notes.push("High requirement density with low resume skill alignment reduced momentum.");
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

function extractMandatoryLines(text) {
  const lines = text.split(/\n|\./).map((line) => line.trim()).filter(Boolean);
  return lines
    .filter((line) => /\b(must|required|mandatory|minimum|at least)\b/i.test(line))
    .slice(0, 6)
    .map((line) => normalize(line));
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
