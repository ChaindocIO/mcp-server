import type { ZodTypeAny } from "zod";

/**
 * Minimal Zod → JSON Schema converter. The MCP TS SDK supports passing
 * raw JSON Schema in `inputSchema`, so we convert here at registration
 * time and don't pull a heavy dependency.
 *
 * For richer features (unions, refinements, descriptions everywhere), swap
 * this for the `zod-to-json-schema` package.
 */
export function zodToJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  const def = (schema as unknown as { _def: ZodDef })._def;
  return convert(def);
}

interface ZodDef {
  typeName: string;
  description?: string;
  innerType?: { _def: ZodDef };
  defaultValue?: () => unknown;
  values?: string[];
  shape?: () => Record<string, ZodTypeAny>;
  type?: ZodTypeAny;
  options?: ZodTypeAny[];
  checks?: Array<{ kind: string; value?: number; regex?: RegExp; message?: string }>;
  unknownKeys?: string;
}

function convert(def: ZodDef): Record<string, unknown> {
  const description = def.description;
  const base: Record<string, unknown> = {};
  if (description) base["description"] = description;

  switch (def.typeName) {
    case "ZodString": {
      base["type"] = "string";
      for (const c of def.checks ?? []) {
        if (c.kind === "min" && c.value !== undefined) base["minLength"] = c.value;
        if (c.kind === "max" && c.value !== undefined) base["maxLength"] = c.value;
        if (c.kind === "uuid") base["format"] = "uuid";
        if (c.kind === "email") base["format"] = "email";
        if (c.kind === "url") base["format"] = "uri";
        if (c.kind === "datetime") base["format"] = "date-time";
        if (c.kind === "regex" && c.regex) base["pattern"] = c.regex.source;
      }
      return base;
    }
    case "ZodNumber": {
      base["type"] = "number";
      for (const c of def.checks ?? []) {
        if (c.kind === "int") base["type"] = "integer";
        if (c.kind === "min" && c.value !== undefined) base["minimum"] = c.value;
        if (c.kind === "max" && c.value !== undefined) base["maximum"] = c.value;
      }
      return base;
    }
    case "ZodBoolean":
      base["type"] = "boolean";
      return base;
    case "ZodLiteral":
      base["const"] = (def as unknown as { value: unknown }).value;
      return base;
    case "ZodEnum":
      base["type"] = "string";
      base["enum"] = def.values;
      return base;
    case "ZodArray": {
      base["type"] = "array";
      const inner = (def as unknown as { type: ZodTypeAny }).type;
      base["items"] = zodToJsonSchema(inner);
      return base;
    }
    case "ZodObject": {
      base["type"] = "object";
      const shape = def.shape!();
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const valueDef = (value as unknown as { _def: ZodDef })._def;
        properties[key] = convert(valueDef);
        const isOptional =
          valueDef.typeName === "ZodOptional" || valueDef.typeName === "ZodDefault";
        if (!isOptional) required.push(key);
      }
      base["properties"] = properties;
      if (required.length > 0) base["required"] = required;
      base["additionalProperties"] = def.unknownKeys === "passthrough";
      return base;
    }
    case "ZodOptional":
    case "ZodDefault":
    case "ZodNullable": {
      const inner = def.innerType!;
      const result = convert(inner._def);
      if (def.typeName === "ZodNullable") {
        const t = result["type"];
        if (typeof t === "string") result["type"] = [t, "null"];
      }
      return result;
    }
    case "ZodUnion": {
      base["anyOf"] = (def.options ?? []).map((o) => zodToJsonSchema(o));
      return base;
    }
    case "ZodEffects": {
      const inner = (def as unknown as { schema: ZodTypeAny }).schema;
      return zodToJsonSchema(inner);
    }
    default:
      // Fallback: permissive schema — covers ZodAny, ZodUnknown, etc.
      return { ...base };
  }
}
