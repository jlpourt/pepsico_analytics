# 🥔 AgriFlow: Frito-Lay PepsiCo Agronomic Analytics

AgriFlow is a high-fidelity agronomic analytics dashboard and mobile verification portal built to ingest, clean, audit, and visualize agricultural data streams from John Deere Operations Center. 

The application is deployed live on Google Cloud Run and integrated directly with a Google BigQuery Data Warehouse.

🌐 **Production URL:** [https://pepsico-analytics-694576205607.us-central1.run.app](https://pepsico-analytics-694576205607.us-central1.run.app)

---

## 🛠️ Technology Stack
* **Frontend:** Next.js 16 (React, Tailwind CSS, Leaflet GIS Maps, Lucide Icons)
* **Data Warehouse:** Google BigQuery (Structured telemetry, chemical logs, and yield metrics)
* **Generative AI / OCR:** Vertex AI (Gemini 3.5 Flash for unstructured document extraction and conversational natural language queries)
* **Deployment:** Google Cloud Run (Containerized via Cloud Build)

---

## 💡 Core Features

### 1. GIS Map Drill-down & Splitting Panel
* **Interactive Leaflet Map:** Displays crop fields using actual geospatial `POLYGON` boundaries stored in BigQuery.
* **Double-Click Coordinates Zooming:** Zooms directly into field coordinate ranges.
* **Telemetry Drill-down Split:** Clicking any field polygon slides in an agronomic panel showing:
  * **Crop Telemetry:** Variety, moisture %, defect rate, and total yield.
  * **Machinery Logs:** John Deere machine model, area seeded, applied vs. target seeding rate, and productivity (ac/hr).
  * **Satellite Telemetry:** Vegetation Index (NDVI), Soil Moisture, and Surface Temperature.

### 2. Stage-Filtered Mobile Review Portal
Agronomists can upload John Deere receipt PDFs, application summaries, and harvest logs. AgriFlow parses them using Vertex AI Gemini OCR and filters verification forms by **Agricultural Stage**:
* 🌱 **Seeding Stage:** Exposes *Foundation Critical* parameters and *Machinery Telemetry* (planting rates/deviations).
* 🧪 **Protection (Application) Stage:** Exposes *Foundation Critical* parameters and *Advanced Insights* (fertilizer NPK rates, active ingredients, sprout inhibitors).
* 🚜 **Harvest Stage:** Exposes *Foundation Critical* parameters and *Foundation Recommended* yield, moisture, and grading metrics.

### 3. Precision Analytics Graphs
* **Variety Yields Bar Chart:** Displays yield averages per crop variety with floating interactive tooltips, scale-on-hover animations, and variety filtering.
* **Moisture Target Zone Scatter Plot:** Tracks batch moisture outliers. Features target crop selectors (Potatoes, Soybeans, Corn) that dynamically adjust green optimal humidity ranges.
* **Machinery Fuel Burn Rate Chart:** Analyzes fuel rates (gal/ac) by crop variety. Includes warning indicators for heavy fuel consumption (>1.5 gal/ac).
* **Seeding Precision Deviation:** Monitors deviation percentages between actual seeding rates and planned targets.

---

## 📂 Project Directory Structure

```text
├── pepsico_data/               # Real John Deere seeding, chemical application, and harvest logs
├── scripts/
│   └── setup_bigquery.py       # BigQuery schema definitions & chronological stage data seed script
├── src/
│   ├── app/
│   │   ├── api/                # Next.js API endpoints for BigQuery querying, uploading, and chatbot Q&A
│   │   └── page.js             # Main page router
│   ├── components/
│   │   ├── AnalyticsDashboard.jsx  # Main desktop dashboard with SVG charts
│   │   ├── AgroPartnerPortal.jsx   # Mobile verification Maker-Checker portal
│   │   └── InteractiveMap.jsx      # Leaflet GIS Map container
│   └── services/
│       ├── db.js               # BigQuery client connector
│       └── vertex.js           # Vertex AI Gemini document parser and conversational queries helper
├── README.md                   # Project documentation
└── pepsico_data_dictionary.md  # Frito-Lay parameter definitions and quality validation rules
```

---

## 🚀 Setup & Deployment

### 1. Database Setup & Seeding
Configure your Google Cloud SDK credentials and run the BigQuery script to create tables and seed stage-separated records:
```bash
python3 scripts/setup_bigquery.py
```

### 2. Run Local Development
Install dependencies and launch the dev server:
```bash
npm install
npm run dev
```

### 3. Deploy to Google Cloud Run
Build the container and deploy live:
```bash
gcloud run deploy pepsico-analytics --source . --region us-central1
```
