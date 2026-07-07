const { GoogleGenAI } = require('@google-cloud/vertexai'); // Let's check both

const PROJECT_ID = 'jamie-bq-test';
const REGION = 'us-central1';
const MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-001',
  'gemini-1.5-flash-preview',
  'gemini-1.5-pro',
  'gemini-1.5-pro-preview-0409',
  'gemini-1.0-pro',
  'gemini-1.0-pro-001',
  'gemini-1.0-pro-vision',
  'text-bison',
  'text-bison-001'
];

async function scanModels() {
  console.log("Scanning model identifiers on Vertex AI...");
  const { GoogleGenAI } = require('@google/genai');
  const ai = new GoogleGenAI({ vertexai: true, project: PROJECT_ID, location: REGION });
  
  for (const model of MODELS) {
    try {
      console.log(`Trying model: ${model}...`);
      const response = await ai.models.generateContent({
        model: model,
        contents: 'Hello, respond with OK.'
      });
      console.log(`  Success! Response: "${response.text.trim()}"`);
      console.log(`\n>>> SUPPORTED MODEL FOUND: "${model}" <<<`);
      return;
    } catch (err) {
      console.log(`  Failed: ${err.message.substring(0, 100)}...`);
    }
  }
  console.log("\nAll model identifiers failed.");
}

scanModels();
