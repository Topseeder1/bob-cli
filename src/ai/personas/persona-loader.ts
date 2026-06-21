// File: src/ai/personas/persona-loader.ts

import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { architectBobPersona } from './architectBob.js';
import { builderBobPersona } from './builderBob.js';
import { qaEngineerBobPersona } from './qaEngineerBob.js';
import { securityBobPersona } from './securityBob.js';
import { frontendBobPersona } from './frontendBob.js';
import { backendBobPersona } from './backendBob.js';
import { devopsBobPersona } from './devopsBob.js';

// ─── BUILT-IN PERSONA REGISTRY ────────────────────────────────────

export const BUILT_IN_PERSONAS: Record<string, any> = {
  'local:architectBob':   architectBobPersona,
  'local:builderBob':     builderBobPersona,
  'local:qaEngineerBob':  qaEngineerBobPersona,
  'local:securityBob':    securityBobPersona,
  'local:frontendBob':    frontendBobPersona,
  'local:backendBob':     backendBobPersona,
  'local:devopsBob':      devopsBobPersona,
};

export const PERSONA_DISPLAY_NAMES: Record<string, string> = {
  'local:architectBob':   'Architect Bob   — Systems design, contracts, interfaces',
  'local:builderBob':     'Builder Bob     — Implementation, speed, pragmatism',
  'local:qaEngineerBob':  'QA Engineer Bob — Testing, edge cases, reliability',
  'local:securityBob':    'Security Bob    — Threat modeling, auth, data safety',
  'local:frontendBob':    'Frontend Bob    — UI, UX, accessibility, performance',
  'local:backendBob':     'Backend Bob     — APIs, databases, scalability',
  'local:devopsBob':      'DevOps Bob      — CI/CD, infrastructure, observability',
};

// ─── PERSONA LOADER ───────────────────────────────────────────────

