import json
import subprocess
import random
import sys
import fcntl
import argparse
import os
import tempfile
from datetime import datetime, timedelta
def run_bq_command(args):
    cmd = ["bq"] + args
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error executing command: {' '.join(cmd)}")
        if result.stdout:
            print(f"STDOUT:\n{result.stdout}")
        if result.stderr:
            print(f"STDERR:\n{result.stderr}")
        err_msg = f"STDOUT: {result.stdout}\nSTDERR: {result.stderr}"
        return False, err_msg
    return True, result.stdout

def setup_bigquery_graph():
    print("Setting up normalized relational schemas for BigQuery Graph...")
    
    # 1. Create dataset if not exists in US region
    create_dataset_sql = "CREATE SCHEMA IF NOT EXISTS agriflow OPTIONS(location='US')"
    success, err = run_bq_command(["query", "--use_legacy_sql=false", create_dataset_sql])
    if not success:
        raise RuntimeError(f"Failed to create dataset schema: {err}")
    
    # Clean up old graph objects & tables to ensure clean migrations
    cleanup_statements = [
        "DROP PROPERTY GRAPH IF EXISTS agriflow.supply_chain_graph",
        "DROP VIEW IF EXISTS agriflow.grower_submissions",
        "DROP TABLE IF EXISTS agriflow.grower_submissions",
        "DROP TABLE IF EXISTS agriflow.audits_edge",
        "DROP TABLE IF EXISTS agriflow.operates_edge",
        "DROP TABLE IF EXISTS agriflow.routes_edge",
        "DROP TABLE IF EXISTS agriflow.agronomists",
        "DROP TABLE IF EXISTS agriflow.growers",
        "DROP TABLE IF EXISTS agriflow.plants",
        "DROP TABLE IF EXISTS agriflow.fields",
    ]
    print("Cleaning up old database assets...", flush=True)
    for stmt in cleanup_statements:
        print(f"Executing cleanup statement: {stmt}...", flush=True)
        success, err = run_bq_command(["query", "--use_legacy_sql=false", stmt])
        if not success:
            print(f"Warning: Non-fatal error cleaning up asset with statement '{stmt}':\n{err}", flush=True)

    # 2. Define Node Tables
    create_agronomists_sql = """
    CREATE OR REPLACE TABLE agriflow.agronomists (
      id STRING NOT NULL,
      agronomistName STRING
    )
    """
    
    create_growers_sql = """
    CREATE OR REPLACE TABLE agriflow.growers (
      id STRING NOT NULL,
      growerName STRING,
      vendorName STRING,
      vendorContact STRING,
      country STRING,
      region STRING,
      bankDetails STRING
    )
    """
    
    create_plants_sql = """
    CREATE OR REPLACE TABLE agriflow.plants (
      id STRING NOT NULL,
      plantName STRING,
      region STRING
    )
    """
    
    create_fields_sql = """
    CREATE OR REPLACE TABLE agriflow.fields (
      id STRING NOT NULL,
      fieldName STRING,
      variety STRING,
      cropSeason STRING,
      fieldLocation STRING,
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
      cropStage STRING,
      chemicalProduct STRING,
      chemicalType STRING,
      chemicalProducer STRING,
      chemicalActiveIngredient STRING,
      liquidChemicalRate FLOAT64,
      dryChemicalRate FLOAT64,
      manufacturedIn STRING,
      cftManualNitrogen FLOAT64,
      cftManualPhosphate FLOAT64,
      cftManualPotassium FLOAT64,
      seedTreatments STRING,
      treatedStorageDiseases STRING,
      treatedRhizoctonia STRING,
      otherStorageMethod STRING,
      irrigation_m3 FLOAT64
    )
    """
    
    # 3. Define Edge Tables
    create_audits_edge_sql = """
    CREATE OR REPLACE TABLE agriflow.audits_edge (
      id STRING NOT NULL,
      agronomist_id STRING,
      grower_id STRING
    )
    """
    
    create_operates_edge_sql = """
    CREATE OR REPLACE TABLE agriflow.operates_edge (
      id STRING NOT NULL,
      grower_id STRING,
      field_id STRING
    )
    """
    
    create_routes_edge_sql = """
    CREATE OR REPLACE TABLE agriflow.routes_edge (
      id STRING NOT NULL,
      field_id STRING,
      plant_id STRING,
      distance_km FLOAT64
    )
    """

    print("Creating normalized tables...", flush=True)
    for label, sql in [
        ("agronomists", create_agronomists_sql),
        ("growers", create_growers_sql),
        ("plants", create_plants_sql),
        ("fields", create_fields_sql),
        ("audits_edge", create_audits_edge_sql),
        ("operates_edge", create_operates_edge_sql),
        ("routes_edge", create_routes_edge_sql)
    ]:
        print(f"Creating table {label}...", flush=True)
        success, err = run_bq_command(["query", "--use_legacy_sql=false", sql])
        if not success:
            raise RuntimeError(f"Failed to create table {label}: {err}")

    import time
    print("Waiting 10 seconds for BigQuery metadata replication...")
    time.sleep(10)

    # 4. Generate & Insert relational data
    print("Generating and inserting seed nodes...")
    
    # Static nodes seeding
    agronomists = [
        {"id": "agro-David-Vance", "agronomistName": "David Vance"},
        {"id": "agro-Jane-Smith", "agronomistName": "Jane Smith"},
        {"id": "agro-Alistair-Green", "agronomistName": "Alistair Green"},
        {"id": "agro-Sophia-Martinez", "agronomistName": "Sophia Martinez"}
    ]
    
    plants = [
        {"id": "plant-NA", "plantName": "Frito-Lay Plant (Chicago)", "region": "NA"},
        {"id": "plant-LATAM", "plantName": "Frito-Lay Plant (São Paulo)", "region": "LATAM"},
        {"id": "plant-AMESA", "plantName": "Frito-Lay Plant (Cairo)", "region": "AMESA"}
    ]
    
    growers = [
        {"id": "grower-Sarah-Jenkins", "growerName": "Sarah Jenkins", "vendorName": "Jenkins Agro Ltd", "vendorContact": "sarah.j@jenkinsagro.com", "country": "USA", "region": "NA", "bankDetails": "US99482701"},
        {"id": "grower-John-Miller", "growerName": "John Miller", "vendorName": "Midwest Spuds Inc", "vendorContact": "john@midwestspuds.com", "country": "USA", "region": "NA", "bankDetails": "US10293847"},
        {"id": "grower-David-Smith", "growerName": "David Smith", "vendorName": "Idaho Spud Farms", "vendorContact": "david@idahospuds.com", "country": "USA", "region": "NA", "bankDetails": "US99382903"},
        {"id": "grower-Rajesh-Patel", "growerName": "Rajesh Patel", "vendorName": "Patel Agri Ventures", "vendorContact": "rajesh@patelagri.in", "country": "IND", "region": "AMESA", "bankDetails": "IN30492831"},
        {"id": "grower-Amina-El-Sayed", "growerName": "Amina El-Sayed", "vendorName": "Nile Delta Harvest", "vendorContact": "amina@nileharvest.eg", "country": "EGY", "region": "AMESA", "bankDetails": "EG90483921"},
        {"id": "grower-Carlos-Gomez", "growerName": "Carlos Gomez", "vendorName": "Gomez Farms SA", "vendorContact": "carlos.g@gomezfarms.mx", "country": "MEX", "region": "LATAM", "bankDetails": "MX49302948"},
        {"id": "grower-Renata-Carvalho", "growerName": "Renata Carvalho", "vendorName": "Carvalho Agro", "vendorContact": "renata@carvalhoagro.br", "country": "BRA", "region": "LATAM", "bankDetails": "BR83920394"}
    ]
    
    # SQL insertion helper
    def insert_records_sql(table, records):
        if not records:
            return True
        columns = list(records[0].keys())
        chunk_size = 50
        for i in range(0, len(records), chunk_size):
            chunk = records[i:i+chunk_size]
            values_tuples = []
            for rec in chunk:
                vals = []
                for col in columns:
                    val = rec.get(col)
                    if val is None:
                        vals.append("NULL")
                    elif isinstance(val, (int, float)):
                        vals.append(str(val))
                    elif isinstance(val, bool):
                        vals.append("TRUE" if val else "FALSE")
                    else:
                        escaped = str(val).replace("'", "\\'")
                        vals.append(f"'{escaped}'")
                values_tuples.append(f"({', '.join(vals)})")
            sql = f"INSERT INTO agriflow.{table} ({', '.join(columns)}) VALUES {', '.join(values_tuples)}"
            print(f"Inserting {len(chunk)} records into {table}...", flush=True)
            success, err = run_bq_command(["query", "--use_legacy_sql=false", sql])
            if not success:
                print(f"Error inserting into {table}: {err}")
                return False
        return True

    if not insert_records_sql("agronomists", agronomists):
        raise RuntimeError("Failed to load agronomists data")
    if not insert_records_sql("plants", plants):
        raise RuntimeError("Failed to load plants data")
    if not insert_records_sql("growers", growers):
        raise RuntimeError("Failed to load growers data")

    # Compile fields and edges
    varieties = ["Atlantic", "Snowden", "Frito-Lay Proprietary (FL-1867)", "Low Glycemic"]
    irrigation_types = ["Drip", "Center Pivot", "Flood", "Rainfed"]
    fertilizers = [
        {"type": "Urea", "nature": "Mineral", "n": 46.0, "p": 0.0, "k": 0.0, "urea": 100.0, "ammonia": 0.0, "nitric": 0.0},
        {"type": "NPK 15-15-15", "nature": "Mineral", "n": 15.0, "p": 15.0, "k": 15.0, "urea": 40.0, "ammonia": 30.0, "nitric": 30.0},
        {"type": "Compost", "nature": "Organic", "n": 2.5, "p": 1.2, "k": 1.8, "urea": 0.0, "ammonia": 10.0, "nitric": 0.0}
    ]
    equipment_models = ["John Deere 8295R", "John Deere 8R 370", "Case IH Magnum 340", "New Holland T8"]
    
    fields_data = []
    audits_edges = []
    operates_edges = []
    routes_edges = []
    
    random.seed(42)
    edge_idx = 1
    
    for plot_idx in range(1, 16):
        grower = random.choice(growers)
        variety = random.choice(varieties)
        crop_type = random.choice(["Potatoes", "Potatoes", "Potatoes", "Soybeans", "Corn"])
        irr = random.choice(irrigation_types)
        agron = random.choice(agronomists)
        fieldName = f"Field-{100 + plot_idx}"
        irrigation_val = round(random.uniform(500.0, 2000.0), 1) if irr != "Rainfed" else 0.0
        distance_val = round(random.uniform(10.0, 150.0), 1)
        
        # Coordinates
        if grower["country"] == "USA":
            lat, lon = 44.0 + random.uniform(-0.1, 0.1), -84.0 + random.uniform(-0.1, 0.1)
        elif grower["country"] == "IND":
            lat, lon = 22.0 + random.uniform(-0.1, 0.1), 77.0 + random.uniform(-0.1, 0.1)
        elif grower["country"] == "MEX":
            lat, lon = 21.0 + random.uniform(-0.1, 0.1), -101.0 + random.uniform(-0.1, 0.1)
        elif grower["country"] == "EGY":
            lat, lon = 30.0 + random.uniform(-0.1, 0.1), 31.0 + random.uniform(-0.1, 0.1)
        else:
            lat, lon = -11.0 + random.uniform(-0.1, 0.1), -38.0 + random.uniform(-0.1, 0.1)
            
        location_poly = f"POLYGON(({lon:.4f} {lat:.4f}, {lon+0.02:.4f} {lat:.4f}, {lon+0.02:.4f} {lat+0.02:.4f}, {lon:.4f} {lat+0.02:.4f}, {lon:.4f} {lat:.4f}))"
        
        base_year = random.choice([2025, 2026])
        seeding_timestamp = datetime(base_year, 4, random.randint(1, 28), random.randint(8, 16), 0, 0)
        app_timestamp = seeding_timestamp + timedelta(days=random.randint(45, 60))
        harvest_timestamp = app_timestamp + timedelta(days=random.randint(75, 90))
        
        farm_size_ac = round(random.uniform(25.0, 110.0), 1)
        farm_hectares = round(farm_size_ac * 0.4047, 1)

        # Seeding ID
        s_id = f"LOG-S-{1000 + plot_idx}"
        seeding_rec = {
            "id": s_id,
            "fieldName": fieldName,
            "variety": variety,
            "cropSeason": str(base_year),
            "fieldLocation": location_poly,
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
            "cropStage": "Seeding",
            "chemicalProduct": None,
            "chemicalType": None,
            "chemicalProducer": None,
            "chemicalActiveIngredient": None,
            "liquidChemicalRate": None,
            "dryChemicalRate": None,
            "manufacturedIn": None,
            "cftManualNitrogen": None,
            "cftManualPhosphate": None,
            "cftManualPotassium": None,
            "seedTreatments": random.choice(["CruiserMaxx", "Saber", "None"]),
            "treatedStorageDiseases": random.choice(["Yes", "No"]),
            "treatedRhizoctonia": random.choice(["Yes", "No"]),
            "otherStorageMethod": None,
            "irrigation_m3": irrigation_val
        }
        fields_data.append(seeding_rec)

        # App ID
        a_id = f"LOG-A-{2000 + plot_idx}"
        fert = random.choice(fertilizers)
        app_rate = round(random.uniform(150.0, 350.0), 1)
        n_applied = round((app_rate * fert["n"]) / 100.0, 1)
        n_total = round((n_applied * farm_hectares) / 1000.0, 2)
        p_total = round(((app_rate * fert["p"]) / 100.0 * farm_hectares) / 1000.0, 2)
        k_total = round(((app_rate * fert["k"]) / 100.0 * farm_hectares) / 1000.0, 2)
        
        app_rec = {
            "id": a_id,
            "fieldName": fieldName,
            "variety": variety,
            "cropSeason": str(base_year),
            "fieldLocation": location_poly,
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
            "cropStage": "Application",
            "chemicalProduct": random.choice(["Atrazine", "Dual II Magnum", "None"]),
            "chemicalType": random.choice(["Herbicide", "Fungicide", "Insecticide"]),
            "chemicalProducer": random.choice(["Syngenta", "BASF", "Bayer"]),
            "chemicalActiveIngredient": random.choice(["S-Metolachlor", "Atrazine", "Imazalil"]),
            "liquidChemicalRate": round(random.uniform(0.5, 2.5), 2),
            "dryChemicalRate": 0.0,
            "manufacturedIn": grower["country"],
            "cftManualNitrogen": None,
            "cftManualPhosphate": None,
            "cftManualPotassium": None,
            "seedTreatments": None,
            "treatedStorageDiseases": None,
            "treatedRhizoctonia": None,
            "otherStorageMethod": None,
            "irrigation_m3": irrigation_val
        }
        fields_data.append(app_rec)

        # Harvest ID
        h_id = f"LOG-H-{3000 + plot_idx}"
        if irr in ["Drip", "Center Pivot"]:
            moisture = round(random.uniform(13.0, 16.5), 1)
            defect = round(random.uniform(1.0, 3.8), 1)
            yield_multiplier = random.uniform(1.2, 1.6)
        else:
            moisture = round(random.choice([random.uniform(9.0, 11.5), random.uniform(18.2, 21.5), random.uniform(13.0, 16.0)]), 1)
            defect = round(random.choice([random.uniform(0.5, 3.5), random.uniform(4.5, 9.8)]), 1)
            yield_multiplier = random.uniform(0.6, 1.1)
        yield_tons = round(random.uniform(25.0, 45.0) * yield_multiplier, 1)

        if defect > 8.0 or moisture > 21.0 or moisture < 10.0:
            status = "Flagged"
        elif defect > 4.0 or moisture > 18.0:
            status = "Pending"
        else:
            status = "Approved"

        harvest_rec = {
            "id": h_id,
            "fieldName": fieldName,
            "variety": variety,
            "cropSeason": str(base_year),
            "fieldLocation": location_poly,
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
            "cropStage": "Harvest",
            "chemicalProduct": None,
            "chemicalType": None,
            "chemicalProducer": None,
            "chemicalActiveIngredient": None,
            "liquidChemicalRate": None,
            "dryChemicalRate": None,
            "manufacturedIn": None,
            "cftManualNitrogen": round(random.uniform(0.0, 10.0), 2),
            "cftManualPhosphate": round(random.uniform(0.0, 5.0), 2),
            "cftManualPotassium": round(random.uniform(0.0, 5.0), 2),
            "seedTreatments": None,
            "treatedStorageDiseases": None,
            "treatedRhizoctonia": None,
            "otherStorageMethod": random.choice(["Manual venting", "None"]),
            "irrigation_m3": irrigation_val
        }
        fields_data.append(harvest_rec)

        # Compile Edges Linking
        # audits_edge: Agronomist -> Grower
        audit_id = f"edge-a-{edge_idx}"
        audits_edges.append({
            "id": audit_id,
            "agronomist_id": agron["id"],
            "grower_id": grower["id"]
        })
        
        # operates_edge: Grower -> Seeding/App/Harvest Fields (three separate submissions operated by this grower)
        operates_edges.append({"id": f"edge-o-{edge_idx}", "grower_id": grower["id"], "field_id": s_id})
        operates_edges.append({"id": f"edge-o-{edge_idx+1}", "grower_id": grower["id"], "field_id": a_id})
        operates_edges.append({"id": f"edge-o-{edge_idx+2}", "grower_id": grower["id"], "field_id": h_id})

        # routes_edge: Field Submissions -> Plant
        plant_id = f"plant-{grower['region']}"
        routes_edges.append({"id": f"edge-r-{edge_idx}", "field_id": s_id, "plant_id": plant_id, "distance_km": distance_val})
        routes_edges.append({"id": f"edge-r-{edge_idx+1}", "field_id": a_id, "plant_id": plant_id, "distance_km": distance_val})
        routes_edges.append({"id": f"edge-r-{edge_idx+2}", "field_id": h_id, "plant_id": plant_id, "distance_km": distance_val})

        edge_idx += 3

    print(f"Loading {len(fields_data)} submissions into fields node table...")
    if not insert_records_sql("fields", fields_data):
        raise RuntimeError("Failed to load fields data")
    
    print(f"Loading audits edges...")
    if not insert_records_sql("audits_edge", audits_edges):
        raise RuntimeError("Failed to load audits_edge data")
    
    print(f"Loading operates edges...")
    if not insert_records_sql("operates_edge", operates_edges):
        raise RuntimeError("Failed to load operates_edge data")
    
    print(f"Loading routes edges...")
    if not insert_records_sql("routes_edge", routes_edges):
        raise RuntimeError("Failed to load routes_edge data")

    # 5. Create SQL view to maintain backwards compatibility with existing app queries (KPIs, Charts)
    create_view_sql = """
    CREATE OR REPLACE VIEW agriflow.grower_submissions AS
    SELECT 
      f.id,
      f.fieldName,
      f.variety,
      g.country,
      g.vendorName,
      g.growerName,
      f.cropSeason,
      f.fieldLocation,
      g.region,
      g.vendorContact,
      f.cipcApplied,
      f.activeIngredientRate,
      f.irrigationType,
      f.nApplied,
      f.nTotal,
      f.pTotal,
      f.kTotal,
      f.vrtUsed,
      f.fertilizerType,
      f.fertilizerNature,
      f.nitrogenAnalysis,
      f.ammoniaPercentage,
      f.nitricPercentage,
      f.ureaPercentage,
      f.phosphateAnalysis,
      f.potassiumAnalysis,
      f.applicationRate,
      f.applicationMethod,
      f.emissionsInhibitors,
      f.applicationDate,
      a.agronomistName,
      f.moisturePercentage,
      f.defectRate,
      f.yieldTons,
      f.submissionStatus,
      f.submissionTimestamp,
      f.cropType,
      f.equipmentModel,
      f.totalFuelGal,
      f.fuelRateGalAc,
      f.productivityAcHr,
      f.areaSeededAc,
      f.appliedRateSeedsAc,
      f.targetRateSeedsAc,
      f.cropStage,
      f.chemicalProduct,
      f.chemicalType,
      f.chemicalProducer,
      f.chemicalActiveIngredient,
      f.liquidChemicalRate,
      f.dryChemicalRate,
      f.manufacturedIn,
      f.cftManualNitrogen,
      f.cftManualPhosphate,
      f.cftManualPotassium,
      f.seedTreatments,
      f.treatedStorageDiseases,
      f.treatedRhizoctonia,
      f.otherStorageMethod,
      g.bankDetails,
      f.irrigation_m3,
      re.distance_km
    FROM agriflow.fields f
    LEFT JOIN agriflow.operates_edge oe ON f.id = oe.field_id
    LEFT JOIN agriflow.growers g ON oe.grower_id = g.id
    LEFT JOIN (
      SELECT 
        ae.grower_id,
        STRING_AGG(DISTINCT a.agronomistName, ', ') AS agronomistName
      FROM agriflow.audits_edge ae
      JOIN agriflow.agronomists a ON ae.agronomist_id = a.id
      GROUP BY ae.grower_id
    ) a ON g.id = a.grower_id
    LEFT JOIN agriflow.routes_edge re ON f.id = re.field_id;
    """
    print("Creating backward-compatible view agriflow.grower_submissions...")
    success, err = run_bq_command(["query", "--use_legacy_sql=false", create_view_sql])
    if not success:
        raise RuntimeError(f"Failed to create view agriflow.grower_submissions: {err}")

    # 6. Create Native BigQuery Property Graph
    create_graph_sql = """
    CREATE OR REPLACE PROPERTY GRAPH agriflow.supply_chain_graph
      NODE TABLES (
        agriflow.agronomists KEY (id) LABEL Agronomist,
        agriflow.growers KEY (id) LABEL Grower,
        agriflow.fields KEY (id) LABEL Field,
        agriflow.plants KEY (id) LABEL Plant
      )
      EDGE TABLES (
        agriflow.audits_edge
          KEY (id)
          SOURCE KEY (agronomist_id) REFERENCES agronomists (id)
          DESTINATION KEY (grower_id) REFERENCES growers (id)
          LABEL AUDITS,
        agriflow.operates_edge
          KEY (id)
          SOURCE KEY (grower_id) REFERENCES growers (id)
          DESTINATION KEY (field_id) REFERENCES fields (id)
          LABEL OPERATES,
        agriflow.routes_edge
          KEY (id)
          SOURCE KEY (field_id) REFERENCES fields (id)
          DESTINATION KEY (plant_id) REFERENCES plants (id)
          LABEL ROUTED
      );
    """
    print("Creating BigQuery Property Graph agriflow.supply_chain_graph...")
    success, err = run_bq_command(["query", "--use_legacy_sql=false", create_graph_sql])
    if not success:
         raise RuntimeError(f"Failed to deploy BigQuery Graph schema: {err}")
    print("BigQuery Property Graph supply_chain_graph compiles and deploys successfully!")
    return True

