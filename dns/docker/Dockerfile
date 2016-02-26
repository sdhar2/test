####################################################################################
#Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
#This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
#and may not be copied, reproduced, modified, disclosed to others, published or used,
#in whole or in part, without the express prior written permission of ARRIS.
####################################################################################

# A docker image that extends the base image and has all the mounted files reside inside of the docker container 

# Pull base image
FROM arrs/arrs-cloud-base-centos6-6:2.0.0.1
MAINTAINER ARRIS

ENV DATA_DIR=/tmp/data \
    BIND_USER=bind \
    WEBMIN_VERSION=1.760

RUN yum -y install \
 bind \
 perl \
 perl-Net-SSLeay \
 webmin-1.760-1.noarch \
&& rm -rf /var/cache/yum/*

# Add binaries, configuration files and scripts
ADD fs /
WORKDIR /

RUN chmod 755 /sbin/entrypoint.sh

EXPOSE 53/udp 10000/tcp

VOLUME ["${DATA_DIR}"]

ENTRYPOINT ["/sbin/entrypoint.sh"]

CMD ["/usr/sbin/named"]
