#!/bin/bash
#
# Script to setup HTTP and docker file system permissions
#
setsebool -P docker_connect_any=1
setsebool -P virt_use_nfs on
setsebool -P virt_sandbox_use_nfs on
setsebool -P httpd_can_network_connect 1
setsebool -P httpd_enable_homedirs=1

mkdir -p /home/docker/cloud-service-scripts
chcon -Rt svirt_sandbox_file_t /home/docker
chcon -R --reference=/var/www /home/docker/cloud-service-scripts
chcon -R unconfined_u:object_r:httpd_user_content_t:s0 /home/docker/cloud-service-scripts/

iptables -I INPUT -p udp --dport 123 -j ACCEPT
iptables -I INPUT -p tcp --dport 80 -j ACCEPT
iptables -I INPUT -p tcp --dport 5000 -j ACCEPT
iptables -I INPUT -p tcp --dport 443 -j ACCEPT
iptables -I INPUT -p tcp --dport 4243 -j ACCEPT
