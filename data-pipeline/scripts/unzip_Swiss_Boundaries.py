import os
import boto3
import zipfile

SOURCE_BUCKET = os.environ.get("SOURCE_BUCKET", "oikosdata")
SOURCE_KEY    = os.environ.get("SOURCE_KEY", "Swiss_Boundaries")   # anpassen
DEST_PREFIX   = os.environ.get("DEST_PREFIX", "unzipped/Swiss_Boundaries/").rstrip("/") + "/"

s3 = boto3.client("s3")

def main():
    local_zip = "/tmp/swiss_boundaries.zip"

    print(f"Downloading s3://{SOURCE_BUCKET}/{SOURCE_KEY} -> {local_zip}")
    s3.download_file(SOURCE_BUCKET, SOURCE_KEY, local_zip)

    with zipfile.ZipFile(local_zip, "r") as zf:
        names = zf.namelist()
        print(f"ZIP contains {len(names)} entries")

        for name in names:
            if name.endswith("/"):
                continue

            out_key = DEST_PREFIX + name
            print(f"Extracting {name} -> s3://{SOURCE_BUCKET}/{out_key}")

            with zf.open(name) as f:
                s3.upload_fileobj(f, SOURCE_BUCKET, out_key)

    print("Done.")

if __name__ == "__main__":
    main()