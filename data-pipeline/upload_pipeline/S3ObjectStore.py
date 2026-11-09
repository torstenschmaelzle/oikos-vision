
cat> S3ObjectStore.py <<'PY'

from Logger import Logger
import boto3
import requests
from pathlib import Path

class S3ObjectStore:

    def __init__(self, bucket_name = "oikosdata",log_name="S3ObjectStore"):
        self.bucket_name = bucket_name
        self.logger = Logger.setup_loggin(log_name)
        self.s3 = boto3.client("s3")

   
    def upload_from_url(self,url, filename):
        

        self.logger.info("=== Uploading start === url=%s to bucket=%s key=%s", url, self.bucket_name, filename)

        try:
            with requests.get(url, stream=True) as r:
                r.raise_for_status()
                r.raw.decode_content = True

                self.s3.upload_fileobj(r.raw, self.bucket_name, filename)

            self.logger.info("=== Upload finished ==== url=%s into s3://%s/%s", url, self.bucket_name, filename)

        except Exception as e:
            self.logger.exception("==== Upload failed ==== url=%s to bucket=%s key=%s error=%s", url, self.bucket_name, filename, e)
            raise



    def download_data_from_bucket(self,filename,output_path):

        output_dir=Path(output_path)
        output_dir.mkdir(parents=True, exist_ok=True)
        local_path = output_dir/ Path(filename).name
        self.logger.info("==== Downloading S3 === s3://%s/%s -----> %s",self.bucket_name,filename ,local_path)

        try:
            self.s3.download_file(self.bucket_name,filename,str(local_path))
            self.logger.info("==== Downloading finished === s3://%s/%s -----> %s",self.bucket_name,filename ,local_path)
        except Exception as e:
            self.logger.exception("=== Download failed === %s",e)
        
        return str(local_path)


PY