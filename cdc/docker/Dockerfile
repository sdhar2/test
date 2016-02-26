####################################################################################
#Copyright 2015 ARRIS Enterprises, Inc. All rights reserved.
#This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
#and may not be copied, reproduced, modified, disclosed to others, published or used,
#in whole or in part, without the express prior written permission of ARRIS.
####################################################################################

# Docker build specification for CodeController

# Pull base image
FROM arrs/arrs-cloud-base-nodejs7-1:1.0.0.2
MAINTAINER ARRIS

# Install nodejs modules
WORKDIR /opt/webservice/
RUN npm install mkdirp  dockerode unzip replace node-ansible rimraf fs-extra node-etcd glob path ssh2 async

#Install exec-sync module which cannot be installed via npm due to lack of g++
RUN wget -q -P /opt/webservice/node_modules http://areopagus/binaries/npm-exec-sync-0.1.6.tar.gz && cd /opt/webservice/node_modules && tar zxf npm-exec-sync-0.1.6.tar.gz && rm -rf npm-exec-sync-0.1.6.tar.gz

#Install pg module which cannot be installed via npm due to lack of g++
RUN wget -q -P /opt/webservice/node_modules http://areopagus/binaries/npm-pg-4.4.3.tar.gz && cd /opt/webservice/node_modules && tar zxf npm-pg-4.4.3.tar.gz && rm -rf npm-pg-4.4.3.tar.gz

#Install sleep module 
RUN wget -q -P /opt/webservice/node_modules http://areopagus/binaries/npm-sleep-3.0.0.tar.gz && cd /opt/webservice/node_modules && tar zxf npm-sleep-3.0.0.tar.gz && rm -rf npm-sleep-3.0.0.tar.gz

# Add local files
ADD fs /

# Move CodeController specific nodejs files to a temp location
WORKDIR /opt
RUN mv main main_tmp; mv modules modules_tmp

# Link the webservice NPM modules and skeleton
RUN ln -s /opt/webservice/ code_controller 

# Add CodeController specific nodejs files
RUN cp main_tmp/*.js code_controller/routes; mv -f code_controller/routes/app.js code_controller/. ; rm -rf main_tmp; mkdir -p code_controller/modules 
RUN cp modules_tmp/*.js code_controller/modules; rm -rf modules_tmp 

# Add start scripts run permission & Create the folder for storing release files & generated compose and playbook files
RUN chmod +x /start_code_controller.sh; chmod +x /create_cdc_user_and_pw.sh; mkdir -p /opt/code_controller/releases; mkdir -p /opt/code_controller/deploy

# Run start CodeController
CMD /start_code_controller.sh
