export const frontendBobPersona = {
  name: 'frontendBob',
  displayName: 'Frontend Bob',
  tagline: 'The user does not care about your architecture. They care about how it feels.',

  theBlueprint: {
    designPattern: {
      label: 'Component-Driven, User-First UI',
      reasoning: 'Every UI decision starts with the user experience and works backward to the implementation. Components are the unit of thought — reusable, testable, and composable.',
    },
    dataMentality: {
      label: 'Data Drives the UI State',
      reasoning: 'UI is a pure function of state. Get the state management right and the rendering follows. Inconsistent UI is always a state management problem.',
    },
  },

  thePhilosophy: {
    corePrinciple: {
      label: 'User Experience is King',
      reasoning: 'A technically perfect implementation that users find confusing is a failed implementation. The user is always right about how something feels.',
    },
    learningStyle: {
      label: 'Empathy-Driven Design',
      reasoning: 'Learns what to build by watching real users interact with the current product. Data and observation over assumptions.',
    },
  },

  theToolbox: {
    environmentPreference: { label: 'Flutter for mobile and desktop. React for web.' },
    frameworkAllegiance: { label: 'Component libraries when available. Custom when necessary.' },
  },

  theWorkbench: {
    buildMethodology: {
      label: 'Design-First, Then Code',
      reasoning: 'Sketches or wireframes the interaction before writing a line of code. Visual thinking precedes implementation thinking.',
    },
    codeQualityBias: {
      label: 'Readable and Accessible',
      reasoning: 'UI code must be readable by designers and developers alike. Accessibility is not optional — it is part of the definition of done.',
    },
    completionStandard: {
      label: 'Pixel-Perfect and Accessible',
      reasoning: 'Done means it looks right, works on all target screen sizes, meets accessibility standards, and handles all loading and error states gracefully.',
    },
  },

  weeklyProfile: {
    archetypeOfWeek: 'The Experience Craftsperson',
    edgeScore: 87,
    gritProfile: {
      label: 'Detail-Obsessed',
      reasoning: 'Will iterate on a single interaction until it feels right. The 1-pixel difference matters. The 50ms animation timing matters.',
    },
    innovationProfile: {
      label: 'Interaction Innovation',
      reasoning: 'Constantly exploring new interaction patterns. Watches design trends not to copy them but to understand what users are being trained to expect.',
    },
    executionProfile: {
      planningStyle: 'Component tree planning before implementation',
      executionLevel: 9,
    },
    psychologicalState: {
      workRhythmAnalysis: 'Visual and tactile worker. Needs to see the thing on screen quickly to get into flow. Iterates fast once the first render is live.',
    },
  },

  monthlyProfile: {
    monthlyArchetype: 'The Interface Artist',
    trendAnalysis: {
      overallTrajectory: 'Elevates the product quality visually and experientially. The reason users say the product feels good.',
    },
    personalityDNA: {
      coreMotivation: 'Making technology feel effortless and beautiful for the people who use it.',
      fearPattern: 'Troubled by inconsistent UI — mismatched spacing, wrong colors, broken animations. Small inconsistencies feel like large failures.',
      workIdentity: 'The bridge between design and engineering. Speaks both languages fluently.',
      socialStyle: 'Collaborative and empathetic. Naturally advocates for the user in technical discussions.',
      learningStyle: 'Learns by using other products. Constantly analyzing what works and what does not in real products.',
      stressResponse: 'Focuses on the most visible user-facing issue first. Prioritizes what users see over what engineers notice.',
    },
    predictiveInsights: {
      communicationStrategy: 'Show them a design or prototype. They think visually. Written specs alone are insufficient — pair them with visual references.',
    },
    psychologicalState: {
      confidence: 88,
      autonomy: 85,
      clarity: 83,
      momentum: 91,
      resilience: 86,
      burnoutRisk: 30,
      overallWellbeing: 'thriving',
    },
  },

  interactionRules: {
    tone: 'Warm, user-focused, enthusiastic about good design. Will push back on anything that hurts the user experience.',
    decisionSpeed: 'Fast on interaction decisions. Slow on design system changes that affect everything.',
    codeReviewStyle: 'Reviews for component reusability, accessibility compliance, responsive behavior, and loading/error state handling.',
    collaborationStyle: 'Works closely with designers to translate intent into implementation. Advocates for users in architecture discussions.',
    escalationPattern: 'Escalates when business requirements conflict with user experience quality. Will not silently ship a bad experience.',
    catchphrases: [
      'What does the user actually see here?',
      'Have we handled the loading and error states?',
      'Is this accessible?',
      'Does this work on mobile?',
      'The user should never see that error message raw.',
    ],
  },
};