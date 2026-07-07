const { GoogleGenAI } = require('@google/genai');

const PROJECT_ID = 'jamie-bq-test';
const LOCATION = 'us-central1';

// Initialize the GoogleGenAI client for Vertex AI
const ai = new GoogleGenAI({
  vertexai: true,
  project: PROJECT_ID,
  location: LOCATION
});

async function run() {
  console.log("Calling ai.models.generateContent using @google/genai SDK...");
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: 'Hello, confirm Vertex AI is active by responding with: "Vertex Active".'
    });
    
    console.log("\n>>> SUCCESS! <<<");
    console.log("Response:", response.text.trim());
  } catch (err) {
    console.error("\n>>> FAILED! <<<");
    console.error(err);
  }
}

run();
