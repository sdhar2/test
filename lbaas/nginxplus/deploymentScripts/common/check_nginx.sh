#!/bin/bash
####################################################################################
#Copyright 2014 ARRIS Enterprises, Inc. All rights reserved.
#This program is confidential and proprietary to ARRIS Enterprises, Inc. (ARRIS),
#and may not be copied, reproduced, modified, disclosed to others, published or used,
#in whole or in part, without the express prior written permission of ARRIS.
####################################################################################

result=`ps -ef | grep -v grep | grep nginx: | wc -l`

if [ "$result" -gt "0" ] ; then
	exit 0
else 
	exit 1
fi


