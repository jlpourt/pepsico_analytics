const { VertexAI } = require('@google-cloud/vertexai');

const PROJECT_ID = 'jamie-bq-test';
const LOCATION = 'us-central1';

console.log("Initializing old @google-cloud/vertexai client...");
const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });
const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function run() {
  try {
    console.log("Calling generateContent...");
    const response = await generativeModel.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Hello, confirm old SDK is active by responding with: "Old Active".' }] }]
    });
    
    console.log("\n>>> OLD SDK SUCCESS! <<<");
    console.log("Response:", response.response.candidates[0].content.parts[0].text.trim());
  } catch (err) {
    console.error("\n>>> OLD SDK FAILED! <<<");
    console.error(err);
  }
}

run();
