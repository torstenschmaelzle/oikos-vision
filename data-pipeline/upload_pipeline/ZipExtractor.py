

cat > ZipExtractor.py << 'PY'

import zipfile
from pathlib import Path
from Logger import Logger
import subprocess

class ZipExtractor:

    def __init__(self,logger_name,path):

        self.logger = Logger.setup_loggin(logger_name)
        self.target_path = path
        

    def is_zip_file(self):

        self.logger.info("=== Check if ZIP === path=%s is ZIP file",self.target_path)

        if not Path(self.target_path).exists():
            self.logger.info("=== Path not Found Error === path=%s ",self.target_path)
            raise FileNotFoundError
        
        return zipfile.is_zipfile(str(self.target_path))
    
    def extract_zip_file(self):

        if not self.is_zip_file():
            self.logger.info("=== NOT A ZIP FILE ===, %s",self.target_path)
            raise ValueError("Not a ZIP file: " + str(self.target_path))


        output_dir = Path(self.target_path).parent / (Path(self.target_path).stem + "_extracted")
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        self.logger.info("=== EXTRACTION OF ZIP STARTED ===, %s --------> %s",self.target_path,str(output_dir))
        extracted_files=[]

        try:
            with zipfile.ZipFile(str(self.target_path), "r") as z:
                # zip slip protection
                out_resolved = output_dir.resolve()
                for m in z.infolist():
                    dest_resolved = (output_dir / m.filename).resolve()
                    if not str(dest_resolved).startswith(str(out_resolved) + "/") and dest_resolved != out_resolved:
                        raise RuntimeError("Unsafe zip entry detected: " + m.filename)

                z.extractall(str(output_dir))

        except NotImplementedError:
            # THIS is your current error. Log it and fallback to unzip.
            self.logger.exception("Python zipfile cannot extract this zip. Falling back to system unzip.")

            try:
                result = subprocess.run(
                    ["unzip", "-o", str(self.target_path), "-d", str(output_dir)],
                    check=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                )
                # unzip output can be long, but this is useful for debugging
                self.logger.info("unzip output:\n%s", result.stdout)

            except FileNotFoundError:
                self.logger.exception("unzip command not found. Install with: sudo yum install -y unzip")
                raise

            except subprocess.CalledProcessError as ex:
                self.logger.exception("unzip failed. output:\n%s", ex.stdout)
                raise

        except Exception:
            # log any other extraction error
            self.logger.exception("Extraction failed for zip=%s", str(self.target_path))
            raise

        extracted_files = sorted([str(p) for p in output_dir.rglob("*") if p.is_file()])
        self.logger.info("=== Extract finished === files=%d", len(extracted_files))

        return str(output_dir), extracted_files

        return str(output_dir), extracted_files
PY


        

        


        
