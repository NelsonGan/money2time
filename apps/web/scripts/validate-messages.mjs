import fs from "node:fs";
import path from "node:path";

const messagesDir = path.resolve("messages");
const source = readJson(path.join(messagesDir, "en.json"));
const locales = fs
  .readdirSync(messagesDir)
  .filter((file) => file.endsWith(".json"))
  .map((file) => file.replace(/\.json$/, ""))
  .sort();

const tokenPattern = /(\{[A-Za-z][A-Za-z0-9_]*\}|<\/?(?:book|cost|time)>)/g;
const errors = [];

/**
 * A regional catalog such as `en-my` only carries the strings that differ
 * from `en.json`; `src/i18n/request.ts` merges the rest in at runtime. Those
 * are checked as a subset — every key they do define must exist upstream with
 * the same shape and placeholders, which is what catches a typo'd key.
 */
const isOverride = (locale) => locale.includes("-");

for (const locale of locales) {
  const target = readJson(path.join(messagesDir, `${locale}.json`));
  const partial = isOverride(locale);
  compareShape(source, target, locale, partial);
  compareTokens(source, target, locale, partial);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Validated ${locales.length} message catalog(s).`);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function compareShape(expected, actual, pathLabel, partial = false) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      errors.push(`${pathLabel}: expected array`);
      return;
    }

    if (expected.length !== actual.length) {
      errors.push(
        `${pathLabel}: expected array length ${expected.length}, got ${actual.length}`,
      );
    }

    expected.forEach((item, index) => {
      compareShape(item, actual[index], `${pathLabel}[${index}]`, partial);
    });
    return;
  }

  if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
      errors.push(`${pathLabel}: expected object`);
      return;
    }

    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();

    if (partial) {
      const unknown = actualKeys.filter((key) => !(key in expected));
      if (unknown.length > 0) {
        errors.push(`${pathLabel}: key(s) not in en.json: ${unknown.join(", ")}`);
      }
    } else if (expectedKeys.join("|") !== actualKeys.join("|")) {
      errors.push(
        `${pathLabel}: key mismatch expected ${expectedKeys.join(", ")} got ${actualKeys.join(", ")}`,
      );
    }

    expectedKeys
      .filter((key) => !partial || key in actual)
      .forEach((key) => {
        compareShape(expected[key], actual[key], `${pathLabel}.${key}`, partial);
      });
    return;
  }

  if (typeof actual !== "string") {
    errors.push(`${pathLabel}: expected string leaf`);
  }
}

function compareTokens(expected, actual, pathLabel, partial = false) {
  if (Array.isArray(expected)) {
    expected.forEach((item, index) => {
      compareTokens(item, actual[index], `${pathLabel}[${index}]`, partial);
    });
    return;
  }

  if (expected && typeof expected === "object") {
    Object.keys(expected)
      .filter((key) => !partial || (actual && key in actual))
      .forEach((key) => {
        compareTokens(expected[key], actual[key], `${pathLabel}.${key}`, partial);
      });
    return;
  }

  const expectedTokens = tokens(expected);
  const actualTokens = tokens(actual);
  if (expectedTokens.join("|") !== actualTokens.join("|")) {
    errors.push(
      `${pathLabel}: token mismatch expected ${expectedTokens.join(", ")} got ${actualTokens.join(", ")}`,
    );
  }
}

function tokens(value) {
  return String(value).match(tokenPattern)?.sort() ?? [];
}
