#!/bin/sh
ansible-playbook -i inventory.dns  $1 -k -v -e "repo_ip=dockerrepo path_to_files=service-scripts/playbooks/roles/ansible/files"

