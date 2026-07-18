// Shared name normalization. Used by every ingest path (Wikidata, CPL,
// heritage) and mirrored by the autocomplete search so "felix sanchez" matches
// the accented "Felix Sanchez" (KTD4, AE2). Keep this the single
// implementation -- divergent accent-stripping across ingest paths would
// corrupt identity matching.

// Sanitize a raw string ingested from an external source before it is stored
// and later rendered in every player's browser. Strips angle brackets and
// control characters so a compromised or adversarial source cannot inject
// markup. The UI additionally renders via text nodes (never innerHTML), so this
// is defense in depth, not the only barrier.
export function sanitize(value) {
  if (value == null) return "";
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Fold to a normalized key: strip diacritics, lowercase, collapse whitespace.
// The accented form of "Felix Sanchez" folds to "felix sanchez".
export function normalizeName(value) {
  return sanitize(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining diacritical marks
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
