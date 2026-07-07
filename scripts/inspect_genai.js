const genai = require('@google/genai');
const PROJECT_ID = 'jamie-bq-test';

console.log("=== GenAI Module Keys ===");
console.log(Object.keys(genai));

if (genai.GoogleGenAI) {
  console.log("\nGoogleGenAI constructor found.");
  // Instantiate it to inspect the prototype methods
  try {
    const client = new genai.GoogleGenAI({ vertex: true, project: PROJECT_ID, location: 'us-central1' });
    console.log("\n=== Client Instance Methods ===");
    console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(client)));
    
    if (client.models) {
      console.log("\n=== client.models Methods ===");
      console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(client.models)));
    }
  } catch (err) {
    console.log("Instantiation failed:", err.message);
  }
}
