from __future__ import annotations

import re
from dataclasses import dataclass

import numpy as np
import spacy
from rapidfuzz import fuzz

from clusters import SKILL_CLUSTERS, build_cluster_index

CORE_ACTION_VERBS = {
    "develop",
    "manage",
    "lead",
    "design",
    "execute",
    "build",
    "implement",
    "analyze",
    "oversee",
    "create",
}

KNOWN_TOOL_PATTERNS = {
    "sql",
    "aws",
    "gcp",
    "azure",
    "jira",
    "git",
    "github",
    "linux",
    "excel",
}

CLUSTER_INDEX = build_cluster_index(SKILL_CLUSTERS)


@dataclass
class Requirement:
    text: str
    weight: int
    kind: str
    verb: str | None
    noun: str | None
    terms: list[str]


class FitScorer:
    def __init__(self, model: str = "en_core_web_sm") -> None:
        self.nlp = spacy.load(model)

    def clean_text(self, text: str) -> dict[str, list[str]]:
        doc = self.nlp(text.lower())
        tokens = [t.lemma_.strip() for t in doc if t.is_alpha and not t.is_stop]
        verbs = [t.lemma_.strip() for t in doc if t.pos_ == "VERB" and t.is_alpha]
        nouns = [chunk.lemma_.strip().lower() for chunk in doc.noun_chunks if chunk.lemma_.strip()]
        return {"tokens": tokens, "verbs": verbs, "nouns": nouns}

    def split_requirements(self, job_description: str) -> list[Requirement]:
        lines = [l.strip(" -•\t") for l in re.split(r"\n+|\u2022", job_description) if l.strip()]
        requirements: list[Requirement] = []

        for line in lines:
            normalized = line.lower()
            kind, weight = self._classify_requirement(line, normalized)
            parsed = self.clean_text(line)
            verb = next((v for v in parsed["verbs"] if v in CORE_ACTION_VERBS), None)
            noun = self._pick_main_noun(parsed["nouns"])
            terms = self._extract_terms(parsed)
            requirements.append(Requirement(text=line, weight=weight, kind=kind, verb=verb, noun=noun, terms=terms))
        return requirements

    def score(self, job_description: str, resume_text: str) -> dict:
        requirements = self.split_requirements(job_description)
        resume = self.clean_text(resume_text)
        resume_terms = set(resume["tokens"] + resume["nouns"])
        resume_verbs = set(resume["verbs"])
        resume_nouns = set(resume["nouns"] + resume["tokens"])

        weighted_score = 0.0
        total_weight = 0
        core_weighted_score = 0.0
        core_total_weight = 0

        core_gaps: list[str] = []
        important_gaps: list[str] = []
        trainable_gaps: list[str] = []

        for req in requirements:
            total_weight += req.weight
            multiplier = self._match_requirement(req, resume_terms, resume_verbs, resume_nouns)
            weighted_score += req.weight * multiplier

            if req.weight == 3:
                core_total_weight += req.weight
                core_weighted_score += req.weight * multiplier

            if np.isclose(multiplier, 0.0):
                if req.weight == 3:
                    core_gaps.append(req.text)
                elif req.weight == 2:
                    important_gaps.append(req.text)
                else:
                    trainable_gaps.append(req.text)

        fit_score = int(round((weighted_score / total_weight) * 100)) if total_weight else 0
        core_score = int(round((core_weighted_score / core_total_weight) * 100)) if core_total_weight else 0
        recommendation = "Recommended" if core_score >= 55 else "Not Recommended"

        return {
            "fit_score": fit_score,
            "core_score": core_score,
            "recommendation": recommendation,
            "gaps": {
                "core": core_gaps,
                "important": important_gaps,
                "trainable": trainable_gaps,
            },
        }

    def _classify_requirement(self, raw_line: str, normalized_line: str) -> tuple[str, int]:
        if any(verb in normalized_line for verb in CORE_ACTION_VERBS):
            return "CORE", 3

        known_skills = set(CLUSTER_INDEX) | KNOWN_TOOL_PATTERNS
        has_known_tool = any(skill in normalized_line for skill in known_skills)
        has_caps_tool = bool(re.search(r"\b[A-Z][A-Za-z0-9+#.]{1,}\b", raw_line))
        if has_known_tool or has_caps_tool:
            return "TOOL", 2

        return "SUPPORTING", 1

    def _pick_main_noun(self, nouns: list[str]) -> str | None:
        for noun in nouns:
            clean = noun.strip()
            if clean:
                return clean
        return None

    def _extract_terms(self, parsed: dict[str, list[str]]) -> list[str]:
        terms = parsed["tokens"] + parsed["nouns"]
        unique_terms = []
        seen = set()
        for term in terms:
            cleaned = term.strip().lower()
            if cleaned and cleaned not in seen:
                seen.add(cleaned)
                unique_terms.append(cleaned)
        return unique_terms

    def _match_requirement(
        self,
        req: Requirement,
        resume_terms: set[str],
        resume_verbs: set[str],
        resume_nouns: set[str],
    ) -> float:
        if req.weight == 3 and req.verb and req.noun:
            has_verb = req.verb in resume_verbs
            has_noun = req.noun in resume_nouns
            if has_verb and has_noun:
                return 1.0
            if has_noun:
                return 0.5

        if any(term in resume_terms for term in req.terms):
            return 1.0

        if self._cluster_match(req.terms, resume_terms):
            return 0.5

        if self._fuzzy_match(req.terms, resume_terms):
            return 0.75

        return 0.0

    def _cluster_match(self, req_terms: list[str], resume_terms: set[str]) -> bool:
        req_clusters = {CLUSTER_INDEX[t] for t in req_terms if t in CLUSTER_INDEX}
        if not req_clusters:
            return False
        resume_clusters = {CLUSTER_INDEX[t] for t in resume_terms if t in CLUSTER_INDEX}
        return bool(req_clusters.intersection(resume_clusters))

    def _fuzzy_match(self, req_terms: list[str], resume_terms: set[str]) -> bool:
        for req_term in req_terms:
            for resume_term in resume_terms:
                if fuzz.ratio(req_term, resume_term) > 85:
                    return True
        return False
