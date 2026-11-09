
from FassadeSpec import FASSADE_DATASET
from RdsLoader import RdsLoader



def main():

    # if dataset is roofs,  then its MULTIPOLYGON if its fassaden it it MULTILINESTRING

    loader = RdsLoader(FASSADE_DATASET,"data/solarenergie-eignung-fassaden_2056.gpkg_extracted/SOLKAT_FASS.gpkg")
    loader.load_dataset()


if __name__ == "__main__":
    main()