LOCK_FILE = os.path.join(tempfile.gettempdir(), "setup_bigquery_v3.lock")
lock_file_fd = None

def acquire_lock():
    global lock_file_fd
    print(f"Acquiring database setup lock ({LOCK_FILE})...", flush=True)
    while True:
        try:
            fd = open(LOCK_FILE, 'w')
        except OSError as e:
            print(f"Failed to open lock file: {e}", file=sys.stderr)
            sys.exit(1)

        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
        except OSError as e:
            fd.close()
            continue

        try:
            fd_stat = os.fstat(fd.fileno())
            path_stat = os.stat(LOCK_FILE)
            if (fd_stat.st_dev, fd_stat.st_ino) == (path_stat.st_dev, path_stat.st_ino):
                lock_file_fd = fd
                break
            else:
                fd.close()
        except FileNotFoundError:
            fd.close()
        except OSError as e:
            fd.close()
            print(f"Error checking lock file status: {e}", file=sys.stderr)
            sys.exit(1)

    print("Acquired database setup lock.", flush=True)

def check_existing_schema():
    # 1. Query to verify if all required tables and views exist
    tables_query = """
    SELECT table_name, table_type 
    FROM agriflow.INFORMATION_SCHEMA.TABLES 
    WHERE table_name IN ('fields', 'routes_edge', 'agronomists', 'growers', 'plants', 'audits_edge', 'operates_edge', 'grower_submissions')
    """
    success, output = run_bq_command(["query", "--use_legacy_sql=false", "--format=json", tables_query])
    if not success:
        return False
        
    try:
        tables_data = json.loads(output)
    except Exception:
        return False

    found_tables = {row['table_name'] for row in tables_data}
    required_tables = {'fields', 'routes_edge', 'agronomists', 'growers', 'plants', 'audits_edge', 'operates_edge', 'grower_submissions'}
    if not required_tables.issubset(found_tables):
        return False

    for row in tables_data:
        if row['table_name'] == 'grower_submissions' and row['table_type'] != 'VIEW':
            return False

    # 2. Query to verify columns and their types
    columns_query = """
    SELECT table_name, column_name, data_type 
    FROM agriflow.INFORMATION_SCHEMA.COLUMNS 
    WHERE (table_name = 'fields' AND column_name = 'irrigation_m3')
       OR (table_name = 'routes_edge' AND column_name = 'distance_km')
    """
    success, output = run_bq_command(["query", "--use_legacy_sql=false", "--format=json", columns_query])
    if not success:
        return False

    try:
        columns_data = json.loads(output)
    except Exception:
        return False

    has_irrigation = False
    has_distance = False
    for row in columns_data:
        if row['table_name'] == 'fields' and row['column_name'] == 'irrigation_m3' and row['data_type'] == 'FLOAT64':
            has_irrigation = True
        elif row['table_name'] == 'routes_edge' and row['column_name'] == 'distance_km' and row['data_type'] == 'FLOAT64':
            has_distance = True

    if not (has_irrigation and has_distance):
        return False

    # 3. Check if property graph exists
    test_graph_query = "SELECT * FROM GRAPH_TABLE(agriflow.supply_chain_graph MATCH (n:Agronomist) RETURN n.id LIMIT 1)"
    success, _ = run_bq_command(["query", "--use_legacy_sql=false", test_graph_query])
    if not success:
        return False

    return True

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Setup BigQuery Graph schemas and relational tables.")
    parser.add_argument("-f", "--force", action="store_true", help="Force destructive drop, recreate, and seed operations.")
    args = parser.parse_args()

    acquire_lock()
    
    print("Checking if existing schema is up to date...")
    if args.force:
        print("Force flag set. Skipping idempotency checks and running full schema setup.")
    elif check_existing_schema():
        print("Database schema is up to date and correct. Skipping migration.")
        sys.exit(0)
    else:
        print("Schema is incomplete, outdated or missing. Proceeding with setup.")

    try:
        setup_bigquery_graph()
        print("Setup script completed successfully.", flush=True)
        os._exit(0)
    except Exception as e:
        print(f"FATAL ERROR during BigQuery setup: {e}", file=sys.stderr)
        os._exit(1)

