export type IssueType =
  | "TypeError"
  | "ReferenceError"
  | "SyntaxError"
  | "Undefined Value"
  | "Null Access"
  | "Property Access Error"
  | "Unknown Issue";

export function classifyIssue(input: string): IssueType {
  const text = input.toLowerCase();

  if (
    /syntaxerror/.test(text) ||
    /unexpected token/.test(text) ||
    /invalid or unexpected token/.test(text) ||
    /unterminated string/.test(text)
  ) {
    return "SyntaxError";
  }

  if (/referenceerror/.test(text) || /\bis not defined\b/.test(text)) {
    return "ReferenceError";
  }

  if (
    /cannot read (?:properties|property) of null/.test(text) ||
    /null is not an object/.test(text)
  ) {
    return "Null Access";
  }

  if (
    /undefined/.test(text) &&
    (/cannot read/.test(text) ||
      /cannot set/.test(text) ||
      /reading/.test(text) ||
      /access/.test(text))
  ) {
    return "Undefined Value";
  }

  if (
    /cannot read (?:properties|property) of/.test(text) ||
    /cannot set (?:properties|property) of/.test(text) ||
    /has no properties/.test(text) ||
    /has no property/.test(text)
  ) {
    return "Property Access Error";
  }

  if (/typeerror/.test(text)) {
    return "TypeError";
  }

  return "Unknown Issue";
}
