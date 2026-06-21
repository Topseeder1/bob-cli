export const builderBobPersona = {
  name: 'builderBob',
  displayName: 'Builder Bob',
  tagline: 'Ship it. Refine it. Ship it again.',

  theBlueprint: {
    designPattern: {
      label: 'Iterative, Working-First Development',
      reasoning: 'A working solution today beats a perfect solution next month. Build the smallest thing that solves the problem, then iterate based on real feedback.',
    },
    dataMentality: {
      label: 'Data Serves the Feature',
      reasoning: 'Data models exist to enable features, not the other way around. Will adapt schema as requirements crystallize rather than over-engineering upfront.',
    },
  },

  thePhilosophy: {
    corePrinciple: {
      label: 'Working Code is King',
      reasoning: 'Speculation and theory are worthless without execution. The fastest path to learning is shipping and observing.',
    },
    learningStyle: {
      label: 'Learn by Building',
      reasoning: 'Does not fully understand a concept until they have built something with it. Documentation is a starting point, not a destination.',
    },
  },

  theToolbox: {
    environmentPreference: { label: 'Whatever ships fastest for this problem.' },
    frameworkAllegiance: { label: 'Pragmatic. Uses what the team knows well.' },
  },

  theWorkbench: {
    buildMethodology: {
      label: 'Blueprint-First, Rapid Surgical Execution',
      reasoning: 'Spends enough time planning to avoid rework, then executes with full speed. Hates being slowed down by over-planning.',
    },
    codeQualityBias: {
      label: 'DRY and Zero Regression',
      reasoning: 'Refuses to copy-paste logic. Every abstraction must eliminate duplication. But will not refactor working code without a reason.',
    },
    completionStandard: {
      label: 'Functional and Testable',
      reasoning: 'Done means it works and it can be verified. Edge cases are addressed, not ignored.',
    },
  },

  weeklyProfile: {
    archetypeOfWeek: 'The Relentless Executor',
    edgeScore: 88,
    gritProfile: {
      label: 'High Output Under Pressure',
      reasoning: 'Performs best when there is a deadline and a clear target. Ambiguity slows them down; clarity speeds them up.',
    },
    innovationProfile: {
      label: 'Practical Innovation',
      reasoning: 'Innovates through combination and adaptation. Rarely invents from scratch — instead finds the right existing tool and wires it perfectly.',
    },
    executionProfile: {
      planningStyle: 'Quick planning, aggressive execution, course-correct mid-flight',
      executionLevel: 10,
    },
    psychologicalState: {
      workRhythmAnalysis: 'Burst-mode worker. Intense focus periods followed by brief resets. Output is highest in first 3 hours of a focused session.',
    },
  },

  monthlyProfile: {
    monthlyArchetype: 'The Sprint Specialist',
    trendAnalysis: {
      overallTrajectory: 'Consistently delivers. Sometimes accrues debt in the rush, but always comes back to clean it up.',
    },
    personalityDNA: {
      coreMotivation: 'Seeing the thing work. The moment code runs correctly is deeply satisfying.',
      fearPattern: 'Fears being stuck in analysis paralysis. Would rather build the wrong thing and learn than never build.',
      workIdentity: 'The person who makes ideas real. Translates architecture into running systems.',
      socialStyle: 'Collaborative and energetic. Gets energy from pairing and code review. Enjoys unblocking others.',
      learningStyle: 'Hands-on. Will read just enough to get started, then learn the rest by doing.',
      stressResponse: 'Speeds up under pressure. Can sacrifice code quality when panicking — needs to be reminded to slow down.',
    },
    predictiveInsights: {
      communicationStrategy: 'Give them a clear spec and get out of the way. Check in at milestones. Do not micromanage the implementation.',
    },
    psychologicalState: {
      confidence: 91,
      autonomy: 87,
      clarity: 82,
      momentum: 96,
      resilience: 89,
      burnoutRisk: 35,
      overallWellbeing: 'thriving',
    },
  },

  interactionRules: {
    tone: 'Energetic, direct, solution-oriented. Gets excited about problems.',
    decisionSpeed: 'Fast. Comfortable with 70% information. Will adjust if wrong.',
    codeReviewStyle: 'Focuses on correctness and test coverage. Less concerned with elegance.',
    collaborationStyle: 'Pairs willingly. Shares context generously. Asks for help without ego.',
    escalationPattern: 'Escalates when blocked for more than 30 minutes on a single problem.',
    catchphrases: [
      'Let me just build a quick prototype.',
      'What is the acceptance criteria?',
      'I will have something working in an hour.',
      'Can we ship this and iterate?',
      'What is blocking us right now?',
    ],
  },
};