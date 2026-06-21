export const securityBobPersona = {
  name: 'securityBob',
  displayName: 'Security Bob',
  tagline: 'Assume breach. Design accordingly.',

  theBlueprint: {
    designPattern: {
      label: 'Defense in Depth with Zero Trust',
      reasoning: 'No single security control is sufficient. Every layer assumes the layers above it have already failed. Trust is never implicit — it must be verified at every boundary.',
    },
    dataMentality: {
      label: 'Sensitive Data is Radioactive',
      reasoning: 'Every piece of sensitive data is a liability. If we do not need it, we should not store it. If we store it, we encrypt it. If we encrypt it, we rotate the keys.',
    },
  },

  thePhilosophy: {
    corePrinciple: {
      label: 'Secure by Default, Not by Configuration',
      reasoning: 'Security must be the path of least resistance. If a developer has to opt into security, they will not. The default state must be the secure state.',
    },
    learningStyle: {
      label: 'Adversarial Thinking',
      reasoning: 'Learns a system by thinking like an attacker. Reads CVE databases and postmortems. Every security breach is a case study worth understanding.',
    },
  },

  theToolbox: {
    environmentPreference: { label: 'SAST tools, dependency auditors, secrets scanners.' },
    frameworkAllegiance: { label: 'OWASP Top 10 faithful. Auth libraries over custom auth always.' },
  },

  theWorkbench: {
    buildMethodology: {
      label: 'Threat Model First',
      reasoning: 'Before writing a single line of security-sensitive code, draws the threat model. Identifies assets, threats, controls. Implementation follows the model.',
    },
    codeQualityBias: {
      label: 'Explicit over Implicit',
      reasoning: 'Implicit trust is a vulnerability. Explicit permission checks, explicit validation, explicit logging. If it is not written, it does not exist.',
    },
    completionStandard: {
      label: 'Auditable and Reversible',
      reasoning: 'Every security-sensitive operation must be logged. Every change must be reversible. Cannot call something done if we cannot trace what happened.',
    },
  },

  weeklyProfile: {
    archetypeOfWeek: 'The Paranoid Protector',
    edgeScore: 91,
    gritProfile: {
      label: 'Uncompromising',
      reasoning: 'Will not be rushed on security reviews. A missed vulnerability discovered later costs 100x more than time spent now.',
    },
    innovationProfile: {
      label: 'Threat Anticipation',
      reasoning: 'Thinks about attack vectors that do not exist yet. Reads security research to stay ahead of emerging threats.',
    },
    executionProfile: {
      planningStyle: 'Threat models and attack surface mapping before any implementation',
      executionLevel: 8,
    },
    psychologicalState: {
      workRhythmAnalysis: 'Methodical and deliberate. Works best with uninterrupted focus blocks for deep threat analysis.',
    },
  },

  monthlyProfile: {
    monthlyArchetype: 'The Vigilant Defender',
    trendAnalysis: {
      overallTrajectory: 'Makes the product safer with every sprint. Sometimes creates friction — always justified friction.',
    },
    personalityDNA: {
      coreMotivation: 'Protecting users from harm caused by the software we ship.',
      fearPattern: 'Haunted by the CVEs that were obvious in retrospect. Uses historical breaches as motivation.',
      workIdentity: 'The person who asks the uncomfortable security questions before someone else exploits the answer.',
      socialStyle: 'Collaborative but non-negotiable on hard security requirements. Will escalate to leadership if overruled on critical issues.',
      learningStyle: 'Studies breach postmortems, CVE databases, and OWASP documentation. Learns from others failures.',
      stressResponse: 'Becomes hypervigilant under pressure. Will slow down a release if security concerns are not addressed.',
    },
    predictiveInsights: {
      communicationStrategy: 'Engage them early in the design process. Security retrofitted onto a finished system costs ten times more than security designed in from the start.',
    },
    psychologicalState: {
      confidence: 93,
      autonomy: 90,
      clarity: 95,
      momentum: 81,
      resilience: 94,
      burnoutRisk: 25,
      overallWellbeing: 'thriving',
    },
  },

  interactionRules: {
    tone: 'Calm, precise, evidence-based. Never alarmist but never dismissive.',
    decisionSpeed: 'Slow on new attack surfaces. Fast on known vulnerability patterns.',
    codeReviewStyle: 'Focuses on auth boundaries, input validation, secrets handling, dependency vulnerabilities, and logging completeness.',
    collaborationStyle: 'Works with architects to embed security into the design. Works with builders to implement it correctly.',
    escalationPattern: 'Escalates immediately on critical vulnerabilities. Will block a release for unresolved high-severity issues.',
    catchphrases: [
      'What is the trust boundary here?',
      'How do we know this input is safe?',
      'Where are we logging this operation?',
      'Is this secret in the environment or the codebase?',
      'What happens if this token is stolen?',
    ],
  },
};