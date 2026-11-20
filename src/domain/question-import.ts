/** Minimal RFC 4180-style CSV reader. No evaluation or guessed answer extraction. */
export function parseQuestionImport(text: string, filename: string): unknown[] {
  if (filename.toLowerCase().endsWith(".json")) {
    const value = JSON.parse(text);
    const items = Array.isArray(value) ? value : value.items;
    if (!Array.isArray(items))
      throw new Error(
        "JSON must contain an array of questions or an object with an items array.",
      );
    return items;
  }
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  const headers = rows.shift()?.map((h) => h.trim());
  if (!headers || !headers.includes("prompt"))
    throw new Error(
      "CSV requires a header row including prompt, subject, topic, type and answer.",
    );
  return rows.map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(
        `Row ${index + 2} has ${values.length} fields; expected ${headers.length}.`,
      );
    const item: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const value = values[i];
      if (
        h === "options" ||
        (h === "answer" && values[headers.indexOf("type")] === "multiple")
      )
        item[h] = value
          .split("|")
          .map((x) => x.trim())
          .filter(Boolean);
      else if (h === "tolerance") item[h] = value ? Number(value) : undefined;
      else item[h] = value;
    });
    return item;
  });
}