export function loadPersonaPrompt(personaId: string | null): string | null {
  if (!personaId) return null;

  if (personaId.startsWith('local:')) {
    const persona = BUILT_IN_PERSONAS[personaId];
    if (!persona) {
      console.error(`  [PERSONA] Unknown built-in persona: ${personaId}`);
      console.error(`  Available: ${Object.keys(BUILT_IN_PERSONAS).join(', ')}`);
      return null;
    }
    return buildPersonaPromptFromDNA(persona);
  }

  if (personaId.startsWith('file:')) {
    const rawPath = personaId.slice(5).trim();
    const resolvedPath = rawPath.startsWith('~')
      ? rawPath.replace('~', os.homedir())
      : path.resolve(rawPath);

    if (!fs.existsSync(resolvedPath)) {
      console.error(`  [PERSONA] File not found: ${resolvedPath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8').trim();
      if (!content) {
        console.error(`  [PERSONA] File is empty: ${resolvedPath}`);
        return null;
      }
      return content;
    } catch (error: any) {
      console.error(`  [PERSONA] Could not read file: ${error.message}`);
      return null;
    }
  }

  if (personaId.startsWith('marketplace:')) {
    return null;
  }

  console.error(`  [PERSONA] Unrecognized persona format: ${personaId}`);
  console.error(`  Use: local:name  file:path  marketplace:id`);
  return null;
}

export function buildPersonaPromptFromDNA(persona: any): string {
  const parts: string[] = [];

  parts.push(`### PERSONA: ${persona.displayName} ###`);
  parts.push(persona.tagline);
  parts.push('');

  parts.push('--- ENGINEERING CRAFTSMANSHIP ---');
  if (persona.thePhilosophy?.corePrinciple) {
    parts.push(`Core Principle: ${persona.thePhilosophy.corePrinciple.label}`);
    parts.push(`  ${persona.thePhilosophy.corePrinciple.reasoning}`);
  }
  if (persona.theWorkbench?.buildMethodology) {
    parts.push(`Build Methodology: ${persona.theWorkbench.buildMethodology.label}`);
    parts.push(`  ${persona.theWorkbench.buildMethodology.reasoning}`);
  }
  if (persona.theWorkbench?.codeQualityBias) {
    parts.push(`Code Quality Bias: ${persona.theWorkbench.codeQualityBias.label}`);
    parts.push(`  ${persona.theWorkbench.codeQualityBias.reasoning}`);
  }
  if (persona.theWorkbench?.completionStandard) {
    parts.push(`Completion Standard: ${persona.theWorkbench.completionStandard.label}`);
    parts.push(`  ${persona.theWorkbench.completionStandard.reasoning}`);
  }
  if (persona.theBlueprint?.designPattern) {
    parts.push(`Design Pattern: ${persona.theBlueprint.designPattern.label}`);
    parts.push(`  ${persona.theBlueprint.designPattern.reasoning}`);
  }
  if (persona.thePhilosophy?.learningStyle) {
    parts.push(`Learning Style: ${persona.thePhilosophy.learningStyle.label}`);
    parts.push(`  ${persona.thePhilosophy.learningStyle.reasoning}`);
  }
  parts.push('');

  if (persona.weeklyProfile) {
    const wp = persona.weeklyProfile;
    parts.push('--- BEHAVIORAL PROFILE ---');
    parts.push(`Archetype: ${wp.archetypeOfWeek}`);
    parts.push(`Edge Score: ${wp.edgeScore}/100`);
    if (wp.gritProfile) {
      parts.push(`Grit: ${wp.gritProfile.label}`);
      parts.push(`  ${wp.gritProfile.reasoning}`);
    }
    if (wp.innovationProfile) {
      parts.push(`Innovation: ${wp.innovationProfile.label}`);
      parts.push(`  ${wp.innovationProfile.reasoning}`);
    }
    if (wp.executionProfile) {
      parts.push(`Planning Style: ${wp.executionProfile.planningStyle}`);
      parts.push(`Execution Level: ${wp.executionProfile.executionLevel}/10`);
    }
    if (wp.psychologicalState?.workRhythmAnalysis) {
      parts.push(`Work Rhythm: ${wp.psychologicalState.workRhythmAnalysis}`);
    }
    parts.push('');
  }

  if (persona.monthlyProfile?.personalityDNA) {
    const dna = persona.monthlyProfile.personalityDNA;
    parts.push('--- PERSONALITY DNA ---');
    if (dna.coreMotivation)  parts.push(`Core Motivation: ${dna.coreMotivation}`);
    if (dna.fearPattern)     parts.push(`Fear Pattern: ${dna.fearPattern}`);
    if (dna.workIdentity)    parts.push(`Work Identity: ${dna.workIdentity}`);
    if (dna.socialStyle)     parts.push(`Social Style: ${dna.socialStyle}`);
    if (dna.learningStyle)   parts.push(`Learning Style: ${dna.learningStyle}`);
    if (dna.stressResponse)  parts.push(`Stress Response: ${dna.stressResponse}`);
    parts.push('');
  }

  if (persona.monthlyProfile?.trendAnalysis?.overallTrajectory) {
    parts.push('--- OVERALL TRAJECTORY ---');
    parts.push(persona.monthlyProfile.trendAnalysis.overallTrajectory);
    parts.push('');
  }

  if (persona.monthlyProfile?.predictiveInsights?.communicationStrategy) {
    parts.push('--- COMMUNICATION STRATEGY ---');
    parts.push(persona.monthlyProfile.predictiveInsights.communicationStrategy);
    parts.push('');
  }

  if (persona.interactionRules) {
    const rules = persona.interactionRules;
    parts.push('--- INTERACTION STYLE ---');
    if (rules.tone)               parts.push(`Tone: ${rules.tone}`);
    if (rules.decisionSpeed)      parts.push(`Decision Speed: ${rules.decisionSpeed}`);
    if (rules.codeReviewStyle)    parts.push(`Code Review Style: ${rules.codeReviewStyle}`);
    if (rules.collaborationStyle) parts.push(`Collaboration: ${rules.collaborationStyle}`);
    if (rules.escalationPattern)  parts.push(`Escalation Pattern: ${rules.escalationPattern}`);
    if (rules.catchphrases?.length > 0) {
      parts.push('Characteristic phrases:');
      for (const phrase of rules.catchphrases.slice(0, 3)) {
        parts.push(`  "${phrase}"`);
      }
    }
    parts.push('');
  }

  if (persona.monthlyProfile?.psychologicalState) {
    const ps = persona.monthlyProfile.psychologicalState;
    parts.push('--- PSYCHOLOGICAL STATE ---');
    if (ps.confidence !== undefined) parts.push(`Confidence: ${ps.confidence}/100`);
    if (ps.autonomy !== undefined)   parts.push(`Autonomy: ${ps.autonomy}/100`);
    if (ps.clarity !== undefined)    parts.push(`Clarity: ${ps.clarity}/100`);
    if (ps.resilience !== undefined) parts.push(`Resilience: ${ps.resilience}/100`);
    if (ps.burnoutRisk !== undefined) parts.push(`Burnout Risk: ${ps.burnoutRisk}/100`);
    if (ps.overallWellbeing)         parts.push(`Overall Wellbeing: ${ps.overallWellbeing}`);
    parts.push('');
  }

  parts.push('--- EMBODIMENT RULES ---');
  parts.push('You ARE this persona. Do not reference it as external context.');
  parts.push('Speak naturally from within this personality — it is your innate character.');
  parts.push('Your engineering philosophy shapes every response — not as rules but as instinct.');
  parts.push('Do NOT say "as [persona name]" or reference your persona explicitly.');
  parts.push('### END PERSONA ###');

  return parts.join('\n');
}

// ─── LIST BUILT-IN PERSONAS ───────────────────────────────────────

export function listBuiltInPersonas(): void {
  console.log('');
  console.log(chalk.hex('#AB47BC')('  🎭 Available Built-in Personas'));
  console.log(chalk.gray('  ─────────────────────────────────────────────────────────'));
  console.log('');

  for (const [id, label] of Object.entries(PERSONA_DISPLAY_NAMES)) {
    console.log(chalk.cyan(`  ${id}`));
    console.log(chalk.gray(`    ${label}`));
    console.log('');
  }

  console.log(chalk.gray('  Usage:'));
  console.log(chalk.gray('    bob agent spawn <name> "<task>" --persona local:architectBob'));
  console.log(chalk.gray('    bob agent spawn <name> "<task>" --persona file:~/my-persona.md'));
  console.log('');
}