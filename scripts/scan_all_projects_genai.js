const { GoogleGenAI } = require('@google/genai');

const PROJECTS = [
  'ai-dev-preview-external',
  'aipp-load-testing',
  'athos-test',
  'automl-artifacts-test',
  'data-analytics-golden-v1-share',
  'geeee-ea',
  'gemini-enterprise-483619',
  'gemini-enterprise2-490519',
  'jamie-bq-test',
  'jira-geeee',
  'mgae-big-query',
  'shopifytest-347120',
  'wcz-experimental2'
];
const REGION = 'us-central1';
const MODEL = 'gemini-1.5-flash';

async function scanAll() {
  console.log("Scanning all active account projects for Vertex AI Gemini capability...");
  
  for (const project of PROJECTS) {
    console.log(`\nTesting project: ${project}...`);
    const ai = new GoogleGenAI({
      vertexai: true,
      project: project,
      location: REGION
    });
    
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: 'Hello, respond with OK.'
      });
      
      console.log(`    SUCCESS! Project "${project}" works! Response: "${response.text.trim()}"`);
      console.log(`\n>>> WORKING PROJECT FOUND: ${project} <<<`);
      return;
    } catch (err) {
      const errMsg = err.message.substring(0, 120);
      console.log(`    Failed: ${errMsg}...`);
    }
  }
  console.log("\nAll project scans completed. No accessible projects with active generative endpoints found.");
}

scanAll();
