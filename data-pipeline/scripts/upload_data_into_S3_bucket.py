import requests
import boto3
from tqdm import tqdm

# Config
BUCKET_NAME = "oikosdata"   # your S3 bucket
OBJECT_NAME = "Swiss_Boundaries"  # name in S3
URL = "https://data.geo.admin.ch/ch.swisstopo.swissboundaries3d/swissboundaries3d_2026-01/swissboundaries3d_2026-01_2056_5728.gdb.zip"

# Use your profile 
session = boto3.Session(profile_name="Torsten_Schmaelzle")
s3 = session.client("s3")

def upload_from_url(url, bucket, object_name):
    # Stream download from URL
    response = requests.get(url, stream=True)
    response.raise_for_status()

    total_size = int(response.headers.get("content-length", 0))
    progress = tqdm(total=total_size, unit="B", unit_scale=True, desc=object_name)

    # Upload in chunks
    s3.upload_fileobj(response.raw, bucket, object_name,
        Callback=lambda bytes_transferred: progress.update(bytes_transferred)
    )

    progress.close()
    print(f"\n✅ Uploaded {object_name} to s3://{bucket}/{object_name}")

if __name__ == "__main__":
    upload_from_url(URL, BUCKET_NAME, OBJECT_NAME) 