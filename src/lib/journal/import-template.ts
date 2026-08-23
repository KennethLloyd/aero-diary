import { z } from 'zod';

export const journalImportMoodDefinitionSchema = z
  .object({
    name: z.string().trim().min(1),
    target: z.enum(['AWFUL', 'BAD', 'MEH', 'GOOD', 'RAD']),
  })
  .passthrough();

export const journalImportActivityDefinitionSchema = z
  .object({
    name: z.string().trim().min(1),
    emoji: z.string().trim().min(1).max(16).optional(),
  })
  .passthrough();

const schemaMetadataSchema = z
  .object({
    moods: z.array(journalImportMoodDefinitionSchema).min(1),
    tags: z.array(journalImportActivityDefinitionSchema).min(1),
  })
  .passthrough()
  .superRefine((schema, context) => {
    for (const [field, definitions] of [
      ['moods', schema.moods],
      ['tags', schema.tags],
    ] as const) {
      const seen = new Set<string>();
      definitions.forEach((definition, index) => {
        const key = definition.name.trim().toLowerCase();
        if (seen.has(key)) {
          context.addIssue({
            code: 'custom',
            path: [field, index, 'name'],
            message: `${field} names must be unique case-insensitively`,
          });
        }
        seen.add(key);
      });
    }
  });

const photoPathSchema = z
  .string()
  .trim()
  .regex(/^photos\/[a-zA-Z0-9._-]+$/, 'Photo paths must use photos/<filename>.');

export const journalImportEntrySchema = z
  .object({
    id: z.number().int().nonnegative(),
    date: z.iso.datetime({ offset: true }),
    mood: z.string().trim().min(1),
    moodId: z.number().int().optional(),
    note: z.string(),
    tags: z.array(z.string().trim().min(1)),
    tagIds: z.array(z.number().int()).default([]),
    isFavorite: z.boolean().default(false),
    photoPaths: z.array(photoPathSchema).default([]),
  })
  .passthrough();

export const journalImportTemplateSchema = z
  .object({
    schema: schemaMetadataSchema,
    entries: z.array(journalImportEntrySchema),
  })
  .passthrough();

export type JournalImportTemplate = z.infer<typeof journalImportTemplateSchema>;
export type JournalImportEntry = z.infer<typeof journalImportEntrySchema>;
export type JournalImportMoodDefinition = z.infer<typeof journalImportMoodDefinitionSchema>;
export type JournalImportActivityDefinition = z.infer<typeof journalImportActivityDefinitionSchema>;
