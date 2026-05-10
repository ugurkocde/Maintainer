import { z } from 'zod';

export const ConfigSchema = z
  .object({
    triage: z
      .object({
        enabled: z.boolean().default(true),
        model: z.string().default('claude-sonnet-4-6'),
        auto_label: z.boolean().default(true),
        auto_dedupe: z.boolean().default(true),
      })
      .default({}),
    fix: z
      .object({
        enabled: z.boolean().default(true),
        model: z.string().default('claude-opus-4-7'),
        auto_attempt: z.boolean().default(true),
        timeout_minutes: z.number().int().positive().max(60).default(20),
        max_input_tokens: z.number().int().positive().default(500_000),
        max_output_tokens: z.number().int().positive().default(50_000),
        test_command: z.string().optional(),
        max_steps: z.number().int().positive().default(40),
      })
      .default({}),
    commands: z
      .object({
        enabled: z.boolean().default(true),
        require_write_permission: z.boolean().default(true),
        intent_model: z.string().default('claude-sonnet-4-6'),
      })
      .default({}),
    review: z
      .object({
        enabled: z.boolean().default(true),
        model: z.string().default('claude-sonnet-4-6'),
        max_input_tokens: z.number().int().positive().default(120_000),
        max_output_tokens: z.number().int().positive().default(2_000),
        block_on_reject: z.boolean().default(true),
      })
      .default({}),
    dashboard: z
      .object({
        enabled: z.boolean().default(false),
        repos: z.array(z.string()).default([]),
        output_path: z.string().default('STATUS.md'),
        open_briefing_issue: z.boolean().default(true),
      })
      .default({}),
    stale: z
      .object({
        enabled: z.boolean().default(true),
        days_until_stale: z.number().int().positive().default(60),
        days_until_close: z.number().int().positive().default(14),
        exempt_labels: z.array(z.string()).default(['pinned', 'security']),
      })
      .default({}),
    labels: z
      .object({
        prefix: z.string().default('maintainer:'),
      })
      .default({}),
    skip_label: z.string().default('maintainer:skip'),
  })
  .default({});

export type Config = z.infer<typeof ConfigSchema>;
