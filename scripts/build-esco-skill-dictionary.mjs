#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SOURCE_URL = 'https://esco.ec.europa.eu/en/use-esco/download';
const DEFAULT_OUTPUT_PATH = path.resolve('data/esco-skill-dictionary.json');

function normalizeTerm(term) {
  return String(term || '')
    .toLowerCase()
    .replace(/[•·]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseArgs(argv) {
  const args = { sourceFile: '', sourceUrl: '', output: DEFAULT_OUTPUT_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-file') args.sourceFile = argv[i + 1] || '';
    if (token === '--source-url') args.sourceUrl = argv[i + 1] || '';
    if (token === '--output') args.output = path.resolve(argv[i + 1] || DEFAULT_OUTPUT_PATH);
  }
  return args;
}

function buildDictionary(skills) {
  const canonicalToVariations = {};
  const variationToCanonical = {};

  for (const skill of skills) {
    const preferredLabel = normalizeTerm(skill?.preferredLabel?.en);
    if (!preferredLabel) continue;

    const alternatives = Array.isArray(skill?.alternativeLabel?.en)
      ? skill.alternativeLabel.en
      : [];

    const variations = new Set([preferredLabel]);
    for (const alt of alternatives) {
      const normalizedAlt = normalizeTerm(alt);
      if (normalizedAlt) variations.add(normalizedAlt);
    }

    canonicalToVariations[preferredLabel] = [...variations];
    for (const variation of variations) {
      if (!variationToCanonical[variation]) {
        variationToCanonical[variation] = preferredLabel;
      }
    }
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      canonicalSkillCount: Object.keys(canonicalToVariations).length,
      variationCount: Object.keys(variationToCanonical).length
    },
    canonicalToVariations,
    variationToCanonical
  };
}

async function loadSourceJson({ sourceFile, sourceUrl }) {
  if (sourceFile) {
    const raw = await readFile(path.resolve(sourceFile), 'utf8');
    return JSON.parse(raw);
  }

  const url = sourceUrl || DEFAULT_SOURCE_URL;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ESCO dataset from ${url}. HTTP ${response.status}.`);
  }
  return response.json();
}

function extractSkillsArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?._embedded?.results)) return payload._embedded.results;
  if (Array.isArray(payload?.skills)) return payload.skills;
  throw new Error('Unsupported ESCO skills payload shape. Expected array, { skills: [] }, or { _embedded: { results: [] } }.');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.sourceFile && !args.sourceUrl) {
    console.log('No --source-file or --source-url provided.');
    console.log('Tip: download the ESCO skills pillar JSON from the official ESCO portal, then run:');
    console.log('node scripts/build-esco-skill-dictionary.mjs --source-file /path/to/esco-skills.json');
    process.exit(1);
  }

  const payload = await loadSourceJson(args);
  const skills = extractSkillsArray(payload);
  const dictionary = buildDictionary(skills);

  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, JSON.stringify(dictionary, null, 2));
  console.log(`Wrote ${args.output}`);
  console.log(`Canonical skills: ${dictionary.meta.canonicalSkillCount}`);
  console.log(`Total variations: ${dictionary.meta.variationCount}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
