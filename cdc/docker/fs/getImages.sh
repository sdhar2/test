#!/bin/bash
sudo docker images | awk '{if (NR>1)print $1":"$2}'| grep -v "`sudo docker ps | awk '{if (NR>1) print $2}'`"
