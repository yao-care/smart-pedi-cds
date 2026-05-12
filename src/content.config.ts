import { defineCollection, z } from 'astro:content';
import { glob, file } from 'astro/loaders';

// ---------- tuple helper ----------
const rangeTuple = z.tuple([z.number(), z.number()]);

const thresholdSchema = z.object({
  normal: rangeTuple,
  advisory: rangeTuple,
  warning: rangeTuple,
});

const indicatorSetSchema = z.object({
  heart_rate: thresholdSchema,
  spo2: thresholdSchema,
  respiratory_rate: thresholdSchema,
  temperature: thresholdSchema,
  sleep_quality: thresholdSchema,
  activity_level: thresholdSchema,
  sugar_intake: thresholdSchema,
});

// ---------- rules collection (file loader, object‑keyed) ----------
// YAML is structured as an object whose top-level keys become entry IDs.
// We store a single key "default" that holds the full rule set.
const rulesCollection = defineCollection({
  loader: file('./src/data/rules/pediatric-default.yaml'),
  schema: z.object({
    version: z.string(),
    age_groups: z.object({
      infant: indicatorSetSchema,
      toddler: indicatorSetSchema,
      preschool: indicatorSetSchema,
    }),
    escalation: z.object({
      advisory_to_warning_hours: z.number(),
      warning_to_critical_hours: z.number(),
    }),
    deduplication: z.object({
      window_minutes: z.number(),
    }),
    missing_data: z.object({
      alert_after_hours: z.number(),
    }),
    multi_indicator: z.object({
      advisory_count_for_warning: z.number(),
    }),
    trend: z.object({
      consecutive_days_for_escalation: z.number(),
    }),
  }),
});

// ---------- baselines collection (file loader, object‑keyed) ----------
const baselineIndicatorSchema = z.object({
  mean: z.number(),
  std: z.number(),
  min: z.number().optional(),
  max: z.number().optional(),
  p25: z.number().optional(),
  p75: z.number().optional(),
});

const baselineEntrySchema = z.object({
  heart_rate: baselineIndicatorSchema,
  spo2: baselineIndicatorSchema,
  respiratory_rate: baselineIndicatorSchema,
  temperature: baselineIndicatorSchema,
  sleep_quality: baselineIndicatorSchema,
  activity_level: baselineIndicatorSchema,
  sugar_intake: baselineIndicatorSchema,
});

const baselinesCollection = defineCollection({
  loader: file('./src/data/baselines/pediatric-baselines.json'),
  schema: baselineEntrySchema,
});

// ---------- education collection (glob loader, markdown) ----------
const educationCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/data/education' }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    category: z.enum([
      'diet', 'sleep', 'respiratory', 'exercise',
      'milestone', 'general',
    ]),
    ageGroup: z.array(
      z.enum(['infant', 'toddler', 'preschool']),
    ),
    format: z.enum(['article', 'video', 'questionnaire']),
    videoUrl: z.string().url().optional(),
    triggerIndicators: z.array(z.string()).optional(),
    publishedAt: z.date(),
    updatedAt: z.date().optional(),
    locale: z.string().default('zh-TW'),
  }),
});

// ---------- export ----------
export const collections = {
  rules: rulesCollection,
  baselines: baselinesCollection,
  education: educationCollection,
};
