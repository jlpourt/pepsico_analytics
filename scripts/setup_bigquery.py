import json
import subprocess
import random
from datetime import datetime, timedelta

def run_bq_command(args):
    """Run a bq command and return the result."""
    cmd = ["bq"] + args
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error executing command: {' '.join(cmd)}")
        print(result.stderr)
        return False, result.stderr
    return True, result.stdout

def setup_bigquery():
    print("Setting up BigQuery dataset and tables...")
    
    # 1. Create dataset if not exists
    # Using Location 'US'
    create_dataset_sql = "CREATE SCHEMA IF NOT EXISTS agriflow OPTIONS(location='US')"
    success, output = run_bq_command(["query", "--use_legacy_sql=false", create_dataset_sql])
    if not success:
        return False
    print("Dataset 'agriflow' verified/created.")

    # 2. Define grower_submissions table SQL
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS agriflow.grower_submissions (
      id STRING NOT NULL,
      fieldName STRING,
      variety STRING,
      country STRING,
      vendorName STRING,
      growerName STRING,
      cropSeason STRING,
      fieldLocation STRING,
      region STRING,
      vendorContact STRING,
      cipcApplied STRING,
      activeIngredientRate FLOAT64,
      irrigationType STRING,
      nApplied FLOAT64,
      nTotal FLOAT64,
      pTotal FLOAT64,
      kTotal FLOAT64,
      vrtUsed STRING,
      fertilizerType STRING,
      fertilizerNature STRING,
      nitrogenAnalysis FLOAT64,
      ammoniaPercentage FLOAT64,
      nitricPercentage FLOAT64,
      ureaPercentage FLOAT64,
      phosphateAnalysis FLOAT64,
      potassiumAnalysis FLOAT64,
      applicationRate FLOAT64,
      applicationMethod STRING,
      emissionsInhibitors STRING,
      applicationDate DATE,
      agronomistName STRING,
      moisturePercentage FLOAT64,
      defectRate FLOAT64,
      yieldTons FLOAT64,
      submissionStatus STRING,
      submissionTimestamp TIMESTAMP
    )
    """
    success, output = run_bq_command(["query", "--use_legacy_sql=false", create_table_sql])
    if not success:
        return False
    print("Table 'agriflow.grower_submissions' verified/created.")
    
    # 3. Seed historical records
    # Generate realistic crop logs
    seed_records = generate_seed_data()
    
    # Write to a temporary newline-delimited JSON (NDJSON) file
    ndjson_path = "ndjson_seed.json"
    with open(ndjson_path, "w") as f:
        for r in seed_records:
            f.write(json.dumps(r) + "\n")
            
    print(f"Generated {len(seed_records)} seed records. Loading into BigQuery...")
    
    # 4. Load NDJSON into grower_submissions (using replace to ensure clean seed)
    success, output = run_bq_command([
        "load", 
        "--source_format=NEWLINE_DELIMITED_JSON", 
        "--replace", 
        "agriflow.grower_submissions", 
        ndjson_path
    ])
    
    # Remove temp file
    import os
    if os.path.exists(ndjson_path):
        os.remove(ndjson_path)
        
    if not success:
        print("Failed to seed records.")
        return False
        
    print("Successfully seeded BigQuery table 'agriflow.grower_submissions' with historical crop analytics!")
    return True

def generate_seed_data():
    records = []
    
    # Static parameters
    growers = [
        {"name": "Sarah Jenkins", "vendor": "Jenkins Agro Ltd", "contact": "sarah.j@jenkinsagro.com", "country": "USA", "region": "NA"},
        {"name": "John Miller", "vendor": "Midwest Spuds Inc", "contact": "john@midwestspuds.com", "country": "USA", "region": "NA"},
        {"name": "David Smith", "vendor": "Idaho Spud Farms", "contact": "david@idahospuds.com", "country": "USA", "region": "NA"},
        {"name": "Rajesh Patel", "vendor": "Patel Agri Ventures", "contact": "rajesh@patelagri.in", "country": "IND", "region": "AMESA"},
        {"name": "Amina El-Sayed", "vendor": "Nile Delta Harvest", "contact": "amina@nileharvest.eg", "country": "EGY", "region": "AMESA"},
        {"name": "Vikram Singh", "vendor": "Punjab Agri Corp", "contact": "vikram@punjabagri.in", "country": "IND", "region": "AMESA"},
        {"name": "Carlos Gomez", "vendor": "Gomez Farms SA", "contact": "carlos.g@gomezfarms.mx", "country": "MEX", "region": "LATAM"},
        {"name": "Mateo Silva", "vendor": "Silva Organics", "contact": "mateo@silvaorganics.br", "country": "BRA", "region": "LATAM"},
        {"name": "Renata Carvalho", "vendor": "Carvalho Agro", "contact": "renata@carvalhoagro.br", "country": "BRA", "region": "LATAM"}
    ]
    
    varieties = ["Atlantic", "Snowden", "Frito-Lay Proprietary (FL-1867)", "Low Glycemic"]
    irrigation_types = ["Drip", "Center Pivot", "Flood", "Rainfed"]
    fertilizers = [
        {"type": "Urea", "nature": "Mineral", "n": 46.0, "p": 0.0, "k": 0.0, "urea": 100.0, "ammonia": 0.0, "nitric": 0.0},
        {"type": "NPK 15-15-15", "nature": "Mineral", "n": 15.0, "p": 15.0, "k": 15.0, "urea": 40.0, "ammonia": 30.0, "nitric": 30.0},
        {"type": "Compost", "nature": "Organic", "n": 2.5, "p": 1.2, "k": 1.8, "urea": 0.0, "ammonia": 10.0, "nitric": 0.0}
    ]
    agronomists = ["David Vance", "Jane Smith", "Alistair Green", "Sophia Martinez"]
    
    random.seed(42) # Deterministic seeding
    
    # Generate 60 records distributed across seasons
    for i in range(1, 61):
        submission_id = f"SUB-{20000 + i}"
        grower = random.choice(growers)
        variety = random.choice(varieties)
        season = random.choice(["2025", "2026"])
        agron = random.choice(agronomists)
        
        # Geolocation polygon approximations (clustered close to each other per country)
        if grower["country"] == "USA":
            lat, lon = 44.0 + random.uniform(-0.1, 0.1), -84.0 + random.uniform(-0.1, 0.1)
        elif grower["country"] == "IND":
            lat, lon = 22.0 + random.uniform(-0.1, 0.1), 77.0 + random.uniform(-0.1, 0.1)
        elif grower["country"] == "MEX":
            lat, lon = 21.0 + random.uniform(-0.1, 0.1), -101.0 + random.uniform(-0.1, 0.1)
        elif grower["country"] == "EGY":
            lat, lon = 30.0 + random.uniform(-0.1, 0.1), 31.0 + random.uniform(-0.1, 0.1)
        else: # BRA
            lat, lon = -11.0 + random.uniform(-0.1, 0.1), -38.0 + random.uniform(-0.1, 0.1)
            
        location_poly = f"POLYGON(({lon:.4f} {lat:.4f}, {lon+0.02:.4f} {lat:.4f}, {lon+0.02:.4f} {lat+0.02:.4f}, {lon:.4f} {lat+0.02:.4f}, {lon:.4f} {lat:.4f}))"
        
        # Correlate yield and moisture
        # Irrigation impacts yield and moisture
        irr = random.choice(irrigation_types)
        
        # Center Pivot / Drip => High yield, optimal moisture
        # Flood / Rainfed => Variable yield, warning triggers
        if irr in ["Drip", "Center Pivot"]:
            moisture = round(random.uniform(13.0, 16.5), 1) # Target zone (12-18)
            defect = round(random.uniform(1.0, 3.8), 1)     # Low defects (<4%)
            yield_multiplier = random.uniform(1.2, 1.6)
        else:
            # Add some outliers for charts triggers!
            moisture = round(random.choice([
                random.uniform(9.0, 11.5),  # Low warning
                random.uniform(18.2, 21.5), # High warning
                random.uniform(13.0, 16.0)  # Optimal
            ]), 1)
            defect = round(random.choice([
                random.uniform(0.5, 3.5),
                random.uniform(4.5, 9.8) # High warning defects
            ]), 1)
            yield_multiplier = random.uniform(0.6, 1.1)
            
        yield_tons = round(random.uniform(25.0, 45.0) * yield_multiplier, 1)
        
        # Correlate fertilizer applications
        fert = random.choice(fertilizers)
        app_rate = round(random.uniform(150.0, 350.0), 1)
        n_applied = round((app_rate * fert["n"]) / 100.0, 1)
        
        # Total volumes based on farm size (10-50 hectares)
        farm_hectares = random.uniform(15.0, 45.0)
        n_total = round((n_applied * farm_hectares) / 1000.0, 2)
        p_total = round(((app_rate * fert["p"]) / 100.0 * farm_hectares) / 1000.0, 2)
        k_total = round(((app_rate * fert["k"]) / 100.0 * farm_hectares) / 1000.0, 2)
        
        # Status assignment
        if defect > 8.0 or moisture > 21.0 or moisture < 10.0:
            status = "Flagged" # Red
        elif defect > 4.0 or moisture > 18.0:
            status = "Pending" # Amber review
        else:
            status = "Approved" # Green
            
        # Timestamps
        days_ago = random.randint(10, 360)
        sub_date = datetime.now() - timedelta(days=days_ago)
        app_date = sub_date - timedelta(days=random.randint(30, 90))
        
        rec = {
            "id": submission_id,
            "fieldName": f"Field-{random.randint(100, 199)}",
            "variety": variety,
            "country": grower["country"],
            "vendorName": grower["vendor"],
            "growerName": grower["name"],
            "cropSeason": season,
            "fieldLocation": location_poly,
            "region": grower["region"],
            "vendorContact": grower["contact"],
            "cipcApplied": random.choice(["CIPC", "None", "Other"]),
            "activeIngredientRate": round(random.uniform(15.0, 30.0), 2),
            "irrigationType": irr,
            "nApplied": n_applied,
            "nTotal": n_total,
            "pTotal": p_total,
            "kTotal": k_total,
            "vrtUsed": random.choice(["Yes", "No"]),
            "fertilizerType": fert["type"],
            "fertilizerNature": fert["nature"],
            "nitrogenAnalysis": fert["n"],
            "ammoniaPercentage": fert["ammonia"],
            "nitricPercentage": fert["nitric"],
            "ureaPercentage": fert["urea"],
            "phosphateAnalysis": fert["p"],
            "potassiumAnalysis": fert["k"],
            "applicationRate": app_rate,
            "applicationMethod": random.choice(["Broadcast", "Banding", "Drip"]),
            "emissionsInhibitors": random.choice(["Yes", "No"]),
            "applicationDate": app_date.strftime("%Y-%m-%d"),
            "agronomistName": agron,
            "moisturePercentage": moisture,
            "defectRate": defect,
            "yieldTons": yield_tons,
            "submissionStatus": status,
            "submissionTimestamp": sub_date.strftime("%Y-%m-%d %H:%M:%S.000000 UTC")
        }
        records.append(rec)
        
    return records

if __name__ == "__main__":
    setup_bigquery()
