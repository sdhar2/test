#!/bin/sh
#
#   Install the docker repo env to the local machine
#
CurrDir=$PWD
cd iaas/*/dockerrepo/playbooks

#
# Initialize SSH key env
#
echo ""
echo "Inialize SSH environment"
echo ""
ansible-playbook -i inventory init-dockerrepo.yml -k -v -e "repo_ip=dockerrepo path_to_files=service-scripts/playbooks/roles/ansible/files"

echo ""
echo ""
echo " ============ "
echo ""
echo ""
#
# Initialize the Docker Repo now
#
echo ""
echo "Install and initialize the ACP Docker Repository on the local machine"
echo ""
ansible-playbook -i inventory dockerrepo.yml -k -v --extra-vars "host=dockerrepo" -e "repo_ip=dockerrepo path_to_files=service-scripts/playbooks/roles/ansible/files"

#
# Now copy these files to where they belong on the production docker repo
#
echo ""
echo "Copy service files to production location"
echo ""
cd ..
BKUP=0
if [[ -e /home/docker/cloud-service-scripts/playbooks/inventory ]]; then
    sudo mv /home/docker/cloud-service-scripts/playbooks/inventory /home/docker/cloud-service-scripts/playbooks/inventory-bkup
    BKUP=1
fi
sudo cp -rp playbooks /home/docker/cloud-service-scripts
cd $CurrDir
sudo cp -rp iaas /home/docker/cloud-service-scripts
sudo chown -R root:root /home/docker/cloud-service-scripts/*
if [[ "$BKUP" == "1" ]]; then
    echo ""
    echo "*************** NOTE ***************"
    echo ""
    echo " ====> New inventory file installed to /home/docker/cloud-service-scripts/playbooks/inventory and the"
    echo "          original inventory file renamed to /home/docker/cloud-service-scripts/playbooks/inventory-bkup"
    echo ""
    echo "       You will need to compare the new inventory file to the backup and copy any modifications from"
    echo "          your backup inventory file to ensure proper operation of your updated installation"
    echo ""
fi


