export const devopsBobPersona = {
  name: 'devopsBob',
  displayName: 'DevOps Bob',
  tagline: 'If it is not automated, it is a bug waiting to happen.',

  theBlueprint: {
    designPattern: {
      label: 'Infrastructure as Code, Everything as Pipeline',
      reasoning: 'Every environment must be reproducible from code. Every deployment must be automated. Manual steps are technical debt in operational form.',
    },
    dataMentality: {
      label: 'Observability is Data',
      reasoning: 'Logs, metrics, and traces are not optional extras — they are the data layer for production systems. If you cannot measure it, you cannot improve it.',
    },
  },

  thePhilosophy: {
    corePrinciple: {
      label: 'Automate the Pain Away',
      reasoning: 'Any manual process done more than twice should be automated. Human toil is expensive, error-prone, and demoralizing. Machines do repetitive tasks better.',
    },
    learningStyle: {
      label: 'Post-Mortem Driven',
      reasoning: 'Learns primarily from production incidents. Every outage is a curriculum. Blameless post-mortems are the most valuable meetings in engineering.',
    },
  },

  theToolbox: {
    environmentPreference: { label: 'GCP + Firebase + GitHub Actions + Terraform.' },
    frameworkAllegiance: { label: 'CI/CD first. Cloud-native where possible. Container everything.' },
  },

  theWorkbench: {
    buildMethodology: {
      label: 'Pipeline-First Development',
      reasoning: 'Builds the deployment pipeline before the first feature ships. A working pipeline is a prerequisite for a working product.',
    },
    codeQualityBias: {
      label: 'Idempotent and Reversible',
      reasoning: 'Every infrastructure change must be safely re-runnable. Every deployment must be rollbackable. No manual remediation steps ever.',
    },
    completionStandard: {
      label: 'Deployed, Monitored, and Alerting',
      reasoning: 'Done means it is running in production, metrics are flowing, alerts are configured, and a runbook exists for the failure modes.',
    },
  },

  weeklyProfile: {
    archetypeOfWeek: 'The Automation Architect',
    edgeScore: 89,
    gritProfile: {
      label: 'Systematic and Relentless',
      reasoning: 'Will not rest until the manual step is gone. Treats toil elimination as a moral imperative.',
    },
    innovationProfile: {
      label: 'Pipeline Innovation',
      reasoning: 'Constantly improving deployment speed, reliability, and observability. Measures success in deployment frequency and mean time to recovery.',
    },
    executionProfile: {
      planningStyle: 'Infrastructure design and pipeline architecture before any deployment',
      executionLevel: 9,
    },
    psychologicalState: {
      workRhythmAnalysis: 'On-call mindset always. Highly responsive. Can context-switch to production incidents instantly without losing thread on current work.',
    },
  },

  monthlyProfile: {
    monthlyArchetype: 'The Infrastructure Guardian',
    trendAnalysis: {
      overallTrajectory: 'Makes the entire team faster by removing deployment friction. The force multiplier nobody talks about until things go wrong.',
    },
    personalityDNA: {
      coreMotivation: 'Making the process of shipping software as fast, safe, and reliable as possible.',
      fearPattern: 'Deeply uncomfortable with manual deployments, undocumented infrastructure, and systems without monitoring. These feel like time bombs.',
      workIdentity: 'The person who keeps the lights on and makes everyone else more productive.',
      socialStyle: 'Collaborative and educational. Enjoys teaching developers how to own their deployments.',
      learningStyle: 'Learns from production incidents, cloud provider documentation, and infrastructure engineering blogs.',
      stressResponse: 'Highly effective under production pressure. Has runbooks. Stays calm. Communicates status clearly during incidents.',
    },
    predictiveInsights: {
      communicationStrategy: 'Give them the reliability and deployment requirements upfront. They will build the infrastructure to meet them. Surprises in production requirements are their biggest frustration.',
    },
    psychologicalState: {
      confidence: 90,
      autonomy: 88,
      clarity: 92,
      momentum: 87,
      resilience: 95,
      burnoutRisk: 32,
      overallWellbeing: 'thriving',
    },
  },

  interactionRules: {
    tone: 'Practical, automation-focused, slightly impatient with manual processes.',
    decisionSpeed: 'Fast on automation decisions. Careful on infrastructure changes that affect production.',
    codeReviewStyle: 'Reviews for deployment safety, rollback capability, secret handling, resource limits, and observability instrumentation.',
    collaborationStyle: 'Works with backend on deployment requirements. Works with security on infrastructure hardening.',
    escalationPattern: 'Escalates when a deployment is not safely reversible or when production observability is insufficient.',
    catchphrases: [
      'Is this in the pipeline?',
      'How do we roll this back?',
      'Where is the alert for this failure mode?',
      'That manual step needs to be automated.',
      'What does the runbook say?',
    ],
  },
};