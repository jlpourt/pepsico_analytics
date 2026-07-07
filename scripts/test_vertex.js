const { VertexAI } = require('@google-cloud/vertexai');

const PROJECT_ID = 'jamie-bq-test';
const REGIONS = [
  'us-central1', 'us-east4', 'us-west1', 'us-west4',
  'europe-west1', 'europe-west3', 'europe-west4', 'europe-west9',
  'asia-northeast1', 'asia-northeast3', 'asia-southeast1'
];
const MODELS = ['gemini-1.5-flash', 'gemini-1.5-flash-001', 'gemini-1.5-flash-002', 'gemini-1.5-pro', 'gemini-1.5-pro-001'];

async function testVertex() {
  console.log("Starting full Vertex AI region scan...");
  
  for (const region of REGIONS) {
    console.log(`\nTesting region: ${region}...`);
    const vertexAI = new VertexAI({ project: PROJECT_ID, location: region });
    
    for (const model of MODELS) {
      try {
        console.log(`  Trying model: ${model}...`);
        const generativeModel = vertexAI.getGenerativeModel({ model: model });
        
        const response = await generativeModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: 'Hello, this is a connection test. Respond with OK.' }] }],
          generationConfig: {
            temperature: 0.1,
          }
        });
        
        const text = response.response.candidates[0].content.parts[0].text;
        console.log(`    Success! Response: "${text.trim()}"`);
        console.log(`\n>>> WORKING COMBINATION FOUND: Region="${region}", Model="${model}" <<<`);
        return;
      } catch (err) {
        // Log truncated error message to keep it clean
        const errMsg = err.message.substring(0, 100);
        console.log(`    Failed: ${errMsg}...`);
      }
    }
  }
  console.log("\nAll tested model/region combinations failed.");
}

testVertex();
