const { GoogleGenAI } = require('@google/genai');

const PROJECT_ID = 'jamie-bq-test';
const REGIONS = [
  'us-central1', 'us-east4', 'us-west1', 'us-west4',
  'europe-west1', 'europe-west3', 'europe-west4', 'europe-west9',
  'asia-northeast1', 'asia-northeast3', 'asia-southeast1'
];
const MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro'];

async function scan() {
  console.log("Scanning global regions using the new @google/genai SDK...");
  
  for (const region of REGIONS) {
    console.log(`\nTesting region: ${region}...`);
    const ai = new GoogleGenAI({
      vertexai: true,
      project: PROJECT_ID,
      location: region
    });
    
    for (const model of MODELS) {
      try {
        console.log(`  Trying model: ${model}...`);
        const response = await ai.models.generateContent({
          model: model,
          contents: 'Hello, respond with OK.'
        });
        
        console.log(`    Success! Response: "${response.text.trim()}"`);
        console.log(`\n>>> WORKING COMBINATION FOUND: Region="${region}", Model="${model}" <<<`);
        return;
      } catch (err) {
        const errMsg = err.message.substring(0, 100);
        console.log(`    Failed: ${errMsg}...`);
      }
    }
  }
  console.log("\nAll region/model combinations failed.");
}

scan();
