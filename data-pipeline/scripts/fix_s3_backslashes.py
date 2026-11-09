import os
import boto3

def main():
    bucket = os.environ.get("BUCKET", "oikosdata")
    prefix = os.environ.get("PREFIX", "unzipped/Swiss_Boundaries/")
    do_delete = os.environ.get("DELETE_OLD", "0") == "1"

    s3 = boto3.client("s3")
    paginator = s3.get_paginator("list_objects_v2")

    to_fix = []

    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if "\\" in key:
                new_key = key.replace("\\", "/")
                to_fix.append((key, new_key))

    print(f"Found {len(to_fix)} keys with backslashes under s3://{bucket}/{prefix}")

    for old_key, new_key in to_fix:
        print(f"COPY  s3://{bucket}/{old_key}  ->  s3://{bucket}/{new_key}")
        s3.copy_object(
            Bucket=bucket,
            Key=new_key,
            CopySource={"Bucket": bucket, "Key": old_key},
        )
        if do_delete:
            print(f"DELETE s3://{bucket}/{old_key}")
            s3.delete_object(Bucket=bucket, Key=old_key)

    print("Done.")
    if not do_delete:
        print("Old keys were NOT deleted. Run with DELETE_OLD=1 if everything looks good.")

if __name__ == "__main__":
    main()