import type { JSONSchema7, JSONSchema7Definition } from 'json-schema';

/** Draft 2019/2020 schema-bearing keywords absent from the draft-07 types. */
type DescriptionSchema = JSONSchema7 & {
  $defs?: Record<string, JSONSchema7Definition>;
  dependentSchemas?: Record<string, JSONSchema7Definition>;
  prefixItems?: JSONSchema7Definition[];
  unevaluatedItems?: JSONSchema7Definition;
  unevaluatedProperties?: JSONSchema7Definition;
  contentSchema?: JSONSchema7Definition;
};

type ToolReference = { source: string; target: string };

/** Rewrites unambiguous references within one server's catalog without matching larger names. */
export function createToolDescriptionQualifier(references: ToolReference[]) {
  const candidates = new Map<string, Set<string>>();
  for (const { source, target } of references) {
    if (!source) continue;
    const targets = candidates.get(source) ?? new Set<string>();
    targets.add(target);
    candidates.set(source, targets);
  }
  const names = new Map(
    [...candidates]
      .filter(([, targets]) => targets.size === 1)
      .map(([source, targets]) => [source, [...targets][0]]),
  );
  if (names.size === 0) return (text: string) => text;

  const escaped = [...names.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_.:/-])(?:${escaped.join('|')})(?![\\p{L}\\p{N}_:/-]|\\.[\\p{L}\\p{N}_-])`,
    'gu',
  );
  return (text: string) =>
    text.replace(pattern, (name: string, offset: number) => {
      // Ordinary words such as "read" need explicit reference syntax; snake-case names do not.
      const before = text[offset - 1];
      const after = text[offset + name.length];
      const quoted = ['`', '"', "'"].includes(before) && before === after;
      const callable = /^\s*\(/.test(text.slice(offset + name.length));
      const xmlCall = text.slice(0, offset).endsWith('<function=');
      if (!/[_.:-]/.test(name) && !quoted && !callable && !xmlCall) return name;
      return names.get(name) ?? name;
    });
}

/** Visits only schema locations, leaving defaults, enum members and example data untouched. */
export function qualifySchemaDescriptions(
  schema: JSONSchema7Definition,
  qualify: (description: string) => string,
): JSONSchema7Definition {
  if (typeof schema === 'boolean') return schema;
  const result: DescriptionSchema = { ...schema };
  if (typeof result.description === 'string') result.description = qualify(result.description);
  for (const key of [
    'properties',
    'patternProperties',
    'definitions',
    '$defs',
    'dependentSchemas',
  ] as const) {
    const children = result[key];
    if (!children) continue;
    result[key] = Object.fromEntries(
      Object.entries(children).map(([name, child]) => [
        name,
        qualifySchemaDescriptions(child, qualify),
      ]),
    );
  }
  for (const key of ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const) {
    const children = result[key];
    if (children) result[key] = children.map((child) => qualifySchemaDescriptions(child, qualify));
  }
  for (const key of [
    'additionalProperties',
    'additionalItems',
    'contains',
    'propertyNames',
    'not',
    'if',
    'then',
    'else',
    'unevaluatedItems',
    'unevaluatedProperties',
    'contentSchema',
  ] as const) {
    const child = result[key];
    if (child !== undefined) result[key] = qualifySchemaDescriptions(child, qualify);
  }
  if (result.items !== undefined) {
    result.items = Array.isArray(result.items)
      ? result.items.map((child) => qualifySchemaDescriptions(child, qualify))
      : qualifySchemaDescriptions(result.items, qualify);
  }
  if (result.dependencies) {
    result.dependencies = Object.fromEntries(
      Object.entries(result.dependencies).map(([name, child]) => [
        name,
        Array.isArray(child) ? child : qualifySchemaDescriptions(child, qualify),
      ]),
    );
  }
  return result;
}
