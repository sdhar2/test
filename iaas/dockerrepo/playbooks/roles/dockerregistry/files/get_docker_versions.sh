#!/bin/sh
#
# get_docker_versions.sh -- This script displays all the docker images loaded in the dccker registry
#
#   Usage:
#       get_docker_versions.sh [docker directory -- this is optional]
#                              if no docker directory is specified /home/docker/prodRepo/data/repositories is used
###########
#
#       03/30/15 - SD - initial development
#       08/18/15 - SD - Added image_id and fixed formating
#


DOCKER_DIR=$1
if [ "${DOCKER_DIR}" == "" ]; then
	DOCKER_DIR="/home/docker/prodRepo/data/repositories"
fi

echo "*******************************Docker Image Versions****************************************************"
echo "  Repositories             Image Name                                   Version           Image ID      "
echo "********************************************************************************************************"
for i in `ls ${DOCKER_DIR}`
do
	repo=`printf '%-15s' "$i"`
	for j in `ls ${DOCKER_DIR}/$i`
	do
		
		image=`printf '%-40s' "$j"`
		for k in `ls ${DOCKER_DIR}/$i/$j/*_json`
		do
			vers=`echo $k | cut -d " " -f 9 | cut -d "/" -f 9 | cut -d "_" -f 1| cut -c 4-14`
			version=`printf '%-10s' "${vers}"`
			image_id=`cat ${DOCKER_DIR}/$i/$j/tag_${vers} | cut -c 1-12`

			echo -e "\t${repo}\t${image}\t${version}\t${image_id}"

		done
	done
done
echo "**********************************************************************************************"
