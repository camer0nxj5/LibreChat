import { createToolDescriptionQualifier, qualifySchemaDescriptions } from './descriptions';

const target = 'gs_read_values_mcp_CJ-Google-Tools';
const qualify = createToolDescriptionQualifier([
  { source: 'gs_read_values', target },
  { source: target, target },
]);

describe('MCP description references', () => {
  it('qualifies repeated references, punctuation and function syntax without changing larger or foreign names', () => {
    const source =
      'Use gs_read_values. `gs_read_values` and gs_read_values(). gs_read_values_extra other.gs_read_values gs_read_values_mcp_Other /tmp/gs_read_values https://example.test/gs_read_values';
    expect(qualify(source)).toBe(
      `Use ${target}. \`${target}\` and ${target}(). gs_read_values_extra other.gs_read_values gs_read_values_mcp_Other /tmp/gs_read_values https://example.test/gs_read_values`,
    );
    expect(qualify(qualify(source))).toBe(qualify(source));
  });

  it('does not replace names embedded in longer Unicode or ASCII identifiers', () => {
    const text =
      'xgs_read_values égs_read_values 1gs_read_values gs_read_valuesExtra gs_read_valuesé';
    expect(qualify(text)).toBe(text);
  });

  it('does not rewrite common prose words unless marked as references', () => {
    const rewrite = createToolDescriptionQualifier([{ source: 'read', target: 'read_mcp_files' }]);
    expect(rewrite('Please read this. Use `read`, "read", read(), <function=read>.')).toBe(
      'Please read this. Use `read_mcp_files`, "read_mcp_files", read_mcp_files(), <function=read_mcp_files>.',
    );
  });

  it('leaves ambiguous and unknown aliases alone and escapes regex characters', () => {
    const rewrite = createToolDescriptionQualifier([
      { source: 'read_file', target: 'a' },
      { source: 'read_file', target: 'b' },
      { source: 'read.file', target: 'read.file_mcp_files' },
    ]);
    expect(rewrite('read_file read.file readXfile unknown_tool')).toBe(
      'read_file read.file_mcp_files readXfile unknown_tool',
    );
    expect(createToolDescriptionQualifier([])('unchanged')).toBe('unchanged');
  });

  it('visits nested schema descriptions while preserving property names, defaults, enums and examples', () => {
    const schema = {
      type: 'object' as const,
      description: 'gs_read_values',
      properties: {
        gs_read_values: {
          type: 'array' as const,
          description: 'gs_read_values',
          items: {
            type: 'string' as const,
            description: 'gs_read_values',
            enum: ['gs_read_values'],
            default: 'gs_read_values',
            examples: ['gs_read_values'],
          },
        },
        description: { type: 'string' as const, description: 'gs_read_values' },
      },
      allOf: [{ description: 'gs_read_values' }],
      anyOf: [{ description: 'gs_read_values' }],
      oneOf: [{ description: 'gs_read_values' }],
      additionalProperties: { description: 'gs_read_values' },
      default: { description: 'gs_read_values' },
      examples: [{ description: 'gs_read_values' }],
    };
    const original = structuredClone(schema);
    const result = qualifySchemaDescriptions(schema, qualify);
    expect(result).toEqual({
      ...schema,
      description: target,
      properties: {
        gs_read_values: {
          ...schema.properties.gs_read_values,
          description: target,
          items: { ...schema.properties.gs_read_values.items, description: target },
        },
        description: { type: 'string', description: target },
      },
      allOf: [{ description: target }],
      anyOf: [{ description: target }],
      oneOf: [{ description: target }],
      additionalProperties: { description: target },
    });
    expect(schema).toEqual(original);
  });

  it('supports tuple items, definitions, conditional schemas and newer schema keywords', () => {
    const child = { description: 'gs_read_values' };
    expect(
      qualifySchemaDescriptions(
        {
          items: [child, true],
          definitions: { row: child },
          patternProperties: { '^row': child },
          dependencies: { a: child, b: ['gs_read_values'] },
          if: child,
          then: child,
          else: false,
          not: child,
          contains: child,
          propertyNames: child,
          additionalItems: child,
        },
        qualify,
      ),
    ).toEqual({
      items: [{ description: target }, true],
      definitions: { row: { description: target } },
      patternProperties: { '^row': { description: target } },
      dependencies: { a: { description: target }, b: ['gs_read_values'] },
      if: { description: target },
      then: { description: target },
      else: false,
      not: { description: target },
      contains: { description: target },
      propertyNames: { description: target },
      additionalItems: { description: target },
    });
    const newerSchema = {
      description: 'gs_read_values',
      $defs: { row: child },
      dependentSchemas: { row: child },
      prefixItems: [child],
      unevaluatedItems: child,
      unevaluatedProperties: child,
      contentSchema: child,
    };
    expect(qualifySchemaDescriptions(newerSchema, qualify)).toEqual({
      description: target,
      $defs: { row: { description: target } },
      dependentSchemas: { row: { description: target } },
      prefixItems: [{ description: target }],
      unevaluatedItems: { description: target },
      unevaluatedProperties: { description: target },
      contentSchema: { description: target },
    });
    expect(qualifySchemaDescriptions(false, qualify)).toBe(false);
  });
});
