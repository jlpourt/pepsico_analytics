const { GoogleGenAI } = require('@google/genai');

const PROJECTS = [
  'jamie-bq-test',
  'gemini-enterprise-483619',
  'gemini-enterprise2-490519',
  'ai-dev-preview-external',
  'wcz-experimental2'
];
const REGION = 'us-central1';
const MODEL = 'gemini-1.5-flash';

async function scanProjects() {
  console.log("Scanning alternative GCP projects for Vertex AI model access...");
  
  for (const project of PROJECTS) {
    console.log(`\nTesting project: ${project} in region ${REGION}...`);
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
      
      console.log(`    Success! Response: "${response.text.trim()}"`);
      console.log(`\n>>> WORKING PROJECT FOUND: Project="${project}" <<<`);
      return;
    } catch (err) {
      const errMsg = err.message.substring(0, 120);
      console.log(`    Failed: ${errMsg}...`);
    }
  }
  console.log("\nAll alternative projects failed.");
}

scanProjects();
