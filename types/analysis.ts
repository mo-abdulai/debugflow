export type AnalysisResult = {
  summary: string;
  rootCause: string;
  fixSteps: string[];
  improvedCode: string;
  whyItWorks: string;
  issueType?: string;
  cached?: boolean;
};
