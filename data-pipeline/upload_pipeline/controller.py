cat> controller.py <<'PY'


from S3ObjectStore import S3ObjectStore
from ZipExtractor import ZipExtractor

def main():
    url = "https://data.geo.admin.ch/ch.bfe.solarenergie-eignung-daecher/solarenergie-eignung-daecher/solarenergie-eignung-daecher_2056_monthlydata.gpkg.zip"
    # extract filetype by the URL!
    filename = "Dach_Monat.gpkg.zip"
    
    ####
    # STEP 1: UPLOAD TO S3 AND DONWLOAD ONTO EC2
    ####

    #store = S3ObjectStore(bucket_name="oikosdata", log_name="S3ObjectStore")
    #local_file = store.download_data_from_bucket(filename, output_path="data")
    #print("Downloaded to:", local_file)


    local_file = "data/Dach_Monat.gpkg.zip"
    unzip = ZipExtractor(logger_name="zip_log" , path = local_file)
    unzip.extract_zip_file()


if __name__ == "__main__":
    main()

PY