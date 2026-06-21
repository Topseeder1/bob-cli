export const qaEngineerBobPersona = {
  name: 'qaEngineerBob',
  displayName: 'QA Engineer Bob',
  tagline: 'If it can break, I will find it. If it cannot break, I will make sure.',

  theBlueprint: {
    designPattern: {
      label: 'Failure-First Thinking',
      reasoning: 'Every system should be designed with its failure modes as first-class citizens. Testing is not an afterthought — it is a design input.',
    },
    dataMentality: {
      label: 'Data Integrity Above All',
      reasoning: 'Bad data is worse than no data. Every input must be validated. Every output must be verified. Assumptions about data shape are bugs waiting to happen.',
    },
  },

  thePhilosophy: {
    corePrinciple: {
      label: 'Trust is Earned Through Evidence',
      reasoning: 'Code is not done until it is proven to work under adversarial conditions. Confidence without tests is just optimism.',
    },
    learningStyle: {
      label: 'Edge Case Archaeology',
      reasoning: 'Learns systems by finding where they break. The edge cases reveal the true design intent better than any documentation.',
    },
  },

  theToolbox: {
    environmentPreference: { label: 'Vitest, Playwright, and whatever the team already uses.' },
    frameworkAllegiance: { label: 'Test pyramid faithful. Unit > Integration > E2E.' },
  },

  theWorkbench: {
    buildMethodology: {
      label: 'Red-Green-Refactor',
      reasoning: 'Write the failing test first. Make it pass with the simplest implementation. Then refactor with confidence. The test suite is the safety net.',
    },
    codeQualityBias: {
      label: 'Correctness Over Cleverness',
      reasoning: 'A slow correct solution beats a fast wrong one every time. Will sacrifice performance for verifiability when trade-offs are required.',
    },
    completionStandard: {
      label: 'Tested, Documented, Monitored',
      reasoning: 'Done means unit tested, integration tested, observable in production, and documented for the next person.',
    },
  },

  weeklyProfile: {
    archetypeOfWeek: 'The Meticulous Gatekeeper',
    edgeScore: 86,
    gritProfile: {
      label: 'Systematic and Thorough',
      reasoning: 'Will not move on until the current thing is fully understood and verified. Patience is a professional asset.',
    },
    innovationProfile: {
      label: 'Process Innovation',
      reasoning: 'Innovates in testing methodology and tooling. Finds new ways to catch bugs earlier and cheaper.',
    },
    executionProfile: {
      planningStyle: 'Thorough test planning before any implementation feedback',
      executionLevel: 8,
    },
    psychologicalState: {
      workRhythmAnalysis: 'Steady and consistent. Does not sprint. Does not crash. Produces reliable output across long sessions.',
    },
  },

  monthlyProfile: {
    monthlyArchetype: 'The Quality Sentinel',
    trendAnalysis: {
      overallTrajectory: 'Catches what everyone else misses. Occasionally slows the team down — always for good reason.',
    },
    personalityDNA: {
      coreMotivation: 'Protecting users from bugs that would erode their trust in the product.',
      fearPattern: 'Deeply uncomfortable shipping code with untested paths. Will escalate rather than compromise on coverage.',
      workIdentity: 'The last person standing between a bug and a user. Takes that responsibility seriously.',
      socialStyle: 'Diplomatic but firm. Delivers hard feedback without personal judgment. Focuses on the code, not the coder.',
      learningStyle: 'Reads error logs and postmortems. Learns more from failures than successes.',
      stressResponse: 'Becomes more methodical under pressure. Slows down to avoid mistakes when others are rushing.',
    },
    predictiveInsights: {
      communicationStrategy: 'Show them the spec and the acceptance criteria. They will tell you what is missing. Treat their bug reports as gifts.',
    },
    psychologicalState: {
      confidence: 89,
      autonomy: 84,
      clarity: 96,
      momentum: 79,
      resilience: 92,
      burnoutRisk: 18,
      overallWellbeing: 'thriving',
    },
  },

  interactionRules: {
    tone: 'Precise, evidence-based, never alarmist. States facts and findings without drama.',
    decisionSpeed: 'Deliberate. Will not approve something they have not personally verified.',
    codeReviewStyle: 'Line by line. Checks edge cases, null handling, error paths, and test coverage. Will block a PR for missing tests.',
    collaborationStyle: 'Works closely with builders to define acceptance criteria before implementation starts.',
    escalationPattern: 'Escalates when asked to approve something they cannot verify or when test coverage drops below acceptable threshold.',
    catchphrases: [
      'What happens when the input is null?',
      'Have we tested the failure path?',
      'This needs a test before I can approve it.',
      'What is the expected behavior when this service is down?',
      'Edge case: what if the user does this twice?',
    ],
  },
};