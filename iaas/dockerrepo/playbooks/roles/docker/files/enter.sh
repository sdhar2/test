#!/bin/bash  
# Copyright ARRIS INC  Aug - 2014
# This needs is installed on each node

# usage:  ./enter.sh <application name>
# i.e. ./enter.sh pgpool        This command will put you inside pgpool docker container

[ $# -lt 1 ] && {
	echo "Command to enter into docker container"
        echo "Usage: $0 <application name>"
        exit 1; }

echo "Looking for docker image name containing $1"
running=`sudo docker ps |grep $1| wc -l`
if [ "$running" -eq "0" ] 
then
	echo "$1 string cannot be found in docker ps. Exiting..."
	exit
fi
if [ "$running" -gt "1" ] 
then
	echo "$1 string is found in more than one docker image, please try a unique string. Exiting..."
	exit
fi

id=`sudo docker ps |grep $1 | cut -d " " -f1`
PID=$(sudo docker inspect --format {{.State.Pid}} $id)
echo "Entering docker image for name containing $1"
echo "Use exit command to return back to VM"
echo " "
sudo /usr/local/bin/nsenter  --target $PID --mount --uts --ipc --net --pid
