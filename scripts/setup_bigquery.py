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

    # Drop existing table to ensure schema updates are applied
    drop_table_sql = "DROP TABLE IF EXISTS agriflow.grower_submissions"
    run_bq_command(["query", "--use_legacy_sql=false", drop_table_sql])

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
      submissionTimestamp TIMESTAMP,
      cropType STRING,
      equipmentModel STRING,
      totalFuelGal FLOAT64,
      fuelRateGalAc FLOAT64,
      productivityAcHr FLOAT64,
      areaSeededAc FLOAT64,
      appliedRateSeedsAc INT64,
      targetRateSeedsAc INT64,
      cropStage STRING
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
        {"name": "Carlos Gomez", "vendor": "Gomez Farms SA", "contact": "carlos.g@gomezfarms.mx", "country": "MEX", "region": "LATAM"},
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
    equipment_models = ["John Deere 8295R", "John Deere 8R 370", "Case IH Magnum 340", "New Holland T8"]
    
    random.seed(42)
    
    # We will generate 15 distinct farm plots (fields)
    # For each plot, we generate Seeding, Application, and Harvest records (45 records total)
    for plot_idx in range(1, 16):
        grower = random.choice(growers)
        variety = random.choice(varieties)
        crop_type = random.choice(["Potatoes", "Potatoes", "Potatoes", "Soybeans", "Corn"])
        irr = random.choice(irrigation_types)
        agron = random.choice(agronomists)
        fieldName = f"Field-{100 + plot_idx}"
        
        # Coordinates
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
        
        # Timeline offsets
        # Seeding: April 2025
        # Application: June 2025
        # Harvest: September 2025
        base_year = random.choice([2025, 2026])
        seeding_timestamp = datetime(base_year, 4, random.randint(1, 28), random.randint(8, 16), 0, 0)
        app_timestamp = seeding_timestamp + timedelta(days=random.randint(45, 60))
        harvest_timestamp = app_timestamp + timedelta(days=random.randint(75, 90))
        
        # Farm size (10 - 45 Hectares / 25 - 110 Acres)
        farm_size_ac = round(random.uniform(25.0, 110.0), 1)
        farm_hectares = round(farm_size_ac * 0.4047, 1)

        # 1. SEEDING LOG
        seeding_rec = {
            "id": f"LOG-S-{1000 + plot_idx}",
            "fieldName": fieldName,
            "variety": variety,
            "country": grower["country"],
            "vendorName": grower["vendor"],
            "growerName": grower["name"],
            "cropSeason": str(base_year),
            "fieldLocation": location_poly,
            "region": grower["region"],
            "vendorContact": grower["contact"],
            "cipcApplied": None,
            "activeIngredientRate": None,
            "irrigationType": irr,
            "nApplied": None,
            "nTotal": None,
            "pTotal": None,
            "kTotal": None,
            "vrtUsed": random.choice(["Yes", "No"]),
            "fertilizerType": None,
            "fertilizerNature": None,
            "nitrogenAnalysis": None,
            "ammoniaPercentage": None,
            "nitricPercentage": None,
            "ureaPercentage": None,
            "phosphateAnalysis": None,
            "potassiumAnalysis": None,
            "applicationRate": None,
            "applicationMethod": None,
            "emissionsInhibitors": None,
            "applicationDate": None,
            "agronomistName": agron,
            "moisturePercentage": None,
            "defectRate": None,
            "yieldTons": None,
            "submissionStatus": "Approved",
            "submissionTimestamp": seeding_timestamp.strftime("%Y-%m-%d %H:%M:%S.000000 UTC"),
            "cropType": crop_type,
            "equipmentModel": random.choice(equipment_models),
            "totalFuelGal": round(random.uniform(25.0, 75.0), 1),
            "fuelRateGalAc": round(random.uniform(0.6, 1.8), 2),
            "productivityAcHr": round(random.uniform(8.0, 18.0), 1),
            "areaSeededAc": farm_size_ac,
            "appliedRateSeedsAc": 152000 if crop_type != "Potatoes" else None,
            "targetRateSeedsAc": 150000 if crop_type != "Potatoes" else None,
            "cropStage": "Seeding"
        }
        records.append(seeding_rec)

        # 2. CROP PROTECTION / APPLICATION LOG
        fert = random.choice(fertilizers)
        app_rate = round(random.uniform(150.0, 350.0), 1)
        n_applied = round((app_rate * fert["n"]) / 100.0, 1)
        n_total = round((n_applied * farm_hectares) / 1000.0, 2)
        p_total = round(((app_rate * fert["p"]) / 100.0 * farm_hectares) / 1000.0, 2)
        k_total = round(((app_rate * fert["k"]) / 100.0 * farm_hectares) / 1000.0, 2)

        app_rec = {
            "id": f"LOG-A-{2000 + plot_idx}",
            "fieldName": fieldName,
            "variety": variety,
            "country": grower["country"],
            "vendorName": grower["vendor"],
            "growerName": grower["name"],
            "cropSeason": str(base_year),
            "fieldLocation": location_poly,
            "region": grower["region"],
            "vendorContact": grower["contact"],
            "cipcApplied": "None" if crop_type != "Potatoes" else random.choice(["CIPC", "None"]),
            "activeIngredientRate": round(random.uniform(15.0, 30.0), 2) if crop_type == "Potatoes" else 0.0,
            "irrigationType": irr,
            "nApplied": n_applied,
            "nTotal": n_total,
            "pTotal": p_total,
            "kTotal": k_total,
            "vrtUsed": seeding_rec["vrtUsed"],
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
            "applicationDate": app_timestamp.strftime("%Y-%m-%d"),
            "agronomistName": agron,
            "moisturePercentage": None,
            "defectRate": None,
            "yieldTons": None,
            "submissionStatus": "Approved",
            "submissionTimestamp": app_timestamp.strftime("%Y-%m-%d %H:%M:%S.000000 UTC"),
            "cropType": crop_type,
            "equipmentModel": seeding_rec["equipmentModel"],
            "totalFuelGal": round(random.uniform(15.0, 45.0), 1),
            "fuelRateGalAc": round(random.uniform(0.5, 1.2), 2),
            "productivityAcHr": round(random.uniform(10.0, 22.0), 1),
            "areaSeededAc": None,
            "appliedRateSeedsAc": None,
            "targetRateSeedsAc": None,
            "cropStage": "Application"
        }
        records.append(app_rec)

        # 3. HARVEST LOG
        if irr in ["Drip", "Center Pivot"]:
            moisture = round(random.uniform(13.0, 16.5), 1)
            defect = round(random.uniform(1.0, 3.8), 1)
            yield_multiplier = random.uniform(1.2, 1.6)
        else:
            moisture = round(random.choice([random.uniform(9.0, 11.5), random.uniform(18.2, 21.5), random.uniform(13.0, 16.0)]), 1)
            defect = round(random.choice([random.uniform(0.5, 3.5), random.uniform(4.5, 9.8)]), 1)
            yield_multiplier = random.uniform(0.6, 1.1)

        yield_tons = round(random.uniform(25.0, 45.0) * yield_multiplier, 1)

        # Status rules
        if defect > 8.0 or moisture > 21.0 or moisture < 10.0:
            status = "Flagged"
        elif defect > 4.0 or moisture > 18.0:
            status = "Pending"
        else:
            status = "Approved"

        harvest_rec = {
            "id": f"LOG-H-{3000 + plot_idx}",
            "fieldName": fieldName,
            "variety": variety,
            "country": grower["country"],
            "vendorName": grower["vendor"],
            "growerName": grower["name"],
            "cropSeason": str(base_year),
            "fieldLocation": location_poly,
            "region": grower["region"],
            "vendorContact": grower["contact"],
            "cipcApplied": None,
            "activeIngredientRate": None,
            "irrigationType": irr,
            "nApplied": None,
            "nTotal": None,
            "pTotal": None,
            "kTotal": None,
            "vrtUsed": None,
            "fertilizerType": None,
            "fertilizerNature": None,
            "nitrogenAnalysis": None,
            "ammoniaPercentage": None,
            "nitricPercentage": None,
            "ureaPercentage": None,
            "phosphateAnalysis": None,
            "potassiumAnalysis": None,
            "applicationRate": None,
            "applicationMethod": None,
            "emissionsInhibitors": None,
            "applicationDate": None,
            "agronomistName": agron,
            "moisturePercentage": moisture,
            "defectRate": defect,
            "yieldTons": yield_tons,
            "submissionStatus": status,
            "submissionTimestamp": harvest_timestamp.strftime("%Y-%m-%d %H:%M:%S.000000 UTC"),
            "cropType": crop_type,
            "equipmentModel": seeding_rec["equipmentModel"],
            "totalFuelGal": round(random.uniform(30.0, 85.0), 1),
            "fuelRateGalAc": round(random.uniform(0.8, 2.0), 2),
            "productivityAcHr": round(random.uniform(6.0, 14.0), 1),
            "areaSeededAc": None,
            "appliedRateSeedsAc": None,
            "targetRateSeedsAc": None,
            "cropStage": "Harvest"
        }
        records.append(harvest_rec)

    return records

if __name__ == "__main__":
    setup_bigquery()
