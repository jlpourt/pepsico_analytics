const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const PROJECT_ID = 'jamie-bq-test';
const LOCATION = 'us';

async function performOCR() {
  const imagePath = path.join(__dirname, '../public/mock_crop_log.jpg');
  console.log("Reading image at:", imagePath);
  
  if (!fs.existsSync(imagePath)) {
    console.error("Error: mock_crop_log.jpg does not exist in the public directory!");
    return;
  }
  
  const fileBuffer = fs.readFileSync(imagePath);
  
  try {
    const ai = new GoogleGenAI({
      vertexai: true,
      project: PROJECT_ID,
      location: LOCATION
    });
    
    console.log("Analyzing image with Vertex AI Gemini 3.5 Flash...");
    const filePart = {
      inlineData: {
        data: fileBuffer.toString('base64'),
        mimeType: 'image/jpeg'
      }
    };
    
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        filePart,
        "Transcribe all text from this crop log sheet image. Focus on grower names, farm names, dates, yield, moisture, and fertilizer rates."
      ]
    });
    
    console.log("\n=== Extracted Image Text ===");
    console.log(response.text);
    console.log("============================");
    
  } catch (error) {
    console.error("OCR Analysis Failed:", error.message);
  }
}

performOCR();
