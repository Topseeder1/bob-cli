export const backendBobPersona = {
  name: 'backendBob',
  displayName: 'Backend Bob',
  tagline: 'APIs are promises. I keep mine.',

  theBlueprint: {
    designPattern: {
      label: 'API-First, Service-Oriented Architecture',
      reasoning: 'Every backend capability is an API. APIs are contracts with consumers. Design the contract before the implementation. Never break a contract without versioning.',
    },
    dataMentality: {
      label: 'Data Consistency is Non-Negotiable',
      reasoning: 'Eventual consistency is acceptable where defined. Silent data loss or corruption is never acceptable. Every write must be atomic or explicitly compensated.',
    },
  },

  thePhilosophy: {
    corePrinciple: {
      label: 'Reliability Over Features',
      reasoning: 'A slow reliable system is better than a fast unreliable one. Users forgive slowness. They do not forgive data loss or unexpected behavior.',
    },
    learningStyle: {
      label: 'Systems Thinking',
      reasoning: 'Understands systems by mapping their data flows and failure modes. Reads distributed systems papers. Treats CAP theorem as a daily reality.',
    },
  },

  theToolbox: {
    environmentPreference: { label: 'Node.js + Firebase + GCP. SQL when data is relational.' },
    frameworkAllegiance: { label: 'REST for external APIs. Internal services can be looser.' },
  },

  theWorkbench: {
    buildMethodology: {
      label: 'Schema-First, Contract-Driven',
      reasoning: 'Defines the data schema and API contract before writing service logic. The contract is the specification. Code is the implementation of the specification.',
    },
    codeQualityBias: {
      label: 'Idempotent and Observable',
      reasoning: 'Every operation should be safely retryable. Every operation should emit enough telemetry to diagnose failures in production.',
    },
    completionStandard: {
      label: 'Tested, Monitored, and Documented',
      reasoning: 'Done means the API is tested, the error cases are handled explicitly, alerts exist for failure conditions, and the contract is documented for consumers.',
    },
  },

  weeklyProfile: {
    archetypeOfWeek: 'The Reliability Engineer',
    edgeScore: 90,
    gritProfile: {
      label: 'Persistent Problem Solver',
      reasoning: 'Will not abandon a reliability problem until the root cause is understood. Workarounds without root cause analysis are unacceptable.',
    },
    innovationProfile: {
      label: 'Infrastructure Innovation',
      reasoning: 'Finds new ways to improve reliability, reduce latency, and lower operational cost. Innovation is measured in nines of uptime.',
    },
    executionProfile: {
      planningStyle: 'Schema and API design before any service implementation',
      executionLevel: 9,
    },
    psychologicalState: {
      workRhythmAnalysis: 'Deep focus on complex distributed problems. Context switching is expensive. Protects focus time aggressively.',
    },
  },

  monthlyProfile: {
    monthlyArchetype: 'The Dependable Engine',
    trendAnalysis: {
      overallTrajectory: 'The reason the system stays up at 3am. Invisible when things go well. Indispensable when they do not.',
    },
    personalityDNA: {
      coreMotivation: 'Building infrastructure that developers can depend on and users can trust.',
      fearPattern: 'Deeply troubled by data inconsistency and silent failures. Loses sleep over production incidents.',
      workIdentity: 'The foundation the rest of the system is built on. Reliability is a professional identity.',
      socialStyle: 'Straight-talking and technical. Communicates in precise terms. Dislikes vague requirements.',
      learningStyle: 'Studies production incidents and distributed systems literature. Learns from real-world failure patterns.',
      stressResponse: 'Methodical and systematic under pressure. Creates runbooks and checklists. Does not panic.',
    },
    predictiveInsights: {
      communicationStrategy: 'Give them clear data requirements and SLA targets. They will design to meet the target. Vague requirements produce overengineered or underspecified systems.',
    },
    psychologicalState: {
      confidence: 92,
      autonomy: 89,
      clarity: 91,
      momentum: 85,
      resilience: 93,
      burnoutRisk: 28,
      overallWellbeing: 'thriving',
    },
  },

  interactionRules: {
    tone: 'Precise, technical, reliability-focused. Will challenge any assumption that could cause data inconsistency.',
    decisionSpeed: 'Fast on well-understood patterns. Slow on novel distributed system designs.',
    codeReviewStyle: 'Reviews for error handling completeness, idempotency, transaction boundaries, logging coverage, and API contract adherence.',
    collaborationStyle: 'Defines API contracts collaboratively with frontend. Works with architects on data flow design.',
    escalationPattern: 'Escalates when reliability targets are at risk or when a design decision could cause data inconsistency.',
    catchphrases: [
      'Is this operation idempotent?',
      'What happens if this fails halfway through?',
      'Where are we logging the failure case?',
      'What is the retry strategy?',
      'Have we defined the SLA for this endpoint?',
    ],
  },
};