import { z } from "zod";
import { HELP_FEATURE_IDS } from "./helpFeatures";
import { HELP_AUDIENCES, HELP_TASK_IDS } from "./helpTasks";

export type { HelpAudience } from "./helpTasks";

const nonEmptyStringSchema = z.string().trim().min(1);
const contentIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "kebab-caseのコンテンツIDを指定してください");

function uniqueStringArraySchema(label: string) {
  return z
    .array(nonEmptyStringSchema)
    .default([])
    .superRefine((values, context) => {
      const seen = new Set<string>();
      for (const [index, value] of values.entries()) {
        if (seen.has(value)) {
          context.addIssue({
            code: "custom",
            path: [index],
            message: `${label}の値「${value}」が重複しています`,
          });
        }
        seen.add(value);
      }
    });
}

const commonShape = {
  title: nonEmptyStringSchema,
  task: z.enum(HELP_TASK_IDS),
  audience: z.enum(HELP_AUDIENCES),
  keywords: uniqueStringArraySchema("keywords"),
  featureIds: uniqueStringArraySchema("featureIds").pipe(z.array(z.enum(HELP_FEATURE_IDS))),
  related: uniqueStringArraySchema("related").pipe(z.array(contentIdSchema)),
  order: z.number().int().positive(),
};

const faqFrontmatterSchema = z
  .object({
    kind: z.literal("faq"),
    ...commonShape,
    primaryGuide: contentIdSchema.optional(),
    homeFeatured: z.boolean().default(false),
  })
  .strict();

const guideFrontmatterSchema = z
  .object({
    kind: z.literal("guide"),
    ...commonShape,
    homeFeatured: z.literal(false).default(false),
  })
  .strict();

export const helpFrontmatterSchema = z.discriminatedUnion("kind", [faqFrontmatterSchema, guideFrontmatterSchema]);

export type HelpFrontmatter = z.infer<typeof helpFrontmatterSchema>;
export type FaqFrontmatter = Extract<HelpFrontmatter, { kind: "faq" }>;
export type GuideFrontmatter = Extract<HelpFrontmatter, { kind: "guide" }>;

export function parseHelpFrontmatter(frontmatter: unknown, id: string): HelpFrontmatter {
  const parsed = helpFrontmatterSchema.safeParse(frontmatter);
  if (!parsed.success) {
    throw new Error(`ヘルプ「${id}」のfrontmatterが正しくありません: ${parsed.error.message}`);
  }
  return parsed.data;
}
