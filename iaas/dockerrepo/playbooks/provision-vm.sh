#!/bin/sh
ansible-playbook -i inventory  -k -v provision-vm.yml
